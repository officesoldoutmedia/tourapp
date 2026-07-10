"use client";

/**
 * Inventarul turului (Graphite) — listă de articole cu categorie,
 * cantitate, proveniență și asignare per show (expandabil sub rând).
 */
import { useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { CalendarCheck2, ChevronDown, Pencil, Trash2, X } from "lucide-react";
import { toast } from "@/components/ui/Toaster";
import {
  addGear,
  updateGear,
  deleteGear,
  toggleGearShow,
} from "./gear-actions";

export interface GearItem {
  id: string;
  name: string;
  notes: string | null;
  category: string;
  quantity: number;
  provider: string;
  showIds: string[];
}

export interface GearShow {
  eventId: string;
  date: string;
  city: string | null;
  title: string;
}

const CATEGORIES = ["backline", "lights", "video", "other"] as const;
const PROVIDERS = ["own", "venue", "rented"] as const;

function GearForm({
  item,
  onSubmit,
  onCancel,
  pending,
}: {
  item: GearItem | null;
  onSubmit: (formData: FormData) => void;
  onCancel?: () => void;
  pending: boolean;
}) {
  const t = useTranslations("gear");
  return (
    <form
      action={onSubmit}
      className="flex flex-wrap items-center gap-2"
    >
      <input
        name="name"
        required
        defaultValue={item?.name ?? ""}
        placeholder={t("name")}
        className="h-9 w-52 rounded-[8px] border border-hairline bg-fill-control px-3 text-sm"
      />
      <select
        name="category"
        defaultValue={item?.category ?? "backline"}
        className="h-9 rounded-[8px] border border-hairline bg-fill-control px-2 text-sm"
      >
        {CATEGORIES.map((c) => (
          <option key={c} value={c}>
            {t(`cat_${c}`)}
          </option>
        ))}
      </select>
      <input
        name="quantity"
        type="number"
        min={1}
        defaultValue={item?.quantity ?? 1}
        title={t("quantity")}
        className="h-9 w-16 rounded-[8px] border border-hairline bg-fill-control px-2 text-center font-mono text-sm"
      />
      <select
        name="provider"
        defaultValue={item?.provider ?? "own"}
        className="h-9 rounded-[8px] border border-hairline bg-fill-control px-2 text-sm"
      >
        {PROVIDERS.map((p) => (
          <option key={p} value={p}>
            {t(`prov_${p}`)}
          </option>
        ))}
      </select>
      <input
        name="notes"
        defaultValue={item?.notes ?? ""}
        placeholder={t("notes")}
        className="h-9 min-w-40 flex-1 rounded-[8px] border border-hairline bg-fill-control px-3 text-sm"
      />
      <button disabled={pending} className="btn-primary h-9">
        {item ? t("save") : `+ ${t("add")}`}
      </button>
      {onCancel && (
        <button type="button" onClick={onCancel} className="btn-quiet h-9">
          {t("cancel")}
        </button>
      )}
    </form>
  );
}

export function GearList({
  orgSlug,
  tourId,
  items,
  shows,
  canEdit,
}: {
  orgSlug: string;
  tourId: string;
  items: GearItem[];
  shows: GearShow[];
  canEdit: boolean;
}) {
  const t = useTranslations("gear");
  const locale = useLocale();
  const [pending, startTransition] = useTransition();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [openShows, setOpenShows] = useState<string | null>(null);

  const dateFmt = new Intl.DateTimeFormat(locale, { day: "numeric", month: "short" });

  function submitAdd(formData: FormData) {
    startTransition(async () => {
      await addGear(orgSlug, tourId, formData);
      toast(t("addedToast"));
    });
  }

  function submitUpdate(gearId: string, formData: FormData) {
    startTransition(async () => {
      await updateGear(orgSlug, tourId, gearId, formData);
      setEditingId(null);
    });
  }

  return (
    <div className="space-y-4">
      {items.length === 0 ? (
        <p className="rounded-[12px] border border-hairline bg-surface px-4 py-8 text-center text-[12px] text-tertiary">
          {t("empty")}
        </p>
      ) : (
        <ul className="divide-y divide-hairline rounded-[12px] border border-hairline bg-surface">
          {items.map((item) => (
            <li key={item.id}>
              {editingId === item.id ? (
                <div className="px-4 py-3">
                  <GearForm
                    item={item}
                    pending={pending}
                    onSubmit={(fd) => submitUpdate(item.id, fd)}
                    onCancel={() => setEditingId(null)}
                  />
                </div>
              ) : (
                <div className="grid min-h-12 grid-cols-[minmax(0,1.4fr)_110px_50px_90px_minmax(0,1fr)_auto] items-center gap-2 px-4 py-2">
                  <span className="truncate text-[13px] font-medium text-primary" title={item.name}>
                    {item.name}
                  </span>
                  <span className="text-[11.5px] text-secondary">{t(`cat_${item.category}`)}</span>
                  <span className="text-center font-mono text-[12px] text-secondary">
                    ×{item.quantity}
                  </span>
                  <span className="text-[11.5px] text-secondary">{t(`prov_${item.provider}`)}</span>
                  <span className="truncate text-[11.5px] text-tertiary" title={item.notes ?? ""}>
                    {item.notes}
                  </span>
                  <span className="flex items-center gap-1">
                    {shows.length > 0 && (
                      <button
                        onClick={() => setOpenShows(openShows === item.id ? null : item.id)}
                        className={`flex h-7 items-center gap-1.5 rounded-[6px] px-2 text-[11px] transition-colors ${openShows === item.id ? "bg-fill-segment-active text-primary" : "text-secondary hover:bg-fill-control-hover hover:text-primary"}`}
                        title={t("showsTitle")}
                      >
                        <CalendarCheck2 size={13} strokeWidth={1.75} />
                        <span className="font-mono">
                          {item.showIds.length}/{shows.length}
                        </span>
                        <ChevronDown
                          size={11}
                          strokeWidth={2}
                          className={`transition-transform ${openShows === item.id ? "rotate-180" : ""}`}
                        />
                      </button>
                    )}
                    {canEdit && (
                      <>
                        <button
                          disabled={pending}
                          onClick={() => setEditingId(item.id)}
                          title={t("edit")}
                          className="flex h-7 w-7 items-center justify-center rounded-[6px] text-secondary transition-colors hover:bg-fill-control-hover hover:text-primary"
                        >
                          <Pencil size={13} strokeWidth={1.75} />
                        </button>
                        <button
                          disabled={pending}
                          onClick={() =>
                            startTransition(async () => {
                              await deleteGear(orgSlug, tourId, item.id);
                              toast(t("deletedToast"));
                            })
                          }
                          title={t("delete")}
                          className="flex h-7 w-7 items-center justify-center rounded-[6px] text-secondary transition-colors hover:bg-danger-subtle hover:text-danger"
                        >
                          <Trash2 size={13} strokeWidth={1.75} />
                        </button>
                      </>
                    )}
                  </span>
                </div>
              )}

              {/* asignare per show */}
              {openShows === item.id && (
                <div className="border-t border-hairline bg-inset/50 px-4 py-3">
                  <div className="mb-2 flex items-center justify-between">
                    <p className="eyebrow">{t("showsTitle")}</p>
                    <button
                      onClick={() => setOpenShows(null)}
                      className="flex h-5 w-5 items-center justify-center rounded text-tertiary hover:text-primary"
                    >
                      <X size={12} strokeWidth={2} />
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {shows.map((show) => {
                      const assigned = item.showIds.includes(show.eventId);
                      return (
                        <button
                          key={show.eventId}
                          disabled={pending || !canEdit}
                          onClick={() =>
                            startTransition(async () => {
                              await toggleGearShow(
                                orgSlug,
                                tourId,
                                item.id,
                                show.eventId,
                                !assigned,
                              );
                            })
                          }
                          className={`rounded-full border px-2.5 py-1 text-[11px] transition-colors ${
                            assigned
                              ? "border-transparent bg-fill-segment-active text-primary"
                              : "border-hairline text-secondary hover:text-primary"
                          }`}
                        >
                          {dateFmt.format(new Date(`${show.date}T00:00:00`))}
                          {show.city ? ` · ${show.city}` : ""}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {canEdit && <GearForm item={null} pending={pending} onSubmit={submitAdd} />}
    </div>
  );
}
