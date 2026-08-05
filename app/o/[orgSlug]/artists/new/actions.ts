"use server";

import { redirect } from "next/navigation";
import { requireOrg } from "@/lib/org";
import { can } from "@/lib/permissions";
import { slugify, uniqueSlug } from "@/lib/slug";
import { ARTIST_COLORS } from "./colors";

export async function createArtist(
  orgSlug: string,
  formData: FormData,
): Promise<{ error?: string }> {
  const { supabase, org, permission, tier, user } = await requireOrg(orgSlug);
  if (!can({ tier, permission }, "manage_tours")) return { error: "forbidden" };

  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { error: "invalid" };

  const { data: existing } = await supabase
    .from("artists")
    .select("slug, color")
    .eq("organization_id", org.id);
  const taken = new Set((existing ?? []).map((a) => a.slug));
  const slug = uniqueSlug(slugify(name) || "artist", taken);
  const used = new Set((existing ?? []).map((a) => a.color));
  const color =
    ARTIST_COLORS.find((c) => !used.has(c)) ??
    ARTIST_COLORS[(existing ?? []).length % ARTIST_COLORS.length];

  const { error } = await supabase.from("artists").insert({
    organization_id: org.id,
    name,
    slug,
    color,
    created_by: user.id,
  });
  if (error) return { error: error.message };
  redirect(`/o/${orgSlug}/a/${slug}`);
}
