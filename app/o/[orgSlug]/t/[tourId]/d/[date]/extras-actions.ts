"use server";

import { revalidatePath } from "next/cache";
import { requireOrg } from "@/lib/org";
import { can } from "@/lib/permissions";
import { sendEmail } from "@/lib/email";

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
    categoryId?: string | null;
    dueDate?: string | null;
    supersedesId?: string | null;
    placeholderId?: string | null;
  },
): Promise<{ error?: string }> {
  const { supabase, org, user } = await requireEditor(orgSlug);

  // Placeholder-ul ("fișier așteptat") deja există ca rând — încărcarea
  // lui completează rândul in-place, nu creează unul nou (rămâne v1).
  const { error } = input.placeholderId
    ? await supabase
        .from("attachments")
        .update({
          file_name: input.fileName,
          storage_path: input.storagePath,
          mime_type: input.mimeType,
          size_bytes: input.sizeBytes,
          uploaded_by: user.id,
        })
        .eq("id", input.placeholderId)
    : await supabase.from("attachments").insert({
        organization_id: org.id,
        parent_type: input.parentType,
        parent_id: input.parentId,
        file_name: input.fileName,
        storage_path: input.storagePath,
        mime_type: input.mimeType,
        size_bytes: input.sizeBytes,
        tags: input.tags,
        uploaded_by: user.id,
        category_id: input.categoryId ?? null,
        due_date: input.dueDate ?? null,
        supersedes_id: input.supersedesId ?? null,
      });

  if (input.supersedesId && !error) {
    await supabase
      .from("attachments")
      .update({ status: "superseded" })
      .eq("id", input.supersedesId);
  }

  if (error) return { error: error.message };
  revalidatePath(
    input.parentType === "tour"
      ? `/o/${orgSlug}/t/${tourId}/attachments`
      : dayPath(orgSlug, tourId, date),
  );
  return {};
}

// Placeholder ("fișier așteptat") — rând fără storage_path, populat mai
// târziu de recordAttachment(placeholderId) când fișierul chiar sosește.
export async function createExpectedFile(
  orgSlug: string,
  tourId: string,
  date: string,
  input: { dayId: string; categoryId: string; dueDate: string | null; fileName?: string },
): Promise<{ error?: string }> {
  const { supabase, org, user } = await requireEditor(orgSlug);
  let fileName = input.fileName?.trim();
  if (!fileName) {
    const { data: category } = await supabase
      .from("file_categories")
      .select("name")
      .eq("id", input.categoryId)
      .maybeSingle();
    fileName = category?.name ?? "";
  }
  const { error } = await supabase.from("attachments").insert({
    organization_id: org.id,
    parent_type: "day",
    parent_id: input.dayId,
    file_name: fileName,
    storage_path: null,
    category_id: input.categoryId,
    due_date: input.dueDate,
    tags: [],
    uploaded_by: user.id,
  });
  if (error) return { error: error.message };
  revalidatePath(dayPath(orgSlug, tourId, date));
  return {};
}

