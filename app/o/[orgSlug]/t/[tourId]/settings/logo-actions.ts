"use server";

import { revalidatePath } from "next/cache";
import { requireOrg } from "@/lib/org";

export async function setTourLogo(
  orgSlug: string,
  tourId: string,
  path: string | null,
): Promise<void> {
  const { supabase } = await requireOrg(orgSlug);
  await supabase.from("tours").update({ logo_path: path }).eq("id", tourId);
  revalidatePath(`/o/${orgSlug}/t/${tourId}/settings`);
}
