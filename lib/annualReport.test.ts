import { describe, expect, it } from "vitest";
import { buildAnnualReport, annualReportCsv, type AnnualAnnexRow } from "./annualReport";

function row(overrides: Partial<AnnualAnnexRow>): AnnualAnnexRow {
  return {
    id: "a1",
    annexNumber: 1,
    contractNumber: "C-1",
    issueDate: "2026-03-01",
    currency: "EUR",
    total: 100,
    paymentCurrency: null,
    fxRate: null,
    paidAt: null,
    personFirstName: "Ion",
    personLastName: "Popescu",
    personCompany: null,
    tourName: "Tur A",
    ...overrides,
  };
}

describe("buildAnnualReport", () => {
  it("grupează pe persoană peste tururi, indiferent de capitalizare", () => {
    const people = buildAnnualReport([
      row({ id: "a1", tourName: "Tur A" }),
      row({ id: "a2", personFirstName: "ion", personLastName: "POPESCU", tourName: "Tur B" }),
    ]);
    expect(people).toHaveLength(1);
    expect(people[0].tours).toEqual(["Tur A", "Tur B"]);
    expect(people[0].annexes).toHaveLength(2);
  });

  it("totalizează pe moneda de plată, cu conversie la fx", () => {
    const people = buildAnnualReport([
      row({ id: "a1", total: 100, currency: "EUR" }),
      row({
        id: "a2",
        total: 400,
        currency: "EUR",
        paymentCurrency: "RON",
        fxRate: 5.24,
        paidAt: "2026-04-01T00:00:00Z",
      }),
    ]);
    expect(people[0].totals.EUR).toEqual({ total: 100, paid: 0, pending: 100 });
    expect(people[0].totals.RON).toEqual({ total: 2096, paid: 2096, pending: 0 });
  });

  it("nu convertește când moneda de plată e aceeași", () => {
    const people = buildAnnualReport([
      row({ id: "a1", total: 100, currency: "RON", paymentCurrency: "RON", fxRate: 5 }),
    ]);
    expect(people[0].totals.RON.total).toBe(100);
    expect(people[0].annexes[0].fxRate).toBeNull();
  });

  it("sortează persoanele alfabetic și anexele cronologic", () => {
    const people = buildAnnualReport([
      row({ id: "a1", personFirstName: "Zoe", personLastName: "B", issueDate: "2026-05-01" }),
      row({ id: "a2", personFirstName: "Ana", personLastName: "A", issueDate: "2026-06-01" }),
      row({ id: "a3", personFirstName: "Zoe", personLastName: "B", issueDate: "2026-01-01" }),
    ]);
    expect(people.map((p) => p.name)).toEqual(["Ana A", "Zoe B"]);
    expect(people[1].annexes.map((a) => a.issueDate)).toEqual(["2026-01-01", "2026-05-01"]);
  });

  it("persoană fără nume devine —", () => {
    const people = buildAnnualReport([
      row({ personFirstName: null, personLastName: null }),
    ]);
    expect(people[0].name).toBe("—");
  });
});

describe("annualReportCsv", () => {
  it("emite o linie per anexă cu escaping corect", () => {
    const csv = annualReportCsv(
      buildAnnualReport([
        row({
          id: "a1",
          personCompany: 'SC "AKOKO" SRL',
          total: 400,
          paymentCurrency: "RON",
          fxRate: 5.24,
        }),
      ]),
    );
    const lines = csv.trim().split("\n");
    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain("Payment currency");
    expect(lines[1]).toContain('"SC ""AKOKO"" SRL"');
    expect(lines[1]).toContain("2096.00");
    expect(lines[1]).toContain("pending");
  });
});
