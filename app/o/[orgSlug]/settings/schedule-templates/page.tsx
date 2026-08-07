import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { requireOrg } from "@/lib/org";
import { can } from "@/lib/permissions";
import type { ScheduleTemplateItem } from "@/lib/scheduleGeneration";
import { TemplatesClient } from "./templates-client";

/** C2 — editorul template-urilor de program (org-level). Gate UX identic cu
 *  file-categories; RLS validează oricum scrierile. */
export default async function ScheduleTemplatesPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;
  const { supabase, org, permission, tier } = await requireOrg(orgSlug);
  const t = await getTranslations("scheduleTemplates");
  if (!can({ tier, permission }, "edit_tour_content")) notFound();

  const { data: templates } = await supabase
    .from("schedule_templates")
    .select("id, name, items")
    .eq("organization_id", org.id)
    .is("deleted_at", null)
    .order("name");

  return (
    <main className="mx-auto w-full max-w-2xl space-y-6 p-6">
      <div>
        <h1 className="font-display text-xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="mt-1 text-xs text-tertiary">{t("hint")}</p>
      </div>
      <TemplatesClient
        orgSlug={orgSlug}
        templates={(templates ?? []).map((tpl) => ({
          id: tpl.id as string,
          name: tpl.name as string,
          items: (tpl.items ?? []) as ScheduleTemplateItem[],
        }))}
      />
    </main>
  );
}
