import Link from "next/link";
import { notFound } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { Trash2, Printer } from "lucide-react";
import { requireOrg } from "@/lib/org";
import { can } from "@/lib/permissions";
import { computeShowProfit, convertCostLines, formatMoney } from "@/lib/showFinance";

/**
 * Costuri & profit per show (cererea lui Ștefan): echipa SELECTATĂ per
 * show (nu tot crew-ul merge la fiecare), costuri extra, comision de
 * booking (default pe tur, override pe show), fișă de costuri PDF.
 * Vizibil doar admin/accounting — ca Accounting-ul.
 */
export default async function ShowCostsPage({
  params,
}: {
  params: Promise<{ orgSlug: string; tourId: string; date: string; eventId: string }>;
}) {
  const { orgSlug, tourId, date, eventId } = await params;
  const { supabase, permission, tier } = await requireOrg(orgSlug);
  const t = await getTranslations("showCosts");
  const tc = await getTranslations("common");
  if (!can({ tier, permission }, "view_accounting")) notFound();
  const canEdit = can({ tier, permission }, "edit_accounting");

  const [{ data: event }, { data: finance }, { data: costs }, { data: crew }, { data: tour }] =
    await Promise.all([
      supabase
        .from("events")
        .select("id, title, venues(name)")
        .eq("id", eventId)
        .is("deleted_at", null)
        .maybeSingle(),
      supabase.from("show_finances").select("*").eq("event_id", eventId).maybeSingle(),
      supabase
        .from("show_costs")
        .select("id, kind, label, payment_type, amount, currency, personnel_id")
        .eq("event_id", eventId)
        .is("deleted_at", null)
        .order("kind")
        .order("sort_order")
        .order("created_at"),
      supabase
        .from("tour_personnel")
        .select("id, first_name, last_name, role, cost_per_show, cost_currency, payment_type")
        .eq("tour_id", tourId)
        .is("deleted_at", null)
        .order("last_name"),
      supabase.from("tours").select("booking_percent").eq("id", tourId).maybeSingle(),
    ]);
  if (!event) notFound();

  const path = `/o/${orgSlug}/t/${tourId}/d/${date}/e/${eventId}/costs`;
  const currency = finance?.fee_currency ?? "RON";
  const bookingPercent = finance?.booking_percent ?? tour?.booking_percent ?? 0;
  const onShow = new Set((costs ?? []).filter((c) => c.personnel_id).map((c) => c.personnel_id));

  async function saveFinance(formData: FormData) {
    "use server";
    const { supabase, user } = await requireOrg(orgSlug);
    const row = {
      event_id: eventId,
      fee: Number(formData.get("fee")) || null,
      fee_currency: String(formData.get("currency") ?? "RON").trim().toUpperCase() || "RON",
      booking_percent:
        formData.get("bookingPercent") === "" ? null : Number(formData.get("bookingPercent")),
      fx_rates: Object.fromEntries(
        [...formData.entries()]
          .filter(([k, v]) => k.startsWith("fx_") && Number(v) > 0)
          .map(([k, v]) => [k.slice(3), Number(v)]),
      ),
      updated_by: user.id,
    };
    await supabase.from("show_finances").upsert(row, { onConflict: "event_id" });
    revalidatePath(path);
  }

  async function toggleCrew(formData: FormData) {
    "use server";
    const { supabase, user } = await requireOrg(orgSlug);
    const personnelId = String(formData.get("personnelId"));
    const { data: existing } = await supabase
      .from("show_costs")
      .select("id")
      .eq("event_id", eventId)
      .eq("personnel_id", personnelId)
      .is("deleted_at", null)
      .maybeSingle();
    if (existing) {
      await supabase
        .from("show_costs")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", existing.id);
    } else {
      const { data: person } = await supabase
        .from("tour_personnel")
        .select("first_name, last_name, role, cost_per_show, cost_currency, payment_type")
        .eq("id", personnelId)
        .maybeSingle();
      if (!person) return;
      await supabase.from("show_costs").insert({
        event_id: eventId,
        kind: "crew",
        personnel_id: personnelId,
        label:
          [person.first_name, person.last_name].filter(Boolean).join(" ") +
          (person.role ? ` — ${person.role}` : ""),
        amount: person.cost_per_show ?? 0,
        currency: person.cost_currency ?? "RON",
        payment_type: person.payment_type,
        updated_by: user.id,
      });
    }
    revalidatePath(path);
  }

  async function saveCost(formData: FormData) {
    "use server";
    const { supabase, user } = await requireOrg(orgSlug);
    const id = String(formData.get("id") ?? "");
    const row = {
      label: String(formData.get("label") ?? "").trim(),
      amount: Number(formData.get("amount")) || 0,
      payment_type: String(formData.get("paymentType") ?? "") || null,
      updated_by: user.id,
    };
    if (!row.label) return;
    if (id) await supabase.from("show_costs").update(row).eq("id", id);
    else await supabase.from("show_costs").insert({ ...row, event_id: eventId, kind: "extra" });
    revalidatePath(path);
  }

  async function removeCost(formData: FormData) {
    "use server";
    const { supabase } = await requireOrg(orgSlug);
    await supabase
      .from("show_costs")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", String(formData.get("id")));
    revalidatePath(path);
  }

  const fxRates = (finance?.fx_rates ?? {}) as Record<string, number>;
  const conversion = convertCostLines(
    (costs ?? []).map((c) => ({
      kind: c.kind as "crew" | "extra",
      label: c.label,
      amount: Number(c.amount),
      currency: c.currency,
    })),
    currency,
    fxRates,
  );
  const foreignCurrencies = [
    ...new Set((costs ?? []).map((c) => c.currency).filter((c) => c !== currency)),
  ];
  const result = computeShowProfit({
    fee: Number(finance?.fee ?? 0),
    bookingPercent: Number(bookingPercent),
    costs: conversion.lines,
  });

  const input = "rounded border border-hairline px-2 py-1 text-sm";
  const paymentOptions = (
    <>
      <option value="">—</option>
      <option value="company">{t("company")}</option>
      <option value="individual">{t("individual")}</option>
    </>
  );

  return (
    <main className="mx-auto w-full max-w-3xl space-y-6 p-6">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <Link
            href={`/o/${orgSlug}/t/${tourId}/d/${date}/e/${eventId}`}
            className="text-xs text-secondary hover:underline"
          >
            ← {event.title ?? (event.venues as unknown as { name: string } | null)?.name}
          </Link>
          <h1 className="font-display text-xl font-semibold tracking-tight">{t("title")}</h1>
        </div>
        <a
          href={`/api/pdf/costsheet/${eventId}`}
          target="_blank"
          className="flex items-center gap-1.5 rounded-md border border-hairline bg-surface px-3 py-1.5 text-sm shadow-xs transition-colors hover:bg-subtle"
        >
          <Printer size={15} strokeWidth={1.5} /> {t("costSheetPdf")}
        </a>
      </header>

      {/* fee + booking % */}
      <form
        action={saveFinance}
        className="flex flex-wrap items-end gap-3 rounded-lg border border-hairline bg-surface p-4 shadow-xs"
      >
        <label className="space-y-1 text-xs font-semibold uppercase tracking-wider text-secondary">
          {t("fee")}
          <input name="fee" type="number" step="0.01" defaultValue={finance?.fee ?? ""} disabled={!canEdit} className={`${input} block w-32 font-mono`} />
        </label>
        <label className="space-y-1 text-xs font-semibold uppercase tracking-wider text-secondary">
          {t("currency")}
          <input name="currency" defaultValue={currency} disabled={!canEdit} className={`${input} block w-20 font-mono uppercase`} />
        </label>
        <label className="space-y-1 text-xs font-semibold uppercase tracking-wider text-secondary">
          {t("bookingPercent")}
          <input
            name="bookingPercent"
            type="number"
            step="0.1"
            min="0"
            max="100"
            defaultValue={finance?.booking_percent ?? ""}
            placeholder={tour?.booking_percent != null ? `${tour.booking_percent} (${t("tourDefault")})` : ""}
            disabled={!canEdit}
            className={`${input} block w-36 font-mono`}
          />
        </label>
        {foreignCurrencies.map((ccy) => (
          <label key={ccy} className="space-y-1 text-xs font-semibold uppercase tracking-wider text-secondary">
            1 {ccy} =
            <span className="flex items-center gap-1">
              <input
                name={`fx_${ccy}`}
                type="number"
                step="0.0001"
                min="0"
                defaultValue={fxRates[ccy] ?? ""}
                placeholder={t("fxPlaceholder")}
                disabled={!canEdit}
                className={`${input} block w-24 font-mono`}
              />
              <span className="font-mono text-tertiary">{currency}</span>
            </span>
          </label>
        ))}
        {canEdit && (
          <button className="rounded bg-accent hover:bg-accent-hover px-4 py-1.5 text-sm font-medium text-white">
            {tc("save")}
          </button>
        )}
        {conversion.missing.length > 0 && (
          <p className="w-full text-xs font-medium text-warning">
            {t("fxMissing", { currencies: conversion.missing.join(", ") })}
          </p>
        )}
      </form>

      {/* echipa show-ului: selectezi cine merge la ACEST show */}
      <section className="rounded-lg border border-hairline bg-surface p-4 shadow-xs">
        <h2 className="mb-1 font-display text-lg font-semibold tracking-tight">{t("crewTitle")}</h2>
        <p className="mb-3 text-xs text-tertiary">{t("crewHint")}</p>
        {(crew ?? []).length === 0 ? (
          <p className="text-sm text-tertiary">
            {t("noCrew")}{" "}
            <Link href={`/o/${orgSlug}/t/${tourId}/personnel`} className="text-accent hover:underline">
              {t("goPersonnel")}
            </Link>
          </p>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {(crew ?? []).map((person) => {
              const name = [person.first_name, person.last_name].filter(Boolean).join(" ");
              const selected = onShow.has(person.id);
              return (
                <li key={person.id}>
                  <form action={toggleCrew}>
                    <input type="hidden" name="personnelId" value={person.id} />
                    <button
                      disabled={!canEdit}
                      className={`rounded-full border px-3 py-1.5 text-sm transition-colors ${
                        selected
                          ? "border-accent bg-accent-subtle font-medium text-accent"
                          : "border-hairline text-secondary hover:bg-subtle"
                      }`}
                    >
                      {selected ? "✓ " : "+ "}
                      {name}
                      {person.cost_per_show != null && (
                        <span className="ml-1.5 font-mono text-xs opacity-70">
                          {formatMoney(Number(person.cost_per_show), person.cost_currency ?? "RON")}
                        </span>
                      )}
                    </button>
                  </form>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* liniile de cost */}
      <section className="rounded-lg border border-hairline bg-surface p-4 shadow-xs">
        <h2 className="mb-3 font-display text-lg font-semibold tracking-tight">{t("costsTitle")}</h2>
        {(costs ?? []).length === 0 && (
          <p className="text-sm text-tertiary">{t("noCosts")}</p>
        )}
        <ul className="divide-y divide-hairline">
          {(costs ?? []).map((cost) => (
            <li key={cost.id} className="py-1.5">
              <form action={saveCost} className="flex flex-wrap items-center gap-2">
                <input type="hidden" name="id" value={cost.id} />
                <span
                  className={`w-14 shrink-0 rounded-full px-2 py-0.5 text-center text-[10px] font-bold uppercase ${
                    cost.kind === "crew" ? "bg-accent-subtle text-accent" : "bg-subtle text-secondary"
                  }`}
                >
                  {cost.kind === "crew" ? t("kindCrew") : t("kindExtra")}
                </span>
                <input name="label" defaultValue={cost.label} disabled={!canEdit} className={`${input} min-w-40 flex-1`} />
                <select name="paymentType" defaultValue={cost.payment_type ?? ""} disabled={!canEdit} className={input}>
                  {paymentOptions}
                </select>
                <input name="amount" type="number" step="0.01" defaultValue={cost.amount} disabled={!canEdit} className={`${input} w-28 text-right font-mono`} />
                <span className={`font-mono text-xs ${cost.currency !== currency && !fxRates[cost.currency] ? "font-semibold text-warning" : "text-tertiary"}`}>
                  {cost.currency}
                  {cost.currency !== currency && fxRates[cost.currency] > 0 && (
                    <span className="ml-1 text-tertiary">
                      ≈ {formatMoney(Math.round(Number(cost.amount) * fxRates[cost.currency] * 100) / 100, currency)}
                    </span>
                  )}
                </span>
                {canEdit && (
                  <>
                    <button title={tc("save")} className="rounded px-2 py-1 text-xs text-accent hover:bg-accent-subtle">✓</button>
                    <button formAction={removeCost} title={tc("delete")} className="rounded p-1 text-danger hover:bg-danger-subtle">
                      <Trash2 size={13} strokeWidth={1.5} />
                    </button>
                  </>
                )}
              </form>
            </li>
          ))}
        </ul>

        {canEdit && (
          <form action={saveCost} className="mt-3 flex flex-wrap items-center gap-2 border-t border-hairline pt-3">
            <input name="label" required placeholder={t("extraPlaceholder")} className={`${input} min-w-40 flex-1`} />
            <select name="paymentType" defaultValue="" className={input}>
              {paymentOptions}
            </select>
            <input name="amount" type="number" step="0.01" placeholder="0.00" className={`${input} w-28 text-right font-mono`} />
            <button className="rounded bg-accent hover:bg-accent-hover px-3 py-1 text-sm font-medium text-white">
              + {t("addExtra")}
            </button>
          </form>
        )}
      </section>

      {/* totaluri + profit */}
      <section className="rounded-lg border border-hairline bg-surface p-4 shadow-xs">
        <dl className="space-y-1.5 text-sm">
          <div className="flex justify-between">
            <dt className="text-secondary">{t("fee")}</dt>
            <dd className="font-mono">{formatMoney(result.fee, currency)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-secondary">
              {t("bookingCommission")} ({result.bookingPercent}%)
            </dt>
            <dd className="font-mono text-danger">−{formatMoney(result.bookingFee, currency)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-secondary">{t("crewTotal")}</dt>
            <dd className="font-mono text-danger">−{formatMoney(result.crewTotal, currency)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-secondary">{t("extraTotal")}</dt>
            <dd className="font-mono text-danger">−{formatMoney(result.extraTotal, currency)}</dd>
          </div>
          <div className="flex justify-between border-t border-hairline pt-2 font-medium">
            <dt className="text-secondary">{t("totalCosts")}</dt>
            <dd className="font-mono">−{formatMoney(result.totalCosts, currency)}</dd>
          </div>
          <div className="flex justify-between border-t border-hairline pt-2 text-base font-semibold">
            <dt>{t("profit")}</dt>
            <dd className={`font-mono ${result.profit < 0 ? "text-danger" : "text-success"}`}>
              {formatMoney(result.profit, currency)}
            </dd>
          </div>
        </dl>
      </section>
    </main>
  );
}
