"use server";

import { revalidatePath } from "next/cache";
import { requireOrg } from "@/lib/org";
import { can } from "@/lib/permissions";

/** Mută turul la alt artist (Tour Settings › Artist). */
export async function updateTourArtist(
  orgSlug: string,
  tourId: string,
  artistId: string,
): Promise<{ error?: string }> {
  const { supabase, permission, tier } = await requireOrg(orgSlug);
  if (!can({ tier, permission }, "manage_tours")) return { error: "forbidden" };
  if (!artistId) return { error: "invalid" };
  const { error } = await supabase
    .from("tours")
    .update({ artist_id: artistId })
    .eq("id", tourId);
  if (error) return { error: error.message };
  revalidatePath(`/o/${orgSlug}/t/${tourId}/settings`);
  return {};
}
