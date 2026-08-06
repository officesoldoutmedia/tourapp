# Travel parties + costuri calculate — Implementation Plan (SP3a)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Travel parties ca entitate (template pe artist → snapshot pe tur, cu diurnă), rate €/km pe artist, și panoul „Calculat" pe pagina de costuri care generează linii de diurnă/transport cu un click (upsert pe `generated_key`).

**Architecture:** Spec: `docs/superpowers/specs/2026-08-06-travel-parties-costs-design.md`. Două tabele noi (`artist_parties` template, `tour_parties` snapshot — fără FK între ele), `tour_personnel.party_id`, backfill din textele existente, `show_costs.generated_key` pentru upsert. RLS pe mecanismele existente (`can_see_subject('artist')` / `can_access_tour`). Panoul Calculat = secțiune server-side pe pagina de costuri existentă, cu acțiuni inline (idiomul paginii).

**Tech Stack:** Next.js App Router, Supabase (RLS), next-intl, vitest, `scripts/test-rls.sh`.

## Global Constraints

- **Next.js cu breaking changes** — `node_modules/next/dist/docs/`; `params` e Promise.
- **i18n:** chei noi în AMBELE `messages/ro.json` + `messages/en.json`; `node scripts/check-i18n.mjs`.
- **RLS:** teste în `supabase/tests/`; ordinea = ALFABETICĂ (`faza1b_` sortează între `faza1a_` și `faza2_` — verifică cu `ls` înainte); testele noi NU poluează fazele următoare (cleanup la final, hard-delete pe rândurile proprii fără copii).
- **Convenții schema:** uuid PK, timestamps + `deleted_at`, trigger `public.set_updated_at()`, comentarii SQL în română, `organization_id` denormalizat pe tabelele noi (pattern `attachments`).
- **Permisiuni:** administrare parties + rate = `can_edit_tour_content` (manager+ pro); panoul Calculat = `edit_accounting` (gate-ul existent al paginii de costuri).
- **Snapshot, nu referință:** `tour_parties` NU are FK către `artist_parties`; copierea se face doar la crearea turului / prima creare a bucket-ului.
- **Deploy:** migrarea `00029` aditivă, fără fereastră de incompatibilitate.
- **Commit-uri:** per pas, `feat:`/`test:`/`fix:` + `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.

---

### Task 1: Migrarea 00029 + test RLS faza1b

**Files:**
- Create: `supabase/migrations/00029_travel_parties.sql`
- Create: `supabase/tests/faza1b_parties_rls.test.sql`

**Interfaces:**
- Produces: tabelele `artist_parties` / `tour_parties` (coloane mai jos), `tour_personnel.party_id`, `artists.ground_rate_per_km`/`ground_rate_currency`, `show_costs.generated_key` + index unic parțial `(event_id, generated_key)`. Task 3-6 consumă exact aceste nume.

- [ ] **Step 1: Scrie testul (pică fără migrare)**

Creează `supabase/tests/faza1b_parties_rls.test.sql`:

```sql
-- ═══ Faza 1b — travel parties (SP3a): template pe artist + snapshot pe tur ═══
-- Rulează DUPĂ faza1a (alfabetic: faza1 < faza1a < faza1b < faza2).
-- Refolosește org/userii din faza0 și artistul 'speak' + turul din faza1.
-- Cleanup la final: hard-delete pe rândurile create aici (fără copii).
\set ON_ERROR_STOP on

select id as org_id from public.organizations limit 1 \gset

select set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-00000000000a"}', false);
set role authenticated;

select id as artist_id from public.artists where slug = 'speak' \gset
select id as tour_id from public.tours
  where deleted_at is null and bucket_year is null limit 1 \gset

-- ── Admin creează party de template + party de tur ──
insert into public.artist_parties (organization_id, artist_id, name, per_diem_rate, per_diem_currency)
values (:'org_id', :'artist_id', 'CREW_TEST', 45, 'EUR')
returning id as ap_id \gset

insert into public.tour_parties (organization_id, tour_id, name, per_diem_rate, per_diem_currency)
values (:'org_id', :'tour_id', 'CREW_TEST', 45, 'EUR')
returning id as tp_id \gset
\echo 'PASS: admin creeaza artist_party si tour_party'

-- ── party_id pe personnel ──
update public.tour_personnel set party_id = :'tp_id'
where tour_id = :'tour_id';
\echo 'PASS: personnel primeste party_id'

-- ── Crew (mobile_access) vede ambele, nu poate scrie ──
select set_config('request.jwt.claims', '{"sub":"c0000000-0000-0000-0000-00000000000c"}', false);
do $$ begin
  if not exists (select 1 from public.artist_parties where name = 'CREW_TEST')
     or not exists (select 1 from public.tour_parties where name = 'CREW_TEST') then
    raise exception 'FAIL: crew nu vede parties (default deschis)';
  end if;
end $$;
do $$ declare oid uuid; aid uuid; begin
  select organization_id, artist_id into oid, aid from public.artist_parties limit 1;
  begin
    insert into public.artist_parties (organization_id, artist_id, name)
    values (oid, aid, 'HACK');
    raise exception 'FAIL: crew a creat artist_party';
  exception when others then
    if sqlerrm like 'FAIL%' then raise; end if;
  end;
  update public.tour_parties set name = 'HACKED';
  if exists (select 1 from public.tour_parties where name = 'HACKED') then
    raise exception 'FAIL: crew a editat tour_party';
  end if;
