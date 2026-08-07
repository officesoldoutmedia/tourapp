# Reverse Scheduling (C2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Programul zilei se generează din stage time (T): itemii template-urilor de program pot fi ancorați „relativ la show" (T−8h, T+30min), ziua se schițează la creare, iar „Recalculează" mută neconfirmații când se schimbă ora.

**Architecture:** Logica pură (generare, recalcul, capture, format offset) trăiește în `lib/scheduleGeneration.ts` (TDD). Acțiunile existente `applyScheduleTemplate`/`saveScheduleAsTemplate` devin consumatori subțiri. Proveniența generării se stochează pe `schedule_items` (`generated_anchor`/`generated_offset_min`, pattern-ul `generated_key` din SP3a). Deal-ul leagă un template de program (`deal_templates.schedule_template_id`) folosit DOAR la pre-popularea wizard-ului. Editor nou de template-uri în settings hub (pattern `file-categories`).

**Tech Stack:** Next.js App Router (breaking changes — `params`/`searchParams` sunt Promises; citește `node_modules/next/dist/docs/` la nevoie), Supabase (Postgres, RLS existent), next-intl (chei în AMBELE `messages/ro.json` + `messages/en.json`), vitest, date-fns-tz prin `lib/datetime.ts`.

## Global Constraints

- `anchor` absent pe un item de template = `"day"` (minute de la 00:00 local, comportamentul de azi) — template-urile existente rămân valide fără conversie.
- La `anchor: "show"`, `offset_min` e SEMNAT față de T: −480 = T−8h, +30 = T+30min.
- Coloanele de proveniență se numesc exact `generated_anchor` (`text`, doar `'show'` sau null) și `generated_offset_min` (`integer`).
- Slotul Show = itemul cu `title === SHOW_SLOT_TITLE` (`lib/showSlot.ts`, match exact, netradus); primul cu `start_at` non-null în ordinea `start_at asc`.
- „Recalculează" mută DOAR itemii cu `generated_anchor='show'` și `is_confirmed=false` (nesterși); durata existentă se păstrează (end nou = start nou + durata veche).
- Itemii `show` fără T disponibil se inserează cu `start_at=null` și `time_priority` = rangul în ordinea crescătoare a offset-urilor.
- Itemii `day` NU primesc proveniență (rămân cu `generated_anchor=null`).
- Capture pe zi cu slot Show timpat: itemii timpați → `anchor:"show"` cu offset semnat față de T; slotul Show EXCLUS din template; itemii netimpați → ca azi (`offset_min: 0`, fără anchor). Zi fără slot Show → capture-ul actual neschimbat.
- Ordinea în wizard: slotul Show se creează ÎNAINTE de aplicarea template-ului.
- Offset-uri validate la ±24h (|offset_min| ≤ 1440) în editorul din settings.
- Formatul capsulei de offset: `T` (0), `T−8h`, `T+30min`, `T−1h30` (semnul − e U+2212).
- Chei i18n noi în AMBELE fișiere; verificare `node scripts/check-i18n.mjs`.
- Migrarea `00032_reverse_scheduling.sql` e strict aditivă; ZERO politici RLS noi.
- Ora în DB rămâne UTC; itemii `day` trec prin `scheduleInterval` (tz-aware); itemii `show` = aritmetică pe instant (`showAt.getTime() + offset*60000`).

---

### Task 1: Migrarea 00032

**Files:**
- Create: `supabase/migrations/00032_reverse_scheduling.sql`

**Interfaces:**
- Produces: coloanele `schedule_items.generated_anchor text` / `schedule_items.generated_offset_min integer` și `deal_templates.schedule_template_id uuid` (FK `schedule_templates`, on delete set null) — folosite de Task 3, 4, 6.

- [ ] **Step 1: Scrie migrarea**

```sql
-- C2 reverse scheduling: proveniența generării pe schedule_items +
-- legătura deal → template de program. Aditivă, zero politici noi —
-- coloanele călătoresc pe RLS-ul existent (schedule_items prin zi→tur,
-- deal_templates prin artist).

alter table public.schedule_items
  add column generated_anchor text check (generated_anchor in ('show')),
  add column generated_offset_min integer;

comment on column public.schedule_items.generated_anchor is
  'C2: null = item manual / oră fixă; ''show'' = generat relativ la stage time (T). Recalculează atinge doar ''show'' + neconfirmat.';
comment on column public.schedule_items.generated_offset_min is
  'C2: offset semnat în minute față de T (−480 = T−8h). Sursa recalculului.';

alter table public.deal_templates
  add column schedule_template_id uuid
    references public.schedule_templates (id) on delete set null;

comment on column public.deal_templates.schedule_template_id is
  'C2: template-ul de program pre-populat în wizard la alegerea deal-ului. Folosit DOAR la creare — programul aplicat e copie (regula snapshot).';
```

- [ ] **Step 2: Aplică local și verifică suita RLS**

Run: `supabase db reset` (aplică toate migrările local), apoi `bash scripts/test-rls.sh`
Expected: toate fazele verzi (`RLS TESTS: OK`) — migrarea nu schimbă nicio politică.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/00032_reverse_scheduling.sql
git commit -m "feat: migrarea 00032 — proveniență reverse scheduling + deal→schedule template"
```

---

### Task 2: `lib/scheduleGeneration.ts` (TDD)

**Files:**
- Create: `lib/scheduleGeneration.ts`
- Test: `lib/scheduleGeneration.test.ts`

**Interfaces:**
- Consumes: `scheduleInterval` din `lib/datetime.ts`; `SHOW_SLOT_TITLE` din `lib/showSlot.ts`.
- Produces (semnături EXACTE, folosite de Task 3, 4, 5):
  - `ScheduleTemplateItem` — `{ title: string; offset_min: number; duration_min?: number; type?: "schedule" | "publicity"; anchor?: "day" | "show" }`
  - `GeneratedScheduleRow` — `{ title: string; item_type: "schedule" | "publicity"; start_at: string | null; end_at: string | null; sort_order: number; time_priority: number; generated_anchor: "show" | null; generated_offset_min: number | null }`
  - `buildScheduleRows(input: { items: ScheduleTemplateItem[]; date: string; tz: string; showAt: Date | null }): GeneratedScheduleRow[]`
  - `recalcScheduleUpdates(items: RecalcItem[], showAt: Date): { id: string; start_at: string; end_at: string | null }[]` unde `RecalcItem = { id: string; start_at: string | null; end_at: string | null; is_confirmed: boolean; generated_anchor: string | null; generated_offset_min: number | null }`
  - `captureTemplateItems(items: CaptureItem[], tz: string, show: { id: string; startAt: Date } | null): ScheduleTemplateItem[]` unde `CaptureItem = { id: string; title: string; item_type: "schedule" | "publicity"; start_at: string | null; end_at: string | null }`
  - `findShowSlot<T extends { title: string; start_at: string | null }>(items: T[]): T | null`
  - `formatShowOffset(min: number): string`
  - `minutesToClock(total: number): string`

- [ ] **Step 1: Scrie testele (failing)**

```ts
// lib/scheduleGeneration.test.ts
import { describe, expect, it } from "vitest";
import {
  buildScheduleRows,
  captureTemplateItems,
  findShowSlot,
  formatShowOffset,
  minutesToClock,
  recalcScheduleUpdates,
} from "./scheduleGeneration";

