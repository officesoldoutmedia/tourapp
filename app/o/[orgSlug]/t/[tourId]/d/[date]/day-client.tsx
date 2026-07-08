"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { formatTimeInZone, isPlusOne } from "@/lib/datetime";
import { useDayRealtime } from "@/components/useDayRealtime";
import {
  applyScheduleTemplate,
  confirmAllSchedule,
  deleteScheduleItem,
  saveScheduleAsTemplate,
  toggleScheduleFlag,
  updateDayNotes,
  upsertScheduleItem,
  type ScheduleItemInput,
} from "./actions";

export interface DayData {
  id: string;
  date: string;
  timezone: string;
  general_notes: string | null;
  travel_notes: string | null;
  hotel_notes: string | null;
}

export interface ScheduleItemData {
  id: string;
  title: string;
  details: string | null;
  item_type: "schedule" | "publicity";
  start_at: string | null;
  end_at: string | null;
  is_confirmed: boolean;
  is_complete: boolean;
}

// ─── Notes (3 zone [C]) ─────────────────────────────────────────────
export function NotesSection({
  orgSlug,
  tourId,
  day,
  canEdit,
}: {
  orgSlug: string;
  tourId: string;
  day: DayData;
  canEdit: boolean;
}) {
  const t = useTranslations("day");
  const fields = [
    ["general_notes", t("notesGeneral"), day.general_notes],
    ["travel_notes", t("notesTravel"), day.travel_notes],
    ["hotel_notes", t("notesHotel"), day.hotel_notes],
  ] as const;

  return (
    <section className="grid gap-4 md:grid-cols-3">
      {fields.map(([field, label, value]) => (
        <label key={field} className="block space-y-1">
          <span className="text-xs font-semibold uppercase tracking-wide text-secondary">
            {label}
          </span>
          <textarea
            defaultValue={value ?? ""}
            readOnly={!canEdit}
            rows={3}
            onBlur={(e) => {
              if (canEdit && e.target.value !== (value ?? "")) {
                void updateDayNotes(orgSlug, tourId, day.date, field, e.target.value);
              }
            }}
            className="w-full rounded-md border border-hairline bg-surface px-3 py-2 text-sm read-only:bg-subtle"
          />
        </label>
      ))}
    </section>
  );
}

