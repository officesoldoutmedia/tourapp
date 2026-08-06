# Deal templates — Implementation Plan (C1)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deal templates per artist (fee/basis/withholding/landed/cazare/categorii obligatorii) aplicate cu snapshot pe show-uri: fee-ul intră în P&L, withholding-ul devine linie de cost generată, advancing-ul folosește categoriile deal-ului.

**Architecture:** Spec: `docs/superpowers/specs/2026-08-07-deal-templates-design.md`. Tabelă `deal_templates` (RLS pe pattern-ul `artist_parties` cu `private.artist_org`) + `events.deal_template_id`/`deal_snapshot jsonb`. Acțiune partajată `applyDealToEvent` folosită de wizard și de pagina de costuri; helperi puri în `lib/dealSnapshot.ts`; extindere ADITIVĂ pe `computeProgressOfDays` (`dealRequiredByDay`).

**Tech Stack:** Next.js App Router, Supabase RLS, next-intl, vitest, `scripts/test-rls.sh`.

## Global Constraints

- **Next.js cu breaking changes** — `node_modules/next/dist/docs/`; `params` e Promise.
- **i18n:** chei noi în AMBELE `messages/ro.json` + `messages/en.json`; `node scripts/check-i18n.mjs`.
- **RLS:** teste în `supabase/tests/`, ordine ALFABETICĂ (`faza1d_` între `faza1c_` și `faza2_` — verifică cu `ls`); cleanup fără poluare.
- **Snapshot, nu referință:** consumatorii citesc EXCLUSIV `events.deal_snapshot`; `deal_template_id` e doar proveniență (on delete set null).
- **Withholding:** linia se calculează pe fee-ul EFECTIV din `show_finances` DUPĂ aplicarea/refuzul fee-ului; fee 0/gol → linia NU se creează; upsert pe `generated_key: 'withholding'`, `billable_to_booker: false`.
- **Categorii moarte:** id-urile din snapshot care nu mai există live se IGNORĂ la advancing (nu devin obligatorii nesatisfiabile).
- **Numele deal-urilor:** text liber; sugestiile Zola (Festival/Club/Private/Corporate/Showcase) doar ca chips-uri de quick-add.
- **Deploy:** migrarea `00031` aditivă, fără fereastră de incompatibilitate.
- **Commit-uri:** per pas, `feat:`/`test:`/`fix:` + `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.

---

### Task 1: Migrarea 00031 + test RLS faza1d

**Files:**
- Create: `supabase/migrations/00031_deal_templates.sql`
- Create: `supabase/tests/faza1d_deals_rls.test.sql`

**Interfaces:**
- Produces: tabela `deal_templates` (coloanele din SQL) + `events.deal_template_id uuid` / `events.deal_snapshot jsonb`. Task 2–7 consumă exact aceste nume.

- [ ] **Step 1: Scrie testul (pică fără migrare)**

Creează `supabase/tests/faza1d_deals_rls.test.sql`:

```sql
-- ═══ Faza 1d — deal_templates (C1): template per artist + snapshot pe event ═══
-- Rulează DUPĂ faza1c (alfabetic: faza1c < faza1d < faza2).
-- Refolosește org/userii din faza0, artistul 'speak' și event-urile din faza2?
-- NU — faza2 rulează DUPĂ; folosim doar artistul din faza1. Cleanup: hard
-- delete pe rândurile proprii (fără copii).
\set ON_ERROR_STOP on

select id as org_id from public.organizations limit 1 \gset

select set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-00000000000a"}', false);
set role authenticated;

select id as artist_id from public.artists where slug = 'speak' \gset

-- ── Admin creează template ──
insert into public.deal_templates
  (organization_id, artist_id, name, fee_amount, fee_currency, deal_basis,
   withholding_percent, landed_items, accommodation, required_category_ids, created_by)
values
  (:'org_id', :'artist_id', 'Festival TEST', 3500, 'EUR', 'landed',
   5, '["SFX","Backline"]'::jsonb, '{"rooms_single":2,"nights":1}'::jsonb,
   '{}'::uuid[], 'a0000000-0000-0000-0000-00000000000a')
returning id as dt_id \gset
\echo 'PASS: admin creeaza deal template'

-- ── Org mismatch respins (with-check pe artist_org) ──
do $$ declare aid uuid; begin
  select id into aid from public.artists where slug = 'speak';
  begin
    insert into public.deal_templates (organization_id, artist_id, name)
    values (gen_random_uuid(), aid, 'CROSS');
    raise exception 'FAIL: org mismatch acceptat';
  exception when others then
    if sqlerrm like 'FAIL%' then raise; end if;
  end;
end $$;
\echo 'PASS: organization_id legat de artist_org (mismatch respins)'

