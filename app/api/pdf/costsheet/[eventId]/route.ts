import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { buildCostSheetPdf, type CostSheetLine } from "@/pdf/CostSheetPdf";
import { convertCostLines } from "@/lib/showFinance";

/** Fișa de costuri PDF — RLS pe show_costs: doar admin/accounting. */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ eventId: string }> },
) {
  const { eventId } = await params;
  const supabase = await createServerSupabase();

  const [{ data: costs }, { data: event }, { data: finance }] = await Promise.all([
    supabase
      .from("show_costs")
      .select("kind, label, payment_type, amount, currency, billable_to_booker")
      .eq("event_id", eventId)
      .is("deleted_at", null)
      .order("kind")
      .order("sort_order"),
    supabase
      .from("events")
      .select("title, venues(name), days!inner(date, tours!inner(name, organizations(name)))")
      .eq("id", eventId)
      .maybeSingle(),
    supabase.from("show_finances").select("fee_currency, fx_rates").eq("event_id", eventId).maybeSingle(),
  ]);
  if (!event || !costs)
    return NextResponse.json({ error: "not_found" }, { status: 404 });

  const day = event.days as unknown as {
    date: string;
    tours: { name: string; organizations: { name: string } | null };
  };
  // fișa merge la booking → conține DOAR costurile convenite cu ei
  const bookerCosts = costs.filter((c) => c.billable_to_booker);
  const showCurrency = finance?.fee_currency ?? bookerCosts[0]?.currency ?? "RON";
  const conversion = convertCostLines(
    bookerCosts.map((c) => ({
      kind: c.kind as CostSheetLine["kind"],
      label: c.label,
      amount: Number(c.amount),
      currency: c.currency,
    })),
    showCurrency,
    (finance?.fx_rates ?? {}) as Record<string, number>,
  );
  const pdf = await buildCostSheetPdf({
    orgName: day.tours.organizations?.name ?? day.tours.name,
    eventTitle:
      event.title ?? (event.venues as unknown as { name: string } | null)?.name ?? "Event",
    venueName: (event.venues as unknown as { name: string } | null)?.name ?? null,
    date: day.date,
    currency: showCurrency,
    lines: conversion.lines.map((line, i) => ({
      ...line,
      paymentType: bookerCosts[i].payment_type,
      originalAmount: Number(bookerCosts[i].amount),
      originalCurrency: bookerCosts[i].currency,
    })),
  });
  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="costsheet-${eventId}.pdf"`,
    },
  });
}
