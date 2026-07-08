import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { autocompletePlaces } from "@/lib/googlePlaces";

/**
 * Sugestii de locuri pentru origin/destination (doar useri logați).
 * Per mod de travel [cererea lui Ștefan]: air → aeroporturi, rail → gări,
 * sea → porturi/terminale ferry, ground → orice adresă/POI.
 */
const TYPE_FILTERS: Record<string, string[] | undefined> = {
  ground: undefined,
  air: ["airport", "international_airport"],
  rail: ["train_station"],
  sea: ["ferry_terminal", "marina"],
};

export async function POST(request: Request) {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { input, mode } = (await request.json()) as {
    input?: string;
    mode?: string;
  };
  if (!input?.trim()) return NextResponse.json({ suggestions: [] });
  const suggestions = await autocompletePlaces(input, TYPE_FILTERS[mode ?? "ground"]);
  return NextResponse.json({ suggestions });
}
