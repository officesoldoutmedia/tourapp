import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { requireOrg } from "@/lib/org";
import { can } from "@/lib/permissions";
import { TourDocuments, type TourDocData } from "./docs-client";

/** Documentele turului [MT parity] — rider, contracte, hărți etc. */
export default async function TourAttachmentsPage({
  params,
}: {
  params: Promise<{ orgSlug: string; tourId: string }>;
}) {
  const { orgSlug, tourId } = await params;
  const { supabase, org, permission, tier } = await requireOrg(orgSlug);
  const t = await getTranslations("attachments");
  const canEdit = can({ tier, permission }, "edit_tour_content");

  const [{ data: tour }, { data: attachments }] = await Promise.all([
    supabase.from("tours").select("id, name").eq("id", tourId).is("deleted_at", null).maybeSingle(),
    supabase
      .from("attachments")
      .select("id, file_name, mime_type, size_bytes, tags, created_at")
      .eq("parent_type", "tour")
      .eq("parent_id", tourId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false }),
  ]);
  if (!tour) notFound();

  return (
    <main className="mx-auto w-full max-w-3xl space-y-5 p-6">
      <div>
        <p className="eyebrow">{tour.name}</p>
        <h1 className="page-title mt-1">{t("pageTitle")}</h1>
      </div>
      <TourDocuments
        orgSlug={orgSlug}
        tourId={tourId}
        orgId={org.id}
        attachments={(attachments ?? []) as TourDocData[]}
        canEdit={canEdit}
      />
    </main>
  );
}
