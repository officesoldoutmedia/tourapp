"use server";

import { revalidatePath } from "next/cache";
import { requireOrg } from "@/lib/org";
import { can } from "@/lib/permissions";
import { scheduleInterval } from "@/lib/datetime";

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

/** [C] "Save As Template" — orele devin offseturi relative la zi. */
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
      .select("title, item_type, start_at, end_at, sort_order")
      .eq("day_id", dayId)
      .is("deleted_at", null)
      .order("start_at", { ascending: true, nullsFirst: false }),
  ]);
  if (!day) return { error: "day_not_found" };

  const dayStart = new Date(`${day.date}T00:00:00Z`).getTime();
  void dayStart;
  const templateItems = (items ?? []).map((item) => {
    let offsetMin = 0;
    let durationMin: number | undefined;
    if (item.start_at) {
      // offsetul = ora locală a itemului în fusul zilei
      const local = new Intl.DateTimeFormat("en-GB", {
        timeZone: day.timezone ?? "UTC",
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
      }).format(new Date(item.start_at));
      const [h, m] = local.split(":").map(Number);
      offsetMin = h * 60 + m;
      if (item.end_at) {
        durationMin = Math.round(
          (new Date(item.end_at).getTime() -
            new Date(item.start_at).getTime()) /
            60000,
        );
      }
    }
    return {
      title: item.title,
      offset_min: offsetMin,
      duration_min: durationMin,
      type: item.item_type,
    };
  });

  const { error } = await supabase.from("schedule_templates").insert({
    organization_id: org.id,
    name: name.trim(),
    items: templateItems,
  });
  if (error) return { error: error.message };
  return {};
}

/** [C] Aplicarea unui template pe ziua curentă. */
export async function applyScheduleTemplate(
  orgSlug: string,
  tourId: string,
  date: string,
  dayId: string,
  templateId: string,
): Promise<{ error?: string }> {
  const { supabase, user } = await requireEditor(orgSlug);

  const [{ data: day }, { data: template }] = await Promise.all([
    supabase.from("days").select("date, timezone").eq("id", dayId).single(),
    supabase
      .from("schedule_templates")
      .select("items")
      .eq("id", templateId)
      .single(),
  ]);
  if (!day || !template) return { error: "not_found" };

  const items = (template.items ?? []) as {
    title: string;
    offset_min: number;
    duration_min?: number;
    type?: "schedule" | "publicity";
  }[];

  const rows = items.map((item, idx) => {
    const h = String(Math.floor((item.offset_min % 1440) / 60)).padStart(2, "0");
    const m = String(item.offset_min % 60).padStart(2, "0");
    const end = item.duration_min
      ? minutesToClock(item.offset_min + item.duration_min)
      : null;
    const interval = scheduleInterval({
      date: day.date,
      tz: day.timezone ?? "UTC",
      start: `${h}:${m}`,
      end,
    });
    return {
      day_id: dayId,
      title: item.title,
      item_type: item.type ?? "schedule",
      start_at: interval.startAt.toISOString(),
      end_at: interval.endAt?.toISOString() ?? null,
      sort_order: idx,
      updated_by: user.id,
    };
  });

  if (rows.length > 0) {
    const { error } = await supabase.from("schedule_items").insert(rows);
    if (error) return { error: error.message };
  }
  revalidatePath(dayPath(orgSlug, tourId, date));
  return {};
}

function minutesToClock(total: number): string {
  const rest = total % 1440;
  const h = String(Math.floor(rest / 60)).padStart(2, "0");
  const m = String(rest % 60).padStart(2, "0");
  return `${h}:${m}`;
}