-- ── Crew citește, nu scrie ──
select set_config('request.jwt.claims', '{"sub":"c0000000-0000-0000-0000-00000000000c"}', false);
do $$ begin
  if not exists (select 1 from public.deal_templates where name = 'Festival TEST') then
    raise exception 'FAIL: crew nu vede template-ul';
  end if;
end $$;
do $$ declare aid uuid; oid uuid; begin
  select artist_id, organization_id into aid, oid from public.deal_templates limit 1;
  begin
    insert into public.deal_templates (organization_id, artist_id, name)
    values (oid, aid, 'HACK');
    raise exception 'FAIL: crew a creat template';
  exception when others then
    if sqlerrm like 'FAIL%' then raise; end if;
  end;
end $$;
\echo 'PASS: crew read-only pe deal templates'

-- ── Restricția pe artist cascadează ──
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-00000000000a"}', false);
insert into public.visibility_rules
  (organization_id, subject_type, subject_id, target_type, target_id, created_by)
values
  (:'org_id', 'artist', :'artist_id', 'user',
   'a0000000-0000-0000-0000-00000000000a', 'a0000000-0000-0000-0000-00000000000a');

select set_config('request.jwt.claims', '{"sub":"c0000000-0000-0000-0000-00000000000c"}', false);
do $$ begin
  if exists (select 1 from public.deal_templates) then
    raise exception 'FAIL: cascada artist -> deal_templates nu functioneaza';
  end if;
end $$;
\echo 'PASS: restrictia pe artist ascunde deal templates'

-- ── Cleanup ──
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-00000000000a"}', false);
delete from public.visibility_rules
  where subject_type = 'artist' and subject_id = :'artist_id';
delete from public.deal_templates where id = :'dt_id';

reset role;
```

- [ ] **Step 2: Rulează — pică**

Run: `bash scripts/test-rls.sh`
Expected: FAIL la faza1d cu `relation "public.deal_templates" does not exist`.

- [ ] **Step 3: Scrie migrarea**

Creează `supabase/migrations/00031_deal_templates.sql`:

```sql
-- ═══════════════════════════════════════════════════════════════════
-- C1 — deal templates per artist. Spec:
-- docs/superpowers/specs/2026-08-07-deal-templates-design.md
-- Snapshot pe event la aplicare — template-ul modificat NU schimbă
-- retroactiv show-urile (regula casei, ca la tour_parties).
-- ═══════════════════════════════════════════════════════════════════

create table public.deal_templates (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  deleted_at timestamptz,
  organization_id uuid not null references public.organizations on delete cascade,
  artist_id uuid not null references public.artists on delete cascade,
  name text not null,
  fee_amount numeric,
  fee_currency text,
  deal_basis text check (deal_basis in ('landed', 'all_in', 'fee_plus_costs')),
  withholding_percent numeric,
  landed_items jsonb not null default '[]'::jsonb,
  accommodation jsonb not null default '{}'::jsonb,
  required_category_ids uuid[] not null default '{}',  -- §10.4, per deal type
  sort_order integer not null default 0,
  created_by uuid references auth.users
);
create index deal_templates_artist_idx on public.deal_templates (artist_id);
create trigger set_updated_at before update on public.deal_templates
  for each row execute function public.set_updated_at();

alter table public.deal_templates enable row level security;

create policy deal_templates_select on public.deal_templates
  for select to authenticated
  using (
    (deleted_at is null or private.can_edit_tour_content(organization_id))
    and private.is_org_member(organization_id)
    and private.can_see_subject(organization_id, 'artist', artist_id)
  );
create policy deal_templates_insert on public.deal_templates
  for insert to authenticated
  with check (
    private.can_edit_tour_content(private.artist_org(artist_id))
    and organization_id = private.artist_org(artist_id)
  );
create policy deal_templates_update on public.deal_templates
  for update to authenticated
  using (private.can_edit_tour_content(private.artist_org(artist_id)))
  with check (
    private.can_edit_tour_content(private.artist_org(artist_id))
    and organization_id = private.artist_org(artist_id)
  );
create policy deal_templates_delete on public.deal_templates
  for delete to authenticated
  using (private.can_edit_tour_content(private.artist_org(artist_id)));

-- ── Snapshot pe event ───────────────────────────────────────────────
alter table public.events
  add column deal_template_id uuid references public.deal_templates on delete set null,
  add column deal_snapshot jsonb;
```

- [ ] **Step 4: Rulează — trece tot; commit**

Run: `bash scripts/test-rls.sh` → toate PASS, exit 0.

```bash
git add supabase/migrations/00031_deal_templates.sql supabase/tests/faza1d_deals_rls.test.sql
git commit -m "feat: deal_templates per artist + snapshot pe events

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: lib/dealSnapshot.ts + extinderea computeProgressOfDays (TDD)

**Files:**
- Create: `lib/dealSnapshot.ts` + `lib/dealSnapshot.test.ts`
- Modify: `lib/advanceProgressData.ts` + `lib/advanceProgressData.test.ts`

