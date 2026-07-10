import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations, getLocale } from "next-intl/server";
import { MapPin, ExternalLink } from "lucide-react";
import { requireOrg } from "@/lib/org";
import { tourRouteStats } from "@/lib/geo";

/** Tour Dashboard [MT parity]: ruta turului + events/distance remaining. */
export default async function TourDashboardPage({
  params,
}: {
  params: Promise<{ orgSlug: string; tourId: string }>;
}) {
  const { orgSlug, tourId } = await params;
  const { supabase } = await requireOrg(orgSlug);
  const t = await getTranslations("tourDashboard");
  const locale = await getLocale();

  const [{ data: tour }, { data: days }] = await Promise.all([
    supabase.from("tours").select("id, name").eq("id", tourId).is("deleted_at", null).maybeSingle(),
    supabase
      .from("days")
      .select("date, city, country, day_type, lat, lng, events(id, title, venues(name))")
      .eq("tour_id", tourId)
      .is("deleted_at", null)
      .order("date"),
  ]);
  if (!tour) notFound();

  const todayKey = new Date().toISOString().slice(0, 10);
  type DayRow = {
    date: string;
    city: string | null;
    country: string | null;
    day_type: string;
    lat: number | null;
    lng: number | null;
    events: { id: string; title: string | null; venues: { name: string } | null }[];
  };
  const rows = (days ?? []) as unknown as DayRow[];

  // opriri = zile cu coordonate; ruta = opriri consecutive DISTINCTE
  const stops = rows
    .filter((d) => d.lat != null && d.lng != null)
    .filter((d, i, arr) => i === 0 || d.lat !== arr[i - 1].lat || d.lng !== arr[i - 1].lng);
  const stats = tourRouteStats(
    stops.map((s) => ({ date: s.date, lat: s.lat!, lng: s.lng! })),
    todayKey,
  );

  const allEvents = rows.flatMap((d) =>
    d.events.map((e) => ({ ...e, date: d.date, city: d.city })),
  );
  const remainingEvents = allEvents.filter((e) => e.date >= todayKey);
  const nextStop = stops.find((s) => s.date >= todayKey) ?? stops.at(-1);

  // link de rută completă în Google Maps (origin → waypoints → destination)
  const routePlaces = stops.map((s) => `${s.lat},${s.lng}`);
  const routeUrl =
    routePlaces.length >= 2
      ? `https://www.google.com/maps/dir/?api=1&origin=${routePlaces[0]}&destination=${routePlaces.at(-1)}${
          routePlaces.length > 2
            ? `&waypoints=${routePlaces.slice(1, -1).slice(0, 9).join("|")}`
            : ""
        }`
      : null;

  const upcoming = rows.filter((d) => d.date >= todayKey && d.events.length > 0).slice(0, 6);
  const fmtDay = (date: string) =>
    new Intl.DateTimeFormat(locale, { day: "2-digit", month: "short", timeZone: "UTC" }).format(
      new Date(`${date}T00:00:00Z`),
    );

  return (
    <main className="mx-auto w-full max-w-4xl space-y-6 p-6">
      <h1 className="font-display text-xl font-semibold tracking-tight">
        {t("title")} <span className="font-normal text-tertiary">· {tour.name}</span>
      </h1>

      {/* harta pe următoarea oprire + link rută completă */}
      {nextStop && (
        <div className="overflow-hidden rounded-[12px] border border-hairline bg-surface">
          <iframe
            title="Tour route"
            src={`https://maps.google.com/maps?q=${nextStop.lat},${nextStop.lng}&z=8&output=embed`}
            className="h-56 w-full border-0"
            loading="lazy"
          />
          <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2">
            <span className="flex items-center gap-1.5 text-sm">
              <MapPin size={15} strokeWidth={1.5} className="text-accent" />
              {t("nextStop")}: <b>{nextStop.city ?? nextStop.date}</b>
              <span className="font-mono text-xs text-tertiary">{fmtDay(nextStop.date)}</span>
            </span>
            {routeUrl && (
              <a
                href={routeUrl}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1 text-sm text-accent hover:underline"
              >
                {t("fullRoute")} <ExternalLink size={13} strokeWidth={1.5} />
              </a>
            )}
          </div>
        </div>
      )}

      {/* statisticile mari — MT: EVENTS REMAINING / DISTANCE REMAINING */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-lg border border-hairline bg-surface p-5 text-center">
          <p className="text-xs font-semibold uppercase tracking-wider text-tertiary">
            {t("eventsRemaining")}
          </p>
          <p className="font-mono text-5xl font-medium">{remainingEvents.length}</p>
          <p className="mt-1 text-xs text-secondary">
            {t("outOfTotal", { total: allEvents.length })}
          </p>
        </div>
        <div className="rounded-lg border border-hairline bg-surface p-5 text-center">
          <p className="text-xs font-semibold uppercase tracking-wider text-tertiary">
            {t("distanceRemaining")}
          </p>
          <p className="font-mono text-5xl font-medium">
            {stats.remainingKm}
            <span className="text-2xl text-tertiary"> km</span>
          </p>
          <p className="mt-1 text-xs text-secondary">
            {t("traveledSoFar", { km: stats.traveledKm, total: stats.totalKm })}
          </p>
        </div>
      </div>

      {/* următoarele show-uri */}
      {upcoming.length > 0 && (
        <section className="rounded-[12px] border border-hairline bg-surface">
          <h2 className="border-b border-hairline px-4 py-2 font-display text-lg font-semibold tracking-tight">
            {t("upcoming")}
          </h2>
          <ul className="divide-y divide-hairline">
            {upcoming.map((day) => (
              <li key={day.date}>
                <Link
                  href={`/o/${orgSlug}/t/${tourId}/d/${day.date}`}
                  className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-subtle"
                >
                  <span className="w-16 shrink-0 font-mono text-xs text-secondary">
                    {fmtDay(day.date)}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">
                    {day.events
                      .map((e) => e.title ?? e.venues?.name)
                      .filter(Boolean)
                      .join(" · ") || "—"}
                  </span>
                  <span className="shrink-0 text-xs text-secondary">{day.city}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
