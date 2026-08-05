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
