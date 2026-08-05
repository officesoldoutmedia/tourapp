"use server";

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

export async function addArtistVisibilityRule(
  orgSlug: string,
  artistSlug: string,
  artistId: string,
  target: { type: "user" | "group"; id: string },
): Promise<{ error?: string }> {
  const { supabase, org, user } = await requireManage(orgSlug);
  const { error } = await supabase.from("visibility_rules").insert({
    organization_id: org.id,
    subject_type: "artist",
    subject_id: artistId,
    target_type: target.type,
    target_id: target.id,
    created_by: user.id,
  });
  if (error) return { error: error.message };
  revalidatePath(`/o/${orgSlug}/a/${artistSlug}/access`);
  return {};
}

export async function removeArtistVisibilityRule(
  orgSlug: string,
  artistSlug: string,
  ruleId: string,
): Promise<{ error?: string }> {
  const { supabase } = await requireManage(orgSlug);
  const { error } = await supabase
    .from("visibility_rules")
    .delete()
    .eq("id", ruleId);
  if (error) return { error: error.message };
  revalidatePath(`/o/${orgSlug}/a/${artistSlug}/access`);
  return {};
}

export async function addArtistAttachment(
  orgSlug: string,
  artistSlug: string,
  artistId: string,
  meta: { fileName: string; storagePath: string; mimeType: string; sizeBytes: number },
): Promise<{ error?: string }> {
  const { supabase, org, user } = await requireManage(orgSlug);
  const { error } = await supabase.from("attachments").insert({
    organization_id: org.id,
    parent_type: "artist",
    parent_id: artistId,
    file_name: meta.fileName,
    storage_path: meta.storagePath,
    mime_type: meta.mimeType,
    size_bytes: meta.sizeBytes,
    uploaded_by: user.id,
  });
  if (error) return { error: error.message };
  revalidatePath(`/o/${orgSlug}/a/${artistSlug}/access`);
  return {};
}

export async function deleteArtistAttachment(
  orgSlug: string,
  artistSlug: string,
  attachmentId: string,
): Promise<{ error?: string }> {
  const { supabase } = await requireManage(orgSlug);
  const { error } = await supabase
    .from("attachments")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", attachmentId);
  if (error) return { error: error.message };
  revalidatePath(`/o/${orgSlug}/a/${artistSlug}/access`);
  return {};
}
