import { notFound } from "next/navigation";
import { requireOrg } from "@/lib/org";
import { can } from "@/lib/permissions";
import { TourWizard } from "./wizard";

export default async function NewTourPage({
  params,
  searchParams,
}: {
  params: Promise<{ orgSlug: string }>;
  searchParams: Promise<{ artist?: string }>;
}) {
  const { orgSlug } = await params;
  const { artist } = await searchParams;
  const { supabase, org, permission, tier } = await requireOrg(orgSlug);
  if (!can({ tier, permission }, "manage_tours")) notFound();

  const [{ data: templates }, { data: artists }] = await Promise.all([
    supabase
      .from("schedule_templates")
      .select("id, name")
      .eq("organization_id", org.id)
      .is("deleted_at", null)
      .order("name"),
    supabase
      .from("artists")
      .select("id, name")
      .eq("organization_id", org.id)
      .eq("is_archived", false)
      .is("deleted_at", null)
      .order("name"),
  ]);

  return (
    <TourWizard
      orgSlug={orgSlug}
      templates={templates ?? []}
      artists={artists ?? []}
      defaultArtistId={artist}
    />
  );
}
