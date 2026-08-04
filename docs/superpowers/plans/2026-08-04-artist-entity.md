# Entitatea Artist — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Introduce entitatea Artist (roster) deasupra tururilor: tabelă `artists`, `tours.artist_id` cu backfill pe date de producție, acces per artist care cascadează prin RLS-ul existent, pagina de roster, pagina artistului (Date / Profil / Acces) și navigarea aferentă.

**Architecture:** Abordarea A din spec (`docs/superpowers/specs/2026-08-04-artist-entity-design.md`): o singură coloană nouă (`tours.artist_id`); „calendarul artistului" e o interogare peste zilele tururilor lui; punct unic de aplicare RLS în `private.can_access_tour` + politica `tours_select`, de unde restricția cascadează în toată aplicația.

**Tech Stack:** Next.js (App Router, server components + server actions), Supabase (Postgres RLS, Storage bucket `attachments`), next-intl (`messages/ro.json` + `messages/en.json`), Tailwind cu tokens custom (`btn-primary`, `bg-surface`, `border-hairline`…), vitest, teste RLS via `scripts/test-rls.sh`.

## Global Constraints

- **Next.js e o versiune cu breaking changes** — citește ghidul relevant din `node_modules/next/dist/docs/` înainte de a scrie cod de pagini/route-uri (vezi `AGENTS.md`). `params` e `Promise` în pagini/layouts — vezi orice pagină existentă.
- **i18n:** orice string UI nou intră în AMBELE fișiere `messages/ro.json` și `messages/en.json`; paritatea e verificată cu `node scripts/check-i18n.mjs`.
- **RLS:** orice schimbare de politici trebuie acoperită în `supabase/tests/*.test.sql`; rulare: `bash scripts/test-rls.sh` (cere `brew install postgresql@17`; fișierele de test rulează în ordine alfabetică și refolosesc userii din `faza0`: admin `a0…0a` = administrator/pro, crew `c0…0c` = mobile_access/free).
- **Convenții schema:** uuid PK `gen_random_uuid()`, `created_at/updated_at/deleted_at` (soft-delete), trigger `public.set_updated_at()`, comentarii în română.
- **Permisiuni:** scriere conținut = `private.can_edit_tour_content(org)` (manager+ ȘI pro); management = administrator/accounting/manager (`has_min_permission('manager')`).
- **Storage:** un singur bucket `attachments`; căi prefixate cu `${orgId}/…`; URL-uri semnate (`createSignedUrl`).
- **Deploy:** migrarea și codul aplicației se lansează ÎMPREUNĂ la finalul întregului plan (vechiul `createTour` nu setează `artist_id` → ar eșua pe NOT NULL). Nu se face deploy parțial.
- **Commit-uri:** frecvente, per pas de task, mesaje `feat:`/`test:`/`fix:` + `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.

---

### Task 1: Migrări SQL + teste RLS

**Files:**
- Create: `supabase/migrations/00025_artists.sql`
- Create: `supabase/migrations/00026_artist_attachment_enum.sql`
- Create: `supabase/migrations/00027_artist_attachment_visibility.sql`
- Create: `supabase/tests/faza9_artists_rls.test.sql`
- Modify: `supabase/tests/faza1_rls.test.sql` (insertul de tur primește `artist_id`)

**Interfaces:**
- Produces: tabela `public.artists` (coloanele din SQL-ul de mai jos), `tours.artist_id uuid not null`, subiectul `'artist'` în `visibility_rules`, valoarea `'artist'` în enum `attachment_parent`. Toate task-urile următoare consumă exact aceste nume.

- [ ] **Step 1: Scrie testul RLS (întâi — va pica fără migrare)**

Creează `supabase/tests/faza9_artists_rls.test.sql`:

```sql
-- ═══ Faza 9 — RLS pe artists + cascada artist → tur → conținut ═══
-- Rulează DUPĂ faza1 (refolosește org-ul, userii și turul de acolo).
\set ON_ERROR_STOP on

select id as org_id from public.organizations limit 1 \gset

-- ── Admin: artistul creat în faza1 există și e vizibil ──
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-00000000000a"}', false);
set role authenticated;

select id as artist_id from public.artists where slug = 'speak' \gset
do $$ begin
  if (select count(*) from public.artists) < 1 then
    raise exception 'FAIL: adminul nu vede artistul din faza1';
  end if;
end $$;
\echo 'PASS: adminul vede artistul'

-- ── Tur fără artist_id → respins (NOT NULL) ──
do $$ declare oid uuid; begin
  select id into oid from public.organizations limit 1;
  begin
    insert into public.tours (organization_id, name) values (oid, 'Fara artist');
    raise exception 'FAIL: tur creat fara artist_id';
  exception when not_null_violation then null;
  end;
end $$;
\echo 'PASS: tur fara artist_id respins'

-- ── Crew (mobile_access/free) vede artistul fără reguli ──
select set_config('request.jwt.claims', '{"sub":"c0000000-0000-0000-0000-00000000000c"}', false);
do $$ begin
  if (select count(*) from public.artists) <> (
       select count(*) from public.artists a
       where private.can_see_subject(a.organization_id, 'artist', a.id))
     or not exists (select 1 from public.artists) then
    raise exception 'FAIL: crew nu vede artistul fara reguli';
  end if;
end $$;
\echo 'PASS: crew vede artistul (default deschis)'

-- crew NU poate crea/edita artiști
do $$ declare oid uuid; begin
  select organization_id into oid from public.artists limit 1;
  begin
    insert into public.artists (organization_id, name, slug) values (oid, 'Hack', 'hack');
    raise exception 'FAIL: crew a creat artist';
  exception when others then
    if sqlerrm like 'FAIL%' then raise; end if;
  end;
  update public.artists set name = 'HACKED';
  if exists (select 1 from public.artists where name = 'HACKED') then
    raise exception 'FAIL: crew a editat artistul';
  end if;
end $$;
\echo 'PASS: crew nu poate scrie artisti'

-- ── Restricție pe artist: regulă care țintește DOAR adminul ──
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-00000000000a"}', false);
insert into public.visibility_rules
  (organization_id, subject_type, subject_id, target_type, target_id, created_by)
values
  (:'org_id', 'artist', :'artist_id', 'user',
   'a0000000-0000-0000-0000-00000000000a', 'a0000000-0000-0000-0000-00000000000a');

-- attachment pe artist (pentru testul de vizibilitate al fișierelor)
insert into public.attachments
  (organization_id, parent_type, parent_id, file_name, storage_path, uploaded_by)
values
  (:'org_id', 'artist', :'artist_id', 'rider.pdf',
   :'org_id' || '/artists/' || :'artist_id' || '/rider.pdf',
   'a0000000-0000-0000-0000-00000000000a');
\echo 'PASS: admin a restrictionat artistul si a urcat fisier de artist'

-- ── Crew restricționat: cascada acoperă tot ──
select set_config('request.jwt.claims', '{"sub":"c0000000-0000-0000-0000-00000000000c"}', false);
do $$ begin
  if exists (select 1 from public.artists)
     or exists (select 1 from public.tours)
     or exists (select 1 from public.days)
     or exists (select 1 from public.schedule_items)
     or exists (select 1 from public.tour_personnel)
     or exists (select 1 from public.attachments where parent_type = 'artist') then
    raise exception 'FAIL: cascada artist -> continut nu functioneaza';
  end if;
