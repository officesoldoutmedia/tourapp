"use server";

/** C3 — CRUD pe registrul juridic (entitățile de crew) + editarea
 *  valabilității contractelor-cadru. Scriere: accounting (RLS dublează
 *  gate-ul — §00033). Generarea/statusul/semnatul documentelor trăiesc în
 *  contract-actions.ts (Task 6), NU aici. */
import { revalidatePath } from "next/cache";
import { requireOrg } from "@/lib/org";
import { can } from "@/lib/permissions";

async function requireAccounting(orgSlug: string) {
  const ctx = await requireOrg(orgSlug);
  if (!can({ tier: ctx.tier, permission: ctx.permission }, "edit_accounting")) {
    throw new Error("forbidden");
  }
  return ctx;
}

const ENTITY_TYPES = new Set(["srl", "pfa", "ii", "individual", "foreign"]);
const RATE_UNITS = new Set(["per_show", "per_day"]);
const DOC_LANGUAGES = new Set(["ro", "en", "bi"]);

export interface CrewEntityInput {
  id?: string;
  entityType: string;
  displayName: string;
  companyName: string;
  cui: string;
  regCom: string;
  address: string;
  representative: string;
  iban: string;
  bank: string;
  vatPayer: boolean;
  fiscalCountry: string;
  idDocument: string;
  defaultRate: number | null;
  rateUnit: string;
  rateCurrency: string;
  paymentTermsDays: number | null;
  docLanguage: string;
}

export async function saveCrewEntity(
  orgSlug: string,
  input: CrewEntityInput,
): Promise<{ error?: string; entityId?: string }> {
  const { supabase, org, user } = await requireAccounting(orgSlug);

  const displayName = input.displayName.trim();
  if (!displayName) return { error: "invalid" };
  if (!ENTITY_TYPES.has(input.entityType)) return { error: "invalid" };
  if (!RATE_UNITS.has(input.rateUnit)) return { error: "invalid" };
  if (!DOC_LANGUAGES.has(input.docLanguage)) return { error: "invalid" };

  const payload = {
    entity_type: input.entityType,
    display_name: displayName,
    company_name: input.companyName.trim() || null,
    cui: input.cui.trim() || null,
    reg_com: input.regCom.trim() || null,
    address: input.address.trim() || null,
    representative: input.representative.trim() || null,
    iban: input.iban.trim() || null,
    bank: input.bank.trim() || null,
    vat_payer: !!input.vatPayer,
    fiscal_country: input.fiscalCountry.trim() || "RO",
    id_document: input.idDocument.trim() || null,
    default_rate:
      input.defaultRate != null && Number.isFinite(input.defaultRate) && input.defaultRate > 0
        ? input.defaultRate
        : null,
    rate_unit: input.rateUnit,
    rate_currency: input.rateCurrency.trim() || "EUR",
    payment_terms_days:
      input.paymentTermsDays != null &&
      Number.isFinite(input.paymentTermsDays) &&
      input.paymentTermsDays >= 0
        ? Math.round(input.paymentTermsDays)
        : null,
    doc_language: input.docLanguage,
  };

  if (input.id) {
    const { error } = await supabase
      .from("crew_entities")
      .update(payload)
      .eq("id", input.id)
      .eq("organization_id", org.id);
    if (error) return { error: error.message };
    revalidatePath(`/o/${orgSlug}/crew`);
    return { entityId: input.id };
  }

  const { data: inserted, error } = await supabase
    .from("crew_entities")
    .insert({ ...payload, organization_id: org.id, created_by: user.id })
    .select("id")
    .single();
  if (error) return { error: error.message };
  revalidatePath(`/o/${orgSlug}/crew`);
  return { entityId: inserted.id };
}

export async function deleteCrewEntity(
  orgSlug: string,
  id: string,
): Promise<{ error?: string }> {
  const { supabase, org } = await requireAccounting(orgSlug);
  const { error } = await supabase
    .from("crew_entities")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id)
    .eq("organization_id", org.id);
  if (error) return { error: error.message };
  revalidatePath(`/o/${orgSlug}/crew`);
  return {};
}

export async function setFrameworkValidity(
  orgSlug: string,
  documentId: string,
  validUntil: string | null,
): Promise<{ error?: string }> {
  const { supabase, org } = await requireAccounting(orgSlug);
  const { error } = await supabase
    .from("contract_documents")
    .update({ valid_until: validUntil || null })
    .eq("id", documentId)
    .eq("organization_id", org.id);
  if (error) return { error: error.message };
  revalidatePath(`/o/${orgSlug}/crew`);
  return {};
}
