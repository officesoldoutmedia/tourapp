import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { computeGroundDistance, isGoogleEnabled } from "@/lib/googlePlaces";

/**
 * Rută live pentru formularul de travel: distanță + durată (Distance
 * Matrix, server-side — cheia nu ajunge în browser). Doar useri logați.
 */
export async function POST(request: Request) {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { origin, dest } = (await request.json()) as {
    origin?: string;
    dest?: string;
  };
  if (!origin?.trim() || !dest?.trim() || !isGoogleEnabled()) {
    return NextResponse.json({ ok: false });
  }

  const route = await computeGroundDistance(origin, dest);
  if (!route) return NextResponse.json({ ok: false });
  return NextResponse.json({ ok: true, ...route });
}