end $$;
\echo 'PASS: crew restrictionat nu vede artist/tur/zile/schedule/personnel/fisiere'

-- ── Adminul (manager+) vede tot în continuare ──
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-00000000000a"}', false);
do $$ begin
  if not exists (select 1 from public.artists)
     or not exists (select 1 from public.tours)
     or not exists (select 1 from public.days) then
    raise exception 'FAIL: adminul a pierdut acces dupa regula';
  end if;
end $$;
\echo 'PASS: management bypass functioneaza'

-- ── Scoatem regula → crew vede din nou ──
delete from public.visibility_rules
where subject_type = 'artist' and subject_id = :'artist_id';

select set_config('request.jwt.claims', '{"sub":"c0000000-0000-0000-0000-00000000000c"}', false);
do $$ begin
  if not exists (select 1 from public.artists)
     or not exists (select 1 from public.tours) then
    raise exception 'FAIL: crew nu revede continutul dupa stergerea regulii';
  end if;
end $$;
\echo 'PASS: stergerea regulii redeschide accesul'

-- ── Ștergerea artistului cu tururi → blocată de FK restrict ──
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-00000000000a"}', false);
do $$ declare aid uuid; begin
  select id into aid from public.artists limit 1;
  begin
    delete from public.artists where id = aid;
    raise exception 'FAIL: artist cu tururi a fost sters';
  exception when foreign_key_violation then null;
  end;
end $$;
\echo 'PASS: artist cu tururi nu poate fi sters (se arhiveaza)'

reset role;
```

Apoi extinde blocul de cascadă ca să acopere explicit și travel/hotels/iCal (cerință din spec §5):
- înainte de blocul de restricție, ca admin, inserează un `travel_item` și un `day_hotel` pe ziua din faza1 — **copiază coloanele minime exact din inserturile echivalente din `supabase/tests/faza3_rls.test.sql`** (nu inventa coloane);
- include `travel_items` și `day_hotels` în verificarea de count din blocul „crew restricționat";
- adaugă o verificare `ical_feed()` pentru crew-ul restricționat — copiază pattern-ul de apel din `supabase/tests/faza6_rls.test.sql` și asertează că feed-ul nu mai conține zilele artistului restricționat.

- [ ] **Step 2: Rulează testele — trebuie să pice**

Run: `bash scripts/test-rls.sh`
Expected: FAIL la `faza1_rls.test.sql` sau `faza9` cu `relation "public.artists" does not exist` (fișierele noi rulează, migrarea nu există încă).

- [ ] **Step 3: Scrie migrarea principală**

Creează `supabase/migrations/00025_artists.sql`:

```sql
-- ═══════════════════════════════════════════════════════════════════
-- Faza 9 — Entitatea Artist (roster). Spec:
-- docs/superpowers/specs/2026-08-04-artist-entity-design.md
-- ═══════════════════════════════════════════════════════════════════

-- ── artists ─────────────────────────────────────────────────────────
create table public.artists (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  deleted_at timestamptz,
  organization_id uuid not null references public.organizations on delete cascade,
  name text not null,
  slug text not null,
  legal_name text,                 -- entitatea juridică (pt. contracte, §13 Zola)
  photo_path text,                 -- Storage: {orgId}/artists/{artistId}/photo-…
  home_base_city text,             -- punct de plecare pt. calcul km (sub-proiect 3)
  home_base_lat numeric,
  home_base_lng numeric,
  default_currency text,
  timezone text,
  color text,                      -- culoarea artistului în calendar (§2.4 Zola)
  links jsonb not null default '{}'::jsonb,  -- {spotify, instagram, youtube, website}
  is_archived boolean not null default false,
  created_by uuid references auth.users,
  unique (organization_id, slug)
);

create index artists_org_idx on public.artists (organization_id);

create trigger set_updated_at before update on public.artists
  for each row execute function public.set_updated_at();

-- ── RLS pe artists (oglindește politicile de pe tours) ──────────────
alter table public.artists enable row level security;

create policy artists_select on public.artists
  for select to authenticated
  using (
    (deleted_at is null or private.can_edit_tour_content(organization_id))
    and private.is_org_member(organization_id)
    and private.can_see_subject(organization_id, 'artist', id)
  );

create policy artists_insert on public.artists
  for insert to authenticated
  with check (private.can_edit_tour_content(organization_id));

create policy artists_update on public.artists
  for update to authenticated
  using (private.can_edit_tour_content(organization_id))
  with check (private.can_edit_tour_content(organization_id));

create policy artists_delete on public.artists
  for delete to authenticated
  using (private.can_edit_tour_content(organization_id));

-- ── tours.artist_id + backfill ──────────────────────────────────────
-- on delete restrict: un artist cu tururi nu se șterge — se arhivează.
alter table public.tours
  add column artist_id uuid references public.artists on delete restrict;

create index tours_artist_idx on public.tours (artist_id);

-- Backfill: un artist per org care are tururi, numit după org.
-- Post-deploy se redenumește din UI (vezi spec §4).
insert into public.artists (organization_id, name, slug, created_by)
select o.id, o.name, o.slug, null
from public.organizations o
where exists (select 1 from public.tours t where t.organization_id = o.id);

update public.tours t
set artist_id = a.id
from public.artists a
where a.organization_id = t.organization_id
  and t.artist_id is null;

alter table public.tours alter column artist_id set not null;

-- ── Cascada: vizibilitatea artistului intră în lanțul turului ───────
-- Punct unic de aplicare (spec §2): can_access_tour e folosit de toate
-- politicile copiilor (days, travel, hotels, …), deci restricția pe
-- artist cascadează automat, inclusiv în feed-urile iCal.
create or replace function private.can_access_tour(tour uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.tours t
    where t.id = tour
      and t.deleted_at is null
      and private.is_org_member(t.organization_id)
      and private.can_see_subject(t.organization_id, 'tour', t.id)
      and private.can_see_subject(t.organization_id, 'artist', t.artist_id)
  );
$$;

drop policy tours_select on public.tours;
create policy tours_select on public.tours
  for select to authenticated
  using (
    (deleted_at is null or private.can_edit_tour_content(organization_id))
    and private.is_org_member(organization_id)
    and private.can_see_subject(organization_id, 'tour', id)
    and private.can_see_subject(organization_id, 'artist', artist_id)
  );

