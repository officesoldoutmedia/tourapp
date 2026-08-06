"use client";

/**
 * Travel parties (template la nivel de artist): grupuri cu diurnă per
 * persoană per zi, copiate ca snapshot în fiecare tur/show nou (SP3a).
 * Pattern clonat din `access/files-client.tsx` (listă + useTransition +
 * toast) — ștergere confirmată nativ ca în `form.tsx` (toggleArchive).
 */
import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { ChevronDown, ChevronUp, Trash2 } from "lucide-react";
import { toast } from "@/components/ui/Toaster";
import { deleteArtistParty, moveArtistParty, saveArtistParty } from "./actions";

export interface ArtistPartyData {
  id: string;
  name: string;
  per_diem_rate: number | null;
  per_diem_currency: string | null;
}

export function ArtistParties({
  orgSlug,
  artistSlug,
  artistId,
  currencies,
  parties,
}: {
  orgSlug: string;
  artistSlug: string;
  artistId: string;
  currencies: string[];
  parties: ArtistPartyData[];
}) {
  const t = useTranslations("artist");
  const tc = useTranslations("common");
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState("");
  const [rate, setRate] = useState("");
  const [currency, setCurrency] = useState(currencies[0] ?? "EUR");

  const inputCls =
    "h-9 w-full rounded-[8px] border border-hairline bg-inset px-3 text-[13px] text-primary outline-none";

  function addParty() {
    if (!name.trim()) return;
    startTransition(async () => {
      const result = await saveArtistParty(orgSlug, artistSlug, artistId, {
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

  function remove(id: string) {
    if (!window.confirm(`${t("deleteParty")}?`)) return;
    startTransition(async () => {
      const result = await deleteArtistParty(orgSlug, artistSlug, id);
      if (result?.error) toast(tc("error"), "danger");
    });
  }

  function move(id: string, direction: "up" | "down") {
    startTransition(async () => {
      const result = await moveArtistParty(orgSlug, artistSlug, id, direction);
      if (result?.error) toast(tc("error"), "danger");
    });
  }

  return (
    <div className="space-y-3">
      {parties.length === 0 ? (
        <p className="rounded-[12px] border border-hairline bg-surface px-4 py-8 text-center text-[12px] text-tertiary">
          {t("noParties")}
        </p>
      ) : (
        <ul className="divide-y divide-hairline rounded-[12px] border border-hairline bg-surface">
          {parties.map((p, i) => (
            <li
              key={p.id}
              className="grid h-12 grid-cols-[minmax(0,1fr)_140px_auto] items-center gap-2 px-3"
            >
              <span className="truncate text-[12.5px] text-primary" title={p.name}>
                {p.name}
              </span>
              <span className="text-right font-mono text-[11.5px] text-tertiary">
                {p.per_diem_rate != null
                  ? `${p.per_diem_rate} ${p.per_diem_currency ?? ""}`
                  : "—"}
              </span>
              <span className="flex items-center gap-1">
                <button
                  type="button"
                  disabled={pending || i === 0}
                  onClick={() => move(p.id, "up")}
                  aria-label="Move up"
                  className="flex h-7 w-7 items-center justify-center rounded-[6px] text-secondary transition-colors hover:bg-fill-control-hover hover:text-primary disabled:opacity-30"
                >
                  <ChevronUp size={14} strokeWidth={1.75} />
                </button>
                <button
                  type="button"
                  disabled={pending || i === parties.length - 1}
                  onClick={() => move(p.id, "down")}
                  aria-label="Move down"
                  className="flex h-7 w-7 items-center justify-center rounded-[6px] text-secondary transition-colors hover:bg-fill-control-hover hover:text-primary disabled:opacity-30"
                >
                  <ChevronDown size={14} strokeWidth={1.75} />
                </button>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => remove(p.id)}
                  title={t("deleteParty")}
                  className="flex h-7 w-7 items-center justify-center rounded-[6px] text-secondary transition-colors hover:bg-danger-subtle hover:text-danger"
                >
                  <Trash2 size={14} strokeWidth={1.75} />
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}

      <div className="grid grid-cols-[minmax(0,1fr)_100px_90px_auto] items-center gap-2 rounded-[12px] border border-hairline bg-surface p-3">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t("partyName")}
          className={inputCls}
        />
        <input
          value={rate}
          onChange={(e) => setRate(e.target.value)}
          type="number"
          step="0.01"
          min="0"
          placeholder={t("perDiem")}
          className={inputCls}
        />
        <select
          value={currency}
          onChange={(e) => setCurrency(e.target.value)}
          className={inputCls}
        >
          {currencies.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <button
          type="button"
          disabled={pending || !name.trim()}
          onClick={addParty}
          className="btn-quiet h-9 disabled:opacity-50"
        >
          {t("addParty")}
        </button>
      </div>
    </div>
  );
}