// Zi de referință: 2026-09-15, Europe/Bucharest (EEST, UTC+3).
const DATE = "2026-09-15";
const TZ = "Europe/Bucharest";
// Show 22:30 local = 19:30 UTC.
const SHOW_AT = new Date("2026-09-15T19:30:00.000Z");

describe("buildScheduleRows", () => {
  it("itemii day se calculează ca azi (tz-aware), fără proveniență", () => {
    const rows = buildScheduleRows({
      items: [{ title: "Breakfast", offset_min: 9 * 60, duration_min: 30 }],
      date: DATE, tz: TZ, showAt: SHOW_AT,
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].start_at).toBe("2026-09-15T06:00:00.000Z"); // 09:00 EEST
    expect(rows[0].end_at).toBe("2026-09-15T06:30:00.000Z");
    expect(rows[0].generated_anchor).toBeNull();
    expect(rows[0].generated_offset_min).toBeNull();
    expect(rows[0].time_priority).toBe(0);
  });

  it("itemii show primesc T+offset și proveniența", () => {
    const rows = buildScheduleRows({
      items: [
        { title: "Load-in", offset_min: -480, anchor: "show" },
        { title: "Load-out", offset_min: 90, duration_min: 60, anchor: "show" },
      ],
      date: DATE, tz: TZ, showAt: SHOW_AT,
    });
    expect(rows[0].start_at).toBe("2026-09-15T11:30:00.000Z"); // T−8h = 14:30 EEST
    expect(rows[0].generated_anchor).toBe("show");
    expect(rows[0].generated_offset_min).toBe(-480);
    // T+1h30 = 24:00 → peste miezul nopții, rămâne pe aceeași zi (day_id)
    expect(rows[1].start_at).toBe("2026-09-15T21:00:00.000Z");
    expect(rows[1].end_at).toBe("2026-09-15T22:00:00.000Z");
  });

  it("fără T: itemii show intră fără oră, cu time_priority din ordinea offset-urilor", () => {
    const rows = buildScheduleRows({
      items: [
        { title: "Load-out", offset_min: 90, anchor: "show" },
        { title: "Fix", offset_min: 600 },
        { title: "Load-in", offset_min: -480, anchor: "show" },
      ],
      date: DATE, tz: TZ, showAt: null,
    });
    const loadOut = rows.find((r) => r.title === "Load-out")!;
    const loadIn = rows.find((r) => r.title === "Load-in")!;
    const fix = rows.find((r) => r.title === "Fix")!;
    expect(loadIn.start_at).toBeNull();
    expect(loadIn.generated_anchor).toBe("show");
    expect(loadIn.time_priority).toBe(0); // −480 înaintea lui +90
    expect(loadOut.time_priority).toBe(1);
    expect(fix.start_at).toBe("2026-09-15T07:00:00.000Z"); // day items neafectate
  });

  it("sort_order urmează ordinea din template", () => {
    const rows = buildScheduleRows({
      items: [
        { title: "A", offset_min: 0, anchor: "show" },
        { title: "B", offset_min: 60 },
      ],
      date: DATE, tz: TZ, showAt: SHOW_AT,
    });
    expect(rows.map((r) => r.sort_order)).toEqual([0, 1]);
  });
});

describe("recalcScheduleUpdates", () => {
  const base = {
    end_at: null, is_confirmed: false,
    generated_anchor: "show", generated_offset_min: -480,
  };
  it("mută doar neconfirmații generați relativ la show", () => {
    const updates = recalcScheduleUpdates(
      [
        { id: "a", start_at: "2026-09-15T10:00:00.000Z", ...base },
        { id: "b", start_at: "2026-09-15T10:00:00.000Z", ...base, is_confirmed: true },
        { id: "c", start_at: "2026-09-15T10:00:00.000Z", ...base, generated_anchor: null },
        { id: "d", start_at: null, ...base, generated_offset_min: null },
      ],
      SHOW_AT,
    );
    expect(updates).toEqual([
      { id: "a", start_at: "2026-09-15T11:30:00.000Z", end_at: null },
    ]);
  });
  it("păstrează durata actuală a itemului", () => {
    const updates = recalcScheduleUpdates(
      [{
        id: "a", start_at: "2026-09-15T10:00:00.000Z",
        end_at: "2026-09-15T10:45:00.000Z", is_confirmed: false,
        generated_anchor: "show", generated_offset_min: 90,
      }],
      SHOW_AT,
    );
    expect(updates[0].start_at).toBe("2026-09-15T21:00:00.000Z");
    expect(updates[0].end_at).toBe("2026-09-15T21:45:00.000Z");
  });
  it("itemii netimpați generați se așază la recalcul", () => {
    const updates = recalcScheduleUpdates(
      [{
        id: "a", start_at: null, end_at: null, is_confirmed: false,
        generated_anchor: "show", generated_offset_min: -120,
      }],
      SHOW_AT,
    );
    expect(updates[0].start_at).toBe("2026-09-15T17:30:00.000Z");
    expect(updates[0].end_at).toBeNull();
  });
});

describe("captureTemplateItems", () => {
  const show = { id: "show-1", startAt: SHOW_AT };
  it("cu slot Show: itemii timpați devin relativi la T, Show-ul e exclus", () => {
    const items = captureTemplateItems(
      [
        { id: "show-1", title: "Show", item_type: "schedule", start_at: SHOW_AT.toISOString(), end_at: null },
        { id: "b", title: "Load-in", item_type: "schedule", start_at: "2026-09-15T11:30:00.000Z", end_at: "2026-09-15T12:30:00.000Z" },
        { id: "c", title: "De confirmat", item_type: "schedule", start_at: null, end_at: null },
      ],
      TZ, show,
    );
    expect(items).toEqual([
      { title: "Load-in", offset_min: -480, duration_min: 60, type: "schedule", anchor: "show" },
      { title: "De confirmat", offset_min: 0, type: "schedule" },
    ]);
  });
  it("fără slot Show: comportamentul de azi (oră fixă din ceasul local)", () => {
    const items = captureTemplateItems(
      [{ id: "b", title: "Breakfast", item_type: "schedule", start_at: "2026-09-15T06:00:00.000Z", end_at: null }],
      TZ, null,
    );
    expect(items).toEqual([
      { title: "Breakfast", offset_min: 540, type: "schedule" }, // 09:00 EEST
    ]);
  });
});

describe("findShowSlot", () => {
  it("primul item «Show» cu oră", () => {
    const show = findShowSlot([
      { title: "Show", start_at: null },
      { title: "Load-in", start_at: "x" },
      { title: "Show", start_at: "2026-09-15T19:30:00.000Z" },
    ]);
    expect(show?.start_at).toBe("2026-09-15T19:30:00.000Z");
  });
  it("null când nu există", () => {
    expect(findShowSlot([{ title: "Load-in", start_at: "x" }])).toBeNull();
  });
});