grant execute on all functions in schema private to authenticated;
```

- [ ] **Step 4: Scrie migrarea pentru enum (fișier separat!)**

`alter type … add value` nu poate fi FOLOSIT în aceeași tranzacție în care e adăugat, iar CLI-ul Supabase rulează fiecare fișier într-o tranzacție — de asta valoarea se adaugă singură în fișierul ei. Creează `supabase/migrations/00026_artist_attachment_enum.sql`:

```sql
-- Fișiere permanente per artist (§3.2 Zola): parent nou pentru attachments.
-- Separat de 00027: valoarea de enum nu poate fi folosită în aceeași
-- tranzacție în care e adăugată.
alter type public.attachment_parent add value if not exists 'artist';
```

- [ ] **Step 5: Scrie migrarea pentru vizibilitatea fișierelor de artist**

Creează `supabase/migrations/00027_artist_attachment_visibility.sql`:

```sql
-- Vizibilitatea attachment-urilor cu parent 'artist' derivă din
-- vizibilitatea artistului (același mecanism ca la §2 din spec).
create or replace function private.can_see_attachment_parent(
  ptype public.attachment_parent,
  pid uuid,
  org uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case ptype
    when 'tour' then private.can_access_tour(pid)
    when 'day' then private.can_access_day(pid)
    -- [C] accounting attachments: DOAR administrator + accounting
    when 'event_accounting' then
      private.can_access_event(pid)
      and private.has_min_permission(org, 'accounting')
    when 'song' then private.is_org_member(org)
    when 'artist' then
      private.is_org_member(org)
      and private.can_see_subject(org, 'artist', pid)
  end;
$$;

grant execute on all functions in schema private to authenticated;
```

- [ ] **Step 6: Actualizează faza1 să creeze artistul**

În `supabase/tests/faza1_rls.test.sql`, imediat după primul bloc `set role authenticated;` (adminul) și ÎNAINTE de insertul în `public.tours`, adaugă:

```sql
insert into public.artists (organization_id, name, slug, created_by)
values (:'org_id', 'SPEAK', 'speak', 'a0000000-0000-0000-0000-00000000000a')
returning id as artist_id \gset
```

și schimbă insertul de tur existent ca să includă coloana:

```sql
insert into public.tours (organization_id, artist_id, name, start_date, end_date, created_by)
values (:'org_id', :'artist_id', 'SxS Summer 2026', '2026-07-17', '2026-07-26',
        'a0000000-0000-0000-0000-00000000000a')
returning id as tour_id \gset
```

- [ ] **Step 7: Rulează testele RLS — trebuie să treacă toate**

Run: `bash scripts/test-rls.sh`
Expected: toate `PASS:`-urile din faza0–faza7 + faza9, exit 0. Dacă pică alt fișier de test pe insert de tur, adaugă-i `artist_id` la fel ca în Step 6.

- [ ] **Step 8: Commit**

```bash
git add supabase/migrations/00025_artists.sql supabase/migrations/00026_artist_attachment_enum.sql supabase/migrations/00027_artist_attachment_visibility.sql supabase/tests/faza9_artists_rls.test.sql supabase/tests/faza1_rls.test.sql
git commit -m "feat: entitatea Artist — schema, backfill, cascada RLS artist->tur

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: lib/slug + createTour cu artist obligatoriu

**Files:**
- Create: `lib/slug.ts`
- Create: `lib/slug.test.ts`
- Modify: `app/app/actions.ts` (folosește `slugify` din lib, șterge duplicatul local)
- Modify: `app/o/[orgSlug]/tours/new/actions.ts`
- Modify: `app/o/[orgSlug]/tours/new/page.tsx`
- Modify: `app/o/[orgSlug]/tours/new/wizard.tsx`
- Modify: `messages/ro.json`, `messages/en.json`

**Interfaces:**
- Consumes: `tours.artist_id not null` (Task 1).
- Produces: `slugify(name: string): string` și `uniqueSlug(base: string, taken: ReadonlySet<string>): string` din `lib/slug.ts`; `createTour(orgSlug, payload)` primește în `payload` câmp nou `artistId: string`. Task 3 folosește ambele funcții de slug.

- [ ] **Step 1: Scrie testele pentru slug**

Creează `lib/slug.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { slugify, uniqueSlug } from "./slug";

describe("slugify", () => {
  it("normalizează diacritice, spații și majuscule", () => {
    expect(slugify("Ștefan & The Band")).toBe("stefan-the-band");
  });
  it("returnează string gol pentru input fără caractere valide", () => {
    expect(slugify("!!!")).toBe("");
  });
});

describe("uniqueSlug", () => {
  it("returnează baza când e liberă", () => {
    expect(uniqueSlug("speak", new Set(["alt"]))).toBe("speak");
  });
  it("adaugă sufix numeric la coliziune", () => {
    expect(uniqueSlug("speak", new Set(["speak", "speak-2"]))).toBe("speak-3");
  });
});
```

- [ ] **Step 2: Rulează testul — trebuie să pice**

Run: `pnpm vitest run lib/slug.test.ts`
Expected: FAIL — `Cannot find module './slug'`.

- [ ] **Step 3: Implementează lib/slug.ts**

Deschide `app/app/actions.ts`, copiază corpul funcției `slugify` existente (liniile ~6–20) ca să păstrezi exact aceeași normalizare, apoi creează `lib/slug.ts`:

```typescript
/** Slug URL-safe din nume (aceeași normalizare ca la crearea org-ului). */
export function slugify(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Prima variantă liberă: base, base-2, base-3… */
export function uniqueSlug(base: string, taken: ReadonlySet<string>): string {
  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${base}-${n}`)) n++;
  return `${base}-${n}`;
}
```

Dacă normalizarea din `app/app/actions.ts` diferă de cea de mai sus, păstreaz-o pe cea din `app/app/actions.ts` (sursa de adevăr) și adaptează testul. Apoi în `app/app/actions.ts` șterge funcția locală și importă: `import { slugify } from "@/lib/slug";`.

- [ ] **Step 4: Rulează testele**

Run: `pnpm vitest run lib/slug.test.ts`
Expected: PASS (4 teste).

- [ ] **Step 5: createTour primește artistId**

În `app/o/[orgSlug]/tours/new/actions.ts`:
- adaugă `artistId: string;` în tipul `payload`-ului lui `createTour`;
- validare: `if (!payload.artistId) return { error: "invalid" };`
- în insertul în `tours` adaugă `artist_id: payload.artistId,`.

RLS-ul garantează că artistul aparține org-ului (FK + politicile de select), nu e nevoie de verificare suplimentară.

- [ ] **Step 6: Selectorul de artist în wizard**

În `app/o/[orgSlug]/tours/new/page.tsx`: încarcă artiștii activi și pasează-i wizard-ului împreună cu preselecția din query:

```typescript
const { data: artists } = await supabase
  .from("artists")
  .select("id, name")
  .eq("organization_id", org.id)
  .eq("is_archived", false)
  .is("deleted_at", null)
  .order("name");
```

Citește `searchParams` (Promise, ca `params`) pentru `artist` (id preselectat de pe pagina artistului). În `wizard.tsx`: prop nou `artists: { id: string; name: string }[]` + `defaultArtistId?: string`; un `<select name="artist">` obligatoriu (stil: clasele de input folosite deja în wizard), valoarea intră în `payload.artistId` la submit. Dacă `artists.length === 1`, preselecteaz-o. Etichete i18n sub namespace-ul `tours`: `ro.json` → `"artistLabel": "Artist"`, `"artistRequired": "Alege artistul"`; `en.json` → `"artistLabel": "Artist"`, `"artistRequired": "Choose an artist"`.

- [ ] **Step 7: Verifică i18n și build-ul de tip**

Run: `node scripts/check-i18n.mjs && pnpm tsc --noEmit`
Expected: ambele exit 0. (Dacă proiectul n-are script `tsc`, rulează `pnpm exec tsc --noEmit`.)

- [ ] **Step 8: Commit**

```bash
git add lib/slug.ts lib/slug.test.ts app/app/actions.ts "app/o/[orgSlug]/tours/new" messages/ro.json messages/en.json
git commit -m "feat: createTour cere artistul; slugify extras în lib/slug

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: Roster-ul (pagina de org) + creare artist

