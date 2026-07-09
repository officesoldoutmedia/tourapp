import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { buildAnnexPdf, type AnnexParty } from "@/pdf/AnnexPdf";

/** PDF-ul anexei de plată — RLS: doar admin/accounting. */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ annexId: string }> },
) {
  const { annexId } = await params;
  const supabase = await createServerSupabase();

  const { data: annex } = await supabase
    .from("payment_annexes")
    .select("*")
    .eq("id", annexId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!annex) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const { data: lines } = await supabase
    .from("show_costs")
    .select("label, amount, events!inner(title, venues(name), days!inner(date))")
    .eq("annex_id", annexId)
    .is("deleted_at", null);

  const shows = (lines ?? [])
    .map((line) => {
      const event = line.events as unknown as {
        title: string | null;
        venues: { name: string } | null;
        days: { date: string };
      };
      return {
        date: event.days.date,
        label: event.title ?? event.venues?.name ?? "Show",
        amount: Number(line.amount),
      };
    })
    .sort((a, b) => a.date.localeCompare(b.date));

  const pdf = await buildAnnexPdf({
    annexNumber: annex.annex_number,
    contractNumber: annex.contract_number,
    issueDate: annex.issue_date,
    currency: annex.currency,
    payer: annex.payer as AnnexParty,
    payee: annex.payee as AnnexParty,
    shows,
    notes: annex.notes,
  });
  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="anexa-${annex.annex_number}.pdf"`,
    },
  });
}
