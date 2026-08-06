import { describe, expect, it } from "vitest";
import {
  buildDealSnapshot,
  parseDealSnapshot,
  requiredCategoriesForDay,
  withholdingLine,
} from "./dealSnapshot";

const template = {
  name: "Festival",
  fee_amount: 3500,
  fee_currency: "EUR",
  deal_basis: "landed",
  withholding_percent: 5,
  landed_items: ["SFX", "Backline", 7],
  accommodation: { rooms_single: 2, nights: 1 },
  required_category_ids: ["c1", "c2"],
};

describe("buildDealSnapshot", () => {
  it("copiază câmpurile și filtrează non-stringurile din landed_items", () => {
    const s = buildDealSnapshot(template as never);
    expect(s.landed_items).toEqual(["SFX", "Backline"]);
    expect(s.fee_amount).toBe(3500);
    expect(s.required_category_ids).toEqual(["c1", "c2"]);
  });

  it("accommodation array → {}", () => {
    const s = buildDealSnapshot({ ...template, accommodation: ["x", "y"] } as never);
    expect(s.accommodation).toEqual({});
  });

  it("accommodation cu chei extra + tipuri greșite → doar cheile valide supraviețuiesc", () => {
    const s = buildDealSnapshot({
      ...template,
      accommodation: { rooms_single: "two", nights: 1, extra: "junk" },
    } as never);
    expect(s.accommodation).toEqual({ nights: 1 });
  });
});

describe("parseDealSnapshot", () => {
  it("round-trip prin JSON", () => {
    const s = buildDealSnapshot(template as never);
    expect(parseDealSnapshot(JSON.parse(JSON.stringify(s)))).toEqual(s);
  });
  it("null pentru valori invalide", () => {
    expect(parseDealSnapshot(null)).toBeNull();
    expect(parseDealSnapshot("x")).toBeNull();
    expect(parseDealSnapshot({ name: 7 })).toBeNull();
  });
});

describe("requiredCategoriesForDay", () => {
  const live = new Set(["c1", "c3"]);
  it("uniune ∩ live; categoriile moarte se ignoră", () => {
    const a = buildDealSnapshot({ ...template, required_category_ids: ["c1", "c2"] } as never);
    const b = buildDealSnapshot({ ...template, required_category_ids: ["c3"] } as never);
    expect(requiredCategoriesForDay([a, b, null], live)?.sort()).toEqual(["c1", "c3"]);
  });
  it("null când niciun snapshot nu are listă (fallback org)", () => {
    const a = buildDealSnapshot({ ...template, required_category_ids: [] } as never);
    expect(requiredCategoriesForDay([a, null], live)).toBeNull();
  });
  it("listă cu doar categorii moarte → array gol (NU fallback)", () => {
    const a = buildDealSnapshot({ ...template, required_category_ids: ["dead"] } as never);
    expect(requiredCategoriesForDay([a], live)).toEqual([]);
  });
});

describe("withholdingLine", () => {
  it("p% din fee, round2, eticheta și cheia fixă", () => {
    expect(withholdingLine(5, 3500, "EUR")).toEqual({
      key: "withholding",
      label: "Impozit reținut 5% — 175 EUR",
      amount: 175,
      currency: "EUR",
    });
  });
  it("null la percent sau fee ≤ 0", () => {
    expect(withholdingLine(0, 3500, "EUR")).toBeNull();
    expect(withholdingLine(5, 0, "EUR")).toBeNull();
  });
});
