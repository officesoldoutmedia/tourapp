import Link from "next/link";
import { getTranslations, getLocale } from "next-intl/server";
import { requireOrg } from "@/lib/org";
import { can } from "@/lib/permissions";
import { MetricStrip, type Metric } from "@/components/ui/MetricStrip";
import { buildUpcoming, type DashboardDay, type UpcomingShow } from "@/lib/dashboard";
import { SHOW_SLOT_TITLE } from "@/lib/showSlot";
import { DashboardClient } from "./dashboard-client";

interface ArtistRow {
  id: string;
  name: string;
  slug: string;
  color: string | null;
  photo_path: string | null;
  is_archived: boolean;
}

/** Inițialele din nume — primele litere ale primului și ultimului cuvânt
 * (sau primele două litere dacă e un singur cuvânt). Fallback pt. poza
 * artistului când `photo_path` lipsește. */
function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** Diferența în zile calendaristice între două chei `YYYY-MM-DD`,
 * calculată la miezul nopții UTC ca să nu alunece cu schimbări de DST. */
function daysBetween(fromKey: string, toKey: string): number {
  const [fy, fm, fd] = fromKey.split("-").map(Number);
  const [ty, tm, td] = toKey.split("-").map(Number);
  const from = Date.UTC(fy, fm - 1, fd);
  const to = Date.UTC(ty, tm - 1, td);
  return Math.round((to - from) / 86_400_000);
}

function ArtistCard({
  artist,
  orgSlug,
  nextLabel,
  photoUrl,
}: {
  artist: ArtistRow;
  orgSlug: string;
  nextLabel: string;
  photoUrl: string | null;
}) {
  return (
    <Link
      href={`/o/${orgSlug}/a/${artist.slug}`}
      className="flex items-center gap-3 rounded-[12px] border border-hairline bg-surface p-4 hover:bg-subtle"
    >
      <span
        className={`h-2 w-2 shrink-0 rounded-full ${artist.color ? "" : "border border-hairline"}`}
        style={artist.color ? { backgroundColor: artist.color } : undefined}
      />
      {photoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={photoUrl} alt="" className="h-10 w-10 shrink-0 rounded-full object-cover" />
      ) : (
        <span
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full font-display text-xs font-semibold ${
            artist.color ? "text-white" : "bg-avatar text-secondary"
          }`}
          style={artist.color ? { backgroundColor: artist.color } : undefined}
        >
          {initialsOf(artist.name)}
        </span>
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">{artist.name}</p>
        <p className="truncate text-xs text-secondary">{nextLabel}</p>
      </div>
    </Link>
  );
}

interface NextEventCardProps {
  href: string;
  artistName: string;
  artistColor: string | null;
  photoUrl: string | null;
  title: string;
  location: string;
  dateLabel: string;
  relLabel: string;
  stageLabel: string | null;
  advance: { done: number; total: number } | null;
  advanceLabel: string;
}

/** Cardul mare al următorului show — primul rând din `upcoming`. Fără
 * closures peste scope-ul paginii: toate datele afișate vin ca props,
 * deja formatate/traduse de apelant (cf. `ArtistCard`, mai sus). */
function NextEventCard({
  href,
  artistName,
  artistColor,
  photoUrl,
  title,
  location,
  dateLabel,
  relLabel,
  stageLabel,
  advance,
  advanceLabel,
}: NextEventCardProps) {
  const advanceDone = advance !== null && advance.total > 0 && advance.done === advance.total;
  const advancePct = advance && advance.total > 0 ? Math.round((advance.done / advance.total) * 100) : null;

  return (
    <Link
      href={href}
      className="block space-y-4 rounded-[12px] border border-hairline bg-surface p-5 hover:bg-subtle"
    >
      <div className="flex items-center gap-3">
        <span
          className={`h-2 w-2 shrink-0 rounded-full ${artistColor ? "" : "border border-hairline"}`}
          style={artistColor ? { backgroundColor: artistColor } : undefined}
        />
        {photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={photoUrl} alt="" className="h-12 w-12 shrink-0 rounded-full object-cover" />
        ) : (
          <span
            className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full font-display text-sm font-semibold ${
              artistColor ? "text-white" : "bg-avatar text-secondary"
            }`}
            style={artistColor ? { backgroundColor: artistColor } : undefined}
          >
            {initialsOf(artistName)}
          </span>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate font-display text-lg font-semibold tracking-tight">{title}</p>
          {location && <p className="truncate text-sm text-secondary">{location}</p>}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-secondary">
        <span>
          {dateLabel} · {relLabel}
        </span>
        {stageLabel && <span>{stageLabel}</span>}
      </div>

      {advance && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className="text-secondary">{advanceLabel}</span>
            <span className={`font-medium ${advanceDone ? "text-success" : "text-secondary"}`}>
              {advance.done}/{advance.total}
            </span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-inset">
            <div
              className={`h-full rounded-full ${advanceDone ? "bg-success" : "bg-accent"}`}
              style={{ width: `${advancePct ?? 0}%` }}
            />
          </div>
        </div>
      )}
    </Link>
  );
}

