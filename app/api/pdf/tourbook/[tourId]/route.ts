import { NextResponse } from "next/server";
import { getLocale } from "next-intl/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { getDaySheetData, type DaySheetData } from "@/lib/daysheet";
import { buildDaySheetPdf } from "@/pdf/DaySheetPdf";

/** Tour book multi-day [N §6.17.2]: interval From–To, o pagină+ per zi. */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ tourId: string }> },
) {
  const { tourId } = await params;
  const { searchParams } = new URL(request.url);
  const supabase = await createServerSupabase();

  let query = supabase
    .from("days")
    .select("id")
    .eq("tour_id", tourId)
    .is("deleted_at", null)
    .order("date");
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  if (from) query = query.gte("date", from);
  if (to) query = query.lte("date", to);
  const { data: days } = await query;
  if (!days || days.length === 0)
    return NextResponse.json({ error: "not_found" }, { status: 404 });

  const includeRooms = searchParams.get("rooms") === "1";
  const sheets: DaySheetData[] = [];
  for (const day of days) {
    const sheet = await getDaySheetData(supabase, day.id, { includeRooms });
    if (sheet) sheets.push(sheet);
  }

  const { data: tourRow } = await supabase
    .from("tours")
    .select("logo_path")
    .eq("id", tourId)
    .maybeSingle();
  const logoUrl = tourRow?.logo_path
    ? ((await supabase.storage.from("attachments").createSignedUrl(tourRow.logo_path, 600)).data
        ?.signedUrl ?? null)
    : null;
  const pdf = await buildDaySheetPdf(sheets, await getLocale(), logoUrl);
  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="tourbook.pdf"`,
    },
  });
}
