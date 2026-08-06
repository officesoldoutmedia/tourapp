# File metadata + advancing % automat — Implementation Plan (SP3b)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fișiere cu categorii/versiuni/statusuri/due dates + moștenire din artist, și advancing % calculat automat din itemi obligatorii (câmpuri marcate în layout + categorii de fișiere obligatorii), cu fallback pe statusurile manuale.

**Architecture:** Spec: `docs/superpowers/specs/2026-08-06-file-metadata-advancing-design.md`. `file_categories` per org (seed §10.2 Zola) + coloane noi pe `attachments` (categorie, status, due_date, lanț `supersedes_id`, `storage_path` nullable = placeholder). `required: true` pe itemii `field` din layout-ul jsonb existent. Helperi puri (`advanceProgress`, `fileVersions`) + propagare în pagina de zi, timeline-ul artistului și dashboard prin parametru opțional `progressOfDay` pe helperii existenți.

**Tech Stack:** Next.js App Router, Supabase RLS, next-intl, vitest, `scripts/test-rls.sh`.

## Global Constraints

- **Next.js cu breaking changes** — `node_modules/next/dist/docs/`; `params` e Promise.
- **i18n:** chei noi în AMBELE `messages/ro.json` + `messages/en.json`; `node scripts/check-i18n.mjs`.
- **RLS:** teste în `supabase/tests/`, ordinea ALFABETICĂ (`faza1c_` între `faza1b_` și `faza2_` — verifică cu `ls`); cleanup fără poluarea fazelor următoare.
- **Convenții schema:** uuid PK, timestamps + `deleted_at`, trigger `public.set_updated_at()`, comentarii SQL în română.
- **`file_categories` e tabelă ORG-level** (ca `groups`/`songs`): `organization_id` E părintele — politicile pe `organization_id` sunt corecte aici (lecția SP3a viza tabele cu org denormalizat lângă alt FK părinte).
- **Fallback obligatoriu:** show fără itemi obligatorii (total=0) → procentul manual din statusurile advances, NESCHIMBAT vizual.
- **Fișierele moștenite de la artist NU satisfac categoriile obligatorii** (spec §2).
- **Seed-ul NU marchează nicio categorie obligatorie** — opt-in explicit.
- **Deploy:** migrarea `00030` aditivă; `CREATE TYPE` nou (fără restricția ADD VALUE); fără fereastră de incompatibilitate.
- **Commit-uri:** per pas, `feat:`/`test:`/`fix:` + `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.

---

### Task 1: Migrarea 00030 + test RLS faza1c

**Files:**
- Create: `supabase/migrations/00030_file_metadata.sql`
- Create: `supabase/tests/faza1c_files_rls.test.sql`

**Interfaces:**
- Produces: tabela `file_categories` (id, organization_id, name, is_required, sort_order, deleted_at…), pe `attachments`: `category_id uuid`, `status public.attachment_status` (default `'draft'`), `due_date date`, `supersedes_id uuid`, `storage_path` NULLABLE. Task 2–6 consumă exact aceste nume.

- [ ] **Step 1: Scrie testul (pică fără migrare)**

Creează `supabase/tests/faza1c_files_rls.test.sql`:

```sql
-- ═══ Faza 1c — file_categories + metadata pe attachments (SP3b) ═══
-- Rulează DUPĂ faza1b (alfabetic: faza1b < faza1c < faza2).
-- Refolosește org/userii din faza0 și ziua din faza1.
\set ON_ERROR_STOP on

select id as org_id from public.organizations limit 1 \gset

select set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-00000000000a"}', false);
set role authenticated;

-- ── Seed-ul a creat cele 8 categorii pentru org-ul existent ──
do $$ declare n int; begin
  select count(*) into n from public.file_categories;
  if n < 8 then
    raise exception 'FAIL: seed-ul de categorii lipseste (gasit %)', n;
  end if;
  if exists (select 1 from public.file_categories where is_required) then
    raise exception 'FAIL: seed-ul nu trebuie sa marcheze nimic obligatoriu';
  end if;
end $$;
\echo 'PASS: seed categorii prezent, nimic obligatoriu'

-- ── Admin: placeholder (storage_path null) + fisier real cu categorie ──
select id as cat_id from public.file_categories order by sort_order limit 1 \gset
select d.id as day_id from public.days d
  join public.tours t on t.id = d.tour_id
  where d.deleted_at is null and t.deleted_at is null limit 1 \gset

