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

  return (
    <main className="mx-auto w-full max-w-5xl space-y-8 p-6">
      <h1 className="font-display text-xl font-semibold tracking-tight">
        {t("title")} <span className="font-normal text-tertiary">· {tour.name}</span>
      </h1>

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
          <section key={month} className="overflow-hidden rounded-lg border border-hairline bg-surface shadow-xs">
            <h2 className="border-b border-hairline px-4 py-2 font-display text-lg font-semibold capitalize tracking-tight">
              {label}
            </h2>
            <div className="grid grid-cols-7 border-b border-hairline bg-subtle text-center text-[11px] font-semibold uppercase tracking-wider text-tertiary">
              {weekdays.map((wd) => (
                <span key={wd} className="py-1.5">
                  {wd}
                </span>
              ))}
            </div>
            <div className="grid grid-cols-7">
              {cells.map((date, i) => {
                if (!date)
                  return <div key={i} className="min-h-20 border-b border-r border-hairline bg-subtle/40 [&:nth-child(7n)]:border-r-0" />;
                const day = byDate.get(date);
                const dayNum = Number(date.slice(8));
                const isToday = date === todayKey;
                const inner = (
                  <>
                    <span
                      className={`text-xs font-mono ${isToday ? "rounded-full bg-accent px-1.5 py-0.5 font-bold text-white" : day ? "text-primary" : "text-disabled"}`}
                    >
                      {dayNum}
                    </span>
                    {day?.day_type === "show" && (
                      <span className="mt-1 block rounded bg-accent-subtle px-1 py-0.5 text-center text-[9px] font-bold uppercase tracking-wider text-accent">
                        {t("showDay")}
                      </span>
                    )}
                    {day?.events.map((e) => (
                      <span key={e.id} className="mt-0.5 block truncate text-[11px] font-medium leading-tight">
                        {e.title ?? e.venues?.name}
                      </span>
                    ))}
                    {day?.city && (
                      <span className="block truncate text-[10px] text-tertiary">{day.city}</span>
                    )}
                  </>
                );
                return day ? (
                  <Link
                    key={i}
                    href={`/o/${orgSlug}/t/${tourId}/d/${date}`}
                    className="min-h-20 border-b border-r border-hairline p-1.5 transition-colors hover:bg-subtle [&:nth-child(7n)]:border-r-0"
                  >
                    {inner}
                  </Link>
                ) : (
                  <div key={i} className="min-h-20 border-b border-r border-hairline p-1.5 [&:nth-child(7n)]:border-r-0">
                    {inner}
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}
    </main>
  );
}
