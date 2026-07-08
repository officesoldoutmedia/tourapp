"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  addFieldToEvent,
  deleteLaborCall,
  removeFieldFromEvent,
  setEventFieldValue,
  toggleHiddenField,
  updateLocalCrew,
  upsertLaborCall,
  type LaborCallRow,
} from "../actions";

export interface FieldDef {
  key: string;
  section: string;
  subgroup: string | null;
  field_type: string;
  custom_label: string | null;
}

export interface EventPageData {
  eventId: string;
  values: Record<string, string>;
  hidden: string[];
  localCrew: Record<string, string>;
  laborCalls: (LaborCallRow & { id: string })[];
}

const FIELD_SECTIONS = ["production", "facilities", "equipment", "logistics"] as const;

export function EventSections({
  orgSlug,
  data,
  defs,
  canEdit,
  canManageHidden,
}: {
  orgSlug: string;
  data: EventPageData;
  defs: FieldDef[];
  canEdit: boolean;
  canManageHidden: boolean;
}) {
  const t = useTranslations("events");
  const tf = useTranslations("fields");
  const tsec = useTranslations("sections");
  const tsub = useTranslations("subgroups");
  const router = useRouter();
  const [tab, setTab] = useState<string>("production");
  const [pending, startTransition] = useTransition();

  function run(fn: () => Promise<{ error?: string }>) {
    startTransition(async () => {
      await fn();
      router.refresh();
    });
  }

  function label(def: FieldDef): string {
    if (def.custom_label) return def.custom_label;
    try {
      return tf(def.key);
    } catch {
      return def.key.split(".").pop() ?? def.key;
    }
  }

  const hiddenSet = new Set(data.hidden);
  const sectionDefs = defs.filter((d) => d.section === tab);
  const withValue = sectionDefs.filter((d) => d.key in data.values);
  const available = sectionDefs.filter(
    (d) => !(d.key in data.values) && !hiddenSet.has(d.key),
  );

  return (
    <section className="space-y-4">
      <nav className="flex flex-wrap gap-1 border-b border-neutral-200 text-sm">
        {[...FIELD_SECTIONS, "local_crew", "labor_call"].map((s) => (
          <button
            key={s}
            onClick={() => setTab(s)}
            className={`rounded-t px-3 py-1.5 font-medium ${tab === s ? "border border-b-0 border-neutral-200 bg-white" : "text-neutral-500 hover:text-neutral-800"}`}
          >
            {tsec(s)}
          </button>
        ))}
      </nav>

      {FIELD_SECTIONS.includes(tab as (typeof FIELD_SECTIONS)[number]) && (
        <div className="space-y-3">
          {canEdit && available.length > 0 && (
            <select
              value=""
              onChange={(e) => {
                if (e.target.value)
                  run(() => addFieldToEvent(orgSlug, data.eventId, e.target.value));
              }}
              className="rounded border border-neutral-300 px-2 py-1 text-xs"
            >
              <option value="">+ {t("addField")}…</option>
              {available.map((def) => (
                <option key={def.key} value={def.key}>
                  {def.subgroup ? `${tsub(def.subgroup)} — ` : ""}
                  {label(def)}
                </option>
              ))}
            </select>
          )}

          <div className="grid gap-3 md:grid-cols-2">
            {withValue.map((def) => {
              const isHidden = hiddenSet.has(def.key);
              if (isHidden && !canManageHidden) return null;
              return (
                <div
                  key={def.key}
                  className={`space-y-1 rounded-md border p-2 ${isHidden ? "border-dashed border-neutral-300 opacity-60" : "border-neutral-200"}`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
                      {label(def)}
                    </span>
                    <span className="flex gap-1">
                      {canManageHidden && (
                        <button
                          disabled={pending}
                          title={isHidden ? t("showField") : t("hideField")}
                          onClick={() =>
                            run(() => toggleHiddenField(orgSlug, def.key, !isHidden))
                          }
                          className="rounded px-1 text-xs hover:bg-neutral-100"
                        >
                          👁
                        </button>
                      )}
                      {canEdit && (
                        <button
                          disabled={pending}
                          title={t("removeField")}
                          onClick={() =>
                            run(() => removeFieldFromEvent(orgSlug, data.eventId, def.key))
                          }
                          className="rounded px-1 text-xs text-red-600 hover:bg-red-50"
                        >
                          ×
                        </button>
                      )}
                    </span>
                  </div>
                  <textarea
                    defaultValue={data.values[def.key] ?? ""}
                    readOnly={!canEdit}
                    rows={2}
                    onBlur={(e) => {
                      if (canEdit && e.target.value !== (data.values[def.key] ?? "")) {
                        run(() =>
                          setEventFieldValue(orgSlug, data.eventId, def.key, e.target.value),
                        );
                      }
                    }}
                    className="w-full rounded border border-neutral-200 px-2 py-1 text-sm read-only:bg-neutral-50"
                  />
                </div>
              );
            })}
          </div>
        </div>
      )}

      {tab === "local_crew" && (
        <div className="grid gap-3 md:grid-cols-2">
          {(
            [
              ["local_union", "Local Union"],
              ["minimum_in", "Minimum In"],
              ["minimum_out", "Minimum Out"],
              ["penalties", "Penalties"],
              ["crew_comments", "Crew Comments"],
            ] as const
          ).map(([key, lbl]) => (
            <label key={key} className="block space-y-1">
              <span className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
                {lbl}
              </span>
              <textarea
                defaultValue={data.localCrew[key] ?? ""}
                readOnly={!canEdit}
                rows={2}
                onBlur={(e) => {
                  if (canEdit && e.target.value !== (data.localCrew[key] ?? "")) {
                    run(() =>
                      updateLocalCrew(orgSlug, data.eventId, { [key]: e.target.value }),
                    );
                  }
                }}
                className="w-full rounded border border-neutral-200 px-2 py-1 text-sm read-only:bg-neutral-50"
              />
            </label>
          ))}
        </div>
      )}

      {tab === "labor_call" && (
        <LaborCallGrid
          orgSlug={orgSlug}
          eventId={data.eventId}
          rows={data.laborCalls}
          canEdit={canEdit}
          pending={pending}
          run={run}
        />
      )}
    </section>
  );
}

function LaborCallGrid({
  orgSlug,
  eventId,
  rows,
  canEdit,
  pending,
  run,
}: {
  orgSlug: string;
  eventId: string;
  rows: (LaborCallRow & { id: string })[];
  canEdit: boolean;
  pending: boolean;
  run: (fn: () => Promise<{ error?: string }>) => void;
}) {
  const t = useTranslations("events");
  const [draft, setDraft] = useState<LaborCallRow>({
    call_time: "",
    day_offset: 0,
    call_count: "",
    worker_type: "",
    add_count: "",
    cut_count: "",
    notes: "",
  });

  return (
    <div className="space-y-2 overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="text-left text-xs uppercase text-neutral-500">
          <tr>
            <th className="px-2 py-1">{t("laborTime")}</th>
            <th className="px-2 py-1">{t("laborCall_col")}</th>
            <th className="px-2 py-1">{t("laborType")}</th>
            <th className="px-2 py-1">{t("laborAdd")}</th>
            <th className="px-2 py-1">{t("laborCut")}</th>
            <th className="px-2 py-1">Notes</th>
            <th />
          </tr>
        </thead>
        <tbody className="divide-y divide-neutral-100">
          {rows.map((row) => (
            <tr key={row.id}>
              <td className="px-2 py-1 font-mono text-xs">
                {row.call_time?.slice(0, 5) ?? "—"}
                {row.day_offset > 0 && <sup className="text-red-600">+1</sup>}
              </td>
              <td className="px-2 py-1">{row.call_count}</td>
              <td className="px-2 py-1">{row.worker_type}</td>
              <td className="px-2 py-1">{row.add_count}</td>
              <td className="px-2 py-1">{row.cut_count}</td>
              <td className="px-2 py-1 text-xs text-neutral-500">{row.notes}</td>
              <td className="px-2 py-1">
                {canEdit && (
                  <button
                    disabled={pending}
                    onClick={() => run(() => deleteLaborCall(orgSlug, row.id))}
                    className="text-xs text-red-600"
                  >
                    🗑
                  </button>
                )}
              </td>
            </tr>
          ))}
          {canEdit && (
            <tr>
              <td className="px-2 py-1">
                <span className="flex items-center gap-1">
                  <input
                    type="time"
                    value={draft.call_time ?? ""}
                    onChange={(e) => setDraft({ ...draft, call_time: e.target.value })}
                    className="rounded border border-neutral-300 px-1 py-0.5 text-xs"
                  />
                  <select
                    value={draft.day_offset}
                    onChange={(e) =>
                      setDraft({ ...draft, day_offset: Number(e.target.value) })
                    }
                    className="rounded border border-neutral-300 px-1 py-0.5 text-xs"
                  >
                    <option value={0}>{t("laborDayOf")}</option>
                    <option value={1}>{t("laborDayAfter")}</option>
                  </select>
                </span>
              </td>
              {(["call_count", "worker_type", "add_count", "cut_count", "notes"] as const).map(
                (key) => (
                  <td key={key} className="px-2 py-1">
                    <input
                      value={draft[key] ?? ""}
                      onChange={(e) => setDraft({ ...draft, [key]: e.target.value })}
                      className="w-full min-w-14 rounded border border-neutral-300 px-1 py-0.5 text-xs"
                    />
                  </td>
                ),
              )}
              <td className="px-2 py-1">
                <button
                  disabled={pending || (!draft.call_count && !draft.worker_type)}
                  onClick={() =>
                    run(async () => {
                      const r = await upsertLaborCall(orgSlug, eventId, draft);
                      if (!r.error)
                        setDraft({
                          call_time: "",
                          day_offset: 0,
                          call_count: "",
                          worker_type: "",
                          add_count: "",
                          cut_count: "",
                          notes: "",
                        });
                      return r;
                    })
                  }
                  className="rounded bg-neutral-900 px-2 py-0.5 text-xs text-white disabled:opacity-40"
                >
                  +
                </button>
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
