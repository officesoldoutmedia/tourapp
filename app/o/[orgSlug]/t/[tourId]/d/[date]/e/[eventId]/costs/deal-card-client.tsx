"use client";

/**
 * Cardul „Deal" pe Costs & profit (C1, task 5). Aplică un deal template pe
 * event via `applyDealToEvent` (Task 4) — server action apelată direct din
 * client (nu revalidează căi, deci facem `router.refresh()` noi după
 * succes). Pe conflict de fee (fee introdus manual ≠ fee-ul template-ului)
 * cerem confirmare și re-apelăm cu `overwriteFee: true` — precedent
 * `window.confirm` ca în `profile/form.tsx`.
 *
 * Fără snapshot: doar select + „Aplică" (dacă poate edita). Cu snapshot:
 * card informativ (nume, basis, reținere, landed items ca pastile, cazare
 * compactă) — select-ul + „Re-aplică" apar doar pentru `canEdit`, altfel
 * cardul rămâne strict informativ (nimic de selectat).
 */
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { applyDealToEvent } from "@/app/o/[orgSlug]/events/apply-deal";
import type { DealSnapshot } from "@/lib/dealSnapshot";

export interface DealTemplateOption {
  id: string;
  name: string;
}

const selectCls = "rounded border border-hairline px-2 py-1 text-sm";

function accommodationSummary(
  acc: DealSnapshot["accommodation"],
  nightsLabel: string,
): string | null {
  const parts: string[] = [];
  if (acc.rooms_single) parts.push(`${acc.rooms_single}×single`);
  if (acc.rooms_double) parts.push(`${acc.rooms_double}×double`);
  if (acc.category) parts.push(acc.category);
  if (acc.nights) parts.push(`${acc.nights} ${nightsLabel.toLowerCase()}`);
  return parts.length > 0 ? parts.join(" · ") : null;
}

export function DealCard({
  orgSlug,
  eventId,
  templates,
  snapshot,
  currentTemplateId,
  canEdit,
  dayPath: _dayPath,
}: {
  orgSlug: string;
  eventId: string;
  templates: DealTemplateOption[];
  snapshot: DealSnapshot | null;
  currentTemplateId: string | null;
  canEdit: boolean;
  dayPath: string;
}) {
  const t = useTranslations("showCosts");
  const td = useTranslations("deals");
  const router = useRouter();
  const [selected, setSelected] = useState(currentTemplateId ?? templates[0]?.id ?? "");
  const [pending, startTransition] = useTransition();

  function apply(overwriteFee: boolean) {
    if (!selected) return;
    startTransition(async () => {
      const result = await applyDealToEvent(orgSlug, eventId, selected, { overwriteFee });
      if (result?.feeConflict) {
        if (window.confirm(t("dealFeeConfirm"))) apply(true);
        return;
      }
      if (!result?.error) router.refresh();
    });
  }

  const accommodationText = snapshot
    ? accommodationSummary(snapshot.accommodation, td("nights"))
    : null;

  function basisLabel(basis: string | null): string {
    if (basis === "landed") return t("dealBasisLanded");
    if (basis === "all_in") return t("dealBasisAllIn");
    if (basis === "fee_plus_costs") return t("dealBasisFeePlusCosts");
    return "—";
  }

  return (
    <section className="rounded-[12px] border border-hairline bg-surface p-4">
      <h2 className="mb-3 font-display text-lg font-semibold tracking-tight">{t("dealTitle")}</h2>

      {snapshot ? (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium">{snapshot.name}</span>
            {snapshot.deal_basis && (
              <span className="rounded-full bg-fill-control px-2 py-0.5 text-xs text-secondary">
                {basisLabel(snapshot.deal_basis)}
              </span>
            )}
            {snapshot.withholding_percent != null && (
              <span className="font-mono text-xs text-tertiary">
                {t("dealWithholding", { p: snapshot.withholding_percent })}
              </span>
            )}
          </div>

          {snapshot.landed_items.length > 0 && (
            <div className="space-y-1">
              <p className="text-xs font-semibold uppercase tracking-wider text-secondary">
                {t("dealLanded")}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {snapshot.landed_items.map((item) => (
                  <span
                    key={item}
                    className="rounded-full bg-fill-control px-2.5 py-1 text-xs text-secondary"
                  >
                    {item}
                  </span>
                ))}
              </div>
            </div>
          )}

          {accommodationText && (
            <p className="text-xs text-tertiary">
              <span className="font-semibold uppercase tracking-wider text-secondary">
                {t("dealAccommodation")}:{" "}
              </span>
              {accommodationText}
            </p>
          )}

          {canEdit && templates.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 border-t border-hairline pt-3">
              <select
                value={selected}
                onChange={(e) => setSelected(e.target.value)}
                className={selectCls}
              >
                {templates.map((tpl) => (
                  <option key={tpl.id} value={tpl.id}>
                    {tpl.name}
                  </option>
                ))}
              </select>
              <button
                type="button"
                disabled={pending || !selected}
                onClick={() => apply(false)}
                className="btn-quiet h-8 px-3 text-sm disabled:opacity-50"
              >
                {t("dealReapply")}
              </button>
            </div>
          )}
        </div>
      ) : canEdit && templates.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
            className={selectCls}
          >
            <option value="">—</option>
            {templates.map((tpl) => (
              <option key={tpl.id} value={tpl.id}>
                {tpl.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={pending || !selected}
            onClick={() => apply(false)}
            className="btn-quiet h-8 px-3 text-sm disabled:opacity-50"
          >
            {t("dealApply")}
          </button>
        </div>
      ) : (
        <p className="text-sm text-tertiary">{t("dealNone")}</p>
      )}
    </section>
  );
}
