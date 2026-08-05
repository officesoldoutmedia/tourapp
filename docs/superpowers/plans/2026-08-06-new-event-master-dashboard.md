# New Event one-off + Master Dashboard — Implementation Plan (SP2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show-uri one-off create în bucket-uri per artist/an cu zi pre-populată (template + Show + advancing), iar pagina de org devine Master Dashboard: next event, upcoming, calendar multi-artist cu filtru, roster.

**Architecture:** Spec: `docs/superpowers/specs/2026-08-06-new-event-master-dashboard-design.md`. O coloană nouă (`tours.bucket_year`) + index unic parțial; acțiunea `createOneOffEvent` refolosește `applyScheduleTemplate` și `createAdvance` existente și un helper `resolveVenue` extras din `createEvent`; dashboard-ul e server component cu helperi puri în `lib/`, calendarul e client component pe date pre-încărcate.

**Tech Stack:** Next.js App Router (server components + server actions), Supabase, next-intl, Tailwind cu tokens custom, vitest, teste RLS via `scripts/test-rls.sh`.

## Global Constraints

- **Next.js cu breaking changes** — citește ghidul din `node_modules/next/dist/docs/` înainte de cod de pagini; `params`/`searchParams` sunt Promise-uri.
- **i18n:** orice string UI nou în AMBELE `messages/ro.json` și `messages/en.json`; verificare `node scripts/check-i18n.mjs`.
- **RLS:** schimbările de schemă acoperite în `supabase/tests/*.test.sql`; rulare `bash scripts/test-rls.sh` (userii din faza0: admin `a0…0a`, crew `c0…0c`; faza1 creează artistul `speak` + turul).
- **Convenții schema:** comentarii SQL în română; soft-delete `deleted_at`.
- **Permisiuni:** creare one-off = `manage_tours`; `applyScheduleTemplate`/`createAdvance` cer `edit_tour_content` (același set admin/manager + pro).
- **`SHOW_SLOT_TITLE = "Show"`** (constanta din `lib/showSlot.ts`) — titlul canonic al slotului de show; NU se traduce, NU se hardcodează în alt loc.
- **Deploy:** migrarea `00028` e aditivă fără backfill — fără fereastră de incompatibilitate; migrarea + aplicația se pot lansa independent, migrarea prima.
- **Commit-uri:** per pas, mesaje `feat:`/`test:`/`fix:` + `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.

---

### Task 1: Migrarea bucket_year + test RLS

**Files:**
- Create: `supabase/migrations/00028_bucket_tours.sql`
- Create: `supabase/tests/faza10_bucket_rls.test.sql`

**Interfaces:**
- Produces: `tours.bucket_year int` (NULL = tur normal) + index unic parțial `(artist_id, bucket_year) where bucket_year is not null`. Task 4 face find-or-create pe el (eroare 23505 la duplicat).

- [ ] **Step 1: Scrie testul (pică fără migrare)**

Creează `supabase/tests/faza10_bucket_rls.test.sql`:

```sql
-- ═══ Faza 10 — bucket_year pe tours (one-off shows, SP2) ═══
-- Rulează DUPĂ faza1 (refolosește org-ul, userii și artistul 'speak').
-- ATENȚIE la ordinea alfabetică: 'faza10' sortează ÎNTRE 'faza1' și 'faza2',
-- deci fazele 2–9 rulează după acest fișier — de asta tururile create aici
-- se soft-deletează la final, ca să nu polueze count-urile fazelor următoare.
\set ON_ERROR_STOP on

select id as org_id from public.organizations limit 1 \gset

select set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-00000000000a"}', false);
set role authenticated;

select id as artist_id from public.artists where slug = 'speak' \gset

-- ── Bucket-ul se creează ca tur normal ──
insert into public.tours (organization_id, artist_id, name, bucket_year,
                          start_date, end_date, created_by)
values (:'org_id', :'artist_id', 'SPEAK 2026', 2026,
        '2026-09-01', '2026-09-01', 'a0000000-0000-0000-0000-00000000000a')
returning id as bucket_id \gset
\echo 'PASS: bucket creat ca tur normal'

-- ── Unicitate: al doilea bucket același artist+an → respins ──
do $$ declare aid uuid; oid uuid; begin
  select id into aid from public.artists where slug = 'speak';
  select id into oid from public.organizations limit 1;
  begin
    insert into public.tours (organization_id, artist_id, name, bucket_year, created_by)
    values (oid, aid, 'SPEAK 2026 dup', 2026, 'a0000000-0000-0000-0000-00000000000a');
    raise exception 'FAIL: bucket duplicat acceptat';
  exception when unique_violation then null;
  end;
end $$;
\echo 'PASS: bucket duplicat respins (unique artist+an)'

-- ── TurURILE normale nu sunt afectate: două tururi fără bucket_year, ok ──
do $$ declare aid uuid; oid uuid; begin
  select id into aid from public.artists where slug = 'speak';
  select id into oid from public.organizations limit 1;
  insert into public.tours (organization_id, artist_id, name, created_by)
  values (oid, aid, 'Tur normal A', 'a0000000-0000-0000-0000-00000000000a'),
         (oid, aid, 'Tur normal B', 'a0000000-0000-0000-0000-00000000000a');
end $$;
\echo 'PASS: tururi normale multiple fara bucket_year'