insert into public.attachments
  (organization_id, parent_type, parent_id, file_name, storage_path,
   category_id, due_date, uploaded_by)
values
  (:'org_id', 'day', :'day_id', 'setlist-asteptat.pdf', null,
   :'cat_id', '2026-09-01', 'a0000000-0000-0000-0000-00000000000a')
returning id as ph_id \gset

insert into public.attachments
  (organization_id, parent_type, parent_id, file_name, storage_path,
   category_id, status, uploaded_by)
values
  (:'org_id', 'day', :'day_id', 'setlist-v1.pdf',
   :'org_id' || '/test/setlist-v1.pdf', :'cat_id', 'final',
   'a0000000-0000-0000-0000-00000000000a')
returning id as v1_id \gset

-- versiune noua legata de v1
insert into public.attachments
  (organization_id, parent_type, parent_id, file_name, storage_path,
   category_id, supersedes_id, uploaded_by)
values
  (:'org_id', 'day', :'day_id', 'setlist-v2.pdf',
   :'org_id' || '/test/setlist-v2.pdf', :'cat_id', :'v1_id',
   'a0000000-0000-0000-0000-00000000000a')
returning id as v2_id \gset
\echo 'PASS: placeholder, fisier cu status si lant de versiuni acceptate'

-- ── Crew citeste categoriile si fisierele, nu scrie categorii ──
select set_config('request.jwt.claims', '{"sub":"c0000000-0000-0000-0000-00000000000c"}', false);
do $$ begin
  if not exists (select 1 from public.file_categories) then
    raise exception 'FAIL: crew nu vede categoriile';
  end if;
  if (select count(*) from public.attachments where parent_type = 'day'
        and file_name like 'setlist%') <> 3 then
    raise exception 'FAIL: crew nu vede attachment-urile noi prin lantul existent';
  end if;
end $$;
do $$ declare oid uuid; begin
  select id into oid from public.organizations limit 1;
  begin
    insert into public.file_categories (organization_id, name) values (oid, 'HACK');
    raise exception 'FAIL: crew a creat categorie';
  exception when others then
    if sqlerrm like 'FAIL%' then raise; end if;
  end;
end $$;
\echo 'PASS: crew citeste, nu scrie categorii'

-- ── Cleanup (hard delete, fara copii) ──
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-00000000000a"}', false);
delete from public.attachments where id in (:'v2_id', :'v1_id', :'ph_id');

reset role;
```

- [ ] **Step 2: Rulează — pică**

Run: `bash scripts/test-rls.sh`
Expected: FAIL la faza1c cu `relation "public.file_categories" does not exist`.

- [ ] **Step 3: Scrie migrarea**

Creează `supabase/migrations/00030_file_metadata.sql`:

```sql
-- ═══════════════════════════════════════════════════════════════════
-- SP3b — file metadata + advancing automat. Spec:
-- docs/superpowers/specs/2026-08-06-file-metadata-advancing-design.md
-- ═══════════════════════════════════════════════════════════════════

-- ── file_categories (org-level, ca groups/songs) ────────────────────
create table public.file_categories (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  deleted_at timestamptz,
  organization_id uuid not null references public.organizations on delete cascade,
  name text not null,
  is_required boolean not null default false,  -- intră în advancing % (spec §2)
  sort_order integer not null default 0,
  created_by uuid references auth.users
);
create index file_categories_org_idx on public.file_categories (organization_id);
create trigger set_updated_at before update on public.file_categories
  for each row execute function public.set_updated_at();

alter table public.file_categories enable row level security;

create policy file_categories_select on public.file_categories
  for select to authenticated
  using (
    (deleted_at is null or private.can_edit_tour_content(organization_id))
    and private.is_org_member(organization_id)
  );
create policy file_categories_insert on public.file_categories
  for insert to authenticated
  with check (private.can_edit_tour_content(organization_id));
create policy file_categories_update on public.file_categories
  for update to authenticated
  using (private.can_edit_tour_content(organization_id))
  with check (private.can_edit_tour_content(organization_id));
create policy file_categories_delete on public.file_categories
  for delete to authenticated
  using (private.can_edit_tour_content(organization_id));

-- ── Seed: lista Zola §10.2, pentru fiecare org existent ─────────────
insert into public.file_categories (organization_id, name, sort_order)
select o.id, c.name, c.ord
from public.organizations o
cross join (values
  ('Show files', 0), ('Video / VJ', 1), ('Lighting', 2), ('SFX', 3),
  ('Technical', 4), ('Hospitality', 5), ('Admin', 6), ('Post-show', 7)
) as c(name, ord);

