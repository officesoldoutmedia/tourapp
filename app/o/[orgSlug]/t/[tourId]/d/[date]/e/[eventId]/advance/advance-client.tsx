"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import type { AdvanceLayoutItem, AdvanceStatus } from "@/lib/advance";
import { setEventFieldValue } from "../../actions";
import {
  createAdvance,
  deleteAdvance,
  saveAdvanceAsTemplate,
  updateAdvanceLayout,
  updateAdvanceStatus,
  upsertAdvanceScheduleRow,
} from "./actions";
import type { FieldDef } from "../event-client";

export interface AdvanceData {
  id: string;
  title: string;
  status: AdvanceStatus;
  layout: AdvanceLayoutItem[];
}

export interface ScheduleRowData {
  id: string;
  title: string;
  start: string; // HH:mm local, '' dacă lipsește
  end: string;
  is_confirmed: boolean;
}

function StatusMark({ status }: { status: AdvanceStatus }) {
  if (status === "done")
    return (
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--success)" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
        <path d="M20 6 9 17l-5-5" />
      </svg>
    );
  if (status === "in_progress")
    return <i className="h-[7px] w-[7px] shrink-0 rounded-full bg-warning" />;
  return <i className="h-[7px] w-[7px] shrink-0 rounded-full border border-strong" />;
}

