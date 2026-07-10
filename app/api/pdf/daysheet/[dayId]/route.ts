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

  const { data: dayRow } = await supabase
    .from("days")
    .select("tours(logo_path)")
    .eq("id", dayId)
    .maybeSingle();
  const logoPath = (dayRow?.tours as unknown as { logo_path: string | null } | null)?.logo_path;
  const logoUrl = logoPath
    ? ((await supabase.storage.from("attachments").createSignedUrl(logoPath, 600)).data
        ?.signedUrl ?? null)
    : null;

  const pdf = await buildDaySheetPdf([day], await getLocale(), logoUrl);
  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="daysheet-${day.date}.pdf"`,
    },
  });
}
