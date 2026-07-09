import { describe, expect, it } from "vitest";
import { computeShowProfit, convertCostLines } from "./showFinance";

describe("computeShowProfit", () => {
  it("scade booking-ul, crew-ul și extra din fee", () => {
    // fee 10.000, booking 15% = 1.500, crew 2.000, extra 500 → profit 6.000
    const r = computeShowProfit({
      fee: 10_000,
      bookingPercent: 15,
      bookingBase: "gross",
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

  it("default: comisionul se aplică DUPĂ costuri (net)", () => {
    // fee 10.000 − costuri 4.000 = 6.000; 15% din 6.000 = 900 → profit 5.100
    const r = computeShowProfit({
      fee: 10_000,
      bookingPercent: 15,
      costs: [
        { kind: "crew", label: "TM", amount: 3000 },
        { kind: "extra", label: "Promo", amount: 1000 },
      ],
    });
    expect(r.bookingFee).toBe(900);
    expect(r.profit).toBe(5100);
  });

  it("baza net nu produce comision negativ când costurile > fee", () => {
    const r = computeShowProfit({
      fee: 1000,
      bookingPercent: 10,
      costs: [{ kind: "crew", label: "x", amount: 2000 }],
    });
    expect(r.bookingFee).toBe(0);
    expect(r.profit).toBe(-1000);
  });

  it("fără booking și fără costuri → profit = fee", () => {
    const r = computeShowProfit({ fee: 5000, bookingPercent: 0, costs: [] });
    expect(r.profit).toBe(5000);
  });

  it("rotunjește banii la 2 zecimale", () => {
    const r = computeShowProfit({
      fee: 1000,
      bookingPercent: 12.345,
      bookingBase: "gross",
      costs: [{ kind: "extra", label: "x", amount: 0.005 }],
    });
    expect(r.bookingFee).toBe(123.45);
    expect(r.profit).toBe(876.54);
  });

  it("poate ieși pe minus (costuri > fee, bază gross)", () => {
    const r = computeShowProfit({
      fee: 1000,
      bookingPercent: 10,
      bookingBase: "gross",
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

describe("costuri care nu intră la booker", () => {
  it("costul intern nu intră în baza net, dar scade profitul", () => {
    // fee 5.000; către booker: crew 1.500 → net 3.500; 20% = 700
    // editul extra 100 (intern) NU intră în net, dar scade profitul
    const r = computeShowProfit({
      fee: 5000,
      bookingPercent: 20,
      costs: [
        { kind: "crew", label: "crew", amount: 1500, toBooker: true },
        { kind: "extra", label: "Edit extra", amount: 100, toBooker: false },
      ],
    });
    expect(r.bookerCostsTotal).toBe(1500);
    expect(r.bookingFee).toBe(700);
    expect(r.profit).toBe(5000 - 700 - 1500 - 100); // 2700
  });
});