-- ── Crew vede bucket-ul prin politicile normale de tur ──
select set_config('request.jwt.claims', '{"sub":"c0000000-0000-0000-0000-00000000000c"}', false);
do $$ begin
  if not exists (select 1 from public.tours where bucket_year = 2026) then
    raise exception 'FAIL: crew nu vede bucket-ul (default deschis)';
  end if;
end $$;
\echo 'PASS: bucket vizibil prin politicile existente de tur'

-- curatenie: soft-delete pe tururile create aici, sa nu polueze alte faze
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-00000000000a"}', false);
update public.tours set deleted_at = now()
where name in ('SPEAK 2026', 'Tur normal A', 'Tur normal B');

reset role;
```

- [ ] **Step 2: Rulează — pică**

Run: `bash scripts/test-rls.sh`
Expected: FAIL la faza10 cu `column "bucket_year" ... does not exist`.

- [ ] **Step 3: Scrie migrarea**

Creează `supabase/migrations/00028_bucket_tours.sql`:

```sql
-- ═══════════════════════════════════════════════════════════════════
-- SP2 — bucket-uri pentru show-uri one-off. Spec:
-- docs/superpowers/specs/2026-08-06-new-event-master-dashboard-design.md
-- bucket_year NULL = tur normal; 2026 = bucket-ul de one-off-uri al
-- artistului pe anul respectiv (ex. „SPEAK 2026"). Un singur bucket per
-- artist/an — indexul unic parțial face find-or-create-ul race-safe.
-- ═══════════════════════════════════════════════════════════════════

alter table public.tours add column bucket_year int;

create unique index tours_artist_bucket_uq
  on public.tours (artist_id, bucket_year)
  where bucket_year is not null;
```

- [ ] **Step 4: Rulează — trece tot**

Run: `bash scripts/test-rls.sh`
Expected: toate PASS-urile faza0–faza10, exit 0.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/00028_bucket_tours.sql supabase/tests/faza10_bucket_rls.test.sql
git commit -m "feat: bucket_year pe tours — bucket-uri one-off per artist/an

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: Helperii puri (showSlot, dashboard, masterCalendar) — TDD

**Files:**
- Create: `lib/showSlot.ts`
- Create: `lib/dashboard.ts` + `lib/dashboard.test.ts`
- Create: `lib/masterCalendar.ts` + `lib/masterCalendar.test.ts`

**Interfaces:**
- Produces (consumate de Task 4, 5, 6 — semnături exacte):
  - `SHOW_SLOT_TITLE: "Show"` din `lib/showSlot.ts`
  - `buildUpcoming(input: UpcomingInput): UpcomingShow[]` și tipurile `DashboardDay`, `UpcomingShow` din `lib/dashboard.ts`
  - `buildCalendarDots(days, artistOfTour, enabledArtists): Map<string, CalendarDot[]>` și `monthGrid(year, month0): (string | null)[][]` din `lib/masterCalendar.ts`

- [ ] **Step 1: lib/showSlot.ts (fără test — constantă)**

```typescript
/** Titlul canonic al slotului de show. Folosit de wizardul New Event la
 *  creare și de dashboard la citirea stage time-ului. Nu se traduce —
 *  match exact pe titlu (spec §2). */
export const SHOW_SLOT_TITLE = "Show";
```

- [ ] **Step 2: Testele pentru dashboard (pică)**

Creează `lib/dashboard.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { buildUpcoming } from "./dashboard";

const days = [
  { id: "d1", date: "2026-09-10", tour_id: "t1", city: "Bacău", country: "România", day_type: "show" },
  { id: "d2", date: "2026-09-05", tour_id: "t2", city: "Cluj", country: "România", day_type: "show" },
  { id: "d3", date: "2026-09-06", tour_id: "t1", city: null, country: null, day_type: "travel" },
  { id: "d0", date: "2026-08-01", tour_id: "t1", city: "Iași", country: "România", day_type: "show" },
];
const artistOfTour = new Map([["t1", "a1"], ["t2", "a2"]]);
const events = [{ id: "e1", day_id: "d2", title: "Club X" }];
const advances = [
  { event_id: "e1", status: "done" },
  { event_id: "e1", status: "in_progress" },
];
const showSlots = [{ day_id: "d2", start_at: "2026-09-05T19:30:00.000Z" }];

describe("buildUpcoming", () => {
  it("doar zile de show >= azi, sortate cronologic, cu artist/event/advance/stage time", () => {
    const rows = buildUpcoming({
      days, artistOfTour, events, advances, showSlots,
      todayKey: "2026-09-01", limit: 10,
    });
    expect(rows.map((r) => r.dayId)).toEqual(["d2", "d1"]);
    expect(rows[0]).toMatchObject({
      artistId: "a2", eventTitle: "Club X",
      advance: { done: 1, total: 2 },
      stageTime: "2026-09-05T19:30:00.000Z",
    });
    expect(rows[1].advance).toBeNull();
    expect(rows[1].stageTime).toBeNull();
  });
  it("respectă limita", () => {
    const rows = buildUpcoming({
      days, artistOfTour, events, advances, showSlots,
      todayKey: "2026-09-01", limit: 1,
    });
    expect(rows).toHaveLength(1);
  });
});
```

- [ ] **Step 3: Rulează — pică**

Run: `pnpm vitest run lib/dashboard.test.ts`
Expected: FAIL — modulul nu există.

- [ ] **Step 4: Implementează lib/dashboard.ts**

```typescript
/** Agregările pentru Master Dashboard (SP2). Pur — fără fetch. */

export interface DashboardDay {
  id: string;
  date: string; // YYYY-MM-DD
  tour_id: string;
  city: string | null;
  country: string | null;
  day_type: string;
}

export interface UpcomingShow {
  dayId: string;
  date: string;
  tourId: string;
  artistId: string;
  city: string | null;
  country: string | null;
  eventTitle: string | null;
  advance: { done: number; total: number } | null;
  stageTime: string | null; // ISO start_at al slotului Show
}

export interface UpcomingInput {
  days: DashboardDay[];
  artistOfTour: Map<string, string>;
  events: { id: string; day_id: string; title: string | null }[];
  advances: { event_id: string; status: string }[];
  showSlots: { day_id: string; start_at: string }[];
  todayKey: string;
  limit?: number;
}

export function buildUpcoming(input: UpcomingInput): UpcomingShow[] {
  const eventsOfDay = new Map<string, { id: string; title: string | null }[]>();
  for (const e of input.events) {
    const list = eventsOfDay.get(e.day_id) ?? [];
    list.push({ id: e.id, title: e.title });
    eventsOfDay.set(e.day_id, list);
  }
  const advOfEvent = new Map<string, { done: number; total: number }>();
  for (const a of input.advances) {
    const agg = advOfEvent.get(a.event_id) ?? { done: 0, total: 0 };
    agg.total += 1;
    if (a.status === "done") agg.done += 1;
    advOfEvent.set(a.event_id, agg);
  }
  const slotOfDay = new Map<string, string>();
  for (const s of input.showSlots) {
    const prev = slotOfDay.get(s.day_id);
    if (!prev || s.start_at < prev) slotOfDay.set(s.day_id, s.start_at);
  }

  return input.days
    .filter((d) => d.day_type === "show" && d.date >= input.todayKey)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, input.limit ?? 10)
    .map((d) => {
      const artistId = input.artistOfTour.get(d.tour_id);
      const dayEvents = eventsOfDay.get(d.id) ?? [];
      let advance: { done: number; total: number } | null = null;
      for (const e of dayEvents) {
        const agg = advOfEvent.get(e.id);
        if (agg) {
          advance = advance
            ? { done: advance.done + agg.done, total: advance.total + agg.total }
            : { ...agg };
        }
      }
      return {
        dayId: d.id,
        date: d.date,
        tourId: d.tour_id,
        artistId: artistId ?? "",
        city: d.city,
        country: d.country,
        eventTitle: dayEvents[0]?.title ?? null,
        advance,
        stageTime: slotOfDay.get(d.id) ?? null,
      };
    })
    .filter((r) => r.artistId !== "");
}
```

- [ ] **Step 5: Rulează — trece**

Run: `pnpm vitest run lib/dashboard.test.ts`
Expected: PASS (2 teste).

- [ ] **Step 6: Testele pentru masterCalendar (pică)**

Creează `lib/masterCalendar.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { buildCalendarDots, monthGrid } from "./masterCalendar";

