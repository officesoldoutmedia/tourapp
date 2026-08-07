# Contract Automation (C3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Contract-cadru per entitate juridică + anexa per show generată automat la asignarea pe crew, cu numerotare pe serie, snapshot imutabil, PDF nativ și upload-ul semnatului în categoria Admin.

**Architecture:** 4 tabele noi (`crew_entities`, `issuing_entities`, `contract_templates`, `contract_documents`) — subsistem SEPARAT de `payment_annexes` (neatins). Logica pură (numere în litere, merge fields, umplere) în `lib/numberToWords.ts` + `lib/contractMerge.ts` (TDD). PDF-ul se randează EXCLUSIV din `merge_snapshot` (rută nouă, pattern AnnexPdf). Generarea = server action partajată cu dry-run + listă de lipsuri + increment atomic de serie; auto-hook în `toggleCrew`.

**Tech Stack:** Next.js App Router (breaking changes — `params` sunt Promises), Supabase (RLS pattern 00020 accounting-gate), @react-pdf/renderer (pattern-ul celor 8 rute existente), next-intl (chei în AMBELE `messages/ro.json` + `messages/en.json`), vitest.

## Global Constraints

- `payment_annexes` și tot subsistemul de plăți rămân NEATINSE.
- PDF-ul se randează EXCLUSIV din `contract_documents.merge_snapshot` — editarea template-ului nu schimbă documentele emise. Snapshot-ul are forma exactă `{ title: string, language: string, values: Record<string,string>, blocks: ContractBlock[] }` cu blocurile DEJA umplute la generare.
- `doc_number` e imutabil odată emis; increment atomic pe `contract_templates.series_next` (update…returning); unique `(organization_id, doc_number)` ca race backstop.
- Anti-dublură anexe: partial unique index `(crew_entity_id, event_id) where kind='annex' and status <> 'void' and deleted_at is null`; generarea repetată refolosește documentul viu.
- Regula de blocare: generarea rulează `fillTemplate` dry-run; câmpuri folosite dar goale → refuz cu lista exactă (`missing`), NICIO scriere.
- RLS: `crew_entities` + `contract_documents` = admin/accounting (`has_min_permission(org,'accounting') and is_pro()`, pattern 00020); `issuing_entities` + `contract_templates` = citire membri org, scriere `can_edit_tour_content`.
- Regulile de asignare template: `match_role` (text, match case-insensitive pe `tour_personnel.role`), `match_entity_type` — null = orice; FĂRĂ department la v1.
- Statusuri documente: `generated` / `sent` / `signed` / `void` — nimic altceva.
- Sursa fee-ului anexei: `show_costs` (event+personnel, kind crew, nesters) → fallback `crew_entities.default_rate` → gol (intră în blocare dacă e folosit).
- Semnatul uploadat: storage bucket `attachments`, apoi rând `attachments` pe ZIUA show-ului cu categoria org `Admin` (lookup după nume exact `'Admin'`, nesters) — doar pentru anexe cu event.
- Chei i18n în AMBELE fișiere; verificare `node scripts/check-i18n.mjs`.
- Migrarea `00033_contracts.sql` aditivă; test RLS nou `faza1e_contracts_rls.test.sql` (alfabetic faza1d < faza1e < faza2).
- Merge fields canonice (cheile exacte): `company.name`, `company.cui`, `company.reg_com`, `company.address`, `company.iban`, `company.bank`, `company.rep`, `crew.entity_name`, `crew.cui`, `crew.reg_com`, `crew.address`, `crew.iban`, `crew.bank`, `crew.rep`, `crew.role`, `crew.vat_payer`, `crew.payment_terms`, `crew.id_document`, `event.name`, `event.date`, `event.city`, `event.country`, `event.venue`, `event.stage_time`, `event.artist`, `deal.fee`, `deal.currency`, `deal.fee_in_words`, `doc.number`, `doc.date`, `doc.framework_ref`, `doc.language`.

---

### Task 1: Migrarea 00033 + testul RLS faza1e

**Files:**
- Create: `supabase/migrations/00033_contracts.sql`
- Create: `supabase/tests/faza1e_contracts_rls.test.sql`

**Interfaces:**
- Produces: cele 4 tabele + `tour_personnel.crew_entity_id` — folosite de Task 4–8.

- [ ] **Step 1: Scrie migrarea**

```sql
-- ═══════════════════════════════════════════════════════════════════
-- 00033 — Contract automation (C3, feedback Zola §13): registru juridic
-- org-level, entități emitente, template-uri de contract cu merge
-- fields și documente generate cu snapshot imutabil. Subsistem SEPARAT
-- de payment_annexes (plățile batch rămân neatinse).
-- ═══════════════════════════════════════════════════════════════════

create table public.crew_entities (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  deleted_at timestamptz,
  organization_id uuid not null references public.organizations on delete cascade,
  entity_type text not null default 'srl'
    check (entity_type in ('srl','pfa','ii','individual','foreign')),
  display_name text not null,
  company_name text,
  cui text,
  reg_com text,
  address text,
  representative text,
  iban text,
  bank text,
  vat_payer boolean not null default false,
  fiscal_country text not null default 'RO',
  id_document text,
  default_rate numeric,
  rate_unit text not null default 'per_show' check (rate_unit in ('per_show','per_day')),
  rate_currency text not null default 'EUR',
  payment_terms_days integer,
  doc_language text not null default 'ro' check (doc_language in ('ro','en','bi')),
  created_by uuid references auth.users
);
create index crew_entities_org_idx on public.crew_entities (organization_id);

alter table public.tour_personnel
  add column crew_entity_id uuid references public.crew_entities on delete set null;

create table public.issuing_entities (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  deleted_at timestamptz,
  organization_id uuid not null references public.organizations on delete cascade,
  name text not null,
  cui text,
  reg_com text,
  address text,
  iban text,
  bank text,
  representative text,
  is_default boolean not null default false
);
create index issuing_entities_org_idx on public.issuing_entities (organization_id);

create table public.contract_templates (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  deleted_at timestamptz,
  organization_id uuid not null references public.organizations on delete cascade,
  name text not null,
  doc_kind text not null default 'annex' check (doc_kind in ('framework','annex')),
  body jsonb not null default '[]',
  match_role text,
  match_entity_type text
    check (match_entity_type in ('srl','pfa','ii','individual','foreign')),
  issuing_entity_id uuid references public.issuing_entities on delete set null,
  series_prefix text not null default '',
  series_next integer not null default 1,
  sort_order integer not null default 0
);
create index contract_templates_org_idx on public.contract_templates (organization_id);

create table public.contract_documents (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  deleted_at timestamptz,
  organization_id uuid not null references public.organizations on delete cascade,
  kind text not null check (kind in ('framework','annex')),
  crew_entity_id uuid not null references public.crew_entities on delete cascade,
  template_id uuid references public.contract_templates on delete set null,
  issuing_entity_id uuid references public.issuing_entities on delete set null,
  event_id uuid references public.events on delete set null,
  doc_number text not null,
  merge_snapshot jsonb not null default '{}',
  status text not null default 'generated'
    check (status in ('generated','sent','signed','void')),
  valid_until date,
  signed_storage_path text,
  created_by uuid references auth.users
);
create index contract_documents_entity_idx on public.contract_documents (crew_entity_id);
create index contract_documents_event_idx on public.contract_documents (event_id);
create unique index contract_documents_number_key
  on public.contract_documents (organization_id, doc_number)
  where deleted_at is null;
-- anti-dublură: o singură anexă vie per (entitate, event)
create unique index contract_documents_annex_key
  on public.contract_documents (crew_entity_id, event_id)
  where kind = 'annex' and status <> 'void' and deleted_at is null;

-- seed: prima entitate emitentă din billing-ul existent al org-ului
insert into public.issuing_entities
  (organization_id, name, cui, reg_com, address, iban, bank, representative, is_default)
select o.id,
  coalesce(nullif(o.settings->'billing'->>'name',''), o.name),
  nullif(o.settings->'billing'->>'cui',''),
  nullif(o.settings->'billing'->>'reg_com',''),
  nullif(o.settings->'billing'->>'address',''),
  nullif(o.settings->'billing'->>'iban',''),
  nullif(o.settings->'billing'->>'bank',''),
  nullif(o.settings->'billing'->>'representative',''),
  true
from public.organizations o
where o.settings ? 'billing'
  and coalesce(nullif(o.settings->'billing'->>'name',''), '') <> '';

-- ── RLS ──
alter table public.crew_entities enable row level security;
alter table public.issuing_entities enable row level security;
alter table public.contract_templates enable row level security;
alter table public.contract_documents enable row level security;

-- date financiare → admin/accounting (pattern 00020)
create policy crew_entities_all on public.crew_entities for all
  using (private.has_min_permission(organization_id, 'accounting') and private.is_pro())
  with check (private.has_min_permission(organization_id, 'accounting') and private.is_pro());

create policy contract_documents_all on public.contract_documents for all
  using (private.has_min_permission(organization_id, 'accounting') and private.is_pro())
  with check (private.has_min_permission(organization_id, 'accounting') and private.is_pro());

-- emitenți + template-uri: citire membri, scriere editori de conținut
create policy issuing_entities_select on public.issuing_entities for select
  using (private.is_org_member(organization_id));
create policy issuing_entities_write on public.issuing_entities
  for all using (private.can_edit_tour_content(organization_id))
  with check (private.can_edit_tour_content(organization_id));

create policy contract_templates_select on public.contract_templates for select
  using (private.is_org_member(organization_id));
create policy contract_templates_write on public.contract_templates
  for all using (private.can_edit_tour_content(organization_id))
  with check (private.can_edit_tour_content(organization_id));

comment on table public.contract_documents is
  'C3: documente juridice generate (cadru/anexă). merge_snapshot = tot ce s-a umplut la emitere; PDF-ul se randează EXCLUSIV din snapshot. doc_number imutabil.';
```

