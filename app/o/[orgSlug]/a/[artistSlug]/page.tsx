import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations, getLocale } from "next-intl/server";
import { requireOrg } from "@/lib/org";
import { can } from "@/lib/permissions";
import { buildArtistTimeline, type TimelineDay } from "@/lib/artistTimeline";
import { computeProgressOfDays } from "@/lib/advanceProgressData";
import { parseDealSnapshot, requiredCategoriesForDay } from "@/lib/dealSnapshot";

// Rând brut de attachment pt. calculul bulk al procentului de advancing
// (SP3b Task 6) — subset minim cerut de `computeProgressOfDays`.
interface DayFileRow {
  id: string;
  parent_id: string;
  category_id: string | null;
  storage_path: string | null;
  status: string | null;
  supersedes_id: string | null;
  created_at: string;
}

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
        .select("id, day_id, deal_snapshot")
        .in("day_id", dayIds)
        .is("deleted_at", null)
    : { data: [] };
  const eventRows = events ?? [];
  const eventIds = eventRows.map((event) => event.id);
  const dayOfEvent = new Map(eventRows.map((event) => [event.id, event.day_id]));

  const todayKey = new Date().toISOString().slice(0, 10);
  // Zilele viitoare DE TIP SHOW — DOAR pentru ele se calculează procentul
  // de advancing bulk (SP3b Task 6; regula (a) din review fix #2: pe zile
  // non-show, categoriile obligatorii nu trebuie să „curgă" în total).
  // Trecutul rămâne pe agregatul vechi din statusuri (ieftin și suficient,
  // decizie de spec).
  const futureShowDayIds = dayRows
    .filter((day) => day.date >= todayKey && day.day_type === "show")
    .map((day) => day.id);
  const futureShowDayIdSet = new Set(futureShowDayIds);
  const futureEventIds = eventRows
    .filter((event) => futureShowDayIdSet.has(event.day_id))
    .map((event) => event.id);

  const [
    { data: advanceRows },
    { data: fieldValueRows },
    { data: fileCategories },
    { data: dayAttachmentRows },
  ] = await Promise.all([
    eventIds.length
      ? supabase
          .from("advances")
          .select("event_id, status, layout")
          .in("event_id", eventIds)
          .is("deleted_at", null)
      : Promise.resolve({ data: [] as { event_id: string; status: string; layout: unknown }[] }),
    futureEventIds.length
      ? supabase
          .from("event_field_values")
          .select("event_id, field_key, value")
          .in("event_id", futureEventIds)
      : Promise.resolve({ data: [] as { event_id: string; field_key: string; value: string | null }[] }),
    futureShowDayIds.length
      ? supabase
          .from("file_categories")
          .select("id, is_required")
          .eq("organization_id", org.id)
          .is("deleted_at", null)
      : Promise.resolve({ data: [] as { id: string; is_required: boolean | null }[] }),
    futureShowDayIds.length
      ? supabase
          .from("attachments")
          .select("id, parent_id, category_id, storage_path, status, supersedes_id, created_at")
          .eq("parent_type", "day")
          .in("parent_id", futureShowDayIds)
          .is("deleted_at", null)
          .not("storage_path", "is", null)
          .neq("status", "superseded")
      : Promise.resolve({ data: [] as DayFileRow[] }),
  ]);
  const advances = (advanceRows ?? []).map((advance) => ({
    event_id: advance.event_id,
    day_id: dayOfEvent.get(advance.event_id) ?? "",
    status: advance.status,
  }));

  const requiredCategoryIds = (fileCategories ?? [])
    .filter((c) => c.is_required)
    .map((c) => c.id);

  // C1 T7: categoriile obligatorii per-deal, per zi — o zi cu mai multe
  // event-uri unește required_category_ids din TOATE snapshot-urile lor
  // (vezi lib/dealSnapshot.ts, requiredCategoriesForDay). Zilele fără
  // niciun snapshot cu obligatorii rămân pe fallback-ul org, identic.
  const liveCategoryIds = new Set((fileCategories ?? []).map((c) => c.id));
  const dealSnapshotsByDay = new Map<string, ReturnType<typeof parseDealSnapshot>[]>();
  for (const e of eventRows) {
    if (!futureShowDayIdSet.has(e.day_id)) continue;
    const list = dealSnapshotsByDay.get(e.day_id) ?? [];
    list.push(parseDealSnapshot((e as unknown as { deal_snapshot?: unknown }).deal_snapshot));
    dealSnapshotsByDay.set(e.day_id, list);
  }
  const dealRequiredByDay = new Map<string, string[]>();
  for (const dayId of futureShowDayIds) {
    const dealRequired = requiredCategoriesForDay(
      dealSnapshotsByDay.get(dayId) ?? [],
      liveCategoryIds,
    );
    if (dealRequired !== null) dealRequiredByDay.set(dayId, dealRequired);
  }

  // Regulile UNICE de calcul (helper comun cu pagina de zi și dashboard-ul)
  // — vezi lib/advanceProgressData.ts. `futureShowDayIds` sunt deja doar
  // zile show (filtrate mai sus), deci regula (a) e mereu activă aici.
  const progressOfDayRaw = computeProgressOfDays({
    days: futureShowDayIds.map((id) => ({ id, day_type: "show" })),
    dayOfEvent,
    advanceRows: advanceRows ?? [],
    fieldValueRows: fieldValueRows ?? [],
    fileRows: dayAttachmentRows ?? [],
    requiredCategoryIds,
    dealRequiredByDay,
  });
  // Zilele fără obligatorii ȘI fără advance-uri (progress.total === 0)
  // rămân neincluse — comportamentul vechi (advance: null) persistă.
  const progressOfDay = new Map<string, { done: number; total: number }>();
  for (const [dayId, progress] of progressOfDayRaw) {
    if (progress.total > 0) progressOfDay.set(dayId, { done: progress.done, total: progress.total });
  }

  const timeline = buildArtistTimeline(dayRows, advances, progressOfDay);
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
            <div className="flex items-center gap-2">
              <Link href={`/o/${orgSlug}/events/new?artist=${artist.id}`} className="btn-primary h-8 text-xs">
                {t("newShow")}
              </Link>
              <Link href={`/o/${orgSlug}/tours/new?artist=${artist.id}`} className="btn-quiet h-8 text-xs">
                {t("newTour")}
              </Link>
            </div>
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
