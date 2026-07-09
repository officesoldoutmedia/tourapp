"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireOrg } from "@/lib/org";
import { can } from "@/lib/permissions";

function profilePath(orgSlug: string, tourId: string, personnelId: string) {
  return `/o/${orgSlug}/t/${tourId}/personnel/${personnelId}`;
}

async function requireAccounting(orgSlug: string) {
  const ctx = await requireOrg(orgSlug);
  if (!can({ tier: ctx.tier, permission: ctx.permission }, "edit_accounting")) {
    throw new Error("forbidden");
  }
  return ctx;
}

export async function setPersonnelPhoto(
  orgSlug: string,
  tourId: string,
  personnelId: string,
  path: string,
): Promise<{ error?: string }> {
  const { supabase } = await requireOrg(orgSlug);
  const { error } = await supabase
    .from("tour_personnel")
    .update({ photo_path: path })
    .eq("id", personnelId);
  if (error) return { error: error.message };
  revalidatePath(profilePath(orgSlug, tourId, personnelId));
  return {};
}

export async function saveBillingDetails(
  orgSlug: string,
  tourId: string,
  personnelId: string,
  formData: FormData,
): Promise<void> {
  const { supabase } = await requireAccounting(orgSlug);
  const keys = [
    "name",
    "cui",
    "reg_com",
    "id_number",
    "address",
    "iban",
    "bank",
    "representative",
    "contract_number",
  ];
  const billing = Object.fromEntries(
    keys
      .map((k) => [k, String(formData.get(k) ?? "").trim()])
      .filter(([, v]) => v),
  );
  await supabase
    .from("tour_personnel")
    .update({
      billing_details: billing,
      payment_type: String(formData.get("paymentType") ?? "") || null,
    })
    .eq("id", personnelId);
  revalidatePath(profilePath(orgSlug, tourId, personnelId));
}

export async function createAnnex(
  orgSlug: string,
  tourId: string,
  personnelId: string,
  formData: FormData,
): Promise<void> {
  const { supabase, org, user } = await requireAccounting(orgSlug);
  const path = profilePath(orgSlug, tourId, personnelId);
  const fail = (code: string): never => redirect(`${path}?error=${code}`);
  const costIds = formData.getAll("costId").map(String);
  if (costIds.length === 0) fail("no_lines");

  const { data: lines } = await supabase
    .from("show_costs")
    .select("id, amount, currency, annex_id")
    .in("id", costIds)
    .is("deleted_at", null);
  if (!lines || lines.length === 0) fail("no_lines");
  if (lines!.some((l) => l.annex_id)) fail("already_annexed");
  const currencies = new Set(lines!.map((l) => l.currency));
  if (currencies.size > 1) fail("mixed_currencies");

  const { data: person } = await supabase
    .from("tour_personnel")
    .select("billing_details, payment_type, first_name, last_name")
    .eq("id", personnelId)
    .maybeSingle();
  if (!person) fail("not_found");

  const billing = (person!.billing_details ?? {}) as Record<string, string>;
  const payee = {
    ...billing,
    name:
      billing.name ||
      [person!.first_name, person!.last_name].filter(Boolean).join(" "),
  };
  const payer = ((org.settings ?? {}) as Record<string, unknown>).billing ?? {};

  const { data: previous } = await supabase
    .from("payment_annexes")
    .select("annex_number")
    .eq("personnel_id", personnelId)
    .order("annex_number", { ascending: false })
    .limit(1);
  const nextNumber =
    Number(formData.get("annexNumber")) ||
    ((previous?.[0]?.annex_number ?? 0) + 1);

  const total = lines!.reduce((s, l) => s + Number(l.amount), 0);
  const { data: annex, error } = await supabase
    .from("payment_annexes")
    .insert({
      organization_id: org.id,
      tour_id: tourId,
      personnel_id: personnelId,
      annex_number: nextNumber,
      contract_number:
        String(formData.get("contractNumber") ?? "").trim() ||
        billing.contract_number ||
        null,
      issue_date:
        String(formData.get("issueDate") ?? "") ||
        new Date().toISOString().slice(0, 10),
      currency: lines![0].currency,
      total,
      language: String(formData.get("language") ?? "ro"),
      payment_currency:
        String(formData.get("paymentCurrency") ?? "").trim().toUpperCase() || null,
      fx_rate: Number(formData.get("fxRate")) > 0 ? Number(formData.get("fxRate")) : null,
      payer,
      payee,
      created_by: user.id,
    })
    .select("id")
    .single();
  if (error) fail("insert_failed");

  await supabase.from("show_costs").update({ annex_id: annex!.id }).in("id", costIds);
  revalidatePath(path);
}

export async function toggleAnnexPaid(
  orgSlug: string,
  tourId: string,
  personnelId: string,
  formData: FormData,
): Promise<void> {
  const { supabase } = await requireAccounting(orgSlug);
  const id = String(formData.get("id"));
  const paid = String(formData.get("paid")) === "1";
  await supabase
    .from("payment_annexes")
    .update({ paid_at: paid ? new Date().toISOString().slice(0, 10) : null })
    .eq("id", id);
  revalidatePath(profilePath(orgSlug, tourId, personnelId));
}

export async function deleteAnnex(
  orgSlug: string,
  tourId: string,
  personnelId: string,
  formData: FormData,
): Promise<void> {
  const { supabase } = await requireAccounting(orgSlug);
  const id = String(formData.get("id"));
  // liniile redevin nealocate, anexa rămâne recuperabilă (soft delete)
  await supabase.from("show_costs").update({ annex_id: null }).eq("annex_id", id);
  await supabase
    .from("payment_annexes")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);
  revalidatePath(profilePath(orgSlug, tourId, personnelId));
}