Notă: politica `for all` acoperă și select pe Postgres; `issuing_entities`/`contract_templates` au select separat pentru membri + write pentru editori — verifică la test că un membru crew POATE citi template-urile dar NU le poate scrie.

- [ ] **Step 2: Testul RLS**

Scrie `supabase/tests/faza1e_contracts_rls.test.sql` folosind EXACT harness-ul din `supabase/tests/faza1d_deals_rls.test.sql` (citește-l întâi: aceleași helper-uri de seed/impersonare/cleanup, aceeași structură RAISE NOTICE / PASS-FAIL). Aserțiunile obligatorii:
1. admin org creează `crew_entities` + `issuing_entities` + `contract_templates` + `contract_documents` — toate reușesc.
2. membrul cu permisiune accounting citește și scrie `crew_entities` și `contract_documents`.
3. managerul (fără accounting) NU vede `crew_entities` (select gol) și NU poate insera `contract_documents`.
4. crew (viewer) citește `contract_templates` dar insertul e respins; NU vede `crew_entities`.
5. membrul altui org nu vede nimic din cele 4 tabele.
6. unique-ul pe `(organization_id, doc_number)` respinge duplicatul (insert dublu → eroare prinsă și raportată PASS).
Cleanup la final, ca în faza1d.

- [ ] **Step 3: Aplică local + suita**

Run: `supabase db reset && bash scripts/test-rls.sh`
Expected: toate fazele verzi, inclusiv faza1e nouă (`RLS TESTS: OK`).

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/00033_contracts.sql supabase/tests/faza1e_contracts_rls.test.sql
git commit -m "feat: migrarea 00033 — registru juridic, emitenți, template-uri și documente de contract"
```

---

### Task 2: `lib/numberToWords.ts` (TDD)

**Files:**
- Create: `lib/numberToWords.ts`
- Test: `lib/numberToWords.test.ts`

**Interfaces:**
- Produces: `numberToWordsRo(n: number): string`, `numberToWordsEn(n: number): string`, `amountInWords(amount: number, currency: string, lang: "ro" | "en"): string` — consumate de Task 3.

- [ ] **Step 1: Testele (failing)**

```ts
// lib/numberToWords.test.ts
import { describe, expect, it } from "vitest";
import { amountInWords, numberToWordsEn, numberToWordsRo } from "./numberToWords";

describe("numberToWordsRo", () => {
  it.each([
    [0, "zero"],
    [1, "unu"],
    [5, "cinci"],
    [12, "doisprezece"],
    [19, "nouăsprezece"],
    [20, "douăzeci"],
    [21, "douăzeci și unu"],
    [100, "o sută"],
    [101, "o sută unu"],
    [235, "două sute treizeci și cinci"],
    [1000, "o mie"],
    [2000, "două mii"],
    [3500, "trei mii cinci sute"],
    [21000, "douăzeci și una de mii"],
    [100000, "o sută de mii"],
    [1000000, "un milion"],
    [2500000, "două milioane cinci sute de mii"],
  ])("%i → %s", (n, expected) => {
    expect(numberToWordsRo(n)).toBe(expected);
  });
});

describe("numberToWordsEn", () => {
  it.each([
    [0, "zero"],
    [21, "twenty-one"],
    [100, "one hundred"],
    [3500, "three thousand five hundred"],
    [1000000, "one million"],
  ])("%i → %s", (n, expected) => {
    expect(numberToWordsEn(n)).toBe(expected);
  });
});

describe("amountInWords", () => {
  it("RON cu bani", () => {
    expect(amountInWords(1234.56, "RON", "ro")).toBe(
      "o mie două sute treizeci și patru lei și cincizeci și șase de bani",
    );
  });
  it("EUR întreg", () => {
    expect(amountInWords(3500, "EUR", "ro")).toBe("trei mii cinci sute euro");
  });
  it("USD engleză", () => {
    expect(amountInWords(3500.5, "USD", "en")).toBe(
      "three thousand five hundred dollars and fifty cents",
    );
  });
  it("valută necunoscută → codul", () => {
    expect(amountInWords(10, "GBP", "ro")).toBe("zece GBP");
  });
});
```

- [ ] **Step 2: Rulează — FAIL** (`npx vitest run lib/numberToWords.test.ts`)

- [ ] **Step 3: Implementarea**

```ts
// lib/numberToWords.ts
/** C3 §13.5 — suma în litere, obligatorie în contractele RO. */

const RO_UNITS = ["zero", "unu", "doi", "trei", "patru", "cinci", "șase", "șapte", "opt", "nouă"];
const RO_TEENS = ["zece", "unsprezece", "doisprezece", "treisprezece", "paisprezece",
  "cincisprezece", "șaisprezece", "șaptesprezece", "optsprezece", "nouăsprezece"];
const RO_TENS = ["", "", "douăzeci", "treizeci", "patruzeci", "cincizeci",
  "șaizeci", "șaptezeci", "optzeci", "nouăzeci"];
// forma feminină pt. acordul cu „mie/mii": 1 → una, 2 → două
const RO_FEM: Record<string, string> = { unu: "una", doi: "două" };

function roUnder100(n: number, feminine: boolean): string {
  if (n < 10) {
    const w = RO_UNITS[n];
    return feminine ? (RO_FEM[w] ?? w) : w;
  }
  if (n < 20) return RO_TEENS[n - 10];
  const tens = RO_TENS[Math.floor(n / 10)];
  const rest = n % 10;
  if (!rest) return tens;
  const w = RO_UNITS[rest];
  return `${tens} și ${feminine ? (RO_FEM[w] ?? w) : w}`;
}

function roUnder1000(n: number, feminine: boolean): string {
  if (n < 100) return roUnder100(n, feminine);
  const h = Math.floor(n / 100);
  const hundreds = h === 1 ? "o sută" : h === 2 ? "două sute" : `${RO_UNITS[h]} sute`;
  const rest = n % 100;
  return rest ? `${hundreds} ${roUnder100(rest, feminine)}` : hundreds;
}

/** „de" apare când numărul dinaintea scalei NU se termină în 1–19 (ex. „douăzeci de mii"). */
function roNeedsDe(n: number): boolean {
  const last = n % 100;
  return !(last >= 1 && last <= 19);
}

export function numberToWordsRo(n: number): string {
  const v = Math.floor(Math.abs(n));
  if (v === 0) return "zero";
  const parts: string[] = [];
  const millions = Math.floor(v / 1_000_000);
  const thousands = Math.floor((v % 1_000_000) / 1000);
  const rest = v % 1000;
  if (millions) {
    // neutru: pluralul ia forma feminină („două milioane")
    if (millions === 1) parts.push("un milion");
    else parts.push(`${roUnder1000(millions, true)}${roNeedsDe(millions) ? " de" : ""} milioane`);
  }
  if (thousands) {
    if (thousands === 1) parts.push("o mie");
    else parts.push(`${roUnder1000(thousands, true)}${roNeedsDe(thousands) ? " de" : ""} mii`);
  }
  if (rest) parts.push(roUnder1000(rest, false));
  return parts.join(" ");
}

const EN_UNITS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine",
  "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen",
  "eighteen", "nineteen"];
const EN_TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];

function enUnder1000(n: number): string {
  if (n < 20) return EN_UNITS[n];
  if (n < 100) {
    const t = EN_TENS[Math.floor(n / 10)];
    return n % 10 ? `${t}-${EN_UNITS[n % 10]}` : t;
  }
  const rest = n % 100;
  return `${EN_UNITS[Math.floor(n / 100)]} hundred${rest ? ` ${enUnder1000(rest)}` : ""}`;
}

export function numberToWordsEn(n: number): string {
  const v = Math.floor(Math.abs(n));
  if (v === 0) return "zero";
  const parts: string[] = [];
  const millions = Math.floor(v / 1_000_000);
  const thousands = Math.floor((v % 1_000_000) / 1000);
  const rest = v % 1000;
  if (millions) parts.push(`${enUnder1000(millions)} million`);
  if (thousands) parts.push(`${enUnder1000(thousands)} thousand`);
  if (rest) parts.push(enUnder1000(rest));
  return parts.join(" ");
}

const CURRENCY_WORDS: Record<string, { ro: [string, string]; en: [string, string] }> = {
  RON: { ro: ["lei", "bani"], en: ["lei", "bani"] },
  EUR: { ro: ["euro", "eurocenți"], en: ["euros", "cents"] },
  USD: { ro: ["dolari", "cenți"], en: ["dollars", "cents"] },
};

