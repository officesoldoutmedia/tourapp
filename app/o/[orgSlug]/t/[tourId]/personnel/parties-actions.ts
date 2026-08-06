"use server";

import { revalidatePath } from "next/cache";
import { requireOrg } from "@/lib/org";
import { can } from "@/lib/permissions";

async function requireEditor(orgSlug: string) {
  const ctx = await requireOrg(orgSlug);
  if (!can({ tier: ctx.tier, permission: ctx.permission }, "edit_tour_content")) {
    throw new Error("forbidden");
  }
  return ctx;
}

export async function saveTourParty(
  orgSlug: string,
  tourId: string,
  input: { id?: string; name: string; perDiemRate: number | null; perDiemCurrency: string },
): Promise<{ error?: string }> {
  const { supabase, org, user } = await requireEditor(orgSlug);
  const name = input.name.trim();
  if (!name) return { error: "invalid" };
  const rate =
    input.perDiemRate != null && Number.isFinite(input.perDiemRate) && input.perDiemRate > 0
      ? input.perDiemRate
      : null;
  const payload = {
    name,
    per_diem_rate: rate,
    per_diem_currency: rate ? input.perDiemCurrency || "EUR" : null,
  };
  const { error } = input.id
    ? await supabase.from("tour_parties").update(payload).eq("id", input.id)
    : await supabase.from("tour_parties").insert({
        ...payload,
        organization_id: org.id,
        tour_id: tourId,
        created_by: user.id,
      });
  if (error) return { error: error.message };
  revalidatePath(`/o/${orgSlug}/t/${tourId}/personnel`);
  return {};
}

export async function deleteTourParty(
  orgSlug: string,
  tourId: string,
  partyId: string,
): Promise<{ error?: string }> {
  const { supabase } = await requireEditor(orgSlug);
  const { error } = await supabase
    .from("tour_parties")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", partyId);
  if (error) return { error: error.message };
  revalidatePath(`/o/${orgSlug}/t/${tourId}/personnel`);
  return {};
}

export async function setPersonnelParty(
  orgSlug: string,
  tourId: string,
  personnelId: string,
  partyId: string | null,
): Promise<{ error?: string }> {
  const { supabase } = await requireEditor(orgSlug);
  const { error } = await supabase
    .from("tour_personnel")
    .update({ party_id: partyId })
    .eq("id", personnelId);
  if (error) return { error: error.message };
  // Chemat fie din lista de personnel, fie din profilul persoanei — cea
  // mai simplă variantă corectă e revalidarea necondiționată a AMBELOR
  // căi (nu adăugăm un al cincilea parametru `fromProfile?`).
  revalidatePath(`/o/${orgSlug}/t/${tourId}/personnel`);
  revalidatePath(`/o/${orgSlug}/t/${tourId}/personnel/${personnelId}`);
  return {};
}
