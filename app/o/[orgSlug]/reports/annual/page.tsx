import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations, getLocale } from "next-intl/server";
import { ChevronLeft, ChevronRight, Download, FileText } from "lucide-react";
import { requireOrg } from "@/lib/org";
import { can } from "@/lib/permissions";
import { fetchAnnualReport } from "@/lib/annualReportQuery";
import { formatMoney } from "@/lib/showFinance";

/** Raport anual per persoană [cererea userului] — accounting only. */
export default async function AnnualReportPage({
  params,
  searchParams,
}: {
  params: Promise<{ orgSlug: string }>;
  searchParams: Promise<{ year?: string }>;
}) {
  const { orgSlug } = await params;
  const { supabase, org, permission, tier } = await requireOrg(orgSlug);
  if (!can({ tier, permission }, "view_accounting")) notFound();
  const t = await getTranslations("annualReport");
  const locale = await getLocale();

  const currentYear = new Date().getFullYear();
  const { year: yearParam } = await searchParams;
  const parsed = Number(yearParam);
  const year =
    Number.isInteger(parsed) && parsed >= 2000 && parsed <= 2100 ? parsed : currentYear;

  const people = await fetchAnnualReport(supabase, org.id, year);
  const dateFmt = new Intl.DateTimeFormat(locale, { day: "numeric", month: "short" });

  const base = `/o/${orgSlug}/reports/annual`;

  return (
    <main className="mx-auto w-full max-w-3xl space-y-6 p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow">{org.name}</p>
          <h1 className="page-title mt-1">{t("title")}</h1>
          <p className="mt-1 text-[12px] text-tertiary">{t("hint")}</p>
        </div>
        <div className="flex items-center gap-2">
          <Link href={`${base}?year=${year - 1}`} className="btn-quiet h-8 w-8 !px-0" title={String(year - 1)}>
            <ChevronLeft size={14} strokeWidth={1.75} />
          </Link>
          <span className="font-display text-[15px] font-semibold tabular-nums text-primary">
            {year}
          </span>
          <Link
            href={`${base}?year=${year + 1}`}
            className="btn-quiet h-8 w-8 !px-0"
            title={String(year + 1)}
          >
            <ChevronRight size={14} strokeWidth={1.75} />
          </Link>
          <span className="mx-1 h-4 w-px bg-hairline" aria-hidden />
          <a href={`/api/reports/annual/${orgSlug}?year=${year}`} className="btn-quiet h-8">
            <Download size={13} strokeWidth={1.75} />
            CSV
          </a>
          <a
            href={`/api/pdf/annual-report/${orgSlug}?year=${year}`}
            target="_blank"
            className="btn-quiet h-8"
          >
            <FileText size={13} strokeWidth={1.75} />
            PDF
          </a>
        </div>
      </div>

      {people.length === 0 ? (
        <p className="rounded-[12px] border border-hairline bg-surface px-4 py-10 text-center text-[12px] text-tertiary">
          {t("empty", { year })}
        </p>
      ) : (
        people.map((person) => (
          <section
            key={person.key}
            className="overflow-hidden rounded-[12px] border border-hairline bg-surface"
          >
            {/* antetul persoanei */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-hairline px-4 py-3">
              <div className="min-w-0">
                <p className="truncate text-[13.5px] font-semibold text-primary">{person.name}</p>
                <p className="truncate text-[11px] text-tertiary">
                  {[person.company, person.tours.join(", ")].filter(Boolean).join(" · ")}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-4">
                {Object.entries(person.totals).map(([currency, totals]) => (
                  <div key={currency} className="text-right">
                    <p className="font-mono text-[13px] font-semibold text-primary">
                      {formatMoney(totals.total, currency)}
                    </p>
                    <p className="text-[10px] text-tertiary">
                      {totals.pending > 0
                        ? t("pendingSub", { amount: formatMoney(totals.pending, currency) })
                        : t("allPaid")}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            {/* anexele */}
            <ul className="divide-y divide-hairline">
              {person.annexes.map((annex) => (
                <li
                  key={annex.id}
                  className="grid grid-cols-[70px_minmax(0,1fr)_90px_130px_70px] items-center gap-2 px-4 py-2 text-[12px]"
                >
                  <span className="font-mono text-secondary">#{annex.annexNumber}</span>
                  <span className="min-w-0">
                    <span className="block truncate text-primary">{annex.tourName}</span>
                    <span className="block truncate text-[10.5px] text-tertiary">
                      {annex.contractNumber ? `${annex.contractNumber} · ` : ""}
                      {dateFmt.format(new Date(`${annex.issueDate}T00:00:00`))}
                    </span>
                  </span>
                  <span className="text-right font-mono text-[10.5px] text-tertiary">
                    {annex.fxRate != null ? `1 ${annex.currency} = ${annex.fxRate} ${annex.paymentCurrency}` : ""}
                  </span>
                  <span className="text-right font-mono text-primary">
                    {formatMoney(annex.paymentTotal, annex.paymentCurrency)}
                    {annex.fxRate != null && (
                      <span className="block text-[10px] text-tertiary">
                        {formatMoney(annex.total, annex.currency)}
                      </span>
                    )}
                  </span>
                  <span
                    className={`text-right text-[11px] font-medium ${annex.paid ? "text-success" : "text-warning"}`}
                  >
                    {annex.paid ? t("paid") : t("pending")}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </main>
  );
}