**Files:**
- Modify: `app/o/[orgSlug]/page.tsx` (din listă de tururi → roster de artiști)
- Create: `app/o/[orgSlug]/artists/new/page.tsx`
- Create: `app/o/[orgSlug]/artists/new/actions.ts`
- Modify: `messages/ro.json`, `messages/en.json` (namespace nou `roster`)

**Interfaces:**
- Consumes: `artists` (Task 1), `slugify`/`uniqueSlug` (Task 2), `requireOrg` din `@/lib/org`, `can` din `@/lib/permissions`, `MetricStrip` din `@/components/ui/MetricStrip`.
- Produces: ruta `/o/[orgSlug]/artists/new` și acțiunea `createArtist(orgSlug: string, formData: FormData): Promise<{ error?: string }>` care face redirect la `/o/{orgSlug}/a/{slug}`. Pagina artistului (Task 4) e ținta linkurilor din roster: `/o/{orgSlug}/a/{artist.slug}`.

- [ ] **Step 1: Acțiunea createArtist**

Creează `app/o/[orgSlug]/artists/new/actions.ts` (urmează idiomul din `tours/new/actions.ts`):

```typescript
"use server";

import { redirect } from "next/navigation";
import { requireOrg } from "@/lib/org";
import { can } from "@/lib/permissions";
import { slugify, uniqueSlug } from "@/lib/slug";

/** Paleta din care roster-ul alege automat culoarea următorului artist. */
export const ARTIST_COLORS = [
  "#e5484d", "#f76b15", "#ffc53d", "#30a46c",
  "#0091ff", "#6e56cf", "#e93d82", "#12a594",
];

export async function createArtist(
  orgSlug: string,
  formData: FormData,
): Promise<{ error?: string }> {
  const { supabase, org, permission, tier, user } = await requireOrg(orgSlug);
  if (!can({ tier, permission }, "manage_tours")) return { error: "forbidden" };

  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { error: "invalid" };

  const { data: existing } = await supabase
    .from("artists")
    .select("slug, color")
    .eq("organization_id", org.id);
  const taken = new Set((existing ?? []).map((a) => a.slug));
  const slug = uniqueSlug(slugify(name) || "artist", taken);
  const used = new Set((existing ?? []).map((a) => a.color));
  const color =
    ARTIST_COLORS.find((c) => !used.has(c)) ??
    ARTIST_COLORS[(existing ?? []).length % ARTIST_COLORS.length];

  const { error } = await supabase.from("artists").insert({
    organization_id: org.id,
    name,
    slug,
    color,
    created_by: user.id,
  });
  if (error) return { error: error.message };
  redirect(`/o/${orgSlug}/a/${slug}`);
}
```

Notă: `"use server"` nu permite export de constante non-funcții în unele configurații — dacă build-ul se plânge de `ARTIST_COLORS`, mută constanta într-un fișier separat `app/o/[orgSlug]/artists/new/colors.ts` (fără directivă) și importă-l.

- [ ] **Step 2: Pagina de creare**

Creează `app/o/[orgSlug]/artists/new/page.tsx` — server component minimal: verifică `can(..., "manage_tours")` (altfel `redirect` înapoi la `/o/{orgSlug}`), un `<form action={...}>` cu input `name` (obligatoriu) + submit `btn-primary`, titlu din i18n. Folosește pattern-ul form → server action din `tours/new` (bind pe `orgSlug`). La eroare afișează mesajul sub formular (client wrapper doar dacă e nevoie de `useActionState` — vezi cum face `wizard.tsx`).

- [ ] **Step 3: Roster-ul înlocuiește lista de tururi**

Rescrie `app/o/[orgSlug]/page.tsx` păstrând `MetricStrip`-ul și statisticile existente (tururi active, upcoming shows, next show, crew — codul actual rămâne), dar secțiunea de listă de tururi devine grila de artiști:

```typescript
const { data: artists } = await supabase
  .from("artists")
  .select("id, name, slug, color, photo_path, is_archived")
  .eq("organization_id", org.id)
  .is("deleted_at", null)
  .order("name");
```

Pentru „next show" per artist, refolosește `showDays` deja încărcat în pagină, plus maparea tur→artist:

```typescript
const { data: tourArtists } = await supabase
  .from("tours")
  .select("id, artist_id")
  .eq("organization_id", org.id)
  .is("deleted_at", null);
const artistOfTour = new Map((tourArtists ?? []).map((t) => [t.id, t.artist_id]));
const nextShowOfArtist = new Map<string, { date: string; city: string | null }>();
for (const d of upcoming) {
  const aid = artistOfTour.get(d.tour_id);
  if (aid && !nextShowOfArtist.has(aid)) nextShowOfArtist.set(aid, d);
}
```

Fiecare card de artist (grid `sm:grid-cols-2`, carduri `rounded-[12px] border border-hairline bg-surface`): pastilă de culoare (`color`), poza (signed URL din bucket `attachments` dacă `photo_path` există, altfel inițialele pe fundal `color`), numele, next show (dată + oraș) sau „—", link către `/o/${org.slug}/a/${artist.slug}`. Artiștii `is_archived` într-o secțiune separată jos, cu `opacity-60` (ca tururile arhivate acum). Butonul „Tur nou" din header se înlocuiește cu „Artist nou" → `/o/${org.slug}/artists/new` (vizibil doar cu `manage_tours`); crearea de tururi se mută pe pagina artistului (Task 4). Empty state: text + CTA „Artist nou".

i18n — namespace nou `roster` în ambele fișiere:

```json
"roster": {
  "title": "Roster",
  "newArtist": "Artist nou",
  "nextShow": "Următorul show",
  "noShows": "Fără show-uri programate",
  "archived": "Arhivați",
  "empty": "Niciun artist încă. Creează primul.",
  "nameLabel": "Nume artist",
  "createTitle": "Artist nou"
}
```

(în `en.json`: `"Roster" / "New artist" / "Next show" / "No scheduled shows" / "Archived" / "No artists yet. Create the first one." / "Artist name" / "New artist"`).

- [ ] **Step 4: Verifică**

Run: `node scripts/check-i18n.mjs && pnpm exec tsc --noEmit`
Expected: exit 0. Apoi smoke local (`pnpm dev`): `/o/{slug}` afișează artistul din backfill cu next show corect; „Artist nou" creează și redirecționează (404 pe `/a/[slug]` e OK — pagina vine în Task 4).

- [ ] **Step 5: Commit**