end $$;
\echo 'PASS: crew nu poate scrie parties'

-- ── Restricția pe artist cascadează peste ambele tabele ──
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-00000000000a"}', false);
insert into public.visibility_rules
  (organization_id, subject_type, subject_id, target_type, target_id, created_by)
values
  (:'org_id', 'artist', :'artist_id', 'user',
   'a0000000-0000-0000-0000-00000000000a', 'a0000000-0000-0000-0000-00000000000a');

select set_config('request.jwt.claims', '{"sub":"c0000000-0000-0000-0000-00000000000c"}', false);
do $$ begin
  if exists (select 1 from public.artist_parties)
     or exists (select 1 from public.tour_parties) then
    raise exception 'FAIL: cascada artist -> parties nu functioneaza';
  end if;
end $$;
\echo 'PASS: restrictia pe artist ascunde artist_parties si tour_parties'

-- ── Cleanup ──
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-00000000000a"}', false);
delete from public.visibility_rules
  where subject_type = 'artist' and subject_id = :'artist_id';
update public.tour_personnel set party_id = null where party_id = :'tp_id';
delete from public.tour_parties where id = :'tp_id';
delete from public.artist_parties where id = :'ap_id';

reset role;
```

- [ ] **Step 2: Rulează — pică**

Run: `bash scripts/test-rls.sh`
Expected: FAIL la faza1b cu `relation "public.artist_parties" does not exist`.

- [ ] **Step 3: Scrie migrarea**

Creează `supabase/migrations/00029_travel_parties.sql`:

```sql
-- ═══════════════════════════════════════════════════════════════════
-- SP3a — travel parties ca entitate + rate de cost. Spec:
-- docs/superpowers/specs/2026-08-06-travel-parties-costs-design.md
-- artist_parties = template pe artist; tour_parties = SNAPSHOT per tur
-- (fără FK între ele — modificarea template-ului nu se propagă).
-- ═══════════════════════════════════════════════════════════════════

-- ── artist_parties (template) ───────────────────────────────────────
create table public.artist_parties (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  deleted_at timestamptz,
  organization_id uuid not null references public.organizations on delete cascade,
  artist_id uuid not null references public.artists on delete cascade,
  name text not null,
  per_diem_rate numeric,            -- per persoană per zi; null/0 = fără diurnă
  per_diem_currency text,
  sort_order integer not null default 0,
  created_by uuid references auth.users
);
create index artist_parties_artist_idx on public.artist_parties (artist_id);
create trigger set_updated_at before update on public.artist_parties
  for each row execute function public.set_updated_at();

-- ── tour_parties (snapshot per tur) ─────────────────────────────────
create table public.tour_parties (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  deleted_at timestamptz,
  organization_id uuid not null references public.organizations on delete cascade,
  tour_id uuid not null references public.tours on delete cascade,
  name text not null,
  per_diem_rate numeric,
  per_diem_currency text,
  sort_order integer not null default 0,
  created_by uuid references auth.users
);
create index tour_parties_tour_idx on public.tour_parties (tour_id);
create trigger set_updated_at before update on public.tour_parties
  for each row execute function public.set_updated_at();

-- ── legături + rate ─────────────────────────────────────────────────
alter table public.tour_personnel
  add column party_id uuid references public.tour_parties on delete set null;
create index tour_personnel_party_idx on public.tour_personnel (party_id);

alter table public.artists
  add column ground_rate_per_km numeric,
  add column ground_rate_currency text;

-- Marker stabil pentru liniile de cost generate (upsert, nu duplicare).
alter table public.show_costs add column generated_key text;
create unique index show_costs_generated_uq
  on public.show_costs (event_id, generated_key)
  where generated_key is not null and deleted_at is null;

-- ── Backfill: textele de party existente devin entități per tur ────
insert into public.tour_parties (organization_id, tour_id, name)
select distinct t.organization_id, p.tour_id, p.party
from public.tour_personnel p
join public.tours t on t.id = p.tour_id
where p.party is not null and btrim(p.party) <> '' and p.deleted_at is null;

update public.tour_personnel p
set party_id = tp.id
from public.tour_parties tp
where tp.tour_id = p.tour_id and tp.name = p.party
  and p.party_id is null;

-- ── RLS ─────────────────────────────────────────────────────────────
alter table public.artist_parties enable row level security;

create policy artist_parties_select on public.artist_parties
  for select to authenticated
  using (
    (deleted_at is null or private.can_edit_tour_content(organization_id))
    and private.is_org_member(organization_id)
    and private.can_see_subject(organization_id, 'artist', artist_id)
  );
create policy artist_parties_insert on public.artist_parties
  for insert to authenticated
  with check (private.can_edit_tour_content(organization_id));
create policy artist_parties_update on public.artist_parties
  for update to authenticated
  using (private.can_edit_tour_content(organization_id))
  with check (private.can_edit_tour_content(organization_id));
