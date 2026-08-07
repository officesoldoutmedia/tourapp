"use server";

/** C2 — CRUD pe template-urile de program (org-level). Gate identic cu
 *  restul editării de conținut (`edit_tour_content`); RLS-ul existent pe
 *  schedule_templates validează oricum org-ul. */
import { revalidatePath } from "next/cache";
import { requireOrg } from "@/lib/org";
import { can } from "@/lib/permissions";
import type { ScheduleTemplateItem } from "@/lib/scheduleGeneration";

async function requireEditor(orgSlug: string) {
  const ctx = await requireOrg(orgSlug);
  if (!can({ tier: ctx.tier, permission: ctx.permission }, "edit_tour_content")) {
    throw new Error("forbidden");
  }
  return ctx;
}

const TYPES = new Set(["schedule", "publicity"]);

function normalizeItems(items: ScheduleTemplateItem[]): ScheduleTemplateItem[] | null {
  const out: ScheduleTemplateItem[] = [];
  for (const item of items) {
    const title = item.title?.trim();
    if (!title) return null;
    const anchor = item.anchor === "show" ? "show" : undefined;
    const offset = Math.round(Number(item.offset_min));
    if (!Number.isFinite(offset)) return null;
    // ±24h (spec §4); ancora day e un ceas — [0, 1440)
    if (anchor === "show" && Math.abs(offset) > 1440) return null;
    if (!anchor && (offset < 0 || offset >= 1440)) return null;
    const duration = Math.round(Number(item.duration_min ?? 0));
    const type = item.type && TYPES.has(item.type) ? item.type : "schedule";
    out.push({
      title,
      offset_min: offset,
      ...(duration > 0 && duration <= 1440 ? { duration_min: duration } : {}),
      type,
      ...(anchor ? { anchor } : {}),
    });
  }
  return out;
}

export async function saveScheduleTemplate(
  orgSlug: string,
  input: { id?: string; name: string; items: ScheduleTemplateItem[] },
): Promise<{ error?: string }> {
  const { supabase, org } = await requireEditor(orgSlug);
  const name = input.name.trim();
  if (!name) return { error: "invalid" };
  const items = normalizeItems(input.items);
  if (!items) return { error: "invalid" };

  let error;
  if (input.id) {
    ({ error } = await supabase
      .from("schedule_templates")
      .update({ name, items })
      .eq("id", input.id)
      .eq("organization_id", org.id));
  } else {
    ({ error } = await supabase
      .from("schedule_templates")
      .insert({ organization_id: org.id, name, items }));
  }
  if (error) return { error: error.message };
  revalidatePath(`/o/${orgSlug}/settings/schedule-templates`);
  return {};
}

export async function deleteScheduleTemplate(
  orgSlug: string,
  templateId: string,
): Promise<{ error?: string }> {
  const { supabase, org } = await requireEditor(orgSlug);
  const { error } = await supabase
    .from("schedule_templates")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", templateId)
    .eq("organization_id", org.id);
  if (error) return { error: error.message };
  revalidatePath(`/o/${orgSlug}/settings/schedule-templates`);
  return {};
}