describe("monthGrid", () => {
  it("septembrie 2026 începe marți — o zi de padding (săptămâna începe luni)", () => {
    const weeks = monthGrid(2026, 8); // month0 = 8 → septembrie
    expect(weeks[0][0]).toBeNull(); // luni 31 aug = padding
    expect(weeks[0][1]).toBe("2026-09-01");
    expect(weeks.at(-1)!.some((d) => d === "2026-09-30")).toBe(true);
  });
});

describe("buildCalendarDots", () => {
  const days = [
    { id: "d1", date: "2026-09-05", tour_id: "t1", city: null, country: null, day_type: "show" },
    { id: "d2", date: "2026-09-05", tour_id: "t2", city: null, country: null, day_type: "travel" },
  ];
  const artistOfTour = new Map([["t1", "a1"], ["t2", "a2"]]);
  it("grupează pe dată cu artistId și isShow", () => {
    const dots = buildCalendarDots(days, artistOfTour, new Set(["a1", "a2"]));
    expect(dots.get("2026-09-05")).toEqual([
      { date: "2026-09-05", artistId: "a1", tourId: "t1", isShow: true },
      { date: "2026-09-05", artistId: "a2", tourId: "t2", isShow: false },
    ]);
  });
  it("filtrul pe artiști exclude punctele dezactivate", () => {
    const dots = buildCalendarDots(days, artistOfTour, new Set(["a2"]));
    expect(dots.get("2026-09-05")).toHaveLength(1);
    expect(dots.get("2026-09-05")![0].artistId).toBe("a2");
  });
});
```

- [ ] **Step 7: Rulează — pică; implementează lib/masterCalendar.ts**

Run: `pnpm vitest run lib/masterCalendar.test.ts` → FAIL, apoi:

```typescript
/** Gruparea zilelor pentru calendarul multi-artist (SP2). Pur — fără fetch. */
import type { DashboardDay } from "./dashboard";

export interface CalendarDot {
  date: string;
  artistId: string;
  tourId: string;
  isShow: boolean;
}

