import "server-only";
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
 */
export async function requireOrg(orgSlug: string): Promise<OrgContext> {
  const { user, supabase } = await requireUser();

  const [{ data: org }, { data: profile }] = await Promise.all([
    supabase
      .from("organizations")
      .select("id, name, slug, settings")
      .eq("slug", orgSlug)
      .is("deleted_at", null)
      .maybeSingle(),
    supabase.from("profiles").select("user_tier").eq("id", user.id).single(),
  ]);

  if (!org) notFound();

  const { data: membership } = await supabase
    .from("organization_members")
    .select("permission")
    .eq("organization_id", org.id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!membership) notFound();

  return {
    user,
    supabase,
    org,
    permission: membership.permission as OrgPermission,
    tier: (profile?.user_tier ?? "free") as UserTier,
  };
}
