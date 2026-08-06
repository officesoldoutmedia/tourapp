import { describe, expect, it } from "vitest";
import { buildUpcoming } from "./dashboard";

const days = [
  { id: "d1", date: "2026-09-10", tour_id: "t1", city: "Bacău", country: "România", day_type: "show", timezone: "Europe/Bucharest" },
  { id: "d2", date: "2026-09-05", tour_id: "t2", city: "Cluj", country: "România", day_type: "show", timezone: null },
  { id: "d3", date: "2026-09-06", tour_id: "t1", city: null, country: null, day_type: "travel", timezone: null },
  { id: "d0", date: "2026-08-01", tour_id: "t1", city: "Iași", country: "România", day_type: "show", timezone: null },
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
      timezone: null,
    });
    expect(rows[1].advance).toBeNull();
    expect(rows[1].stageTime).toBeNull();
    expect(rows[1].timezone).toBe("Europe/Bucharest");
  });
  it("respectă limita", () => {
    const rows = buildUpcoming({
      days, artistOfTour, events, advances, showSlots,
      todayKey: "2026-09-01", limit: 1,
    });
    expect(rows).toHaveLength(1);
  });
  it("ignoră zilele orfane (fără artist) înainte de limit, nu le taie pe cele valide", () => {
    const orphanDays = [
      { id: "orphan", date: "2026-09-02", tour_id: "t-unknown", city: null, country: null, day_type: "show", timezone: null },
      { id: "d2", date: "2026-09-05", tour_id: "t2", city: "Cluj", country: "România", day_type: "show", timezone: null },
    ];
    const rows = buildUpcoming({
      days: orphanDays, artistOfTour, events, advances, showSlots,
      todayKey: "2026-09-01", limit: 1,
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].dayId).toBe("d2");
  });
});
