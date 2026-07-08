import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { buildSettlementPdf } from "@/pdf/SettlementPdf";

/** Settlement PDF [N §6.17.3] — RLS: doar admin/accounting îl pot genera. */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ eventId: string }> },
) {
  const { eventId } = await params;
  const supabase = await createServerSupabase();

  const [{ data: settlement }, { data: event }] = await Promise.all([
    supabase.from("settlements").select("*").eq("event_id", eventId).maybeSingle(),
    supabase
      .from("events")
      .select("title, venues(name), days!inner(date)")
      .eq("id", eventId)
      .maybeSingle(),
  ]);
  if (!settlement || !event)
    return NextResponse.json({ error: "not_found" }, { status: 404 });

  const pdf = await buildSettlementPdf({
    settlement,
    eventTitle:
      event.title ?? (event.venues as unknown as { name: string } | null)?.name ?? "Event",
    date: (event.days as unknown as { date: string }).date,
  });
  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="settlement-${eventId}.pdf"`,
    },
  });
}
