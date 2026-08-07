"use server";

import { revalidatePath } from "next/cache";
import { requireOrg } from "@/lib/org";
import { can } from "@/lib/permissions";
import { scheduleInterval } from "@/lib/datetime";
import {
  buildScheduleRows,
  captureTemplateItems,
  findShowSlot,
  recalcScheduleUpdates,
  type CaptureItem,
  type ScheduleTemplateItem,
} from "@/lib/scheduleGeneration";

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

export async function updateDayNotes(
  orgSlug: string,
  tourId: string,
  date: string,
  field: "general_notes" | "travel_notes" | "hotel_notes",
  value: string,
): Promise<{ error?: string }> {
  const { supabase } = await requireEditor(orgSlug);
  const { error } = await supabase
    .from("days")
    .update({ [field]: value })
    .eq("tour_id", tourId)
    .eq("date", date);
  if (error) return { error: error.message };
  revalidatePath(dayPath(orgSlug, tourId, date));
  return {};
}

export async function updateDayMeta(
  orgSlug: string,
  tourId: string,
  date: string,
  patch: { day_type?: string; city?: string; country?: string; timezone?: string },
): Promise<{ error?: string }> {
  const { supabase } = await requireEditor(orgSlug);
  const { error } = await supabase
    .from("days")
    .update(patch)
    .eq("tour_id", tourId)
    .eq("date", date);
  if (error) return { error: error.message };
  revalidatePath(dayPath(orgSlug, tourId, date));
  return {};
}

export interface ScheduleItemInput {
  id?: string;
  dayId: string;
  title: string;
  details: string;
  itemType: "schedule" | "publicity";
  start: string; // 'HH:mm' sau ''
  end: string; // 'HH:mm' sau ''
  date: string;
  tz: string;
}

export async function upsertScheduleItem(
  orgSlug: string,
  tourId: string,
  input: ScheduleItemInput,
): Promise<{ error?: string }> {
  const { supabase, user } = await requireEditor(orgSlug);
  if (!input.title.trim()) return { error: "title_required" };

  let startAt: string | null = null;
  let endAt: string | null = null;
  if (input.start) {
    const interval = scheduleInterval({
      date: input.date,
      tz: input.tz,
      start: input.start,
      end: input.end || null,
    });
    startAt = interval.startAt.toISOString();
    endAt = interval.endAt?.toISOString() ?? null;
  }

  const row = {
    day_id: input.dayId,
    title: input.title.trim(),
    details: input.details || null,
    item_type: input.itemType,
    start_at: startAt,
    end_at: endAt,
    updated_by: user.id,
  };

  const { error } = input.id
    ? await supabase.from("schedule_items").update(row).eq("id", input.id)
    : await supabase.from("schedule_items").insert(row);
  if (error) return { error: error.message };
  revalidatePath(dayPath(orgSlug, tourId, input.date));
  return {};
}

export async function toggleScheduleFlag(
  orgSlug: string,
  tourId: string,
  date: string,
  itemId: string,
  field: "is_confirmed" | "is_complete",
  value: boolean,
): Promise<{ error?: string }> {
  const { supabase } = await requireEditor(orgSlug);
  const { error } = await supabase
    .from("schedule_items")
    .update({ [field]: value })
    .eq("id", itemId);
  if (error) return { error: error.message };
  revalidatePath(dayPath(orgSlug, tourId, date));
  return {};
}

/** [C-S] CONFIRMALL — confirmă tot programul zilei dintr-un click. */
export async function confirmAllSchedule(
  orgSlug: string,
  tourId: string,
  date: string,
  dayId: string,
): Promise<{ error?: string }> {
  const { supabase } = await requireEditor(orgSlug);
  const { error } = await supabase
    .from("schedule_items")
    .update({ is_confirmed: true })
    .eq("day_id", dayId)
    .is("deleted_at", null);
  if (error) return { error: error.message };
  revalidatePath(dayPath(orgSlug, tourId, date));
  return {};
}

/** [C2] Recalculează — mută itemii generați relativ la show (neconfirmați)
 *  la noul T. Confirmații și itemii manuali nu se ating. */