-- ── Metadata pe attachments ─────────────────────────────────────────
create type public.attachment_status as enum
  ('draft', 'approved', 'final', 'superseded');

alter table public.attachments
  add column category_id uuid references public.file_categories on delete set null,
  add column status public.attachment_status not null default 'draft',
  add column due_date date,
  add column supersedes_id uuid references public.attachments on delete set null;

create index attachments_category_idx on public.attachments (category_id);
create index attachments_supersedes_idx on public.attachments (supersedes_id);

-- Placeholder „fișier așteptat" = rând fără storage_path (spec §1).
alter table public.attachments alter column storage_path drop not null;
```

- [ ] **Step 4: Rulează — trece tot; commit**

Run: `bash scripts/test-rls.sh` → toate PASS, exit 0.

```bash
git add supabase/migrations/00030_file_metadata.sql supabase/tests/faza1c_files_rls.test.sql
git commit -m "feat: file_categories + metadata pe attachments (status, versiuni, due date)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: Helperii puri (advanceProgress, fileVersions, required în layout) — TDD

**Files:**
- Create: `lib/advanceProgress.ts` + `lib/advanceProgress.test.ts`
- Create: `lib/fileVersions.ts` + `lib/fileVersions.test.ts`
- Modify: `lib/advance.ts` (tipul `AdvanceLayoutItem` + `isValidLayout`)

**Interfaces:**
- Produces (semnături exacte, consumate de Task 4–6):
  - `AdvanceLayoutItem` varianta field devine `{ type: 'field'; key: string; required?: boolean }` (isValidLayout acceptă `required` boolean opțional).
  - `computeAdvanceProgress(input: AdvanceProgressInput): AdvanceProgress` din `lib/advanceProgress.ts` (tipuri mai jos).
  - `versionChains<T extends VersionedFile>(files: T[]): VersionChain<T>[]` din `lib/fileVersions.ts`.

- [ ] **Step 1: Extinde tipul de layout**

În `lib/advance.ts`: varianta field devine `{ type: 'field'; key: string; required?: boolean }`; în `isValidLayout`, cazul `'field'` verifică în plus `(it.required === undefined || typeof it.required === 'boolean')`.

- [ ] **Step 2: Testele advanceProgress (pică)**

Creează `lib/advanceProgress.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { computeAdvanceProgress } from "./advanceProgress";
import type { AdvanceLayoutItem } from "./advance";

const layouts: AdvanceLayoutItem[][] = [
  [
    { type: "field", key: "production.stage_time", required: true },
    { type: "field", key: "production.dimensions" }, // neobligatoriu — ignorat
    { type: "title", title: "Audio" },
    { type: "field", key: "logistics.parking", required: true },
  ],
];

describe("computeAdvanceProgress", () => {
  it("numără câmpurile obligatorii completate + categoriile cu fișier", () => {
    const p = computeAdvanceProgress({
      layouts,
      fieldValues: new Map([["production.stage_time", "22:30"]]),
      requiredCategoryIds: ["cat-sfx", "cat-setlist"],
      dayFileCategoryIds: ["cat-setlist"],
      manualStatuses: ["not_started"],
    });
    expect(p).toEqual({ done: 2, total: 4, percent: 50, source: "required" });
  });
  it("valoare goală/whitespace nu contează ca umplută", () => {
    const p = computeAdvanceProgress({
      layouts,
      fieldValues: new Map([["production.stage_time", "  "]]),
      requiredCategoryIds: [],
      dayFileCategoryIds: [],
      manualStatuses: [],
    });
    expect(p.done).toBe(0);
    expect(p.total).toBe(2);
  });
  it("fallback pe statusurile manuale când nu există obligatorii", () => {
    const p = computeAdvanceProgress({
      layouts: [[{ type: "field", key: "x" }]],
      fieldValues: new Map(),
      requiredCategoryIds: [],
      dayFileCategoryIds: [],
      manualStatuses: ["done", "in_progress", "done"],
    });
    expect(p).toEqual({ done: 2, total: 3, percent: 67, source: "manual" });
  });
  it("zero peste tot → 0/0, percent 0, manual", () => {
    const p = computeAdvanceProgress({
      layouts: [],
      fieldValues: new Map(),
      requiredCategoryIds: [],
      dayFileCategoryIds: [],
      manualStatuses: [],
    });
    expect(p).toEqual({ done: 0, total: 0, percent: 0, source: "manual" });
  });
  it("aceeași cheie obligatorie în două layout-uri se numără o dată", () => {
    const p = computeAdvanceProgress({
      layouts: [
        [{ type: "field", key: "a", required: true }],
        [{ type: "field", key: "a", required: true }],
      ],
      fieldValues: new Map([["a", "x"]]),
      requiredCategoryIds: [],
      dayFileCategoryIds: [],
      manualStatuses: [],
    });
    expect(p).toEqual({ done: 1, total: 1, percent: 100, source: "required" });
  });
});
```