export function amountInWords(
  amount: number,
  currency: string,
  lang: "ro" | "en",
): string {
  const words = lang === "ro" ? numberToWordsRo : numberToWordsEn;
  const whole = Math.floor(Math.abs(amount));
  const cents = Math.round((Math.abs(amount) - whole) * 100);
  const cw = CURRENCY_WORDS[currency.toUpperCase()];
  const main = `${words(whole)} ${cw ? cw[lang][0] : currency.toUpperCase()}`;
  if (!cents) return main;
  const centsWord = cw ? cw[lang][1] : "";
  if (lang === "ro") {
    // „cincizeci și șase de bani" — regula lui „de" ca la scale
    const de = roNeedsDe(cents) ? " de" : "";
    return `${main} și ${words(cents)}${de} ${centsWord}`.trim();
  }
  return `${main} and ${words(cents)} ${centsWord}`.trim();
}
```

- [ ] **Step 4: Rulează — PASS**, apoi `npx vitest run` (toată suita verde).

- [ ] **Step 5: Commit**

```bash
git add lib/numberToWords.ts lib/numberToWords.test.ts
git commit -m "feat: lib/numberToWords — sume în litere RO/EN (TDD)"
```

---

### Task 3: `lib/contractMerge.ts` (TDD)

**Files:**
- Create: `lib/contractMerge.ts`
- Test: `lib/contractMerge.test.ts`

**Interfaces:**
- Consumes (Task 2): `amountInWords`.
- Produces (folosite de Task 4–8):
  - `ContractBlock = { kind: "heading" | "paragraph"; text: string }`
  - `MergeValues = Record<string, string>`
  - `ContractSnapshot = { title: string; language: string; values: MergeValues; blocks: ContractBlock[] }`
  - `MERGE_FIELD_KEYS: readonly string[]` (lista canonică din Global Constraints)
  - `listMergeFields(body: ContractBlock[]): string[]`
  - `fillTemplate(body: ContractBlock[], values: MergeValues): { blocks: ContractBlock[]; unresolved: string[] }`
  - `findMatchingTemplate<T extends MatchableTemplate>(templates, kind, role, entityType): T | null` + `MatchableTemplate` (pur — folosit de Task 6 server-side și Task 7/8 client-side)
  - `parseContractSnapshot(value: unknown): ContractSnapshot | null`
  - `collectMergeValues(input: CollectInput): MergeValues` unde `CollectInput = { issuing: { name?..., cui?..., reg_com?..., address?..., iban?..., bank?..., representative?... } | null; entity: { display_name, company_name?, cui?, reg_com?, address?, iban?, bank?, representative?, vat_payer, payment_terms_days?, id_document?, entity_type } | null; role: string | null; event: { name?, date?, city?, country?, venue?, stage_time?, artist? } | null; fee: { amount: number | null; currency: string | null } ; doc: { number: string; date: string; frameworkRef: string | null; language: "ro" | "en" | "bi" } }`

- [ ] **Step 1: Testele (failing)**

```ts
// lib/contractMerge.test.ts
import { describe, expect, it } from "vitest";
import {
  collectMergeValues,
  fillTemplate,
  findMatchingTemplate,
  listMergeFields,
  MERGE_FIELD_KEYS,
  parseContractSnapshot,
  type ContractBlock,
} from "./contractMerge";

const BODY: ContractBlock[] = [
  { kind: "heading", text: "ANEXA {{doc.number}}" },
  { kind: "paragraph", text: "{{crew.entity_name}} (CUI {{crew.cui}}) prestează la {{event.city}} pe {{event.date}} pentru {{deal.fee}} {{deal.currency}} ({{deal.fee_in_words}})." },
];

describe("listMergeFields", () => {
  it("extrage cheile unice în ordinea apariției", () => {
    expect(listMergeFields(BODY)).toEqual([
      "doc.number", "crew.entity_name", "crew.cui", "event.city",
      "event.date", "deal.fee", "deal.currency", "deal.fee_in_words",
    ]);
  });
});

describe("fillTemplate", () => {
  it("umple tot când valorile există", () => {
    const values = Object.fromEntries(listMergeFields(BODY).map((k) => [k, "X"]));
    const { blocks, unresolved } = fillTemplate(BODY, values);
    expect(unresolved).toEqual([]);
    expect(blocks[0].text).toBe("ANEXA X");
    expect(blocks[1].text).not.toContain("{{");
  });
  it("raportează câmpurile goale/lipsă și le lasă gol în text", () => {
    const { blocks, unresolved } = fillTemplate(BODY, { "doc.number": "ANX-1", "crew.cui": "" });
    expect(unresolved).toEqual([
      "crew.entity_name", "crew.cui", "event.city",
      "event.date", "deal.fee", "deal.currency", "deal.fee_in_words",
    ]);
    expect(blocks[0].text).toBe("ANEXA ANX-1");
    expect(blocks[1].text).not.toContain("{{");
  });
  it("cheile necunoscute din body sunt și ele unresolved", () => {
    const { unresolved } = fillTemplate(
      [{ kind: "paragraph", text: "{{foo.bar}}" }], {},
    );
    expect(unresolved).toEqual(["foo.bar"]);
  });
});

describe("collectMergeValues", () => {
  const input = {
    issuing: { name: "ARTPROCESS", cui: "RO123", representative: "Pop Ion" },
    entity: {
      display_name: "Visuals Co", company_name: "VISUALS CO SRL", cui: "RO999",
      vat_payer: true, payment_terms_days: 15, entity_type: "srl",
    },
    role: "VJ",
    event: { date: "2026-09-20", city: "Cluj-Napoca", artist: "SPEAK", venue: "Arena" },
    fee: { amount: 3500, currency: "EUR" },
    doc: { number: "ANX-2026-0042", date: "2026-08-07", frameworkRef: "CTR-2026-0003", language: "ro" as const },
  };
  it("construiește dicționarul", () => {
    const v = collectMergeValues(input);
    expect(v["company.name"]).toBe("ARTPROCESS");
    expect(v["crew.entity_name"]).toBe("VISUALS CO SRL");
    expect(v["crew.role"]).toBe("VJ");
    expect(v["crew.vat_payer"]).toBe("DA");
    expect(v["crew.payment_terms"]).toBe("15");
    expect(v["deal.fee"]).toBe("3500");
    expect(v["deal.fee_in_words"]).toBe("trei mii cinci sute euro");
    expect(v["doc.framework_ref"]).toBe("CTR-2026-0003");
    expect(v["event.stage_time"]).toBe("");
  });
  it("PF fără company_name → display_name; en → vat YES/NO", () => {
    const v = collectMergeValues({
      ...input,
      entity: { display_name: "Coman A.", vat_payer: false, entity_type: "individual" },
      doc: { ...input.doc, language: "en" as const },
    });
    expect(v["crew.entity_name"]).toBe("Coman A.");
    expect(v["crew.vat_payer"]).toBe("NO");
    expect(v["deal.fee_in_words"]).toBe("three thousand five hundred euros");
  });
  it("toate cheile canonice există în dicționar (măcar goale)", () => {
    const v = collectMergeValues(input);
    for (const key of MERGE_FIELD_KEYS) expect(v).toHaveProperty(key);
  });
});
```

- [ ] **Step 2: Rulează — FAIL**

- [ ] **Step 3: Implementarea**

```ts
// lib/contractMerge.ts
/** C3 — merge fields (§13.5), umplerea template-urilor și dry-run-ul de
 *  blocare. PDF-ul se randează EXCLUSIV din snapshot (regula casei). */
import { amountInWords } from "./numberToWords";

export interface ContractBlock {
  kind: "heading" | "paragraph";
  text: string;
}
export type MergeValues = Record<string, string>;
export interface ContractSnapshot {
  title: string;
  language: string;
  values: MergeValues;
  blocks: ContractBlock[];
}

export const MERGE_FIELD_KEYS = [
  "company.name", "company.cui", "company.reg_com", "company.address",
  "company.iban", "company.bank", "company.rep",
  "crew.entity_name", "crew.cui", "crew.reg_com", "crew.address",
  "crew.iban", "crew.bank", "crew.rep", "crew.role", "crew.vat_payer",
  "crew.payment_terms", "crew.id_document",
  "event.name", "event.date", "event.city", "event.country",
  "event.venue", "event.stage_time", "event.artist",
  "deal.fee", "deal.currency", "deal.fee_in_words",
  "doc.number", "doc.date", "doc.framework_ref", "doc.language",
] as const;

const FIELD_RE = /\{\{\s*([a-z_]+\.[a-z_]+)\s*\}\}/g;

export function listMergeFields(body: ContractBlock[]): string[] {
  const seen: string[] = [];
  for (const block of body) {
    for (const match of block.text.matchAll(FIELD_RE)) {
      if (!seen.includes(match[1])) seen.push(match[1]);
    }
  }
  return seen;
}

export function fillTemplate(
  body: ContractBlock[],
  values: MergeValues,
): { blocks: ContractBlock[]; unresolved: string[] } {
  const unresolved: string[] = [];
  const blocks = body.map((block) => ({
    kind: block.kind,
    text: block.text.replace(FIELD_RE, (_, key: string) => {
      const value = values[key] ?? "";
      if (!value && !unresolved.includes(key)) unresolved.push(key);
      return value;
    }),
  }));
  return { blocks, unresolved };
}

export interface CollectInput {
  issuing: {
    name?: string | null; cui?: string | null; reg_com?: string | null;
    address?: string | null; iban?: string | null; bank?: string | null;
    representative?: string | null;
  } | null;
  entity: {
    display_name: string; company_name?: string | null; cui?: string | null;
    reg_com?: string | null; address?: string | null; iban?: string | null;
    bank?: string | null; representative?: string | null; vat_payer: boolean;
    payment_terms_days?: number | null; id_document?: string | null;
    entity_type: string;
  } | null;
  role: string | null;
  event: {
    name?: string | null; date?: string | null; city?: string | null;
    country?: string | null; venue?: string | null; stage_time?: string | null;
    artist?: string | null;
  } | null;
  fee: { amount: number | null; currency: string | null };
  doc: {
    number: string; date: string; frameworkRef: string | null;
    language: "ro" | "en" | "bi";
  };
}