// ─── Schedule ───────────────────────────────────────────────────────
export function ScheduleSection({
  orgSlug,
  tourId,
  day,
  items,
  templates,
  canEdit,
}: {
  orgSlug: string;
  tourId: string;
  day: DayData;
  items: ScheduleItemData[];
  templates: { id: string; name: string }[];
  canEdit: boolean;
}) {
  const t = useTranslations("schedule");
  const td = useTranslations("day");
  useDayRealtime(day.id);

  const [editing, setEditing] = useState<ScheduleItemData | null>(null);
  const [adding, setAdding] = useState(false);
  const [templateId, setTemplateId] = useState("");
  const [templateName, setTemplateName] = useState("");
  const [pending, startTransition] = useTransition();

  function run(fn: () => Promise<{ error?: string }>) {
    startTransition(async () => {
      await fn();
      setEditing(null);
      setAdding(false);
    });
  }

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="mr-auto font-display text-lg font-semibold tracking-tight">{td("schedule")}</h2>
        {canEdit && (
          <>
            <select
              value={templateId}
              onChange={(e) => setTemplateId(e.target.value)}
              className="rounded border border-hairline px-2 py-1 text-xs"
            >
              <option value="">{t("applyTemplate")}…</option>
              {templates.map((tpl) => (
                <option key={tpl.id} value={tpl.id}>
                  {tpl.name}
                </option>
              ))}
            </select>
            {templateId && (
              <button
                disabled={pending}
                onClick={() =>
                  run(() =>
                    applyScheduleTemplate(orgSlug, tourId, day.date, day.id, templateId),
                  )
                }
                className="rounded border border-hairline px-2 py-1 text-xs font-medium"
              >
                {t("applyTemplate")}
              </button>
            )}
            <button
              disabled={pending || items.length === 0}
              onClick={() =>
                run(() => confirmAllSchedule(orgSlug, tourId, day.date, day.id))
              }
              className="rounded border border-hairline px-2 py-1 text-xs font-medium disabled:opacity-40"
            >
              {t("confirmAll")}
            </button>
            <button
              onClick={() => setAdding(true)}
              className="rounded bg-accent hover:bg-accent-hover px-3 py-1 text-xs font-medium text-white"
            >
              + {t("add")}
            </button>
          </>
        )}
      </div>

      {items.length === 0 && !adding && (
        <p className="text-sm text-tertiary">{t("noItems")}</p>
      )}

      <ul className="divide-y divide-hairline rounded-lg border border-hairline bg-surface shadow-xs empty:hidden">
        {items.map((item) =>
          editing?.id === item.id ? (
            <li key={item.id} className="p-3">
              <ItemForm
                initial={item}
                day={day}
                pending={pending}
                onCancel={() => setEditing(null)}
                onSave={(input) =>
                  run(() => upsertScheduleItem(orgSlug, tourId, input))
                }
              />
            </li>
          ) : (
            <li key={item.id} className="flex items-center gap-3 px-3 py-2">
              <span className="w-24 shrink-0 font-mono text-xs text-secondary">
                {item.start_at ? formatTimeInZone(new Date(item.start_at), day.timezone) : "—"}
                {item.end_at && (
                  <>
                    –{formatTimeInZone(new Date(item.end_at), day.timezone)}
                    {item.start_at &&
                      isPlusOne(
                        new Date(item.start_at),
                        new Date(item.end_at),
                        day.timezone,
                      ) && (
                        <sup className="ml-0.5 font-semibold text-danger">+1</sup>
                      )}
                  </>
                )}
              </span>
              <span className="min-w-0 flex-1">
                <span
                  className={`text-sm font-medium ${item.is_complete ? "text-tertiary line-through" : ""}`}
                >
                  {item.item_type === "publicity" && <span title={t("publicity")}>🎤 </span>}
                  {item.title}
                </span>
                {item.details && (
                  <span className="block truncate text-xs text-secondary">
                    {item.details}
                  </span>
                )}
              </span>
              <span
                className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${item.is_confirmed ? "bg-success-subtle text-success" : "bg-inset text-secondary"}`}
              >
                {item.is_confirmed ? t("confirmed") : t("unconfirmed")}
              </span>
              {canEdit && (
                <span className="flex shrink-0 gap-1">
                  <button
                    title={t("confirmed")}
                    disabled={pending}
                    onClick={() =>
                      run(() =>
                        toggleScheduleFlag(orgSlug, tourId, day.date, item.id, "is_confirmed", !item.is_confirmed),
                      )
                    }
                    className="rounded px-1.5 py-0.5 text-xs hover:bg-subtle"
                  >
                    ✓
                  </button>
                  <button
                    title={t("complete")}
                    disabled={pending}
                    onClick={() =>
                      run(() =>
                        toggleScheduleFlag(orgSlug, tourId, day.date, item.id, "is_complete", !item.is_complete),
                      )
                    }
                    className="rounded px-1.5 py-0.5 text-xs hover:bg-subtle"
                  >
                    ☑
                  </button>
                  <button
                    title={t("edit")}
                    onClick={() => setEditing(item)}
                    className="rounded px-1.5 py-0.5 text-xs hover:bg-subtle"
                  >
                    ✎
                  </button>
                  <button
                    title={t("delete")}
                    disabled={pending}
                    onClick={() =>
                      run(() => deleteScheduleItem(orgSlug, tourId, day.date, item.id))
                    }
                    className="rounded px-1.5 py-0.5 text-xs text-danger hover:bg-danger-subtle"
                  >
                    🗑
                  </button>
                </span>
              )}
            </li>
          ),
        )}
      </ul>

      {adding && (
        <div className="rounded-lg border border-hairline bg-surface shadow-xs p-3">
          <ItemForm
            initial={null}
            day={day}
            pending={pending}
            onCancel={() => setAdding(false)}
            onSave={(input) => run(() => upsertScheduleItem(orgSlug, tourId, input))}
          />
        </div>
      )}

      {canEdit && items.length > 0 && (
        <div className="flex items-center gap-2">
          <input
            value={templateName}
            onChange={(e) => setTemplateName(e.target.value)}
            placeholder={t("templateName")}
            className="rounded border border-hairline px-2 py-1 text-xs"
          />
          <button
            disabled={pending || !templateName.trim()}
            onClick={() =>
              run(async () => {
                const r = await saveScheduleAsTemplate(orgSlug, tourId, day.date, day.id, templateName);
                if (!r.error) setTemplateName("");
                return r;
              })
            }
            className="rounded border border-hairline px-2 py-1 text-xs font-medium disabled:opacity-40"
          >
            {t("saveAsTemplate")}
          </button>
        </div>
      )}
    </section>
  );
}

// ─── Formularul de item (add/edit) ─────────────────────────────────
function ItemForm({
  initial,
  day,
  pending,
  onSave,
  onCancel,
}: {
  initial: ScheduleItemData | null;
  day: DayData;
  pending: boolean;
  onSave: (input: ScheduleItemInput) => void;
  onCancel: () => void;
}) {
  const t = useTranslations("schedule");
  const tc = useTranslations("common");

  const [title, setTitle] = useState(initial?.title ?? "");
  const [details, setDetails] = useState(initial?.details ?? "");
  const [itemType, setItemType] = useState<"schedule" | "publicity">(
    initial?.item_type ?? "schedule",
  );
  const [start, setStart] = useState(
    initial?.start_at ? formatTimeInZone(new Date(initial.start_at), day.timezone) : "",
  );
  const [end, setEnd] = useState(
    initial?.end_at ? formatTimeInZone(new Date(initial.end_at), day.timezone) : "",
  );

  const plusOne = Boolean(start && end && end <= start);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={t("title")}
          className="min-w-40 flex-1 rounded border border-hairline px-2 py-1 text-sm"
        />
        <select
          value={itemType}
          onChange={(e) => setItemType(e.target.value as "schedule" | "publicity")}
          className="rounded border border-hairline px-2 py-1 text-sm"
        >
          <option value="schedule">{t("scheduleType")}</option>
          <option value="publicity">{t("publicity")}</option>
        </select>
        <input
          type="time"
          value={start}
          onChange={(e) => setStart(e.target.value)}
          className="rounded border border-hairline px-2 py-1 text-sm"
        />
        <input
          type="time"
          value={end}
          onChange={(e) => setEnd(e.target.value)}
          className="rounded border border-hairline px-2 py-1 text-sm"
        />
        {plusOne && (
          <span className="self-center text-xs font-semibold text-danger">
            {t("plusOne")}
          </span>
        )}
      </div>
      <textarea
        value={details}
        onChange={(e) => setDetails(e.target.value)}
        placeholder={t("details")}
        rows={2}
        className="w-full rounded border border-hairline px-2 py-1 text-sm"
      />
      <div className="flex gap-2">
        <button
          disabled={pending || !title.trim()}
          onClick={() =>
            onSave({
              id: initial?.id,
              dayId: day.id,
              title,
              details,
              itemType,
              start,
              end,
              date: day.date,
              tz: day.timezone,
            })
          }
          className="rounded bg-accent hover:bg-accent-hover px-3 py-1 text-xs font-medium text-white disabled:opacity-40"
        >
          {tc("save")}
        </button>
        <button
          onClick={onCancel}
          className="rounded border border-hairline px-3 py-1 text-xs"
        >
          {tc("cancel")}
        </button>
      </div>
    </div>
  );
}
