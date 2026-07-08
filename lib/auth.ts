import "server-only";
import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";

/**
 * Userul autentificat sau redirect la /login. Folosit în Server
 * Components și Server Actions de sub /app și /o.
 */
export async function requireUser() {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");
  return { user, supabase };
}