const s = (v: string | number | null | undefined): string =>
  v == null ? "" : String(v);

export function collectMergeValues(input: CollectInput): MergeValues {
  const lang = input.doc.language === "en" ? "en" : "ro";
  const yes = lang === "en" ? "YES" : "DA";
  const no = lang === "en" ? "NO" : "NU";
  const feeWords =
    input.fee.amount != null && input.fee.currency
      ? amountInWords(input.fee.amount, input.fee.currency, lang)
      : "";
  const values: MergeValues = {
    "company.name": s(input.issuing?.name),
    "company.cui": s(input.issuing?.cui),
    "company.reg_com": s(input.issuing?.reg_com),
    "company.address": s(input.issuing?.address),
    "company.iban": s(input.issuing?.iban),
    "company.bank": s(input.issuing?.bank),
    "company.rep": s(input.issuing?.representative),
    "crew.entity_name": s(input.entity?.company_name || input.entity?.display_name),
    "crew.cui": s(input.entity?.cui),
    "crew.reg_com": s(input.entity?.reg_com),
    "crew.address": s(input.entity?.address),
    "crew.iban": s(input.entity?.iban),
    "crew.bank": s(input.entity?.bank),
    "crew.rep": s(input.entity?.representative || input.entity?.display_name),
    "crew.role": s(input.role),
    "crew.vat_payer": input.entity ? (input.entity.vat_payer ? yes : no) : "",
    "crew.payment_terms": s(input.entity?.payment_terms_days),
    "crew.id_document": s(input.entity?.id_document),
    "event.name": s(input.event?.name),
    "event.date": s(input.event?.date),
    "event.city": s(input.event?.city),
    "event.country": s(input.event?.country),
    "event.venue": s(input.event?.venue),
    "event.stage_time": s(input.event?.stage_time),
    "event.artist": s(input.event?.artist),
    "deal.fee": input.fee.amount != null ? String(input.fee.amount) : "",
    "deal.currency": s(input.fee.currency),
    "deal.fee_in_words": feeWords,
    "doc.number": input.doc.number,
    "doc.date": input.doc.date,
    "doc.framework_ref": s(input.doc.frameworkRef),
    "doc.language": input.doc.language,
  };
  return values;
}

/** Regulile de asignare §13.4: primul template viu cu kind egal, match pe
 *  rol (null = orice; case-insensitive) și tip entitate (null = orice),
 *  în ordinea sort_order. Pur — folosit și server-side (auto-hook) și
 *  client-side (pre-selecție în UI). */
export interface MatchableTemplate {
  id: string;
  doc_kind: string;
  match_role: string | null;
  match_entity_type: string | null;
  sort_order: number;
}
export function findMatchingTemplate<T extends MatchableTemplate>(
  templates: T[],
  kind: string,
  role: string | null,
  entityType: string,
): T | null {
  return (
    templates
      .filter((t) => t.doc_kind === kind)
      .filter(
        (t) =>
          !t.match_role ||
          (role ?? "").trim().toLowerCase() === t.match_role.trim().toLowerCase(),
      )
      .filter((t) => !t.match_entity_type || t.match_entity_type === entityType)
      .sort((a, b) => a.sort_order - b.sort_order)[0] ?? null
  );
}

/** Parsează defensiv un snapshot din jsonb. */
export function parseContractSnapshot(value: unknown): ContractSnapshot | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  if (typeof v.title !== "string" || !Array.isArray(v.blocks)) return null;
  return {
    title: v.title,
    language: typeof v.language === "string" ? v.language : "ro",
    values: (v.values && typeof v.values === "object" ? v.values : {}) as MergeValues,
    blocks: (v.blocks as ContractBlock[]).filter(
      (b) => b && typeof b.text === "string" && (b.kind === "heading" || b.kind === "paragraph"),
    ),
  };
}
```

Adaugă și un test pentru `parseContractSnapshot` (valid → obiect; null/array/random → null; blocuri corupte filtrate):

```ts
describe("findMatchingTemplate", () => {
  const T = (over: object) => ({
    id: "x", doc_kind: "annex", match_role: null,
    match_entity_type: null, sort_order: 0, ...over,
  });
  it("match pe rol case-insensitive + tip entitate; null = orice; ordinea sort_order", () => {
    const specific = T({ id: "s", match_role: "vj", match_entity_type: "srl", sort_order: 1 });
    const generic = T({ id: "g", sort_order: 2 });
    expect(findMatchingTemplate([generic, specific], "annex", "VJ", "srl")?.id).toBe("s");
    expect(findMatchingTemplate([generic, specific], "annex", "LD", "srl")?.id).toBe("g");
    expect(findMatchingTemplate([specific], "annex", "VJ", "pfa")).toBeNull();
    expect(findMatchingTemplate([specific], "framework", "VJ", "srl")).toBeNull();
  });
});

describe("parseContractSnapshot", () => {
  it("round-trip valid", () => {
    const snap = { title: "T", language: "ro", values: { a: "1" }, blocks: BODY };
    expect(parseContractSnapshot(snap)).toEqual(snap);
  });
  it("invalid → null; blocuri corupte filtrate", () => {
    expect(parseContractSnapshot(null)).toBeNull();
    expect(parseContractSnapshot([])).toBeNull();
    expect(
      parseContractSnapshot({ title: "T", blocks: [{ kind: "x", text: "a" }, BODY[0]] })!.blocks,
    ).toEqual([BODY[0]]);
  });
});
```

(cu importul `parseContractSnapshot` adăugat)

- [ ] **Step 4: Rulează — PASS**, apoi toată suita.

- [ ] **Step 5: Commit**

```bash
git add lib/contractMerge.ts lib/contractMerge.test.ts
git commit -m "feat: lib/contractMerge — merge fields, umplere, dry-run, snapshot (TDD)"
```

---

### Task 4: PDF-ul de contract

**Files:**
- Create: `pdf/ContractPdf.tsx`
- Create: `app/api/pdf/contract/[documentId]/route.ts`

**Interfaces:**
- Consumes (Task 3): `ContractSnapshot`, `parseContractSnapshot`; (Task 1) `contract_documents`.
- Produces: ruta `GET /api/pdf/contract/{documentId}` — folosită de Task 7 și 8 ca link de download.

- [ ] **Step 1: Componenta PDF**

```tsx
// pdf/ContractPdf.tsx
/** C3 — PDF-ul documentelor de contract (cadru/anexă), randat EXCLUSIV
 *  din merge_snapshot (blocurile sunt deja umplute la generare). */
import {
  Document,
  Page,
  StyleSheet,
  Text,
  View,
  renderToBuffer,
} from "@react-pdf/renderer";
import { ensurePdfFonts } from "./fonts";
import type { ContractSnapshot } from "@/lib/contractMerge";

ensurePdfFonts();

const styles = StyleSheet.create({
  page: { padding: 52, fontFamily: "Inter", fontSize: 10, lineHeight: 1.6 },
  docNumber: { fontSize: 9, color: "#555", textAlign: "right", marginBottom: 12 },
  title: { fontSize: 14, fontWeight: 700, textAlign: "center", marginBottom: 4 },
  date: { fontSize: 9, color: "#555", textAlign: "center", marginBottom: 24 },
  heading: { fontSize: 11, fontWeight: 700, marginTop: 16, marginBottom: 6 },
  paragraph: { marginBottom: 8, textAlign: "justify" },
  signatures: { flexDirection: "row", gap: 48, marginTop: 56 },
  signBox: { flex: 1, textAlign: "center" },
  signLine: {
    borderTopWidth: 0.5,
    borderTopColor: "#000",
    marginTop: 40,
    paddingTop: 6,
    fontSize: 9,
  },
});

const SIGN_LABELS = {
  ro: ["BENEFICIAR", "PRESTATOR"],
  en: ["CLIENT", "PROVIDER"],
} as const;

export async function buildContractPdf(input: {
  docNumber: string;
  docDate: string;
  snapshot: ContractSnapshot;
}): Promise<Buffer> {
  const lang = input.snapshot.language === "en" ? "en" : "ro";
  const [payerLabel, payeeLabel] = SIGN_LABELS[lang];
  const values = input.snapshot.values;

  const doc = (
    <Document>
      <Page size="A4" style={styles.page}>
        <Text style={styles.docNumber}>{input.docNumber}</Text>
        <Text style={styles.title}>{input.snapshot.title}</Text>
        <Text style={styles.date}>{input.docDate}</Text>
        {input.snapshot.blocks.map((block, i) =>
          block.kind === "heading" ? (
            <Text key={i} style={styles.heading}>{block.text}</Text>
          ) : (
            <Text key={i} style={styles.paragraph}>{block.text}</Text>
          ),
        )}
        <View style={styles.signatures}>
          <View style={styles.signBox}>
            <Text style={styles.signLine}>
              {payerLabel}
              {values["company.name"] ? ` — ${values["company.name"]}` : ""}
              {values["company.rep"] ? ` / ${values["company.rep"]}` : ""}
            </Text>
          </View>
          <View style={styles.signBox}>
            <Text style={styles.signLine}>
              {payeeLabel}
              {values["crew.entity_name"] ? ` — ${values["crew.entity_name"]}` : ""}
              {values["crew.rep"] ? ` / ${values["crew.rep"]}` : ""}
            </Text>
          </View>
        </View>
      </Page>
    </Document>
  );
  return renderToBuffer(doc);
}
```

- [ ] **Step 2: Ruta**

```ts
// app/api/pdf/contract/[documentId]/route.ts
import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { parseContractSnapshot } from "@/lib/contractMerge";
import { buildContractPdf } from "@/pdf/ContractPdf";

