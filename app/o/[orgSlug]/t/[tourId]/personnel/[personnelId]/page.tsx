import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations, getLocale } from "next-intl/server";
import { Printer, Trash2, FileText } from "lucide-react";
import { requireOrg } from "@/lib/org";
import { can } from "@/lib/permissions";
import { formatMoney } from "@/lib/showFinance";
import { PersonnelPhoto } from "./photo-client";
import {
  saveIdentity,
  saveBillingDetails,
  createAnnex,
  toggleAnnexPaid,
  deleteAnnex,
} from "./profile-actions";

/** Profilul membrului de crew: date, poză, facturare, situația plăților. */
export default async function CrewProfilePage({
  params,
  searchParams,
}: {
  params: Promise<{ orgSlug: string; tourId: string; personnelId: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { orgSlug, tourId, personnelId } = await params;
  const { error } = await searchParams;
  const { supabase, org, permission, tier } = await requireOrg(orgSlug);
  const t = await getTranslations("crewProfile");
  const locale = await getLocale();
  const canEdit = can({ tier, permission }, "edit_tour_content");
  const canAccounting = can({ tier, permission }, "view_accounting");
  const canEditAccounting = can({ tier, permission }, "edit_accounting");

  const { data: person } = await supabase
    .from("tour_personnel")
    .select("*")
    .eq("id", personnelId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!person) notFound();

  const name = [person.first_name, person.last_name].filter(Boolean).join(" ") || "—";
  const billing = (person.billing_details ?? {}) as Record<string, string>;

  const photoUrl = person.photo_path
    ? (
        await supabase.storage
          .from("attachments")
          .createSignedUrl(person.photo_path, 3600)
      ).data?.signedUrl ?? null
    : null;

  // situația financiară: liniile de crew ale persoanei pe toate show-urile
  const [{ data: lines }, { data: annexes }] = canAccounting
    ? await Promise.all([
        supabase
          .from("show_costs")
          .select(
            "id, amount, currency, annex_id, events!inner(id, title, venues(name), days!inner(date, tour_id))",
          )
          .eq("personnel_id", personnelId)
          .is("deleted_at", null),
        supabase
          .from("payment_annexes")
          .select("*")
          .eq("personnel_id", personnelId)
          .is("deleted_at", null)
          .order("annex_number"),
      ])
    : [{ data: [] }, { data: [] }];

  type LineRow = {
    id: string;
    amount: number;
    currency: string;
    annex_id: string | null;
    events: {
      id: string;
      title: string | null;
      venues: { name: string } | null;
      days: { date: string; tour_id: string };
    };
  };
  const costLines = ((lines ?? []) as unknown as LineRow[])
    .map((line) => ({
      id: line.id,
      amount: Number(line.amount),
      currency: line.currency,
      annexId: line.annex_id,
      date: line.events.days.date,
      show: line.events.title ?? line.events.venues?.name ?? "Show",
    }))
    .sort((a, b) => a.date.localeCompare(b.date));

  const annexByLine = new Map(
    (annexes ?? []).map((a) => [a.id, a] as const),
  );
  const paidTotals = new Map<string, number>();
  const pendingTotals = new Map<string, number>();
  for (const line of costLines) {
    const annex = line.annexId ? annexByLine.get(line.annexId) : null;
    const bucket = annex?.paid_at ? paidTotals : pendingTotals;
    bucket.set(line.currency, (bucket.get(line.currency) ?? 0) + line.amount);
  }
  const unannexed = costLines.filter((l) => !l.annexId);
  const nextAnnexNumber =
    ((annexes ?? []).reduce((m, a) => Math.max(m, a.annex_number), 0) ?? 0) + 1;

  const fmtDay = (date: string) =>
    new Intl.DateTimeFormat(locale, {
      day: "2-digit",
      month: "short",
      year: "numeric",
      timeZone: "UTC",
    }).format(new Date(`${date}T00:00:00Z`));
  const input = "rounded border border-hairline px-2 py-1 text-sm";

  const saveIdent = saveIdentity.bind(null, orgSlug, tourId, personnelId);
  const saveBilling = saveBillingDetails.bind(null, orgSlug, tourId, personnelId);
  const makeAnnex = createAnnex.bind(null, orgSlug, tourId, personnelId);
  const togglePaid = toggleAnnexPaid.bind(null, orgSlug, tourId, personnelId);
  const removeAnnex = deleteAnnex.bind(null, orgSlug, tourId, personnelId);

  const BILLING_FIELDS: [string, string][] =
    (person.payment_type ?? "company") === "individual"
      ? [
          ["name", t("fullName")],
          ["id_number", t("idNumber")],
          ["address", t("address")],
          ["iban", "IBAN"],
          ["bank", t("bank")],
          ["contract_number", t("contractNumber")],
        ]
      : [
          ["name", t("companyName")],
          ["cui", "CUI"],
          ["reg_com", "Reg. Com."],
          ["address", t("address")],
          ["iban", "IBAN"],
          ["bank", t("bank")],
          ["representative", t("representative")],
          ["contract_number", t("contractNumber")],
        ];

  return (
    <main className="mx-auto w-full max-w-4xl space-y-6 p-6">
      <Link
        href={`/o/${orgSlug}/t/${tourId}/personnel`}
        className="text-xs text-secondary hover:underline"
      >
        ← {t("backToPersonnel")}
      </Link>

      {error && (
        <div className="rounded-md border border-danger bg-danger-subtle px-4 py-3 text-sm text-danger">
          {t(`error_${error}`)}
        </div>
      )}

      {/* header: poză + identitate */}
      <header className="flex flex-wrap items-center gap-5 rounded-lg border border-hairline bg-surface p-5">
        <PersonnelPhoto
          orgSlug={orgSlug}
          orgId={org.id}
          tourId={tourId}
          personnelId={personnelId}
          photoUrl={photoUrl}
          canEdit={canEdit}
        />
        <div className="min-w-0">
          <h1 className="font-display text-2xl font-semibold tracking-tight">{name}</h1>
          <p className="text-sm text-secondary">
            {[person.role, person.title, person.company].filter(Boolean).join(" · ")}
          </p>
          <p className="mt-1 flex flex-wrap gap-x-4 text-sm">
            {(person.phones as { number?: string }[])?.[0]?.number && (
              <a
                href={`tel:${(person.phones as { number?: string }[])[0].number!.replace(/\s+/g, "")}`}
                className="font-mono text-accent hover:underline"
              >
                {(person.phones as { number?: string }[])[0].number}
              </a>
            )}
            {(person.emails as { email?: string }[])?.[0]?.email && (
              <a
                href={`mailto:${(person.emails as { email?: string }[])[0].email}`}
                className="text-accent hover:underline"
              >
                {(person.emails as { email?: string }[])[0].email}
              </a>
            )}
            {person.party && (
              <span className="rounded-full bg-accent-subtle px-2 text-xs font-bold uppercase leading-5 text-accent">
                {person.party}
              </span>
            )}
          </p>
        </div>
        {canAccounting && (
          <div className="ml-auto space-y-1 text-right text-sm">
            {[...paidTotals.entries()].map(([ccy, sum]) => (
              <p key={ccy}>
                <span className="text-xs uppercase tracking-wider text-tertiary">{t("paid")}</span>{" "}
                <span className="font-mono font-semibold text-success">{formatMoney(sum, ccy)}</span>
              </p>
            ))}
            {[...pendingTotals.entries()].map(([ccy, sum]) => (
              <p key={ccy}>
                <span className="text-xs uppercase tracking-wider text-tertiary">{t("pending")}</span>{" "}
                <span className="font-mono font-semibold text-warning">{formatMoney(sum, ccy)}</span>
              </p>
            ))}
            <p className="text-xs text-tertiary">
              {t("showsCount", { count: costLines.length })}
            </p>
          </div>
        )}
      </header>

      {/* identitate & contact — editarea completă trăiește în profil */}
      {canEdit && (
        <section className="rounded-[12px] border border-hairline bg-surface p-4">
          <h2 className="section-title mb-3">{t("identityTitle")}</h2>
          <form action={saveIdent} className="flex flex-wrap items-end gap-2">
            {(
              [
                ["first", t("firstName"), person.first_name],
                ["last", t("lastName"), person.last_name],
                ["role", t("role"), person.role],
                ["title", t("jobTitle"), person.title],
                ["company", t("companyLabel"), person.company],
                ["party", t("party"), person.party],
                ["phone", t("phone"), (person.phones as { number?: string }[])?.[0]?.number],
                ["email", t("email"), (person.emails as { email?: string }[])?.[0]?.email],
              ] as const
            ).map(([key, label, value]) => (
              <label key={key} className="min-w-36 flex-1 space-y-1 text-xs font-semibold uppercase tracking-wider text-secondary">
                {label}
                <input
                  name={key}
                  defaultValue={value ?? ""}
                  className={`${input} block w-full ${key === "phone" ? "font-mono" : ""}`}
                />
              </label>
            ))}
            <button className="btn-quiet">{t("save")}</button>
          </form>
        </section>
      )}

      {/* datele de facturare */}
      {canAccounting && (
        <section className="rounded-[12px] border border-hairline bg-surface p-4">
          <h2 className="mb-3 font-display text-lg font-semibold tracking-tight">
            {t("billingTitle")}
          </h2>
          <form action={saveBilling} className="flex flex-wrap items-end gap-2">
            <label className="space-y-1 text-xs font-semibold uppercase tracking-wider text-secondary">
              {t("costPerShow")}
              <input
                name="costPerShow"
                type="number"
                step="0.01"
                min="0"
                defaultValue={person.cost_per_show ?? ""}
                disabled={!canEditAccounting}
                className={`${input} block w-28 text-right font-mono`}
              />
            </label>
            <label className="space-y-1 text-xs font-semibold uppercase tracking-wider text-secondary">
              {t("currency")}
              <select
                name="costCurrency"
                defaultValue={person.cost_currency ?? "RON"}
                disabled={!canEditAccounting}
                className={`${input} block font-mono`}
              >
                {["RON", "EUR", "USD", "GBP"].map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </label>
            <label className="w-full max-w-44 space-y-1 text-xs font-semibold uppercase tracking-wider text-secondary">
              {t("paymentType")}
              <select
                name="paymentType"
                defaultValue={person.payment_type ?? "company"}
                disabled={!canEditAccounting}
                className={`${input} block w-full`}
              >
                <option value="company">{t("company")}</option>
                <option value="individual">{t("individual")}</option>
              </select>
            </label>
            {BILLING_FIELDS.map(([key, label]) => (
              <label key={key} className="min-w-40 flex-1 space-y-1 text-xs font-semibold uppercase tracking-wider text-secondary">
                {label}
                <input
                  name={key}
                  defaultValue={billing[key] ?? ""}
                  disabled={!canEditAccounting}
                  className={`${input} block w-full ${key === "iban" || key === "cui" ? "font-mono" : ""}`}
                />
              </label>
            ))}
            {canEditAccounting && (
              <button className="btn-primary">
                {t("save")}
              </button>
            )}
          </form>
          <p className="mt-2 text-xs text-tertiary">{t("billingHint")}</p>
        </section>
      )}

      {/* situația per show + creare anexă */}
      {canAccounting && (
        <section className="rounded-[12px] border border-hairline bg-surface p-4">
          <h2 className="mb-3 font-display text-lg font-semibold tracking-tight">
            {t("showsTitle")}
          </h2>
          {costLines.length === 0 ? (
            <p className="text-sm text-tertiary">{t("noShows")}</p>
          ) : (
            <form action={makeAnnex}>
              <ul className="divide-y divide-hairline">
                {costLines.map((line) => {
                  const annex = line.annexId ? annexByLine.get(line.annexId) : null;
                  return (
                    <li key={line.id} className="flex items-center gap-3 py-2 text-sm">
                      {canEditAccounting && !annex ? (
                        <input type="checkbox" name="costId" value={line.id} className="accent-[var(--accent)]" />
                      ) : (
                        <span className="w-3.5" />
                      )}
                      <span className="w-24 shrink-0 font-mono text-xs text-secondary">
                        {fmtDay(line.date)}
                      </span>
                      <span className="min-w-0 flex-1 truncate font-medium">{line.show}</span>
                      <span className="font-mono text-xs">{formatMoney(line.amount, line.currency)}</span>
                      {annex ? (
                        <span
                          className={`w-28 shrink-0 rounded-full px-2 py-0.5 text-center text-[11px] font-semibold ${annex.paid_at ? "bg-success-subtle text-success" : "bg-warning-subtle text-warning"}`}
                        >
                          {annex.paid_at ? t("paidAnnex", { nr: annex.annex_number }) : t("onAnnex", { nr: annex.annex_number })}
                        </span>
                      ) : (
                        <span className="w-28 shrink-0 rounded-full bg-inset px-2 py-0.5 text-center text-[11px] font-semibold text-tertiary">
                          {t("unallocated")}
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
              {canEditAccounting && unannexed.length > 0 && (
                <div className="mt-3 flex flex-wrap items-end gap-2 border-t border-hairline pt-3">
                  <label className="space-y-1 text-xs font-semibold uppercase tracking-wider text-secondary">
                    {t("annexNumber")}
                    <input name="annexNumber" type="number" min="1" defaultValue={nextAnnexNumber} className={`${input} block w-24 font-mono`} />
                  </label>
                  <label className="space-y-1 text-xs font-semibold uppercase tracking-wider text-secondary">
                    {t("contractNumber")}
                    <input name="contractNumber" defaultValue={billing.contract_number ?? ""} className={`${input} block w-32`} />
                  </label>
                  <label className="space-y-1 text-xs font-semibold uppercase tracking-wider text-secondary">
                    {t("issueDate")}
                    <input name="issueDate" type="date" defaultValue={new Date().toISOString().slice(0, 10)} className={`${input} block font-mono`} />
                  </label>
                  <label className="space-y-1 text-xs font-semibold uppercase tracking-wider text-secondary">
                    {t("annexLanguage")}
                    <select name="language" defaultValue="ro" className={`${input} block`}>
                      <option value="ro">Română</option>
                      <option value="en">English</option>
                    </select>
                  </label>
                  <label className="space-y-1 text-xs font-semibold uppercase tracking-wider text-secondary">
                    {t("paymentCurrency")}
                    <select name="paymentCurrency" defaultValue="" className={`${input} block font-mono`}>
                      <option value="">{t("sameCurrency")}</option>
                      {["RON", "EUR", "USD", "GBP"].map((c) => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                  </label>
                  <label className="space-y-1 text-xs font-semibold uppercase tracking-wider text-secondary">
                    {t("fxRate")}
                    <input name="fxRate" type="number" step="0.0001" min="0" placeholder={t("fxRatePlaceholder")} className={`${input} block w-28 font-mono`} />
                  </label>
                  <button className="btn-primary">
                    <FileText size={14} strokeWidth={1.5} className="mr-1 inline" />
                    {t("createAnnex")}
                  </button>
                  <p className="w-full text-xs text-tertiary">{t("createAnnexHint")}</p>
                </div>
              )}
            </form>
          )}
        </section>
      )}

      {/* anexele emise */}
      {canAccounting && (annexes ?? []).length > 0 && (
        <section className="rounded-[12px] border border-hairline bg-surface p-4">
          <h2 className="mb-3 font-display text-lg font-semibold tracking-tight">
            {t("annexesTitle")}
          </h2>
          <ul className="divide-y divide-hairline">
            {(annexes ?? []).map((annex) => (
              <li key={annex.id} className="flex flex-wrap items-center gap-3 py-2 text-sm">
                <span className="font-mono font-semibold">
                  {t("annexNr", { nr: annex.annex_number })}
                </span>
                {annex.contract_number && (
                  <span className="text-xs text-secondary">
                    {t("toContract", { nr: annex.contract_number })}
                  </span>
                )}
                <span className="font-mono text-xs text-secondary">{fmtDay(annex.issue_date)}</span>
                <span className="font-mono font-medium">{formatMoney(Number(annex.total), annex.currency)}</span>
                <form action={togglePaid} className="ml-auto">
                  <input type="hidden" name="id" value={annex.id} />
                  <input type="hidden" name="paid" value={annex.paid_at ? "0" : "1"} />
                  <button
                    disabled={!canEditAccounting}
                    className={`rounded-full px-3 py-1 text-xs font-semibold ${annex.paid_at ? "bg-success-subtle text-success" : "bg-warning-subtle text-warning"}`}
                  >
                    {annex.paid_at ? `✓ ${t("paidOn", { date: fmtDay(annex.paid_at) })}` : t("markPaid")}
                  </button>
                </form>
                <a
                  href={`/api/pdf/annex/${annex.id}`}
                  target="_blank"
                  className="flex items-center gap-1 rounded-md border border-hairline bg-surface px-2 py-1 text-xs transition-colors hover:bg-subtle"
                >
                  <Printer size={13} strokeWidth={1.5} /> PDF
                </a>
                {canEditAccounting && (
                  <form action={removeAnnex}>
                    <input type="hidden" name="id" value={annex.id} />
                    <button title={t("deleteAnnex")} className="rounded p-1 text-danger hover:bg-danger-subtle">
                      <Trash2 size={13} strokeWidth={1.5} />
                    </button>
                  </form>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
