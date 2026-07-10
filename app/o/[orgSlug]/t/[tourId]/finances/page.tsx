import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations, getLocale } from "next-intl/server";
import { requireOrg } from "@/lib/org";
import { can } from "@/lib/permissions";
import { computeShowProfit, convertCostLines, formatMoney } from "@/lib/showFinance";
import { PageHeader } from "@/components/ui/PageHeader";

/** Finanțe tur — P&L-ul tuturor show-urilor + totaluri pe monedă. */
export default async function TourFinancesPage({
  params,
}: {
  params: Promise<{ orgSlug: string; tourId: string }>;
}) {
  const { orgSlug, tourId } = await params;
  const { supabase, permission, tier } = await requireOrg(orgSlug);
  const t = await getTranslations("tourFinances");
  const locale = await getLocale();
  if (!can({ tier, permission }, "view_accounting")) notFound();

  const [{ data: tour }, { data: days }] = await Promise.all([
    supabase
      .from("tours")
      .select("id, name, booking_percent")
      .eq("id", tourId)
      .is("deleted_at", null)
      .maybeSingle(),
    supabase
      .from("days")
      .select("date, city, events(id, title, venues(name))")
      .eq("tour_id", tourId)
      .is("deleted_at", null)
      .order("date"),
  ]);
  if (!tour) notFound();

  type DayRow = {
    date: string;
    city: string | null;
    events: { id: string; title: string | null; venues: { name: string } | null }[];
  };
  const rows = (days ?? []) as unknown as DayRow[];
  const events = rows.flatMap((d) =>
    d.events.map((e) => ({
      id: e.id,
      date: d.date,
      city: d.city,
      name: e.title ?? e.venues?.name ?? "—",
    })),
  );
  const eventIds = events.map((e) => e.id);

  const [{ data: finances }, { data: costs }] = await Promise.all([
    eventIds.length
      ? supabase.from("show_finances").select("*").in("event_id", eventIds)
      : { data: [] },
    eventIds.length
      ? supabase
          .from("show_costs")
          .select("event_id, kind, label, amount, currency, billable_to_booker")
          .in("event_id", eventIds)
          .is("deleted_at", null)
      : { data: [] },
  ]);

  const shows = events.map((event) => {
    const fin = (finances ?? []).find((f) => f.event_id === event.id);
    const currency = fin?.fee_currency ?? "RON";
    const conversion = convertCostLines(
      (costs ?? [])
        .filter((c) => c.event_id === event.id)
        .map((c) => ({
          kind: c.kind as "crew" | "extra",
          label: c.label,
          amount: Number(c.amount),
          currency: c.currency,
          toBooker: c.billable_to_booker,
        })),
      currency,
      (fin?.fx_rates ?? {}) as Record<string, number>,
    );
    const result = computeShowProfit({
      fee: Number(fin?.fee ?? 0),
      bookingPercent: Number(fin?.booking_percent ?? tour.booking_percent ?? 0),
      bookingBase: (fin?.booking_base ?? "net") as "gross" | "net",
      costs: conversion.lines,
    });
    return { ...event, currency, result, fxMissing: conversion.missing.length > 0 };
  });

  // totaluri pe monedă (fără conversie între monede la nivel de tur)
  const totals = new Map<string, { fee: number; costs: number; profit: number }>();
  for (const show of shows) {
    const bucket = totals.get(show.currency) ?? { fee: 0, costs: 0, profit: 0 };
    bucket.fee += show.result.fee;
    bucket.costs += show.result.totalCosts;
    bucket.profit += show.result.profit;
    totals.set(show.currency, bucket);
  }

  const fmtDay = (date: string) =>
    new Intl.DateTimeFormat(locale, { day: "2-digit", month: "short", timeZone: "UTC" }).format(
      new Date(`${date}T00:00:00Z`),
    );
  const money = (n: number, ccy: string) => formatMoney(Math.round(n * 100) / 100, ccy);

  return (
    <main className="w-full pb-11">
      <PageHeader eyebrow={tour.name} title={t("title")} />

      <div className="max-w-[960px] px-8 pt-6">
        {shows.length === 0 ? (
          <p className="py-10 text-center text-[12.5px] text-tertiary">{t("empty")}</p>
        ) : (
          <>
            {/* strip de totaluri pe monedă (prototip: 3 celule cu hairline) */}
            <div
              className="grid rounded-[12px] border border-hairline"
              style={{
                background: "rgba(255,255,255,.02)",
                gridTemplateColumns: `repeat(${Math.max(totals.size * 3, 3)}, 1fr)`,
              }}
            >
              {[...totals.entries()].flatMap(([ccy, sums], i) => [
                <div key={ccy + "f"} className={`px-[18px] py-3.5 ${i > 0 ? "border-l border-hairline" : ""}`}>
                  <p className="eyebrow">{t("fee")} {ccy}</p>
                  <p className="mt-1.5 font-display text-[18px] font-semibold tabular-nums text-primary">
                    {money(sums.fee, ccy)}
                  </p>
                </div>,
                <div key={ccy + "c"} className="border-l border-hairline px-[18px] py-3.5">
                  <p className="eyebrow">{t("costs")} {ccy}</p>
                  <p className="mt-1.5 font-display text-[18px] font-semibold tabular-nums text-primary">
                    {money(sums.costs, ccy)}
                  </p>
                </div>,
                <div key={ccy + "p"} className="border-l border-hairline px-[18px] py-3.5">
                  <p className="eyebrow">{t("profit")} {ccy}</p>
                  <p className={`mt-1.5 font-display text-[18px] font-semibold tabular-nums ${sums.profit < 0 ? "text-danger" : "text-success"}`}>
                    {money(sums.profit, ccy)}
                  </p>
                </div>,
              ])}
            </div>

            {/* tabel per show (prototip: capete eyebrow, rânduri 42px, mono dreapta) */}
            <div className="mt-[26px] grid h-8 grid-cols-[64px_minmax(0,1.5fr)_110px_110px_110px_70px] items-center border-b border-hairline">
              <span className="eyebrow">{t("date")}</span>
              <span className="eyebrow">{t("show")}</span>
              <span className="eyebrow text-right">{t("fee")}</span>
              <span className="eyebrow text-right">{t("costs")}</span>
              <span className="eyebrow text-right">{t("profit")}</span>
              <span />
            </div>
            {shows.map((show) => (
              <div
                key={show.id}
                className="grid h-[42px] grid-cols-[64px_minmax(0,1.5fr)_110px_110px_110px_70px] items-center border-b border-faint transition-colors hover:bg-fill-row-hover"
              >
                <span className="font-mono text-[11px] text-tertiary">{fmtDay(show.date)}</span>
                <span className="min-w-0 truncate pr-3 text-[12.5px] font-medium text-primary">
                  {show.name}
                  {show.city && <span className="ml-1.5 font-normal text-tertiary">{show.city}</span>}
                  {show.fxMissing && (
                    <span className="ml-1.5 text-[10px] font-semibold text-warning" title={t("fxMissing")}>
                      FX!
                    </span>
                  )}
                </span>
                <span className="text-right font-mono text-[12px] tabular-nums text-secondary">
                  {money(show.result.fee, show.currency)}
                </span>
                <span className="text-right font-mono text-[12px] tabular-nums text-primary">
                  −{money(show.result.totalCosts, show.currency)}
                </span>
                <span
                  className={`text-right font-mono text-[11.5px] tabular-nums ${show.result.profit < 0 ? "text-danger" : "text-success"}`}
                >
                  {money(show.result.profit, show.currency)}
                </span>
                <Link
                  href={`/o/${orgSlug}/t/${tourId}/d/${show.date}/e/${show.id}/costs`}
                  className="justify-self-end text-[11.5px] text-secondary transition-colors hover:text-primary"
                >
                  {t("open")}
                </Link>
              </div>
            ))}

            {/* Total pe monedă (prototip: bordură top mai puternică) */}
            {[...totals.entries()].map(([ccy, sums]) => (
              <div
                key={ccy}
                className="grid h-[46px] grid-cols-[64px_minmax(0,1.5fr)_110px_110px_110px_70px] items-center border-t border-strong"
              >
                <span />
                <span className="font-display text-[12.5px] font-semibold text-primary">
                  {t("total")} {ccy}
                </span>
                <span className="text-right font-mono text-[12px] font-medium tabular-nums text-secondary">
                  {money(sums.fee, ccy)}
                </span>
                <span className="text-right font-mono text-[12px] font-medium tabular-nums text-primary">
                  −{money(sums.costs, ccy)}
                </span>
                <span
                  className={`text-right font-mono text-[14px] font-semibold tabular-nums ${sums.profit < 0 ? "text-danger" : "text-success"}`}
                >
                  {money(sums.profit, ccy)}
                </span>
                <span />
              </div>
            ))}
          </>
        )}
      </div>
    </main>
  );
}