/** PDF-ul documentului de contract — RLS: doar admin/accounting. */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ documentId: string }> },
) {
  const { documentId } = await params;
  const supabase = await createServerSupabase();

  const { data: doc } = await supabase
    .from("contract_documents")
    .select("doc_number, created_at, merge_snapshot")
    .eq("id", documentId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!doc) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const snapshot = parseContractSnapshot(doc.merge_snapshot);
  if (!snapshot) return NextResponse.json({ error: "bad_snapshot" }, { status: 422 });

  const pdf = await buildContractPdf({
    docNumber: doc.doc_number,
    docDate: String(doc.created_at).slice(0, 10),
    snapshot,
  });
  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${doc.doc_number}.pdf"`,
    },
  });
}
```

- [ ] **Step 3: Verificări + commit**

Run: `npx tsc --noEmit && npx vitest run && pnpm build`
Expected: verzi (ruta apare în output-ul de build).

```bash
git add pdf/ContractPdf.tsx app/api/pdf/contract/
git commit -m "feat: PDF-ul documentelor de contract, randat din snapshot"
```

---

### Task 5: Settings — Entități emitente + Template-uri de contract

**Files:**
- Create: `app/o/[orgSlug]/settings/issuing-entities/page.tsx`
- Create: `app/o/[orgSlug]/settings/contract-templates/page.tsx`
- Create: `app/o/[orgSlug]/settings/contract-templates/actions.ts`
- Create: `app/o/[orgSlug]/settings/contract-templates/templates-client.tsx`
- Modify: `app/o/[orgSlug]/settings/page.tsx` (2 linkuri noi în hub, după `schedule-templates`)
- Modify: `messages/ro.json`, `messages/en.json` (namespace-uri noi `issuingEntities`, `contractTemplates`)

**Interfaces:**
- Consumes (Task 3): `ContractBlock`, `MERGE_FIELD_KEYS`, `listMergeFields`.
- Produces: `saveContractTemplate(orgSlug, input)`, `deleteContractTemplate(orgSlug, id)` — folosite doar aici; datele citite de Task 6–8.

- [ ] **Step 1: Entități emitente (pagină server-only, pattern file-categories)**

`issuing-entities/page.tsx`: gate `edit_tour_content` → notFound; listă cu formulare inline per rând (name, cui, reg_com, address, iban, bank, representative — inputuri text, pattern-ul BILLING_FIELDS din `settings/page.tsx:96-106`), buton radio „Default" (un singur `is_default`: acțiunea setează `is_default=false` pe toate + `true` pe cel ales), ștergere soft cu confirmare (pattern `DeleteCategoryForm` din file-categories), formular de adăugare la final. Server actions inline în pagină (`"use server"`, pattern file-categories/page.tsx): `saveEntity` (id gol → insert cu org.id; id → update dublu-filtrat `.eq("organization_id", org.id)`), `setDefaultEntity`, `deleteEntity`. `revalidatePath` pe pagină.

- [ ] **Step 2: Template-uri de contract — actions**

```ts
// app/o/[orgSlug]/settings/contract-templates/actions.ts
"use server";

/** C3 — CRUD pe template-urile de contract. Scriere: editori de conținut
 *  (RLS-ul dublează gate-ul). Seria se editează doar aici; incrementul
 *  la generare e atomic (Task 6). */
import { revalidatePath } from "next/cache";
import { requireOrg } from "@/lib/org";
import { can } from "@/lib/permissions";
import type { ContractBlock } from "@/lib/contractMerge";

async function requireEditor(orgSlug: string) {
  const ctx = await requireOrg(orgSlug);
  if (!can({ tier: ctx.tier, permission: ctx.permission }, "edit_tour_content")) {
    throw new Error("forbidden");
  }
  return ctx;
}

const KINDS = new Set(["framework", "annex"]);
const ENTITY_TYPES = new Set(["srl", "pfa", "ii", "individual", "foreign"]);

export interface ContractTemplateInput {
  id?: string;
  name: string;
  docKind: string;
  body: ContractBlock[];
  matchRole: string;
  matchEntityType: string;
  issuingEntityId: string;
  seriesPrefix: string;
  seriesNext: number;
}

function normalizeBody(body: ContractBlock[]): ContractBlock[] | null {
  const out: ContractBlock[] = [];
  for (const block of body) {
    const kind = block.kind === "heading" ? "heading" : "paragraph";
    const text = typeof block.text === "string" ? block.text : "";
    if (!text.trim()) return null; // bloc gol = template incomplet
    out.push({ kind, text });
  }
  return out;
}

export async function saveContractTemplate(
  orgSlug: string,
  input: ContractTemplateInput,
): Promise<{ error?: string }> {
  const { supabase, org } = await requireEditor(orgSlug);
  const name = input.name.trim();
  if (!name || !KINDS.has(input.docKind)) return { error: "invalid" };
  const body = normalizeBody(input.body);
  if (!body) return { error: "invalid" };

  let issuingEntityId: string | null = null;
  if (input.issuingEntityId) {
    const { data: ent } = await supabase
      .from("issuing_entities")
      .select("id, organization_id")
      .eq("id", input.issuingEntityId)
      .is("deleted_at", null)
      .maybeSingle();
    if (!ent || ent.organization_id !== org.id) return { error: "invalid" };
    issuingEntityId = ent.id;
  }

  const seriesNext = Math.max(1, Math.round(Number(input.seriesNext) || 1));
  const payload = {
    name,
    doc_kind: input.docKind,
    body,
    match_role: input.matchRole.trim() || null,
    match_entity_type: ENTITY_TYPES.has(input.matchEntityType) ? input.matchEntityType : null,
    issuing_entity_id: issuingEntityId,
    series_prefix: input.seriesPrefix.trim(),
    series_next: seriesNext,
  };

  let error;
  if (input.id) {
    ({ error } = await supabase
      .from("contract_templates")
      .update(payload)
      .eq("id", input.id)
      .eq("organization_id", org.id));
  } else {
    const { count } = await supabase
      .from("contract_templates")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", org.id)
      .is("deleted_at", null);
    ({ error } = await supabase.from("contract_templates").insert({
      ...payload,
      organization_id: org.id,
      sort_order: count ?? 0,
    }));
  }
  if (error) return { error: error.message };
  revalidatePath(`/o/${orgSlug}/settings/contract-templates`);
  return {};
}

export async function deleteContractTemplate(
  orgSlug: string,
  templateId: string,
): Promise<{ error?: string }> {
  const { supabase, org } = await requireEditor(orgSlug);
  const { error } = await supabase
    .from("contract_templates")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", templateId)
    .eq("organization_id", org.id);
  if (error) return { error: error.message };
  revalidatePath(`/o/${orgSlug}/settings/contract-templates`);
  return {};
}
```

- [ ] **Step 3: Pagina + clientul de template-uri**

`page.tsx` (pattern schedule-templates/page.tsx): gate `edit_tour_content`, încarcă template-urile (`id, name, doc_kind, body, match_role, match_entity_type, issuing_entity_id, series_prefix, series_next`, org, nesters, `order sort_order, created_at`) + entitățile emitente (`id, name`, nesters, order name) → `TemplatesClient`.

`templates-client.tsx` (pattern EXACT `settings/schedule-templates/templates-client.tsx` — citește-l): listă cu rezumat pe rând (nume · tip · serie · emitent) + buton ✎ → formular expandat:
- nume (input), tip (select framework/annex), rol match (input text, placeholder „VJ"), tip entitate match (select — + „—"), emitent (select din prop), serie prefix (input, placeholder `ANX-2026-`), următorul număr (input number min 1),
- body: listă de blocuri — select kind (Titlu/Paragraf) + textarea text + ↑↓ + 🗑 + „Adaugă bloc",
- chips-urile de merge fields: rând de butoane cu toate `MERGE_FIELD_KEYS`; click → append `{{cheie}}` la ULTIMUL bloc focalizat (ține `focusedIdx` în state; fără bloc focalizat → append la ultimul bloc; fără blocuri → no-op),
- Save (dezactivat pe nume gol sau vreun bloc gol) / Cancel / Șterge template (window.confirm, pattern C2).
- Sub formular, read-only: „Câmpuri folosite: " + `listMergeFields(body).join(", ")`.

- [ ] **Step 4: Linkurile din hub + i18n**

În `settings/page.tsx`, după `<li>`-ul de schedule-templates: două `<li>`-uri noi (🏢 issuingEntities.title → `/settings/issuing-entities`; 📄 contractTemplates.title → `/settings/contract-templates`), cu `getTranslations` aferente.

Namespace `issuingEntities` (ro/en): `title` („Entități emitente"/"Issuing entities"), `hint` („Firmele tale care emit contractele — selectabile pe template."/"Your companies that issue the contracts — selectable per template."), `empty`, `nameLabel` („Denumire"/"Name"), `default` („Default"), `add` („+ Adaugă"/"+ Add"), `delete` („Șterge"/"Delete"), plus etichetele câmpurilor: `cui` („CUI"), `regCom` („Reg. Com."), `address` („Sediu"/"Address"), `iban` („IBAN"), `bank` („Banca"/"Bank"), `representative` („Reprezentant"/"Representative").

Namespace `contractTemplates` (ro/en): `title` („Template-uri de contract"/"Contract templates"), `hint` („Blocuri de text cu {{merge.fields}} — documentele emise păstrează snapshot-ul de la generare."/"Text blocks with {{merge.fields}} — issued documents keep the snapshot from generation."), `empty`, `add` („Template nou"/"New template"), `delete`, `nameLabel`, `kindLabel` („Tip"/"Kind"), `kindFramework` („Contract-cadru"/"Framework contract"), `kindAnnex` („Anexă"/"Annex"), `matchRole` („Rol (asignare automată)"/"Role (auto-assign)"), `matchEntityType` („Tip entitate"/"Entity type"), `issuer` („Entitate emitentă"/"Issuing entity"), `seriesPrefix` („Prefix serie"/"Series prefix"), `seriesNext` („Următorul număr"/"Next number"), `blockHeading` („Titlu"/"Heading"), `blockParagraph` („Paragraf"/"Paragraph"), `addBlock` („Adaugă bloc"/"Add block"), `deleteBlock` („Șterge blocul"/"Delete block"), `insertField` („Inserează câmp:"/"Insert field:"), `usedFields` („Câmpuri folosite:"/"Used fields:"), `moveUp` („Mută mai sus"/"Move up"), `moveDown` („Mută mai jos"/"Move down").

- [ ] **Step 5: Verificări + commit**

Run: `node scripts/check-i18n.mjs && npx tsc --noEmit && npx vitest run`

```bash
git add app/o/\[orgSlug\]/settings/ messages/ro.json messages/en.json
git commit -m "feat: settings — entități emitente + editor template-uri de contract"
```

---

### Task 6: Acțiunile de generare, status și upload semnat

**Files:**
- Create: `app/o/[orgSlug]/crew/contract-actions.ts`

**Interfaces:**
- Consumes (Task 2/3): `collectMergeValues`, `fillTemplate`, `listMergeFields`, `ContractSnapshot`; (C2) `findShowSlot` din `lib/scheduleGeneration`, `formatTimeInZone` din `lib/datetime`; (Task 1) tabelele.
- Produces (folosite de Task 7 și 8):
  - `generateContractDocument(orgSlug: string, input: { kind: "framework" | "annex"; crewEntityId: string; templateId: string; eventId?: string; personnelId?: string }): Promise<{ error?: string; missing?: string[]; documentId?: string }>`
  - `setContractStatus(orgSlug: string, documentId: string, status: "sent" | "void", revalidate: string): Promise<{ error?: string }>`
  - `recordSignedContract(orgSlug: string, documentId: string, file: { storagePath: string; fileName: string; mimeType: string; sizeBytes: number }, revalidate: string): Promise<{ error?: string }>`
  - NOTĂ: `findMatchingTemplate` NU stă aici — e pur și trăiește în `lib/contractMerge.ts` (Task 3), importat de acest fișier și de clienți. Un export dintr-un fișier `"use server"` ar deveni RPC async.

- [ ] **Step 1: Scrie fișierul**

```ts
// app/o/[orgSlug]/crew/contract-actions.ts
"use server";