export default async function OrgDashboard({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;
  const { supabase, org, permission, tier } = await requireOrg(orgSlug);
  const t = await getTranslations("roster");
  const ts = await getTranslations("orgStats");
  const td = await getTranslations("dashboard");
  const locale = await getLocale();

  const { data: tours } = await supabase
    .from("tours")
    .select("id, name, start_date, end_date, is_archived")
    .eq("organization_id", org.id)
    .is("deleted_at", null)
    .order("start_date", { ascending: false });

  const active = (tours ?? []).filter((tour) => !tour.is_archived);
  const archivedTours = (tours ?? []).filter((tour) => tour.is_archived);
  const canManage = can({ tier, permission }, "manage_tours");

  // maparea tur→artist (Task 3 SP1) — refolosită mai jos la construirea
  // `upcoming`-ului Master Dashboard-ului, deci o calculăm devreme.
  const { data: tourArtists } = await supabase
    .from("tours")
    .select("id, artist_id")
    .eq("organization_id", org.id)
    .is("deleted_at", null);
  const artistOfTour = new Map((tourArtists ?? []).map((tour) => [tour.id, tour.artist_id]));

  // ── zilele tururilor active — query lărgit (SP2 Task 5) la TOATE
  // tipurile de zi; metricile de mai jos se recalculează filtrând
  // day_type "show" în memorie, ca să nu mai facem un al doilea
  // round-trip doar pentru Master Dashboard. ──
  const activeIds = active.map((tour) => tour.id);
  const tourName = new Map(active.map((tour) => [tour.id, tour.name]));
  const [{ data: dayRows }, { count: crewCount }] = activeIds.length
    ? await Promise.all([
        supabase
          .from("days")
          .select("id, date, city, country, tour_id, day_type, timezone")
          .in("tour_id", activeIds)
          .is("deleted_at", null)
          .order("date"),
        supabase
          .from("tour_personnel")
          .select("id", { count: "exact", head: true })
          .in("tour_id", activeIds)
          .is("deleted_at", null),
      ])
    : [{ data: [] as DashboardDay[] }, { count: 0 }];
  const allDays: DashboardDay[] = dayRows ?? [];

  const todayKey = new Date().toISOString().slice(0, 10);
  // Luna inițială a MasterCalendar — derivată din `todayKey` (deja calculat
  // mai sus, o singură dată, pe server) ca SSR-ul și primul pass de
  // hidratare din DashboardClient să coincidă exact (fără `new Date()` în
  // render-ul client-ului — cf. task 6 review).
  const [todayYear, todayMonth] = todayKey.split("-").map(Number);
  const initialMonth = { year: todayYear, month0: todayMonth - 1 };
  const showDays = allDays.filter((d) => d.day_type === "show");
  const upcomingShowDays = showDays.filter((d) => d.date >= todayKey);
  const nextShow = upcomingShowDays[0];
  const nextShowDate = nextShow
    ? new Intl.DateTimeFormat(locale, { day: "numeric", month: "short" }).format(
        new Date(`${nextShow.date}T00:00:00`),
      )
    : "—";

  const metrics: Metric[] = [
    {
      label: ts("activeTours"),
      value: String(active.length),
      sub: archivedTours.length ? ts("archivedSub", { count: archivedTours.length }) : undefined,
    },
    {
      label: ts("upcomingShows"),
      value: String(upcomingShowDays.length),
      sub: ts("showsTotalSub", { count: showDays.length }),
    },
    {
      label: ts("nextShow"),
      value: nextShowDate,
      sub: nextShow ? [nextShow.city, tourName.get(nextShow.tour_id)].filter(Boolean).join(" · ") : undefined,
    },
    { label: ts("crew"), value: String(crewCount ?? 0), sub: ts("crewSub") },
  ];

  // ── Master Dashboard: următoarele max. 10 show-uri viitoare (Task 2
  // SP2 — buildUpcoming). Pre-filtrăm zilele aici ca să restrângem
  // query-urile de events/advances/schedule_items doar la ce contează. ──
  const futureShowDayIds = upcomingShowDays
    .filter((d) => artistOfTour.has(d.tour_id))
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 10)
    .map((d) => d.id);

  const [{ data: eventRows }, { data: showSlotRows }] = futureShowDayIds.length
    ? await Promise.all([
        supabase
          .from("events")
          .select("id, day_id, title")
          .in("day_id", futureShowDayIds)
          .is("deleted_at", null),
        supabase
          .from("schedule_items")
          .select("day_id, start_at")
          .in("day_id", futureShowDayIds)
          .eq("title", SHOW_SLOT_TITLE)
          .is("deleted_at", null),
      ])
    : [{ data: [] }, { data: [] }];
  const events = eventRows ?? [];
  const eventIds = events.map((e) => e.id);
  const showSlots = (showSlotRows ?? []).filter(
    (s): s is { day_id: string; start_at: string } => typeof s.start_at === "string",
  );

  const { data: advanceRows } = eventIds.length
    ? await supabase.from("advances").select("event_id, status").in("event_id", eventIds).is("deleted_at", null)
    : { data: [] };
  const advances = advanceRows ?? [];

  const upcoming: UpcomingShow[] = buildUpcoming({
    days: allDays,
    artistOfTour,
    events,
    advances,
    showSlots,
    todayKey,
    limit: 10,
  });

  // ── roster de artiști ──
  const { data: artists } = await supabase
    .from("artists")
    .select("id, name, slug, color, photo_path, is_archived")
    .eq("organization_id", org.id)
    .is("deleted_at", null)
    .order("name");
  const artistRows = (artists ?? []) as ArtistRow[];
  const artistById = new Map(artistRows.map((a) => [a.id, a]));

  const nextShowOfArtist = new Map<string, { date: string; city: string | null }>();
  for (const d of upcomingShowDays) {
    const aid = artistOfTour.get(d.tour_id);
    if (aid && !nextShowOfArtist.has(aid)) nextShowOfArtist.set(aid, d);
  }

  const photoUrls = new Map<string, string>();
  await Promise.all(
    artistRows
      .filter((a) => a.photo_path)
      .map(async (a) => {
        const { data } = await supabase.storage
          .from("attachments")
          .createSignedUrl(a.photo_path as string, 3600);
        if (data?.signedUrl) photoUrls.set(a.id, data.signedUrl);
      }),
  );

  function nextLabelFor(artist: ArtistRow): string {
    const next = nextShowOfArtist.get(artist.id);
    if (!next) return t("noShows");
    const dateLabel = new Intl.DateTimeFormat(locale, { day: "numeric", month: "short" }).format(
      new Date(`${next.date}T00:00:00`),
    );
    return `${t("nextShow")}: ${dateLabel}${next.city ? ` · ${next.city}` : ""}`;
  }

  const activeArtists = artistRows.filter((a) => !a.is_archived);
  const archivedArtists = artistRows.filter((a) => a.is_archived);

  // Artiștii pt. filtrul calendarului: oricine apare în `artistOfTour`
  // (adică are cel puțin un tur), indiferent de `is_archived` — un artist
  // arhivat cu un tur activ tot are zile în `allDays`; dacă filtrul ar
  // exclude-ul, show-urile lui ar dispărea din calendar/Upcoming fără chip
  // de reactivare (cf. task 6 review).
  const artistIdsWithTours = new Set(artistOfTour.values());
  const dashboardArtists = artistRows.filter((a) => artistIdsWithTours.has(a.id));

  // ── props pt. Next Event card / rândurile Upcoming — funcții pure,
  // NU componente (nu întorc JSX ca element numit), ca să nu declanșeze
  // react-hooks/static-components; ele doar formatează datele din
  // `upcoming` în props simple pt. componentele statice de mai sus. ──
  function toNextEventProps(show: UpcomingShow): NextEventCardProps {
    const artist = artistById.get(show.artistId);
    const dateLabel = new Intl.DateTimeFormat(locale, {
      weekday: "short",
      day: "numeric",
      month: "long",
    }).format(new Date(`${show.date}T00:00:00`));
    const diff = daysBetween(todayKey, show.date);
    return {
      href: `/o/${org.slug}/t/${show.tourId}/d/${show.date}`,
      artistName: artist?.name ?? "?",
      artistColor: artist?.color ?? null,
      photoUrl: photoUrls.get(show.artistId) ?? null,
      title: show.eventTitle ?? show.city ?? "—",
      location: [show.city, show.country].filter(Boolean).join(" · "),
      dateLabel,
      relLabel: diff === 0 ? td("today") : td("inDays", { count: diff }),
      stageLabel: show.stageTime
        ? new Intl.DateTimeFormat(locale, {
            hour: "2-digit",
            minute: "2-digit",
            timeZone: show.timezone ?? "UTC",
          }).format(new Date(show.stageTime))
        : null,
      advance: show.advance,
      advanceLabel: td("advance"),
    };
  }

  return (
    <main className="mx-auto w-full max-w-4xl space-y-8 p-6">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-2xl font-semibold tracking-tight">{td("title")}</h1>
        <div className="flex items-center gap-2">
          {can({ tier, permission }, "view_accounting") && (
            <Link href={`/o/${org.slug}/reports/annual`} className="btn-quiet h-9">
              {ts("reportsLink")}
            </Link>
          )}
          {canManage && (
            <Link href={`/o/${org.slug}/artists/new`} className="btn-quiet h-9">
              {t("newArtist")}
            </Link>
          )}
          {canManage && (
            <Link href={`/o/${org.slug}/events/new`} className="btn-primary h-9">
              {td("newShow")}
            </Link>
          )}
        </div>
      </div>

      <MetricStrip metrics={metrics} />

      {upcoming.length === 0 ? (
        <div className="space-y-3 rounded-[12px] border border-hairline bg-surface p-5">
          <p className="text-sm text-secondary">{td("noUpcoming")}</p>
          {canManage && (
            <Link href={`/o/${org.slug}/events/new`} className="btn-primary inline-flex h-9">
              {td("newShow")}
            </Link>
          )}
        </div>
      ) : (
        <>
          <section className="space-y-2">
            <h2 className="text-sm font-medium text-secondary">{td("nextEvent")}</h2>
            <NextEventCard {...toNextEventProps(upcoming[0])} />
          </section>

          <DashboardClient
            orgSlug={org.slug}
            locale={locale}
            artists={dashboardArtists.map((a) => ({ id: a.id, name: a.name, slug: a.slug, color: a.color }))}
            days={allDays}
            artistOfTourEntries={[...artistOfTour.entries()]}
            upcoming={upcoming.slice(1)}
            initialTodayKey={todayKey}
            initialMonth={initialMonth}
            labels={{
              upcoming: td("upcoming"),
              today: td("today"),
              noUpcoming: td("noUpcoming"),
              filterAll: td("filterAll"),
              prevMonth: td("prevMonth"),
              nextMonth: td("nextMonth"),
            }}
          />
        </>
      )}

      <section className="space-y-3">
        <h2 className="text-sm font-medium text-secondary">{td("rosterTitle")}</h2>

        {activeArtists.length === 0 && archivedArtists.length === 0 ? (
          <div className="space-y-3">
            <p className="text-sm text-secondary">{t("empty")}</p>
            {canManage && (
              <Link href={`/o/${org.slug}/artists/new`} className="btn-primary inline-flex h-9">
                {t("newArtist")}
              </Link>
            )}
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {activeArtists.map((artist) => (
              <ArtistCard
                key={artist.id}
                artist={artist}
                orgSlug={org.slug}
                nextLabel={nextLabelFor(artist)}
                photoUrl={photoUrls.get(artist.id) ?? null}
              />
            ))}
          </div>
        )}

        {archivedArtists.length > 0 && (
          <div className="space-y-2">
            <h3 className="text-sm font-medium text-secondary">{t("archived")}</h3>
            <div className="grid gap-3 opacity-60 sm:grid-cols-2">
              {archivedArtists.map((artist) => (
                <ArtistCard
                  key={artist.id}
                  artist={artist}
                  orgSlug={org.slug}
                  nextLabel={nextLabelFor(artist)}
                  photoUrl={photoUrls.get(artist.id) ?? null}
                />
              ))}
            </div>
          </div>
        )}
      </section>
    </main>
  );
}
