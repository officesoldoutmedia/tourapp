"use client";

/**
 * Administrarea „Parties" per tur: listă + adăugare + editare diurnă +
 * ștergere. Pattern clonat din `a/[artistSlug]/profile/parties-client.tsx`
 * (Task 3), dar pe acțiunile de tur din `parties-actions.ts` și cu edit
 * in-place per rând (spre deosebire de template-ul de artist, care nu are
 * editare — aici e cerută explicit). Fără reorder — tour_parties nu are
 * o acțiune de mutare.
 */
import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Check, Pencil, Trash2, X } from "lucide-react";
import { toast } from "@/components/ui/Toaster";
import { deleteTourParty, saveTourParty } from "./parties-actions";

export interface TourPartyData {
  id: string;
  name: string;
  per_diem_rate: number | null;
  per_diem_currency: string | null;
}

const CURRENCIES = ["EUR", "RON", "USD", "GBP"];

export function TourParties({
  orgSlug,
  tourId,
  parties,
}: {
  orgSlug: string;
  tourId: string;
  parties: TourPartyData[];
}) {
  const t = useTranslations("personnel");
  const tc = useTranslations("common");
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState("");
  const [rate, setRate] = useState("");
  const [currency, setCurrency] = useState(CURRENCIES[0]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editRate, setEditRate] = useState("");
  const [editCurrency, setEditCurrency] = useState(CURRENCIES[0]);

  const inputCls =
    "h-8 rounded-[8px] border border-hairline bg-inset px-2.5 text-[12.5px] text-primary outline-none";
  const iconBtn =
    "flex h-7 w-7 items-center justify-center rounded-[6px] text-secondary transition-colors hover:bg-fill-control-hover hover:text-primary disabled:opacity-50";

  function addParty() {
    if (!name.trim()) return;
    startTransition(async () => {
      const result = await saveTourParty(orgSlug, tourId, {
        name,
        perDiemRate: rate.trim() ? Number(rate) : null,
        perDiemCurrency: currency,
      });
      if (result?.error) {
        toast(tc("error"), "danger");
        return;
      }
      setName("");
      setRate("");
    });
  }

  function startEdit(p: TourPartyData) {
    setEditingId(p.id);
    setEditName(p.name);
    setEditRate(p.per_diem_rate != null ? String(p.per_diem_rate) : "");
    setEditCurrency(p.per_diem_currency ?? CURRENCIES[0]);
  }

  function saveEdit(id: string) {
    if (!editName.trim()) return;
    startTransition(async () => {
      const result = await saveTourParty(orgSlug, tourId, {
        id,
        name: editName,
        perDiemRate: editRate.trim() ? Number(editRate) : null,
        perDiemCurrency: editCurrency,
      });
      if (result?.error) {
        toast(tc("error"), "danger");
        return;
      }
      setEditingId(null);
    });
  }

  function remove(id: string) {
    if (!window.confirm(`${tc("delete")}?`)) return;
    startTransition(async () => {
      const result = await deleteTourParty(orgSlug, tourId, id);
      if (result?.error) toast(tc("error"), "danger");
    });
  }

  return (
    <div className="mb-4 rounded-[12px] border border-hairline bg-surface p-3">
      <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-tertiary">
        {t("partiesTitle")}
      </h3>

      {parties.length === 0 ? (
        <p className="py-2 text-[12px] text-tertiary">{t("noParty")}</p>
      ) : (
        <ul className="divide-y divide-faint">
          {parties.map((p) =>
            editingId === p.id ? (
              <li key={p.id} className="flex flex-wrap items-center gap-2 py-2">
                <input
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className={`${inputCls} w-40`}
                  autoFocus
                />
                <input
                  value={editRate}
                  onChange={(e) => setEditRate(e.target.value)}
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder={t("perDiem")}
                  className={`${inputCls} w-24`}
                />
                <select
                  value={editCurrency}
                  onChange={(e) => setEditCurrency(e.target.value)}
                  className={inputCls}
                >
                  {CURRENCIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  disabled={pending || !editName.trim()}
                  onClick={() => saveEdit(p.id)}
                  title={tc("save")}
                  className={iconBtn}
                >
                  <Check size={14} strokeWidth={1.75} />
                </button>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => setEditingId(null)}
                  title={tc("cancel")}
                  className={iconBtn}
                >
                  <X size={14} strokeWidth={1.75} />
                </button>
              </li>
            ) : (
              <li key={p.id} className="flex items-center gap-2 py-2">
                <span
                  className="min-w-0 flex-1 truncate text-[12.5px] text-primary"
                  title={p.name}
                >
                  {p.name}
                </span>
                <span className="font-mono text-[11.5px] text-tertiary">
                  {p.per_diem_rate != null
                    ? `${p.per_diem_rate} ${p.per_diem_currency ?? ""}`
                    : "—"}
                </span>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => startEdit(p)}
                  aria-label="Edit"
                  className={iconBtn}
                >
                  <Pencil size={13} strokeWidth={1.75} />
                </button>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => remove(p.id)}
                  title={tc("delete")}
                  className={`${iconBtn} hover:bg-danger-subtle hover:text-danger`}
                >
                  <Trash2 size={13} strokeWidth={1.75} />
                </button>
              </li>
            ),
          )}
        </ul>
      )}

      <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-faint pt-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t("partyLabel")}
          className={`${inputCls} w-40`}
        />
        <input
          value={rate}
          onChange={(e) => setRate(e.target.value)}
          type="number"
          step="0.01"
          min="0"
          placeholder={t("perDiem")}
          className={`${inputCls} w-24`}
        />
        <select value={currency} onChange={(e) => setCurrency(e.target.value)} className={inputCls}>
          {CURRENCIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <button
          type="button"
          disabled={pending || !name.trim()}
          onClick={addParty}
          className="btn-quiet h-8 disabled:opacity-50"
        >
          {t("addParty")}
        </button>
      </div>
    </div>
  );
}