/** C3 — generarea documentelor de contract (dry-run + blocare cu lista
 *  lipsurilor §13.3, numerotare atomică pe serie, snapshot imutabil),
 *  statusuri și upload-ul semnatului (→ attachment în categoria Admin
 *  pe ziua show-ului, pentru anexe). */
import { revalidatePath } from "next/cache";
import { requireOrg } from "@/lib/org";
import { can } from "@/lib/permissions";
import {
  collectMergeValues,
  fillTemplate,
  type ContractBlock,
  type ContractSnapshot,
} from "@/lib/contractMerge";
import { findShowSlot } from "@/lib/scheduleGeneration";
import { formatTimeInZone } from "@/lib/datetime";

async function requireAccounting(orgSlug: string) {
  const ctx = await requireOrg(orgSlug);
  if (!can({ tier: ctx.tier, permission: ctx.permission }, "edit_accounting")) {
    throw new Error("forbidden");
  }
  return ctx;
}

/** Rândul complet de template folosit de generare și de UI-uri
 *  (satisface MatchableTemplate din lib/contractMerge). */
export interface TemplateRow {
  id: string;
  name: string;
  doc_kind: string;
  body: ContractBlock[];
  match_role: string | null;
  match_entity_type: string | null;
  issuing_entity_id: string | null;
  series_prefix: string;
  series_next: number;
  sort_order: number;
}

export async function generateContractDocument(
  orgSlug: string,
  input: {
    kind: "framework" | "annex";
    crewEntityId: string;
    templateId: string;
    eventId?: string;
    personnelId?: string;
  },
): Promise<{ error?: string; missing?: string[]; documentId?: string }> {
  const { supabase, org, user } = await requireAccounting(orgSlug);

  const [{ data: template }, { data: entity }] = await Promise.all([
    supabase
      .from("contract_templates")
      .select("id, name, doc_kind, body, issuing_entity_id, series_prefix, series_next")
      .eq("id", input.templateId)
      .eq("organization_id", org.id)
      .is("deleted_at", null)
      .maybeSingle(),
    supabase
      .from("crew_entities")
      .select("*")
      .eq("id", input.crewEntityId)
      .eq("organization_id", org.id)
      .is("deleted_at", null)
      .maybeSingle(),
  ]);
  if (!template || template.doc_kind !== input.kind || !entity) {
    return { error: "not_found" };
  }

  // anexa cere event; refolosește documentul viu (anti-dublură)
  if (input.kind === "annex") {
    if (!input.eventId) return { error: "invalid" };
    const { data: existing } = await supabase
      .from("contract_documents")
      .select("id")
      .eq("crew_entity_id", input.crewEntityId)
      .eq("event_id", input.eventId)
      .eq("kind", "annex")
      .neq("status", "void")
      .is("deleted_at", null)
      .maybeSingle();
    if (existing) return { documentId: existing.id };
  }

  const { data: issuing } = template.issuing_entity_id
    ? await supabase
        .from("issuing_entities")
        .select("name, cui, reg_com, address, iban, bank, representative")
        .eq("id", template.issuing_entity_id)
        .is("deleted_at", null)
        .maybeSingle()
    : { data: null };

  // datele event-ului (doar anexe): lanțul event→day→tour→artist + venue
  let eventValues = null;
  let fee: { amount: number | null; currency: string | null } = { amount: null, currency: null };
  let role: string | null = null;
  if (input.kind === "annex" && input.eventId) {
    const { data: ev } = await supabase
      .from("events")
      .select(
        "id, title, day_id, venues(name), days!inner(id, date, city, country, timezone, tours!inner(artists(name)))",
      )
      .eq("id", input.eventId)
      .is("deleted_at", null)
      .maybeSingle();
    if (!ev) return { error: "not_found" };
    const day = ev.days as unknown as {
      id: string; date: string; city: string | null; country: string | null;
      timezone: string | null;
      tours: { artists: { name: string } | null };
    };
    const { data: dayItems } = await supabase
      .from("schedule_items")
      .select("id, title, start_at")
      .eq("day_id", day.id)
      .is("deleted_at", null)
      .order("start_at", { ascending: true, nullsFirst: false });
    const show = findShowSlot(dayItems ?? []);
    eventValues = {
      name: ev.title,
      date: day.date,
      city: day.city,
      country: day.country,
      venue: (ev.venues as unknown as { name: string } | null)?.name ?? null,
      stage_time: show?.start_at
        ? formatTimeInZone(new Date(show.start_at), day.timezone ?? "UTC")
        : null,
      artist: day.tours?.artists?.name ?? null,
    };
    // fee: linia de cost crew a persoanei pe event → fallback default_rate
    if (input.personnelId) {
      const { data: cost } = await supabase
        .from("show_costs")
        .select("amount, currency")
        .eq("event_id", input.eventId)
        .eq("personnel_id", input.personnelId)
        .is("deleted_at", null)
        .maybeSingle();
      if (cost && Number(cost.amount) > 0) {
        fee = { amount: Number(cost.amount), currency: cost.currency };
      }
      const { data: person } = await supabase
        .from("tour_personnel")
        .select("role")
        .eq("id", input.personnelId)
        .maybeSingle();
      role = person?.role ?? null;
    }
    if (fee.amount == null && entity.default_rate != null && Number(entity.default_rate) > 0) {
      fee = { amount: Number(entity.default_rate), currency: entity.rate_currency };
    }
  }

  // referința contractului-cadru: ultimul semnat al entității,
  // preferat cel valabil la data event-ului
  let frameworkRef: string | null = null;
  if (input.kind === "annex") {
    const { data: frameworks } = await supabase
      .from("contract_documents")
      .select("doc_number, valid_until, created_at")
      .eq("crew_entity_id", input.crewEntityId)
      .eq("kind", "framework")
      .eq("status", "signed")
      .is("deleted_at", null)
      .order("created_at", { ascending: false });
    const eventDate = eventValues?.date ?? null;
    const valid = (frameworks ?? []).find(
      (f) => !eventDate || !f.valid_until || f.valid_until >= eventDate,
    );
    frameworkRef = valid?.doc_number ?? (frameworks ?? [])[0]?.doc_number ?? null;
  }

  const language = (entity.doc_language === "en" ? "en" : entity.doc_language === "bi" ? "ro" : "ro") as "ro" | "en";
  const today = new Date().toISOString().slice(0, 10);

  // dry-run FĂRĂ număr: numărul se emite doar dacă totul e complet
  const probeValues = collectMergeValues({
    issuing,
    entity,
    role,
    event: eventValues,
    fee,
    doc: { number: "PROBE", date: today, frameworkRef, language },
  });
  const body = (template.body ?? []) as ContractBlock[];
  const { unresolved } = fillTemplate(body, probeValues);
  const missing = unresolved.filter((k) => k !== "doc.number");
  if (missing.length > 0) return { missing };

  // numărul: increment atomic pe serie
  const { data: bumped } = await supabase
    .from("contract_templates")
    .update({ series_next: template.series_next + 1 })
    .eq("id", template.id)
    .eq("series_next", template.series_next) // optimistic lock
    .select("series_prefix")
    .maybeSingle();
  if (!bumped) return { error: "series_conflict" }; // re-încearcă din UI
  const docNumber = `${bumped.series_prefix}${String(template.series_next).padStart(4, "0")}`;

  const values = { ...probeValues, "doc.number": docNumber };
  const { blocks } = fillTemplate(body, values);
  const snapshot: ContractSnapshot = {
    title: template.name,
    language,
    values,
    blocks,
  };

  const { data: inserted, error } = await supabase
    .from("contract_documents")
    .insert({
      organization_id: org.id,
      kind: input.kind,
      crew_entity_id: input.crewEntityId,
      template_id: template.id,
      issuing_entity_id: template.issuing_entity_id,
      event_id: input.eventId ?? null,
      doc_number: docNumber,
      merge_snapshot: snapshot,
      status: "generated",
      created_by: user.id,
    })
    .select("id")
    .single();
  if (error) return { error: error.message };
  return { documentId: inserted.id };
}

