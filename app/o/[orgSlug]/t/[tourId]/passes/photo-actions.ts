"use server";

import { revalidatePath } from "next/cache";
import { requireOrg } from "@/lib/org";

export async function setPassImage(
  orgSlug: string,
  tourId: string,
  passId: string,
  path: string | null,
): Promise<void> {
  const { supabase } = await requireOrg(orgSlug);
  await supabase.from("tour_passes").update({ image_path: path }).eq("id", passId);
  revalidatePath(`/o/${orgSlug}/t/${tourId}/passes`);
}
