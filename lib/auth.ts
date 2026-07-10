import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";

/**
 * Userul autentificat sau redirect la /login. Folosit în Server
 * Components și Server Actions de sub /app și /o.
 *
 * Performanță [raportul userului 2026-07-10]: sesiunea vine din cookie
 * (getSession, fără drum la Supabase Auth) — semnătura JWT a fost DEJA
 * verificată de middleware cu getUser() pe același request, iar
 * autorizarea reală o face oricum RLS cu tokenul la fiecare query.
 * cache() deduplichează apelul între layout + page în același render.
 */
export const requireUser = cache(async () => {
  const supabase = await createServerSupabase();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.user) redirect("/login");
  return { user: session.user, supabase };
});