```bash
git add "app/o/[orgSlug]/page.tsx" "app/o/[orgSlug]/artists" messages/ro.json messages/en.json
git commit -m "feat: roster de artiști pe pagina de org + creare artist

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: Pagina artistului — layout + tab Date

**Files:**
- Create: `app/o/[orgSlug]/a/[artistSlug]/layout.tsx`
- Create: `app/o/[orgSlug]/a/[artistSlug]/page.tsx` (tab Date)
- Create: `lib/artistTimeline.ts`
- Create: `lib/artistTimeline.test.ts`
- Modify: `messages/ro.json`, `messages/en.json` (namespace nou `artist`)

**Interfaces:**
- Consumes: `artists`, `tours.artist_id` (Task 1); ruta `/o/[orgSlug]/artists/new` (Task 3); `advance_status` enum (`not_started|in_progress|done`) din schema existentă.
- Produces: layout-ul care rezolvă artistul din slug (`notFound()` dacă lipsește) și-l pune la dispoziția taburilor; helper `buildArtistTimeline(days, advances): TimelineDay[]` (tipuri mai jos). Taburile Profil (Task 5) și Acces (Task 6) se montează sub același layout la `…/a/[artistSlug]/profile` și `…/a/[artistSlug]/access`.

- [ ] **Step 1: Testul pentru agregarea timeline-ului**

Creează `lib/artistTimeline.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { buildArtistTimeline } from "./artistTimeline";

const days = [
  { id: "d2", date: "2026-09-01", day_type: "show", city: "Bacău", country: "România", tour_id: "t1" },
  { id: "d1", date: "2026-08-20", day_type: "travel", city: null, country: null, tour_id: "t1" },
];
const advances = [
  { event_id: "e1", day_id: "d2", status: "done" },
  { event_id: "e2", day_id: "d2", status: "in_progress" },
];

describe("buildArtistTimeline", () => {
  it("sortează cronologic și atașează progresul de advancing", () => {
    const rows = buildArtistTimeline(days, advances);
    expect(rows.map((r) => r.id)).toEqual(["d1", "d2"]);
    expect(rows[1].advance).toEqual({ done: 1, total: 2 });
    expect(rows[0].advance).toBeNull();
  });
});
```

- [ ] **Step 2: Rulează — pică**

Run: `pnpm vitest run lib/artistTimeline.test.ts`
Expected: FAIL — modulul nu există.

- [ ] **Step 3: Implementează helperul**

Creează `lib/artistTimeline.ts`:

```typescript
/** Agregarea zilelor unui artist (peste toate tururile) pentru tabul Date. */

export interface TimelineDayInput {
  id: string;
  date: string; // YYYY-MM-DD
  day_type: string;
  city: string | null;
  country: string | null;
  tour_id: string;
}

export interface TimelineAdvanceInput {
  event_id: string;
  day_id: string;
  status: "not_started" | "in_progress" | "done" | string;
}

export interface TimelineDay extends TimelineDayInput {
  advance: { done: number; total: number } | null;
}

export function buildArtistTimeline(
  days: TimelineDayInput[],
  advances: TimelineAdvanceInput[],
): TimelineDay[] {
  const byDay = new Map<string, { done: number; total: number }>();
  for (const a of advances) {
    const agg = byDay.get(a.day_id) ?? { done: 0, total: 0 };
    agg.total += 1;
    if (a.status === "done") agg.done += 1;
    byDay.set(a.day_id, agg);
  }
  return [...days]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((d) => ({ ...d, advance: byDay.get(d.id) ?? null }));
}
```

- [ ] **Step 4: Rulează — trece**

Run: `pnpm vitest run lib/artistTimeline.test.ts`
Expected: PASS.

- [ ] **Step 5: Layout-ul artistului**

Creează `app/o/[orgSlug]/a/[artistSlug]/layout.tsx` — urmează idiomul din `app/o/[orgSlug]/t/[tourId]/layout.tsx` (async params, `requireOrg`, `notFound()`):

```typescript
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { requireOrg } from "@/lib/org";

export default async function ArtistLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ orgSlug: string; artistSlug: string }>;
}) {
  const { orgSlug, artistSlug } = await params;
  const { supabase, org } = await requireOrg(orgSlug);
  const t = await getTranslations("artist");

  const { data: artist } = await supabase
    .from("artists")
    .select("id, name, slug, color, photo_path, is_archived")
    .eq("organization_id", org.id)
    .eq("slug", artistSlug)
    .is("deleted_at", null)
    .maybeSingle();
  if (!artist) notFound();

  const base = `/o/${orgSlug}/a/${artistSlug}`;
  const tabs = [
    { href: base, label: t("tabDates") },
    { href: `${base}/profile`, label: t("tabProfile") },
    { href: `${base}/access`, label: t("tabAccess") },
  ];

  return (
    <main className="mx-auto w-full max-w-3xl space-y-6 p-6">
      <header className="flex items-center gap-3">
        <span
          className="h-3 w-3 shrink-0 rounded-full"
          style={{ backgroundColor: artist.color ?? "#888" }}
        />
        <h1 className="font-display text-2xl font-semibold tracking-tight">
          {artist.name}
        </h1>
      </header>
      <nav className="flex gap-1 border-b border-hairline">
        {tabs.map((tab) => (
          <Link key={tab.href} href={tab.href} className="px-3 py-2 text-sm hover:bg-subtle">
            {tab.label}
          </Link>
        ))}
      </nav>
      {children}
    </main>
  );
}
```

Dacă layout-urile existente marchează tabul activ (vezi cum face tour layout-ul cu `PrimarySidebar`), replică mecanismul; altfel lasă stilul simplu de mai sus.

- [ ] **Step 6: Tab-ul Date**

Creează `app/o/[orgSlug]/a/[artistSlug]/page.tsx`:
- rezolvă artistul din slug (aceeași interogare ca în layout — paginile nu moștenesc datele layout-ului);
- încarcă tururile lui: `from("tours").select("id, name, is_archived").eq("artist_id", artist.id).is("deleted_at", null)`;
- încarcă zilele: `from("days").select("id, date, day_type, city, country, tour_id").in("tour_id", tourIds).is("deleted_at", null)`;
- încarcă advancing-ul: `from("events").select("id, day_id").in("day_id", dayIds)` apoi `from("advances").select("event_id, status").in("event_id", eventIds)`; mapează la `{ event_id, day_id, status }` prin join-ul în memorie;
- `buildArtistTimeline(days, advances)`, împarte în `upcoming` (`date >= todayKey`) și `past`, afișează upcoming întâi;
- rând de timeline: data formatată cu `Intl.DateTimeFormat(locale)`, badge tip zi (refolosește stilul punctelor din `t/[tourId]/calendar/page.tsx`), oraș/țară, numele turului, progres advancing (`done/total` — verde când `done === total && total > 0`), link către `/o/{orgSlug}/t/{tour_id}/d/{date}`;
- secțiune „Tururi" sub timeline: lista tururilor artistului (link `/o/{orgSlug}/t/{id}`) + buton „Tur nou" → `/o/{orgSlug}/tours/new?artist={artist.id}` (doar `manage_tours`);
- empty states pentru ambele secțiuni.

i18n — namespace nou `artist` (ambele limbi):

```json
"artist": {
  "tabDates": "Date",
  "tabProfile": "Profil",
  "tabAccess": "Acces",
  "upcoming": "Urmează",
  "past": "Trecute",
  "tours": "Tururi",
  "newTour": "Tur nou",
  "noDays": "Nicio zi programată încă.",
  "noTours": "Niciun tur încă.",
  "advance": "Advancing"
}
```

(în `en.json`: `"Dates" / "Profile" / "Access" / "Upcoming" / "Past" / "Tours" / "New tour" / "No scheduled days yet." / "No tours yet." / "Advancing"`).

- [ ] **Step 7: Verifică**

Run: `node scripts/check-i18n.mjs && pnpm exec tsc --noEmit`
Expected: exit 0. Smoke local: `/o/{slug}/a/{artistSlug}` arată timeline-ul zilelor din SOLD OUT TOUR cu linkuri funcționale către paginile de zi.

- [ ] **Step 8: Commit**

```bash
git add "app/o/[orgSlug]/a" lib/artistTimeline.ts lib/artistTimeline.test.ts messages/ro.json messages/en.json
git commit -m "feat: pagina artistului — layout + tab Date (timeline peste tururi)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: Tab-ul Profil (editare artist + poză + home base)

