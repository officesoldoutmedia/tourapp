/** Calculele pentru panoul „Calculat" (SP3a). Pur — fără fetch.
 *  Etichetele sunt descriptive (apar ca label pe linia de cost), cheile
 *  sunt markerul stabil de upsert (show_costs.generated_key). */

export const PER_DIEM_KEY_PREFIX = "per_diem:";
export const GROUND_KEY = "ground_transport";

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function perDiemLine(
  party: {
    id: string;
    name: string;
    per_diem_rate: number | null;
    per_diem_currency: string | null;
  },
  headcount: number,
  days: number,
): { key: string; label: string; amount: number; currency: string } | null {
  const rate = Number(party.per_diem_rate ?? 0);
  if (!rate || headcount <= 0 || days <= 0) return null;
  const currency = party.per_diem_currency || "EUR";
  return {
    key: `${PER_DIEM_KEY_PREFIX}${party.id}`,
    label: `Diurnă ${party.name} — ${headcount} × ${rate} ${currency} × ${days} zile`,
    amount: round2(headcount * rate * days),
    currency,
  };
}

export function groundTransportLine(input: {
  city: string | null;
  km: number;
  rate: number;
  currency: string;
}): { key: string; label: string; amount: number; currency: string } {
  const where = input.city ? ` ${input.city}` : "";
  return {
    key: GROUND_KEY,
    label: `Transport${where} — ${input.km} km`,
    amount: round2(input.km * input.rate),
    currency: input.currency,
  };
}
