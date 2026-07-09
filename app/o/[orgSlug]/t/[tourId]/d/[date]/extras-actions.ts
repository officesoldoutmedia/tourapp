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

function dayPath(orgSlug: string, tourId: string, date: string) {
  return `/o/${orgSlug}/t/${tourId}/d/${date}`;
}

// ── Tasks [C §6.11] ─────────────────────────────────────────────────
export async function upsertTask(
  orgSlug: string,
  tourId: string,
  date: string,
  input: { id?: string; dayId: string | null; title: string; dueAt: string | null },
): Promise<{ error?: string }> {
  const { supabase, user } = await requireEditor(orgSlug);
  if (!input.title.trim()) return { error: "title_required" };
  const row = {
    tour_id: tourId,
    day_id: input.dayId,
    title: input.title.trim(),
    due_at: input.dueAt,
  };
  const { error } = input.id
    ? await supabase.from("tasks").update(row).eq("id", input.id)
    : await supabase.from("tasks").insert({ ...row, created_by: user.id });
  if (error) return { error: error.message };
  revalidatePath(dayPath(orgSlug, tourId, date));
  return {};
}

export async function toggleTaskComplete(
  orgSlug: string,
  tourId: string,
  date: string,
  taskId: string,
  value: boolean,
): Promise<{ error?: string }> {
  const { supabase } = await requireEditor(orgSlug);
  const { error } = await supabase
    .from("tasks")
    .update({ is_complete: value })
    .eq("id", taskId);
  if (error) return { error: error.message };
  revalidatePath(dayPath(orgSlug, tourId, date));
  return {};
}

export async function deleteTask(
  orgSlug: string,
  tourId: string,
  date: string,
  taskId: string,
): Promise<{ error?: string }> {
  const { supabase } = await requireEditor(orgSlug);
  const { error } = await supabase
    .from("tasks")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", taskId);
  if (error) return { error: error.message };
  revalidatePath(dayPath(orgSlug, tourId, date));
  return {};
}

// ── Attachments [C §6.13] ───────────────────────────────────────────
// Upload-ul fișierului se face din browser direct în Storage (politicile
// din 00010); aici doar înregistrăm metadatele.
export async function recordAttachment(
  orgSlug: string,
  tourId: string,
  date: string,
  input: {
    parentType: "tour" | "day";
    parentId: string;
    fileName: string;
    storagePath: string;
    mimeType: string;
    sizeBytes: number;
    tags: string[];
  },
): Promise<{ error?: string }> {
  const { supabase, org, user } = await requireEditor(orgSlug);
  const { error } = await supabase.from("attachments").insert({
    organization_id: org.id,
    parent_type: input.parentType,
    parent_id: input.parentId,
    file_name: input.fileName,
    storage_path: input.storagePath,
    mime_type: input.mimeType,
    size_bytes: input.sizeBytes,
    tags: input.tags,
    uploaded_by: user.id,
  });
  if (error) return { error: error.message };
  revalidatePath(
    input.parentType === "tour"
      ? `/o/${orgSlug}/t/${tourId}/attachments`
      : dayPath(orgSlug, tourId, date),
  );
  return {};
}

export async function getAttachmentUrl(
  orgSlug: string,
  attachmentId: string,
): Promise<{ url?: string; error?: string }> {
  const { supabase } = await requireOrg(orgSlug);
  // RLS: dacă userul nu are voie să vadă attachment-ul, nu-l găsește
  const { data: attachment } = await supabase
    .from("attachments")
    .select("storage_path")
    .eq("id", attachmentId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!attachment) return { error: "not_found" };
  const { data, error } = await supabase.storage
    .from("attachments")
    .createSignedUrl(attachment.storage_path, 300);
  if (error || !data) return { error: error?.message ?? "sign_failed" };
  return { url: data.signedUrl };
}

export async function deleteAttachment(
  orgSlug: string,
  tourId: string,
  date: string,
  attachmentId: string,
): Promise<{ error?: string }> {
  const { supabase } = await requireEditor(orgSlug);
  const { error } = await supabase
    .from("attachments")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", attachmentId);
  if (error) return { error: error.message };
  revalidatePath(dayPath(orgSlug, tourId, date));
  return {};
}

// ── Share link [N §6.17.4] ──────────────────────────────────────────
export async function createShareLink(
  orgSlug: string,
  dayId: string,
  expiresDays: number | null,
): Promise<{ url?: string; error?: string }> {
  const { supabase, user } = await requireEditor(orgSlug);
  const { data, error } = await supabase
    .from("share_links")
    .insert({
      day_id: dayId,
      created_by: user.id,
      expires_at: expiresDays
        ? new Date(Date.now() + expiresDays * 86400000).toISOString()
        : null,
    })
    .select("token")
    .single();
  if (error || !data) return { error: error?.message ?? "failed" };
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  return { url: `${base}/share/day/${data.token}` };
}