describe("formatShowOffset", () => {
  it.each([
    [0, "T"],
    [-480, "T−8h"],
    [30, "T+30min"],
    [-90, "T−1h30"],
    [150, "T+2h30"],
  ])("%i → %s", (min, expected) => {
    expect(formatShowOffset(min)).toBe(expected);
  });
});

describe("minutesToClock", () => {
  it("wrap la 24h", () => {
    expect(minutesToClock(90)).toBe("01:30");
    expect(minutesToClock(1500)).toBe("01:00");
  });
});
```

- [ ] **Step 2: Rulează testele — trebuie să pice**

Run: `npx vitest run lib/scheduleGeneration.test.ts`
Expected: FAIL — modulul nu există.

- [ ] **Step 3: Implementarea**

```ts
// lib/scheduleGeneration.ts
/**
 * C2 reverse scheduling (spec §2) — logica pură de generare/recalcul.
 * Itemii `day` (default) trec prin scheduleInterval (tz-aware, ca azi);
 * itemii `show` sunt aritmetică pe instant: T + offset_min.
 */
import { scheduleInterval } from "./datetime";
import { SHOW_SLOT_TITLE } from "./showSlot";

export interface ScheduleTemplateItem {
  title: string;
  offset_min: number;
  duration_min?: number;
  type?: "schedule" | "publicity";
  anchor?: "day" | "show";
}

export interface GeneratedScheduleRow {
  title: string;
  item_type: "schedule" | "publicity";
  start_at: string | null;
  end_at: string | null;
  sort_order: number;
  time_priority: number;
  generated_anchor: "show" | null;
  generated_offset_min: number | null;
}

export interface RecalcItem {
  id: string;
  start_at: string | null;
  end_at: string | null;
  is_confirmed: boolean;
  generated_anchor: string | null;
  generated_offset_min: number | null;
}

export interface CaptureItem {
  id: string;
  title: string;
  item_type: "schedule" | "publicity";
  start_at: string | null;
  end_at: string | null;
}

export function minutesToClock(total: number): string {
  const rest = ((total % 1440) + 1440) % 1440;
  const h = String(Math.floor(rest / 60)).padStart(2, "0");
  const m = String(rest % 60).padStart(2, "0");
  return `${h}:${m}`;
}

export function buildScheduleRows(input: {
  items: ScheduleTemplateItem[];
  date: string;
  tz: string;
  showAt: Date | null;
}): GeneratedScheduleRow[] {
  // Rangul itemilor show în ordinea offset-urilor — time_priority-ul
  // fallback-ului netimpat (spec §2: secvența logică fără ore).
  const showRank = new Map<number, number>();
  input.items
    .map((item, idx) => ({ item, idx }))
    .filter(({ item }) => item.anchor === "show")
    .sort((a, b) => a.item.offset_min - b.item.offset_min)
    .forEach(({ idx }, rank) => showRank.set(idx, rank));

  return input.items.map((item, idx) => {
    const itemType = item.type ?? "schedule";
    if (item.anchor === "show") {
      if (input.showAt) {
        const start = new Date(input.showAt.getTime() + item.offset_min * 60000);
        const end = item.duration_min
          ? new Date(start.getTime() + item.duration_min * 60000)
          : null;
        return {
          title: item.title, item_type: itemType,
          start_at: start.toISOString(), end_at: end?.toISOString() ?? null,
          sort_order: idx, time_priority: 0,
          generated_anchor: "show", generated_offset_min: item.offset_min,
        };
      }
      return {
        title: item.title, item_type: itemType,
        start_at: null, end_at: null,
        sort_order: idx, time_priority: showRank.get(idx) ?? 0,
        generated_anchor: "show", generated_offset_min: item.offset_min,
      };
    }
    // Ancora "day" — identic cu aplicarea de azi.
    const start = minutesToClock(item.offset_min);
    const end = item.duration_min
      ? minutesToClock(item.offset_min + item.duration_min)
      : null;
    const interval = scheduleInterval({ date: input.date, tz: input.tz, start, end });
    return {
      title: item.title, item_type: itemType,
      start_at: interval.startAt.toISOString(),
      end_at: interval.endAt?.toISOString() ?? null,
      sort_order: idx, time_priority: 0,
      generated_anchor: null, generated_offset_min: null,
    };
  });
}

export function recalcScheduleUpdates(
  items: RecalcItem[],
  showAt: Date,
): { id: string; start_at: string; end_at: string | null }[] {
  return items
    .filter(
      (i) =>
        i.generated_anchor === "show" &&
        !i.is_confirmed &&
        i.generated_offset_min != null,
    )
    .map((i) => {
      const start = new Date(showAt.getTime() + i.generated_offset_min! * 60000);
      let end: string | null = null;
      if (i.start_at && i.end_at) {
        const duration =
          new Date(i.end_at).getTime() - new Date(i.start_at).getTime();
        end = new Date(start.getTime() + duration).toISOString();
      }
      return { id: i.id, start_at: start.toISOString(), end_at: end };
    });
}

export function captureTemplateItems(
  items: CaptureItem[],
  tz: string,
  show: { id: string; startAt: Date } | null,
): ScheduleTemplateItem[] {
  const source = show ? items.filter((i) => i.id !== show.id) : items;
  return source.map((item) => {
    let durationMin: number | undefined;
    if (item.start_at && item.end_at) {
      const d = Math.round(
        (new Date(item.end_at).getTime() - new Date(item.start_at).getTime()) / 60000,
      );
      if (d > 0) durationMin = d;
    }
    if (show && item.start_at) {
      const offset = Math.round(
        (new Date(item.start_at).getTime() - show.startAt.getTime()) / 60000,
      );
      return {
        title: item.title, offset_min: offset,
        ...(durationMin != null ? { duration_min: durationMin } : {}),
        type: item.item_type, anchor: "show" as const,
      };
    }
    // Fără reper de show sau item netimpat — ceasul local al zilei, ca azi.
    let offsetMin = 0;
    if (item.start_at) {
      const local = new Intl.DateTimeFormat("en-GB", {
        timeZone: tz, hour: "2-digit", minute: "2-digit", hourCycle: "h23",
      }).format(new Date(item.start_at));
      const [h, m] = local.split(":").map(Number);
      offsetMin = h * 60 + m;
    }
    return {
      title: item.title, offset_min: offsetMin,
      ...(durationMin != null ? { duration_min: durationMin } : {}),
      type: item.item_type,
    };
  });
}

export function findShowSlot<T extends { title: string; start_at: string | null }>(
  items: T[],
): T | null {
  return items.find((i) => i.title === SHOW_SLOT_TITLE && i.start_at) ?? null;
}