**Interfaces:**
- Produces (consumate de Task 4–7):
  - `interface DealSnapshot { name: string; fee_amount: number | null; fee_currency: string | null; deal_basis: string | null; withholding_percent: number | null; landed_items: string[]; accommodation: { rooms_single?: number; rooms_double?: number; category?: string; nights?: number }; required_category_ids: string[] }`
  - `buildDealSnapshot(template: DealTemplateRow): DealSnapshot` (normalizează null-urile, filtrează non-stringuri din landed_items)
  - `requiredCategoriesForDay(snapshots: (DealSnapshot | null)[], liveCategoryIds: ReadonlySet<string>): string[] | null` — uniunea listelor ne-goale ∩ live; `null` = niciun snapshot cu listă → fallback org
  - `withholdingLine(percent: number, fee: number, currency: string): { key: "withholding"; label: string; amount: number; currency: string } | null` — null la percent/fee ≤ 0; label `Impozit reținut {p}% — {amount} {currency}`
  - `parseDealSnapshot(value: unknown): DealSnapshot | null` — validare defensivă la citirea jsonb-ului
  - `ComputeProgressOfDaysInput` + câmp opțional `dealRequiredByDay?: ReadonlyMap<string, string[]>` — zilele prezente în map folosesc lista respectivă ÎN LOC de `requiredCategoryIds` (org); zilele absente = comportament vechi identic.

- [ ] **Step 1: Testele dealSnapshot (pică)**

Creează `lib/dealSnapshot.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import {
  buildDealSnapshot,
  parseDealSnapshot,
  requiredCategoriesForDay,
  withholdingLine,
} from "./dealSnapshot";

const template = {
  name: "Festival",
  fee_amount: 3500,
  fee_currency: "EUR",
  deal_basis: "landed",
  withholding_percent: 5,
  landed_items: ["SFX", "Backline", 7],
  accommodation: { rooms_single: 2, nights: 1 },
  required_category_ids: ["c1", "c2"],
};

describe("buildDealSnapshot", () => {
  it("copiază câmpurile și filtrează non-stringurile din landed_items", () => {
    const s = buildDealSnapshot(template as never);
    expect(s.landed_items).toEqual(["SFX", "Backline"]);
    expect(s.fee_amount).toBe(3500);
    expect(s.required_category_ids).toEqual(["c1", "c2"]);
  });
});

describe("parseDealSnapshot", () => {
  it("round-trip prin JSON", () => {
    const s = buildDealSnapshot(template as never);
    expect(parseDealSnapshot(JSON.parse(JSON.stringify(s)))).toEqual(s);
  });
  it("null pentru valori invalide", () => {
    expect(parseDealSnapshot(null)).toBeNull();
    expect(parseDealSnapshot("x")).toBeNull();
    expect(parseDealSnapshot({ name: 7 })).toBeNull();
  });
});

describe("requiredCategoriesForDay", () => {
  const live = new Set(["c1", "c3"]);
  it("uniune ∩ live; categoriile moarte se ignoră", () => {
    const a = buildDealSnapshot({ ...template, required_category_ids: ["c1", "c2"] } as never);
    const b = buildDealSnapshot({ ...template, required_category_ids: ["c3"] } as never);
    expect(requiredCategoriesForDay([a, b, null], live)?.sort()).toEqual(["c1", "c3"]);
  });
  it("null când niciun snapshot nu are listă (fallback org)", () => {
    const a = buildDealSnapshot({ ...template, required_category_ids: [] } as never);
    expect(requiredCategoriesForDay([a, null], live)).toBeNull();
  });
  it("listă cu doar categorii moarte → array gol (NU fallback)", () => {
    const a = buildDealSnapshot({ ...template, required_category_ids: ["dead"] } as never);
    expect(requiredCategoriesForDay([a], live)).toEqual([]);
  });
});

describe("withholdingLine", () => {
  it("p% din fee, round2, eticheta și cheia fixă", () => {
    expect(withholdingLine(5, 3500, "EUR")).toEqual({
      key: "withholding",
      label: "Impozit reținut 5% — 175 EUR",
      amount: 175,
      currency: "EUR",
    });
  });
  it("null la percent sau fee ≤ 0", () => {
    expect(withholdingLine(0, 3500, "EUR")).toBeNull();
    expect(withholdingLine(5, 0, "EUR")).toBeNull();
  });
});
```

- [ ] **Step 2: Rulează (FAIL), implementează lib/dealSnapshot.ts**

