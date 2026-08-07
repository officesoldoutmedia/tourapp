"use server";

/**
 * Deal templates (C1, tab „Deals" pe artist) — CRUD pe structura EXACTĂ a
 * `profile/actions.ts` (saveArtistParty/deleteArtistParty/moveArtistParty).
 * Snapshot-ul pe event (deal_snapshot) se construiește separat, la aplicare
 * (Task 4) — aici doar întreținem template-ul-sursă.
 */
import { revalidatePath } from "next/cache";
import { requireOrg } from "@/lib/org";
import { can } from "@/lib/permissions";

async function requireManage(orgSlug: string) {
  const ctx = await requireOrg(orgSlug);
  if (!can({ tier: ctx.tier, permission: ctx.permission }, "manage_tours")) {
    throw new Error("forbidden");
  }
  return ctx;
}

export interface DealTemplateAccommodationInput {
  rooms_single?: number;
  rooms_double?: number;
  category?: string;
  nights?: number;
}

export interface DealTemplateInput {
  id?: string;
  name: string;
  feeAmount: number | null;
  feeCurrency: string;
  dealBasis: string | null;
  withholdingPercent: number | null;
  landedItems: string[];
  accommodation: DealTemplateAccommodationInput;
  requiredCategoryIds: string[];
  scheduleTemplateId: string | null;
}

const DEAL_BASIS_VALUES = new Set(["landed", "all_in", "fee_plus_costs"]);

function positiveOrNull(n: number | null | undefined): number | null {
  return n != null && Number.isFinite(n) && n > 0 ? n : null;
}

function normalizeAccommodation(
  input: DealTemplateAccommodationInput,
): DealTemplateAccommodationInput {
  const out: DealTemplateAccommodationInput = {};
  const roomsSingle = positiveOrNull(input.rooms_single);
  if (roomsSingle != null) out.rooms_single = roomsSingle;
  const roomsDouble = positiveOrNull(input.rooms_double);
  if (roomsDouble != null) out.rooms_double = roomsDouble;
  const nights = positiveOrNull(input.nights);
  if (nights != null) out.nights = nights;
  const category = input.category?.trim();
  if (category) out.category = category;
  return out;
}

export async function saveDealTemplate(
  orgSlug: string,
  artistSlug: string,
  artistId: string,
  input: DealTemplateInput,
): Promise<{ error?: string }> {
  const { supabase, org, user } = await requireManage(orgSlug);
  const name = input.name.trim();
  if (!name) return { error: "invalid" };

  const feeAmount = positiveOrNull(input.feeAmount);
  const withholdingPercent = positiveOrNull(input.withholdingPercent);
  const dealBasis =
    input.dealBasis && DEAL_BASIS_VALUES.has(input.dealBasis) ? input.dealBasis : null;

  // C2: legătura deal → template de program. Validăm explicit org-ul —
  // un membru multi-org ar putea trimite id-ul unui template din alt org
  // (RLS pe deal_templates leagă artistul, nu template-ul de program). Nu
  // filtrăm pe `deleted_at` aici: un template șters între timp e un caz
  // legitim (deal-ul rămâne salvabil, doar legătura se rupe), diferit de un
  // id inexistent/din alt org — asta chiar e semnal de tampering.
  let scheduleTemplateId: string | null = null;
  if (input.scheduleTemplateId) {
    const { data: tpl } = await supabase
      .from("schedule_templates")
      .select("id, organization_id, deleted_at")
      .eq("id", input.scheduleTemplateId)
      .maybeSingle();
    if (!tpl || tpl.organization_id !== org.id) return { error: "invalid" };
    scheduleTemplateId = tpl.deleted_at ? null : tpl.id;
  }

  const payload = {
    name,
    fee_amount: feeAmount,
    fee_currency: feeAmount != null ? input.feeCurrency || "EUR" : null,
    deal_basis: dealBasis,
    withholding_percent: withholdingPercent,
    landed_items: input.landedItems.map((s) => s.trim()).filter(Boolean),
    accommodation: normalizeAccommodation(input.accommodation),
    required_category_ids: input.requiredCategoryIds,
    schedule_template_id: scheduleTemplateId,
  };

  let error;
  if (input.id) {
    ({ error } = await supabase.from("deal_templates").update(payload).eq("id", input.id));
  } else {
    // sort_order la insert = numărul de siblings existenți (nedelete), ca
    // noul template să aterizeze la finalul listei fără să reordonăm restul.
    const { count } = await supabase
      .from("deal_templates")
      .select("id", { count: "exact", head: true })
      .eq("artist_id", artistId)
      .is("deleted_at", null);
    ({ error } = await supabase.from("deal_templates").insert({
      ...payload,
      organization_id: org.id,
      artist_id: artistId,
      created_by: user.id,
      sort_order: count ?? 0,
    }));
  }
  if (error) return { error: error.message };
  revalidatePath(`/o/${orgSlug}/a/${artistSlug}/deals`);
  return {};
}

export async function deleteDealTemplate(
  orgSlug: string,
  artistSlug: string,
  templateId: string,
): Promise<{ error?: string }> {
  const { supabase } = await requireManage(orgSlug);
  const { error } = await supabase
    .from("deal_templates")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", templateId);
  if (error) return { error: error.message };
  revalidatePath(`/o/${orgSlug}/a/${artistSlug}/deals`);
  return {};
}

export async function moveDealTemplate(
  orgSlug: string,
  artistSlug: string,
  templateId: string,
  direction: "up" | "down",
): Promise<{ error?: string }> {
  const { supabase } = await requireManage(orgSlug);
  const { data: row } = await supabase
    .from("deal_templates")
    .select("id, artist_id, sort_order")
    .eq("id", templateId)
    .maybeSingle();
  if (!row) return { error: "not_found" };
  const { data: siblings } = await supabase
    .from("deal_templates")
    .select("id, sort_order")
    .eq("artist_id", row.artist_id)
    .is("deleted_at", null)
    .order("sort_order")
    .order("created_at");
  const list = siblings ?? [];
  const idx = list.findIndex((s) => s.id === templateId);
  const swap = direction === "up" ? idx - 1 : idx + 1;
  if (idx < 0 || swap < 0 || swap >= list.length) return {};
  await supabase.from("deal_templates").update({ sort_order: swap }).eq("id", list[idx].id);
  await supabase.from("deal_templates").update({ sort_order: idx }).eq("id", list[swap].id);
  revalidatePath(`/o/${orgSlug}/a/${artistSlug}/deals`);
  return {};
}
