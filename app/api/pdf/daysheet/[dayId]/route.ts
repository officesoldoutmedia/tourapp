import { NextResponse } from "next/server";
import { getLocale } from "next-intl/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { getDaySheetData } from "@/lib/daysheet";
import { buildDaySheetPdf } from "@/pdf/DaySheetPdf";

/** Day Sheet PDF single [N §6.17.1] — RLS = visibility-ul userului (DoD). */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ dayId: string }> },
) {
  const { dayId } = await params;
  const { searchParams } = new URL(request.url);
  const supabase = await createServerSupabase();

  const day = await getDaySheetData(supabase, dayId, {
    includeRooms: searchParams.get("rooms") === "1",
  });
  if (!day) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const pdf = await buildDaySheetPdf([day], await getLocale());
  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="daysheet-${day.date}.pdf"`,
    },
  });
}
