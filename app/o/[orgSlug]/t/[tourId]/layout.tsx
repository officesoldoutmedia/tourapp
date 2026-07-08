import Link from "next/link";
import { notFound } from "next/navigation";
import { getLocale } from "next-intl/server";
import { requireOrg } from "@/lib/org";

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
      .select("id, date, day_type, city")
      .eq("tour_id", tourId)
      .is("deleted_at", null)
      .order("date"),
  ]);

  if (!tour) notFound();

  const groups = new Map<string, { id: string; date: string; day_type: string; city: string | null }[]>();
  for (const day of days ?? []) {
    const key = monthKey(day.date, locale);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(day);
  }

  return (
    <div className="flex min-h-0 flex-1">
      <div className="min-w-0 flex-1">{children}</div>

      {/* Sidebar zile — dreapta, mereu vizibil [A.2] */}
      <aside className="hidden w-64 shrink-0 overflow-y-auto border-l border-neutral-200 lg:block">
        <div className="border-b border-neutral-200 px-3 py-2">
          <span className="text-sm font-semibold">{tour.name}</span>
        </div>
        {[...groups.entries()].map(([month, monthDays]) => (
          <div key={month}>
            <div className="sticky top-0 bg-neutral-50 px-3 py-1 text-[11px] font-semibold tracking-wide text-neutral-500">
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
                      className="flex items-baseline gap-2 border-l-4 border-transparent px-3 py-1.5 text-sm hover:bg-neutral-50 aria-[current=page]:border-red-600 aria-[current=page]:bg-neutral-50"
                    >
                      <span className="font-mono text-xs text-neutral-500">
                        {dd}/{mm}
                      </span>
                      <span
                        className={`truncate ${isOff ? "italic text-neutral-400" : ""}`}
                      >
                        {day.city || "—"}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </aside>
    </div>
  );
}