```typescript
/** Snapshot-ul de deal pe event (C1, spec §1-2). Pur — fără fetch. */

export interface DealSnapshot {
  name: string;
  fee_amount: number | null;
  fee_currency: string | null;
  deal_basis: string | null;
  withholding_percent: number | null;
  landed_items: string[];
  accommodation: {
    rooms_single?: number;
    rooms_double?: number;
    category?: string;
    nights?: number;
  };
  required_category_ids: string[];
}

export interface DealTemplateRow {
  name: string;
  fee_amount: number | null;
  fee_currency: string | null;
  deal_basis: string | null;
  withholding_percent: number | null;
  landed_items: unknown;
  accommodation: unknown;
  required_category_ids: string[] | null;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function buildDealSnapshot(template: DealTemplateRow): DealSnapshot {
  const landed = Array.isArray(template.landed_items)
    ? template.landed_items.filter((x): x is string => typeof x === "string")
    : [];
  const acc =
    template.accommodation && typeof template.accommodation === "object"
      ? (template.accommodation as DealSnapshot["accommodation"])
      : {};
  return {
    name: template.name,
    fee_amount: template.fee_amount != null ? Number(template.fee_amount) : null,
    fee_currency: template.fee_currency ?? null,
    deal_basis: template.deal_basis ?? null,
    withholding_percent:
      template.withholding_percent != null ? Number(template.withholding_percent) : null,
    landed_items: landed,
    accommodation: acc,
    required_category_ids: template.required_category_ids ?? [],
  };
}

export function parseDealSnapshot(value: unknown): DealSnapshot | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  if (typeof v.name !== "string") return null;
  if (!Array.isArray(v.landed_items) || !Array.isArray(v.required_category_ids)) {
    return null;
  }
  return buildDealSnapshot({
    name: v.name,
    fee_amount: typeof v.fee_amount === "number" ? v.fee_amount : null,
    fee_currency: typeof v.fee_currency === "string" ? v.fee_currency : null,
    deal_basis: typeof v.deal_basis === "string" ? v.deal_basis : null,
    withholding_percent:
      typeof v.withholding_percent === "number" ? v.withholding_percent : null,
    landed_items: v.landed_items,
    accommodation: v.accommodation,
    required_category_ids: v.required_category_ids.filter(
      (x): x is string => typeof x === "string",
    ),
  });
}

/** Uniunea listelor ne-goale din snapshot-uri ∩ categoriile live.
 *  null = niciun snapshot nu definește obligatorii → fallback pe org. */
export function requiredCategoriesForDay(
  snapshots: (DealSnapshot | null)[],
  liveCategoryIds: ReadonlySet<string>,
): string[] | null {
  const union = new Set<string>();
  let any = false;
  for (const s of snapshots) {
    if (!s || s.required_category_ids.length === 0) continue;
    any = true;
    for (const id of s.required_category_ids) union.add(id);
  }
  if (!any) return null;
  return [...union].filter((id) => liveCategoryIds.has(id));
}

export function withholdingLine(
  percent: number,
  fee: number,
  currency: string,
): { key: "withholding"; label: string; amount: number; currency: string } | null {
  if (!(percent > 0) || !(fee > 0)) return null;
  const amount = round2((percent / 100) * fee);
  return {
    key: "withholding",
    label: `Impozit reținut ${percent}% — ${amount} ${currency}`,
    amount,
    currency,
  };
}
```

Run: `pnpm vitest run lib/dealSnapshot.test.ts` → PASS.

- [ ] **Step 3: Extinde computeProgressOfDays (test întâi)**

În `lib/advanceProgressData.test.ts` adaugă (folosind fixture-urile existente ale fișierului — citește-le și construiește minim):

```typescript
  it("dealRequiredByDay înlocuiește setul org pentru ziua respectivă", () => {
    // zi show cu categoria org-required c1 nesatisfăcută, dar deal-ul cere doar c2 (satisfăcută)
    const result = computeProgressOfDays({
      days: [{ id: "d1", day_type: "show" }],
      dayOfEvent: new Map([["e1", "d1"]]),
      advanceRows: [],
      fieldValueRows: [],
      fileRows: [
        { id: "f1", parent_id: "d1", category_id: "c2", storage_path: "p",
          status: "final", supersedes_id: null, created_at: "2026-01-01" },
      ],
      requiredCategoryIds: ["c1"],
      dealRequiredByDay: new Map([["d1", ["c2"]]]),
    });
    expect(result.get("d1")).toMatchObject({ done: 1, total: 1 });
  });
  it("zi absentă din dealRequiredByDay → setul org (comportament vechi)", () => {
    const result = computeProgressOfDays({
      days: [{ id: "d1", day_type: "show" }],
      dayOfEvent: new Map(),
      advanceRows: [],
      fieldValueRows: [],
      fileRows: [],
      requiredCategoryIds: ["c1"],
      dealRequiredByDay: new Map(),
    });
    expect(result.get("d1")).toMatchObject({ done: 0, total: 1 });
  });
```