export async function recalcSchedule(
  orgSlug: string,
  tourId: string,
  date: string,
  dayId: string,
): Promise<{ error?: string; moved?: number }> {
  const { supabase } = await requireEditor(orgSlug);
  const { data: items } = await supabase
    .from("schedule_items")
    .select("id, title, start_at, end_at, is_confirmed, generated_anchor, generated_offset_min")
    .eq("day_id", dayId)
    .is("deleted_at", null)
    .order("start_at", { ascending: true, nullsFirst: false });

  const show = findShowSlot(items ?? []);
  if (!show?.start_at) return { error: "no_show_slot" };

  const updates = recalcScheduleUpdates(items ?? [], new Date(show.start_at));
  for (const u of updates) {
    const { error } = await supabase
      .from("schedule_items")
      .update({ start_at: u.start_at, end_at: u.end_at })
      .eq("id", u.id);
    if (error) return { error: error.message };
  }
  revalidatePath(dayPath(orgSlug, tourId, date));
  return { moved: updates.length };
}

export async function deleteScheduleItem(
  orgSlug: string,
  tourId: string,
  date: string,
  itemId: string,
): Promise<{ error?: string }> {
  const { supabase } = await requireEditor(orgSlug);
  const { error } = await supabase
    .from("schedule_items")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", itemId);
  if (error) return { error: error.message };
  revalidatePath(dayPath(orgSlug, tourId, date));
  return {};
}

/** [C] "Save As Template" — cu slot Show timpat, itemii timpați devin
 *  relativi la T (slotul Show e exclus — el e reperul); altfel oră fixă,
 *  ca înainte (spec C2 §2). */
export async function saveScheduleAsTemplate(
  orgSlug: string,
  tourId: string,
  date: string,
  dayId: string,
  name: string,
): Promise<{ error?: string }> {
  const { supabase, org } = await requireEditor(orgSlug);
  if (!name.trim()) return { error: "name_required" };

  const [{ data: day }, { data: items }] = await Promise.all([
    supabase.from("days").select("date, timezone").eq("id", dayId).single(),
    supabase
      .from("schedule_items")
      .select("id, title, item_type, start_at, end_at, sort_order")
      .eq("day_id", dayId)
      .is("deleted_at", null)
      .order("start_at", { ascending: true, nullsFirst: false }),
  ]);
  if (!day) return { error: "day_not_found" };

  const show = findShowSlot(items ?? []);
  const templateItems = captureTemplateItems(
    (items ?? []) as CaptureItem[],
    day.timezone ?? "UTC",
    show?.start_at ? { id: show.id, startAt: new Date(show.start_at) } : null,
  );

  const { error } = await supabase.from("schedule_templates").insert({
    organization_id: org.id,
    name: name.trim(),
    items: templateItems,
  });
  if (error) return { error: error.message };
  return {};
}

/** [C] Aplicarea unui template pe ziua curentă. C2: itemii cu anchor "show"
 *  se calculează din slotul Show al zilei; fără slot Show intră fără oră și
 *  se așază la primul „Recalculează". */
export async function applyScheduleTemplate(
  orgSlug: string,
  tourId: string,
  date: string,
  dayId: string,
  templateId: string,
): Promise<{ error?: string }> {
  const { supabase, user } = await requireEditor(orgSlug);

  const [{ data: day }, { data: template }, { data: existing }] = await Promise.all([
    supabase.from("days").select("date, timezone").eq("id", dayId).single(),
    supabase
      .from("schedule_templates")
      .select("items")
      .eq("id", templateId)
      .single(),
    supabase
      .from("schedule_items")
      .select("id, title, start_at")
      .eq("day_id", dayId)
      .is("deleted_at", null)
      .order("start_at", { ascending: true, nullsFirst: false }),
  ]);
  if (!day || !template) return { error: "not_found" };

  const show = findShowSlot(existing ?? []);
  const rows = buildScheduleRows({
    items: (template.items ?? []) as ScheduleTemplateItem[],
    date: day.date,
    tz: day.timezone ?? "UTC",
    showAt: show?.start_at ? new Date(show.start_at) : null,
  }).map((row) => ({ ...row, day_id: dayId, updated_by: user.id }));

  if (rows.length > 0) {
    const { error } = await supabase.from("schedule_items").insert(rows);
    if (error) return { error: error.message };
  }
  revalidatePath(dayPath(orgSlug, tourId, date));
  return {};
}
