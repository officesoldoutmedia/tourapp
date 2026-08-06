"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { buildCalendarDots, monthGrid } from "@/lib/masterCalendar";
import type { DashboardDay, UpcomingShow } from "@/lib/dashboard";

interface Artist {
  id: string;
  name: string;
  slug: string;
  color: string | null;
}

interface UpcomingRowProps {
  href: string;
  artistColor: string | null;
  title: string;
  location: string;
  dateLabel: string;
  pct: number | null;
}

/** Un rând din lista Upcoming — mutat din page.tsx (Task 5) fără schimbări
 * de randare; acum alimentat cu `visibleUpcoming` (filtrat pe artist), nu
 * cu tot `upcoming`-ul de pe server. */
function UpcomingRow({ href, artistColor, title, location, dateLabel, pct }: UpcomingRowProps) {
  return (
    <Link href={href} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0 hover:bg-subtle">
      <span className="w-16 shrink-0 font-mono text-xs text-secondary">{dateLabel}</span>
      <span
        className={`h-1.5 w-1.5 shrink-0 rounded-full ${artistColor ? "" : "border border-hairline"}`}
        style={artistColor ? { backgroundColor: artistColor } : undefined}
      />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-primary">{title}</span>
        {location && <span className="block truncate text-xs text-tertiary">{location}</span>}
      </span>
      {pct !== null && (
        <span className={`shrink-0 text-xs font-medium ${pct === 100 ? "text-success" : "text-secondary"}`}>
          {pct}%
        </span>
      )}
    </Link>
  );
}

/** Props pt. un rând Upcoming — funcție pură, fără closures peste scope-ul
 * componentei (cf. convenția din page.tsx: react-hooks/static-components). */
function toUpcomingRowProps(
  show: UpcomingShow,
  artistById: Map<string, Artist>,
  orgSlug: string,
  locale: string,
): UpcomingRowProps {
  const artist = artistById.get(show.artistId);
  return {
    href: `/o/${orgSlug}/t/${show.tourId}/d/${show.date}`,
    artistColor: artist?.color ?? null,
    title: show.eventTitle ?? show.city ?? "—",
    location: [show.city, show.country].filter(Boolean).join(", "),
    dateLabel: new Intl.DateTimeFormat(locale, { day: "numeric", month: "short" }).format(
      new Date(`${show.date}T00:00:00`),
    ),
    pct:
      show.advance && show.advance.total > 0
        ? Math.round((show.advance.done / show.advance.total) * 100)
        : null,
  };
}

/** Cheia `YYYY-MM-DD` a zilei curente — referință locală (fusul orar al
 * browser-ului), nu UTC: e componenta corectă pt. „azi” într-un client
 * component. Poate să nu coincidă cu ziua serverului la SSR (mismatch de
 * hidratare acceptat aici, cf. brief). */