În `lib/advanceProgressData.ts`: `ComputeProgressOfDaysInput` primește `dealRequiredByDay?: ReadonlyMap<string, string[]>`; în bucla per zi, setul de categorii pentru ziua d = `input.dealRequiredByDay?.get(d.id) ?? input.requiredCategoryIds` (aplicat TOT doar pe `day_type === "show"` — regula (a) neschimbată). Run: testele vechi + noile → verzi.

- [ ] **Step 4: Suita + commit**

Run: `pnpm vitest run` → tot verde.

```bash
git add lib/dealSnapshot.ts lib/dealSnapshot.test.ts lib/advanceProgressData.ts lib/advanceProgressData.test.ts
git commit -m "feat: dealSnapshot + advancing per deal type în computeProgressOfDays

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: Tab „Deals" pe profilul artistului

**Files:**
- Create: `app/o/[orgSlug]/a/[artistSlug]/deals/page.tsx`
- Create: `app/o/[orgSlug]/a/[artistSlug]/deals/actions.ts`
- Create: `app/o/[orgSlug]/a/[artistSlug]/deals/deals-client.tsx`
- Modify: `app/o/[orgSlug]/a/[artistSlug]/layout.tsx` (al 4-lea tab)
- Modify: `messages/ro.json`, `messages/en.json` (namespace nou `deals`)

**Interfaces:**
- Consumes: `deal_templates` (Task 1); `ArtistTabs` primește `tabs: ArtistTab[]` din layout; pattern CRUD: `a/[artistSlug]/profile/parties-client.tsx` + acțiunile lui.
- Produces: `saveDealTemplate(orgSlug, artistSlug, artistId, input: { id?: string; name: string; feeAmount: number | null; feeCurrency: string; dealBasis: string | null; withholdingPercent: number | null; landedItems: string[]; accommodation: { rooms_single?: number; rooms_double?: number; category?: string; nights?: number }; requiredCategoryIds: string[] }): Promise<{ error?: string }>`, `deleteDealTemplate(orgSlug, artistSlug, templateId)`, `moveDealTemplate(orgSlug, artistSlug, templateId, direction: "up" | "down")`.

- [ ] **Step 1: Acțiunile**

`deals/actions.ts` — pe structura EXACTĂ a acțiunilor din `profile/actions.ts` (citește-le): `requireManage` local identic; `saveDealTemplate` validează `name` ne-gol, numericele pozitive-sau-null, inserează cu `organization_id: org.id`, `artist_id`, `created_by`, `sort_order` = count nesterse la insert; update pe id la edit; `deleteDealTemplate` = soft-delete; `moveDealTemplate` = swap-ul de sort_order din `moveArtistParty` (copiat, pe `deal_templates`). Toate cu `revalidatePath(`/o/${orgSlug}/a/${artistSlug}/deals`)`.

- [ ] **Step 2: Pagina + clientul**

`deals/page.tsx` (server): rezolvă artistul din slug (pattern-ul celorlalte taburi — citește `profile/page.tsx`), gate `manage_tours` cu redirect la tabul Date, încarcă template-urile (nesterse, `order sort_order, created_at`) + `file_categories` (nesterse, pentru multi-select). `deals-client.tsx` (client): listă de template-uri (nume, fee + valută, basis, withholding, nr. landed items, săgeți, ștergere cu confirm) + formular expandabil de creare/editare cu TOATE câmpurile:
- nume text + rând de chips-uri „Festival / Club / Private / Corporate / Showcase" care completează numele (vizibile doar când lista de template-uri e goală);
- fee (numeric) + valută (select EUR/RON/USD/GBP);
- deal basis: 3 radio (`landed`/`all_in`/`fee_plus_costs`) + opțiunea „—" (null);
- withholding % (numeric);
- landed items: checklist-ul standard `["SFX","Pyro","CO2","Lasers","Confetti","Risers","LED","Backline","Local crew"]` (constantă locală în client) + input de item liber cu Add;
- cazare: numerice single/double/nopți + select categorie („3★"…„5★");
- categorii obligatorii: checkbox-uri din `file_categories`.
Submit → `saveDealTemplate`; erori → toast-ul generic.

- [ ] **Step 3: Tabul + i18n**

În `a/[artistSlug]/layout.tsx`, adaugă în array-ul de tabs: `{ href: `${base}/deals`, label: t("tabDeals") }` (după Profil). Chei i18n — `artist.tabDeals` („Deals"/"Deals") + namespace nou `deals` (ambele limbi):

```json
"deals": {
  "title": "Deal templates",
  "hint": "Se aplică pe show-uri cu snapshot — schimbarea template-ului nu modifică show-urile existente.",
  "nameLabel": "Nume deal",
  "feeLabel": "Fee",
  "basisLabel": "Deal basis",
  "basisLanded": "Landed",
  "basisAllIn": "All-in",
  "basisFeePlusCosts": "Fee + costuri",
  "withholdingLabel": "Reținere la sursă (%)",
  "landedLabel": "Landed items (incluse de organizator)",
  "landedAdd": "Adaugă item",
  "accommodationLabel": "Cazare",
  "roomsSingle": "Camere single",
  "roomsDouble": "Camere double",
  "nights": "Nopți",
  "categoryLabel": "Categorie hotel",
  "requiredLabel": "Fișiere obligatorii pentru tipul ăsta de show",
  "add": "Adaugă template",
  "save": "Salvează",
  "delete": "Șterge",
  "empty": "Niciun template încă. Pornește de la o sugestie:"
}
```

(en: echivalentele — „Deal templates" / „Applied to shows as a snapshot — editing the template never changes existing shows." / „Deal name" / „Fee" / „Deal basis" / „Landed" / „All-in" / „Fee + costs" / „Withholding (%)" / „Landed items (provided by promoter)" / „Add item" / „Accommodation" / „Single rooms" / „Double rooms" / „Nights" / „Hotel category" / „Required files for this show type" / „Add template" / „Save" / „Delete" / „No templates yet. Start from a suggestion:".)

- [ ] **Step 4: Verifică + commit**

Run: `node scripts/check-i18n.mjs && pnpm exec tsc --noEmit && pnpm vitest run` → exit 0.

```bash
git add "app/o/[orgSlug]/a/[artistSlug]" messages/ro.json messages/en.json
git commit -m "feat: tab Deals pe artist — CRUD deal templates

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: Acțiunea partajată applyDealToEvent

