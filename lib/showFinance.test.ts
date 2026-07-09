import { describe, expect, it } from "vitest";
import { computeShowProfit, convertCostLines } from "./showFinance";

describe("computeShowProfit", () => {
  it("scade booking-ul, crew-ul și extra din fee", () => {
    // fee 10.000, booking 15% = 1.500, crew 2.000, extra 500 → profit 6.000
    const r = computeShowProfit({
      fee: 10_000,
      bookingPercent: 15,
      costs: [
        { kind: "crew", label: "TM", amount: 1200 },
        { kind: "crew", label: "FOH", amount: 800 },
        { kind: "extra", label: "Transport", amount: 500 },
      ],
    });
    expect(r.bookingFee).toBe(1500);
    expect(r.crewTotal).toBe(2000);
    expect(r.extraTotal).toBe(500);
    expect(r.totalCosts).toBe(4000);
    expect(r.profit).toBe(6000);
  });

  it("fără booking și fără costuri → profit = fee", () => {
    const r = computeShowProfit({ fee: 5000, bookingPercent: 0, costs: [] });
    expect(r.profit).toBe(5000);
  });

  it("rotunjește banii la 2 zecimale", () => {
    const r = computeShowProfit({
      fee: 1000,
      bookingPercent: 12.345,
      costs: [{ kind: "extra", label: "x", amount: 0.005 }],
    });
    expect(r.bookingFee).toBe(123.45);
    expect(r.profit).toBe(876.54);
  });

  it("poate ieși pe minus (costuri > fee)", () => {
    const r = computeShowProfit({
      fee: 1000,
      bookingPercent: 10,
      costs: [{ kind: "crew", label: "band", amount: 2000 }],
    });
    expect(r.profit).toBe(-1100);
  });
});

describe("convertCostLines", () => {
  it("convertește cu cursul manual și lasă moneda show-ului neatinsă", () => {
    const r = convertCostLines(
      [
        { kind: "crew", label: "TM", amount: 500, currency: "EUR" },
        { kind: "extra", label: "Diurnă", amount: 1000, currency: "RON" },
      ],
      "RON",
      { EUR: 5.05 },
    );
    expect(r.lines[0].amount).toBe(2525);
    expect(r.lines[1].amount).toBe(1000);
    expect(r.missing).toEqual([]);
  });

  it("raportează monedele fără curs setat", () => {
    const r = convertCostLines(
      [{ kind: "crew", label: "x", amount: 100, currency: "USD" }],
      "RON",
      {},
    );
    expect(r.missing).toEqual(["USD"]);
    expect(r.lines[0].amount).toBe(100); // neconvertit
  });
});
