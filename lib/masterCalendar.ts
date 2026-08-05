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
