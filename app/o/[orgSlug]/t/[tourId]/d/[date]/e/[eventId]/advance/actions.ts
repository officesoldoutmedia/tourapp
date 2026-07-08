"use server";

import { revalidatePath } from "next/cache";
import { requireOrg } from "@/lib/org";
import { can } from "@/lib/permissions";
import { isValidLayout, type AdvanceLayoutItem } from "@/lib/advance";
import { scheduleInterval } from "@/lib/datetime";

async function requireEditor(orgSlug: string) {
  const ctx = await requireOrg(orgSlug);
  if (!can({ tier: ctx.tier, permission: ctx.permission }, "edit_tour_content")) {
    throw new Error("forbidden");
  }
  return ctx;
}

function advancePath(orgSlug: string, tourId: string, date: string, eventId: string) {
  return `/o/${orgSlug}/t/${tourId}/d/${date}/e/${eventId}/advance`;
}

export async function createAdvance(
  orgSlug: string,
  tourId: string,
  date: string,
  eventId: string,
  title: string,
  templateId?: string,
): Promise<{ error?: string }> {
  const { supabase } = await requireEditor(orgSlug);

  let layout: AdvanceLayoutItem[] = [];
  if (templateId) {
    const { data: template } = await supabase
      .from("advance_templates")
      .select("layout")
      .eq("id", templateId)
      .single();
    if (template && isValidLayout(template.layout)) layout = template.layout;
  }

  const { error } = await supabase.from("advances").insert({
    event_id: eventId,
    title: title.trim() || "Advance",
    layout,
  });
  if (error) return { error: error.message };
  revalidatePath(advancePath(orgSlug, tourId, date, eventId));
  return {};
}

export async function updateAdvanceStatus(
  orgSlug: string,
  tourId: string,
  date: string,
  eventId: string,
  advanceId: string,
  status: "not_started" | "in_progress" | "done",
): Promise<{ error?: string }> {
  const { supabase } = await requireEditor(orgSlug);
  const { error } = await supabase
    .from("advances")
    .update({ status })
    .eq("id", advanceId);
  if (error) return { error: error.message };
  revalidatePath(advancePath(orgSlug, tourId, date, eventId));
  return {};
}

export async function updateAdvanceLayout(
  orgSlug: string,
  tourId: string,
  date: string,
  eventId: string,
  advanceId: string,
  layout: unknown,
): Promise<{ error?: string }> {
  const { supabase } = await requireEditor(orgSlug);
  if (!isValidLayout(layout)) return { error: "invalid_layout" };
  const { error } = await supabase
    .from("advances")
    .update({ layout })
    .eq("id", advanceId);
  if (error) return { error: error.message };
  revalidatePath(advancePath(orgSlug, tourId, date, eventId));
  return {};
}

export async function deleteAdvance(
  orgSlug: string,
  tourId: string,
  date: string,
  eventId: string,
  advanceId: string,
): Promise<{ error?: string }> {
  const { supabase } = await requireEditor(orgSlug);
  const { error } = await supabase
    .from("advances")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", advanceId);
  if (error) return { error: error.message };
  revalidatePath(advancePath(orgSlug, tourId, date, eventId));
  return {};
}

/** Save As Template [C] */
export async function saveAdvanceAsTemplate(
  orgSlug: string,
  advanceId: string,
  title: string,
): Promise<{ error?: string }> {
  const { supabase, org } = await requireEditor(orgSlug);
  const { data: advance } = await supabase
    .from("advances")
    .select("layout")
    .eq("id", advanceId)
    .single();
  if (!advance) return { error: "not_found" };

  // schedule_row-urile din layout devin generice la template (fără id)
  const layout = ((advance.layout ?? []) as AdvanceLayoutItem[]).filter(
    (item) => item.type !== "schedule_row",
  );

  const { error } = await supabase.from("advance_templates").insert({
    organization_id: org.id,
    title: title.trim() || "Template",
    layout,
  });
  if (error) return { error: error.message };
  return {};
}

/**
 * [C-S v1.1] Rând de tip SCHEDULE în advance: completarea lui creează /
 * actualizează un schedule item REAL pe ziua event-ului.
 */
export async function upsertAdvanceScheduleRow(
  orgSlug: string,
  tourId: string,
  date: string,
  eventId: string,
  advanceId: string,
  input: {
    scheduleItemId?: string;
    title: string;
    start: string; // HH:mm
    end: string;
    confirmed: boolean;
  },
): Promise<{ error?: string; scheduleItemId?: string }> {
  const { supabase, user } = await requireEditor(orgSlug);

  const { data: event } = await supabase
    .from("events")
    .select("day_id, days!inner(date, timezone)")
    .eq("id", eventId)
    .single();
  if (!event) return { error: "event_not_found" };
  const day = event.days as unknown as { date: string; timezone: string | null };

  let startAt: string | null = null;
  let endAt: string | null = null;
  if (input.start) {
    const interval = scheduleInterval({
      date: day.date,
      tz: day.timezone ?? "UTC",
      start: input.start,
      end: input.end || null,
    });
    startAt = interval.startAt.toISOString();
    endAt = interval.endAt?.toISOString() ?? null;
  }

  const row = {
    day_id: event.day_id,
    title: input.title.trim(),
    start_at: startAt,
    end_at: endAt,
    is_confirmed: input.confirmed,
    updated_by: user.id,
  };

  let scheduleItemId = input.scheduleItemId;
  if (scheduleItemId) {
    const { error } = await supabase
      .from("schedule_items")
      .update(row)
      .eq("id", scheduleItemId);
    if (error) return { error: error.message };
  } else {
    const { data, error } = await supabase
      .from("schedule_items")
      .insert(row)
      .select("id")
      .single();
    if (error || !data) return { error: error?.message ?? "failed" };
    const newId: string = data.id;
    scheduleItemId = newId;

    // leagă rândul nou în layout-ul advance-ului
    const { data: advance } = await supabase
      .from("advances")
      .select("layout")
      .eq("id", advanceId)
      .single();
    if (advance) {
      const layout = (advance.layout ?? []) as AdvanceLayoutItem[];
      layout.push({ type: "schedule_row", schedule_item_id: newId });
      await supabase.from("advances").update({ layout }).eq("id", advanceId);
    }
  }

  revalidatePath(advancePath(orgSlug, tourId, date, eventId));
  revalidatePath(`/o/${orgSlug}/t/${tourId}/d/${date}`);
  return { scheduleItemId };
}
