"use client";

/**
 * Deal templates (tab „Deals" pe artist): listă + CRUD + reordonare.
 * Pattern clonat din `profile/parties-client.tsx` (listă + useTransition +
 * toast) cu editare in-place ca-n `personnel/parties-client.tsx`
 * (Pencil/Check/X), dar formularul e mult mai mare (fee, basis, withholding,
 * landed items, cazare, categorii obligatorii) — expandat sub rând în loc de
 * inline, ca să rămână lizibil. Un al doilea formular identic, mereu
 * vizibil, servește la creare.
 */
import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { ChevronDown, ChevronUp, Pencil, Trash2, X } from "lucide-react";
import { toast } from "@/components/ui/Toaster";
import {
  deleteDealTemplate,
  moveDealTemplate,
  saveDealTemplate,
  type DealTemplateAccommodationInput,
  type DealTemplateInput,
} from "./actions";

export interface DealTemplateData {
  id: string;
  name: string;
  fee_amount: number | null;
  fee_currency: string | null;
  deal_basis: string | null;
  withholding_percent: number | null;
  landed_items: unknown;
  accommodation: unknown;
  required_category_ids: string[] | null;
  schedule_template_id: string | null;
}

export interface FileCategoryData {
  id: string;
  name: string;
}

export interface ScheduleTemplateData {
  id: string;
  name: string;
}

const NAME_SUGGESTIONS = ["Festival", "Club", "Private", "Corporate", "Showcase"];
const STANDARD_LANDED_ITEMS = [
  "SFX",
  "Pyro",
  "CO2",
  "Lasers",
  "Confetti",
  "Risers",
  "LED",
  "Backline",
  "Local crew",
];
const HOTEL_CATEGORIES = ["3★", "4★", "5★"];
const DEAL_BASIS_OPTIONS = ["landed", "all_in", "fee_plus_costs"] as const;

interface FormState {
  name: string;
  feeAmount: string;
  feeCurrency: string;
  dealBasis: string;
  withholdingPercent: string;
  landedItems: string[];
  roomsSingle: string;
  roomsDouble: string;
  nights: string;
  category: string;
  requiredCategoryIds: string[];
  scheduleTemplateId: string;
}

function emptyForm(currencies: string[], name = ""): FormState {
  return {
    name,
    feeAmount: "",
    feeCurrency: currencies[0] ?? "EUR",
    dealBasis: "",
    withholdingPercent: "",
    landedItems: [],
    roomsSingle: "",
    roomsDouble: "",
    nights: "",
    category: "",
    requiredCategoryIds: [],
    scheduleTemplateId: "",
  };
}

function formFromTemplate(
  tpl: DealTemplateData,
  currencies: string[],
  scheduleTemplates: ScheduleTemplateData[],
): FormState {
  const landed = Array.isArray(tpl.landed_items)
    ? tpl.landed_items.filter((x): x is string => typeof x === "string")
    : [];
  const acc =
    tpl.accommodation && typeof tpl.accommodation === "object" && !Array.isArray(tpl.accommodation)
      ? (tpl.accommodation as Record<string, unknown>)
      : {};
  return {
    name: tpl.name,
    feeAmount: tpl.fee_amount != null ? String(tpl.fee_amount) : "",
    feeCurrency: tpl.fee_currency || currencies[0] || "EUR",
    dealBasis: tpl.deal_basis ?? "",
    withholdingPercent: tpl.withholding_percent != null ? String(tpl.withholding_percent) : "",
    landedItems: landed,
    roomsSingle: typeof acc.rooms_single === "number" ? String(acc.rooms_single) : "",
    roomsDouble: typeof acc.rooms_double === "number" ? String(acc.rooms_double) : "",
    nights: typeof acc.nights === "number" ? String(acc.nights) : "",
    category: typeof acc.category === "string" ? acc.category : "",
    requiredCategoryIds: tpl.required_category_ids ?? [],
    // Un template de program șters între timp nu trebuie să round-tripeze
    // înapoi la salvare (ar bloca orice editare ulterioară a deal-ului) —
    // seedăm doar dacă id-ul mai există în lista live.
    scheduleTemplateId: scheduleTemplates.some((t) => t.id === tpl.schedule_template_id)
      ? (tpl.schedule_template_id ?? "")
      : "",
  };
}

