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
    .filter(
      (d) =>
        d.day_type === "show" &&
        d.date >= input.todayKey &&
        input.artistOfTour.has(d.tour_id),
    )
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, input.limit ?? 10)
    .map((d) => {
      const artistId = input.artistOfTour.get(d.tour_id)!;
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
        artistId,
        city: d.city,
        country: d.country,
        eventTitle: dayEvents[0]?.title ?? null,
        advance,
        stageTime: slotOfDay.get(d.id) ?? null,
      };
    });
}
