import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { buildIcs, type IcsFeedDay } from "@/lib/ics";

/**
 * Feed ICS tokenizat [N §6.16, comportament C]. Token-ul identifică
 * userul; ical_feed() (SECURITY DEFINER) aplică visibility-ul LUI.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const { searchParams } = new URL(request.url);
  const mode = searchParams.get("mode") === "items" ? "items" : "summary";

  if (!/^[0-9a-f-]{36}$/i.test(token)) {
    return NextResponse.json({ error: "invalid_token" }, { status: 400 });
  }

  const supabase = createServiceClient();
  const { data, error } = await supabase.rpc("ical_feed", {
    feed_token: token,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (data === null) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const ics = buildIcs(mode, (data ?? []) as IcsFeedDay[]);
  return new NextResponse(ics, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="tourapp-${mode}.ics"`,
      "Cache-Control": "private, max-age=300",
    },
  });
}
