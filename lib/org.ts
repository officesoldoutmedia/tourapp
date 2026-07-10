import "server-only";
import { cache } from "react";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import type { OrgPermission, UserTier } from "@/lib/permissions";

export interface OrgContext {
  user: Awaited<ReturnType<typeof requireUser>>["user"];
  supabase: Awaited<ReturnType<typeof requireUser>>["supabase"];
  org: { id: string; name: string; slug: string; settings: Record<string, unknown> };
  permission: OrgPermission;
  tier: UserTier;
}

/**
 * Guard-ul rutelor /o/[orgSlug]: user autentificat + membru al org-ului.
 * RLS ascunde org-urile străine, deci un slug inaccesibil = notFound.
 *
 * Performanță: un singur round-trip (membership JOIN organizations, în
 * paralel cu profiles) în loc de trei secvențiale; cache() deduplichează
 * între layouturi + pagină pe același request.
 */
export const requireOrg = cache(async (orgSlug: string): Promise<OrgContext> => {
  const { user, supabase } = await requireUser();

  const [{ data: member }, { data: profile }] = await Promise.all([
    supabase
      .from("organization_members")
      .select("permission, organizations!inner(id, name, slug, settings, deleted_at)")
      .eq("user_id", user.id)
      .eq("organizations.slug", orgSlug)
      .is("organizations.deleted_at", null)
      .maybeSingle(),
    supabase.from("profiles").select("user_tier").eq("id", user.id).single(),
  ]);

  const org = member?.organizations as unknown as OrgContext["org"] | null;
  if (!member || !org) notFound();

  return {
    user,
    supabase,
    org,
    permission: member.permission as OrgPermission,
    tier: (profile?.user_tier ?? "free") as UserTier,
  };
});