- [ ] **Step 3: Rulează (FAIL), implementează lib/advanceProgress.ts**

```typescript
/** Advancing % din itemi obligatorii (SP3b, spec §2). Pur — fără fetch. */
import type { AdvanceLayoutItem } from "./advance";

export interface AdvanceProgressInput {
  layouts: AdvanceLayoutItem[][];
  fieldValues: ReadonlyMap<string, string>;
  requiredCategoryIds: string[];
  dayFileCategoryIds: string[]; // categoriile fișierelor REALE ale zilei
  manualStatuses: string[];     // fallback: statusurile advances
}

export interface AdvanceProgress {
  done: number;
  total: number;
  percent: number;
  source: "required" | "manual";
}

export function computeAdvanceProgress(
  input: AdvanceProgressInput,
): AdvanceProgress {
  const requiredKeys = new Set<string>();
  for (const layout of input.layouts) {
    for (const item of layout) {
      if (item.type === "field" && item.required) requiredKeys.add(item.key);
    }
  }
  const filled = [...requiredKeys].filter(
    (k) => (input.fieldValues.get(k) ?? "").trim() !== "",
  ).length;

  const catSet = new Set(input.dayFileCategoryIds);
  const catsDone = input.requiredCategoryIds.filter((c) => catSet.has(c)).length;

  const total = requiredKeys.size + input.requiredCategoryIds.length;
  if (total === 0) {
    const mTotal = input.manualStatuses.length;
    const mDone = input.manualStatuses.filter((s) => s === "done").length;
    return {
      done: mDone,
      total: mTotal,
      percent: mTotal > 0 ? Math.round((mDone / mTotal) * 100) : 0,
      source: "manual",
    };
  }
  const done = filled + catsDone;
  return {
    done,
    total,
    percent: Math.round((done / total) * 100),
    source: "required",
  };
}
```

Run: `pnpm vitest run lib/advanceProgress.test.ts` → PASS.

- [ ] **Step 4: Testele fileVersions (pică), apoi implementarea**

Creează `lib/fileVersions.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { versionChains } from "./fileVersions";

const f = (id: string, supersedes: string | null, at: string) => ({
  id, supersedes_id: supersedes, created_at: at,
});

describe("versionChains", () => {
  it("leagă v3→v2→v1: head v3 cu versiunea 3 și istoricul ordonat desc", () => {
    const chains = versionChains([
      f("v1", null, "2026-01-01"), f("v2", "v1", "2026-01-02"), f("v3", "v2", "2026-01-03"),
    ]);
    expect(chains).toHaveLength(1);
    expect(chains[0].head.id).toBe("v3");
    expect(chains[0].version).toBe(3);
    expect(chains[0].history.map((h) => h.id)).toEqual(["v2", "v1"]);
  });
  it("fișier fără lanț = versiunea 1, istoric gol", () => {
    const chains = versionChains([f("a", null, "2026-01-01")]);
    expect(chains[0]).toMatchObject({ version: 1, history: [] });
  });
  it("referință lipsă tratată ca rădăcină (defensiv)", () => {
    const chains = versionChains([f("b", "deleted-id", "2026-01-02")]);
    expect(chains[0]).toMatchObject({ version: 1, history: [] });
  });
  it("ciclu accidental nu blochează (guard pe vizitate)", () => {
    const chains = versionChains([f("x", "y", "2026-01-01"), f("y", "x", "2026-01-02")]);
    expect(chains.length).toBeGreaterThan(0); // nu aruncă, nu buclează
  });
});
```

Implementează `lib/fileVersions.ts`:

