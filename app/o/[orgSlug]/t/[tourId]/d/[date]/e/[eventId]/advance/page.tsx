import Link from "next/link";
import { notFound } from "next/navigation";
import { requireOrg } from "@/lib/org";
import { can } from "@/lib/permissions";
import { formatTimeInZone } from "@/lib/datetime";
import type { AdvanceLayoutItem, AdvanceStatus } from "@/lib/advance";
import type { FieldDef } from "../event-client";
import { PageHeader } from "@/components/ui/PageHeader";
import { AdvanceEditor, type ScheduleRowData } from "./advance-client";

export default async function AdvancePage({
  params,
}: {
  params: Promise<{ orgSlug: string; tourId: string; date: string; eventId: string }>;
}) {
  const { orgSlug, tourId, date, eventId } = await params;
  const { supabase, org, permission, tier } = await requireOrg(orgSlug);

  const { data: event } = await supabase
    .from("events")
    .select("id, title, day_id, venues(name), days!inner(timezone)")
    .eq("id", eventId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!event) notFound();
  const tz =
    (event.days as unknown as { timezone: string | null })?.timezone ?? "UTC";

  const [
    { data: advances },
    { data: templates },
    { data: defs },
    { data: values },
  ] = await Promise.all([
    supabase
      .from("advances")
      .select("id, title, status, layout")
      .eq("event_id", eventId)
      .is("deleted_at", null)
      .order("sort_order")
      .order("created_at"),
    supabase
      .from("advance_templates")
      .select("id, title")
      .eq("organization_id", org.id)
      .is("deleted_at", null)
      .order("title"),
    supabase
      .from("field_definitions")
      .select("key, section, subgroup, field_type, custom_label, organization_id")
      .is("deleted_at", null)
      .order("sort_order"),
    supabase
      .from("event_field_values")
      .select("field_key, value")
      .eq("event_id", eventId),
  ]);

  // schedule items referite din layouts (rândurile SCHEDULE [C-S])
  const scheduleIds = (advances ?? []).flatMap((a) =>
    ((a.layout ?? []) as AdvanceLayoutItem[])
      .filter((i) => i.type === "schedule_row")
      .map((i) => (i as { schedule_item_id: string }).schedule_item_id),
  );
  const scheduleRows: Record<string, ScheduleRowData> = {};
  if (scheduleIds.length > 0) {
    const { data: items } = await supabase
      .from("schedule_items")
      .select("id, title, start_at, end_at, is_confirmed")
      .in("id", scheduleIds)
      .is("deleted_at", null);
    for (const item of items ?? []) {
      scheduleRows[item.id] = {
        id: item.id,
        title: item.title,
        start: item.start_at ? formatTimeInZone(new Date(item.start_at), tz) : "",
        end: item.end_at ? formatTimeInZone(new Date(item.end_at), tz) : "",
        is_confirmed: item.is_confirmed,
      };
    }
  }

  const canEdit = can({ tier, permission }, "edit_tour_content");
  const relevantDefs = (defs ?? []).filter(
    (d) => d.organization_id === null || d.organization_id === org.id,
  ) as (FieldDef & { organization_id: string | null })[];

  // metrici (prototip): completion = advance-uri done, waiting = in_progress
  const list = advances ?? [];
  const doneCount = list.filter((a) => a.status === "done").length;
  const waitingCount = list.filter((a) => a.status === "in_progress").length;
  const completion = list.length ? Math.round((doneCount / list.length) * 100) : 0;

  return (
    <main className="w-full pb-11">
      <PageHeader
        eyebrow={
          <Link
            href={`/o/${orgSlug}/t/${tourId}/d/${date}/e/${eventId}`}
            className="hover:text-primary"
          >
            {event.title ?? (event.venues as unknown as { name: string } | null)?.name} · {date}
          </Link>
        }
        title="Advance"
      />
      <div className="max-w-[880px] space-y-6 px-8 pt-6">
        {list.length > 0 && (
          <div
            className="grid grid-cols-[1.2fr_1fr_1fr] rounded-[12px] border border-hairline"
            style={{ background: "rgba(255,255,255,.02)" }}
          >
            <div className="px-[18px] py-3.5">
              <p className="eyebrow">COMPLETION</p>
              <p className="mt-1.5 font-display text-[18px] font-semibold text-primary">
                {completion}%
              </p>
              <div className="mt-2 h-[3px] max-w-[150px] overflow-hidden rounded-[2px] bg-track">
                <i
                  className="block h-full bg-accent"
                  style={{ width: `${completion}%`, animation: "barIn .7s ease-out" }}
                />
              </div>
            </div>
            <div className="border-l border-hairline px-[18px] py-3.5">
              <p className="eyebrow">DONE</p>
              <p className="mt-1.5 font-display text-[18px] font-semibold text-primary">
                {doneCount} of {list.length}
              </p>
            </div>
            <div className="border-l border-hairline px-[18px] py-3.5">
              <p className="eyebrow">IN PROGRESS</p>
              <p
                className={`mt-1.5 font-display text-[18px] font-semibold ${waitingCount ? "text-warning" : "text-primary"}`}
              >
                {waitingCount}
              </p>
            </div>
          </div>
        )}

        <AdvanceEditor
        orgSlug={orgSlug}
        tourId={tourId}
        date={date}
        eventId={eventId}
        advances={(advances ?? []).map((a) => ({
          id: a.id,
          title: a.title,
          status: a.status as AdvanceStatus,
          layout: (a.layout ?? []) as AdvanceLayoutItem[],
        }))}
        templates={templates ?? []}
        defs={relevantDefs}
        values={Object.fromEntries(
          (values ?? []).map((v) => [v.field_key, v.value ?? ""]),
        )}
        scheduleRows={scheduleRows}
        canEdit={canEdit}
      />
      </div>
    </main>
  );
}