**Files:**
- Create: `app/o/[orgSlug]/events/apply-deal.ts`

**Interfaces:**
- Consumes: `buildDealSnapshot`/`withholdingLine` (Task 2), `deal_templates` + `events.deal_*` (Task 1).
- Produces: `applyDealToEvent(orgSlug: string, eventId: string, dealTemplateId: string, opts: { overwriteFee: boolean }): Promise<{ error?: string; feeConflict?: boolean }>` — `feeConflict: true` = există fee manual diferit și `overwriteFee` era false; caller-ul re-cheamă cu `true` după confirmarea userului. Folosită de Task 5 (costs) și Task 6 (wizard, cu `overwriteFee: true` — fee-ul e mereu gol la creare).

- [ ] **Step 1: Implementarea**

```typescript
"use server";

import { requireOrg } from "@/lib/org";
import { can } from "@/lib/permissions";
import { buildDealSnapshot, withholdingLine } from "@/lib/dealSnapshot";

export async function applyDealToEvent(
  orgSlug: string,
  eventId: string,
  dealTemplateId: string,
  opts: { overwriteFee: boolean },
): Promise<{ error?: string; feeConflict?: boolean }> {
  const { supabase, permission, tier, user } = await requireOrg(orgSlug);
  if (!can({ tier, permission }, "edit_accounting")) return { error: "forbidden" };

  const { data: template } = await supabase
    .from("deal_templates")
    .select(
      "id, name, fee_amount, fee_currency, deal_basis, withholding_percent, landed_items, accommodation, required_category_ids",
    )
    .eq("id", dealTemplateId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!template) return { error: "not_found" };

  const snapshot = buildDealSnapshot(template);

  // Fee: doar dacă e gol/zero sau userul a confirmat suprascrierea.
  const { data: finance } = await supabase
    .from("show_finances")
    .select("id, fee, fee_currency")
    .eq("event_id", eventId)
    .maybeSingle();
  const currentFee = Number(finance?.fee ?? 0);
  const templateFee = snapshot.fee_amount ?? 0;

  if (
    currentFee > 0 &&
    templateFee > 0 &&
    currentFee !== templateFee &&
    !opts.overwriteFee
  ) {
    return { feeConflict: true };
  }

  // 1. Snapshot-ul pe event.
  const { error: eventError } = await supabase
    .from("events")
    .update({ deal_template_id: template.id, deal_snapshot: snapshot })
    .eq("id", eventId);
  if (eventError) return { error: eventError.message };

  // 2. Fee (aplicat doar când e cazul).
  let effectiveFee = currentFee;
  let effectiveCurrency = finance?.fee_currency ?? snapshot.fee_currency ?? "EUR";
  if (templateFee > 0 && (currentFee <= 0 || opts.overwriteFee)) {
    effectiveFee = templateFee;
    effectiveCurrency = snapshot.fee_currency ?? effectiveCurrency;
    const payload = { fee: effectiveFee, fee_currency: effectiveCurrency };
    const res = finance?.id
      ? await supabase.from("show_finances").update(payload).eq("id", finance.id)
      : await supabase
          .from("show_finances")
          .insert({ event_id: eventId, ...payload });
    if (res.error) return { error: res.error.message };
  }

  // 3. Withholding pe fee-ul EFECTIV (spec §2 pas 3).
  const line = withholdingLine(
    snapshot.withholding_percent ?? 0,
    effectiveFee,
    effectiveCurrency,
  );
  if (line) {
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
          updated_by: user.id,
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
        billable_to_booker: false,
        updated_by: user.id,
      });
    }
  }
  return {};
}
```

