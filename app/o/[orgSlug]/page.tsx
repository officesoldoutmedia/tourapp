import Link from "next/link";
import { getTranslations, getLocale } from "next-intl/server";
import { requireOrg } from "@/lib/org";
import { can } from "@/lib/permissions";
import { MetricStrip, type Metric } from "@/components/ui/MetricStrip";

export default async function OrgDashboard({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;
  const { supabase, org, permission, tier } = await requireOrg(orgSlug);
  const t = await getTranslations("tours");
  const ts = await getTranslations("orgStats");
  const locale = await getLocale();

  const { data: tours } = await supabase
    .from("tours")
    .select("id, name, start_date, end_date, is_archived")
    .eq("organization_id", org.id)
    .is("deleted_at", null)
    .order("start_date", { ascending: false });

  const active = (tours ?? []).filter((t) => !t.is_archived);
  const archived = (tours ?? []).filter((t) => t.is_archived);
  const canManage = can({ tier, permission }, "manage_tours");

  // ── statistici agregate peste tururile active ──
  const activeIds = active.map((t) => t.id);
  const tourName = new Map(active.map((t) => [t.id, t.name]));
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
    { label: ts("activeTours"), value: String(active.length), sub: archived.length ? ts("archivedSub", { count: archived.length }) : undefined },
    { label: ts("upcomingShows"), value: String(upcoming.length), sub: ts("showsTotalSub", { count: (showDays ?? []).length }) },
    {
      label: ts("nextShow"),
      value: nextShowDate,
      sub: nextShow ? [nextShow.city, tourName.get(nextShow.tour_id)].filter(Boolean).join(" · ") : undefined,
    },
    { label: ts("crew"), value: String(crewCount ?? 0), sub: ts("crewSub") },
  ];

  return (
    <main className="mx-auto w-full max-w-2xl space-y-8 p-6">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-2xl font-semibold tracking-tight">{t("title")}</h1>
        {canManage && (
          <Link
            href={`/o/${org.slug}/tours/new`}
            className="btn-primary h-9"
          >
            {t("newTour")}
          </Link>
        )}
      </div>

      <MetricStrip metrics={metrics} />

      {active.length === 0 ? (
        <p className="text-sm text-secondary">{t("empty")}</p>
      ) : (
        <ul className="divide-y divide-hairline rounded-[12px] border border-hairline bg-surface">
          {active.map((tour) => (
            <li key={tour.id}>
              <Link
                href={`/o/${org.slug}/t/${tour.id}`}
                className="flex items-center justify-between px-4 py-3 hover:bg-subtle"
              >
                <span className="font-medium">{tour.name}</span>
                <span className="text-xs text-secondary">
                  {tour.start_date} → {tour.end_date}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {archived.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-medium text-secondary">
            {t("archived")}
          </h2>
          <ul className="divide-y divide-hairline rounded-[12px] border border-hairline bg-surface opacity-60">
            {archived.map((tour) => (
              <li key={tour.id}>
                <Link
                  href={`/o/${org.slug}/t/${tour.id}`}
                  className="flex items-center justify-between px-4 py-3 hover:bg-subtle"
                >
                  <span>{tour.name}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
