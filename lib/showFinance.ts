/**
 * Economia show-ului: fee − comision booking − crew − costuri extra = profit.
 * Pură, testabilă. Comisionul de booking se aplică la fee (brut).
 */

export interface ShowCostLine {
  kind: "crew" | "extra";
  label: string;
  amount: number;
  /** intră în înțelegerea cu booking-ul (baza net + fișa de costuri) */
  toBooker?: boolean;
}

export interface ShowProfitInput {
  fee: number;
  bookingPercent: number; // 0–100
  /** 'gross' = % din fee; 'net' = % din (fee − costuri) */
  bookingBase?: "gross" | "net";
  costs: ShowCostLine[];
}

export interface ShowProfitResult {
  fee: number;
  bookingPercent: number;
  bookingFee: number;
  crewTotal: number;
  extraTotal: number;
  bookerCostsTotal: number; // doar liniile care intră la booker
  totalCosts: number; // booking + crew + extra
  profit: number;
}

export function computeShowProfit(input: ShowProfitInput): ShowProfitResult {
  const round = (n: number) => Math.round(n * 100) / 100;
  const crewTotal = round(
    input.costs.filter((c) => c.kind === "crew").reduce((s, c) => s + c.amount, 0),
  );
  const extraTotal = round(
    input.costs.filter((c) => c.kind === "extra").reduce((s, c) => s + c.amount, 0),
  );
  // în baza NET intră DOAR costurile convenite cu booking-ul
  const bookerCostsTotal = round(
    input.costs.filter((c) => c.toBooker !== false).reduce((s, c) => s + c.amount, 0),
  );
  const bookingBaseAmount =
    (input.bookingBase ?? "net") === "net" ? input.fee - bookerCostsTotal : input.fee;
  const bookingFee = round((Math.max(bookingBaseAmount, 0) * input.bookingPercent) / 100);
  const totalCosts = round(bookingFee + crewTotal + extraTotal);
  return {
    fee: input.fee,
    bookingPercent: input.bookingPercent,
    bookingFee,
    crewTotal,
    extraTotal,
    bookerCostsTotal,
    totalCosts,
    profit: round(input.fee - totalCosts),
  };
}

export function formatMoney(amount: number, currency: string): string {
  return `${amount.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} ${currency}`;
}

export interface RawCostLine extends ShowCostLine {
  currency: string;
}

/**
 * Convertește liniile în moneda show-ului cu cursuri setate manual
 * ({"EUR": 5.05} = 1 EUR în moneda show-ului). Liniile fără curs rămân
 * neconvertite și sunt raportate în `missing`.
 */
export function convertCostLines(
  lines: RawCostLine[],
  showCurrency: string,
  rates: Record<string, number>,
): { lines: ShowCostLine[]; missing: string[] } {
  const round = (n: number) => Math.round(n * 100) / 100;
  const missing = new Set<string>();
  const converted = lines.map((line) => {
    if (line.currency === showCurrency) return line;
    const rate = rates[line.currency];
    if (!rate || rate <= 0) {
      missing.add(line.currency);
      return line;
    }
    return { ...line, amount: round(line.amount * rate) };
  });
  return { lines: converted, missing: [...missing] };
}