```typescript
/** Lanțurile de versiuni ale fișierelor (SP3b, spec §1). Pur — fără fetch. */

export interface VersionedFile {
  id: string;
  supersedes_id: string | null;
  created_at: string;
}

export interface VersionChain<T extends VersionedFile> {
  head: T;
  history: T[]; // predecesorii, cei mai noi primii
  version: number;
}

export function versionChains<T extends VersionedFile>(files: T[]): VersionChain<T>[] {
  const byId = new Map(files.map((file) => [file.id, file]));
  const superseded = new Set(
    files.map((file) => file.supersedes_id).filter((id): id is string => !!id),
  );
  // head = nu e înlocuit de nimeni (nimeni nu-l are ca supersedes_id)
  const heads = files.filter((file) => !superseded.has(file.id));
  // Defensiv: un ciclu accidental (x↔y) ar lăsa heads gol — cel mai nou
  // fișier devine head ca lanțul să rămână afișabil.
  if (heads.length === 0 && files.length > 0) {
    heads.push(
      [...files].sort((a, b) => b.created_at.localeCompare(a.created_at))[0],
    );
  }

  return heads.map((head) => {
    const history: T[] = [];
    const visited = new Set<string>([head.id]);
    let cursor = head.supersedes_id;
    while (cursor && byId.has(cursor) && !visited.has(cursor)) {
      const prev = byId.get(cursor)!;
      history.push(prev);
      visited.add(prev.id);
      cursor = prev.supersedes_id;
    }
    return { head, history, version: history.length + 1 };
  });
}
```

Run: `pnpm vitest run lib/fileVersions.test.ts` → PASS; apoi `pnpm vitest run` → tot verde.

- [ ] **Step 5: Commit**

```bash
git add lib/advanceProgress.ts lib/advanceProgress.test.ts lib/fileVersions.ts lib/fileVersions.test.ts lib/advance.ts
git commit -m "feat: advanceProgress cu fallback + versionChains + required în layout

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: Settings — Categorii de fișiere

**Files:**
- Create: `app/o/[orgSlug]/settings/file-categories/page.tsx` (+ client colocat dacă e nevoie de erori interactive)
- Modify: `app/o/[orgSlug]/settings/page.tsx` (link în hub)
- Modify: `messages/ro.json`, `messages/en.json` (namespace nou `fileCategories`)

**Interfaces:**
- Consumes: `file_categories` (Task 1).
- Produces: pagina CRUD; nimic programatic pentru alte task-uri.

- [ ] **Step 1: Pagina**

Copiază pattern-ul din `app/o/[orgSlug]/settings/groups/page.tsx` (server page cu acțiuni inline `"use server"`, gate-ul lui de permisiuni — citește-l întâi): listă categorii (`order sort_order, created_at`), rând per categorie cu: nume editabil, **checkbox „Obligatoriu"** (cu hint că intră în advancing), săgeți sus/jos (swap `sort_order`, pattern-ul din `profile/parties-client.tsx` SP3a), ștergere soft cu confirm. Rând de adăugare jos. Acțiuni: `saveCategory` (insert/update, `sort_order` la insert = numărul de rânduri nesterse), `toggleRequired`, `moveCategory`, `deleteCategory` (update `deleted_at`) — toate gate `can_edit_tour_content` prin pattern-ul paginii de groups.

- [ ] **Step 2: Link în hub + i18n**

În `app/o/[orgSlug]/settings/page.tsx`, adaugă cardul/link-ul „Categorii de fișiere" lângă Songs/Groups (același markup ca vecinii). Namespace `fileCategories` (ambele limbi):

```json
"fileCategories": {
  "title": "Categorii de fișiere",
  "hint": "Categoriile marcate ca obligatorii intră în procentul de advancing al fiecărui show.",
  "nameLabel": "Nume categorie",
  "required": "Obligatoriu",
  "add": "Adaugă categoria",
  "delete": "Șterge",
  "empty": "Nicio categorie."
}
```

(en: `"File categories" / "Categories marked as required count toward each show's advancing percentage." / "Category name" / "Required" / "Add category" / "Delete" / "No categories."`.)

- [ ] **Step 3: Verifică + commit**

Run: `node scripts/check-i18n.mjs && pnpm exec tsc --noEmit && pnpm vitest run` → exit 0.

```bash
git add "app/o/[orgSlug]/settings" messages/ro.json messages/en.json
git commit -m "feat: settings categorii de fișiere — CRUD + bifă obligatoriu

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: Files UI pe zi — categorii, versiuni, placeholdere, moștenire