**Files:**
- Create: `app/o/[orgSlug]/a/[artistSlug]/profile/page.tsx`
- Create: `app/o/[orgSlug]/a/[artistSlug]/profile/actions.ts`
- Create: `app/o/[orgSlug]/a/[artistSlug]/profile/photo-client.tsx`
- Modify: `messages/ro.json`, `messages/en.json` (chei noi în `artist`)

**Interfaces:**
- Consumes: layout-ul din Task 4; `searchGooglePlaces`, `lookupTimezoneByLatLng`, `isGoogleEnabled` din `@/lib/googlePlaces`; `suggestTimezone`, `allTimezones`, `DEFAULT_TZ` din `@/lib/tzLookup`; `ARTIST_COLORS` (Task 3); pattern-ul de upload din `app/o/[orgSlug]/t/[tourId]/personnel/[personnelId]/photo-client.tsx`.
- Produces: `saveArtistProfile(orgSlug, artistId, formData): Promise<{ error?: string }>`, `setArtistPhoto(orgSlug, artistSlug, artistId, path): Promise<{ error?: string }>`, `setArtistArchived(orgSlug, artistId, archived: boolean)`. Nimic din alte task-uri nu depinde de ele.

- [ ] **Step 1: Acțiunile**

Creează `app/o/[orgSlug]/a/[artistSlug]/profile/actions.ts`:

```typescript
"use server";

import { revalidatePath } from "next/cache";
import { requireOrg } from "@/lib/org";
import { can } from "@/lib/permissions";
import {
  isGoogleEnabled,
  lookupTimezoneByLatLng,
  searchGooglePlaces,
} from "@/lib/googlePlaces";
import { DEFAULT_TZ, suggestTimezone } from "@/lib/tzLookup";

async function requireManage(orgSlug: string) {
  const ctx = await requireOrg(orgSlug);
  if (!can({ tier: ctx.tier, permission: ctx.permission }, "manage_tours")) {
    throw new Error("forbidden");
  }
  return ctx;
}

export async function saveArtistProfile(
  orgSlug: string,
  artistId: string,
  formData: FormData,
): Promise<{ error?: string }> {
  const { supabase } = await requireManage(orgSlug);

  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { error: "invalid" };
  const homeBaseCity = String(formData.get("home_base_city") ?? "").trim() || null;

  // Geocodare home base: refolosim Text Search-ul deja folosit la pagini de zi.
  let lat: number | null = null;
  let lng: number | null = null;
  let timezone = String(formData.get("timezone") ?? "").trim() || null;
  if (homeBaseCity && isGoogleEnabled()) {
    const [place] = await searchGooglePlaces(homeBaseCity);
    if (place?.lat != null && place?.lng != null) {
      lat = place.lat;
      lng = place.lng;
      if (!timezone) {
        timezone = (await lookupTimezoneByLatLng(place.lat, place.lng)) ?? null;
      }
    }
  }
  if (homeBaseCity && !timezone) {
    timezone = suggestTimezone(homeBaseCity) ?? DEFAULT_TZ;
  }

  const { error } = await supabase
    .from("artists")
    .update({
      name,
      legal_name: String(formData.get("legal_name") ?? "").trim() || null,
      home_base_city: homeBaseCity,
      home_base_lat: lat,
      home_base_lng: lng,
      default_currency: String(formData.get("default_currency") ?? "").trim() || null,
      timezone,
      color: String(formData.get("color") ?? "").trim() || null,
      links: {
        spotify: String(formData.get("link_spotify") ?? "").trim() || undefined,
        instagram: String(formData.get("link_instagram") ?? "").trim() || undefined,
        youtube: String(formData.get("link_youtube") ?? "").trim() || undefined,
        website: String(formData.get("link_website") ?? "").trim() || undefined,
      },
    })
    .eq("id", artistId);
  if (error) return { error: error.message };
  revalidatePath(`/o/${orgSlug}`, "layout");
  return {};
}

export async function setArtistPhoto(
  orgSlug: string,
  artistSlug: string,
  artistId: string,
  path: string,
): Promise<{ error?: string }> {
  const { supabase } = await requireManage(orgSlug);
  const { error } = await supabase
    .from("artists")
    .update({ photo_path: path })
    .eq("id", artistId);
  if (error) return { error: error.message };
  revalidatePath(`/o/${orgSlug}/a/${artistSlug}/profile`);
  return {};
}

export async function setArtistArchived(
  orgSlug: string,
  artistId: string,
  archived: boolean,
): Promise<{ error?: string }> {
  const { supabase } = await requireManage(orgSlug);
  const { error } = await supabase
    .from("artists")
    .update({ is_archived: archived })
    .eq("id", artistId);
  if (error) return { error: error.message };
  revalidatePath(`/o/${orgSlug}`, "layout");
  return {};
}
```

Verifică semnăturile reale din `lib/googlePlaces.ts` (`searchGooglePlaces` poate avea al doilea parametru) și adaptează apelul; verifică și `suggestTimezone` (primește country, nu city — dacă da, pasează-i doar fallback-ul `DEFAULT_TZ` și lasă timezone-ul editabil manual din select).

- [ ] **Step 2: Pagina de profil**

Creează `app/o/[orgSlug]/a/[artistSlug]/profile/page.tsx` — server component: rezolvă artistul din slug (ca în Task 4), gate `manage_tours` (altfel redirect la tabul Date), formular cu `action` bind pe `saveArtistProfile`:
- inputuri text: `name` (required), `legal_name`, `home_base_city`, `default_currency` (select simplu: EUR / RON / USD / GBP), `link_spotify`, `link_instagram`, `link_youtube`, `link_website`;
- `timezone`: select populat din `allTimezones()` cu valoarea curentă;
- `color`: radio-grup de swatch-uri din `ARTIST_COLORS` (pătrate colorate, `border-strong` pe cel selectat);
- poza: componentă client `photo-client.tsx` copiată din `personnel/[personnelId]/photo-client.tsx` cu calea `${orgId}/artists/${artistId}/photo-${crypto.randomUUID()}-${file.name}` în bucketul `attachments` și callback `setArtistPhoto`; afișare cu signed URL (ca la personnel);
- arhivare: buton la finalul paginii care apelează `setArtistArchived` cu confirmare nativă în client-form (urmează pattern-ul celui mai apropiat buton destructiv existent, ex. arhivarea turului din `t/[tourId]/settings`).

