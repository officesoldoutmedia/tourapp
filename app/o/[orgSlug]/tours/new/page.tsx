import { notFound } from "next/navigation";
import { requireOrg } from "@/lib/org";
import { can } from "@/lib/permissions";
import { TourWizard } from "./wizard";

export default async function NewTourPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;
  const { supabase, org, permission, tier } = await requireOrg(orgSlug);
  if (!can({ tier, permission }, "manage_tours")) notFound();

  const { data: templates } = await supabase
    .from("schedule_templates")
    .select("id, name")
    .eq("organization_id", org.id)
    .is("deleted_at", null)
    .order("name");

  return <TourWizard orgSlug={orgSlug} templates={templates ?? []} />;
}