Notă: revalidarea căilor o fac CALLER-ii (au orgSlug/tourId/date în scope); acțiunea rămâne pură pe date. Verifică schema `show_finances` (are `fee`, `fee_currency`, `event_id` — migrarea 00015) înainte de insert.

- [ ] **Step 2: Verifică + commit**

Run: `pnpm exec tsc --noEmit && pnpm vitest run` → exit 0.

```bash
git add "app/o/[orgSlug]/events/apply-deal.ts"
git commit -m "feat: applyDealToEvent — snapshot + fee + withholding partajat

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: Cardul „Deal" pe Costs & profit

**Files:**
- Modify: `app/o/[orgSlug]/t/[tourId]/d/[date]/e/[eventId]/costs/page.tsx`
- Create: `app/o/[orgSlug]/t/[tourId]/d/[date]/e/[eventId]/costs/deal-card-client.tsx`
- Modify: `messages/ro.json`, `messages/en.json` (chei în `showCosts`)

**Interfaces:**
- Consumes: `applyDealToEvent` (Task 4), `parseDealSnapshot` (Task 2); pagina încarcă deja `events` (extinde select-ul cu `deal_template_id, deal_snapshot`), artistul turului (există din SP3a — `artists(...)`; extinde cu `id` dacă lipsește).
- Produces: nimic pentru task-uri ulterioare.

- [ ] **Step 1: Datele**

În `costs/page.tsx`: extinde select-ul de event cu `deal_template_id, deal_snapshot`; încarcă `deal_templates` ale artistului turului (`.eq("artist_id", artistId).is("deleted_at", null).order("sort_order")`, doar `id, name`); parsează snapshot-ul cu `parseDealSnapshot`.

- [ ] **Step 2: Cardul**

`deal-card-client.tsx` (client — are nevoie de confirm pe feeConflict): primește `orgSlug`, `eventId`, `templates: {id,name}[]`, `snapshot: DealSnapshot | null`, `currentTemplateId: string | null`, `canEdit: boolean`, `dayPath: string` (pentru `router.refresh()` după aplicare — folosește `useRouter`). Randare (card între secțiunea de fee și crew, montat din `page.tsx`):
- fără snapshot: label + select de template + buton „Aplică";
- cu snapshot: numele deal-ului + basis (etichetele i18n) + withholding %; **landed items ca pastile** (`bg-fill-control` rounded); cazarea compactă („2×single · 1×double · 4★ · 1 noapte" — omite câmpurile lipsă); selectul + „Re-aplică" (doar `canEdit`).
- La `applyDealToEvent(...)` cu răspuns `feeConflict` → `window.confirm(t("dealFeeConfirm"))` → re-apel cu `overwriteFee: true`. După succes: `router.refresh()`.

- [ ] **Step 3: i18n + verifică + commit**

Chei noi în `showCosts` (ambele limbi): `dealTitle` („Deal"/"Deal"), `dealApply` („Aplică"/"Apply"), `dealReapply` („Re-aplică"/"Re-apply"), `dealFeeConfirm` („Fee-ul introdus manual va fi înlocuit cu cel din template. Continui?"/"The manually entered fee will be replaced by the template fee. Continue?"), `dealBasisLanded` („Landed"/"Landed"), `dealBasisAllIn` („All-in"/"All-in"), `dealBasisFeePlusCosts` („Fee + costuri"/"Fee + costs"), `dealWithholding` („Reținere {p}%"/"Withholding {p}%"), `dealLanded` („Incluse de organizator"/"Provided by promoter"), `dealAccommodation` („Cazare"/"Accommodation"), `dealNone` („Fără deal aplicat"/"No deal applied").

Run: `node scripts/check-i18n.mjs && pnpm exec tsc --noEmit && pnpm vitest run` → exit 0.

```bash
git add "app/o/[orgSlug]/t/[tourId]/d/[date]/e/[eventId]/costs" messages/ro.json messages/en.json
git commit -m "feat: cardul Deal pe Costs & profit — aplicare cu snapshot și confirmare fee

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 6: Selectul „Deal" în wizard-ul Show nou

**Files:**
- Modify: `app/o/[orgSlug]/events/new/page.tsx`
- Modify: `app/o/[orgSlug]/events/new/form.tsx`
- Modify: `app/o/[orgSlug]/events/new/actions.ts`
- Modify: `messages/ro.json`, `messages/en.json` (chei în `newEvent`)

**Interfaces:**
- Consumes: `applyDealToEvent` (Task 4); `createOneOffEvent` + `OneOffPayload` existente.
- Produces: `OneOffPayload` primește `dealTemplateId?: string | null`.

- [ ] **Step 1: Pagina + formularul**

