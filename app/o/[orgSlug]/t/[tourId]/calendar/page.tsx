import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations, getLocale } from "next-intl/server";
import { requireOrg } from "@/lib/org";

/** Calendarul turului — grilă lunară cu Show Days și event-uri [MT parity]. */
export default async function TourCalendarPage({
  params,
}: {
  params: Promise<{ orgSlug: string; tourId: string }>;
}) {
  const { orgSlug, tourId } = await params;
  const { supabase } = await requireOrg(orgSlug);
  const t = await getTranslations("tourCalendar");
  const td = await getTranslations("dayTypes");
  const locale = await getLocale();

  const [{ data: tour }, { data: days }] = await Promise.all([
    supabase.from("tours").select("id, name").eq("id", tourId).is("deleted_at", null).maybeSingle(),
    supabase
      .from("days")
      .select("date, city, day_type, events(id, title, venues(name))")
      .eq("tour_id", tourId)
      .is("deleted_at", null)
      .order("date"),
  ]);
  if (!tour || !days || days.length === 0) notFound();

  type DayRow = {
    date: string;
    city: string | null;
    day_type: string;
    events: { id: string; title: string | null; venues: { name: string } | null }[];
  };
  const byDate = new Map((days as unknown as DayRow[]).map((d) => [d.date, d]));
  const todayKey = new Date().toISOString().slice(0, 10);

  // lunile acoperite de tur
  const first = days[0].date;
  const last = days[days.length - 1].date;
  const months: string[] = [];
  for (
    let cursor = new Date(`${first.slice(0, 7)}-01T00:00:00Z`);
    cursor.toISOString().slice(0, 7) <= last.slice(0, 7);
    cursor.setUTCMonth(cursor.getUTCMonth() + 1)
  ) {
    months.push(cursor.toISOString().slice(0, 7));
  }

  const weekdays = Array.from({ length: 7 }, (_, i) =>
    new Intl.DateTimeFormat(locale, { weekday: "short", timeZone: "UTC" }).format(
      new Date(Date.UTC(2024, 0, i + 1)), // 2024-01-01 = luni
    ),
  );

  const DOT: Record<string, string> = {
    show: "var(--accent)",
    travel: "var(--warning)",
    day_off: "var(--text-disabled)",
  };

  return (
    <main className="w-full px-8 pb-11">
      <header className="border-b border-hairline pb-5 pt-[26px]">
        <p className="text-[11.5px] text-secondary">{tour.name}</p>
        <h1 className="page-title mt-1">{t("title")}</h1>
      </header>

      <div className="space-y-8 pt-6">

      {months.map((month) => {
        const monthStart = new Date(`${month}-01T00:00:00Z`);
        const label = new Intl.DateTimeFormat(locale, {
          month: "long",
          year: "numeric",
          timeZone: "UTC",
        }).format(monthStart);
        const daysInMonth = new Date(
          Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth() + 1, 0),
        ).getUTCDate();
        // luni = 0
        const firstWeekday = (monthStart.getUTCDay() + 6) % 7;
        const cells: (string | null)[] = [
          ...Array.from({ length: firstWeekday }, () => null),
          ...Array.from({ length: daysInMonth }, (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`),
        ];
        while (cells.length % 7 !== 0) cells.push(null);

        return (
          <section key={month}>
            <div className="flex items-baseline justify-between pb-2">
              <h2 className="font-display text-[14px] font-semibold capitalize text-primary">
                {label}
              </h2>
            </div>
            <div className="grid grid-cols-7 px-3 pb-2">
              {weekdays.map((wd) => (
                <span key={wd} className="eyebrow" style={{ letterSpacing: "0.08em" }}>
                  {wd}
                </span>
              ))}
            </div>
            <div className="grid grid-cols-7 overflow-hidden rounded-[12px] border border-hairline bg-calendar-grid">
              {cells.map((date, i) => {
                const isLastCol = i % 7 === 6;
                const isLastRow = i >= cells.length - 7;
                const cellBorder = `${isLastCol ? "" : "border-r "}${isLastRow ? "" : "border-b "}border-faint`;
                if (!date)
                  return <div key={i} className={`min-h-24 px-3 py-2.5 ${cellBorder}`} />;
                const day = byDate.get(date);
                const dayNum = date.slice(8);
                const isToday = date === todayKey;
                const inner = (
                  <>
                    <span className="flex items-center gap-1.5">
                      <span
                        className={`font-mono text-[12px] ${isToday ? "font-semibold text-accent" : day ? "text-secondary" : "text-disabled"}`}
                      >
                        {dayNum}
                      </span>
                      {isToday && (
                        <span
                          className="font-display text-[8.5px] font-semibold uppercase text-accent"
                          style={{ letterSpacing: "0.07em" }}
                        >
                          {t("todayTag")}
                        </span>
                      )}
                    </span>
                    {day && (day.events.length > 0 || day.city || day.day_type !== "new") && (
                      <span className="mt-2.5 block">
                        <span className="flex items-center gap-1.5">
                          <span
                            className="h-1.5 w-1.5 shrink-0 rounded-full"
                            style={{ background: DOT[day.day_type] ?? "var(--text-disabled)" }}
                          />
                          <span
                            className={`truncate text-[11.5px] font-medium ${day.day_type === "show" ? "text-primary" : "text-secondary"}`}
                          >
                            {day.events[0]?.title ?? day.events[0]?.venues?.name ?? day.city ?? td(day.day_type)}
                          </span>
                        </span>
                        {(day.events.length > 0 || day.city) && (
                          <span className="block truncate pl-3 font-mono text-[10px] text-tertiary">
                            {day.events.length > 0 ? (day.city ?? "") : td(day.day_type)}
                          </span>
                        )}
                      </span>
                    )}
                  </>
                );
                return day ? (
                  <Link
                    key={i}
                    href={`/o/${orgSlug}/t/${tourId}/d/${date}`}
                    className={`min-h-24 px-3 py-2.5 transition-colors hover:bg-fill-row-hover ${cellBorder}`}
                  >
                    {inner}
                  </Link>
                ) : (
                  <div key={i} className={`min-h-24 px-3 py-2.5 ${cellBorder}`}>
                    {inner}
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}

      {/* legenda */}
      <div className="flex items-center gap-5 pt-1">
        {(
          [
            ["show", t("legendShow")],
            ["travel", t("legendTravel")],
            ["day_off", t("legendDayOff")],
          ] as const
        ).map(([key, label]) => (
          <span key={key} className="flex items-center gap-1.5 text-[10.5px] text-tertiary">
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: DOT[key] }} />
            {label}
          </span>
        ))}
      </div>
      </div>
    </main>
  );
}
