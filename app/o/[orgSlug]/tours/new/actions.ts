"use server";

import { redirect } from "next/navigation";
import { requireOrg } from "@/lib/org";
import { can } from "@/lib/permissions";
import { dayInstant } from "@/lib/datetime";
import { DEFAULT_TZ } from "@/lib/tzLookup";

export interface WizardDay {
  date: string; // YYYY-MM-DD
  day_type: string;
  city: string;
  country: string;
  timezone: string;
}

interface TemplateItem {
  title: string;
  offset_min: number;
  duration_min?: number;
  type?: "schedule" | "publicity";
}

function clockFromOffset(offsetMin: number): { day: number; time: string } {
  const day = Math.floor(offsetMin / 1440);
  const rest = offsetMin - day * 1440;
  const h = String(Math.floor(rest / 60)).padStart(2, "0");
  const m = String(rest % 60).padStart(2, "0");
  return { day, time: `${h}:${m}` };
}

export async function createTour(
  orgSlug: string,
  payload: {
    name: string;
    startDate: string;
    endDate: string;
    days: WizardDay[];
    templateId: string | null;
  },
): Promise<{ error?: string }> {
  const { supabase, org, permission, tier, user } = await requireOrg(orgSlug);
  if (!can({ tier, permission }, "manage_tours")) return { error: "forbidden" };
  if (!payload.name.trim() || payload.days.length === 0)
    return { error: "invalid" };

  const { data: tour, error: tourError } = await supabase
    .from("tours")
    .insert({
      organization_id: org.id,
      name: payload.name.trim(),
      start_date: payload.startDate,
      end_date: payload.endDate,
      created_by: user.id,
    })
    .select("id")
    .single();
  if (tourError || !tour) return { error: tourError?.message ?? "failed" };

  const { data: days, error: daysError } = await supabase
    .from("days")
    .insert(
      payload.days.map((d) => ({
        tour_id: tour.id,
        date: d.date,
        day_type: d.day_type,
        city: d.city || null,
        country: d.country || null,
        timezone: d.timezone || DEFAULT_TZ,
      })),
    )
    .select("id, date, timezone");
  if (daysError) return { error: daysError.message };

  // Aplicare schedule template pe fiecare zi [C §6.3.2]
  if (payload.templateId) {
    const { data: template } = await supabase
      .from("schedule_templates")
      .select("items")
      .eq("id", payload.templateId)
      .single();

    const items = (template?.items ?? []) as TemplateItem[];
    if (items.length > 0 && days) {
      const rows = days.flatMap((day) =>
        items.map((item, idx) => {
          const start = clockFromOffset(item.offset_min);
          const startAt = dayInstant(
            addDaysISO(day.date, start.day),
            start.time,
            day.timezone ?? DEFAULT_TZ,
          );
          let endAt: Date | null = null;
          if (item.duration_min) {
            const end = clockFromOffset(item.offset_min + item.duration_min);
            endAt = dayInstant(
              addDaysISO(day.date, end.day),
              end.time,
              day.timezone ?? DEFAULT_TZ,
            );
          }
          return {
            day_id: day.id,
            title: item.title,
            item_type: item.type ?? "schedule",
            start_at: startAt.toISOString(),
            end_at: endAt?.toISOString() ?? null,
            sort_order: idx,
            updated_by: user.id,
          };
        }),
      );
      const { error } = await supabase.from("schedule_items").insert(rows);
      if (error) return { error: error.message };
    }
  }

  redirect(`/o/${orgSlug}/t/${tour.id}`);
}

function addDaysISO(date: string, days: number): string {
  if (days === 0) return date;
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
