import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { requireOrg } from "@/lib/org";
import { can, hasMinPermission } from "@/lib/permissions";
import { aggregateAdvanceStatus, type AdvanceStatus } from "@/lib/advance";
import { EventSections, type FieldDef } from "./event-client";
import { VenueSection } from "./venue-client";

export default async function EventPage({
  params,
}: {
  params: Promise<{ orgSlug: string; tourId: string; date: string; eventId: string }>;
}) {
  const { orgSlug, tourId, date, eventId } = await params;
  const { supabase, org, permission, tier } = await requireOrg(orgSlug);
  const t = await getTranslations("events");
  const ta = await getTranslations("advance");

  const { data: event } = await supabase
    .from("events")
    .select(
      "id, title, status, notes, venues(id, name, address_line1, city, country, capacity, phones, urls, organization_id, copied_from, source)",
    )
    .eq("id", eventId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!event) notFound();

  const [
    { data: defs },
    { data: values },
    { data: hidden },
    { data: localCrew },
    { data: laborCalls },
    { data: advances },
  ] = await Promise.all([
    supabase
      .from("field_definitions")
      .select("key, section, subgroup, field_type, custom_label, organization_id")
      .is("deleted_at", null)
      .order("sort_order"),
    supabase
      .from("event_field_values")
      .select("field_key, value")
      .eq("event_id", eventId),
    supabase
      .from("org_hidden_fields")
      .select("field_key")
      .eq("organization_id", org.id),
    supabase
      .from("event_local_crew_details")
      .select("local_union, minimum_in, minimum_out, penalties, crew_comments")
      .eq("event_id", eventId)
      .maybeSingle(),
    supabase
      .from("event_labor_calls")
      .select("id, call_time, day_offset, call_count, worker_type, add_count, cut_count, notes")
      .eq("event_id", eventId)
      .is("deleted_at", null)
      .order("sort_order"),
    supabase
      .from("advances")
      .select("id, title, status")
      .eq("event_id", eventId)
      .is("deleted_at", null)
      .order("sort_order"),
  ]);

  const venue = event.venues as unknown as {
    id: string;
    name: string;
    address_line1: string | null;
    city: string | null;
    country: string | null;
    capacity: number | null;
    organization_id: string | null;
    copied_from: string | null;
    source: string;
  } | null;

  const canEdit = can({ tier, permission }, "edit_tour_content");
  const canManageHidden = hasMinPermission(permission, "manager");
  const relevantDefs = (defs ?? []).filter(
    (d) => d.organization_id === null || d.organization_id === org.id,
  ) as (FieldDef & { organization_id: string | null })[];

  const aggStatus = aggregateAdvanceStatus(
    (advances ?? []).map((a) => a.status as AdvanceStatus),
  );
  const statusIcon =
    aggStatus === "done" ? "✅" : aggStatus === "in_progress" ? "🔵" : "";

  return (
    <main className="mx-auto w-full max-w-3xl space-y-6 p-6">
      <header className="space-y-1">
        <Link
          href={`/o/${orgSlug}/t/${tourId}/d/${date}`}
          className="text-xs text-neutral-500 hover:underline"
        >
          ← {date}
        </Link>
        <h1 className="text-xl font-semibold">{event.title ?? venue?.name ?? "—"}</h1>
      </header>

      {venue && (
        <VenueSection
          orgSlug={orgSlug}
          eventId={eventId}
          venue={venue}
          canEdit={canEdit}
        />
      )}

      <section className="flex items-center justify-between rounded-lg border border-neutral-200 px-4 py-3">
        <span className="text-sm font-medium">
          {statusIcon} {t("advances")}{" "}
          <span className="text-xs text-neutral-500">
            ({(advances ?? []).length})
          </span>
        </span>
        <span className="flex gap-2">
          {can({ tier, permission }, "view_accounting") && (
            <Link
              href={`/o/${orgSlug}/t/${tourId}/d/${date}/e/${eventId}/accounting`}
              className="rounded border border-neutral-300 px-3 py-1 text-xs font-medium"
            >
              Accounting →
            </Link>
          )}
          <Link
            href={`/o/${orgSlug}/t/${tourId}/d/${date}/e/${eventId}/set-list`}
            className="rounded border border-neutral-300 px-3 py-1 text-xs font-medium"
          >
            Set List →
          </Link>
          <Link
            href={`/o/${orgSlug}/t/${tourId}/d/${date}/e/${eventId}/guest-list`}
            className="rounded border border-neutral-300 px-3 py-1 text-xs font-medium"
          >
            Guest List →
          </Link>
          <Link
            href={`/o/${orgSlug}/t/${tourId}/d/${date}/e/${eventId}/advance`}
            className="rounded bg-neutral-900 px-3 py-1 text-xs font-medium text-white"
          >
            {ta("title")} →
          </Link>
        </span>
      </section>

      <EventSections
        orgSlug={orgSlug}
        data={{
          eventId,
          values: Object.fromEntries((values ?? []).map((v) => [v.field_key, v.value ?? ""])),
          hidden: (hidden ?? []).map((h) => h.field_key),
          localCrew: (localCrew ?? {}) as Record<string, string>,
          laborCalls: (laborCalls ?? []).map((lc) => ({
            ...lc,
            call_count: lc.call_count ?? "",
            worker_type: lc.worker_type ?? "",
            add_count: lc.add_count ?? "",
            cut_count: lc.cut_count ?? "",
            notes: lc.notes ?? "",
          })),
        }}
        defs={relevantDefs}
        canEdit={canEdit}
        canManageHidden={canManageHidden}
      />
    </main>
  );
}
