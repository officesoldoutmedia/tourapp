/** progressOfDay — regulile UNICE de calcul al procentului de advancing pe
 * zi, partajate de TOATE cele 3 site-uri care-l afișează: pagina de zi
 * (d/[date]/page.tsx), dashboard-ul org-ului (o/[orgSlug]/page.tsx) și
 * timeline-ul de artist (a/[artistSlug]/page.tsx). Pur — primește rânduri
 * brute deja fetch-uite de caller, nu atinge rețeaua (SP3b review fix #2).
 *
 * Reguli:
 *  (a) termenul de categorii obligatorii intră în total DOAR pe zilele cu
 *      `day_type === "show"`; câmpurile obligatorii din layout-urile de
 *      advance rămân în calcul pe orice zi care are advance-uri (indiferent
 *      de tipul zilei).
 *  (b) excluderea superseded + placeholder e identică peste tot: un fișier
 *      „real" al zilei e head-ul unui lanț de versiuni (`versionChains`) cu
 *      `storage_path !== null` ȘI `status !== "superseded"`.
 *  (c) merge any-filled determinist pe `fieldValues`, per zi — quando o zi
 *      are mai multe event-uri pe același `field_key`, „completat pe
 *      oricare event" câștigă, indiferent de ordinea (nedeterministă) a
 *      rândurilor întoarse de DB.
 */
import { isValidLayout } from "./advance";
import { computeAdvanceProgress, type AdvanceProgress } from "./advanceProgress";
import { versionChains, type VersionedFile } from "./fileVersions";

export interface ProgressDayRow {
  id: string;
  day_type: string;
}

export interface ProgressAdvanceRow {
  event_id: string;
  status: string;
  layout: unknown;
}

export interface ProgressFieldValueRow {
  event_id: string;
  field_key: string;
  value: string | null;
}

export interface ProgressFileRow extends VersionedFile {
  parent_id: string; // day_id — attachments cu parent_type "day"
  category_id: string | null;
  storage_path: string | null;
  status: string | null;
}

export interface ComputeProgressOfDaysInput {
  days: ProgressDayRow[];
  dayOfEvent: ReadonlyMap<string, string>; // event_id -> day_id
  advanceRows: ProgressAdvanceRow[];
  fieldValueRows: ProgressFieldValueRow[];
  fileRows: ProgressFileRow[];
  requiredCategoryIds: string[]; // categoriile obligatorii ale org-ului
  /** C1: zilele prezente în map folosesc lista respectivă de categorii
   *  obligatorii ÎN LOC de `requiredCategoryIds` (org); zilele absente
   *  păstrează comportamentul vechi (fallback org), identic byte-cu-byte. */
  dealRequiredByDay?: ReadonlyMap<string, string[]>;
}

/** Calculează progresul de advancing pentru fiecare zi din `days`, cu
 * regulile unice descrise mai sus. Întoarce o intrare pentru FIECARE zi
 * primită (chiar dacă `total` iese 0) — filtrarea „zile fără nimic de
 * arătat" rămâne responsabilitatea apelantului, care diferă ușor pe cele
 * 3 site-uri. */
export function computeProgressOfDays(
  input: ComputeProgressOfDaysInput,
): Map<string, AdvanceProgress> {
  const {
    days,
    dayOfEvent,
    advanceRows,
    fieldValueRows,
    fileRows,
    requiredCategoryIds,
    dealRequiredByDay,
  } = input;

  const advancesByDay = new Map<string, ProgressAdvanceRow[]>();
  for (const a of advanceRows) {
    const dayId = dayOfEvent.get(a.event_id);
    if (!dayId) continue;
    const list = advancesByDay.get(dayId);
    if (list) list.push(a);
    else advancesByDay.set(dayId, [a]);
  }

  // (c) merge any-filled determinist — vezi doc-comment de mai sus.
  const fieldValuesByDay = new Map<string, Map<string, string>>();
  for (const r of fieldValueRows) {
    const dayId = dayOfEvent.get(r.event_id);
    if (!dayId) continue;
    const map = fieldValuesByDay.get(dayId) ?? new Map<string, string>();
    const v = r.value ?? "";
    if (v.trim() !== "" || !map.has(r.field_key)) map.set(r.field_key, v);
    fieldValuesByDay.set(dayId, map);
  }

  const filesByDay = new Map<string, ProgressFileRow[]>();
  for (const f of fileRows) {
    const list = filesByDay.get(f.parent_id);
    if (list) list.push(f);
    else filesByDay.set(f.parent_id, [f]);
  }

  const result = new Map<string, AdvanceProgress>();
  for (const day of days) {
    const dayAdvances = advancesByDay.get(day.id) ?? [];
    // (b) excluderea superseded + placeholder — identică peste tot.
    const dayFileHeads = versionChains(filesByDay.get(day.id) ?? []).map((chain) => chain.head);
    const dayFileCategoryIds = dayFileHeads
      .filter((h) => h.storage_path !== null && h.status !== "superseded")
      .map((h) => h.category_id)
      .filter((id): id is string => id !== null);
    // C1: ziua d folosește lista deal-ului dacă e prezentă în map, altfel
    // fallback pe setul org — aplicat TOT doar pe zile show, regula (a).
    const dayRequiredCategoryIds = dealRequiredByDay?.get(day.id) ?? requiredCategoryIds;
    const progress = computeAdvanceProgress({
      layouts: dayAdvances.map((a) => (isValidLayout(a.layout) ? a.layout : [])),
      fieldValues: fieldValuesByDay.get(day.id) ?? new Map<string, string>(),
      // (a) categoriile obligatorii intră în total doar pe zile show.
      requiredCategoryIds: day.day_type === "show" ? dayRequiredCategoryIds : [],
      dayFileCategoryIds,
      manualStatuses: dayAdvances.map((a) => a.status),
    });
    result.set(day.id, progress);
  }
  return result;
}