/** Capsula de offset: T, T−8h, T+30min, T−1h30 (− = U+2212). */
export function formatShowOffset(min: number): string {
  if (min === 0) return "T";
  const sign = min < 0 ? "−" : "+";
  const abs = Math.abs(min);
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  if (h && m) return `T${sign}${h}h${String(m).padStart(2, "0")}`;
  if (h) return `T${sign}${h}h`;
  return `T${sign}${m}min`;
}
```

- [ ] **Step 4: Rulează testele — verzi**

Run: `npx vitest run lib/scheduleGeneration.test.ts`
Expected: PASS (toate).

- [ ] **Step 5: Commit**

```bash
git add lib/scheduleGeneration.ts lib/scheduleGeneration.test.ts
git commit -m "feat: lib/scheduleGeneration — generare T+offset, recalcul, capture, format (TDD)"
```

---

### Task 3: Capture + aplicare cu T (day actions + ordinea din wizard)

**Files:**
- Modify: `app/o/[orgSlug]/t/[tourId]/d/[date]/actions.ts:158-283` (`saveScheduleAsTemplate`, `applyScheduleTemplate`, șterge `minutesToClock` local)
- Modify: `app/o/[orgSlug]/events/new/actions.ts:169-195` (inversează pașii 4 și 5)

**Interfaces:**
- Consumes (Task 2): `buildScheduleRows`, `captureTemplateItems`, `findShowSlot`, `ScheduleTemplateItem`.
- Produces: `applyScheduleTemplate(orgSlug, tourId, date, dayId, templateId)` — semnătură NESCHIMBATĂ (consumată de day-client și wizard); scrie acum și `time_priority`, `generated_anchor`, `generated_offset_min`.

- [ ] **Step 1: Rescrie `saveScheduleAsTemplate`**

Înlocuiește corpul (păstrează semnătura). Selectul de itemi primește `id` în plus; logica de offset se mută în `captureTemplateItems`:

```ts
/** [C] "Save As Template" — cu slot Show timpat, itemii timpați devin
 *  relativi la T (slotul Show e exclus — el e reperul); altfel oră fixă,
 *  ca înainte (spec C2 §2). */
export async function saveScheduleAsTemplate(
  orgSlug: string,
  tourId: string,
  date: string,
  dayId: string,
  name: string,
): Promise<{ error?: string }> {
  const { supabase, org } = await requireEditor(orgSlug);
  if (!name.trim()) return { error: "name_required" };

  const [{ data: day }, { data: items }] = await Promise.all([
    supabase.from("days").select("date, timezone").eq("id", dayId).single(),
    supabase
      .from("schedule_items")
      .select("id, title, item_type, start_at, end_at, sort_order")
      .eq("day_id", dayId)
      .is("deleted_at", null)
      .order("start_at", { ascending: true, nullsFirst: false }),
  ]);
  if (!day) return { error: "day_not_found" };

  const show = findShowSlot(items ?? []);
  const templateItems = captureTemplateItems(
    (items ?? []) as CaptureItem[],
    day.timezone ?? "UTC",
    show?.start_at ? { id: show.id, startAt: new Date(show.start_at) } : null,
  );

  const { error } = await supabase.from("schedule_templates").insert({
    organization_id: org.id,
    name: name.trim(),
    items: templateItems,
  });
  if (error) return { error: error.message };
  return {};
}
```

Importurile noi în capul fișierului:

```ts
import {
  buildScheduleRows,
  captureTemplateItems,
  findShowSlot,
  type CaptureItem,
  type ScheduleTemplateItem,
} from "@/lib/scheduleGeneration";
```

- [ ] **Step 2: Rescrie `applyScheduleTemplate`**

```ts
/** [C] Aplicarea unui template pe ziua curentă. C2: itemii cu anchor "show"
 *  se calculează din slotul Show al zilei; fără slot Show intră fără oră și
 *  se așază la primul „Recalculează". */
export async function applyScheduleTemplate(
  orgSlug: string,
  tourId: string,
  date: string,
  dayId: string,
  templateId: string,
): Promise<{ error?: string }> {
  const { supabase, user } = await requireEditor(orgSlug);

  const [{ data: day }, { data: template }, { data: existing }] = await Promise.all([
    supabase.from("days").select("date, timezone").eq("id", dayId).single(),
    supabase
      .from("schedule_templates")
      .select("items")
      .eq("id", templateId)
      .single(),
    supabase
      .from("schedule_items")
      .select("id, title, start_at")
      .eq("day_id", dayId)
      .is("deleted_at", null)
      .order("start_at", { ascending: true, nullsFirst: false }),
  ]);
  if (!day || !template) return { error: "not_found" };

  const show = findShowSlot(existing ?? []);
  const rows = buildScheduleRows({
    items: (template.items ?? []) as ScheduleTemplateItem[],
    date: day.date,
    tz: day.timezone ?? "UTC",
    showAt: show?.start_at ? new Date(show.start_at) : null,
  }).map((row) => ({ ...row, day_id: dayId, updated_by: user.id }));

  if (rows.length > 0) {
    const { error } = await supabase.from("schedule_items").insert(rows);
    if (error) return { error: error.message };
  }
  revalidatePath(dayPath(orgSlug, tourId, date));
  return {};
}
```

Șterge funcția locală `minutesToClock` (mutată în lib la Task 2).

- [ ] **Step 3: Inversează pașii 4/5 în wizard**

În `app/o/[orgSlug]/events/new/actions.ts`, mută blocul „5. Slotul Show la stage time" ÎNAINTEA blocului „4. Template de program", ca T să existe când se aplică template-ul. Renumerotează comentariile (4 = slotul Show, 5 = template-ul) și adaugă la comentariul template-ului: `// (după slotul Show — itemii "relativ la show" au nevoie de T la generare, C2)`. Conținutul blocurilor rămâne identic.

- [ ] **Step 4: Verificări**

Run: `npx tsc --noEmit && npx vitest run`
Expected: ambele verzi (289+ teste).

- [ ] **Step 5: Commit**

```bash
git add app/o/\[orgSlug\]/t/\[tourId\]/d/\[date\]/actions.ts app/o/\[orgSlug\]/events/new/actions.ts
git commit -m "feat: capture + aplicare template cu T; slotul Show înaintea template-ului în wizard"
```

---

### Task 4: „Recalculează" + capsulele de offset pe pagina de zi

**Files:**
- Modify: `app/o/[orgSlug]/t/[tourId]/d/[date]/actions.ts` (acțiune nouă `recalcSchedule`)
- Modify: `app/o/[orgSlug]/t/[tourId]/d/[date]/page.tsx:66-76` (selectul de schedule_items + coloanele noi)
- Modify: `app/o/[orgSlug]/t/[tourId]/d/[date]/day-client.tsx:82-267` (buton + capsule; extinde `ScheduleItemData`)
- Modify: `messages/ro.json`, `messages/en.json` (namespace `schedule`)

**Interfaces:**
- Consumes (Task 2): `recalcScheduleUpdates`, `findShowSlot`, `formatShowOffset`; (Task 1) coloanele de proveniență.
- Produces: `recalcSchedule(orgSlug: string, tourId: string, date: string, dayId: string): Promise<{ error?: string; moved?: number }>`.

- [ ] **Step 1: Acțiunea `recalcSchedule`**