function toPayload(id: string | undefined, form: FormState): DealTemplateInput {
  const accommodation: DealTemplateAccommodationInput = {};
  if (form.roomsSingle.trim()) accommodation.rooms_single = Number(form.roomsSingle);
  if (form.roomsDouble.trim()) accommodation.rooms_double = Number(form.roomsDouble);
  if (form.nights.trim()) accommodation.nights = Number(form.nights);
  if (form.category) accommodation.category = form.category;
  return {
    id,
    name: form.name,
    feeAmount: form.feeAmount.trim() ? Number(form.feeAmount) : null,
    feeCurrency: form.feeCurrency,
    dealBasis: form.dealBasis || null,
    withholdingPercent: form.withholdingPercent.trim() ? Number(form.withholdingPercent) : null,
    landedItems: form.landedItems,
    accommodation,
    requiredCategoryIds: form.requiredCategoryIds,
    scheduleTemplateId: form.scheduleTemplateId || null,
  };
}

const pillCls = (active: boolean) =>
  `shrink-0 rounded-full px-2.5 py-1 text-xs transition-colors ${
    active
      ? "bg-accent-subtle font-medium text-accent-soft"
      : "border border-hairline text-secondary hover:bg-fill-control"
  }`;

const inputCls =
  "h-9 w-full rounded-[8px] border border-hairline bg-inset px-3 text-[13px] text-primary outline-none";
const labelCls = "block space-y-1";
const labelTextCls = "text-[11px] text-tertiary";