**Files:**
- Modify: `app/o/[orgSlug]/t/[tourId]/d/[date]/extras-actions.ts`
- Modify: `app/o/[orgSlug]/t/[tourId]/d/[date]/extras-client.tsx`
- Modify: `app/o/[orgSlug]/t/[tourId]/d/[date]/page.tsx` (datele noi pasate clientului)
- Modify: `app/o/[orgSlug]/a/[artistSlug]/access/files-client.tsx` + `access/actions.ts` + `access/page.tsx` (selectul de categorie pe fișierele artistului)
- Modify: `messages/ro.json`, `messages/en.json` (chei în `attachments`)

**Interfaces:**
- Consumes: coloanele din Task 1, `versionChains` din Task 2.
- Produces (extinderi de acțiuni — semnături exacte):
  - `recordAttachment` — `input` primește în plus `categoryId?: string | null; dueDate?: string | null; supersedesId?: string | null; placeholderId?: string | null`. Cu `supersedesId`: după insert, predecesorul primește `status: 'superseded'`. Cu `placeholderId`: NU se inserează — se face UPDATE pe placeholder (setează `file_name`, `storage_path`, `mime_type`, `size_bytes`, `uploaded_by`; păstrează categoria/due date-ul).
  - `createExpectedFile(orgSlug, tourId, date, input: { dayId: string; categoryId: string; dueDate: string | null; fileName?: string }): Promise<{ error?: string }>` — insert cu `storage_path: null`, `file_name` default = numele categoriei.
  - `updateAttachmentMeta(orgSlug, tourId, date, attachmentId, patch: { status?: "draft" | "approved" | "final"; categoryId?: string | null; dueDate?: string | null }): Promise<{ error?: string }>`.

- [ ] **Step 1: Acțiunile**

În `extras-actions.ts`, aplică extinderile din blocul Interfaces (citește întâi `recordAttachment` existent — păstrează-i comportamentul actual când câmpurile noi lipsesc). Pentru supersede:

```typescript
  if (input.supersedesId && !error) {
    await supabase
      .from("attachments")
      .update({ status: "superseded" })
      .eq("id", input.supersedesId);
  }
```

`createExpectedFile` și `updateAttachmentMeta` — funcții noi în același fișier, pe `requireEditor` existent, cu `revalidatePath(dayPath(orgSlug, tourId, date))`.

- [ ] **Step 2: Datele paginii**

În `d/[date]/page.tsx`: extinde select-ul de attachments cu `category_id, status, due_date, supersedes_id`; încarcă `file_categories` (nesterse, ordonate) și fișierele artistului turului: `from("attachments").select("id, file_name, storage_path, category_id").eq("parent_type", "artist").eq("parent_id", artistId).is("deleted_at", null)` unde `artistId` vine din select-ul de tur (`artist_id` — există deja în layout; adaugă-l aici dacă pagina nu-l are). Pasează totul lui `extras-client`.

- [ ] **Step 3: UI-ul**

În `extras-client.tsx`, secțiunea de attachments:
- grupare pe categorii (`versionChains` pe fișierele zilei, apoi grupare heads pe `category_id`; necategorisate sub heading `t("uncategorized")`);
- per head: nume + badge `v{version}` (doar când `version > 1`), pastilă status (select Draft/Aprobat/Final pentru editori → `updateAttachmentMeta`; `superseded` nu apare în select — e automat), due date cu badge roșu când `due_date < azi` și e placeholder sau status ≠ final, download (doar cu `storage_path`), buton „Versiune nouă" (upload → `recordAttachment` cu `supersedesId: head.id`), istoric expandabil (history din chain, download per intrare);
- placeholder (storage_path null): stil distinct (dashed), buton „Încarcă" (upload → `recordAttachment` cu `placeholderId`);
- buton secțiune „Așteaptă fișier" → mini-form categorie + due date + nume opțional → `createExpectedFile`;
- select de categorie pe fiecare fișier (editori) → `updateAttachmentMeta`;
- sub-secțiune „Din profilul artistului": fișierele artistului, read-only, badge *inherited*, download prin `getAttachmentUrl` existent.

- [ ] **Step 4: Fișierele artistului primesc categorie**

În `access/`: `files-client.tsx` primește categoriile (încărcate în `access/page.tsx`) și afișează select de categorie per fișier → acțiune nouă `setArtistFileCategory(orgSlug, artistSlug, attachmentId, categoryId: string | null)` în `access/actions.ts` (pattern-ul acțiunilor existente de acolo, gate `requireManage`).