Adaugă în `d/[date]/actions.ts`, după `confirmAllSchedule` (importă și `recalcScheduleUpdates` din lib):

```ts
/** [C2] Recalculează — mută itemii generați relativ la show (neconfirmați)
 *  la noul T. Confirmații și itemii manuali nu se ating. */
export async function recalcSchedule(
  orgSlug: string,
  tourId: string,
  date: string,
  dayId: string,
): Promise<{ error?: string; moved?: number }> {
  const { supabase } = await requireEditor(orgSlug);
  const { data: items } = await supabase
    .from("schedule_items")
    .select("id, title, start_at, end_at, is_confirmed, generated_anchor, generated_offset_min")
    .eq("day_id", dayId)
    .is("deleted_at", null)
    .order("start_at", { ascending: true, nullsFirst: false });

  const show = findShowSlot(items ?? []);
  if (!show?.start_at) return { error: "no_show_slot" };

  const updates = recalcScheduleUpdates(items ?? [], new Date(show.start_at));
  for (const u of updates) {
    const { error } = await supabase
      .from("schedule_items")
      .update({ start_at: u.start_at, end_at: u.end_at })
      .eq("id", u.id);
    if (error) return { error: error.message };
  }
  revalidatePath(dayPath(orgSlug, tourId, date));
  return { moved: updates.length };
}
```

- [ ] **Step 2: Selectul paginii + tipul**

În `page.tsx`, adaugă `generated_anchor, generated_offset_min` la selectul de `schedule_items` (linia ~70). În `day-client.tsx`, extinde tipul `ScheduleItemData` (definit local sau importat — caută `interface ScheduleItemData` / `type ScheduleItemData` în fișier ori în modulul de tipuri al paginii) cu:

```ts
  generated_anchor: string | null;
  generated_offset_min: number | null;
```

- [ ] **Step 3: Butonul + capsulele în `ScheduleSection`**

Importă în `day-client.tsx`:

```ts
import { formatShowOffset } from "@/lib/scheduleGeneration";
import { SHOW_SLOT_TITLE } from "@/lib/showSlot";
import { recalcSchedule } from "./actions"; // alături de importurile existente de acțiuni
```

În `ScheduleSection`, înainte de `return`:

```ts
  const hasShowSlot = items.some(
    (i) => i.title === SHOW_SLOT_TITLE && i.start_at,
  );
```

Butonul, imediat DUPĂ butonul „Confirm all" (păstrează stilul identic):

```tsx
            <button
              disabled={pending || !hasShowSlot}
              title={hasShowSlot ? undefined : t("recalcNoShow")}
              onClick={() => run(() => recalcSchedule(orgSlug, tourId, day.date, day.id))}
              className="rounded border border-hairline px-2 py-1 text-xs font-medium disabled:opacity-40"
            >
              {t("recalc")}
            </button>
```

Capsula de offset — în rândul itemului, imediat după `<span>`-ul cu titlul/detaliile (înaintea capsulei confirmed/unconfirmed), doar pe itemii generați neconfirmați:

```tsx
              {item.generated_anchor === "show" &&
                item.generated_offset_min != null &&
                !item.is_confirmed && (
                  <span className="shrink-0 rounded-full bg-fill-control px-2 py-0.5 font-mono text-[10px] text-secondary">
                    {formatShowOffset(item.generated_offset_min)}
                  </span>
                )}
```

- [ ] **Step 4: Cheile i18n**

În `messages/ro.json`, namespace `schedule` (lângă `confirmAll`):

```json
"recalc": "Recalculează",
"recalcNoShow": "Adaugă întâi slotul „Show" cu oră — el e reperul offset-urilor."
```

În `messages/en.json`:

```json
"recalc": "Recalculate",
"recalcNoShow": "Add the \"Show\" slot with a time first — it anchors the offsets."
```

- [ ] **Step 5: Verificări + commit**

Run: `node scripts/check-i18n.mjs && npx tsc --noEmit && npx vitest run`
Expected: toate verzi.

```bash
git add app/o/\[orgSlug\]/t/\[tourId\]/d/\[date\]/ messages/ro.json messages/en.json
git commit -m "feat: butonul Recalculează + capsule de offset pe programul zilei"
```

---

### Task 5: Settings — „Template-uri de program"

**Files:**
- Create: `app/o/[orgSlug]/settings/schedule-templates/page.tsx`
- Create: `app/o/[orgSlug]/settings/schedule-templates/actions.ts`
- Create: `app/o/[orgSlug]/settings/schedule-templates/templates-client.tsx`
- Modify: `app/o/[orgSlug]/settings/page.tsx:85-89` (link nou în hub, după `file-categories`)
- Modify: `messages/ro.json`, `messages/en.json` (namespace nou `scheduleTemplates` + linkul din `settings`)

**Interfaces:**
- Consumes (Task 2): `ScheduleTemplateItem`, `minutesToClock`, `formatShowOffset`.
- Produces: `saveScheduleTemplate(orgSlug, input: { id?: string; name: string; items: ScheduleTemplateItem[] })`, `deleteScheduleTemplate(orgSlug, templateId)` — folosite doar aici.

- [ ] **Step 1: Acțiunile**

```ts
// app/o/[orgSlug]/settings/schedule-templates/actions.ts
"use server";

/** C2 — CRUD pe template-urile de program (org-level). Gate identic cu
 *  restul editării de conținut (`edit_tour_content`); RLS-ul existent pe
 *  schedule_templates validează oricum org-ul. */
import { revalidatePath } from "next/cache";
import { requireOrg } from "@/lib/org";
import { can } from "@/lib/permissions";
import type { ScheduleTemplateItem } from "@/lib/scheduleGeneration";

async function requireEditor(orgSlug: string) {
  const ctx = await requireOrg(orgSlug);
  if (!can({ tier: ctx.tier, permission: ctx.permission }, "edit_tour_content")) {
    throw new Error("forbidden");
  }
  return ctx;
}

const TYPES = new Set(["schedule", "publicity"]);

function normalizeItems(items: ScheduleTemplateItem[]): ScheduleTemplateItem[] | null {
  const out: ScheduleTemplateItem[] = [];
  for (const item of items) {
    const title = item.title?.trim();
    if (!title) return null;
    const anchor = item.anchor === "show" ? "show" : undefined;
    const offset = Math.round(Number(item.offset_min));
    if (!Number.isFinite(offset)) return null;
    // ±24h (spec §4); ancora day e un ceas — [0, 1440)
    if (anchor === "show" && Math.abs(offset) > 1440) return null;
    if (!anchor && (offset < 0 || offset >= 1440)) return null;
    const duration = Math.round(Number(item.duration_min ?? 0));
    const type = item.type && TYPES.has(item.type) ? item.type : "schedule";
    out.push({
      title,
      offset_min: offset,
      ...(duration > 0 && duration <= 1440 ? { duration_min: duration } : {}),
      type,
      ...(anchor ? { anchor } : {}),
    });
  }
  return out;
}

export async function saveScheduleTemplate(
  orgSlug: string,
  input: { id?: string; name: string; items: ScheduleTemplateItem[] },
): Promise<{ error?: string }> {
  const { supabase, org } = await requireEditor(orgSlug);
  const name = input.name.trim();
  if (!name) return { error: "invalid" };
  const items = normalizeItems(input.items);
  if (!items) return { error: "invalid" };

  let error;
  if (input.id) {
    ({ error } = await supabase
      .from("schedule_templates")
      .update({ name, items })
      .eq("id", input.id)
      .eq("organization_id", org.id));
  } else {
    ({ error } = await supabase
      .from("schedule_templates")
      .insert({ organization_id: org.id, name, items }));
  }
  if (error) return { error: error.message };
  revalidatePath(`/o/${orgSlug}/settings/schedule-templates`);
  return {};
}

export async function deleteScheduleTemplate(
  orgSlug: string,
  templateId: string,
): Promise<{ error?: string }> {
  const { supabase, org } = await requireEditor(orgSlug);
  const { error } = await supabase
    .from("schedule_templates")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", templateId)
    .eq("organization_id", org.id);
  if (error) return { error: error.message };
  revalidatePath(`/o/${orgSlug}/settings/schedule-templates`);
  return {};
}
```