Chei i18n noi în `artist` (ambele limbi): `profileTitle` („Profil artist"/"Artist profile"), `nameLabel`, `legalNameLabel` („Entitate juridică"/"Legal entity"), `homeBaseLabel` („Home base"/"Home base"), `homeBaseHint` („Punctul de plecare pentru calculul de km"/"Starting point for distance calculations"), `currencyLabel` („Valută implicită"/"Default currency"), `timezoneLabel` („Fus orar"/"Time zone"), `colorLabel` („Culoare în calendar"/"Calendar color"), `linksLabel` („Linkuri"/"Links"), `photoLabel` („Poză de profil"/"Profile photo"), `archive` („Arhivează artistul"/"Archive artist"), `unarchive` („Dezarhivează"/"Unarchive"), `saved` („Salvat"/"Saved").

- [ ] **Step 3: Verifică**

Run: `node scripts/check-i18n.mjs && pnpm exec tsc --noEmit`
Expected: exit 0. Smoke local: editezi numele/culoarea → roster-ul reflectă schimbarea; setezi home base „București" → lat/lng/timezone se populează (cu cheia Google configurată) sau rămân null + `DEFAULT_TZ` (fără cheie); upload poză → apare în roster și în header-ul artistului.

- [ ] **Step 4: Commit**

```bash
git add "app/o/[orgSlug]/a/[artistSlug]/profile" messages/ro.json messages/en.json
git commit -m "feat: tab Profil artist — editare, poză, home base geocodat

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 6: Tab-ul Acces (vizibilitate per artist) + fișierele artistului

**Files:**
- Create: `app/o/[orgSlug]/a/[artistSlug]/access/page.tsx`
- Create: `app/o/[orgSlug]/a/[artistSlug]/access/actions.ts`
- Create: `app/o/[orgSlug]/a/[artistSlug]/access/files-client.tsx`
- Modify: `messages/ro.json`, `messages/en.json` (chei noi în `artist`)

**Interfaces:**
- Consumes: `visibility_rules` cu `subject_type='artist'` (Task 1), enum `attachment_parent` cu `'artist'` (Task 1), layout-ul din Task 4; pattern-ul de listare/upload fișiere din `app/o/[orgSlug]/t/[tourId]/attachments/docs-client.tsx`.
- Produces: `addArtistVisibilityRule(orgSlug, artistSlug, artistId, target: { type: "user" | "group"; id: string })`, `removeArtistVisibilityRule(orgSlug, artistSlug, ruleId)`, `addArtistAttachment(orgSlug, artistSlug, artistId, meta)`, `deleteArtistAttachment(orgSlug, artistSlug, attachmentId)`. Nimic din alte task-uri nu depinde de ele.

- [ ] **Step 1: Acțiunile**

Creează `app/o/[orgSlug]/a/[artistSlug]/access/actions.ts`:

```typescript
"use server";

import { revalidatePath } from "next/cache";
import { requireOrg } from "@/lib/org";
import { can } from "@/lib/permissions";

async function requireManage(orgSlug: string) {
  const ctx = await requireOrg(orgSlug);
  if (!can({ tier: ctx.tier, permission: ctx.permission }, "manage_tours")) {
    throw new Error("forbidden");
  }
  return ctx;
}

export async function addArtistVisibilityRule(
  orgSlug: string,
  artistSlug: string,
  artistId: string,
  target: { type: "user" | "group"; id: string },
): Promise<{ error?: string }> {
  const { supabase, org, user } = await requireManage(orgSlug);
  const { error } = await supabase.from("visibility_rules").insert({
    organization_id: org.id,
    subject_type: "artist",
    subject_id: artistId,
    target_type: target.type,
    target_id: target.id,
    created_by: user.id,
  });
  if (error) return { error: error.message };
  revalidatePath(`/o/${orgSlug}/a/${artistSlug}/access`);
  return {};
}

export async function removeArtistVisibilityRule(
  orgSlug: string,
  artistSlug: string,
  ruleId: string,
): Promise<{ error?: string }> {
  const { supabase } = await requireManage(orgSlug);
  const { error } = await supabase
    .from("visibility_rules")
    .delete()
    .eq("id", ruleId);
  if (error) return { error: error.message };
  revalidatePath(`/o/${orgSlug}/a/${artistSlug}/access`);
  return {};
}

export async function addArtistAttachment(
  orgSlug: string,
  artistSlug: string,
  artistId: string,
  meta: { fileName: string; storagePath: string; mimeType: string; sizeBytes: number },
): Promise<{ error?: string }> {
  const { supabase, org, user } = await requireManage(orgSlug);
  const { error } = await supabase.from("attachments").insert({
    organization_id: org.id,
    parent_type: "artist",
    parent_id: artistId,
    file_name: meta.fileName,
    storage_path: meta.storagePath,
    mime_type: meta.mimeType,
    size_bytes: meta.sizeBytes,
    uploaded_by: user.id,
  });
  if (error) return { error: error.message };
  revalidatePath(`/o/${orgSlug}/a/${artistSlug}/access`);
  return {};
}

