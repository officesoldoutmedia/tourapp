"use client";

/** C2 — editor de itemi pe template: titlu, ancoră (oră fixă / relativ la
 *  show), offset, durată, tip; reordonare ↑↓; ștergere template. */
import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import {
  formatShowOffset,
  minutesToClock,
  type ScheduleTemplateItem,
} from "@/lib/scheduleGeneration";
import { deleteScheduleTemplate, saveScheduleTemplate } from "./actions";

interface TemplateData {
  id: string;
  name: string;
  items: ScheduleTemplateItem[];
}

const inputCls = "rounded border border-hairline bg-surface px-2 py-1 text-sm";

function clockToMinutes(clock: string): number {
  const [h, m] = clock.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

export function TemplatesClient({
  orgSlug,
  templates,
}: {
  orgSlug: string;
  templates: TemplateData[];
}) {
  const t = useTranslations("scheduleTemplates");
  const tc = useTranslations("common");
  const [openId, setOpenId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [pending, startTransition] = useTransition();

  function run(fn: () => Promise<{ error?: string }>) {
    startTransition(async () => {
      const result = await fn();
      if (!result?.error) {
        setOpenId(null);
        setCreating(false);
      }
    });
  }

  return (
    <div className="space-y-4">
      {templates.length === 0 && !creating && (
        <p className="text-sm text-secondary">{t("empty")}</p>
      )}

      <ul className="divide-y divide-hairline rounded-[12px] border border-hairline bg-surface empty:hidden">
        {templates.map((tpl) => (
          <li key={tpl.id} className="p-3">
            {openId === tpl.id ? (
              <TemplateForm
                initial={tpl}
                pending={pending}
                onCancel={() => setOpenId(null)}
                onSave={(input) => run(() => saveScheduleTemplate(orgSlug, input))}
                onDelete={() => {
                  if (window.confirm(`${t("delete")}?`)) {
                    run(() => deleteScheduleTemplate(orgSlug, tpl.id));
                  }
                }}
              />
            ) : (
              <div className="flex items-center gap-3">
                <span className="min-w-0 flex-1">
                  <span className="text-sm font-medium">{tpl.name}</span>
                  <span className="block text-xs text-secondary">
                    {t("itemCount", { count: tpl.items.length })}
                    {tpl.items.some((i) => i.anchor === "show") &&
                      ` · ${t("hasShowAnchors")}`}
                  </span>
                </span>
                <button
                  title={tc("edit")}
                  onClick={() => {
                    setCreating(false);
                    setOpenId(tpl.id);
                  }}
                  className="rounded px-1.5 py-0.5 text-xs hover:bg-subtle"
                >
                  ✎
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>

      {creating ? (
        <div className="rounded-[12px] border border-hairline bg-surface p-3">
          <TemplateForm
            initial={null}
            pending={pending}
            onCancel={() => setCreating(false)}
            onSave={(input) => run(() => saveScheduleTemplate(orgSlug, input))}
          />
        </div>
      ) : (
        <button
          onClick={() => {
            setOpenId(null);
            setCreating(true);
          }}
          className="btn-quiet h-7 px-2.5"
        >
          + {t("add")}
        </button>
      )}
    </div>
  );
}

function TemplateForm({
  initial,
  pending,
  onCancel,
  onSave,
  onDelete,
}: {
  initial: TemplateData | null;
  pending: boolean;
  onCancel: () => void;
  onSave: (input: { id?: string; name: string; items: ScheduleTemplateItem[] }) => void;
  onDelete?: () => void;
}) {
  const t = useTranslations("scheduleTemplates");
  const tc = useTranslations("common");
  const [name, setName] = useState(initial?.name ?? "");
  const [items, setItems] = useState<(ScheduleTemplateItem & { dir?: -1 | 1 })[]>(
    initial?.items ?? [],
  );

  function patch(idx: number, part: Partial<ScheduleTemplateItem & { dir?: -1 | 1 }>) {
    setItems((list) => list.map((it, i) => (i === idx ? { ...it, ...part } : it)));
  }
  function move(idx: number, dir: -1 | 1) {
    setItems((list) => {
      const next = [...list];
      const swap = idx + dir;
      if (swap < 0 || swap >= next.length) return list;
      [next[idx], next[swap]] = [next[swap], next[idx]];
      return next;
    });
  }

  return (
    <div className="space-y-3">
      <label className="block space-y-1">
        <span className="text-xs font-semibold uppercase tracking-wide text-secondary">
          {t("nameLabel")}
        </span>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className={`${inputCls} w-full`}
        />
      </label>

      <ul className="space-y-2">
        {items.map((item, idx) => (
          <li key={idx} className="flex flex-wrap items-center gap-2 rounded-md border border-hairline p-2">
            <input
              value={item.title}
              onChange={(e) => patch(idx, { title: e.target.value })}
              placeholder={t("itemTitle")}
              aria-label={t("itemTitle")}
              className={`${inputCls} min-w-32 flex-1`}
            />
            <select
              value={item.anchor === "show" ? "show" : "day"}
              aria-label={t("anchorLabel")}
              onChange={(e) =>
                e.target.value === "show"
                  ? patch(idx, { anchor: "show", offset_min: 0, dir: undefined })
                  : patch(idx, { anchor: undefined, offset_min: 0, dir: undefined })
              }
              className={inputCls}
            >
              <option value="day">{t("anchorDay")}</option>
              <option value="show">{t("anchorShow")}</option>
            </select>
            {item.anchor === "show" ? (
              <span className="flex items-center gap-1">
                <select
                  value={(item.dir ?? (item.offset_min < 0 ? -1 : 1)) < 0 ? "before" : "after"}
                  aria-label={t("directionLabel")}
                  onChange={(e) => {
                    const newDir = e.target.value === "before" ? -1 : 1;
                    patch(idx, {
                      dir: newDir,
                      offset_min: newDir * Math.abs(item.offset_min),
                    });
                  }}
                  className={inputCls}
                >
                  <option value="before">{t("before")}</option>
                  <option value="after">{t("after")}</option>
                </select>
                <input
                  type="number"
                  min={0}
                  max={1440}
                  value={Math.abs(item.offset_min)}
                  aria-label={t("offsetMinutes")}
                  onChange={(e) => {
                    const effectiveDir = item.dir ?? (item.offset_min < 0 ? -1 : 1);
                    patch(idx, {
                      dir: effectiveDir,
                      offset_min:
                        effectiveDir * Math.min(1440, Math.abs(Number(e.target.value) || 0)),
                    });
                  }}
                  className={`${inputCls} w-20`}
                />
                <span className="font-mono text-xs text-secondary">
                  {formatShowOffset(item.offset_min)}
                </span>
              </span>
            ) : (
              <input
                type="time"
                value={minutesToClock(item.offset_min)}
                aria-label={t("fixedTime")}
                onChange={(e) => patch(idx, { offset_min: clockToMinutes(e.target.value) })}
                className={inputCls}
              />
            )}
            <input
              type="number"
              min={0}
              max={1440}
              value={item.duration_min ?? ""}
              placeholder={t("durationMin")}
              aria-label={t("durationMin")}
              onChange={(e) =>
                patch(idx, {
                  duration_min: Number(e.target.value) > 0 ? Number(e.target.value) : undefined,
                })
              }
              className={`${inputCls} w-20`}
            />
            <span className="flex shrink-0 items-center gap-0.5">
              <button
                disabled={idx === 0}
                aria-label={t("moveUp")}
                onClick={() => move(idx, -1)}
                className="flex h-7 w-7 items-center justify-center rounded text-secondary hover:bg-fill-control disabled:opacity-30"
              >
                ↑
              </button>
              <button
                disabled={idx === items.length - 1}
                aria-label={t("moveDown")}
                onClick={() => move(idx, 1)}
                className="flex h-7 w-7 items-center justify-center rounded text-secondary hover:bg-fill-control disabled:opacity-30"
              >
                ↓
              </button>
              <button
                aria-label={t("deleteItem")}
                onClick={() => setItems((list) => list.filter((_, i) => i !== idx))}
                className="rounded px-1.5 py-0.5 text-xs text-danger hover:bg-danger-subtle"
              >
                🗑
              </button>
            </span>
          </li>
        ))}
      </ul>

      <button
        onClick={() =>
          setItems((list) => [...list, { title: "", offset_min: 0, type: "schedule" }])
        }
        className="btn-quiet h-7 px-2.5"
      >
        + {t("addItem")}
      </button>

      <div className="flex items-center gap-2">
        <button
          disabled={pending || !name.trim() || items.some((i) => !i.title.trim())}
          onClick={() =>
            onSave({
              id: initial?.id,
              name,
              items: items.map(
                (it): ScheduleTemplateItem => ({
                  title: it.title,
                  offset_min: it.offset_min,
                  duration_min: it.duration_min,
                  type: it.type,
                  anchor: it.anchor,
                }),
              ),
            })
          }
          className="btn-primary h-8 px-3 disabled:opacity-50"
        >
          {tc("save")}
        </button>
        <button onClick={onCancel} className="btn-quiet h-8 px-3">
          {tc("cancel")}
        </button>
        {onDelete && (
          <button
            disabled={pending}
            onClick={onDelete}
            className="ml-auto rounded px-2 py-1 text-xs text-danger hover:bg-danger-subtle"
          >
            {t("delete")}
          </button>
        )}
      </div>
    </div>
  );
}
