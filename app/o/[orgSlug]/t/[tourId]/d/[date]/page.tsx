import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { requireOrg } from "@/lib/org";
import { can } from "@/lib/permissions";
import { formatDayHeader, isDstTransitionDay } from "@/lib/datetime";
import { DEFAULT_TZ } from "@/lib/tzLookup";
import {
  NotesSection,
  ScheduleSection,
  type DayData,
  type ScheduleItemData,
} from "./day-client";

export default async function DayPage({
  params,
}: {
  params: Promise<{ orgSlug: string; tourId: string; date: string }>;
}) {
  const { orgSlug, tourId, date } = await params;
  const { supabase, org, permission, tier } = await requireOrg(orgSlug);
  const locale = await getLocale();
  const td = await getTranslations("dayTypes");
  const t = await getTranslations("day");

  const { data: day } = await supabase
    .from("days")
    .select(
      "id, date, day_type, city, state, country, timezone, general_notes, travel_notes, hotel_notes",
    )
    .eq("tour_id", tourId)
    .eq("date", date)
    .is("deleted_at", null)
    .maybeSingle();

  if (!day) notFound();
  const tz = day.timezone ?? DEFAULT_TZ;

  const [{ data: items }, { data: templates }] = await Promise.all([
    supabase
      .from("schedule_items")
      .select(
        "id, title, details, item_type, start_at, end_at, is_confirmed, is_complete, time_priority, sort_order",
      )
      .eq("day_id", day.id)
      .is("deleted_at", null)
      .order("start_at", { ascending: true, nullsFirst: false })
      .order("time_priority")
      .order("sort_order"),
    supabase
      .from("schedule_templates")
      .select("id, name")
      .eq("organization_id", org.id)
      .is("deleted_at", null)
      .order("name"),
  ]);

  const canEdit = can({ tier, permission }, "edit_tour_content");
  const location = [day.city, day.state, day.country].filter(Boolean).join(", ");

  return (
    <main className="mx-auto w-full max-w-3xl space-y-8 p-6">
      <header className="space-y-1">
        <div className="flex items-baseline justify-between gap-4">
          <h1 className="text-xl font-semibold">{location || "—"}</h1>
          <span className="rounded-full bg-neutral-100 px-3 py-1 text-xs font-semibold">
            {td(day.day_type)}
          </span>
        </div>
        <p className="text-sm text-neutral-500">
          {formatDayHeader(day.date, tz, locale)}
        </p>
        {isDstTransitionDay(day.date, tz) && (
          <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs text-amber-900">
            {t("dstNotice")}
          </p>
        )}
      </header>

      <NotesSection
        orgSlug={orgSlug}
        tourId={tourId}
        day={day as DayData}
        canEdit={canEdit}
      />

      <ScheduleSection
        orgSlug={orgSlug}
        tourId={tourId}
        day={day as DayData}
        items={(items ?? []) as ScheduleItemData[]}
        templates={templates ?? []}
        canEdit={canEdit}
      />
    </main>
  );
}
