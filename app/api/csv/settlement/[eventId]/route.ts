import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { computeSettlement } from "@/lib/settlement";

function csvCell(value: unknown): string {
  const s = String(value ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Export CSV: settlement details + line items [C §6.19]. */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ eventId: string }> },
) {
  const { eventId } = await params;
  const supabase = await createServerSupabase();

  const [{ data: settlement }, { data: lineItems }, { data: expenses }] =
    await Promise.all([
      supabase.from("settlements").select("*").eq("event_id", eventId).maybeSingle(),
      supabase
        .from("non_settlement_items")
        .select("category, description, income, expense")
        .eq("event_id", eventId)
        .order("sort_order"),
      supabase
        .from("settlement_expenses")
        .select("stage, label, formula, amount")
        .eq("settlement_id", eventId)
        .order("stage"),
    ]);
  if (!settlement) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const n = (v: number | null) => v ?? 0;
  const result = computeSettlement({
    dealType: settlement.deal_type,
    guarantee: n(settlement.guarantee),
    splitPercentArtist: n(settlement.split_percent_artist),
    venueCapacity: settlement.venue_capacity,
    ticketsSold: settlement.tickets_sold,
    grossTicketSales: n(settlement.gross_ticket_sales),
    taxesFees: n(settlement.taxes_fees),
    totalExpenses: n(settlement.total_expenses),
    overageOverride: settlement.overage,
    productionReimbursements: n(settlement.production_reimbursements),
    additionalChargebacks: n(settlement.additional_chargebacks),
    deposit: n(settlement.deposit),
    withholding: n(settlement.withholding),
    cash: n(settlement.cash),
    ticketBuys: n(settlement.ticket_buys),
    nightOfShowDeductions: n(settlement.night_of_show_deductions),
  });

  const rows: string[][] = [
    ["SETTLEMENT", settlement.currency],
    ["Venue capacity", String(settlement.venue_capacity ?? "")],
    ["Tickets sold", String(settlement.tickets_sold ?? "")],
    ["% of capacity", String(result.percentOfCapacity ?? "")],
    ["Gross ticket sales", String(n(settlement.gross_ticket_sales))],
    ["Taxes & fees", String(n(settlement.taxes_fees))],
    ["Net ticket sales", String(result.netTicketSales)],
    ["Total expenses", String(n(settlement.total_expenses))],
    ["Amount to pot", String(result.amountToPot)],
    ["Guarantee", String(n(settlement.guarantee))],
    ["Overage", String(result.overage)],
    ["Walkout", String(result.walkout)],
    ["Deposit", String(n(settlement.deposit))],
    ["Withholding", String(n(settlement.withholding))],
    ["AMOUNT DUE", String(result.amountDue)],
    [],
    ["EXPENSES", "stage", "formula", "amount"],
    ...(expenses ?? []).map((e) => [e.label, e.stage, e.formula ?? "", String(e.amount ?? "")]),
    [],
    ["LINE ITEMS", "description", "income", "expense"],
    ...(lineItems ?? []).map((i) => [
      i.category ?? "",
      i.description ?? "",
      String(i.income),
      String(i.expense),
    ]),
  ];

  const csv = rows.map((r) => r.map(csvCell).join(",")).join("\r\n");
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="settlement-${eventId}.csv"`,
    },
  });
}
