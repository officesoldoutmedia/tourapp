import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { buildAnnexPdf, type AnnexParty, type AnnexLanguage } from "@/pdf/AnnexPdf";

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
      // jobul prestat = ce e după "—" în eticheta liniei de cost
      // (ex. "Petre Zola — Advancing" → "Advancing")
      const service = line.label.includes("—")
        ? line.label.split("—").slice(1).join("—").trim() || null
        : null;
      return {
        date: event.days.date,
        label: event.title ?? event.venues?.name ?? "Show",
        service,
        amount: Number(line.amount),
      };
    })
    .sort((a, b) => a.date.localeCompare(b.date));

  const pdf = await buildAnnexPdf({
    annexNumber: annex.annex_number,
    contractNumber: annex.contract_number,
    issueDate: annex.issue_date,
    currency: annex.currency,
    language: (annex.language ?? "ro") as AnnexLanguage,
    paymentCurrency: annex.payment_currency,
    fxRate: annex.fx_rate ? Number(annex.fx_rate) : null,
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
