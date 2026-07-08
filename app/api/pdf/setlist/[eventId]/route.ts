import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { buildSetListPdf } from "@/pdf/SetListPdf";

/** Set List PDF [N §6.17.3] — RLS-ul se aplică prin clientul server. */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ eventId: string }> },
) {
  const { eventId } = await params;
  const supabase = await createServerSupabase();

  const [{ data: event }, { data: items }] = await Promise.all([
    supabase
      .from("events")
      .select("title, venues(name), days!inner(date)")
      .eq("id", eventId)
      .is("deleted_at", null)
      .maybeSingle(),
    supabase
      .from("set_list_items")
      .select("item_type, break_label, guest_performers, songs(title, length_seconds)")
      .eq("set_list_id", eventId)
      .order("position"),
  ]);

  if (!event) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const pdf = await buildSetListPdf({
    eventTitle:
      event.title ??
      (event.venues as unknown as { name: string } | null)?.name ??
      "Set List",
    date: (event.days as unknown as { date: string }).date,
    items: (items ?? []).map((item) => {
      const song = item.songs as unknown as {
        title: string;
        length_seconds: number | null;
      } | null;
      return {
        item_type: item.item_type as "song" | "break",
        title: item.item_type === "break" ? (item.break_label ?? "Break") : (song?.title ?? "—"),
        length_seconds: song?.length_seconds ?? null,
        guest_performers: item.guest_performers,
      };
    }),
  });

  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="setlist-${eventId}.pdf"`,
    },
  });
}