`page.tsx`: încarcă `deal_templates` pentru TOȚI artiștii activi ai org-ului (`id, name, artist_id`, nesterse, ordonate) și paseaz-o formularului. `form.tsx`: select nou „Deal" sub template-ul de advancing, populat cu template-urile artistului SELECTAT (filtrare client-side pe `artist_id`; se golește la schimbarea artistului; opțiunea „—" = fără). Valoarea intră în `payload.dealTemplateId`.

- [ ] **Step 2: Acțiunea**

În `createOneOffEvent`, DUPĂ crearea event-ului și înainte de redirect (lângă pasul de advancing):

```typescript
  if (payload.dealTemplateId) {
    const dealRes = await applyDealToEvent(orgSlug, ev.data.id, payload.dealTemplateId, {
      overwriteFee: true, // event nou — nu există fee manual de protejat
    });
    if (dealRes.error) return { error: dealRes.error };
  }
```

Notă de permisiuni: `applyDealToEvent` cere `edit_accounting`; `createOneOffEvent` cere `manage_tours` — seturile pot diferi (manager fără accounting). Regulă: dacă userul NU are `edit_accounting`, sari pasul de deal silențios NU — mai bine: verifică `can(..., "edit_accounting")` în `createOneOffEvent` înainte de apel; dacă lipsește, aplică doar snapshot-ul pe event (update direct `deal_template_id` + `deal_snapshot`, fără fee/withholding) — deal-ul informativ rămâne, banii îi aplică cineva cu drepturi de pe pagina de costuri („Re-aplică"). Documentează alegerea în cod.

- [ ] **Step 3: i18n + verifică + commit**

Chei în `newEvent` (ambele limbi): `dealLabel` („Deal"/"Deal"), `noDeal` („—"/"—"). Run: `node scripts/check-i18n.mjs && pnpm exec tsc --noEmit && pnpm vitest run` → exit 0.

```bash
git add "app/o/[orgSlug]/events/new" messages/ro.json messages/en.json
git commit -m "feat: selectul Deal în wizard-ul Show nou

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 7: Advancing per deal type — wiring-ul celor 3 pagini

**Files:**
- Modify: `app/o/[orgSlug]/t/[tourId]/d/[date]/page.tsx`
- Modify: `app/o/[orgSlug]/page.tsx`
- Modify: `app/o/[orgSlug]/a/[artistSlug]/page.tsx`

**Interfaces:**
- Consumes: `dealRequiredByDay` pe `computeProgressOfDays` (Task 2), `parseDealSnapshot`/`requiredCategoriesForDay` (Task 2).
- Produces: nimic nou.

- [ ] **Step 1: Wiring**

În fiecare din cele 3 pagini (toate cheamă deja `computeProgressOfDays` — găsește apelurile):
1. Extinde select-ul de `events` cu `deal_snapshot` (day page îl are pe event; dashboard/timeline au `events (id, day_id)` — adaugă coloana).
2. Construiește per zi: `snapshots = events-ai-zilei.map(e => parseDealSnapshot(e.deal_snapshot))`; `liveCategoryIds = new Set(toate file_categories nesterse ale org-ului)` — ATENȚIE: e nevoie de TOATE categoriile live, nu doar cele required; extinde query-ul de categorii unde e filtrat pe `is_required` (dashboard/timeline) să ia toate (`id, is_required`) și derivă `requiredCategoryIds` prin filtrare în memorie.
3. `const deal = requiredCategoriesForDay(snapshots, liveCategoryIds); if (deal !== null) dealRequiredByDay.set(dayId, deal);`
4. Pasează `dealRequiredByDay` în `computeProgressOfDays`.

- [ ] **Step 2: Verifică + commit**

Run: `node scripts/check-i18n.mjs && pnpm exec tsc --noEmit && pnpm vitest run && pnpm build` → exit 0.

```bash
git add "app/o/[orgSlug]/t/[tourId]/d/[date]/page.tsx" "app/o/[orgSlug]/page.tsx" "app/o/[orgSlug]/a/[artistSlug]/page.tsx"
git commit -m "feat: advancing per deal type în cele 3 site-uri de progres

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 8: Verificare finală

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

`superpowers:requesting-code-review` (main model), cu ledger-ul de minors ca input.

- [ ] **Step 3: Merge gate + deploy**

Opțiunile de integrare; după decizia utilizatorului: migrarea `00031` pe producție + `pnpm run deploy` (`pnpm run deploy`, nu `pnpm deploy`; eroarea `color-string` pe exFAT e non-fatală — verifică `/api/version` și retry cu `pnpm install --force` dacă versiunea nu se schimbă). Smoke prin Chrome per spec: template „Festival" pe SPEAK (fee + withholding 5% + categorii obligatorii) → show nou cu deal → fee-ul în P&L + linia de withholding + cardul Deal cu pastile + advancing pe setul template-ului → cleanup complet.