- [ ] **Step 2: Pagina (server)**

```tsx
// app/o/[orgSlug]/settings/schedule-templates/page.tsx
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { requireOrg } from "@/lib/org";
import { can } from "@/lib/permissions";
import type { ScheduleTemplateItem } from "@/lib/scheduleGeneration";
import { TemplatesClient } from "./templates-client";

/** C2 — editorul template-urilor de program (org-level). Gate UX identic cu
 *  file-categories; RLS validează oricum scrierile. */
export default async function ScheduleTemplatesPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;
  const { supabase, org, permission, tier } = await requireOrg(orgSlug);
  const t = await getTranslations("scheduleTemplates");
  if (!can({ tier, permission }, "edit_tour_content")) notFound();

  const { data: templates } = await supabase
    .from("schedule_templates")
    .select("id, name, items")
    .eq("organization_id", org.id)
    .is("deleted_at", null)
    .order("name");

  return (
    <main className="mx-auto w-full max-w-2xl space-y-6 p-6">
      <div>
        <h1 className="font-display text-xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="mt-1 text-xs text-tertiary">{t("hint")}</p>
      </div>
      <TemplatesClient
        orgSlug={orgSlug}
        templates={(templates ?? []).map((tpl) => ({
          id: tpl.id as string,
          name: tpl.name as string,
          items: (tpl.items ?? []) as ScheduleTemplateItem[],
        }))}
      />
    </main>
  );
}
```

- [ ] **Step 3: Clientul**