- [ ] **Step 5: i18n**

Chei noi în namespace-ul `attachments` (ambele limbi): `uncategorized` („Fără categorie"/"Uncategorized"), `newVersion` („Versiune nouă"/"New version"), `history` („Istoric"/"History"), `expectFile` („Așteaptă fișier"/"Expect a file"), `expected` („Așteptat"/"Expected"), `overdue` („Depășit"/"Overdue"), `dueLabel` („Termen"/"Due"), `statusDraft` („Draft"/"Draft"), `statusApproved` („Aprobat"/"Approved"), `statusFinal` („Final"/"Final"), `statusSuperseded` („Înlocuit"/"Superseded"), `inherited` („Din profilul artistului"/"From artist profile"), `categoryLabel` („Categorie"/"Category").

- [ ] **Step 6: Verifică + commit**

Run: `node scripts/check-i18n.mjs && pnpm exec tsc --noEmit && pnpm vitest run && pnpm build` → exit 0.

```bash
git add "app/o/[orgSlug]/t/[tourId]/d/[date]" "app/o/[orgSlug]/a/[artistSlug]/access" messages/ro.json messages/en.json
git commit -m "feat: files pe categorii — versiuni, statusuri, placeholdere, moștenire artist

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: Checkbox „Obligatoriu" în layout editor + procentul pe pagina de zi

**Files:**
- Modify: `app/o/[orgSlug]/t/[tourId]/d/[date]/e/[eventId]/advance/advance-client.tsx`
- Modify: `app/o/[orgSlug]/t/[tourId]/d/[date]/page.tsx` (calculul procentului)
- Modify: `messages/ro.json`, `messages/en.json`

**Interfaces:**
- Consumes: `required?: boolean` pe field items (Task 2), `computeAdvanceProgress` (Task 2), datele de fișiere din Task 4.
- Produces: nimic programatic nou.

- [ ] **Step 1: Checkbox în editor**

În `advance-client.tsx`, găsește randarea itemilor de layout de tip field (zona în care se adaugă itemii e la `onChange([...layout, { type: "field", key: e.target.value }])` — randarea rândurilor e în aceeași componentă): adaugă un toggle mic „Obligatoriu" (`title={t("requiredToggle")}`) care comută `required` pe item și salvează prin mecanismul existent de update al layout-ului (`updateAdvanceLayout`). Vizual: asteriscul sau bifă lângă numele câmpului când `required`.

- [ ] **Step 2: Procentul pe pagina de zi**

În `d/[date]/page.tsx` (liniile ~395-400 calculează azi `advanceDone/advanceTotal` din statusuri): încarcă în plus `advances.layout` (extinde select-ul existent de advances cu `layout`), valorile de câmpuri ale event-urilor zilei (`event_field_values` cu `.in("event_id", eventIds)` — verifică numele coloanelor: `field_key`, `value`), categoriile obligatorii (`file_categories` cu `is_required`) și categoriile fișierelor reale ale zilei (din datele Task 4). Apoi:

```typescript
  const progress = computeAdvanceProgress({
    layouts: advanceRows.map((a) => (isValidLayout(a.layout) ? a.layout : [])),
    fieldValues: new Map(fieldValueRows.map((r) => [r.field_key, r.value ?? ""])),
    requiredCategoryIds: requiredCats.map((c) => c.id),
    dayFileCategoryIds: realDayFileCategoryIds,
    manualStatuses: advanceStatuses,
  });
```

`advanceDone/advanceTotal/advancePct` se înlocuiesc cu `progress.done/total/percent` peste tot în pagină (metric + afișarea de la ~673). `realDayFileCategoryIds` = categoriile heads-urilor NEsuperseded cu `storage_path` non-null (refolosește datele deja încărcate la Task 4 — nu dubla query-ul).

- [ ] **Step 3: i18n + verifică + commit**

Cheie nouă în `advance` (ambele limbi): `requiredToggle` („Obligatoriu — intră în procentul de advancing"/"Required — counts toward the advancing percentage"). Run: `node scripts/check-i18n.mjs && pnpm exec tsc --noEmit && pnpm vitest run` → exit 0.

```bash
git add "app/o/[orgSlug]/t/[tourId]/d/[date]" messages/ro.json messages/en.json
git commit -m "feat: câmpuri obligatorii în advance + procent calculat pe pagina de zi

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 6: Propagarea în dashboard și timeline-ul artistului

**Files:**
- Modify: `lib/dashboard.ts` + `lib/dashboard.test.ts`
- Modify: `lib/artistTimeline.ts` + `lib/artistTimeline.test.ts`
- Modify: `app/o/[orgSlug]/page.tsx` (dashboard)
- Modify: `app/o/[orgSlug]/a/[artistSlug]/page.tsx` (timeline)

**Interfaces:**
- Consumes: `computeAdvanceProgress` (Task 2).
- Produces: `UpcomingInput` și `buildArtistTimeline` primesc parametru opțional NOU `progressOfDay?: ReadonlyMap<string, { done: number; total: number }>` — când există intrare pentru o zi, ea ÎNLOCUIEȘTE agregatul din statusuri; altfel comportamentul actual rămâne identic (additiv, nu strică consumatorii existenți).

- [ ] **Step 1: Testele extinse (pică)**

În `lib/dashboard.test.ts` adaugă:

```typescript
  it("progressOfDay înlocuiește agregatul din statusuri pentru ziua respectivă", () => {
    const rows = buildUpcoming({
      days, artistOfTour, events, advances, showSlots,
      todayKey: "2026-09-01", limit: 10,
      progressOfDay: new Map([["d2", { done: 3, total: 5 }]]),
    });
    expect(rows[0].advance).toEqual({ done: 3, total: 5 });
    expect(rows[1].advance).toBeNull(); // d1 nu are intrare → comportament vechi
  });
```

În `lib/artistTimeline.test.ts` adaugă un test echivalent pe `buildArtistTimeline(days, advances, progressOfDay)` (al treilea parametru opțional): ziua cu intrare primește `{done:3,total:5}`, cealaltă rămâne pe agregatul vechi.

- [ ] **Step 2: Implementarea (additivă)**

`lib/dashboard.ts`: `UpcomingInput` + `progressOfDay?: ReadonlyMap<string, { done: number; total: number }>`; în `.map()`, `advance = input.progressOfDay?.get(d.id) ?? advance` (după calculul existent). `lib/artistTimeline.ts`: semnătura devine `buildArtistTimeline(days, advances, progressOfDay?)`; același override per zi. Run: `pnpm vitest run lib/dashboard.test.ts lib/artistTimeline.test.ts` → PASS.

- [ ] **Step 3: Paginile**

- **Dashboard** (`app/o/[orgSlug]/page.tsx`): pentru cele max 10 zile din `futureShowDayIds` (deja calculate), încarcă bulk: `advances` cu `layout` + `status` (deja parțial), `event_field_values` pe event-urile lor, `file_categories` required ale org-ului, attachments reale pe zilele respective (`parent_type='day'`, `.in("parent_id", ids)`, `storage_path not null`, `status != 'superseded'` — filtrul `neq` pe enum: `.neq("status", "superseded")`). Construiește `progressOfDay` cu `computeAdvanceProgress` per zi (fallback-ul e în helper) și paseaz-o la `buildUpcoming`. Cardul next event primește automat valoarea prin `upcoming[0]`.
- **Timeline artist** (`a/[artistSlug]/page.tsx`): identic, dar DOAR pentru zilele viitoare (`date >= todayKey`) — zilele trecute rămân pe agregatul vechi (ieftin și suficient, decizie de spec).

- [ ] **Step 4: Verifică + commit**

Run: `node scripts/check-i18n.mjs && pnpm exec tsc --noEmit && pnpm vitest run && pnpm build` → exit 0.

```bash
git add lib/dashboard.ts lib/dashboard.test.ts lib/artistTimeline.ts lib/artistTimeline.test.ts "app/o/[orgSlug]/page.tsx" "app/o/[orgSlug]/a/[artistSlug]/page.tsx"
git commit -m "feat: procentul de advancing calculat propagat în dashboard și timeline

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

`superpowers:requesting-code-review` (main model), cu ledger-ul de minors ca input de triaj.

- [ ] **Step 3: Merge gate + deploy**

Opțiunile de integrare; după decizia utilizatorului: migrarea `00030` pe producție + `pnpm run deploy` (atenție: `pnpm run deploy`, nu `pnpm deploy`; eroarea `color-string` pe exFAT e non-fatală — verifică `/api/version`), apoi smoke prin Chrome per spec §4 (categorie obligatorie + câmp obligatoriu → procent viu pe dashboard; versiune nouă cu istoric; placeholder overdue cu badge; cleanup).