export async function setContractStatus(
  orgSlug: string,
  documentId: string,
  status: "sent" | "void",
  revalidate: string,
): Promise<{ error?: string }> {
  const { supabase, org } = await requireAccounting(orgSlug);
  const { error } = await supabase
    .from("contract_documents")
    .update({ status })
    .eq("id", documentId)
    .eq("organization_id", org.id)
    .is("deleted_at", null);
  if (error) return { error: error.message };
  revalidatePath(revalidate);
  return {};
}

export async function recordSignedContract(
  orgSlug: string,
  documentId: string,
  file: { storagePath: string; fileName: string; mimeType: string; sizeBytes: number },
  revalidate: string,
): Promise<{ error?: string }> {
  const { supabase, org, user } = await requireAccounting(orgSlug);
  const { data: doc } = await supabase
    .from("contract_documents")
    .select("id, kind, event_id")
    .eq("id", documentId)
    .eq("organization_id", org.id)
    .is("deleted_at", null)
    .maybeSingle();
  if (!doc) return { error: "not_found" };

  const { error } = await supabase
    .from("contract_documents")
    .update({ status: "signed", signed_storage_path: file.storagePath })
    .eq("id", doc.id);
  if (error) return { error: error.message };

  // anexă cu event → semnatul devine fișier REAL în categoria Admin pe zi
  if (doc.kind === "annex" && doc.event_id) {
    const [{ data: ev }, { data: adminCat }] = await Promise.all([
      supabase
        .from("events")
        .select("day_id")
        .eq("id", doc.event_id)
        .maybeSingle(),
      supabase
        .from("file_categories")
        .select("id")
        .eq("organization_id", org.id)
        .eq("name", "Admin")
        .is("deleted_at", null)
        .maybeSingle(),
    ]);
    if (ev?.day_id) {
      await supabase.from("attachments").insert({
        organization_id: org.id,
        parent_type: "day",
        parent_id: ev.day_id,
        file_name: file.fileName,
        storage_path: file.storagePath,
        mime_type: file.mimeType,
        size_bytes: file.sizeBytes,
        tags: [],
        category_id: adminCat?.id ?? null,
        uploaded_by: user.id,
      });
    }
  }
  revalidatePath(revalidate);
  return {};
}
```

Notă `findMatchingTemplate`: fișierul e `"use server"`, deci exporturile trebuie să fie async — de-asta e `async` deși e pur.

- [ ] **Step 2: Verificări + commit**

Run: `npx tsc --noEmit && npx vitest run`

```bash
git add app/o/\[orgSlug\]/crew/contract-actions.ts
git commit -m "feat: generarea documentelor de contract — dry-run, serie atomică, semnat → Admin"
```

---

### Task 7: Registrul juridic + legătura din profilul de crew

**Files:**
- Create: `app/o/[orgSlug]/crew/page.tsx`
- Create: `app/o/[orgSlug]/crew/actions.ts`
- Create: `app/o/[orgSlug]/crew/entities-client.tsx`
- Modify: `app/o/[orgSlug]/t/[tourId]/personnel/[personnelId]/page.tsx` (select entitate + creare din billing)
- Modify: `app/o/[orgSlug]/t/[tourId]/personnel/[personnelId]/profile-actions.ts` (2 acțiuni noi)
- Modify: sidebar-ul de tur — găsește fișierul cu linkurile ORGANIZATION (grep `"Roster"` în `app/o/[orgSlug]/t/[tourId]/`) și adaugă linkul „Registru juridic" → `/o/{orgSlug}/crew` sub Contacts (vizibil doar cu `edit_accounting` dacă sidebar-ul are gating; altfel simplu link — pagina oricum face notFound)
- Modify: `messages/ro.json`, `messages/en.json` (namespace nou `crewRegistry`)

**Interfaces:**
- Consumes (Task 6): `generateContractDocument`, `setContractStatus`, `recordSignedContract`, `findMatchingTemplate`; (Task 4) ruta PDF.
- Produces: `saveCrewEntity(orgSlug, input: CrewEntityInput): Promise<{ error?: string; entityId?: string }>` (în `crew/actions.ts`; folosită și de profilul de personnel), `linkCrewEntity(orgSlug, tourId, personnelId, crewEntityId: string | null)`, `createEntityFromBilling(orgSlug, tourId, personnelId)` (în `profile-actions.ts`).

- [ ] **Step 1: `crew/actions.ts`**

`saveCrewEntity(orgSlug, input)` — gate `edit_accounting` (requireAccounting, același helper local ca în contract-actions); `CrewEntityInput` cu toate câmpurile din tabel în camelCase (`id?`, `entityType`, `displayName`, `companyName`, `cui`, `regCom`, `address`, `representative`, `iban`, `bank`, `vatPayer: boolean`, `fiscalCountry`, `idDocument`, `defaultRate: number | null`, `rateUnit`, `rateCurrency`, `paymentTermsDays: number | null`, `docLanguage`); validare: `displayName` obligatoriu, `entityType` din set, `rateUnit`/`docLanguage` din seturi; insert cu `organization_id: org.id` + `created_by` / update dublu-filtrat pe org; întoarce `{ entityId }`. `deleteCrewEntity(orgSlug, id)` — soft-delete dublu-filtrat. `revalidatePath('/o/{orgSlug}/crew')`.

- [ ] **Step 2: `crew/page.tsx`**

Server page (params Promise): gate `can(..., "edit_accounting")` → notFound. Încarcă: `crew_entities` (toate câmpurile, nesters, order `display_name`), `contract_documents` de tip framework (id, crew_entity_id, doc_number, status, valid_until, created_at, nesters), `contract_templates` (câmpurile `TemplateRow`, nesters, order sort_order) → `EntitiesClient`. Status cadru per entitate (calculat în pagină, pasat clientului): `signed` cu `valid_until` ≥ azi+60zile → `active` 🟢; semnat dar `valid_until` < azi+60 (sau null) → `expiring` 🟡; fără document semnat → `missing` 🔴.

- [ ] **Step 3: `entities-client.tsx`**

Pattern-ul listă+formular expandabil (ca templates-client C2, citește-l): rând = display_name · entity_type · cui · badge status cadru (🟢🟡🔴 cu text `crewRegistry.frameworkActive/Expiring/Missing`); expandat = formularul Legal & Billing complet (selecturi pentru entity_type/rate_unit/doc_language, checkbox vat_payer, inputuri text/număr pentru rest — grid 2 coloane, stil formularele existente) + secțiunea „Contract-cadru": lista documentelor framework ale entității (doc_number · status · valid_until · link PDF `/api/pdf/contract/{id}` target _blank · butoane: „Trimis" [status generated→sent], „Void", upload semnat) + butonul „Generează contract-cadru" — folosește `findMatchingTemplate(templates, "framework", null, entityType)` pentru pre-selecție într-un select de template (suprascriibil) și cheamă `generateContractDocument`; la `missing` → afișează lista lipsurilor inline (text roșu, `crewRegistry.missingFields` + enumerarea); la `documentId` → router.refresh().

Upload-ul semnatului (client): input file → `createClient()` din `@/lib/supabase/client` → `supabase.storage.from("attachments").upload(path, file)` cu `path = `${orgId}/contracts/${crypto.randomUUID()}-${file.name}`` (orgId pasat ca prop) → `recordSignedContract(orgSlug, documentId, { storagePath: path, fileName: file.name, mimeType: file.type, sizeBytes: file.size }, "/o/" + orgSlug + "/crew")`. Pattern-ul de upload: `extras-client.tsx:238-268`.

Câmpul `valid_until` la framework: input date pe rândul documentului, salvat printr-o acțiune mică `setFrameworkValidity(orgSlug, documentId, validUntil: string | null)` adăugată în `crew/actions.ts` (update dublu-filtrat, revalidate).

- [ ] **Step 4: Profilul de personnel**

În `profile-actions.ts`: `linkCrewEntity(orgSlug, tourId, personnelId, crewEntityId | null)` — gate `edit_accounting`; dacă non-null, verifică entitatea în org (dublu-filtrat); update `tour_personnel.crew_entity_id`; revalidate pagina de profil. `createEntityFromBilling(orgSlug, tourId, personnelId)` — citește `billing_details` + numele persoanei; construiește `CrewEntityInput` (company_name/cui/reg_com/address/iban/bank/representative din billing_details; `display_name` = numele companiei sau al persoanei; `entity_type` = billing_details are `cui` → `srl`, altfel `individual`; `id_document` din `id_number` dacă există) și cheamă `saveCrewEntity`, apoi `linkCrewEntity` cu id-ul întors.

În `page.tsx` (secțiunea de billing, unde se citește `billing_details` la linia ~54): adaugă un bloc „Entitate juridică" — select cu entitățile org-ului (încarcă `crew_entities` id+display_name în paralel; select vizibil doar dacă userul are `edit_accounting` — pagina știe tier/permission din requireOrg) legat de `linkCrewEntity`, + buton „Creează din datele de facturare" (vizibil doar fără entitate legată) legat de `createEntityFromBilling`. Formulare server-action inline (pattern-ul paginii).

- [ ] **Step 5: i18n `crewRegistry`**

ro: `title` („Registru juridic"), `hint` („Entitățile juridice ale crew-ului — contractele-cadru și datele de facturare trăiesc aici, peste turnee."), `empty`, `add` („+ Entitate nouă"), `frameworkTitle` („Contract-cadru"), `frameworkActive` („Activ"), `frameworkExpiring` („Expiră"), `frameworkMissing` („Lipsă"), `generateFramework` („Generează contract-cadru"), `missingFields` („Lipsesc:"), `validUntil` („Valabil până la"), `statusGenerated` („Generat"), `statusSent` („Trimis"), `statusSigned` („Semnat"), `statusVoid` („Anulat"), `markSent` („Trimis la semnat"), `voidDoc` („Anulează"), `uploadSigned` („Urcă semnatul"), `linkedEntity` („Entitate juridică"), `createFromBilling` („Creează din datele de facturare"), `noTemplates` („Niciun template de contract-cadru — creează unul în Settings."), + etichetele câmpurilor formularului (`entityType`, `displayName`, `companyName`, `cui`, `regCom`, `address`, `representative`, `iban`, `bank`, `vatPayer` („Plătitor de TVA"), `fiscalCountry` („Rezidență fiscală"), `idDocument` („CI/Pașaport"), `defaultRate` („Tarif default"), `rateUnit`, `perShow` („pe show"), `perDay` („pe zi"), `paymentTerms` („Termen de plată (zile)"), `docLanguage` („Limbă documente")). en: echivalentele.

- [ ] **Step 6: Verificări + commit**

Run: `node scripts/check-i18n.mjs && npx tsc --noEmit && npx vitest run`

```bash
git add app/o/\[orgSlug\]/crew/ app/o/\[orgSlug\]/t/\[tourId\]/personnel/ messages/ro.json messages/en.json
git commit -m "feat: registrul juridic — entități crew, contracte-cadru, legătura din profil"
```

(+ fișierul de sidebar modificat în același commit)

---

### Task 8: Anexele pe Costs & profit — secțiune, generare manuală, auto-hook

**Files:**
- Create: `app/o/[orgSlug]/t/[tourId]/d/[date]/e/[eventId]/costs/contracts-client.tsx`
- Modify: `app/o/[orgSlug]/t/[tourId]/d/[date]/e/[eventId]/costs/page.tsx` (secțiunea Contracte + auto-hook în `toggleCrew`:228-265)
- Modify: `messages/ro.json`, `messages/en.json` (chei noi în `showCosts`)

**Interfaces:**
- Consumes (Task 6): `generateContractDocument`, `setContractStatus`, `recordSignedContract`, `findMatchingTemplate`; (Task 4) ruta PDF.

- [ ] **Step 1: Datele în `page.tsx`**

Extinde query-urile paginii (Promise.all-ul existent) cu: `contract_documents` de tip annex pe event (`id, doc_number, status, crew_entity_id, signed_storage_path`, nesters), `crew_entities` (id, display_name, entity_type — pentru numele pe rând și match), `contract_templates` (câmpurile `TemplateRow`, nesters), iar selectul de `tour_personnel` al paginii primește în plus `crew_entity_id` (verifică selectul existent al listei de crew și adaugă coloana).

- [ ] **Step 2: Auto-hook în `toggleCrew`**

În ramura de ASIGNARE (else-ul de la linia ~244, DUPĂ insertul în `show_costs`), adaugă:

```ts
      // C3 §13.6: auto-generarea anexei la asignare — doar dacă persoana
      // are entitate juridică legată și există template de anexă potrivit.
      // Blocarea (profil incomplet) NU e eroare aici — butonul manual de pe
      // rând arată lista lipsurilor.
      if (person.crew_entity_id && can({ tier, permission }, "edit_accounting")) {
        const [{ data: entity }, { data: templates }] = await Promise.all([
          supabase
            .from("crew_entities")
            .select("entity_type")
            .eq("id", person.crew_entity_id)
            .is("deleted_at", null)
            .maybeSingle(),
          supabase
            .from("contract_templates")
            .select("id, name, doc_kind, body, match_role, match_entity_type, issuing_entity_id, series_prefix, series_next, sort_order")
            .eq("organization_id", org.id)
            .is("deleted_at", null),
        ]);
        if (entity) {
          const template = findMatchingTemplate(
            (templates ?? []) as TemplateRow[],
            "annex",
            person.role,
            entity.entity_type,
          );
          if (template) {
            await generateContractDocument(orgSlug, {
              kind: "annex",
              crewEntityId: person.crew_entity_id,
              templateId: template.id,
              eventId,
              personnelId,
            });
            // rezultatul (missing/documentId) se ignoră aici — best-effort
          }
        }
      }