create policy artist_parties_delete on public.artist_parties
  for delete to authenticated
  using (private.can_edit_tour_content(organization_id));

alter table public.tour_parties enable row level security;

create policy tour_parties_select on public.tour_parties
  for select to authenticated
  using (
    (deleted_at is null or private.can_edit_tour_content(organization_id))
    and private.can_access_tour(tour_id)
  );
create policy tour_parties_insert on public.tour_parties
  for insert to authenticated
  with check (private.can_edit_tour_content(organization_id));
create policy tour_parties_update on public.tour_parties
  for update to authenticated
  using (private.can_edit_tour_content(organization_id))
  with check (private.can_edit_tour_content(organization_id));
create policy tour_parties_delete on public.tour_parties
  for delete to authenticated
  using (private.can_edit_tour_content(organization_id));
```

- [ ] **Step 4: Rulează — trece tot**

Run: `bash scripts/test-rls.sh`
Expected: toate PASS-urile (faza0…faza9, incl. faza1a și faza1b), exit 0. Dacă alt fișier de test pică pe coloana nouă, citește-i eroarea — nu modifica alte teste fără să înțelegi de ce.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/00029_travel_parties.sql supabase/tests/faza1b_parties_rls.test.sql
git commit -m "feat: travel parties — template artist + snapshot tur, rate, generated_key

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: lib/costCalc.ts (TDD)

**Files:**
- Create: `lib/costCalc.ts` + `lib/costCalc.test.ts`

**Interfaces:**
- Produces (consumate de Task 6 — semnături exacte):
  - `perDiemLine(party: { id: string; name: string; per_diem_rate: number | null; per_diem_currency: string | null }, headcount: number, days: number): { key: string; label: string; amount: number; currency: string } | null`
  - `groundTransportLine(input: { city: string | null; km: number; rate: number; currency: string }): { key: string; label: string; amount: number; currency: string }`
  - `PER_DIEM_KEY_PREFIX = "per_diem:"`, `GROUND_KEY = "ground_transport"`

- [ ] **Step 1: Scrie testele**

Creează `lib/costCalc.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { groundTransportLine, perDiemLine } from "./costCalc";

describe("perDiemLine", () => {
  const party = { id: "p1", name: "Crew", per_diem_rate: 45, per_diem_currency: "EUR" };
  it("headcount × rate × zile, cu eticheta descriptivă și cheia stabilă", () => {
    expect(perDiemLine(party, 6, 2)).toEqual({
      key: "per_diem:p1",
      label: "Diurnă Crew — 6 × 45 EUR × 2 zile",
      amount: 540,
      currency: "EUR",
    });
  });
  it("null pentru party fără rată, headcount 0 sau zile 0", () => {
    expect(perDiemLine({ ...party, per_diem_rate: null }, 6, 1)).toBeNull();
    expect(perDiemLine({ ...party, per_diem_rate: 0 }, 6, 1)).toBeNull();
    expect(perDiemLine(party, 0, 1)).toBeNull();
    expect(perDiemLine(party, 6, 0)).toBeNull();
  });
  it("valuta implicită EUR când lipsește", () => {
    expect(perDiemLine({ ...party, per_diem_currency: null }, 1, 1)?.currency).toBe("EUR");
  });
});

describe("groundTransportLine", () => {
  it("km × rate, etichetă cu orașul și km-ul, cheie fixă", () => {
    expect(
      groundTransportLine({ city: "Cluj-Napoca", km: 460, rate: 1.2, currency: "EUR" }),
    ).toEqual({
      key: "ground_transport",
      label: "Transport Cluj-Napoca — 460 km",
      amount: 552,
      currency: "EUR",
    });
  });
  it("fără oraș, eticheta rămâne coerentă și suma se rotunjește la 2 zecimale", () => {
    const line = groundTransportLine({ city: null, km: 333, rate: 0.333, currency: "RON" });
    expect(line.label).toBe("Transport — 333 km");
    expect(line.amount).toBe(110.89);
  });
});
```

- [ ] **Step 2: Rulează — pică**

Run: `pnpm vitest run lib/costCalc.test.ts`
Expected: FAIL — modulul nu există.

- [ ] **Step 3: Implementează**

Creează `lib/costCalc.ts`:

```typescript
/** Calculele pentru panoul „Calculat" (SP3a). Pur — fără fetch.
 *  Etichetele sunt descriptive (apar ca label pe linia de cost), cheile
 *  sunt markerul stabil de upsert (show_costs.generated_key). */

export const PER_DIEM_KEY_PREFIX = "per_diem:";
export const GROUND_KEY = "ground_transport";

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function perDiemLine(
  party: {
    id: string;
    name: string;
    per_diem_rate: number | null;
    per_diem_currency: string | null;
  },
  headcount: number,
  days: number,
): { key: string; label: string; amount: number; currency: string } | null {
  const rate = Number(party.per_diem_rate ?? 0);
  if (!rate || headcount <= 0 || days <= 0) return null;
  const currency = party.per_diem_currency || "EUR";
  return {
    key: `${PER_DIEM_KEY_PREFIX}${party.id}`,
    label: `Diurnă ${party.name} — ${headcount} × ${rate} ${currency} × ${days} zile`,
    amount: round2(headcount * rate * days),
    currency,
  };
}

