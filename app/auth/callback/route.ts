import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";

/** PKCE code exchange — ținta redirecturilor din emailurile Supabase. */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/app";
  // Doar redirecturi interne.
  const safeNext = next.startsWith("/") ? next : "/app";

  if (code) {
    const supabase = await createServerSupabase();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${safeNext}`);
    }
  }

  return NextResponse.redirect(`${origin}/login`);
}