export function AdvanceEditor({
  orgSlug,
  tourId,
  date,
  eventId,
  advances,
  templates,
  defs,
  values,
  scheduleRows,
  canEdit,
}: {
  orgSlug: string;
  tourId: string;
  date: string;
  eventId: string;
  advances: AdvanceData[];
  templates: { id: string; title: string }[];
  defs: FieldDef[];
  values: Record<string, string>;
  scheduleRows: Record<string, ScheduleRowData>;
  canEdit: boolean;
}) {
  const t = useTranslations("advance");
  const tf = useTranslations("fields");
  const tsec = useTranslations("sections");
  const tc = useTranslations("common");
  const router = useRouter();

  const [selectedId, setSelectedId] = useState(advances[0]?.id ?? null);
  const [mode, setMode] = useState<"advance" | "design">("advance");
  const [newTitle, setNewTitle] = useState("");
  const [newTemplate, setNewTemplate] = useState("");
  const [templateName, setTemplateName] = useState("");
  const [pending, startTransition] = useTransition();

  const selected = advances.find((a) => a.id === selectedId) ?? null;

  function run(fn: () => Promise<{ error?: string }>) {
    startTransition(async () => {
      await fn();
      router.refresh();
    });
  }

  function fieldLabel(key: string): string {
    const def = defs.find((d) => d.key === key);
    if (def?.custom_label) return def.custom_label;
    try {
      return tf(key);
    } catch {
      return key;
    }
  }

  function setLayout(layout: AdvanceLayoutItem[]) {
    if (!selected) return;
    run(() =>
      updateAdvanceLayout(orgSlug, tourId, date, eventId, selected.id, layout),
    );
  }

  return (
    <div className="grid gap-6 md:grid-cols-[16rem_1fr]">
      {/* Sidebar advances [C] */}
      <aside className="space-y-3">
        <ul className="divide-y divide-hairline rounded-[12px] border border-hairline bg-surface empty:hidden">
          {advances.map((advance) => (
            <li key={advance.id}>
              <button
                onClick={() => setSelectedId(advance.id)}
                className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm ${advance.id === selectedId ? "bg-inset font-medium" : "hover:bg-subtle"}`}
              >
                <StatusMark status={advance.status} />
                <span className="truncate">{advance.title}</span>
              </button>
            </li>
          ))}
        </ul>
        {advances.length === 0 && (
          <p className="text-sm text-tertiary">{t("noAdvances")}</p>
        )}
        {canEdit && (
          <div className="space-y-2 rounded-[12px] border border-hairline bg-surface p-3">
            <input
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder={t("advanceTitle")}
              className="w-full rounded border border-hairline px-2 py-1 text-xs"
            />
            <select
              value={newTemplate}
              onChange={(e) => setNewTemplate(e.target.value)}
              className="w-full rounded border border-hairline px-2 py-1 text-xs"
            >
              <option value="">{t("blank")}</option>
              {templates.map((tpl) => (
                <option key={tpl.id} value={tpl.id}>
                  {t("fromTemplate")}: {tpl.title}
                </option>
              ))}
            </select>
            <button
              disabled={pending || !newTitle.trim()}
              onClick={() =>
                run(async () => {
                  const r = await createAdvance(
                    orgSlug, tourId, date, eventId, newTitle, newTemplate || undefined,
                  );
                  if (!r.error) setNewTitle("");
                  return r;
                })
              }
              className="btn-quiet h-7 px-2.5w-full  disabled:opacity-40"
            >
              + {t("addAdvance")}
            </button>
          </div>
        )}
      </aside>

      {/* Editor */}
      {selected && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="mr-auto font-display text-lg font-semibold tracking-tight">{selected.title}</h2>
            {canEdit && (
              <>
                <select
                  value={selected.status}
                  onChange={(e) =>
                    run(() =>
                      updateAdvanceStatus(
                        orgSlug, tourId, date, eventId, selected.id,
                        e.target.value as AdvanceStatus,
                      ),
                    )
                  }
                  className="rounded border border-hairline px-2 py-1 text-xs"
                >
                  {(["not_started", "in_progress", "done"] as const).map((s) => (
                    <option key={s} value={s}>
                      {t(`status_${s}`)}
                    </option>
                  ))}
                </select>
                {/* toggle advance|design [C-S] */}
                <span className="flex rounded-full bg-inset p-0.5 text-xs font-semibold">
                  {(["advance", "design"] as const).map((m) => (
                    <button
                      key={m}
                      onClick={() => setMode(m)}
                      className={`rounded-full px-3 py-1 transition-colors ${mode === m ? "bg-surface text-primary" : "text-tertiary hover:text-secondary"}`}
                    >
                      {t(`${m}Mode`)}
                    </button>
                  ))}
                </span>
                <button
                  disabled={pending}
                  onClick={() =>
                    run(() => deleteAdvance(orgSlug, tourId, date, eventId, selected.id))
                  }
                  className="rounded px-2 py-1 text-xs text-danger hover:bg-danger-subtle"
                  title={t("remove")}
                >
                  🗑
                </button>
              </>
            )}
          </div>

          {selected.layout.length === 0 && (
            <p className="text-sm text-tertiary">{t("emptyLayout")}</p>
          )}

          {mode === "advance" ? (
            <div className="space-y-3">
              {selected.layout.map((item, idx) => {
                if (item.type === "title") {
                  return (
                    <div key={idx} className="pt-2">
                      <h3 className="text-sm font-semibold uppercase tracking-wide">
                        {item.title}
                      </h3>
                      {item.description && (
                        <p className="text-xs text-secondary">{item.description}</p>
                      )}
                    </div>
                  );
                }
                if (item.type === "field") {
                  return (
                    <label key={idx} className="block space-y-1">
                      <span className="text-xs font-semibold text-secondary">
                        {fieldLabel(item.key)}
                      </span>
                      <textarea
                        defaultValue={values[item.key] ?? ""}
                        readOnly={!canEdit}
                        rows={2}
                        onBlur={(e) => {
                          if (canEdit && e.target.value !== (values[item.key] ?? "")) {
                            run(() =>
                              setEventFieldValue(orgSlug, eventId, item.key, e.target.value),
                            );
                          }
                        }}
                        className="w-full rounded border border-hairline px-2 py-1 text-sm read-only:bg-subtle"
                      />
                    </label>
                  );
                }
                // schedule_row [C-S]
                const row = scheduleRows[item.schedule_item_id];
                if (!row) return null;
                return (
                  <ScheduleRowEditor
                    key={idx}
                    row={row}
                    canEdit={canEdit}
                    pending={pending}
                    onSave={(input) =>
                      run(() =>
                        upsertAdvanceScheduleRow(
                          orgSlug, tourId, date, eventId, selected.id,
                          { ...input, scheduleItemId: row.id },
                        ),
                      )
                    }
                  />
                );
              })}
            </div>
          ) : (
            <DesignMode
              layout={selected.layout}
              defs={defs}
              fieldLabel={fieldLabel}
              sectionLabel={(s) => tsec(s)}
              pending={pending}
              onChange={setLayout}
              onAddScheduleRow={() =>
                run(() =>
                  upsertAdvanceScheduleRow(
                    orgSlug, tourId, date, eventId, selected.id,
                    { title: "Schedule", start: "", end: "", confirmed: false },
                  ),
                )
              }
            />
          )}

          {canEdit && (
            <div className="flex items-center gap-2 border-t border-hairline pt-3">
              <input
                value={templateName}
                onChange={(e) => setTemplateName(e.target.value)}
                placeholder={t("templateTitle")}
                className="rounded border border-hairline px-2 py-1 text-xs"
              />
              <button
                disabled={pending || !templateName.trim()}
                onClick={() =>
                  run(async () => {
                    const r = await saveAdvanceAsTemplate(orgSlug, selected.id, templateName);
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
          <p className="sr-only">{tc("loading")}</p>
        </div>
      )}
    </div>
  );
}

function ScheduleRowEditor({
  row,
  canEdit,
  pending,
  onSave,
}: {
  row: ScheduleRowData;
  canEdit: boolean;
  pending: boolean;
  onSave: (input: { title: string; start: string; end: string; confirmed: boolean }) => void;
}) {
  const t = useTranslations("advance");
  const [title, setTitle] = useState(row.title);
  const [start, setStart] = useState(row.start);
  const [end, setEnd] = useState(row.end);
  const [confirmed, setConfirmed] = useState(row.is_confirmed);

  const dirty =
    title !== row.title || start !== row.start || end !== row.end || confirmed !== row.is_confirmed;

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-md border border-hairline bg-surface bg-subtle p-2">
      <span className="text-xs font-semibold text-secondary">SCHEDULE</span>
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        readOnly={!canEdit}
        className="min-w-32 flex-1 rounded border border-hairline px-2 py-1 text-sm"
      />
      <input
        type="time"
        value={start}
        onChange={(e) => setStart(e.target.value)}
        readOnly={!canEdit}
        className="rounded border border-hairline px-2 py-1 text-sm"
      />
      <input
        type="time"
        value={end}
        onChange={(e) => setEnd(e.target.value)}
        readOnly={!canEdit}
        className="rounded border border-hairline px-2 py-1 text-sm"
      />
      <label className="flex items-center gap-1 text-xs">
        <input
          type="checkbox"
          checked={confirmed}
          disabled={!canEdit}
          onChange={(e) => setConfirmed(e.target.checked)}
        />
        {t("confirmRow")}
      </label>
      {canEdit && dirty && (
        <button
          disabled={pending}
          onClick={() => onSave({ title, start, end, confirmed })}
          className="btn-quiet h-7 px-2.5"
        >
          ✓
        </button>
      )}
    </div>
  );
}

function DesignMode({
  layout,
  defs,
  fieldLabel,
  sectionLabel,
  pending,
  onChange,
  onAddScheduleRow,
}: {
  layout: AdvanceLayoutItem[];
  defs: FieldDef[];
  fieldLabel: (key: string) => string;
  sectionLabel: (s: string) => string;
  pending: boolean;
  onChange: (layout: AdvanceLayoutItem[]) => void;
  onAddScheduleRow: () => void;
}) {
  const t = useTranslations("advance");
  const usedKeys = new Set(
    layout.filter((i) => i.type === "field").map((i) => (i as { key: string }).key),
  );
  const availableDefs = defs.filter((d) => !usedKeys.has(d.key));

  function move(idx: number, delta: number) {
    const next = [...layout];
    const target = idx + delta;
    if (target < 0 || target >= next.length) return;
    [next[idx], next[target]] = [next[target], next[idx]];
    onChange(next);
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <select
          value=""
          disabled={pending}
          onChange={(e) => {
            if (e.target.value)
              onChange([...layout, { type: "field", key: e.target.value }]);
          }}
          className="rounded border border-hairline px-2 py-1 text-xs"
        >
          <option value="">{t("addFieldRow")}…</option>
          {availableDefs.map((def) => (
            <option key={def.key} value={def.key}>
              {sectionLabel(def.section)}: {fieldLabel(def.key)}
            </option>
          ))}
        </select>
        <button
          disabled={pending}
          onClick={() => onChange([...layout, { type: "title", title: "Titlu" }])}
          className="rounded border border-hairline px-2 py-1 text-xs font-medium"
        >
          {t("addTitleRow")}
        </button>
        <button
          disabled={pending}
          onClick={onAddScheduleRow}
          className="rounded border border-hairline px-2 py-1 text-xs font-medium"
        >
          {t("addScheduleRow")}
        </button>
      </div>

      <ul className="divide-y divide-hairline rounded-[12px] border border-hairline bg-surface empty:hidden">
        {layout.map((item, idx) => (
          <li key={idx} className="flex items-center gap-2 px-3 py-2 text-sm">
            <span className="cursor-default text-disabled">⠿</span>
            <span className="min-w-0 flex-1">
              {item.type === "field" && (
                <span>
                  <span className="text-xs text-tertiary">
                    {sectionLabel(defs.find((d) => d.key === item.key)?.section ?? "custom")}
                    :{" "}
                  </span>
                  {fieldLabel(item.key)}
                </span>
              )}
              {item.type === "title" && (
                <input
                  defaultValue={item.title}
                  onBlur={(e) => {
                    if (e.target.value !== item.title) {
                      const next = [...layout];
                      next[idx] = { ...item, title: e.target.value };
                      onChange(next);
                    }
                  }}
                  className="w-full rounded border border-hairline px-2 py-0.5 font-semibold"
                />
              )}
              {item.type === "schedule_row" && (
                <span className="text-xs font-semibold text-secondary">SCHEDULE ROW</span>
              )}
            </span>
            <button
              disabled={pending}
              onClick={() => move(idx, -1)}
              className="rounded px-1 text-xs hover:bg-subtle"
            >
              ↑
            </button>
            <button
              disabled={pending}
              onClick={() => move(idx, 1)}
              className="rounded px-1 text-xs hover:bg-subtle"
            >
              ↓
            </button>
            <button
              disabled={pending}
              onClick={() => onChange(layout.filter((_, i) => i !== idx))}
              className="rounded px-1 text-xs text-danger hover:bg-danger-subtle"
            >
              🗑
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
