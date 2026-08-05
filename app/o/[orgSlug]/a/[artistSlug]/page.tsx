import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations, getLocale } from "next-intl/server";
import { requireOrg } from "@/lib/org";
import { can } from "@/lib/permissions";
import { buildArtistTimeline, type TimelineDay } from "@/lib/artistTimeline";

/** Punctul zilei în timeline — aceeași paletă ca în t/[tourId]/calendar/page.tsx. */
const DOT: Record<string, string> = {
  show: "var(--accent)",
  travel: "var(--warning)",
  day_off: "var(--text-disabled)",
};

/** Tabul Date al paginii de artist: timeline peste zilele din toate tururile lui. */
export default async function ArtistDatesPage({
  params,
}: {
  params: Promise<{ orgSlug: string; artistSlug: string }>;
}) {
  const { orgSlug, artistSlug } = await params;
  const { supabase, org, permission, tier } = await requireOrg(orgSlug);
  const t = await getTranslations("artist");
  const td = await getTranslations("dayTypes");
  const locale = await getLocale();

  const { data: artist } = await supabase
    .from("artists")
    .select("id, name, slug, color, photo_path, is_archived")
    .eq("organization_id", org.id)
    .eq("slug", artistSlug)
    .is("deleted_at", null)
    .maybeSingle();
  if (!artist) notFound();

  const { data: tours } = await supabase
    .from("tours")
    .select("id, name, is_archived")
    .eq("artist_id", artist.id)
    .is("deleted_at", null)
    .order("name");
  const tourRows = tours ?? [];
  const tourIds = tourRows.map((tour) => tour.id);
  const tourNameOf = new Map(tourRows.map((tour) => [tour.id, tour.name]));

  const { data: days } = tourIds.length
    ? await supabase
        .from("days")
        .select("id, date, day_type, city, country, tour_id")
        .in("tour_id", tourIds)
        .is("deleted_at", null)
    : { data: [] };
  const dayRows = days ?? [];
  const dayIds = dayRows.map((day) => day.id);

  const { data: events } = dayIds.length
    ? await supabase
        .from("events")
        .select("id, day_id")
        .in("day_id", dayIds)
        .is("deleted_at", null)
    : { data: [] };
  const eventRows = events ?? [];
  const eventIds = eventRows.map((event) => event.id);
  const dayOfEvent = new Map(eventRows.map((event) => [event.id, event.day_id]));

  const { data: advanceRows } = eventIds.length
    ? await supabase
        .from("advances")
        .select("event_id, status")
        .in("event_id", eventIds)
        .is("deleted_at", null)
    : { data: [] };
  const advances = (advanceRows ?? []).map((advance) => ({
    event_id: advance.event_id,
    day_id: dayOfEvent.get(advance.event_id) ?? "",
    status: advance.status,
  }));

  const timeline = buildArtistTimeline(dayRows, advances);
  const todayKey = new Date().toISOString().slice(0, 10);
  const upcoming = timeline.filter((day) => day.date >= todayKey);
  const past = timeline.filter((day) => day.date < todayKey);

  const canManage = can({ tier, permission }, "manage_tours");

  function TimelineRow({ day }: { day: TimelineDay }) {
    const dateLabel = new Intl.DateTimeFormat(locale, {
      day: "numeric",
      month: "short",
      year: "numeric",
    }).format(new Date(`${day.date}T00:00:00`));
    const location = [day.city, day.country].filter(Boolean).join(", ");
    const advanceDone = day.advance !== null && day.advance.done === day.advance.total && day.advance.total > 0;

    return (
      <Link
        href={`/o/${orgSlug}/t/${day.tour_id}/d/${day.date}`}
        className="flex items-center gap-3 rounded-[10px] border border-hairline px-4 py-3 hover:bg-subtle"
      >
        <span
          className="h-1.5 w-1.5 shrink-0 rounded-full"
          style={{ background: DOT[day.day_type] ?? "var(--text-disabled)" }}
        />
        <span className="w-24 shrink-0 font-mono text-xs text-secondary">{dateLabel}</span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-primary">
            {location || td(day.day_type)}
          </span>
          <span className="block truncate text-xs text-tertiary">{tourNameOf.get(day.tour_id)}</span>
        </span>
        {day.advance !== null && (
          <span
            className={`shrink-0 text-xs font-medium ${advanceDone ? "text-success" : "text-secondary"}`}
          >
            {t("advance")}: {day.advance.done}/{day.advance.total}
          </span>
        )}
      </Link>
    );
  }

  return (
    <div className="space-y-8">
      <section className="space-y-6">
        {timeline.length === 0 ? (
          <p className="text-sm text-secondary">{t("noDays")}</p>
        ) : (
          <>
            {upcoming.length > 0 && (
              <div className="space-y-3">
                <h2 className="text-sm font-medium text-secondary">{t("upcoming")}</h2>
                <div className="space-y-2">
                  {upcoming.map((day) => (
                    <TimelineRow key={day.id} day={day} />
                  ))}
                </div>
              </div>
            )}

            {past.length > 0 && (
              <div className="space-y-3">
                <h2 className="text-sm font-medium text-secondary">{t("past")}</h2>
                <div className="space-y-2 opacity-70">
                  {past.map((day) => (
                    <TimelineRow key={day.id} day={day} />
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium text-secondary">{t("tours")}</h2>
          {canManage && (
            <Link href={`/o/${orgSlug}/tours/new?artist=${artist.id}`} className="btn-quiet h-8 text-xs">
              {t("newTour")}
            </Link>
          )}
        </div>
        {tourRows.length === 0 ? (
          <p className="text-sm text-secondary">{t("noTours")}</p>
        ) : (
          <ul className="space-y-1.5">
            {tourRows.map((tour) => (
              <li key={tour.id}>
                <Link
                  href={`/o/${orgSlug}/t/${tour.id}`}
                  className={`text-sm hover:underline ${tour.is_archived ? "text-secondary" : "text-accent"}`}
                >
                  {tour.name}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
