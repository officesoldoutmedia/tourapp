import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations, getLocale } from "next-intl/server";
import { requireOrg } from "@/lib/org";
import { PageHeader } from "@/components/ui/PageHeader";

/** Travel la nivel de TUR (prototip Graphite): toate legs, grupate pe zi. */
export default async function TourTravelPage({
  params,
}: {
  params: Promise<{ orgSlug: string; tourId: string }>;
}) {
  const { orgSlug, tourId } = await params;
  const { supabase } = await requireOrg(orgSlug);
  const t = await getTranslations("tourTravel");
  const locale = await getLocale();

  const [{ data: tour }, { data: days }] = await Promise.all([
    supabase.from("tours").select("id, name").eq("id", tourId).is("deleted_at", null).maybeSingle(),
    supabase
      .from("days")
      .select(
        "id, date, city, travel_items(id, travel_type, title, auto_title, is_confirmed, party, origin_label, dest_label, depart_time, arrive_time, detail, confirmation_number, train_number, deleted_at, sort_order)",
      )
      .eq("tour_id", tourId)
      .is("deleted_at", null)
      .order("date"),
  ]);
  if (!tour) notFound();

  const MODE: Record<string, string> = {
    flight: "FLT",
    bus: "BUS",
    van: "VAN",
    car: "CAR",
    train: "TRN",
    ferry: "FRY",
    walk: "WLK",
    other: "TRV",
  };
  const clock = (v: string | null) => (v ? v.slice(0, 5) : "—");

  const dayFmt = new Intl.DateTimeFormat(locale, {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  });

  type Leg = {
    id: string;
    travel_type: string | null;
    title: string | null;
    auto_title: string | null;
    is_confirmed: boolean;
    party: string | null;
    origin_label: string | null;
    dest_label: string | null;
    depart_time: string | null;
    arrive_time: string | null;
    detail: string | null;
    confirmation_number: string | null;
    train_number: string | null;
    deleted_at: string | null;
    sort_order: number | null;
  };
  const groups = (days ?? [])
    .map((day) => ({
      id: day.id,
      date: day.date,
      city: day.city,
      legs: ((day.travel_items ?? []) as Leg[])
        .filter((leg) => !leg.deleted_at)
        .sort(
          (a, b) =>
            (a.depart_time ?? "99").localeCompare(b.depart_time ?? "99") ||
            (a.sort_order ?? 0) - (b.sort_order ?? 0),
        ),
    }))
    .filter((group) => group.legs.length > 0);

  const legCount = groups.reduce((n, g) => n + g.legs.length, 0);

  return (
    <main className="w-full pb-11">
      <PageHeader
        eyebrow={t("countLine", { count: legCount })}
        title={t("title")}
        actions={
          <Link href={`/o/${orgSlug}/t/${tourId}/calendar`} className="btn-quiet h-8">
            {t("addHint")}
          </Link>
        }
      />

      <div className="max-w-[1020px] px-8 pt-1.5">
        {groups.length === 0 && (
          <p className="py-10 text-center text-[12.5px] text-tertiary">{t("empty")}</p>
        )}
        {groups.map((group) => (
          <section key={group.id}>
            <h2 className="mb-1 mt-[30px] font-display text-[13px] font-semibold text-primary">
              {dayFmt.format(new Date(`${group.date}T00:00:00Z`))}
              {group.city && <span className="ml-2 font-normal text-tertiary">{group.city}</span>}
            </h2>
            <div className="border-t border-faint">
              {group.legs.map((leg) => {
                const route =
                  leg.title ??
                  leg.auto_title ??
                  ([leg.origin_label, leg.dest_label].filter(Boolean).join(" → ") || "—");
                const detail = [leg.detail, leg.party].filter(Boolean).join(" · ");
                return (
                  <Link
                    key={leg.id}
                    href={`/o/${orgSlug}/t/${tourId}/d/${group.date}#travel`}
                    className="grid min-h-16 grid-cols-[52px_150px_minmax(0,1fr)_110px_auto] items-center gap-3.5 border-b border-faint py-2.5 transition-colors hover:bg-fill-row-hover"
                  >
                    <span className="flex h-[22px] w-[38px] items-center justify-center rounded-[6px] border border-hairline bg-inset font-mono text-[9px] font-semibold tracking-[0.05em] text-secondary">
                      {MODE[leg.travel_type ?? "other"] ?? "TRV"}
                    </span>
                    <span className="font-mono text-[12.5px] tabular-nums text-primary">
                      {clock(leg.depart_time)} → {clock(leg.arrive_time)}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-[13px] font-medium text-primary">
                        {route}
                      </span>
                      {detail && (
                        <span className="mt-0.5 block truncate text-[11.5px] text-secondary">
                          {detail}
                        </span>
                      )}
                    </span>
                    <span className="font-mono text-[11px] text-tertiary">
                      {leg.confirmation_number ?? leg.train_number ?? "—"}
                    </span>
                    <span
                      className={`flex items-center gap-1.5 text-[11px] font-medium ${leg.is_confirmed ? "text-success" : "text-warning"}`}
                    >
                      <i
                        className={`h-[5px] w-[5px] rounded-full ${leg.is_confirmed ? "bg-success" : "bg-warning"}`}
                      />
                      {leg.is_confirmed ? t("confirmed") : t("pending")}
                    </span>
                  </Link>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </main>
  );
}