```tsx
// app/o/[orgSlug]/settings/schedule-templates/templates-client.tsx
"use client";

/** C2 — editor de itemi pe template: titlu, ancoră (oră fixă / relativ la
 *  show), offset, durată, tip; reordonare ↑↓; ștergere template. */
import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import {
  formatShowOffset,
  minutesToClock,
  type ScheduleTemplateItem,
} from "@/lib/scheduleGeneration";
import { deleteScheduleTemplate, saveScheduleTemplate } from "./actions";

interface TemplateData {
  id: string;
  name: string;
  items: ScheduleTemplateItem[];
}

const inputCls = "rounded border border-hairline bg-surface px-2 py-1 text-sm";

function clockToMinutes(clock: string): number {
  const [h, m] = clock.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

export function TemplatesClient({
  orgSlug,
  templates,
}: {
  orgSlug: string;
  templates: TemplateData[];
}) {
  const t = useTranslations("scheduleTemplates");
  const tc = useTranslations("common");
  const [openId, setOpenId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [pending, startTransition] = useTransition();

  function run(fn: () => Promise<{ error?: string }>) {
    startTransition(async () => {
      const result = await fn();
      if (!result?.error) {
        setOpenId(null);
        setCreating(false);
      }
    });
  }

  return (
    <div className="space-y-4">
      {templates.length === 0 && !creating && (
        <p className="text-sm text-secondary">{t("empty")}</p>
      )}

      <ul className="divide-y divide-hairline rounded-[12px] border border-hairline bg-surface empty:hidden">
        {templates.map((tpl) => (
          <li key={tpl.id} className="p-3">
            {openId === tpl.id ? (
              <TemplateForm
                initial={tpl}
                pending={pending}
                onCancel={() => setOpenId(null)}
                onSave={(input) => run(() => saveScheduleTemplate(orgSlug, input))}
                onDelete={() => {
                  if (window.confirm(`${t("delete")}?`)) {
                    run(() => deleteScheduleTemplate(orgSlug, tpl.id));
                  }
                }}
              />
            ) : (
              <div className="flex items-center gap-3">
                <span className="min-w-0 flex-1">
                  <span className="text-sm font-medium">{tpl.name}</span>
                  <span className="block text-xs text-secondary">
                    {t("itemCount", { count: tpl.items.length })}
                    {tpl.items.some((i) => i.anchor === "show") &&
                      ` · ${t("hasShowAnchors")}`}
                  </span>
                </span>
                <button
                  title={tc("edit")}
                  onClick={() => {
                    setCreating(false);
                    setOpenId(tpl.id);
                  }}
                  className="rounded px-1.5 py-0.5 text-xs hover:bg-subtle"
                >
                  ✎
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>

      {creating ? (
        <div className="rounded-[12px] border border-hairline bg-surface p-3">
          <TemplateForm
            initial={null}
            pending={pending}
            onCancel={() => setCreating(false)}
            onSave={(input) => run(() => saveScheduleTemplate(orgSlug, input))}
          />
        </div>
      ) : (
        <button
          onClick={() => {
            setOpenId(null);
            setCreating(true);
          }}
          className="btn-quiet h-7 px-2.5"
        >
          + {t("add")}
        </button>
      )}
    </div>
  );
}

function TemplateForm({
  initial,
  pending,
  onCancel,
  onSave,
  onDelete,
}: {
  initial: TemplateData | null;
  pending: boolean;
  onCancel: () => void;
  onSave: (input: { id?: string; name: string; items: ScheduleTemplateItem[] }) => void;
  onDelete?: () => void;
}) {
  const t = useTranslations("scheduleTemplates");
  const tc = useTranslations("common");
  const [name, setName] = useState(initial?.name ?? "");
  const [items, setItems] = useState<ScheduleTemplateItem[]>(initial?.items ?? []);

  function patch(idx: number, part: Partial<ScheduleTemplateItem>) {
    setItems((list) => list.map((it, i) => (i === idx ? { ...it, ...part } : it)));
  }
  function move(idx: number, dir: -1 | 1) {
    setItems((list) => {
      const next = [...list];
      const swap = idx + dir;
      if (swap < 0 || swap >= next.length) return list;
      [next[idx], next[swap]] = [next[swap], next[idx]];
      return next;
    });
  }

  return (
    <div className="space-y-3">
      <label className="block space-y-1">
        <span className="text-xs font-semibold uppercase tracking-wide text-secondary">
          {t("nameLabel")}
        </span>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className={`${inputCls} w-full`}
        />
      </label>

      <ul className="space-y-2">
        {items.map((item, idx) => (
          <li key={idx} className="flex flex-wrap items-center gap-2 rounded-md border border-hairline p-2">
            <input
              value={item.title}
              onChange={(e) => patch(idx, { title: e.target.value })}
              placeholder={t("itemTitle")}
              aria-label={t("itemTitle")}
              className={`${inputCls} min-w-32 flex-1`}
            />
            <select
              value={item.anchor === "show" ? "show" : "day"}
              aria-label={t("anchorLabel")}
              onChange={(e) =>
                e.target.value === "show"
                  ? patch(idx, { anchor: "show", offset_min: 0 })
                  : patch(idx, { anchor: undefined, offset_min: 0 })
              }
              className={inputCls}
            >
              <option value="day">{t("anchorDay")}</option>
              <option value="show">{t("anchorShow")}</option>
            </select>
            {item.anchor === "show" ? (
              <span className="flex items-center gap-1">
                <select
                  value={item.offset_min < 0 ? "before" : "after"}
                  aria-label={t("directionLabel")}
                  onChange={(e) =>
                    patch(idx, {
                      offset_min:
                        (e.target.value === "before" ? -1 : 1) *
                        Math.abs(item.offset_min),
                    })
                  }
                  className={inputCls}
                >
                  <option value="before">{t("before")}</option>
                  <option value="after">{t("after")}</option>
                </select>
                <input
                  type="number"
                  min={0}
                  max={1440}
                  value={Math.abs(item.offset_min)}
                  aria-label={t("offsetMinutes")}
                  onChange={(e) =>
                    patch(idx, {
                      offset_min:
                        (item.offset_min < 0 ? -1 : 1) *
                        Math.min(1440, Math.abs(Number(e.target.value) || 0)),
                    })
                  }
                  className={`${inputCls} w-20`}
                />
                <span className="font-mono text-xs text-secondary">
                  {formatShowOffset(item.offset_min)}
                </span>
              </span>
            ) : (
              <input
                type="time"
                value={minutesToClock(item.offset_min)}
                aria-label={t("fixedTime")}
                onChange={(e) => patch(idx, { offset_min: clockToMinutes(e.target.value) })}
                className={inputCls}
              />
            )}
            <input
              type="number"
              min={0}
              max={1440}
              value={item.duration_min ?? ""}
              placeholder={t("durationMin")}
              aria-label={t("durationMin")}
              onChange={(e) =>
                patch(idx, {
                  duration_min: Number(e.target.value) > 0 ? Number(e.target.value) : undefined,
                })
              }
              className={`${inputCls} w-20`}
            />
            <span className="flex shrink-0 items-center gap-0.5">
              <button
                disabled={idx === 0}
                aria-label={t("moveUp")}
                onClick={() => move(idx, -1)}
                className="flex h-7 w-7 items-center justify-center rounded text-secondary hover:bg-fill-control disabled:opacity-30"
              >
                ↑
              </button>
              <button
                disabled={idx === items.length - 1}
                aria-label={t("moveDown")}
                onClick={() => move(idx, 1)}
                className="flex h-7 w-7 items-center justify-center rounded text-secondary hover:bg-fill-control disabled:opacity-30"
              >
                ↓
              </button>
              <button
                aria-label={t("deleteItem")}
                onClick={() => setItems((list) => list.filter((_, i) => i !== idx))}
                className="rounded px-1.5 py-0.5 text-xs text-danger hover:bg-danger-subtle"
              >
                🗑
              </button>
            </span>
          </li>
        ))}
      </ul>

      <button
        onClick={() =>
          setItems((list) => [...list, { title: "", offset_min: 0, type: "schedule" }])
        }
        className="btn-quiet h-7 px-2.5"
      >
        + {t("addItem")}
      </button>

      <div className="flex items-center gap-2">
        <button
          disabled={pending || !name.trim() || items.some((i) => !i.title.trim())}
          onClick={() => onSave({ id: initial?.id, name, items })}
          className="btn-primary h-8 px-3 disabled:opacity-50"
        >
          {tc("save")}
        </button>
        <button onClick={onCancel} className="btn-quiet h-8 px-3">
          {tc("cancel")}
        </button>
        {onDelete && (
          <button
            disabled={pending}
            onClick={onDelete}
            className="ml-auto rounded px-2 py-1 text-xs text-danger hover:bg-danger-subtle"
          >
            {t("delete")}
          </button>
        )}
      </div>
    </div>
  );
}
```

Notă: `window.confirm` e folosit și de C1 (`deal-card-client`) — pattern acceptat în proiect.

- [ ] **Step 4: Linkul din hub**

În `app/o/[orgSlug]/settings/page.tsx`, după `<li>`-ul de `file-categories` (linia ~89):

```tsx
        <li>
          <Link href={`/o/${orgSlug}/settings/schedule-templates`} className="block px-4 py-3 hover:bg-subtle">
            🕘 {tSchedule("title")}
          </Link>
        </li>
```

cu `const tSchedule = await getTranslations("scheduleTemplates");` lângă celelalte `getTranslations` din fișier.

- [ ] **Step 5: Cheile i18n**

`messages/ro.json`, namespace nou `scheduleTemplates` (top-level, ordonat alfabetic lângă vecini):

```json
"scheduleTemplates": {
  "title": "Template-uri de program",
  "hint": "Itemii „Relativ la show" se generează din stage time (T) și se mută cu „Recalculează". Itemii „Oră fixă" rămân pe ceas.",
  "empty": "Niciun template încă. Salvează unul dintr-o zi („Save as template") sau creează unul gol.",
  "add": "Template nou",
  "delete": "Șterge template-ul",
  "nameLabel": "Nume",
  "itemCount": "{count, plural, one {# item} few {# itemi} other {# de itemi}}",
  "hasShowAnchors": "cu offset-uri de show",
  "itemTitle": "Titlu",
  "anchorLabel": "Ancoră",
  "anchorDay": "Oră fixă",
  "anchorShow": "Relativ la show",
  "directionLabel": "Direcție",
  "before": "Înainte de show",
  "after": "După show",
  "offsetMinutes": "Minute",
  "fixedTime": "Ora",
  "durationMin": "Durată (min)",
  "addItem": "Adaugă item",
  "deleteItem": "Șterge itemul",
  "moveUp": "Mută mai sus",
  "moveDown": "Mută mai jos"
}
```

`messages/en.json`:

```json
"scheduleTemplates": {
  "title": "Schedule templates",
  "hint": "\"Relative to show\" items are generated from stage time (T) and move with \"Recalculate\". \"Fixed time\" items stay on the clock.",
  "empty": "No templates yet. Save one from a day (\"Save as template\") or create an empty one.",
  "add": "New template",
  "delete": "Delete template",
  "nameLabel": "Name",
  "itemCount": "{count, plural, one {# item} other {# items}}",
  "hasShowAnchors": "with show offsets",
  "itemTitle": "Title",
  "anchorLabel": "Anchor",
  "anchorDay": "Fixed time",
  "anchorShow": "Relative to show",
  "directionLabel": "Direction",
  "before": "Before show",
  "after": "After show",
  "offsetMinutes": "Minutes",
  "fixedTime": "Time",
  "durationMin": "Duration (min)",
  "addItem": "Add item",
  "deleteItem": "Delete item",
  "moveUp": "Move up",
  "moveDown": "Move down"
}
```