function todayKeyLocal(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

export function DashboardClient(props: {
  orgSlug: string;
  locale: string;
  artists: Artist[];
  // Zilele tuturor tururilor active (toate tipurile — show/travel/day_off).
  // La mii de zile (scale mare) se trece pe fereastră server-driven filtrată
  // pe lună, în loc să livrăm tot payload-ul client-side (spec §3).
  days: DashboardDay[];
  artistOfTourEntries: [string, string][];
  upcoming: UpcomingShow[];
  labels: {
    upcoming: string;
    today: string;
    noUpcoming: string;
    filterAll: string;
    prevMonth: string;
    nextMonth: string;
  };
}) {
  const [enabled, setEnabled] = useState<Set<string>>(
    () => new Set(props.artists.map((a) => a.id)),
  );
  const [month, setMonth] = useState(() => {
    const now = new Date();
    return { year: now.getFullYear(), month0: now.getMonth() };
  });

  const artistOfTour = useMemo(
    () => new Map(props.artistOfTourEntries),
    [props.artistOfTourEntries],
  );
  const artistById = useMemo(
    () => new Map(props.artists.map((a) => [a.id, a])),
    [props.artists],
  );
  const dots = useMemo(
    () => buildCalendarDots(props.days, artistOfTour, enabled),
    [props.days, artistOfTour, enabled],
  );
  const weeks = useMemo(() => monthGrid(month.year, month.month0), [month]);
  const visibleUpcoming = props.upcoming.filter((u) => enabled.has(u.artistId));

  const monthLabel = useMemo(
    () =>
      new Intl.DateTimeFormat(props.locale, { month: "long", year: "numeric" }).format(
        new Date(Date.UTC(month.year, month.month0, 1)),
      ),
    [month, props.locale],
  );
  const weekdayLabels = useMemo(
    () =>
      Array.from({ length: 7 }, (_, i) =>
        new Intl.DateTimeFormat(props.locale, { weekday: "short", timeZone: "UTC" }).format(
          new Date(Date.UTC(2024, 0, i + 1)), // 2024-01-01 = luni
        ),
      ),
    [props.locale],
  );

  const todayKey = todayKeyLocal();

  function toggleArtist(id: string) {
    setEnabled((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function shiftMonth(delta: number) {
    setMonth((prev) => {
      let month0 = prev.month0 + delta;
      let year = prev.year;
      if (month0 < 0) {
        month0 = 11;
        year -= 1;
      } else if (month0 > 11) {
        month0 = 0;
        year += 1;
      }
      return { year, month0 };
    });
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <div className="space-y-2">
        {visibleUpcoming.length > 0 ? (
          <>
            <h2 className="text-sm font-medium text-secondary">{props.labels.upcoming}</h2>
            <div className="divide-y divide-hairline rounded-[12px] border border-hairline bg-surface px-4">
              {visibleUpcoming.map((show) => (
                <UpcomingRow
                  key={show.dayId}
                  {...toUpcomingRowProps(show, artistById, props.orgSlug, props.locale)}
                />
              ))}
            </div>
          </>
        ) : (
          <p className="text-sm text-secondary">{props.labels.noUpcoming}</p>
        )}
      </div>

      <aside className="space-y-4 lg:sticky lg:top-6 lg:self-start">
        {props.artists.length > 0 && (
          <div role="group" aria-label={props.labels.filterAll} className="flex flex-wrap gap-1.5">
            {props.artists.map((artist) => {
              const isEnabled = enabled.has(artist.id);
              return (
                <button
                  key={artist.id}
                  type="button"
                  aria-pressed={isEnabled}
                  onClick={() => toggleArtist(artist.id)}
                  className={`flex items-center gap-1.5 rounded-full border border-hairline px-2.5 py-1 text-xs font-medium text-primary transition-opacity hover:bg-subtle ${
                    isEnabled ? "" : "opacity-40"
                  }`}
                >
                  <span
                    className={`h-2 w-2 shrink-0 rounded-full ${artist.color ? "" : "border border-hairline"}`}
                    style={artist.color ? { backgroundColor: artist.color } : undefined}
                  />
                  {artist.name}
                </button>
              );
            })}
          </div>
        )}

        <div className="rounded-[12px] border border-hairline bg-surface p-4">
          <div className="mb-3 flex items-center justify-between">
            <button
              type="button"
              aria-label={props.labels.prevMonth}
              onClick={() => shiftMonth(-1)}
              className="flex h-6 w-6 items-center justify-center rounded-md text-secondary hover:bg-subtle hover:text-primary"
            >
              ‹
            </button>
            <span className="font-display text-sm font-semibold capitalize text-primary">
              {monthLabel}
            </span>
            <button
              type="button"
              aria-label={props.labels.nextMonth}
              onClick={() => shiftMonth(1)}
              className="flex h-6 w-6 items-center justify-center rounded-md text-secondary hover:bg-subtle hover:text-primary"
            >
              ›
            </button>
          </div>

          <div className="grid grid-cols-7 gap-y-1.5">
            {weekdayLabels.map((wd, i) => (
              <span
                key={i}
                className="text-center font-mono text-[10px] uppercase tracking-wide text-tertiary"
              >
                {wd}
              </span>
            ))}
            {weeks.flat().map((date, i) => {
              if (!date) return <div key={i} />;
              const dayDots = dots.get(date) ?? [];
              const isToday = date === todayKey;
              const dayNum = Number(date.slice(8));
              return (
                <div key={date} className="flex flex-col items-center gap-1 py-0.5">
                  <span
                    className={`flex h-6 w-6 items-center justify-center rounded-full font-mono text-xs ${
                      isToday ? "font-semibold text-accent ring-1 ring-accent" : "text-secondary"
                    }`}
                    title={isToday ? props.labels.today : undefined}
                  >
                    {dayNum}
                  </span>
                  <div className="flex h-2 flex-wrap items-center justify-center gap-0.5">
                    {dayDots.map((dot, di) => {
                      const artist = artistById.get(dot.artistId);
                      return (
                        <Link
                          key={di}
                          href={`/o/${props.orgSlug}/t/${dot.tourId}/d/${dot.date}`}
                          title={artist?.name ?? ""}
                          className="block h-2 w-2 rounded-full"
                          style={{
                            backgroundColor: artist?.color ?? "var(--text-disabled)",
                            opacity: dot.isShow ? 1 : 0.5,
                          }}
                        />
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </aside>
    </div>
  );
}