export function groundTransportLine(input: {
  city: string | null;
  km: number;
  rate: number;
  currency: string;
}): { key: string; label: string; amount: number; currency: string } {
  const where = input.city ? ` ${input.city}` : "";
  return {
    key: GROUND_KEY,
    label: `Transport${where} — ${input.km} km`,
    amount: round2(input.km * input.rate),
    currency: input.currency,
  };
}
```

- [ ] **Step 4: Rulează — trece; commit**

Run: `pnpm vitest run lib/costCalc.test.ts` → PASS; apoi `pnpm vitest run` → tot verde.

```bash
git add lib/costCalc.ts lib/costCalc.test.ts
git commit -m "feat: costCalc — diurnă și transport terestru (linii generate)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: Profil artist — rate €/km + secțiunea Travel parties

**Files:**
- Modify: `app/o/[orgSlug]/a/[artistSlug]/profile/page.tsx`
- Modify: `app/o/[orgSlug]/a/[artistSlug]/profile/actions.ts`
- Create: `app/o/[orgSlug]/a/[artistSlug]/profile/parties-client.tsx`
- Modify: `messages/ro.json`, `messages/en.json` (chei noi în `artist`)

**Interfaces:**
- Consumes: `artist_parties`, `artists.ground_rate_per_km/ground_rate_currency` (Task 1); `requireManage` existent în `profile/actions.ts`.
- Produces: acțiunile `saveArtistParty(orgSlug, artistSlug, artistId, input: { id?: string; name: string; perDiemRate: number | null; perDiemCurrency: string })`, `deleteArtistParty(orgSlug, artistSlug, partyId)`, `moveArtistParty(orgSlug, artistSlug, partyId, direction: "up" | "down")` — toate `Promise<{ error?: string }>`. `saveArtistProfile` acceptă și câmpurile `ground_rate_per_km` / `ground_rate_currency` din FormData.

- [ ] **Step 1: Extinde saveArtistProfile**

În `profile/actions.ts`, în update-ul din `saveArtistProfile`, adaugă:

```typescript
      ground_rate_per_km: (() => {
        const raw = String(formData.get("ground_rate_per_km") ?? "").trim();
        const n = Number(raw);
        return raw && Number.isFinite(n) && n > 0 ? n : null;
      })(),
      ground_rate_currency:
        String(formData.get("ground_rate_currency") ?? "").trim() || null,
```

- [ ] **Step 2: Acțiunile de parties**

Adaugă în `profile/actions.ts` (folosind `requireManage` existent):

```typescript
export async function saveArtistParty(
  orgSlug: string,
  artistSlug: string,
  artistId: string,
  input: { id?: string; name: string; perDiemRate: number | null; perDiemCurrency: string },
): Promise<{ error?: string }> {
  const { supabase, org, user } = await requireManage(orgSlug);
  const name = input.name.trim();
  if (!name) return { error: "invalid" };
  const rate =
    input.perDiemRate != null && Number.isFinite(input.perDiemRate) && input.perDiemRate > 0
      ? input.perDiemRate
      : null;
  const payload = {
    name,
    per_diem_rate: rate,
    per_diem_currency: rate ? input.perDiemCurrency || "EUR" : null,
  };
  const { error } = input.id
    ? await supabase.from("artist_parties").update(payload).eq("id", input.id)
    : await supabase.from("artist_parties").insert({
        ...payload,
        organization_id: org.id,
        artist_id: artistId,
        created_by: user.id,
      });
  if (error) return { error: error.message };
  revalidatePath(`/o/${orgSlug}/a/${artistSlug}/profile`);
  return {};
}

export async function deleteArtistParty(
  orgSlug: string,
  artistSlug: string,
  partyId: string,
): Promise<{ error?: string }> {
  const { supabase } = await requireManage(orgSlug);
  const { error } = await supabase
    .from("artist_parties")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", partyId);
  if (error) return { error: error.message };
  revalidatePath(`/o/${orgSlug}/a/${artistSlug}/profile`);
  return {};
}

export async function moveArtistParty(
  orgSlug: string,
  artistSlug: string,
  partyId: string,
  direction: "up" | "down",
): Promise<{ error?: string }> {
  const { supabase } = await requireManage(orgSlug);
  const { data: row } = await supabase
    .from("artist_parties")
    .select("id, artist_id, sort_order")
    .eq("id", partyId)
    .maybeSingle();
  if (!row) return { error: "not_found" };
  const { data: siblings } = await supabase
    .from("artist_parties")
    .select("id, sort_order")
    .eq("artist_id", row.artist_id)
    .is("deleted_at", null)
    .order("sort_order")
    .order("created_at");
  const list = siblings ?? [];
  const idx = list.findIndex((s) => s.id === partyId);
  const swap = direction === "up" ? idx - 1 : idx + 1;
  if (idx < 0 || swap < 0 || swap >= list.length) return {};
  await supabase.from("artist_parties").update({ sort_order: swap }).eq("id", list[idx].id);
  await supabase.from("artist_parties").update({ sort_order: idx }).eq("id", list[swap].id);
  revalidatePath(`/o/${orgSlug}/a/${artistSlug}/profile`);
  return {};
}
```