- [ ] **Step 6: Verificări + commit**

Run: `node scripts/check-i18n.mjs && npx tsc --noEmit && npx vitest run`
Expected: toate verzi.

```bash
git add app/o/\[orgSlug\]/settings/ messages/ro.json messages/en.json
git commit -m "feat: pagina settings Template-uri de program — editor itemi cu ancore"
```

---

### Task 6: Deal → template de program (tab Deals + wizard)

**Files:**
- Modify: `app/o/[orgSlug]/a/[artistSlug]/deals/actions.ts:28-109` (`DealTemplateInput` + validare + payload)
- Modify: `app/o/[orgSlug]/a/[artistSlug]/deals/page.tsx` (încarcă template-urile de program, extinde selectul de deals)
- Modify: `app/o/[orgSlug]/a/[artistSlug]/deals/deals-client.tsx` (select nou în formular + starea)
- Modify: `app/o/[orgSlug]/events/new/page.tsx:44` (query-ul de deals + `schedule_template_id`)
- Modify: `app/o/[orgSlug]/events/new/form.tsx:20,59-64,202-216` (tipul prop-ului + pre-popularea la alegerea deal-ului)
- Modify: `messages/ro.json`, `messages/en.json` (namespace `deals`)

**Interfaces:**
- Consumes (Task 1): coloana `deal_templates.schedule_template_id`.
- Produces: `DealTemplateInput.scheduleTemplateId: string | null`; prop-ul `dealTemplates` din wizard devine `{ id: string; name: string; artist_id: string; schedule_template_id: string | null }[]`.

- [ ] **Step 1: Acțiunea de salvare**

În `deals/actions.ts` — `DealTemplateInput` primește câmpul:

```ts
  scheduleTemplateId: string | null;
```

În `saveDealTemplate`, înainte de construcția `payload`:

```ts
  // C2: legătura deal → template de program. Validăm explicit org-ul —
  // un membru multi-org ar putea trimite id-ul unui template din alt org
  // (RLS pe deal_templates leagă artistul, nu template-ul de program).
  let scheduleTemplateId: string | null = null;
  if (input.scheduleTemplateId) {
    const { data: tpl } = await supabase
      .from("schedule_templates")
      .select("id, organization_id")
      .eq("id", input.scheduleTemplateId)
      .is("deleted_at", null)
      .maybeSingle();
    if (!tpl || tpl.organization_id !== org.id) return { error: "invalid" };
    scheduleTemplateId = tpl.id;
  }
```

și în `payload`: `schedule_template_id: scheduleTemplateId,`.

- [ ] **Step 2: Pagina Deals**

În `deals/page.tsx`: selectul de `deal_templates` (linia ~36) primește `schedule_template_id` în listă; adaugă un query paralel de template-uri de program și pasează-l clientului:

```ts
    supabase
      .from("schedule_templates")
      .select("id, name")
      .eq("organization_id", org.id)
      .is("deleted_at", null)
      .order("name"),
```

Prop nou pe `DealsClient`: `scheduleTemplates: { id: string; name: string }[]`.

- [ ] **Step 3: Clientul Deals**

În `deals-client.tsx`:
- `FormState` primește `scheduleTemplateId: string` (gol = fără); inițializarea din template: `tpl.schedule_template_id ?? ""`; `toPayload` trimite `scheduleTemplateId: form.scheduleTemplateId || null`.
- În formular, sub multi-selectul de categorii obligatorii, selectul (același stil cu selecturile existente din formular):

```tsx
        <label className="block space-y-1">
          <span className="text-sm font-medium">{t("scheduleTemplateLabel")}</span>
          <select
            value={form.scheduleTemplateId}
            onChange={(e) => setForm((f) => ({ ...f, scheduleTemplateId: e.target.value }))}
            className="w-full rounded-md border border-hairline bg-surface px-3 py-2 text-sm"
          >
            <option value="">—</option>
            {scheduleTemplates.map((tpl) => (
              <option key={tpl.id} value={tpl.id}>
                {tpl.name}
              </option>
            ))}
          </select>
        </label>
```

- Pe rândul din listă (rezumatul template-ului), dacă deal-ul are template de program legat, o capsulă cu numele lui (caută template-ul în prop-ul `scheduleTemplates` după id; dacă nu-l găsește — șters între timp — nu afișa nimic).

- [ ] **Step 4: Wizard-ul**

`events/new/page.tsx` — query-ul de `deal_templates` selectează și `schedule_template_id`.

`events/new/form.tsx`:
- tipul prop-ului: `dealTemplates: { id: string; name: string; artist_id: string; schedule_template_id: string | null }[]`
- handler-ul selectului de deal devine:

```tsx
            onChange={(e) => {
              const id = e.target.value;
              setDealTemplateId(id);
              // C2: deal-ul aduce template-ul de program (§9.1) — doar dacă
              // are unul legat; alegerea manuală ulterioară rămâne posibilă.
              const tpl = artistDealTemplates.find((d) => d.id === id);
              if (tpl?.schedule_template_id) {
                setScheduleTemplateId(tpl.schedule_template_id);
              }
            }}
```

- [ ] **Step 5: Cheile i18n**

`messages/ro.json`, namespace `deals`: `"scheduleTemplateLabel": "Template de program"`.
`messages/en.json`: `"scheduleTemplateLabel": "Schedule template"`.

- [ ] **Step 6: Verificări + commit**

Run: `node scripts/check-i18n.mjs && npx tsc --noEmit && npx vitest run`
Expected: toate verzi.

```bash
git add app/o/\[orgSlug\]/a/\[artistSlug\]/deals/ app/o/\[orgSlug\]/events/new/ messages/ro.json messages/en.json
git commit -m "feat: deal-ul leagă un template de program; pre-populare în wizard"
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

`superpowers:requesting-code-review` (main model), cu ledger-ul de minors ca input.

- [ ] **Step 3: Merge gate + deploy**

Opțiunile de integrare; după decizia utilizatorului: migrarea `00032` pe producție + `pnpm run deploy` (`pnpm run deploy`, nu `pnpm deploy`; eroarea `color-string` pe exFAT e non-fatală — verifică `/api/version` și retry cu `pnpm install --force` dacă versiunea nu se schimbă). Smoke prin Chrome per spec: template cu offset-uri (Load-in T−8h, Load-out T+30min) pe org-ul SPEAK → deal legat → show nou cu stage time 22:30 → ziua schițată complet (Load-in 14:30) → schimb ora slotului Show la 23:00 → „Recalculează" mută doar neconfirmații (Load-in 15:30) → cleanup complet (soft-delete pe datele de test).