export async function updateAttachmentMeta(
  orgSlug: string,
  tourId: string,
  date: string,
  attachmentId: string,
  patch: { status?: "draft" | "approved" | "final"; categoryId?: string | null; dueDate?: string | null },
): Promise<{ error?: string }> {
  const { supabase } = await requireEditor(orgSlug);
  const update: Record<string, unknown> = {};
  if (patch.status !== undefined) update.status = patch.status;
  if (patch.categoryId !== undefined) update.category_id = patch.categoryId;
  if (patch.dueDate !== undefined) update.due_date = patch.dueDate;
  if (Object.keys(update).length === 0) return {};
  const { error } = await supabase
    .from("attachments")
    .update(update)
    .eq("id", attachmentId);
  if (error) return { error: error.message };
  revalidatePath(dayPath(orgSlug, tourId, date));
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
  const { data: attachment } = await supabase
    .from("attachments")
    .select("supersedes_id")
    .eq("id", attachmentId)
    .maybeSingle();
  const { error } = await supabase
    .from("attachments")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", attachmentId);
  if (error) return { error: error.message };
  // Reclaim: dacă head-ul șters avea un predecesor, acela redevine capul
  // lanțului — resetăm statusul lui la 'draft' DOAR dacă e încă 'superseded'
  // (nu atingem alte statusuri) [review fix #3].
  if (attachment?.supersedes_id) {
    await supabase
      .from("attachments")
      .update({ status: "draft" })
      .eq("id", attachment.supersedes_id)
      .eq("status", "superseded");
  }
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

// ── Vendor share [C4 §11] ───────────────────────────────────────────
export async function createVendorLink(
  orgSlug: string,
  tourId: string,
  date: string,
  eventId: string,
  companyId: string,
): Promise<{ url?: string; emailWarning?: boolean; error?: string }> {
  const { supabase, org, user } = await requireEditor(orgSlug);
  const { data: company } = await supabase
    .from("companies")
    .select("id, name, email")
    .eq("id", companyId)
    .eq("organization_id", org.id)
    .is("deleted_at", null)
    .maybeSingle();
  if (!company) return { error: "not_found" };

  // Ownership (plan defect, fix C4-T4): eventId vine de la client ca simplă
  // referință, nevalidată — un user membru în MAI MULTE org-uri ar putea,
  // printr-un request manual, să trimită eventId-ul unui show din ALT org
  // în timp ce operează sub orgSlug-ul ăsta. Fără verificarea lanțului
  // event → day → tour → organization_id (pattern-ul din apply-deal.ts),
  // link-ul creat ar purta organization_id-ul org-ului curent dar
  // resolveVendorLink() (portalul public) ar rezolva programul/hotelul
  // org-ului STRĂIN — o scurgere cross-tenant prin link-ul public de
  // vendor. companyId e deja org-verificat mai sus; eventId trebuie
  // verificat separat, înainte de orice scriere.
  const { data: event } = await supabase
    .from("events")
    .select("id, days!inner(tours!inner(organization_id))")
    .eq("id", eventId)
    .is("deleted_at", null)
    .maybeSingle();
  const eventOrgId = (
    event?.days as unknown as { tours: { organization_id: string } | null } | undefined
  )?.tours?.organization_id;
  if (eventOrgId !== org.id) return { error: "not_found" };

  // un singur link viu per (companie, show): revocă-l pe cel existent
  await supabase
    .from("vendor_links")
    .update({ revoked_at: new Date().toISOString() })
    .eq("company_id", companyId)
    .eq("event_id", eventId)
    .is("revoked_at", null);

  const { data, error } = await supabase
    .from("vendor_links")
    .insert({
      organization_id: org.id,
      company_id: companyId,
      event_id: eventId,
      created_by: user.id,
    })
    .select("token, expires_at")
    .single();
  if (error || !data) return { error: error?.message ?? "failed" };

  const base = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const url = `${base}/share/vendor/${data.token}`;

  let emailWarning = false;
  if (company.email) {
    const sent = await sendEmail({
      to: company.email,
      subject: `${org.name} — acces vendor / vendor access`,
      html: vendorEmailHtml(org.name, url, data.expires_at),
    });
    if (sent.error) emailWarning = true;
  } else {
    emailWarning = true; // fără email pe companie — doar link copiabil
  }
  revalidatePath(dayPath(orgSlug, tourId, date));
  return { url, emailWarning };
}

function vendorEmailHtml(orgName: string, url: string, expiresAt: string): string {
  const until = String(expiresAt).slice(0, 10);
  return [
    `<p>${orgName} v-a invitat în portalul de vendor al unui show.</p>`,
    `<p>${orgName} invited you to a show's vendor portal.</p>`,
    `<p><a href="${url}">${url}</a></p>`,
    `<p>Link valabil până la / valid until: ${until}</p>`,
  ].join("\n");
}

export async function revokeVendorLink(
  orgSlug: string,
  tourId: string,
  date: string,
  linkId: string,
): Promise<{ error?: string }> {
  const { supabase, org } = await requireEditor(orgSlug);
  // Ownership: linkId e filtrat direct pe organization_id (câmp propriu pe
  // vendor_links, nu prin lanț) — un linkId dintr-un alt org nu potrivește
  // nicio linie, update-ul e no-op. Deja sigur, spre deosebire de eventId
  // în createVendorLink (vezi comentariul de-acolo).
  const { error } = await supabase
    .from("vendor_links")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", linkId)
    .eq("organization_id", org.id);
  if (error) return { error: error.message };
  revalidatePath(dayPath(orgSlug, tourId, date));
  return {};
}

export async function resendVendorEmail(
  orgSlug: string,
  tourId: string,
  date: string,
  linkId: string,
): Promise<{ error?: string }> {
  const { supabase, org } = await requireEditor(orgSlug);
  // Ownership: la fel ca revokeVendorLink — linkId e filtrat direct pe
  // organization_id (câmp propriu pe vendor_links), deci un linkId străin
  // nu se potrivește și cade pe ramura not_found de mai jos. Sigur.
  const { data: link } = await supabase
    .from("vendor_links")
    .select("token, expires_at, revoked_at, companies!inner(email)")
    .eq("id", linkId)
    .eq("organization_id", org.id)
    .maybeSingle();
  const email = (link?.companies as unknown as { email: string | null } | null)?.email;
  if (!link || link.revoked_at) return { error: "not_found" };
  if (!email) return { error: "no_email" };
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const sent = await sendEmail({
    to: email,
    subject: `${org.name} — acces vendor / vendor access`,
    html: vendorEmailHtml(org.name, `${base}/share/vendor/${link.token}`, link.expires_at),
  });
  return sent.error ? { error: sent.error } : {};
}
