"use client";

/** C3 — editor de blocuri pe template: nume, tip, reguli de match, serie,
 *  emitent, blocuri de text (Titlu/Paragraf) cu chips de inserare pentru
 *  merge fields; reordonare ↑↓; ștergere template. Pattern EXACT
 *  schedule-templates/templates-client.tsx (C2). */
import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { MERGE_FIELD_KEYS, listMergeFields, type ContractBlock } from "@/lib/contractMerge";
import { deleteContractTemplate, saveContractTemplate, type ContractTemplateInput } from "./actions";

interface TemplateData {
  id: string;
  name: string;
  docKind: string;
  body: ContractBlock[];
  matchRole: string;
  matchEntityType: string;
  issuingEntityId: string;
  seriesPrefix: string;
  seriesNext: number;
}
interface EntityOption {
  id: string;
  name: string;
}

const inputCls = "rounded border border-hairline bg-surface px-2 py-1 text-sm";
const ENTITY_TYPES = ["srl", "pfa", "ii", "individual", "foreign"] as const;

export function TemplatesClient({
  orgSlug,
  templates,
  entities,
}: {
  orgSlug: string;
  templates: TemplateData[];
  entities: EntityOption[];
}) {
  const t = useTranslations("contractTemplates");
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

  const entityName = (id: string) => entities.find((e) => e.id === id)?.name;

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
                entities={entities}
                pending={pending}
                onCancel={() => setOpenId(null)}
                onSave={(input) => run(() => saveContractTemplate(orgSlug, input))}
                onDelete={() => {
                  if (window.confirm(`${t("delete")}?`)) {
                    run(() => deleteContractTemplate(orgSlug, tpl.id));
                  }
                }}
              />
            ) : (
              <div className="flex items-center gap-3">
                <span className="min-w-0 flex-1">
                  <span className="text-sm font-medium">{tpl.name}</span>
                  <span className="block text-xs text-secondary">
                    {tpl.docKind === "framework" ? t("kindFramework") : t("kindAnnex")}
                    {tpl.seriesPrefix && ` · ${tpl.seriesPrefix}${tpl.seriesNext}`}
                    {entityName(tpl.issuingEntityId) && ` · ${entityName(tpl.issuingEntityId)}`}
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
            entities={entities}
            pending={pending}
            onCancel={() => setCreating(false)}
            onSave={(input) => run(() => saveContractTemplate(orgSlug, input))}
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
  entities,
  pending,
  onCancel,
  onSave,
  onDelete,
}: {
  initial: TemplateData | null;
  entities: EntityOption[];
  pending: boolean;
  onCancel: () => void;
  onSave: (input: ContractTemplateInput) => void;
  onDelete?: () => void;
}) {
  const t = useTranslations("contractTemplates");
  const tc = useTranslations("common");
  const [name, setName] = useState(initial?.name ?? "");
  const [docKind, setDocKind] = useState(initial?.docKind ?? "annex");
  const [matchRole, setMatchRole] = useState(initial?.matchRole ?? "");
  const [matchEntityType, setMatchEntityType] = useState(initial?.matchEntityType ?? "");
  const [issuingEntityId, setIssuingEntityId] = useState(initial?.issuingEntityId ?? "");
  const [seriesPrefix, setSeriesPrefix] = useState(initial?.seriesPrefix ?? "");
  const [seriesNext, setSeriesNext] = useState(initial?.seriesNext ?? 1);
  // Baseline încărcat la deschiderea formularului — NU se schimbă odată cu
  // editarea câmpului de mai sus; server action-ul îl folosește ca să
  // detecteze dacă seria a fost chiar modificată (vezi actions.ts).
  const [initialSeriesNext] = useState(initial?.seriesNext ?? 1);
  const [body, setBody] = useState<ContractBlock[]>(initial?.body ?? []);
  const [focusedIdx, setFocusedIdx] = useState<number | null>(null);

  function patchBlock(idx: number, part: Partial<ContractBlock>) {
    setBody((list) => list.map((b, i) => (i === idx ? { ...b, ...part } : b)));
  }
  function moveBlock(idx: number, dir: -1 | 1) {
    setBody((list) => {
      const next = [...list];
      const swap = idx + dir;
      if (swap < 0 || swap >= next.length) return list;
      [next[idx], next[swap]] = [next[swap], next[idx]];
      return next;
    });
  }
  function removeBlock(idx: number) {
    setBody((list) => list.filter((_, i) => i !== idx));
    setFocusedIdx((f) => (f === idx ? null : f));
  }
  function insertField(key: string) {
    setBody((list) => {
      if (list.length === 0) return list;
      const idx = focusedIdx !== null && focusedIdx < list.length ? focusedIdx : list.length - 1;
      return list.map((b, i) => (i === idx ? { ...b, text: `${b.text}{{${key}}}` } : b));
    });
  }

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
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
        <label className="block space-y-1">
          <span className="text-xs font-semibold uppercase tracking-wide text-secondary">
            {t("kindLabel")}
          </span>
          <select
            value={docKind}
            onChange={(e) => setDocKind(e.target.value)}
            className={`${inputCls} w-full`}
          >
            <option value="framework">{t("kindFramework")}</option>
            <option value="annex">{t("kindAnnex")}</option>
          </select>
        </label>
        <label className="block space-y-1">
          <span className="text-xs font-semibold uppercase tracking-wide text-secondary">
            {t("matchRole")}
          </span>
          <input
            value={matchRole}
            onChange={(e) => setMatchRole(e.target.value)}
            placeholder="VJ"
            className={`${inputCls} w-full`}
          />
        </label>
        <label className="block space-y-1">
          <span className="text-xs font-semibold uppercase tracking-wide text-secondary">
            {t("matchEntityType")}
          </span>
          <select
            value={matchEntityType}
            onChange={(e) => setMatchEntityType(e.target.value)}
            className={`${inputCls} w-full`}
          >
            <option value="">—</option>
            {ENTITY_TYPES.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        </label>
        <label className="block space-y-1">
          <span className="text-xs font-semibold uppercase tracking-wide text-secondary">
            {t("issuer")}
          </span>
          <select
            value={issuingEntityId}
            onChange={(e) => setIssuingEntityId(e.target.value)}
            className={`${inputCls} w-full`}
          >
            <option value="">—</option>
            {entities.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block space-y-1">
          <span className="text-xs font-semibold uppercase tracking-wide text-secondary">
            {t("seriesPrefix")}
          </span>
          <input
            value={seriesPrefix}
            onChange={(e) => setSeriesPrefix(e.target.value)}
            placeholder="ANX-2026-"
            className={`${inputCls} w-full`}
          />
        </label>
        <label className="block space-y-1">
          <span className="text-xs font-semibold uppercase tracking-wide text-secondary">
            {t("seriesNext")}
          </span>
          <input
            type="number"
            min={1}
            value={seriesNext}
            onChange={(e) => setSeriesNext(Math.max(1, Math.round(Number(e.target.value) || 1)))}
            className={`${inputCls} w-full`}
          />
        </label>
      </div>

      <ul className="space-y-2">
        {body.map((block, idx) => (
          <li key={idx} className="space-y-1 rounded-md border border-hairline p-2">
            <div className="flex items-center gap-2">
              <select
                value={block.kind}
                aria-label={t("kindLabel")}
                onChange={(e) =>
                  patchBlock(idx, { kind: e.target.value === "heading" ? "heading" : "paragraph" })
                }
                className={inputCls}
              >
                <option value="heading">{t("blockHeading")}</option>
                <option value="paragraph">{t("blockParagraph")}</option>
              </select>
              <span className="ml-auto flex shrink-0 items-center gap-0.5">
                <button
                  disabled={idx === 0}
                  aria-label={t("moveUp")}
                  onClick={() => moveBlock(idx, -1)}
                  className="flex h-7 w-7 items-center justify-center rounded text-secondary hover:bg-fill-control disabled:opacity-30"
                >
                  ↑
                </button>
                <button
                  disabled={idx === body.length - 1}
                  aria-label={t("moveDown")}
                  onClick={() => moveBlock(idx, 1)}
                  className="flex h-7 w-7 items-center justify-center rounded text-secondary hover:bg-fill-control disabled:opacity-30"
                >
                  ↓
                </button>
                <button
                  aria-label={t("deleteBlock")}
                  onClick={() => removeBlock(idx)}
                  className="rounded px-1.5 py-0.5 text-xs text-danger hover:bg-danger-subtle"
                >
                  🗑
                </button>
              </span>
            </div>
            <textarea
              value={block.text}
              onFocus={() => setFocusedIdx(idx)}
              onChange={(e) => patchBlock(idx, { text: e.target.value })}
              rows={3}
              className={`${inputCls} w-full`}
            />
          </li>
        ))}
      </ul>

      <button
        onClick={() => setBody((list) => [...list, { kind: "paragraph", text: "" }])}
        className="btn-quiet h-7 px-2.5"
      >
        + {t("addBlock")}
      </button>

      <div className="space-y-1">
        <span className="text-xs font-semibold uppercase tracking-wide text-secondary">
          {t("insertField")}
        </span>
        <div className="flex flex-wrap gap-1">
          {MERGE_FIELD_KEYS.map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => insertField(key)}
              className="rounded-full border border-hairline px-2 py-0.5 font-mono text-[11px] text-secondary hover:bg-fill-control"
            >
              {key}
            </button>
          ))}
        </div>
      </div>

      <p className="text-xs text-secondary">
        {t("usedFields")} {listMergeFields(body).join(", ")}
      </p>

      <div className="flex items-center gap-2">
        <button
          disabled={pending || !name.trim() || body.some((b) => !b.text.trim())}
          onClick={() =>
            onSave({
              id: initial?.id,
              name,
              docKind,
              body,
              matchRole,
              matchEntityType,
              issuingEntityId,
              seriesPrefix,
              seriesNext,
              initialSeriesNext,
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