export async function deleteArtistAttachment(
  orgSlug: string,
  artistSlug: string,
  attachmentId: string,
): Promise<{ error?: string }> {
  const { supabase } = await requireManage(orgSlug);
  const { error } = await supabase
    .from("attachments")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", attachmentId);
  if (error) return { error: error.message };
  revalidatePath(`/o/${orgSlug}/a/${artistSlug}/access`);
  return {};
}
```

Înainte de a scrie ștergerea, verifică în `docs-client.tsx`/`extras-actions.ts` cum se face delete-ul la attachments (soft-delete cu `deleted_at` vs. `delete()`) și copiază exact convenția.

- [ ] **Step 2: Pagina de acces**

Creează `app/o/[orgSlug]/a/[artistSlug]/access/page.tsx` — gate `manage_tours` (altfel redirect la tabul Date). Trei secțiuni:

1. **Reguli de vizibilitate.** Încarcă `visibility_rules` (`subject_type='artist'`, `subject_id=artist.id`) + `groups` org-ului + membrii (`organization_members` join `profiles` — vezi cum face `settings/users/page.tsx`). Afișează starea: fără reguli → banner informativ „Vizibil pentru toată organizația"; cu reguli → lista lor (nume grup/user + buton de ștergere). Sub listă, două selecturi („Adaugă grup", „Adaugă user") cu form-uri către `addArtistVisibilityRule`. Notă vizibilă: managementul (administrator/accounting/manager) vede întotdeauna tot.
2. **Fișierele artistului.** `attachments` cu `parent_type='artist'`, `parent_id=artist.id`, `deleted_at is null`. Componentă client `files-client.tsx` clonată din `attachments/docs-client.tsx` (upload direct în Storage la `${orgId}/artists/${artistId}/${crypto.randomUUID()}-${file.name}`, apoi `addArtistAttachment`; listă cu nume, mărime, download prin signed URL, ștergere).
3. Fără alte secțiuni (YAGNI — moștenirea fișierelor în event-uri e sub-proiectul 3).

Chei i18n noi în `artist` (ambele limbi): `accessTitle` („Acces"/"Access"), `accessOpen` („Vizibil pentru toată organizația"/"Visible to the whole organization"), `accessRestricted` („Restricționat la:"/"Restricted to:"), `accessNote` („Administratorii, accounting-ul și managerii văd întotdeauna tot."/"Administrators, accounting and managers always see everything."), `addGroup` („Adaugă grup"/"Add group"), `addUser` („Adaugă user"/"Add user"), `remove` („Șterge"/"Remove"), `filesTitle` („Fișierele artistului"/"Artist files"), `filesHint` („Rider tehnic, hospitality, press — se vor moșteni în event-uri."/"Tech rider, hospitality, press — will be inherited by events."), `upload` („Încarcă"/"Upload"), `noFiles` („Niciun fișier."/"No files.").

- [ ] **Step 3: Verifică manual cascada end-to-end**

Run: `pnpm dev`, apoi cu un user de test `mobile_access`:
1. fără reguli → userul vede artistul și turul;
2. adaugi regulă doar către un grup din care userul NU face parte → roster-ul userului nu mai arată artistul, iar `/o/{slug}/t/{tourId}` dă 404;
3. ștergi regula → totul revine.
Expected: comportamentul de mai sus (dublează testele SQL din Task 1 la nivel de UI).

- [ ] **Step 4: Verifică i18n + tipuri și commit**

Run: `node scripts/check-i18n.mjs && pnpm exec tsc --noEmit`
Expected: exit 0.

```bash
git add "app/o/[orgSlug]/a/[artistSlug]/access" messages/ro.json messages/en.json
git commit -m "feat: tab Acces artist — reguli de vizibilitate + fișiere permanente

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 7: Navigare — breadcrumb, sidebar, Tour Settings

**Files:**
- Modify: `app/o/[orgSlug]/t/[tourId]/layout.tsx` (crumb artist › tur + link Roster în sidebar)
- Modify: `app/o/[orgSlug]/t/[tourId]/settings/page.tsx` + acțiunile ei (selector de artist)
- Modify: `messages/ro.json`, `messages/en.json`

**Interfaces:**
- Consumes: `artists`, `tours.artist_id` (Task 1); paginile artistului (Task 4-6); `PrimarySidebar`/`BreadcrumbTail` existente.
- Produces: acțiune `updateTourArtist(orgSlug, tourId, artistId)` în fișierul de acțiuni al tour settings. Nimic ulterior nu depinde de ea.

- [ ] **Step 1: Crumb-ul și sidebar-ul turului**

În `app/o/[orgSlug]/t/[tourId]/layout.tsx`:
- extinde select-ul de tur cu artistul: `.select("id, name, artist_id, artists(name, slug)")`;
- în `BreadcrumbTail`/`#chrome-crumb` (vezi cum injectează layout-ul numele turului) prefixează cu numele artistului ca link către `/o/{orgSlug}/a/{artists.slug}`;
- în construcția secțiunilor `PrimarySidebar` (secțiunea ORGANIZATION), adaugă un item „Roster" cu href `/o/${orgSlug}` — respectă forma exactă a tipului `SidebarSection` (uite-te la itemii existenți și copiază structura unui item cu icon din `lucide-react`, ex. `Users`).

Cheie i18n: în namespace-ul folosit de sidebar (identifică-l în layout — probabil `tourDashboard` sau `common`), adaugă `roster`: „Roster"/"Roster".

- [ ] **Step 2: Selectorul de artist în Tour Settings**

În `app/o/[orgSlug]/t/[tourId]/settings/page.tsx`: secțiune nouă „Artist" (doar `manage_tours`) — select cu artiștii activi ai org-ului (aceeași interogare ca în Task 2 Step 6), valoarea curentă `tour.artist_id`, submit către acțiunea nouă în fișierul de acțiuni al paginii (urmează convenția existentă acolo — probabil `actions.ts` lângă pagină):

```typescript
export async function updateTourArtist(
  orgSlug: string,
  tourId: string,
  artistId: string,
): Promise<{ error?: string }> {
  const { supabase, permission, tier } = await requireOrg(orgSlug);
  if (!can({ tier, permission }, "manage_tours")) return { error: "forbidden" };
  if (!artistId) return { error: "invalid" };
  const { error } = await supabase
    .from("tours")
    .update({ artist_id: artistId })
    .eq("id", tourId);
  if (error) return { error: error.message };
  revalidatePath(`/o/${orgSlug}/t/${tourId}/settings`);
  return {};
}
```

Chei i18n în `tourSettings`: `artistLabel` („Artist"/"Artist"), `artistHint` („Mutarea turului la alt artist îi schimbă și vizibilitatea."/"Moving the tour to another artist also changes its visibility.").

- [ ] **Step 3: Verifică și commit**

Run: `node scripts/check-i18n.mjs && pnpm exec tsc --noEmit`
Expected: exit 0. Smoke: breadcrumb-ul unui tur arată „{Artist} › {Tur}" cu link funcțional; „Roster" apare în sidebar; schimbarea artistului din Tour Settings mută turul pe pagina celuilalt artist.

```bash
git add "app/o/[orgSlug]/t/[tourId]/layout.tsx" "app/o/[orgSlug]/t/[tourId]/settings" messages/ro.json messages/en.json
git commit -m "feat: navigare artist — breadcrumb, Roster în sidebar, reasignare tur

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 8: Verificare finală

**Files:**
- Niciun fișier nou; eventuale fix-uri punctuale descoperite aici.

**Interfaces:**
- Consumes: tot ce e mai sus.

- [ ] **Step 1: Suita completă**

Run:
```bash
pnpm vitest run
bash scripts/test-rls.sh
node scripts/check-i18n.mjs
pnpm build
```
Expected: toate exit 0, fără erori de tip sau de build. Fixează orice pică și re-rulează până trece tot.

- [ ] **Step 2: Smoke manual pe flow-urile critice (pnpm dev)**

1. Roster: artistul din backfill apare cu next show corect.
2. Creezi artist nou → profil → poză + culoare + home base.
3. Tur nou cu artistul nou selectat → apare în timeline-ul lui.
4. Restricționezi artistul vechi la un grup → userul de test nu-l mai vede (roster, tur, zi, iCal).
5. Share link de zi existent încă funcționează (public, prin token).
6. Paginile de zi/event/finances neschimbate.

- [ ] **Step 3: Review final de branch**

Invocă `superpowers:requesting-code-review` pe diff-ul complet (main model — schimbare de RLS pe date de producție = risc ridicat).

- [ ] **Step 4: Commit final + notă de deploy**

Deploy-ul (după review): migrările `00025–00027` pe Supabase producție + deploy-ul aplicației, cât mai apropiate în timp (vechiul cod nu poate crea tururi după migrare — fereastră acceptabilă, crearea de tururi e rară). Post-deploy: redenumește artistul auto-creat în numele real din tabul Profil, setează poza/culoarea/home base, creează restul roster-ului.
