import { describe, expect, it } from "vitest";
import { buildArtistTimeline } from "./artistTimeline";

const days = [
  { id: "d2", date: "2026-09-01", day_type: "show", city: "Bacău", country: "România", tour_id: "t1" },
  { id: "d1", date: "2026-08-20", day_type: "travel", city: null, country: null, tour_id: "t1" },
];
const advances = [
  { event_id: "e1", day_id: "d2", status: "done" },
  { event_id: "e2", day_id: "d2", status: "in_progress" },
];

describe("buildArtistTimeline", () => {
  it("sortează cronologic și atașează progresul de advancing", () => {
    const rows = buildArtistTimeline(days, advances);
    expect(rows.map((r) => r.id)).toEqual(["d1", "d2"]);
    expect(rows[1].advance).toEqual({ done: 1, total: 2 });
    expect(rows[0].advance).toBeNull();
  });
});