```

Selectul de `person` din `toggleCrew` (linia ~247) primește în plus `crew_entity_id`; `requireOrg` din acțiune expune deja `tier, permission, org` — extinde destructurarea. Importă în `page.tsx`: `can` (există deja probabil), `findMatchingTemplate` din `@/lib/contractMerge` (pur, sincron), `generateContractDocument` + `type TemplateRow` din `../../../../../../crew/contract-actions` (sau aliasul `@/`-relativ corect).

- [ ] **Step 3: Secțiunea Contracte + butonul pe rândul de crew**

`contracts-client.tsx` (client): primește `orgSlug, path, eventId, canAccounting, annexes: { id, doc_number, status, entityName }[], crewRows: { personnelId, personnelName, role, crewEntityId, entityType, hasAnnex }[], templates: TemplateRow[]`. Redă:
- Card „Contracte" (montat în `page.tsx` sub secțiunea Cost lines): lista anexelor — `doc_number` · numele entității · badge status (aceleași chei `crewRegistry.status*` — refolosește namespace-ul) · link PDF (`/api/pdf/contract/{id}`, target _blank) · „Trimis la semnat" (doar `generated`) · upload semnat (pattern-ul de storage din Task 7 Step 3, path `${orgId}/contracts/...` — orgId prop) · „Anulează" (window.confirm, doar ne-`signed`).
- Sub listă, pentru fiecare `crewRow` cu `crewEntityId` și fără anexă vie: rând cu numele + butonul „Generează anexa" → `findMatchingTemplate(templates, "annex", role, entityType)`; fără template → text `showCosts.contractNoTemplate`; cu template → `generateContractDocument`; `missing` → listă inline roșie (`showCosts.contractMissing` + enumerare); succes → router.refresh(). Crew fără entitate → rând gri cu hint `showCosts.contractNoEntity` + link către profil.
- `canAccounting=false` → cardul e read-only (doar lista + PDF).

Chei noi `showCosts` (ro/en): `contractsTitle` („Contracte"/"Contracts"), `contractGenerate` („Generează anexa"/"Generate annex"), `contractMissing` („Lipsesc:"/"Missing:"), `contractNoEntity` („Fără entitate juridică — leagă-o din profilul de crew."/"No legal entity — link it from the crew profile."), `contractNoTemplate` („Niciun template de anexă potrivit."/"No matching annex template."), `contractNone` („Nicio anexă încă."/"No annexes yet.").

- [ ] **Step 4: Verificări + commit**

Run: `node scripts/check-i18n.mjs && npx tsc --noEmit && npx vitest run && pnpm build`

```bash
git add app/o/\[orgSlug\]/t/\[tourId\]/d/\[date\]/e/\[eventId\]/costs/ messages/ro.json messages/en.json
git commit -m "feat: anexele pe Costs — secțiune, generare manuală cu lista lipsurilor, auto-hook la asignare"
```

---

### Task 9: Verificare finală

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

Opțiunile de integrare; după decizia utilizatorului: migrarea `00033` pe producție + `pnpm run deploy` (`pnpm run deploy`, nu `pnpm deploy`; verifică `/api/version` după — retry cu `pnpm install --force` dacă versiunea nu se schimbă). Smoke prin Chrome per spec: entitate emitentă (seed-ul din billing sau creată manual) → template de anexă cu serie `ANX-2026-` și body cu `{{crew.entity_name}}/{{deal.fee_in_words}}/{{doc.number}}` → entitate juridică pe un membru SPEAK (legată din profil) → asignare pe show → anexa apare generată cu număr în secțiunea Contracte → download PDF (conținutul umplut) → test blocare (entitate fără CUI + template cu `{{crew.cui}}` → lista lipsurilor) → upload semnat → fișierul apare în categoria Admin pe zi → cleanup complet (soft-delete pe datele de test).
