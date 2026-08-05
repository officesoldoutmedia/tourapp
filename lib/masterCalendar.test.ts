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
