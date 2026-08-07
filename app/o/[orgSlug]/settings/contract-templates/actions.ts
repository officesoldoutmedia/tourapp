"use server";

/** C3 — CRUD pe template-urile de contract. Scriere: editori de conținut
 *  (RLS-ul dublează gate-ul). Seria se editează doar aici; incrementul
 *  la generare e atomic (Task 6). */
import { revalidatePath } from "next/cache";
import { requireOrg } from "@/lib/org";
import { can } from "@/lib/permissions";
import type { ContractBlock } from "@/lib/contractMerge";

async function requireEditor(orgSlug: string) {
  const ctx = await requireOrg(orgSlug);
  if (!can({ tier: ctx.tier, permission: ctx.permission }, "edit_tour_content")) {
    throw new Error("forbidden");
  }
  return ctx;
}

const KINDS = new Set(["framework", "annex"]);
const ENTITY_TYPES = new Set(["srl", "pfa", "ii", "individual", "foreign"]);

export interface ContractTemplateInput {
  id?: string;
  name: string;
  docKind: string;
  body: ContractBlock[];
  matchRole: string;
  matchEntityType: string;
  issuingEntityId: string;
  seriesPrefix: string;
  seriesNext: number;
}

function normalizeBody(body: ContractBlock[]): ContractBlock[] | null {
  const out: ContractBlock[] = [];
  for (const block of body) {
    const kind = block.kind === "heading" ? "heading" : "paragraph";
    const text = typeof block.text === "string" ? block.text : "";
    if (!text.trim()) return null; // bloc gol = template incomplet
    out.push({ kind, text });
  }
  return out;
}

export async function saveContractTemplate(
  orgSlug: string,
  input: ContractTemplateInput,
): Promise<{ error?: string }> {
  const { supabase, org } = await requireEditor(orgSlug);
  const name = input.name.trim();
  if (!name || !KINDS.has(input.docKind)) return { error: "invalid" };
  const body = normalizeBody(input.body);
  if (!body) return { error: "invalid" };

  let issuingEntityId: string | null = null;
  if (input.issuingEntityId) {
    const { data: ent } = await supabase
      .from("issuing_entities")
      .select("id, organization_id")
      .eq("id", input.issuingEntityId)
      .is("deleted_at", null)
      .maybeSingle();
    if (!ent || ent.organization_id !== org.id) return { error: "invalid" };
    issuingEntityId = ent.id;
  }

  const seriesNext = Math.max(1, Math.round(Number(input.seriesNext) || 1));
  const payload = {
    name,
    doc_kind: input.docKind,
    body,
    match_role: input.matchRole.trim() || null,
    match_entity_type: ENTITY_TYPES.has(input.matchEntityType) ? input.matchEntityType : null,
    issuing_entity_id: issuingEntityId,
    series_prefix: input.seriesPrefix.trim(),
    series_next: seriesNext,
  };

  let error;
  if (input.id) {
    ({ error } = await supabase
      .from("contract_templates")
      .update(payload)
      .eq("id", input.id)
      .eq("organization_id", org.id));
  } else {
    const { count } = await supabase
      .from("contract_templates")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", org.id)
      .is("deleted_at", null);
    ({ error } = await supabase.from("contract_templates").insert({
      ...payload,
      organization_id: org.id,
      sort_order: count ?? 0,
    }));
  }
  if (error) return { error: error.message };
  revalidatePath(`/o/${orgSlug}/settings/contract-templates`);
  return {};
}

export async function deleteContractTemplate(
  orgSlug: string,
  templateId: string,
): Promise<{ error?: string }> {
  const { supabase, org } = await requireEditor(orgSlug);
  const { error } = await supabase
    .from("contract_templates")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", templateId)
    .eq("organization_id", org.id);
  if (error) return { error: error.message };
  revalidatePath(`/o/${orgSlug}/settings/contract-templates`);
  return {};
}
