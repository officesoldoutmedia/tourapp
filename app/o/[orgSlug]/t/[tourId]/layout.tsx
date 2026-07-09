import Link from "next/link";
import { notFound } from "next/navigation";
import { getLocale } from "next-intl/server";
import { requireOrg } from "@/lib/org";
import { aggregateAdvanceStatus, type AdvanceStatus } from "@/lib/advance";
import { MiniCalendar } from "@/components/MiniCalendar";
import { ModuleNav } from "@/components/ModuleNav";

function monthKey(date: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  })
    .format(new Date(`${date}T00:00:00Z`))
    .toUpperCase();
}

export default async function TourLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ orgSlug: string; tourId: string }>;
}) {
  const { orgSlug, tourId } = await params;
  const { supabase } = await requireOrg(orgSlug);
  const locale = await getLocale();

  const [{ data: tour }, { data: days }] = await Promise.all([
    supabase
      .from("tours")
      .select("id, name")
      .eq("id", tourId)
      .is("deleted_at", null)
      .maybeSingle(),
    supabase
      .from("days")
      .select("id, date, day_type, city, events(advances(status, deleted_at))")
      .eq("tour_id", tourId)
      .is("deleted_at", null)
      .order("date"),
  ]);

  if (!tour) notFound();

  type DayRow = {
    id: string;
    date: string;
    day_type: string;
    city: string | null;
    advanceStatus: AdvanceStatus;
  };

  const groups = new Map<string, DayRow[]>();
  for (const day of days ?? []) {
    // [C §6.6] status agregat pe Tour Date: pie dacă unele în lucru,
    // check dacă TOATE advance-urile zilei sunt done
    const statuses = (
      (day.events ?? []) as { advances: { status: string; deleted_at: string | null }[] | null }[]
    ).flatMap((event) =>
      (event.advances ?? [])
        .filter((a) => a.deleted_at === null)
        .map((a) => a.status as AdvanceStatus),
    );
    const key = monthKey(day.date, locale);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push({
      id: day.id,
      date: day.date,
      day_type: day.day_type,
      city: day.city,
      advanceStatus: aggregateAdvanceStatus(statuses),
    });
  }

  return (
    <div className="flex min-h-0 flex-1">
      <ModuleNav tourBase={`/o/${orgSlug}/t/${tourId}`} />
      <div className="min-w-0 flex-1">{children}</div>

      {/* Sidebar zile — dreapta, mereu vizibil [A.2] */}
      <aside className="hidden w-[280px] shrink-0 overflow-y-auto border-l border-hairline bg-canvas lg:flex lg:flex-col">
        <div className="border-b border-hairline px-3 py-2">
          <span className="text-sm font-semibold">{tour.name}</span>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
        {[...groups.entries()].map(([month, monthDays]) => (
          <div key={month}>
            <div className="sticky top-0 z-10 bg-subtle px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-tertiary">
              {month}
            </div>
            <ul>
              {monthDays.map((day) => {
                const [, mm, dd] = day.date.split("-");
                const isOff = day.day_type === "day_off";
                return (
                  <li key={day.id}>
                    <Link
                      href={`/o/${orgSlug}/t/${tourId}/d/${day.date}`}
                      className="flex items-baseline gap-2.5 border-l-2 border-transparent px-3 py-2 text-sm transition-colors hover:bg-subtle"
                    >
                      <span className="font-mono text-xs text-tertiary">
                        {dd}/{mm}
                      </span>
                      <span
                        className={`truncate ${isOff ? "italic text-tertiary" : ""}`}
                      >
                        {day.city || "—"}
                      </span>
                      {day.advanceStatus === "in_progress" && (
                        <span className="ml-auto h-2 w-2 shrink-0 self-center rounded-full bg-warning" title="Advance in progress" />
                      )}
                      {day.advanceStatus === "done" && (
                        <span className="ml-auto h-2 w-2 shrink-0 self-center rounded-full bg-success" title="Advance done" />
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
        </div>
        <MiniCalendar
          baseHref={`/o/${orgSlug}/t/${tourId}/d`}
          dates={(days ?? []).map((d) => d.date)}
          locale={locale}
        />
      </aside>
    </div>
  );
}
