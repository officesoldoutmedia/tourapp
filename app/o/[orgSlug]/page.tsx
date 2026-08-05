import Link from "next/link";
import { getTranslations, getLocale } from "next-intl/server";
import { requireOrg } from "@/lib/org";
import { can } from "@/lib/permissions";
import { MetricStrip, type Metric } from "@/components/ui/MetricStrip";

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

export default async function OrgDashboard({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;
  const { supabase, org, permission, tier } = await requireOrg(orgSlug);
  const t = await getTranslations("roster");
  const ts = await getTranslations("orgStats");
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

  // ── statistici agregate peste tururile active ──
  const activeIds = active.map((tour) => tour.id);
  const tourName = new Map(active.map((tour) => [tour.id, tour.name]));
  const [{ data: showDays }, { count: crewCount }] = activeIds.length
    ? await Promise.all([
        supabase
          .from("days")
          .select("date, city, tour_id")
          .in("tour_id", activeIds)
          .eq("day_type", "show")
          .is("deleted_at", null)
          .order("date"),
        supabase
          .from("tour_personnel")
          .select("id", { count: "exact", head: true })
          .in("tour_id", activeIds)
          .is("deleted_at", null),
      ])
    : [{ data: [] as { date: string; city: string | null; tour_id: string }[] }, { count: 0 }];

  const todayKey = new Date().toISOString().slice(0, 10);
  const upcoming = (showDays ?? []).filter((d) => d.date >= todayKey);
  const nextShow = upcoming[0];
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
      value: String(upcoming.length),
      sub: ts("showsTotalSub", { count: (showDays ?? []).length }),
    },
    {
      label: ts("nextShow"),
      value: nextShowDate,
      sub: nextShow ? [nextShow.city, tourName.get(nextShow.tour_id)].filter(Boolean).join(" · ") : undefined,
    },
    { label: ts("crew"), value: String(crewCount ?? 0), sub: ts("crewSub") },
  ];

  // ── roster de artiști ──
  const { data: artists } = await supabase
    .from("artists")
    .select("id, name, slug, color, photo_path, is_archived")
    .eq("organization_id", org.id)
    .is("deleted_at", null)
    .order("name");
  const artistRows = (artists ?? []) as ArtistRow[];

  // maparea tur→artist, ca să găsim next show-ul fiecărui artist din
  // `upcoming` (deja restrâns la tururile active, mai sus).
  const { data: tourArtists } = await supabase
    .from("tours")
    .select("id, artist_id")
    .eq("organization_id", org.id)
    .is("deleted_at", null);
  const artistOfTour = new Map((tourArtists ?? []).map((tour) => [tour.id, tour.artist_id]));
  const nextShowOfArtist = new Map<string, { date: string; city: string | null }>();
  for (const d of upcoming) {
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

  return (
    <main className="mx-auto w-full max-w-2xl space-y-8 p-6">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <div className="flex items-center gap-2">
          {can({ tier, permission }, "view_accounting") && (
            <Link href={`/o/${org.slug}/reports/annual`} className="btn-quiet h-9">
              {ts("reportsLink")}
            </Link>
          )}
          {canManage && (
            <Link href={`/o/${org.slug}/artists/new`} className="btn-primary h-9">
              {t("newArtist")}
            </Link>
          )}
        </div>
      </div>

      <MetricStrip metrics={metrics} />

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
        <section className="space-y-2">
          <h2 className="text-sm font-medium text-secondary">{t("archived")}</h2>
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
        </section>
      )}
    </main>
  );
}