Notă: înainte de scriere, normalizează `sort_order` în listă (poziția din listă = sort_order) dacă valorile sunt egale — cea mai simplă variantă: după orice insert, setează `sort_order = list.length` (numărul de siblings existenți) în payload-ul insertului.

- [ ] **Step 3: UI**

- `profile/page.tsx`: încarcă și `ground_rate_per_km, ground_rate_currency` în select-ul de artist + `artist_parties` (nesterse, `order("sort_order")`); pasează form-ului și noii componente.
- În formularul de profil (form-ul existent): două câmpuri noi sub Home base — input numeric `ground_rate_per_km` (step 0.01) + select `ground_rate_currency` (EUR/RON/USD/GBP), etichete `artist.groundRateLabel` / `artist.groundRateHint`.
- `parties-client.tsx` (client, pattern `artists/new/form.tsx`): listă de parties (nume, diurnă + valută, săgeți sus/jos, ștergere cu `window.confirm`) + rând de adăugare (nume + rată + valută). Apeluri către acțiunile din Step 2 cu `useTransition`; erori → toast-ul generic existent.
- Chei i18n noi în `artist` (ambele limbi): `groundRateLabel` („Rată transport (per km)"/"Ground rate (per km)"), `groundRateHint` („Folosită la calculul costului de transport din home base."/"Used to compute ground transport cost from home base."), `partiesTitle` („Travel parties"/"Travel parties"), `partiesHint` („Se copiază în fiecare tur/show nou; diurnă per persoană per zi."/"Copied into every new tour/show; per diem is per person per day."), `partyName` („Nume party"/"Party name"), `perDiem` („Diurnă"/"Per diem"), `addParty` („Adaugă party"/"Add party"), `deleteParty` („Șterge"/"Delete"), `noParties` („Niciun party încă."/"No parties yet.").

- [ ] **Step 4: Verifică + commit**

Run: `node scripts/check-i18n.mjs && pnpm exec tsc --noEmit && pnpm vitest run`
Expected: exit 0.

```bash
git add "app/o/[orgSlug]/a/[artistSlug]/profile" messages/ro.json messages/en.json
git commit -m "feat: profil artist — rată €/km + travel parties (template)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: Snapshot-ul la creare (tur + one-off)

**Files:**
- Create: `lib/partySnapshot.ts`
- Modify: `app/o/[orgSlug]/tours/new/actions.ts`
- Modify: `app/o/[orgSlug]/events/new/actions.ts`

**Interfaces:**
- Consumes: tabelele din Task 1.
- Produces: `copyArtistPartiesToTour(supabase, orgId: string, artistId: string, tourId: string, userId: string): Promise<void>` din `lib/partySnapshot.ts` — best-effort (erorile nu blochează crearea turului; log prin `console.error`).

- [ ] **Step 1: Helperul de copiere**

Creează `lib/partySnapshot.ts`:

```typescript
/** Snapshot-ul travel parties la crearea turului (SP3a, spec §2).
 *  Best-effort: un eșec aici nu blochează crearea turului. */

type SupabaseLike = {
  from: (table: string) => any;
};

export async function copyArtistPartiesToTour(
  supabase: SupabaseLike,
  orgId: string,
  artistId: string,
  tourId: string,
  userId: string,
): Promise<void> {
  const { data: template, error } = await supabase
    .from("artist_parties")
    .select("name, per_diem_rate, per_diem_currency, sort_order")
    .eq("artist_id", artistId)
    .is("deleted_at", null)
    .order("sort_order")
    .order("created_at");
  if (error || !template || template.length === 0) return;
  const { error: insertError } = await supabase.from("tour_parties").insert(
    template.map((p: {
      name: string;
      per_diem_rate: number | null;
      per_diem_currency: string | null;
      sort_order: number;
    }) => ({
      organization_id: orgId,
      tour_id: tourId,
      name: p.name,
      per_diem_rate: p.per_diem_rate,
      per_diem_currency: p.per_diem_currency,
      sort_order: p.sort_order,
      created_by: userId,
    })),
  );
  if (insertError) console.error("copyArtistPartiesToTour:", insertError.message);
}
```

(`SupabaseLike` cu `any` evită dependența de tipuri generate — consecvent cu restul lib-ului; dacă tsc permite tipul real din `requireOrg` fără fricțiune, folosește-l.)

- [ ] **Step 2: Hook în createTour**

În `app/o/[orgSlug]/tours/new/actions.ts`, imediat după insertul de tur reușit (există `tour.id`, `payload.artistId`, `org.id`, `user.id`):

```typescript
  await copyArtistPartiesToTour(supabase, org.id, payload.artistId, tour.id, user.id);
```

- [ ] **Step 3: Hook în createOneOffEvent**

În `app/o/[orgSlug]/events/new/actions.ts`: DOAR pe ramura în care bucket-ul tocmai a fost creat de acest apel (insertul a reușit — `ins.error` e null/undefined), după re-select-ul bucket-ului:

```typescript
    if (!ins.error) {
      await copyArtistPartiesToTour(supabase, org.id, artist.id, bucket.id, user.id);
    }
```

Bucket existent sau restaurat din soft-delete → NU se copiază (spec §2: snapshot-ul inițial rămâne).

- [ ] **Step 4: Verifică + commit**

Run: `pnpm exec tsc --noEmit && pnpm vitest run`
Expected: exit 0.

```bash
git add lib/partySnapshot.ts "app/o/[orgSlug]/tours/new/actions.ts" "app/o/[orgSlug]/events/new/actions.ts"
git commit -m "feat: snapshot travel parties la crearea turului și a bucket-ului one-off

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: Party ca select (personnel + profil persoană)

**Files:**
- Modify: `app/o/[orgSlug]/t/[tourId]/personnel/page.tsx` (+ componenta client a paginii — identific-o citind pagina; probabil `personnel-client.tsx`)
- Modify: `app/o/[orgSlug]/t/[tourId]/personnel/[personnelId]/page.tsx` + `profile-actions.ts` (+ componenta de identitate)
- Create: `app/o/[orgSlug]/t/[tourId]/personnel/parties-actions.ts`
- Modify: `messages/ro.json`, `messages/en.json` (chei în `personnel`)

**Interfaces:**
- Consumes: `tour_parties`, `tour_personnel.party_id` (Task 1).
- Produces: `saveTourParty(orgSlug, tourId, input: { id?: string; name: string; perDiemRate: number | null; perDiemCurrency: string })`, `deleteTourParty(orgSlug, tourId, partyId)`, `setPersonnelParty(orgSlug, tourId, personnelId, partyId: string | null)` — toate `Promise<{ error?: string }>` în `parties-actions.ts`.

- [ ] **Step 1: Acțiunile de tur**

Creează `parties-actions.ts`:

```typescript
"use server";

import { revalidatePath } from "next/cache";
import { requireOrg } from "@/lib/org";
import { can } from "@/lib/permissions";

async function requireEditor(orgSlug: string) {
  const ctx = await requireOrg(orgSlug);
  if (!can({ tier: ctx.tier, permission: ctx.permission }, "edit_tour_content")) {
    throw new Error("forbidden");
  }
  return ctx;
}

export async function saveTourParty(
  orgSlug: string,
  tourId: string,
  input: { id?: string; name: string; perDiemRate: number | null; perDiemCurrency: string },
): Promise<{ error?: string }> {
  const { supabase, org, user } = await requireEditor(orgSlug);
  const name = input.name.trim();
  if (!name) return { error: "invalid" };
  const rate =
    input.perDiemRate != null && Number.isFinite(input.perDiemRate) && input.perDiemRate > 0
      ? input.perDiemRate
      : null;
  const payload = {
    name,
    per_diem_rate: rate,
    per_diem_currency: rate ? input.perDiemCurrency || "EUR" : null,
  };
  const { error } = input.id
    ? await supabase.from("tour_parties").update(payload).eq("id", input.id)
    : await supabase.from("tour_parties").insert({
        ...payload,
        organization_id: org.id,
        tour_id: tourId,
        created_by: user.id,
      });
  if (error) return { error: error.message };
  revalidatePath(`/o/${orgSlug}/t/${tourId}/personnel`);
  return {};
}

export async function deleteTourParty(
  orgSlug: string,
  tourId: string,
  partyId: string,
): Promise<{ error?: string }> {
  const { supabase } = await requireEditor(orgSlug);
  const { error } = await supabase
    .from("tour_parties")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", partyId);
  if (error) return { error: error.message };
  revalidatePath(`/o/${orgSlug}/t/${tourId}/personnel`);
  return {};
}

export async function setPersonnelParty(
  orgSlug: string,
  tourId: string,
  personnelId: string,
  partyId: string | null,
): Promise<{ error?: string }> {
  const { supabase } = await requireEditor(orgSlug);
  const { error } = await supabase
    .from("tour_personnel")
    .update({ party_id: partyId })
    .eq("id", personnelId);
  if (error) return { error: error.message };
  revalidatePath(`/o/${orgSlug}/t/${tourId}/personnel`);
  return {};
}
```

(`revalidatePath` și pe pagina de profil de persoană când e apelat de acolo — acceptă un al cincilea parametru opțional `fromProfile?: boolean` sau revalidează ambele căi necondiționat — alege varianta mai simplă și documenteaz-o.)

- [ ] **Step 2: Personnel page**

În pagina de personnel: încarcă `tour_parties` (nesterse, ordonate) și `party_id` în select-ul de personnel; înlocuiește afișarea capsulei de party (textul liber) cu numele party-ului din FK (`partyOfId.get(person.party_id)`, fallback pe textul vechi dacă `party_id` e null și textul există — datele nemigrate manual rămân lizibile). Adaugă în header o zonă „Parties" (client component mică, colocată — pattern `parties-client.tsx` din Task 3, dar pe acțiunile de tur): listă + adăugare + editare diurnă + ștergere. Selectul de party per persoană: acolo unde pagina permite editare inline (dacă nu permite, doar afișare aici — editarea rămâne pe profil).

- [ ] **Step 3: Profilul de persoană**

În formularul de identitate (unde există inputul text `party` — `saveIdentity` în `profile-actions.ts`): înlocuiește inputul cu select din `tour_parties` (+ opțiunea „—" = null), trimite `party_id` prin `setPersonnelParty` sau direct în `saveIdentity` (extinde-l cu `party_id: String(formData.get("party_id") ?? "") || null` și NU mai scrie coloana text `party`). Pagina încarcă parties pentru select.

- [ ] **Step 4: i18n + verifică + commit**

Chei noi în `personnel` (ambele limbi): `partiesTitle` („Parties"/"Parties"), `partyLabel` („Party"/"Party"), `noParty` („—"/"—"), `perDiem` („Diurnă"/"Per diem"), `addParty` („Adaugă party"/"Add party"). Run: `node scripts/check-i18n.mjs && pnpm exec tsc --noEmit && pnpm vitest run` → exit 0.

```bash
git add "app/o/[orgSlug]/t/[tourId]/personnel" messages/ro.json messages/en.json
git commit -m "feat: party ca entitate în personnel — select + administrare per tur

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 6: Panoul „Calculat" pe pagina de costuri

**Files:**
- Modify: `app/o/[orgSlug]/t/[tourId]/d/[date]/e/[eventId]/costs/page.tsx`
- Modify: `messages/ro.json`, `messages/en.json` (chei în `showCosts`)

**Interfaces:**
- Consumes: `perDiemLine`/`groundTransportLine`/`PER_DIEM_KEY_PREFIX`/`GROUND_KEY` (Task 2), `tour_parties` + `party_id` (Task 1), `artists.ground_rate_per_km/currency` + `home_base_lat/lng` (SP1), `computeGroundDistance(origin: string, destination: string): Promise<{distanceKm, durationMin} | null>` din `@/lib/googlePlaces` (accepta stringuri „lat,lng"), `days.lat/lng/city` existente.
- Produces: nimic pentru task-uri ulterioare.

- [ ] **Step 1: Datele panoului**

În `costs/page.tsx` (server component, gate-urile existente rămân — panoul apare doar cu `canEdit` = `edit_accounting`), încarcă în plus:

```typescript
      supabase
        .from("tour_parties")
        .select("id, name, per_diem_rate, per_diem_currency")
        .eq("tour_id", tourId)
        .is("deleted_at", null)
        .order("sort_order"),
      supabase
        .from("tour_personnel")
        .select("id, party_id")
        .eq("tour_id", tourId)
        .is("deleted_at", null),
      supabase
        .from("days")
        .select("id, city, country, lat, lng")
        .eq("tour_id", tourId)
        .eq("date", date)
        .is("deleted_at", null)
        .maybeSingle(),
```

plus artistul turului: `from("tours").select("artist_id, artists(home_base_city, home_base_lat, home_base_lng, ground_rate_per_km, ground_rate_currency)")` (extinde select-ul de tur existent). Headcount per party: numără `tour_personnel` pe `party_id` în memorie.

Distanța sugerată (server-side, best-effort): dacă artistul are `home_base_lat/lng` și ziua are `lat/lng` → `computeGroundDistance(`${hbLat},${hbLng}`, `${dayLat},${dayLng}`)`; dacă ziua nu are coordonate dar are `city` → folosește `${city}, ${country}` ca destinație. Rezultat null → km-ul rămâne gol (introducere manuală). Dus-întors = `Math.round(distanceKm * 2)`.

- [ ] **Step 2: Helperul de upsert**

Funcție locală (modul-level, NU server action) în `costs/page.tsx`, folosită de ambele acțiuni din Step 3:

```typescript
type GeneratedLine = { key: string; label: string; amount: number; currency: string };

async function upsertCostLine(
  supabase: Awaited<ReturnType<typeof requireOrg>>["supabase"],
  eventId: string,
  userId: string,
  line: GeneratedLine,
) {
  const { data: existing } = await supabase
    .from("show_costs")
    .select("id")
    .eq("event_id", eventId)
    .eq("generated_key", line.key)
    .is("deleted_at", null)
    .maybeSingle();
  if (existing) {
    await supabase
      .from("show_costs")
      .update({
        label: line.label,
        amount: line.amount,
        currency: line.currency,
        updated_by: userId,
      })
      .eq("id", existing.id);
  } else {
    await supabase.from("show_costs").insert({
      event_id: eventId,
      kind: "extra",
      label: line.label,
      amount: line.amount,
      currency: line.currency,
      generated_key: line.key,
      updated_by: userId,
    });
  }
}
```

(Indexul unic parțial din Task 1 e backstop-ul race-ului select-then-write. Apelurile din Step 3 folosesc `upsertCostLine(supabase, eventId, user.id, line)` — `eventId` e în scope-ul paginii.)

- [ ] **Step 3: Randarea panoului**

Secțiune „Calculat" deasupra listei de costuri, vizibilă doar cu `canEdit`:

- **Diurnă:** pentru fiecare `tour_party`, afișezi previzualizarea `perDiemLine(party, headcount, 1)` și un `<form>` per party cu input `days` (numeric, default 1) + buton „Adaugă în costuri" / „Actualizează" (după cum există deja o linie cu cheia `per_diem:{party.id}` în `costs` — încarcă `generated_key` în select-ul de costs existent). Suma se recalculează SERVER-SIDE în acțiune (nu vine din client):

```typescript
  async function upsertPerDiem(formData: FormData) {
    "use server";
    const { supabase, permission: p2, tier: t2, user } = await requireOrg(orgSlug);
    if (!can({ tier: t2, permission: p2 }, "edit_accounting")) return;
    const partyId = String(formData.get("partyId") ?? "");
    const days = Number(formData.get("days") ?? 1);
    if (!partyId || !Number.isFinite(days) || days <= 0) return;
    const [{ data: party }, { count }] = await Promise.all([
      supabase
        .from("tour_parties")
        .select("id, name, per_diem_rate, per_diem_currency")
        .eq("id", partyId)
        .is("deleted_at", null)
        .maybeSingle(),
      supabase
        .from("tour_personnel")
        .select("id", { count: "exact", head: true })
        .eq("party_id", partyId)
        .is("deleted_at", null),
    ]);
    if (!party) return;
    const line = perDiemLine(party, count ?? 0, days);
    if (!line) return;
    await upsertCostLine(supabase, eventId, user.id, line);
    revalidatePath(path);
  }
```

  (`upsertCostLine` e helperul din Step 2.) Party fără diurnă → rând estompat cu hint `calcNoPerDiem`.

- **Transport:** un singur card: origine (home base city) → destinație (orașul zilei), input km editabil pre-completat cu dus-întorsul sugerat, rata artistului afișată:

```typescript
  async function upsertGroundTransport(formData: FormData) {
    "use server";
    const { supabase, permission: p2, tier: t2, user } = await requireOrg(orgSlug);
    if (!can({ tier: t2, permission: p2 }, "edit_accounting")) return;
    const km = Number(formData.get("km") ?? 0);
    if (!Number.isFinite(km) || km <= 0) return;
    const { data: t } = await supabase
      .from("tours")
      .select("artists(ground_rate_per_km, ground_rate_currency)")
      .eq("id", tourId)
      .maybeSingle();
    const a = t?.artists as unknown as {
      ground_rate_per_km: number | null;
      ground_rate_currency: string | null;
    } | null;
    const rate = Number(a?.ground_rate_per_km ?? 0);
    if (!rate) return;
    const { data: day } = await supabase
      .from("days")
      .select("city")
      .eq("tour_id", tourId)
      .eq("date", date)
      .is("deleted_at", null)
      .maybeSingle();
    const line = groundTransportLine({
      city: day?.city ?? null,
      km: Math.round(km),
      rate,
      currency: a?.ground_rate_currency || "EUR",
    });
    await upsertCostLine(supabase, eventId, user.id, line);
    revalidatePath(path);
  }
```

  Fără rată sau fără home base → hint cu link la `/o/{orgSlug}/a/{artists.slug}/profile` (extinde select-ul de tur cu `artists(slug)`).
- Liniile generate apar în lista de costuri existentă ca orice linie (editabile/ștergibile prin UI-ul existent) — nimic special de randat acolo.

- [ ] **Step 4: i18n**

Chei noi în `showCosts` (ambele limbi): `calcTitle` („Calculat"/"Calculated"), `calcPerDiem` („Diurnă"/"Per diem"), `calcDays` („Zile"/"Days"), `calcPeople` („pers."/"ppl"), `calcAdd` („Adaugă în costuri"/"Add to costs"), `calcUpdate` („Actualizează"/"Update"), `calcTransport` („Transport terestru"/"Ground transport"), `calcKm` („Km (dus-întors)"/"Km (round trip)"), `calcNoRate` („Setează rata pe profilul artistului."/"Set the rate on the artist profile."), `calcNoPerDiem` („Fără diurnă setată."/"No per diem set."), `calcNoHomeBase` („Setează home base pe profilul artistului."/"Set the home base on the artist profile.").

- [ ] **Step 5: Verifică + commit**

Run: `node scripts/check-i18n.mjs && pnpm exec tsc --noEmit && pnpm vitest run && pnpm build`
Expected: exit 0 peste tot.

```bash
git add "app/o/[orgSlug]/t/[tourId]/d/[date]/e/[eventId]/costs/page.tsx" messages/ro.json messages/en.json
git commit -m "feat: panoul Calculat — diurnă și transport terestru cu un click

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 7: Verificare finală

**Files:** fix-uri punctuale descoperite aici.

- [ ] **Step 1: Suita completă**

```bash
pnpm vitest run
bash scripts/test-rls.sh
node scripts/check-i18n.mjs
pnpm build
```
Expected: toate exit 0.

- [ ] **Step 2: Review final de branch**

`superpowers:requesting-code-review` pe diff-ul complet (main model), cu ledger-ul de minors ca input de triaj.

- [ ] **Step 3: Merge gate + deploy**

Opțiunile de integrare (finishing-a-development-branch). După decizia utilizatorului: migrarea `00029` pe producție + `pnpm run deploy`, apoi smoke prin Chrome per spec §5 (rate + party pe SPEAK → moștenire pe show nou → generare linii → corectare km → P&L → cleanup).
