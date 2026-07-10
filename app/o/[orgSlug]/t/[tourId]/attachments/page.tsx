import { notFound } from "next/navigation";
import { requireOrg } from "@/lib/org";
import { can } from "@/lib/permissions";
import {
  AttachmentsSection,
  type AttachmentData,
} from "../d/[date]/extras-client";

/** Attachments la nivel de TUR [MT parity] — rider, contracte, hărți etc. */
export default async function TourAttachmentsPage({
  params,
}: {
  params: Promise<{ orgSlug: string; tourId: string }>;
}) {
  const { orgSlug, tourId } = await params;
  const { supabase, org, permission, tier } = await requireOrg(orgSlug);
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
    <main className="mx-auto w-full max-w-3xl space-y-6 p-6">
      <h1 className="font-display text-xl font-semibold tracking-tight">
        Tour files <span className="font-normal text-tertiary">· {tour.name}</span>
      </h1>
      <div className="rounded-[12px] border border-hairline bg-surface p-4">
        <AttachmentsSection
          orgSlug={orgSlug}
          tourId={tourId}
          date=""
          dayId=""
          orgId={org.id}
          attachments={(attachments ?? []) as AttachmentData[]}
          canEdit={canEdit}
          parentType="tour"
        />
      </div>
    </main>
  );
}