export function DealTemplates({
  orgSlug,
  artistSlug,
  artistId,
  currencies,
  templates,
  categories,
  scheduleTemplates,
}: {
  orgSlug: string;
  artistSlug: string;
  artistId: string;
  currencies: string[];
  templates: DealTemplateData[];
  categories: FileCategoryData[];
  scheduleTemplates: ScheduleTemplateData[];
}) {
  const t = useTranslations("deals");
  const tc = useTranslations("common");
  const [pending, startTransition] = useTransition();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [createKey, setCreateKey] = useState(0);
  const [prefillName, setPrefillName] = useState("");

  function save(id: string | undefined, form: FormState, onDone: () => void) {
    startTransition(async () => {
      const result = await saveDealTemplate(orgSlug, artistSlug, artistId, toPayload(id, form));
      if (result?.error) {
        toast(tc("error"), "danger");
        return;
      }
      onDone();
    });
  }

  function remove(id: string) {
    if (!window.confirm(`${t("delete")}?`)) return;
    startTransition(async () => {
      const result = await deleteDealTemplate(orgSlug, artistSlug, id);
      if (result?.error) toast(tc("error"), "danger");
      if (editingId === id) setEditingId(null);
    });
  }

  function move(id: string, direction: "up" | "down") {
    startTransition(async () => {
      const result = await moveDealTemplate(orgSlug, artistSlug, id, direction);
      if (result?.error) toast(tc("error"), "danger");
    });
  }

  function basisLabel(basis: string | null): string {
    if (basis === "landed") return t("basisLanded");
    if (basis === "all_in") return t("basisAllIn");
    if (basis === "fee_plus_costs") return t("basisFeePlusCosts");
    return "—";
  }

  function scheduleTemplateName(id: string | null): string | undefined {
    if (!id) return undefined;
    return scheduleTemplates.find((tpl) => tpl.id === id)?.name;
  }

  return (
    <div className="space-y-3">
      {templates.length === 0 ? (
        <p className="rounded-[12px] border border-hairline bg-surface px-4 py-8 text-center text-[12px] text-tertiary">
          {t("empty")}
        </p>
      ) : (
        <ul className="divide-y divide-hairline rounded-[12px] border border-hairline bg-surface">
          {templates.map((tpl, i) => {
            const expanded = editingId === tpl.id;
            return (
              <li key={tpl.id} className="px-3 py-2">
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setEditingId(expanded ? null : tpl.id)}
                    className="min-w-0 flex-1 truncate text-left text-[12.5px] text-primary hover:underline"
                    title={tpl.name}
                  >
                    {tpl.name}
                  </button>
                  <span className="font-mono text-[11.5px] text-tertiary">
                    {tpl.fee_amount != null ? `${tpl.fee_amount} ${tpl.fee_currency ?? ""}` : "—"}
                  </span>
                  <span className="text-[11px] text-tertiary">{basisLabel(tpl.deal_basis)}</span>
                  <span className="font-mono text-[11px] text-tertiary">
                    {tpl.withholding_percent != null ? `${tpl.withholding_percent}%` : "—"}
                  </span>
                  <span
                    title={t("landedLabel")}
                    className="rounded-full bg-fill-control px-2 py-0.5 font-mono text-[10.5px] text-tertiary"
                  >
                    {Array.isArray(tpl.landed_items) ? tpl.landed_items.length : 0}
                  </span>
                  {scheduleTemplateName(tpl.schedule_template_id) && (
                    <span
                      title={t("scheduleTemplateLabel")}
                      className="rounded-full bg-fill-control px-2 py-0.5 text-[10.5px] text-tertiary"
                    >
                      {scheduleTemplateName(tpl.schedule_template_id)}
                    </span>
                  )}
                  <span className="flex shrink-0 items-center gap-1">
                    <button
                      type="button"
                      disabled={pending || i === 0}
                      onClick={() => move(tpl.id, "up")}
                      aria-label="Move up"
                      className="flex h-7 w-7 items-center justify-center rounded-[6px] text-secondary transition-colors hover:bg-fill-control-hover hover:text-primary disabled:opacity-30"
                    >
                      <ChevronUp size={14} strokeWidth={1.75} />
                    </button>
                    <button
                      type="button"
                      disabled={pending || i === templates.length - 1}
                      onClick={() => move(tpl.id, "down")}
                      aria-label="Move down"
                      className="flex h-7 w-7 items-center justify-center rounded-[6px] text-secondary transition-colors hover:bg-fill-control-hover hover:text-primary disabled:opacity-30"
                    >
                      <ChevronDown size={14} strokeWidth={1.75} />
                    </button>
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => setEditingId(expanded ? null : tpl.id)}
                      title={tc("save")}
                      className="flex h-7 w-7 items-center justify-center rounded-[6px] text-secondary transition-colors hover:bg-fill-control-hover hover:text-primary"
                    >
                      {expanded ? <X size={14} strokeWidth={1.75} /> : <Pencil size={13} strokeWidth={1.75} />}
                    </button>
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => remove(tpl.id)}
                      title={t("delete")}
                      className="flex h-7 w-7 items-center justify-center rounded-[6px] text-secondary transition-colors hover:bg-danger-subtle hover:text-danger"
                    >
                      <Trash2 size={14} strokeWidth={1.75} />
                    </button>
                  </span>
                </div>
                {expanded && (
                  <div className="mt-3 border-t border-hairline pt-3">
                    <DealTemplateForm
                      currencies={currencies}
                      categories={categories}
                      scheduleTemplates={scheduleTemplates}
                      initial={formFromTemplate(tpl, currencies, scheduleTemplates)}
                      pending={pending}
                      submitLabel={t("save")}
                      onCancel={() => setEditingId(null)}
                      onSubmit={(form) => save(tpl.id, form, () => setEditingId(null))}
                    />
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <div className="space-y-3 rounded-[12px] border border-hairline bg-surface p-3">
        {templates.length === 0 && (
          <div className="flex flex-wrap gap-1.5">
            {NAME_SUGGESTIONS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => {
                  setPrefillName(s);
                  setCreateKey((k) => k + 1);
                }}
                className={pillCls(false)}
              >
                {s}
              </button>
            ))}
          </div>
        )}
        <DealTemplateForm
          key={createKey}
          currencies={currencies}
          categories={categories}
          scheduleTemplates={scheduleTemplates}
          initial={emptyForm(currencies, prefillName)}
          pending={pending}
          submitLabel={t("add")}
          onSubmit={(form) =>
            save(undefined, form, () => {
              setPrefillName("");
              setCreateKey((k) => k + 1);
            })
          }
        />
      </div>
    </div>
  );
}

function DealTemplateForm({
  currencies,
  categories,
  scheduleTemplates,
  initial,
  pending,
  submitLabel,
  onCancel,
  onSubmit,
}: {
  currencies: string[];
  categories: FileCategoryData[];
  scheduleTemplates: ScheduleTemplateData[];
  initial: FormState;
  pending: boolean;
  submitLabel: string;
  onCancel?: () => void;
  onSubmit: (form: FormState) => void;
}) {
  const t = useTranslations("deals");
  const tc = useTranslations("common");
  const [form, setForm] = useState<FormState>(initial);
  const [landedItemInput, setLandedItemInput] = useState("");

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function toggleLandedItem(item: string) {
    setForm((f) => ({
      ...f,
      landedItems: f.landedItems.includes(item)
        ? f.landedItems.filter((x) => x !== item)
        : [...f.landedItems, item],
    }));
  }

  function addCustomItem() {
    const v = landedItemInput.trim();
    if (!v || form.landedItems.includes(v)) return;
    setForm((f) => ({ ...f, landedItems: [...f.landedItems, v] }));
    setLandedItemInput("");
  }

  function toggleCategory(id: string) {
    setForm((f) => ({
      ...f,
      requiredCategoryIds: f.requiredCategoryIds.includes(id)
        ? f.requiredCategoryIds.filter((x) => x !== id)
        : [...f.requiredCategoryIds, id],
    }));
  }

  const customItems = form.landedItems.filter((x) => !STANDARD_LANDED_ITEMS.includes(x));

  return (
    <div className="space-y-4">
      <label className={labelCls}>
        <span className={labelTextCls}>{t("nameLabel")}</span>
        <input value={form.name} onChange={(e) => set("name", e.target.value)} className={inputCls} />
      </label>

      <div className="grid grid-cols-2 gap-3">
        <label className={labelCls}>
          <span className={labelTextCls}>{t("feeLabel")}</span>
          <input
            value={form.feeAmount}
            onChange={(e) => set("feeAmount", e.target.value)}
            type="number"
            step="0.01"
            min="0"
            className={inputCls}
          />
        </label>
        <label className={labelCls}>
          <span className={labelTextCls}>&nbsp;</span>
          <select
            value={form.feeCurrency}
            onChange={(e) => set("feeCurrency", e.target.value)}
            className={inputCls}
          >
            {currencies.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="space-y-1.5">
        <span className={labelTextCls}>{t("basisLabel")}</span>
        <div className="flex flex-wrap gap-3">
          <label className="flex items-center gap-1.5 text-[12.5px] text-primary">
            <input
              type="radio"
              checked={form.dealBasis === ""}
              onChange={() => set("dealBasis", "")}
            />
            —
          </label>
          {DEAL_BASIS_OPTIONS.map((basis) => (
            <label key={basis} className="flex items-center gap-1.5 text-[12.5px] text-primary">
              <input
                type="radio"
                checked={form.dealBasis === basis}
                onChange={() => set("dealBasis", basis)}
              />
              {basis === "landed"
                ? t("basisLanded")
                : basis === "all_in"
                  ? t("basisAllIn")
                  : t("basisFeePlusCosts")}
            </label>
          ))}
        </div>
      </div>

      <label className={labelCls}>
        <span className={labelTextCls}>{t("withholdingLabel")}</span>
        <input
          value={form.withholdingPercent}
          onChange={(e) => set("withholdingPercent", e.target.value)}
          type="number"
          step="0.01"
          min="0"
          max="100"
          className={`${inputCls} max-w-[160px]`}
        />
      </label>

      <div className="space-y-1.5">
        <span className={labelTextCls}>{t("landedLabel")}</span>
        <div className="flex flex-wrap gap-1.5">
          {STANDARD_LANDED_ITEMS.map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => toggleLandedItem(item)}
              className={pillCls(form.landedItems.includes(item))}
            >
              {form.landedItems.includes(item) ? "✓ " : ""}
              {item}
            </button>
          ))}
          {customItems.map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => toggleLandedItem(item)}
              className={pillCls(true)}
            >
              ✓ {item}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <input
            value={landedItemInput}
            onChange={(e) => setLandedItemInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addCustomItem();
              }
            }}
            className={`${inputCls} max-w-[220px]`}
          />
          <button
            type="button"
            disabled={!landedItemInput.trim()}
            onClick={addCustomItem}
            className="btn-quiet h-9 shrink-0 disabled:opacity-50"
          >
            {t("landedAdd")}
          </button>
        </div>
      </div>

      <div className="space-y-1.5">
        <span className={labelTextCls}>{t("accommodationLabel")}</span>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <label className={labelCls}>
            <span className={labelTextCls}>{t("roomsSingle")}</span>
            <input
              value={form.roomsSingle}
              onChange={(e) => set("roomsSingle", e.target.value)}
              type="number"
              step="1"
              min="0"
              className={inputCls}
            />
          </label>
          <label className={labelCls}>
            <span className={labelTextCls}>{t("roomsDouble")}</span>
            <input
              value={form.roomsDouble}
              onChange={(e) => set("roomsDouble", e.target.value)}
              type="number"
              step="1"
              min="0"
              className={inputCls}
            />
          </label>
          <label className={labelCls}>
            <span className={labelTextCls}>{t("nights")}</span>
            <input
              value={form.nights}
              onChange={(e) => set("nights", e.target.value)}
              type="number"
              step="1"
              min="0"
              className={inputCls}
            />
          </label>
          <label className={labelCls}>
            <span className={labelTextCls}>{t("categoryLabel")}</span>
            <select value={form.category} onChange={(e) => set("category", e.target.value)} className={inputCls}>
              <option value="">—</option>
              {HOTEL_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      {categories.length > 0 && (
        <div className="space-y-1.5">
          <span className={labelTextCls}>{t("requiredLabel")}</span>
          <div className="flex flex-wrap gap-1.5">
            {categories.map((cat) => (
              <button
                key={cat.id}
                type="button"
                onClick={() => toggleCategory(cat.id)}
                className={pillCls(form.requiredCategoryIds.includes(cat.id))}
              >
                {form.requiredCategoryIds.includes(cat.id) ? "✓ " : ""}
                {cat.name}
              </button>
            ))}
          </div>
        </div>
      )}

      <label className="block space-y-1">
        <span className="text-sm font-medium">{t("scheduleTemplateLabel")}</span>
        <select
          value={form.scheduleTemplateId}
          onChange={(e) => setForm((f) => ({ ...f, scheduleTemplateId: e.target.value }))}
          className="w-full rounded-md border border-hairline bg-surface px-3 py-2 text-sm"
        >
          <option value="">—</option>
          {scheduleTemplates.map((tpl) => (
            <option key={tpl.id} value={tpl.id}>
              {tpl.name}
            </option>
          ))}
        </select>
      </label>

      <div className="flex justify-end gap-2">
        {onCancel && (
          <button type="button" disabled={pending} onClick={onCancel} className="btn-quiet h-9">
            {tc("cancel")}
          </button>
        )}
        <button
          type="button"
          disabled={pending || !form.name.trim()}
          onClick={() => onSubmit(form)}
          className="btn-quiet h-9 disabled:opacity-50"
        >
          {submitLabel}
        </button>
      </div>
    </div>
  );
}
