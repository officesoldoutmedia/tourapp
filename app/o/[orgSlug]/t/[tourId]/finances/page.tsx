import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations, getLocale } from "next-intl/server";
import { requireOrg } from "@/lib/org";
import { can } from "@/lib/permissions";
import { computeShowProfit, convertCostLines, formatMoney } from "@/lib/showFinance";

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
    <main className="mx-auto w-full max-w-4xl space-y-6 p-6">
      <h1 className="font-display text-xl font-semibold tracking-tight">
        {t("title")} <span className="font-normal text-tertiary">· {tour.name}</span>
      </h1>

      {shows.length === 0 ? (
        <p className="text-sm text-tertiary">{t("empty")}</p>
      ) : (
        <div className="overflow-hidden rounded-lg border border-hairline bg-surface shadow-xs">
          <div className="grid grid-cols-[4.5rem_1fr_6.5rem_6.5rem_6.5rem_7rem] gap-2 border-b border-hairline bg-subtle px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-secondary">
            <span>{t("date")}</span>
            <span>{t("show")}</span>
            <span className="text-right">{t("fee")}</span>
            <span className="text-right">{t("costs")}</span>
            <span className="text-right">{t("profit")}</span>
            <span />
          </div>
          {shows.map((show) => (
            <div
              key={show.id}
              className="grid grid-cols-[4.5rem_1fr_6.5rem_6.5rem_6.5rem_7rem] items-center gap-2 border-b border-hairline px-4 py-2 text-sm last:border-0"
            >
              <span className="font-mono text-xs text-secondary">{fmtDay(show.date)}</span>
              <span className="min-w-0 truncate">
                <span className="font-medium">{show.name}</span>
                {show.city && <span className="ml-1.5 text-xs text-secondary">{show.city}</span>}
                {show.fxMissing && (
                  <span className="ml-1.5 text-xs font-semibold text-warning" title={t("fxMissing")}>
                    FX!
                  </span>
                )}
              </span>
              <span className="text-right font-mono text-xs">{money(show.result.fee, show.currency)}</span>
              <span className="text-right font-mono text-xs text-danger">
                −{money(show.result.totalCosts, show.currency)}
              </span>
              <span
                className={`text-right font-mono text-xs font-semibold ${show.result.profit < 0 ? "text-danger" : "text-success"}`}
              >
                {money(show.result.profit, show.currency)}
              </span>
              <Link
                href={`/o/${orgSlug}/t/${tourId}/d/${show.date}/e/${show.id}/costs`}
                className="justify-self-end rounded-md border border-hairline bg-surface px-2 py-1 text-xs shadow-xs transition-colors hover:bg-subtle"
              >
                {t("open")}
              </Link>
            </div>
          ))}
          {[...totals.entries()].map(([ccy, sums]) => (
            <div
              key={ccy}
              className="grid grid-cols-[4.5rem_1fr_6.5rem_6.5rem_6.5rem_7rem] items-center gap-2 bg-subtle px-4 py-2 text-sm font-medium"
            >
              <span />
              <span className="text-xs font-semibold uppercase tracking-wider text-secondary">
                {t("total")} {ccy}
              </span>
              <span className="text-right font-mono text-xs">{money(sums.fee, ccy)}</span>
              <span className="text-right font-mono text-xs text-danger">−{money(sums.costs, ccy)}</span>
              <span
                className={`text-right font-mono text-xs font-bold ${sums.profit < 0 ? "text-danger" : "text-success"}`}
              >
                {money(sums.profit, ccy)}
              </span>
              <span />
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
