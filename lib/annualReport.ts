/**
 * Raportul anual per persoană [cererea userului]: toate anexele de plată
 * emise într-un an, grupate pe persoană (peste toate tururile), cu totaluri
 * pe moneda EFECTIVĂ de plată — dacă anexa se plătește în altă monedă
 * (payment_currency + fx_rate, ex. costuri în EUR plătite în RON), totalul
 * intră la moneda de plată, cu suma convertită.
 */

export interface AnnualAnnexRow {
  id: string;
  annexNumber: number;
  contractNumber: string | null;
  issueDate: string;
  currency: string;
  total: number;
  paymentCurrency: string | null;
  fxRate: number | null;
  paidAt: string | null;
  personFirstName: string | null;
  personLastName: string | null;
  personCompany: string | null;
  tourName: string;
}

export interface PersonAnnexDetail {
  id: string;
  annexNumber: number;
  contractNumber: string | null;
  issueDate: string;
  tourName: string;
  /** suma originală, în moneda costurilor */
  total: number;
  currency: string;
  /** suma efectiv de plată (convertită dacă e cazul) */
  paymentTotal: number;
  paymentCurrency: string;
  fxRate: number | null;
  paid: boolean;
  paidAt: string | null;
}

export interface PersonYearReport {
  key: string;
  name: string;
  company: string | null;
  tours: string[];
  annexes: PersonAnnexDetail[];
  /** moneda de plată → {total, paid, pending} */
  totals: Record<string, { total: number; paid: number; pending: number }>;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function buildAnnualReport(rows: AnnualAnnexRow[]): PersonYearReport[] {
  const byPerson = new Map<string, PersonYearReport>();

  for (const row of rows) {
    const name =
      [row.personFirstName, row.personLastName].filter(Boolean).join(" ").trim() || "—";
    const key = name.toLowerCase();

    let person = byPerson.get(key);
    if (!person) {
      person = { key, name, company: row.personCompany, tours: [], annexes: [], totals: {} };
      byPerson.set(key, person);
    }
    if (!person.company && row.personCompany) person.company = row.personCompany;
    if (!person.tours.includes(row.tourName)) person.tours.push(row.tourName);

    const converted = row.paymentCurrency && row.paymentCurrency !== row.currency;
    const paymentCurrency = converted ? row.paymentCurrency! : row.currency;
    const paymentTotal = converted
      ? round2(row.total * (row.fxRate ?? 1))
      : round2(row.total);

    person.annexes.push({
      id: row.id,
      annexNumber: row.annexNumber,
      contractNumber: row.contractNumber,
      issueDate: row.issueDate,
      tourName: row.tourName,
      total: round2(row.total),
      currency: row.currency,
      paymentTotal,
      paymentCurrency,
      fxRate: converted ? row.fxRate : null,
      paid: row.paidAt != null,
      paidAt: row.paidAt,
    });

    const bucket = (person.totals[paymentCurrency] ??= { total: 0, paid: 0, pending: 0 });
    bucket.total = round2(bucket.total + paymentTotal);
    if (row.paidAt != null) bucket.paid = round2(bucket.paid + paymentTotal);
    else bucket.pending = round2(bucket.pending + paymentTotal);
  }

  const people = [...byPerson.values()];
  people.sort((a, b) => a.name.localeCompare(b.name, "ro"));
  for (const person of people) {
    person.annexes.sort(
      (a, b) => a.issueDate.localeCompare(b.issueDate) || a.annexNumber - b.annexNumber,
    );
  }
  return people;
}

/** Linii CSV (fără header) — o linie per anexă, plus statusul plății. */
export function annualReportCsv(people: PersonYearReport[]): string {
  const esc = (v: string | number | null): string => {
    const s = v == null ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [
    [
      "Person",
      "Company",
      "Tour",
      "Annex no.",
      "Contract no.",
      "Issue date",
      "Amount",
      "Currency",
      "Payment amount",
      "Payment currency",
      "FX rate",
      "Status",
      "Paid at",
    ].join(","),
  ];
  for (const person of people) {
    for (const annex of person.annexes) {
      lines.push(
        [
          esc(person.name),
          esc(person.company),
          esc(annex.tourName),
          esc(annex.annexNumber),
          esc(annex.contractNumber),
          esc(annex.issueDate),
          esc(annex.total.toFixed(2)),
          esc(annex.currency),
          esc(annex.paymentTotal.toFixed(2)),
          esc(annex.paymentCurrency),
          esc(annex.fxRate != null ? annex.fxRate : ""),
          annex.paid ? "paid" : "pending",
          esc(annex.paidAt ? annex.paidAt.slice(0, 10) : ""),
        ].join(","),
      );
    }
  }
  return lines.join("\n") + "\n";
}
