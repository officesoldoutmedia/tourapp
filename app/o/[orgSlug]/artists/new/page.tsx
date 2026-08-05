import { redirect } from "next/navigation";
import { requireOrg } from "@/lib/org";
import { can } from "@/lib/permissions";
import { NewArtistForm } from "./form";

export default async function NewArtistPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;
  const { permission, tier } = await requireOrg(orgSlug);
  if (!can({ tier, permission }, "manage_tours")) redirect(`/o/${orgSlug}`);

  return <NewArtistForm orgSlug={orgSlug} />;
}