/** Grilă lunară cu săptămâni care încep LUNI; null = padding. */
export function monthGrid(year: number, month0: number): (string | null)[][] {
  const first = new Date(Date.UTC(year, month0, 1));
  const daysInMonth = new Date(Date.UTC(year, month0 + 1, 0)).getUTCDate();
  const lead = (first.getUTCDay() + 6) % 7; // 0 = luni
  const cells: (string | null)[] = Array(lead).fill(null);
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push(
      `${year}-${String(month0 + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`,
    );
  }
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks: (string | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

export function buildCalendarDots(
  days: DashboardDay[],
  artistOfTour: ReadonlyMap<string, string>,
  enabledArtists: ReadonlySet<string>,
): Map<string, CalendarDot[]> {
  const out = new Map<string, CalendarDot[]>();
  for (const d of days) {
    const artistId = artistOfTour.get(d.tour_id);
    if (!artistId || !enabledArtists.has(artistId)) continue;
    const list = out.get(d.date) ?? [];
    list.push({ date: d.date, artistId, tourId: d.tour_id, isShow: d.day_type === "show" });
    out.set(d.date, list);
  }
  return out;
}
```

- [ ] **Step 8: Rulează tot + commit**

Run: `pnpm vitest run` → toate verzi (250 + noile).

```bash
git add lib/showSlot.ts lib/dashboard.ts lib/dashboard.test.ts lib/masterCalendar.ts lib/masterCalendar.test.ts
git commit -m "feat: helperi puri SP2 — showSlot, dashboard upcoming, master calendar

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: Extrage resolveVenue din createEvent (refactor pur)

**Files:**
- Create: `app/o/[orgSlug]/t/[tourId]/d/[date]/e/venue-resolve.ts`
- Modify: `app/o/[orgSlug]/t/[tourId]/d/[date]/e/actions.ts`

**Interfaces:**
- Produces: din `venue-resolve.ts` (fără directiva `"use server"` — modul normal):
  - `interface VenueInput { venueId?: string; newVenue?: { name: string; city: string; country: string }; googleVenue?: GooglePlaceResult; ignoreDuplicates?: boolean }`
  - `interface ResolveVenueResult { venueId: string | null; venueName: string | null; error?: string; duplicates?: VenueHit[] }`
  - `resolveVenue(supabase, orgId: string, input: VenueInput): Promise<ResolveVenueResult>`
  - tipul `VenueHit` și helper-ele `normalize`, `findDuplicates` se MUTĂ aici din `actions.ts`
- Comportamentul lui `createEvent` rămâne IDENTIC (inclusiv dialogul de duplicate).

- [ ] **Step 1: Creează venue-resolve.ts prin mutare, nu rescriere**

Deschide `app/o/[orgSlug]/t/[tourId]/d/[date]/e/actions.ts` și mută în noul fișier `venue-resolve.ts`, VERBATIM: `normalize`, `findDuplicates`, `interface VenueHit`, plus cele trei blocuri de rezolvare venue din corpul `createEvent` (googleVenue → insert venue sursă `google`; newVenue → duplicate check + insert `manual`; venueId → lookup nume), împachetate în:

```typescript
import type { GooglePlaceResult } from "@/lib/googlePlaces";
import type { requireOrg } from "@/lib/org";

type Supabase = Awaited<ReturnType<typeof requireOrg>>["supabase"];

export interface VenueInput {
  venueId?: string;
  newVenue?: { name: string; city: string; country: string };
  googleVenue?: GooglePlaceResult;
  ignoreDuplicates?: boolean;
}

export interface ResolveVenueResult {
  venueId: string | null;
  venueName: string | null;
  error?: string;
  duplicates?: VenueHit[];
}

export async function resolveVenue(
  supabase: Supabase,
  orgId: string,
  input: VenueInput,
): Promise<ResolveVenueResult> {
  // corpul = cele trei blocuri mutate din createEvent, cu
  // `return { duplicates }` / `return { error }` mapate pe ResolveVenueResult
  // și final `return { venueId, venueName }`.
}
```

În `actions.ts`: importă `resolveVenue`, `VenueInput`, `VenueHit` din `./venue-resolve`; `createEvent` devine: apel `resolveVenue` + maparea rezultatului pe `CreateEventResult` (duplicates/error propagate identic) + insertul de event + redirect — neschimbate. `searchVenues` continuă să folosească `normalize` importat. Re-exportă tipul pentru consumatorii existenți: `export type { VenueHit } from "./venue-resolve";` (export de tip — permis în module `"use server"`, se șterge la compilare). Verifică toți importatorii: `grep -rn "VenueHit" app --include="*.ts" --include="*.tsx"` și actualizează ce importă direct.

- [ ] **Step 2: Verifică echivalența**

Run: `pnpm exec tsc --noEmit && pnpm vitest run && pnpm build`
Expected: toate exit 0 — refactor pur, zero schimbări de comportament.

- [ ] **Step 3: Commit**

```bash
git add "app/o/[orgSlug]/t/[tourId]/d/[date]/e/venue-resolve.ts" "app/o/[orgSlug]/t/[tourId]/d/[date]/e/actions.ts"
git commit -m "refactor: extrage resolveVenue din createEvent (pregătire SP2)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: createOneOffEvent + pagina /events/new

**Files:**
- Create: `app/o/[orgSlug]/events/new/actions.ts`
- Create: `app/o/[orgSlug]/events/new/page.tsx`
- Create: `app/o/[orgSlug]/events/new/form.tsx`
- Modify: `app/o/[orgSlug]/a/[artistSlug]/page.tsx` (buton „Show nou" lângă „Tur nou")
- Modify: `messages/ro.json`, `messages/en.json` (namespace nou `newEvent`)

**Interfaces:**
- Consumes: `bucket_year` (Task 1), `SHOW_SLOT_TITLE` (Task 2), `resolveVenue`/`VenueInput` (Task 3), `applyScheduleTemplate(orgSlug, tourId, date, dayId, templateId)` din `d/[date]/actions.ts`, `createAdvance(orgSlug, tourId, date, eventId, title, templateId?)` din `advance/actions.ts`, `searchVenues(orgSlug, query)` din `e/actions.ts` (server action apelabilă din client), `scheduleInterval` din `@/lib/datetime`, `suggestTimezone`/`DEFAULT_TZ` din `@/lib/tzLookup`.
- Produces: `createOneOffEvent(orgSlug: string, payload: OneOffPayload): Promise<{ error?: string }>` cu `OneOffPayload = { artistId: string; date: string; city: string; country: string; eventName?: string; stageTime?: string; scheduleTemplateId?: string | null; advanceTemplateId?: string | null; venue?: VenueInput | null }`. Task 5 pune butonul „Show nou" pe dashboard către `/o/{slug}/events/new`.

- [ ] **Step 1: Acțiunea**

Creează `app/o/[orgSlug]/events/new/actions.ts`:

```typescript
"use server";

import { redirect } from "next/navigation";
import { requireOrg } from "@/lib/org";
import { can } from "@/lib/permissions";
import { scheduleInterval } from "@/lib/datetime";
import { DEFAULT_TZ, suggestTimezone } from "@/lib/tzLookup";
import { SHOW_SLOT_TITLE } from "@/lib/showSlot";
import { resolveVenue, type VenueInput } from "../../t/[tourId]/d/[date]/e/venue-resolve";
import { applyScheduleTemplate } from "../../t/[tourId]/d/[date]/actions";
import { createAdvance } from "../../t/[tourId]/d/[date]/e/[eventId]/advance/actions";

export interface OneOffPayload {
  artistId: string;
  date: string; // YYYY-MM-DD
  city: string;
  country: string;
  eventName?: string;
  stageTime?: string; // HH:MM local
  scheduleTemplateId?: string | null;
  advanceTemplateId?: string | null;
  venue?: VenueInput | null;
}

export async function createOneOffEvent(
  orgSlug: string,
  payload: OneOffPayload,
): Promise<{ error?: string }> {
  const { supabase, org, permission, tier, user } = await requireOrg(orgSlug);
  if (!can({ tier, permission }, "manage_tours")) return { error: "forbidden" };
  if (!payload.artistId || !/^\d{4}-\d{2}-\d{2}$/.test(payload.date ?? "")) {
    return { error: "invalid" };
  }

  // Artistul aparține org-ului (regula din SP1 — FK-ul ocolește RLS).
  const { data: artist } = await supabase
    .from("artists")
    .select("id, name")
    .eq("id", payload.artistId)
    .eq("organization_id", org.id)
    .maybeSingle();
  if (!artist) return { error: "invalid" };

  // 1. Find-or-create bucket „{Artist} {an}" — race-safe prin indexul unic:
  //    insertul pierzător pică pe 23505 și reia select-ul.
  const year = Number(payload.date.slice(0, 4));
  const bucketQuery = () =>
    supabase
      .from("tours")
      .select("id, start_date, end_date")
      .eq("artist_id", artist.id)
      .eq("bucket_year", year)
      .is("deleted_at", null)
      .maybeSingle();

  let { data: bucket } = await bucketQuery();
  if (!bucket) {
    const ins = await supabase.from("tours").insert({
      organization_id: org.id,
      artist_id: artist.id,
      name: `${artist.name} ${year}`,
      bucket_year: year,
      start_date: payload.date,
      end_date: payload.date,
      created_by: user.id,
    });
    if (ins.error && ins.error.code !== "23505") return { error: ins.error.message };
    ({ data: bucket } = await bucketQuery());
  }
  if (!bucket) return { error: "bucket_failed" };

  // Extinde intervalul bucket-ului să acopere data nouă.
  const patch: Record<string, string> = {};
  if (!bucket.start_date || payload.date < bucket.start_date) patch.start_date = payload.date;
  if (!bucket.end_date || payload.date > bucket.end_date) patch.end_date = payload.date;
  if (Object.keys(patch).length > 0) {
    await supabase.from("tours").update(patch).eq("id", bucket.id);
  }

  // 2. Ziua: find-or-create; la coliziune template-ul NU se re-aplică
  //    dacă ziua are deja schedule items (spec §1).
  const timezone = suggestTimezone(payload.country) ?? DEFAULT_TZ;
  let { data: day } = await supabase
    .from("days")
    .select("id")
    .eq("tour_id", bucket.id)
    .eq("date", payload.date)
    .is("deleted_at", null)
    .maybeSingle();
  let dayHadSchedule = false;
  if (day) {
    const { count } = await supabase
      .from("schedule_items")
      .select("id", { count: "exact", head: true })
      .eq("day_id", day.id)
      .is("deleted_at", null);
    dayHadSchedule = (count ?? 0) > 0;
  } else {
    const created = await supabase
      .from("days")
      .insert({
        tour_id: bucket.id,
        date: payload.date,
        day_type: "show",
        city: payload.city.trim() || null,
        country: payload.country.trim() || null,
        timezone,
      })
      .select("id")
      .single();
    if (created.error || !created.data) {
      return { error: created.error?.message ?? "day_failed" };
    }
    day = created.data;
  }

  // 3. Venue (opțional) + event. Wizard-ul sare peste dialogul de duplicate
  //    (ignoreDuplicates: true) — org hits apar oricum primele în căutare.
  let venueId: string | null = null;
  let venueName: string | null = null;
  if (payload.venue) {
    const resolved = await resolveVenue(supabase, org.id, {
      ...payload.venue,
      ignoreDuplicates: true,
    });
    if (resolved.error) return { error: resolved.error };
    venueId = resolved.venueId;
    venueName = resolved.venueName;
  }
  const title = payload.eventName?.trim() || venueName || payload.city.trim() || null;
  const ev = await supabase
    .from("events")
    .insert({ day_id: day.id, venue_id: venueId, title })
    .select("id")
    .single();
  if (ev.error || !ev.data) return { error: ev.error?.message ?? "event_failed" };

  // 4. Template de program — doar dacă ziua nu avea deja schedule (spec §1).
  if (payload.scheduleTemplateId && !dayHadSchedule) {
    const res = await applyScheduleTemplate(
      orgSlug, bucket.id, payload.date, day.id, payload.scheduleTemplateId,
    );
    if (res.error) return { error: res.error };
  }

  // 5. Slotul Show la stage time (titlu canonic, confirmat).
  if (payload.stageTime) {
    const interval = scheduleInterval({
      date: payload.date,
      tz: timezone,
      start: payload.stageTime,
      end: null,
    });
    const { error } = await supabase.from("schedule_items").insert({
      day_id: day.id,
      title: SHOW_SLOT_TITLE,
      item_type: "schedule",
      start_at: interval.startAt.toISOString(),
      end_at: null,
      is_confirmed: true,
      updated_by: user.id,
    });
    if (error) return { error: error.message };
  }

  // 6. Advancing din template (mereu — advance-ul e al event-ului nou).
  if (payload.advanceTemplateId) {
    const res = await createAdvance(
      orgSlug, bucket.id, payload.date, ev.data.id, "Advance", payload.advanceTemplateId,
    );
    if (res.error) return { error: res.error };
  }

  redirect(`/o/${orgSlug}/t/${bucket.id}/d/${payload.date}`);
}
```

Verifică semnătura exactă a lui `scheduleInterval` în `lib/datetime.ts` (folosită identic în `applyScheduleTemplate`) și câmpurile insertului în `schedule_items` față de `upsertScheduleItem` din `d/[date]/actions.ts` — copiază convențiile de acolo dacă diferă (ex. `is_confirmed` vs alt nume).

- [ ] **Step 2: Pagina**

Creează `app/o/[orgSlug]/events/new/page.tsx` — server component (pattern `tours/new/page.tsx`): gate `manage_tours` (altfel `redirect(`/o/${orgSlug}`)`); încarcă în paralel: artiștii activi (`id, name` — query-ul din tours/new), `schedule_templates` (`id, name`), `advance_templates` (`id, title`), toate org-scoped, `deleted_at` null unde există; citește `searchParams` (Promise) pentru `artist`; randează `<NewEventForm>` cu toate + `defaultArtistId`.

- [ ] **Step 3: Formularul client**

Creează `app/o/[orgSlug]/events/new/form.tsx` (client, pattern `tours/new/wizard.tsx` — `useState` + `useTransition`, buton disabled cât timp `!artistId || !date || !city`):

- select artist (preselect `defaultArtistId` sau singurul activ), date picker, input city, input country (default „România"), input nume event, input `type="time"` stage time;
- select template program (opțiune „—" = fără) și select template advancing (idem);
- **venue:** input text + buton „Caută" → apelează server action-ul `searchVenues(orgSlug, query)` importat din `../../t/[tourId]/d/[date]/e/actions`; rezultatele (max 20 `VenueHit`) se afișează ca listă radio: fiecare hit org/catalog → setează `venue = { venueId: hit.id }`; hit google → `venue = { googleVenue: hit.google }` (câmpul `google` există pe hit-urile cu `source: "google"` — vezi `searchVenues`); opțiuni suplimentare: „Fără venue" (default, `venue = null`) și „Creează «{query}» manual" → `venue = { newVenue: { name: query, city, country } }` cu city/country din formular;
- submit → `createOneOffEvent(orgSlug, payload)`; eroare → mesajul generic al convenției (`text-danger`).

- [ ] **Step 4: Butonul de pe pagina artistului**

În `app/o/[orgSlug]/a/[artistSlug]/page.tsx`, lângă butonul „Tur nou" existent (gate `manage_tours`), adaugă înaintea lui un link `btn-primary` către `/o/${orgSlug}/events/new?artist=${artist.id}` cu eticheta `t("newShow")` (cheie nouă în namespace-ul `artist`).

- [ ] **Step 5: i18n**

Namespace nou `newEvent` în AMBELE fișiere (ro / en):

```json
"newEvent": {
  "title": "Show nou",
  "artistLabel": "Artist",
  "dateLabel": "Dată",
  "cityLabel": "Oraș",
  "countryLabel": "Țară",
  "nameLabel": "Nume event (opțional)",
  "stageTimeLabel": "Stage time (opțional)",
  "scheduleTemplateLabel": "Template program",
  "advanceTemplateLabel": "Template advancing",
  "noTemplate": "—",
  "venueLabel": "Venue",
  "venueSearch": "Caută venue",
  "venueNone": "Fără venue",
  "venueCreate": "Creează „{name}”",
  "create": "Creează show-ul",
  "creating": "Se creează…"
}
```

(en: `"New show" / "Artist" / "Date" / "City" / "Country" / "Event name (optional)" / "Stage time (optional)" / "Schedule template" / "Advancing template" / "—" / "Venue" / "Search venue" / "No venue" / "Create \"{name}\"" / "Create show" / "Creating…"`). Plus în namespace-ul `artist`: `"newShow": "Show nou"` / `"New show"`.

- [ ] **Step 6: Verifică**

Run: `node scripts/check-i18n.mjs && pnpm exec tsc --noEmit && pnpm vitest run`
Expected: exit 0 peste tot.

- [ ] **Step 7: Commit**

```bash
git add "app/o/[orgSlug]/events" "app/o/[orgSlug]/a/[artistSlug]/page.tsx" messages/ro.json messages/en.json
git commit -m "feat: flow Show nou — one-off cu bucket, template, stage time, advancing

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: Master Dashboard (coloana stângă)

**Files:**
- Modify: `app/o/[orgSlug]/page.tsx`
- Modify: `messages/ro.json`, `messages/en.json` (namespace nou `dashboard`)

**Interfaces:**
- Consumes: `buildUpcoming`/`UpcomingShow`/`DashboardDay` (Task 2), `SHOW_SLOT_TITLE` (Task 2), ruta `/o/{slug}/events/new` (Task 4). Grila de artiști + metricile existente rămân.
- Produces: pagina încarcă și pasează mai departe datele pe care Task 6 le va da calendarului: `artists` (id, name, slug, color, photo), `allDays: DashboardDay[]`, `artistOfTour: Map<string,string>`, `upcoming: UpcomingShow[]`. Task 6 doar re-așază layout-ul — nu re-derivă datele.

- [ ] **Step 1: Extinde datele paginii**

În `app/o/[orgSlug]/page.tsx` (păstrând TOT ce există — MetricStrip, roster grid, empty states):

- extinde query-ul de zile existent (folosit la metrici) să ia `id, date, city, country, tour_id, day_type` pentru TOATE zilele tururilor active (scoate `.eq("day_type", "show")` — filtrarea se face în helperi; metricile existente se recalculează din același set filtrând `day_type === "show"` în memorie);
- maparea tur→artist există deja (Task 3 SP1) — refolosește-o ca `artistOfTour`;
- pentru zilele de show viitoare (max 10 după `todayKey`): `events` (`id, day_id, title`) cu `.in("day_id", ids)`, `advances` (`event_id, status`) cu `.in("event_id", eventIds)`, și `schedule_items` (`day_id, start_at`) cu `.in("day_id", ids).eq("title", SHOW_SLOT_TITLE).is("deleted_at", null)` — toate cu guard pe array gol (pattern-ul din `a/[artistSlug]/page.tsx`);
- `const upcoming = buildUpcoming({ days, artistOfTour, events, advances, showSlots, todayKey, limit: 10 })`.

- [ ] **Step 2: Randarea**

Sub MetricStrip, în ordine:

1. **Next Event card** (primul din `upcoming`, dacă există): card mare `border-hairline bg-surface rounded-[12px] p-5`, link către `/o/{slug}/t/{tourId}/d/{date}` — pastilă culoare + avatar/inițiale artist (mecanismul din roster), numele event-ului (fallback oraș), oraș · țară, data formatată `Intl.DateTimeFormat(locale, { weekday: "short", day: "numeric", month: "long" })` + „{t('inDays', {count})}" (diferența în zile calendaristice față de azi), stage time-ul formatat ca oră locală dacă `stageTime` există, bară de advancing (`advance.done/advance.total`, verde la complet — pattern-ul din timeline-ul artistului).
2. **Upcoming** (restul rândurilor): listă `divide-y divide-hairline` — dată scurtă, punct colorat artist, event/venue, oraș, țară, procent advancing; fiecare rând link către ziua lui.
3. **Roster** — secțiunea existentă, neschimbată, sub Upcoming, cu heading `t("rosterTitle")`.

Header: link `btn-primary` „Show nou" → `/o/${org.slug}/events/new` (gate `manage_tours`), apoi „Artist nou" devine `btn-quiet`; „Reports" rămâne. Empty state nou: dacă `upcoming.length === 0` → card cu `t("noUpcoming")` + CTA „Show nou".

i18n — namespace `dashboard` (ambele limbi):

```json
"dashboard": {
  "title": "Dashboard",
  "nextEvent": "Următorul show",
  "upcoming": "Urmează",
  "rosterTitle": "Roster",
  "newShow": "Show nou",
  "inDays": "în {count} zile",
  "today": "azi",
  "noUpcoming": "Niciun show programat.",
  "advance": "Advancing"
}
```

(en: `"Dashboard" / "Next show" / "Upcoming" / "Roster" / "New show" / "in {count} days" / "today" / "No upcoming shows." / "Advancing"`.)

- [ ] **Step 3: Verifică + commit**

Run: `node scripts/check-i18n.mjs && pnpm exec tsc --noEmit && pnpm vitest run`
Expected: exit 0.

```bash
git add "app/o/[orgSlug]/page.tsx" messages/ro.json messages/en.json
git commit -m "feat: Master Dashboard — next event card + upcoming peste roster

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 6: MasterCalendar + filtrul comun + layout pe două coloane

**Files:**
- Create: `app/o/[orgSlug]/dashboard-client.tsx`
- Modify: `app/o/[orgSlug]/page.tsx`
- Modify: `messages/ro.json`, `messages/en.json` (chei noi în `dashboard`)

**Interfaces:**
- Consumes: `monthGrid`, `buildCalendarDots`, `CalendarDot` (Task 2); datele produse de Task 5 (`artists`, `allDays`, `artistOfTour`, `upcoming`).
- Produces: `<DashboardClient artists={…} days={…} artistOfTourEntries={…} upcoming={…} orgSlug={…} locale={…} />` — client component care ține starea filtrului și randează Upcoming + calendarul. (Map/Set nu se serializează peste graniță server→client: pasează `artistOfTour` ca `[string, string][]` și reconstruiește-l în client.)

- [ ] **Step 1: DashboardClient**

Creează `app/o/[orgSlug]/dashboard-client.tsx` (client). Structură:

```typescript
"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { buildCalendarDots, monthGrid } from "@/lib/masterCalendar";
import type { DashboardDay, UpcomingShow } from "@/lib/dashboard";

interface Artist { id: string; name: string; slug: string; color: string | null }

export function DashboardClient(props: {
  orgSlug: string;
  locale: string;
  artists: Artist[];
  days: DashboardDay[];
  artistOfTourEntries: [string, string][];
  upcoming: UpcomingShow[];
  labels: {
    upcoming: string; today: string; noUpcoming: string;
    filterAll: string; prevMonth: string; nextMonth: string;
  };
}) {
  const [enabled, setEnabled] = useState<Set<string>>(
    () => new Set(props.artists.map((a) => a.id)),
  );
  const [month, setMonth] = useState(() => {
    const now = new Date();
    return { year: now.getFullYear(), month0: now.getMonth() };
  });
  const artistOfTour = useMemo(
    () => new Map(props.artistOfTourEntries),
    [props.artistOfTourEntries],
  );
  const dots = useMemo(
    () => buildCalendarDots(props.days, artistOfTour, enabled),
    [props.days, artistOfTour, enabled],
  );
  const weeks = useMemo(() => monthGrid(month.year, month.month0), [month]);
  const visibleUpcoming = props.upcoming.filter((u) => enabled.has(u.artistId));
  // …randare: chips filtru, listă Upcoming (visibleUpcoming), grila calendarului
}
```

Randare:
- **Chips filtru** (deasupra calendarului): buton per artist — punct colorat + nume; activ = plin, inactiv = `opacity-40`; click → toggle în `enabled` (mereu se poate re-activa; dacă toți ajung dezactivați, calendarul + upcoming rămân goale — acceptat).
- **Upcoming**: mută randarea listei din Task 5 aici (rândurile din `visibleUpcoming`; Next Event card RĂMÂNE în server component, nefiltrat — e „next event global").
- **Calendar**: header `‹ {luna an} ›` (nume lună via `Intl.DateTimeFormat(locale, { month: "long", year: "numeric" })`, navigare setMonth ±1 cu rollover an); grilă 7 coloane, celule cu numărul zilei; ziua de azi cu inel/accent (convenția din calendarul de tur); punctele zilei din `dots.get(date)`: cercuri 8px `style={{ backgroundColor: color }}`, pline pentru `isShow`, `opacity-50` pentru restul, fiecare `<Link href={/o/{orgSlug}/t/{dot.tourId}/d/{dot.date}} title={numele artistului} />`.
- Wrapper-ul întors: `<div className="grid gap-6 lg:grid-cols-[1fr_320px]"><div>{upcoming}</div><aside className="lg:sticky lg:top-6 self-start">{filtru + calendar}</aside></div>`.
- Comentariu-marker de scalare pe props.days: la mii de zile se trece pe fereastră server-driven (spec §3).

- [ ] **Step 2: Integrarea în pagină**

În `app/o/[orgSlug]/page.tsx`: înlocuiește lista Upcoming randată server-side (Task 5) cu `<DashboardClient …>` primind datele deja calculate; Roster-ul rămâne sub. Next Event card rămâne unde e. Chei i18n noi în `dashboard`: `"filterAll": "Toți artiștii"` / `"All artists"` (folosită ca aria-label pe grupul de chips), `"prevMonth": "Luna anterioară"` / `"Previous month"`, `"nextMonth": "Luna următoare"` / `"Next month"` (aria-labels pe săgeți).

- [ ] **Step 3: Verifică + commit**

Run: `node scripts/check-i18n.mjs && pnpm exec tsc --noEmit && pnpm vitest run && pnpm build`
Expected: exit 0 peste tot.

```bash
git add "app/o/[orgSlug]/page.tsx" "app/o/[orgSlug]/dashboard-client.tsx" messages/ro.json messages/en.json
git commit -m "feat: calendar multi-artist cu filtru — dashboard pe două coloane

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 7: Verificare finală

**Files:** niciun fișier nou; fix-uri punctuale descoperite aici.

- [ ] **Step 1: Suita completă**

```bash
pnpm vitest run
bash scripts/test-rls.sh
node scripts/check-i18n.mjs
pnpm build
```
Expected: toate exit 0. Fixează ce pică și re-rulează.

- [ ] **Step 2: Review final de branch**

Invocă `superpowers:requesting-code-review` pe diff-ul complet al branch-ului (main model), cu ledger-ul de minors deferate ca input de triaj.

- [ ] **Step 3: Merge gate + deploy**

Prezintă opțiunile de integrare (finishing-a-development-branch). După merge + decizia utilizatorului: migrarea `00028` pe Supabase producție (`supabase db push --db-url`, ca la SP1), apoi `NEXT_PUBLIC_APP_URL=https://tourapp.office-2e5.workers.dev pnpm run deploy` (atenție: `pnpm run deploy`, nu `pnpm deploy`). Smoke prin Chrome per spec §5: creare show one-off de test pe SPEAK → bucket „SPEAK 2026", zi pre-populată, dashboard + calendar cu filtru, apoi soft-delete pe show-ul de test.
