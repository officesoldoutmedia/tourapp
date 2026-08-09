import { describe, expect, it } from "vitest";
import { groundTransportLine, perDiemLine } from "./costCalc";

describe("perDiemLine", () => {
  const party = { id: "p1", name: "Crew", per_diem_rate: 45, per_diem_currency: "EUR" };
  it("headcount × rate × zile, cu eticheta descriptivă și cheia stabilă", () => {
    expect(perDiemLine(party, 6, 2)).toEqual({
      key: "per_diem:p1",
      label: "Per diem Crew — 6 × 45 EUR × 2 days",
      amount: 540,
      currency: "EUR",
    });
  });
  it("null pentru party fără rată, headcount 0 sau zile 0", () => {
    expect(perDiemLine({ ...party, per_diem_rate: null }, 6, 1)).toBeNull();
    expect(perDiemLine({ ...party, per_diem_rate: 0 }, 6, 1)).toBeNull();
    expect(perDiemLine(party, 0, 1)).toBeNull();
    expect(perDiemLine(party, 6, 0)).toBeNull();
  });
  it("valuta implicită EUR când lipsește", () => {
    expect(perDiemLine({ ...party, per_diem_currency: null }, 1, 1)?.currency).toBe("EUR");
  });
});

describe("groundTransportLine", () => {
  it("km × rate, etichetă cu orașul și km-ul, cheie fixă", () => {
    expect(
      groundTransportLine({ city: "Cluj-Napoca", km: 460, rate: 1.2, currency: "EUR" }),
    ).toEqual({
      key: "ground_transport",
      label: "Transport Cluj-Napoca — 460 km",
      amount: 552,
      currency: "EUR",
    });
  });
  it("fără oraș, eticheta rămâne coerentă și suma se rotunjește la 2 zecimale", () => {
    const line = groundTransportLine({ city: null, km: 333, rate: 0.333, currency: "RON" });
    expect(line.label).toBe("Transport — 333 km");
    expect(line.amount).toBe(110.89);
  });
});
