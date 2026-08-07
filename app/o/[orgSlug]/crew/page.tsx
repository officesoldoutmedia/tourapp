import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { requireOrg } from "@/lib/org";
import { can } from "@/lib/permissions";
import type { ContractBlock } from "@/lib/contractMerge";
import type { TemplateRow } from "./contract-actions";
import { EntitiesClient, type CrewEntityRow, type FrameworkDocRow } from "./entities-client";

/** C3 — registrul juridic org-level: entitățile de crew (Legal & Billing)
 *  + starea contractelor-cadru per entitate. Gate UX identic cu
 *  celelalte pagini accounting-only; RLS (00033) dublează gate-ul. */
export default async function CrewRegistryPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;
  const { supabase, org, permission, tier } = await requireOrg(orgSlug);
  const t = await getTranslations("crewRegistry");
  if (!can({ tier, permission }, "edit_accounting")) notFound();

  const [{ data: entities }, { data: documents }, { data: templates }] = await Promise.all([
    supabase
      .from("crew_entities")
      .select("*")
      .eq("organization_id", org.id)
      .is("deleted_at", null)
      .order("display_name"),
    supabase
      .from("contract_documents")
      .select("id, crew_entity_id, doc_number, status, valid_until, created_at")
      .eq("organization_id", org.id)
      .eq("kind", "framework")
      .is("deleted_at", null)
      .order("created_at", { ascending: false }),
    supabase
      .from("contract_templates")
      .select(
        "id, name, doc_kind, body, match_role, match_entity_type, issuing_entity_id, series_prefix, series_next, sort_order",
      )
      .eq("organization_id", org.id)
      .is("deleted_at", null)
      .order("sort_order"),
  ]);

  // grupare documente-cadru pe entitate + statusul calculat (§brief T7)
  const docsByEntity = new Map<string, FrameworkDocRow[]>();
  for (const doc of documents ?? []) {
    const row: FrameworkDocRow = {
      id: doc.id as string,
      docNumber: doc.doc_number as string,
      status: doc.status as string,
      validUntil: doc.valid_until as string | null,
      createdAt: doc.created_at as string,
    };
    const list = docsByEntity.get(doc.crew_entity_id as string) ?? [];
    list.push(row);
    docsByEntity.set(doc.crew_entity_id as string, list);
  }

  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() + 60);
  const cutoff = cutoffDate.toISOString().slice(0, 10);
  function frameworkStatus(docs: FrameworkDocRow[]): CrewEntityRow["frameworkStatus"] {
    const signed = docs.filter((d) => d.status === "signed");
    if (signed.length === 0) return "missing";
    const hasActive = signed.some((d) => d.validUntil != null && d.validUntil >= cutoff);
    return hasActive ? "active" : "expiring";
  }

  const rows: CrewEntityRow[] = (entities ?? []).map((e) => {
    const docs = (docsByEntity.get(e.id as string) ?? []).sort((a, b) =>
      b.createdAt.localeCompare(a.createdAt),
    );
    return {
      id: e.id as string,
      entityType: e.entity_type as string,
      displayName: e.display_name as string,
      companyName: e.company_name as string | null,
      cui: e.cui as string | null,
      regCom: e.reg_com as string | null,
      address: e.address as string | null,
      representative: e.representative as string | null,
      iban: e.iban as string | null,
      bank: e.bank as string | null,
      vatPayer: !!e.vat_payer,
      fiscalCountry: e.fiscal_country as string,
      idDocument: e.id_document as string | null,
      defaultRate: e.default_rate != null ? Number(e.default_rate) : null,
      rateUnit: e.rate_unit as string,
      rateCurrency: e.rate_currency as string,
      paymentTermsDays: e.payment_terms_days as number | null,
      docLanguage: e.doc_language as string,
      frameworkStatus: frameworkStatus(docs),
      frameworkDocs: docs,
    };
  });

  const templateRows: TemplateRow[] = (templates ?? []).map((tpl) => ({
    id: tpl.id as string,
    name: tpl.name as string,
    doc_kind: tpl.doc_kind as string,
    body: (tpl.body ?? []) as ContractBlock[],
    match_role: tpl.match_role as string | null,
    match_entity_type: tpl.match_entity_type as string | null,
    issuing_entity_id: tpl.issuing_entity_id as string | null,
    series_prefix: tpl.series_prefix as string,
    series_next: tpl.series_next as number,
    sort_order: tpl.sort_order as number,
  }));

  return (
    <main className="mx-auto w-full max-w-3xl space-y-6 p-6">
      <div>
        <h1 className="font-display text-xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="mt-1 text-xs text-tertiary">{t("hint")}</p>
      </div>
      <EntitiesClient orgSlug={orgSlug} orgId={org.id} entities={rows} templates={templateRows} />
    </main>
  );
}
