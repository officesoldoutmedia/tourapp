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
