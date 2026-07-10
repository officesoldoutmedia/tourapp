"use server";

import { revalidatePath } from "next/cache";
import { requireOrg } from "@/lib/org";

export type GearCategory = "backline" | "lights" | "video" | "other";
export type GearProvider = "own" | "venue" | "rented";

function parseDetails(formData: FormData) {
  const qty = Number(formData.get("quantity"));
  return {
    category: String(formData.get("category") ?? "other"),
    quantity: Number.isFinite(qty) && qty > 0 ? Math.round(qty) : 1,
    provider: String(formData.get("provider") ?? "own"),
  };
}

export async function addGear(
  orgSlug: string,
  tourId: string,
  formData: FormData,
): Promise<void> {
  const { supabase } = await requireOrg(orgSlug);
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return;
  await supabase.from("tour_gear").insert({
    tour_id: tourId,
    name,
    details: parseDetails(formData),
    notes: String(formData.get("notes") ?? "").trim() || null,
  });
  revalidatePath(`/o/${orgSlug}/t/${tourId}/gear`);
}

export async function updateGear(
  orgSlug: string,
  tourId: string,
  gearId: string,
  formData: FormData,
): Promise<void> {
  const { supabase } = await requireOrg(orgSlug);
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return;
  await supabase
    .from("tour_gear")
    .update({
      name,
      details: parseDetails(formData),
      notes: String(formData.get("notes") ?? "").trim() || null,
    })
    .eq("id", gearId);
  revalidatePath(`/o/${orgSlug}/t/${tourId}/gear`);
}

export async function deleteGear(
  orgSlug: string,
  tourId: string,
  gearId: string,
): Promise<void> {
  const { supabase } = await requireOrg(orgSlug);
  await supabase
    .from("tour_gear")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", gearId);
  revalidatePath(`/o/${orgSlug}/t/${tourId}/gear`);
}

export async function toggleGearShow(
  orgSlug: string,
  tourId: string,
  gearId: string,
  eventId: string,
  assigned: boolean,
): Promise<void> {
  const { supabase } = await requireOrg(orgSlug);
  if (assigned) {
    await supabase
      .from("gear_show_assignments")
      .insert({ gear_id: gearId, event_id: eventId });
  } else {
    await supabase
      .from("gear_show_assignments")
      .delete()
      .eq("gear_id", gearId)
      .eq("event_id", eventId);
  }
  revalidatePath(`/o/${orgSlug}/t/${tourId}/gear`);
}
