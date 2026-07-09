/**
 * Economia show-ului: fee − comision booking − crew − costuri extra = profit.
 * Pură, testabilă. Comisionul de booking se aplică la fee (brut).
 */

export interface ShowCostLine {
  kind: "crew" | "extra";
  label: string;
  amount: number;
}

export interface ShowProfitInput {
  fee: number;
  bookingPercent: number; // 0–100
  costs: ShowCostLine[];
}

export interface ShowProfitResult {
  fee: number;
  bookingPercent: number;
  bookingFee: number;
  crewTotal: number;
  extraTotal: number;
  totalCosts: number; // booking + crew + extra
  profit: number;
}

export function computeShowProfit(input: ShowProfitInput): ShowProfitResult {
  const round = (n: number) => Math.round(n * 100) / 100;
  const bookingFee = round((input.fee * input.bookingPercent) / 100);
  const crewTotal = round(
    input.costs.filter((c) => c.kind === "crew").reduce((s, c) => s + c.amount, 0),
  );
  const extraTotal = round(
    input.costs.filter((c) => c.kind === "extra").reduce((s, c) => s + c.amount, 0),
  );
  const totalCosts = round(bookingFee + crewTotal + extraTotal);
  return {
    fee: input.fee,
    bookingPercent: input.bookingPercent,
    bookingFee,
    crewTotal,
    extraTotal,
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
