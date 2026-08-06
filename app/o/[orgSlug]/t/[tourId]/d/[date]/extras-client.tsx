"use client";

import { useMemo, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/browser";
import { versionChains } from "@/lib/fileVersions";
import {
  createExpectedFile,
  createShareLink,
  deleteAttachment,
  deleteTask,
  getAttachmentUrl,
  recordAttachment,
  toggleTaskComplete,
  updateAttachmentMeta,
  upsertTask,
} from "./extras-actions";

// ── Tasks [C §6.11]: overdue cu roșu ────────────────────────────────
export interface TaskData {
  id: string;
  title: string;
  due_at: string | null;
  is_complete: boolean;
}

export function TasksSection({
  orgSlug,
  tourId,
  date,
  dayId,
  tasks,
  canEdit,
}: {
  orgSlug: string;
  tourId: string;
  date: string;
  dayId: string;
  tasks: TaskData[];
  canEdit: boolean;
}) {
  const t = useTranslations("tasks");
  const [pending, startTransition] = useTransition();
  const [title, setTitle] = useState("");
  const [due, setDue] = useState("");

  function run(fn: () => Promise<{ error?: string }>) {
    startTransition(async () => {
      await fn();
    });
  }

  const [now] = useState(() => Date.now());

  return (
    <section className="space-y-3">
      <h2 className="font-display text-lg font-semibold tracking-tight">{t("title")}</h2>

      {tasks.length === 0 && <p className="text-sm text-tertiary">{t("empty")}</p>}

      <ul className="divide-y divide-hairline rounded-[12px] border border-hairline bg-surface empty:hidden">
        {tasks.map((task) => {
          const overdue =
            !task.is_complete && task.due_at !== null && Date.parse(task.due_at) < now;
          return (
            <li key={task.id} className="flex items-center gap-2 px-3 py-2 text-sm">
              <input
                type="checkbox"
                checked={task.is_complete}
                disabled={!canEdit || pending}
                onChange={(e) =>
                  run(() => toggleTaskComplete(orgSlug, tourId, date, task.id, e.target.checked))
                }
              />
              <span className={`min-w-0 flex-1 ${task.is_complete ? "text-tertiary line-through" : ""}`}>
                {task.title}
              </span>
              {task.due_at && (
                <span className="text-xs text-secondary">{task.due_at.slice(0, 10)}</span>
              )}
              {overdue && (
                // [C] overdue = text roșu
                <span className="text-xs font-bold text-danger">{t("overdue")}</span>
              )}
              {canEdit && (
                <button
                  disabled={pending}
                  onClick={() => run(() => deleteTask(orgSlug, tourId, date, task.id))}
                  className="rounded px-1.5 py-0.5 text-xs text-danger hover:bg-danger-subtle"
                >
                  🗑
                </button>
              )}
            </li>
          );
        })}
      </ul>

      {canEdit && (
        <div className="flex flex-wrap gap-2">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={t("taskTitle")}
            className="min-w-40 flex-1 rounded border border-hairline px-2 py-1 text-sm"
          />
          <input
            type="date"
            value={due}
            onChange={(e) => setDue(e.target.value)}
            title={t("due")}
            className="rounded border border-hairline px-2 py-1 text-sm"
          />
          <button
            disabled={pending || !title.trim()}
            onClick={() =>
              run(async () => {
                const r = await upsertTask(orgSlug, tourId, date, {
                  dayId,
                  title,
                  dueAt: due ? new Date(`${due}T23:59:59`).toISOString() : null,
                });
                if (!r.error) {
                  setTitle("");
                  setDue("");
                }
                return r;
              })
            }
            className="btn-quiet h-7 px-2.5 disabled:opacity-40"
          >
            + {t("add")}
          </button>
        </div>
      )}
    </section>
  );
}

// ── Attachments [C §6.13][SP3b §1]: categorii, versiuni, placeholdere ──
export interface AttachmentData {
  id: string;
  file_name: string;
  size_bytes: number | null;
  tags: string[];
  storage_path: string | null; // null = placeholder ("fișier așteptat")
  category_id: string | null;
  status: "draft" | "approved" | "final" | "superseded";
  due_date: string | null;
  supersedes_id: string | null;
  created_at: string;
}

export interface FileCategoryData {
  id: string;
  name: string;
}

// Fișierele permanente ale artistului, moștenite read-only pe zi [SP1].
export interface InheritedFileData {
  id: string;
  file_name: string;
  storage_path: string | null;
  category_id: string | null;
}

function statusLabel(t: (key: string) => string, status: string): string {
  if (status === "draft") return t("statusDraft");
  if (status === "approved") return t("statusApproved");
  if (status === "final") return t("statusFinal");
  return t("statusSuperseded");
}

export function AttachmentsSection({
  orgSlug,
  tourId,
  date,
  dayId,
  orgId,
  attachments,
  categories,
  inheritedFiles,
  todayKey,
  canEdit,
  parentType = "day",
}: {
  orgSlug: string;
  tourId: string;
  date: string;
  dayId: string;
  orgId: string;
  attachments: AttachmentData[];
  categories: FileCategoryData[];
  inheritedFiles: InheritedFileData[];
  todayKey: string;
  canEdit: boolean;
  parentType?: "tour" | "day";
}) {
  const t = useTranslations("attachments");
  const tc = useTranslations("common");
  const [pending, startTransition] = useTransition();
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const [tags, setTags] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [openHistory, setOpenHistory] = useState<Set<string>>(new Set());
  const [expectOpen, setExpectOpen] = useState(false);
  const [expectCategory, setExpectCategory] = useState("");
  const [expectDue, setExpectDue] = useState("");
  const [expectName, setExpectName] = useState("");

  function run(fn: () => Promise<{ error?: string }>) {
    startTransition(async () => {
      await fn();
    });
  }

  function toggleHistory(id: string) {
    setOpenHistory((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function uploadFile(
    file: File,
    opts: {
      supersedesId?: string;
      placeholderId?: string;
      categoryId?: string | null;
      dueDate?: string | null;
    } = {},
  ) {
    const key = opts.supersedesId ?? opts.placeholderId ?? "new";
    setUploadingId(key);
    setError(null);
    const supabase = createClient();
    // path: {orgId}/tours/{tourId}/[days/{date}/]{uuid}-{nume} [N §6.13]
    const path =
      parentType === "tour"
        ? `${orgId}/tours/${tourId}/${crypto.randomUUID()}-${file.name}`
        : `${orgId}/tours/${tourId}/days/${date}/${crypto.randomUUID()}-${file.name}`;
    const { error: upError } = await supabase.storage
      .from("attachments")
      .upload(path, file);
    if (upError) {
      setError(`${t("needsStack")} (${upError.message})`);
      setUploadingId(null);
      return;
    }
    startTransition(async () => {
      await recordAttachment(orgSlug, tourId, date, {
        parentType,
        parentId: parentType === "tour" ? tourId : dayId,
        fileName: file.name,
        storagePath: path,
        mimeType: file.type,
        sizeBytes: file.size,
        tags: opts.placeholderId ? [] : tags.split(",").map((tag) => tag.trim()).filter(Boolean),
        categoryId: opts.categoryId,
        dueDate: opts.dueDate,
        supersedesId: opts.supersedesId ?? null,
        placeholderId: opts.placeholderId ?? null,
      });
      setUploadingId(null);
      if (!opts.supersedesId && !opts.placeholderId) setTags("");
    });
  }

  function download(id: string) {
    startTransition(async () => {
      const r = await getAttachmentUrl(orgSlug, id);
      if (r.url) window.open(r.url, "_blank");
    });
  }

  const chains = useMemo(() => versionChains(attachments), [attachments]);

  const categorySections = useMemo(() => {
    const grouped = new Map<string, typeof chains>();
    for (const chain of chains) {
      const key = chain.head.category_id ?? "";
      const list = grouped.get(key);
      if (list) list.push(chain);
      else grouped.set(key, [chain]);
    }
    const knownIds = new Set(categories.map((cat) => cat.id));
    const sections = categories
      .filter((cat) => grouped.has(cat.id))
      .map((cat) => ({ id: cat.id, name: cat.name, chains: grouped.get(cat.id)! }));
    // Bucket-ul „Fără categorie" strânge atât fișierele fără categorie
    // (key "") cât și cele cu un category_id care nu mai există în lista
    // de categorii primite (categorie soft-deleted) — altfel dispar din UI
    // fără nicio cale de recuperare [review fix #1].
    const uncategorized = [...grouped.entries()]
      .filter(([key]) => key === "" || !knownIds.has(key))
      .flatMap(([, list]) => list);
    if (uncategorized.length > 0) sections.push({ id: "", name: t("uncategorized"), chains: uncategorized });
    return sections;
  }, [chains, categories, t]);

  const uploadBtnCls = `btn-quiet h-6 px-2 text-[10px] cursor-pointer ${uploadingId ? "opacity-50" : ""}`;

  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2">
        <h2 className="mr-auto font-display text-lg font-semibold tracking-tight">{t("title")}</h2>
        {canEdit && (
          <button
            onClick={() => setExpectOpen((v) => !v)}
            className="btn-quiet h-7 px-2.5"
          >
            + {t("expectFile")}
          </button>
        )}
      </div>

      {canEdit && expectOpen && (
        <div className="flex flex-wrap items-center gap-2 rounded-[10px] border border-dashed border-hairline p-2.5">
          <select
            value={expectCategory}
            onChange={(e) => setExpectCategory(e.target.value)}
            className="rounded border border-hairline px-2 py-1 text-xs"
          >
            <option value="">{t("categoryLabel")}…</option>
            {categories.map((cat) => (
              <option key={cat.id} value={cat.id}>
                {cat.name}
              </option>
            ))}
          </select>
          <input
            type="date"
            value={expectDue}
            onChange={(e) => setExpectDue(e.target.value)}
            title={t("dueLabel")}
            className="rounded border border-hairline px-2 py-1 text-xs"
          />
          <input
            value={expectName}
            onChange={(e) => setExpectName(e.target.value)}
            placeholder={t("expected")}
            className="w-40 rounded border border-hairline px-2 py-1 text-xs"
          />
          <button
            disabled={pending || !expectCategory}
            onClick={() =>
              run(async () => {
                const r = await createExpectedFile(orgSlug, tourId, date, {
                  dayId,
                  categoryId: expectCategory,
                  dueDate: expectDue || null,
                  fileName: expectName.trim() || undefined,
                });
                if (!r.error) {
                  setExpectCategory("");
                  setExpectDue("");
                  setExpectName("");
                  setExpectOpen(false);
                }
                return r;
              })
            }
            className="btn-quiet h-7 px-2.5 disabled:opacity-40"
          >
            {tc("add")}
          </button>
        </div>
      )}

      {chains.length === 0 && <p className="text-sm text-tertiary">{t("empty")}</p>}

      {categorySections.map((section) => (
        <div key={section.id || "uncategorized"} className="space-y-1.5">
          <p className="eyebrow">{section.name}</p>
          <ul className="divide-y divide-hairline rounded-[12px] border border-hairline bg-surface">
            {section.chains.map((chain) => {
              const head = chain.head;
              const isPlaceholder = head.storage_path === null;
              const overdue =
                head.due_date !== null &&
                head.due_date < todayKey &&
                (isPlaceholder || head.status !== "final");
              return (
                <li
                  key={head.id}
                  className={`flex flex-wrap items-center gap-2 px-3 py-2 text-sm ${
                    isPlaceholder ? "border-l-2 border-dashed border-hairline bg-inset/40" : ""
                  }`}
                >
                  <span className={`min-w-0 flex-1 truncate ${isPlaceholder ? "italic text-tertiary" : ""}`}>
                    {isPlaceholder ? "▢" : "📎"} {head.file_name}
                  </span>
                  {chain.version > 1 && (
                    <span className="rounded-full bg-accent-subtle px-1.5 py-0.5 text-[9px] font-semibold text-accent-soft">
                      v{chain.version}
                    </span>
                  )}
                  {head.tags.map((tag) => (
                    <span key={tag} className="rounded-full bg-inset px-2 py-0.5 text-[10px] text-secondary">
                      {tag}
                    </span>
                  ))}
                  {isPlaceholder ? (
                    <span className="rounded-full bg-warning-subtle px-2 py-0.5 text-[10px] font-medium text-warning">
                      {t("expected")}
                    </span>
                  ) : canEdit ? (
                    <select
                      value={head.status}
                      disabled={pending}
                      onChange={(e) =>
                        run(() =>
                          updateAttachmentMeta(orgSlug, tourId, date, head.id, {
                            status: e.target.value as "draft" | "approved" | "final",
                          }),
                        )
                      }
                      className="rounded-full border border-hairline px-1.5 py-0.5 text-[10px]"
                    >
                      <option value="draft">{t("statusDraft")}</option>
                      <option value="approved">{t("statusApproved")}</option>
                      <option value="final">{t("statusFinal")}</option>
                    </select>
                  ) : (
                    <span className="rounded-full bg-inset px-2 py-0.5 text-[10px] text-secondary">
                      {statusLabel(t, head.status)}
                    </span>
                  )}
                  {canEdit && (
                    <select
                      value={head.category_id ?? ""}
                      disabled={pending}
                      aria-label={t("categoryLabel")}
                      onChange={(e) =>
                        run(() =>
                          updateAttachmentMeta(orgSlug, tourId, date, head.id, {
                            categoryId: e.target.value || null,
                          }),
                        )
                      }
                      className="rounded border border-hairline px-1.5 py-0.5 text-[10px]"
                    >
                      <option value="">{t("uncategorized")}</option>
                      {categories.map((cat) => (
                        <option key={cat.id} value={cat.id}>
                          {cat.name}
                        </option>
                      ))}
                    </select>
                  )}
                  {head.due_date && (
                    <span className={`text-[10px] ${overdue ? "font-bold text-danger" : "text-tertiary"}`}>
                      {t("dueLabel")} {head.due_date}
                      {overdue && ` · ${t("overdue")}`}
                    </span>
                  )}
                  {head.size_bytes != null && (
                    <span className="text-[10px] text-tertiary">
                      {(head.size_bytes / 1024 / 1024).toFixed(1)} MB
                    </span>
                  )}
                  {!isPlaceholder && (
                    <button
                      disabled={pending}
                      onClick={() => download(head.id)}
                      className="rounded border border-hairline px-2 py-0.5 text-[10px]"
                    >
                      ⬇ {t("download")}
                    </button>
                  )}
                  {canEdit &&
                    (isPlaceholder ? (
                      <label className={uploadBtnCls}>
                        {uploadingId === head.id ? t("uploading") : `⬆ ${t("upload")}`}
                        <input
                          type="file"
                          className="hidden"
                          disabled={uploadingId !== null}
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) void uploadFile(file, { placeholderId: head.id });
                            e.target.value = "";
                          }}
                        />
                      </label>
                    ) : (
                      <label className={uploadBtnCls}>
                        {uploadingId === head.id ? t("uploading") : t("newVersion")}
                        <input
                          type="file"
                          className="hidden"
                          disabled={uploadingId !== null}
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file)
                              void uploadFile(file, {
                                supersedesId: head.id,
                                categoryId: head.category_id,
                                dueDate: head.due_date,
                              });
                            e.target.value = "";
                          }}
                        />
                      </label>
                    ))}
                  {chain.history.length > 0 && (
                    <button
                      onClick={() => toggleHistory(head.id)}
                      className="text-[10px] text-accent hover:underline"
                    >
                      {t("history")} ({chain.history.length})
                    </button>
                  )}
                  {canEdit && (
                    <button
                      disabled={pending}
                      onClick={() => run(() => deleteAttachment(orgSlug, tourId, date, head.id))}
                      className="rounded px-1.5 py-0.5 text-xs text-danger hover:bg-danger-subtle"
                    >
                      🗑
                    </button>
                  )}
                  {openHistory.has(head.id) && chain.history.length > 0 && (
                    <ul className="ml-6 w-full space-y-1 border-l border-hairline pl-3">
                      {chain.history.map((h) => (
                        <li key={h.id} className="flex items-center gap-2 text-[10.5px] text-tertiary">
                          <span className="min-w-0 flex-1 truncate">{h.file_name}</span>
                          <button onClick={() => download(h.id)} className="text-accent hover:underline">
                            ⬇ {t("download")}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      ))}

      {canEdit && (
        <div className="flex flex-wrap items-center gap-2">
          <label className={`btn-quiet h-7 px-2.5 cursor-pointer ${uploadingId ? "opacity-50" : ""}`}>
            {uploadingId === "new" ? t("uploading") : `⬆ ${t("upload")}`}
            <input
              type="file"
              className="hidden"
              disabled={uploadingId !== null}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void uploadFile(file);
                e.target.value = "";
              }}
            />
          </label>
          <input
            value={tags}
            onChange={(e) => setTags(e.target.value)}
            placeholder={t("tags")}
            className="w-48 rounded border border-hairline px-2 py-1 text-xs"
          />
          {error && <span className="text-xs text-danger">{error}</span>}
        </div>
      )}

      {inheritedFiles.length > 0 && (
        <div className="space-y-1.5 pt-2">
          <p className="eyebrow">{t("inherited")}</p>
          <ul className="divide-y divide-hairline rounded-[12px] border border-hairline bg-surface">
            {inheritedFiles.map((f) => (
              <li key={f.id} className="flex items-center gap-2 px-3 py-2 text-sm">
                <span className="min-w-0 flex-1 truncate text-secondary">📎 {f.file_name}</span>
                <span className="rounded-full bg-inset px-2 py-0.5 text-[10px] text-secondary">
                  {t("inherited")}
                </span>
                {f.storage_path && (
                  <button
                    disabled={pending}
                    onClick={() => download(f.id)}
                    className="rounded border border-hairline px-2 py-0.5 text-[10px]"
                  >
                    ⬇ {t("download")}
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

// ── Bara de share + PDF a zilei [N §6.3.4] ──────────────────────────
export function DayActionsBar({
  orgSlug,
  dayId,
  canEdit,
}: {
  orgSlug: string;
  dayId: string;
  canEdit: boolean;
}) {
  const t = useTranslations("day");
  const [pending, startTransition] = useTransition();
  const [url, setUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      <a
        href={`/api/pdf/daysheet/${dayId}?rooms=1`}
        target="_blank"
        className="rounded border border-hairline px-3 py-1 font-medium"
      >
        🖨 {t("pdf")}
      </a>
      {canEdit && !url && (
        <button
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const r = await createShareLink(orgSlug, dayId, null);
              if (r.url) setUrl(r.url);
            })
          }
          className="rounded border border-hairline px-3 py-1 font-medium disabled:opacity-40"
        >
          🔗 {t("share")}
        </button>
      )}
      {url && (
        <button
          onClick={() => {
            void navigator.clipboard.writeText(url);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          }}
          className="max-w-72 truncate rounded bg-inset px-3 py-1 font-mono"
          title={url}
        >
          {copied ? t("copied") : url}
        </button>
      )}
    </div>
  );
}
