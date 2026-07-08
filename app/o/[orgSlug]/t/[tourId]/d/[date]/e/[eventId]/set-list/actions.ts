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

function path(orgSlug: string, tourId: string, date: string, eventId: string) {
  return `/o/${orgSlug}/t/${tourId}/d/${date}/e/${eventId}/set-list`;
}

export async function addSetItem(
  orgSlug: string,
  tourId: string,
  date: string,
  eventId: string,
  input: { songId?: string; breakLabel?: string; position: number },
): Promise<{ error?: string }> {
  const { supabase } = await requireEditor(orgSlug);
  const { error } = await supabase.from("set_list_items").insert({
    set_list_id: eventId,
    position: input.position,
    item_type: input.songId ? "song" : "break",
    song_id: input.songId ?? null,
    break_label: input.breakLabel ?? null,
  });
  if (error) return { error: error.message };
  revalidatePath(path(orgSlug, tourId, date, eventId));
  return {};
}

export async function updateSetItem(
  orgSlug: string,
  tourId: string,
  date: string,
  eventId: string,
  itemId: string,
  patch: { set_specific_notes?: string; guest_performers?: string; break_label?: string },
): Promise<{ error?: string }> {
  const { supabase } = await requireEditor(orgSlug);
  const { error } = await supabase
    .from("set_list_items")
    .update(patch)
    .eq("id", itemId);
  if (error) return { error: error.message };
  revalidatePath(path(orgSlug, tourId, date, eventId));
  return {};
}

export async function moveSetItem(
  orgSlug: string,
  tourId: string,
  date: string,
  eventId: string,
  itemId: string,
  direction: -1 | 1,
): Promise<{ error?: string }> {
  const { supabase } = await requireEditor(orgSlug);
  const { data: items } = await supabase
    .from("set_list_items")
    .select("id, position")
    .eq("set_list_id", eventId)
    .order("position");
  if (!items) return { error: "not_found" };
  const idx = items.findIndex((i) => i.id === itemId);
  const target = idx + direction;
  if (idx < 0 || target < 0 || target >= items.length) return {};
  const updates = items.map((item, i) => ({ id: item.id, position: i }));
  [updates[idx].position, updates[target].position] = [
    updates[target].position,
    updates[idx].position,
  ];
  for (const u of updates) {
    const { error } = await supabase
      .from("set_list_items")
      .update({ position: u.position })
      .eq("id", u.id);
    if (error) return { error: error.message };
  }
  revalidatePath(path(orgSlug, tourId, date, eventId));
  return {};
}

export async function removeSetItem(
  orgSlug: string,
  tourId: string,
  date: string,
  eventId: string,
  itemId: string,
): Promise<{ error?: string }> {
  const { supabase } = await requireEditor(orgSlug);
  const { error } = await supabase.from("set_list_items").delete().eq("id", itemId);
  if (error) return { error: error.message };
  revalidatePath(path(orgSlug, tourId, date, eventId));
  return {};
}
