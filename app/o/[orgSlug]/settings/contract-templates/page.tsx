import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { requireOrg } from "@/lib/org";
import { can } from "@/lib/permissions";
import type { ContractBlock } from "@/lib/contractMerge";
import { TemplatesClient } from "./templates-client";

/** C3 — editorul template-urilor de contract (org-level). Gate UX identic
 *  cu schedule-templates; RLS validează oricum scrierile. Body-ul e un
 *  array de blocuri (`ContractBlock`) cu merge fields `{{cheie}}`. */
export default async function ContractTemplatesPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;
  const { supabase, org, permission, tier } = await requireOrg(orgSlug);
  const t = await getTranslations("contractTemplates");
  if (!can({ tier, permission }, "edit_tour_content")) notFound();

  const [{ data: templates }, { data: entities }] = await Promise.all([
    supabase
      .from("contract_templates")
      .select(
        "id, name, doc_kind, body, match_role, match_entity_type, issuing_entity_id, series_prefix, series_next",
      )
      .eq("organization_id", org.id)
      .is("deleted_at", null)
      .order("sort_order")
      .order("created_at"),
    supabase
      .from("issuing_entities")
      .select("id, name")
      .eq("organization_id", org.id)
      .is("deleted_at", null)
      .order("name"),
  ]);

  return (
    <main className="mx-auto w-full max-w-2xl space-y-6 p-6">
      <div>
        <h1 className="font-display text-xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="mt-1 text-xs text-tertiary">{t("hint")}</p>
      </div>
      <TemplatesClient
        orgSlug={orgSlug}
        entities={(entities ?? []).map((e) => ({ id: e.id as string, name: e.name as string }))}
        templates={(templates ?? []).map((tpl) => ({
          id: tpl.id as string,
          name: tpl.name as string,
          docKind: tpl.doc_kind as string,
          body: (tpl.body ?? []) as ContractBlock[],
          matchRole: (tpl.match_role ?? "") as string,
          matchEntityType: (tpl.match_entity_type ?? "") as string,
          issuingEntityId: (tpl.issuing_entity_id ?? "") as string,
          seriesPrefix: tpl.series_prefix as string,
          seriesNext: tpl.series_next as number,
        }))}
      />
    </main>
  );
}
