import { redirect } from "next/navigation";
import { requireOrg } from "@/lib/org";
import { can } from "@/lib/permissions";
import { NewEventForm } from "./form";

export default async function NewEventPage({
  params,
  searchParams,
}: {
  params: Promise<{ orgSlug: string }>;
  searchParams: Promise<{ artist?: string }>;
}) {
  const { orgSlug } = await params;
  const { artist } = await searchParams;
  const { supabase, org, permission, tier } = await requireOrg(orgSlug);
  if (!can({ tier, permission }, "manage_tours")) redirect(`/o/${orgSlug}`);

  const [{ data: artists }, { data: scheduleTemplates }, { data: advanceTemplates }] =
    await Promise.all([
      supabase
        .from("artists")
        .select("id, name")
        .eq("organization_id", org.id)
        .eq("is_archived", false)
        .is("deleted_at", null)
        .order("name"),
      supabase
        .from("schedule_templates")
        .select("id, name")
        .eq("organization_id", org.id)
        .is("deleted_at", null)
        .order("name"),
      supabase
        .from("advance_templates")
        .select("id, title")
        .eq("organization_id", org.id)
        .is("deleted_at", null)
        .order("title"),
    ]);

  // Un artist arhivat (sau șters) poate ajunge pe acest link prin `?artist=`
  // din pagina lui (`a/[artistSlug]`), dar select-ul de mai sus îl exclude —
  // dacă i-am da oricum id-ul lui la `defaultArtistId`, submit-ul ar pica
  // silențios pe `invalid` la validarea din `createOneOffEvent`. Oferim
  // default-ul doar dacă id-ul chiar există în lista încărcată.
  const artistIds = new Set((artists ?? []).map((a) => a.id));
  const defaultArtistId = artist && artistIds.has(artist) ? artist : undefined;

  return (
    <NewEventForm
      orgSlug={orgSlug}
      artists={artists ?? []}
      scheduleTemplates={scheduleTemplates ?? []}
      advanceTemplates={advanceTemplates ?? []}
      defaultArtistId={defaultArtistId}
    />
  );
}
