import { describe, expect, it } from "vitest";
import { haversineKm, tourRouteStats } from "./geo";

describe("haversineKm", () => {
  it("București → Cluj ≈ 320 km în linie dreaptă", () => {
    const km = haversineKm(44.4268, 26.1025, 46.7712, 23.6236);
    expect(km).toBeGreaterThan(300);
    expect(km).toBeLessThan(340);
  });
});

describe("tourRouteStats", () => {
  const points = [
    { date: "2026-07-01", lat: 44.4268, lng: 26.1025 }, // București
    { date: "2026-07-05", lat: 46.7712, lng: 23.6236 }, // Cluj
    { date: "2026-07-10", lat: 47.1585, lng: 27.6014 }, // Iași
  ];

  it("împarte traseul în parcurs și rămas față de azi", () => {
    const s = tourRouteStats(points, "2026-07-06");
    expect(s.traveledKm).toBeGreaterThan(300); // Buc→Cluj gata
    expect(s.remainingKm).toBeGreaterThan(200); // Cluj→Iași urmează
    expect(s.totalKm).toBe(s.traveledKm + s.remainingKm);
  });

  it("un singur punct → zero peste tot", () => {
    expect(tourRouteStats([points[0]], "2026-07-06").totalKm).toBe(0);
  });
});
