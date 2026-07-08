import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { buildRoomingPdf } from "@/pdf/RoomingPdf";

/** Rooming List PDF per hotel [N §6.17.3]. */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ hotelId: string }> },
) {
  const { hotelId } = await params;
  const supabase = await createServerSupabase();

  const { data: hotel } = await supabase
    .from("day_hotels")
    .select(
      "name, city, check_in_date, check_out_date, days(date), room_list_entries(guest_name, bag_tag, room_number, room_type, smoking, check_in, check_out, confirmation_number, deleted_at, tour_personnel(first_name, last_name, preferred_name))",
    )
    .eq("id", hotelId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!hotel) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const pdf = await buildRoomingPdf(hotel);
  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="rooming-${hotel.name}.pdf"`,
    },
  });
}
