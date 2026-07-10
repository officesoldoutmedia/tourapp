"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/browser";
import {
  createShareLink,
  deleteAttachment,
  deleteTask,
  getAttachmentUrl,
  recordAttachment,
  toggleTaskComplete,
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

// ── Attachments [C §6.13] ───────────────────────────────────────────
export interface AttachmentData {
  id: string;
  file_name: string;
  size_bytes: number | null;
  tags: string[];
}

export function AttachmentsSection({
  orgSlug,
  tourId,
  date,
  dayId,
  orgId,
  attachments,
  canEdit,
  parentType = "day",
}: {
  orgSlug: string;
  tourId: string;
  date: string;
  dayId: string;
  orgId: string;
  attachments: AttachmentData[];
  canEdit: boolean;
  parentType?: "tour" | "day";
}) {
  const t = useTranslations("attachments");
  const [pending, startTransition] = useTransition();
  const [uploading, setUploading] = useState(false);
  const [tags, setTags] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function upload(file: File) {
    setUploading(true);
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
      setUploading(false);
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
        tags: tags.split(",").map((tag) => tag.trim()).filter(Boolean),
      });
      setUploading(false);
      setTags("");
    });
  }

  function download(id: string) {
    startTransition(async () => {
      const r = await getAttachmentUrl(orgSlug, id);
      if (r.url) window.open(r.url, "_blank");
    });
  }

  return (
    <section className="space-y-3">
      <h2 className="font-display text-lg font-semibold tracking-tight">{t("title")}</h2>

      {attachments.length === 0 && (
        <p className="text-sm text-tertiary">{t("empty")}</p>
      )}

      <ul className="divide-y divide-hairline rounded-[12px] border border-hairline bg-surface empty:hidden">
        {attachments.map((att) => (
          <li key={att.id} className="flex items-center gap-2 px-3 py-2 text-sm">
            <span className="min-w-0 flex-1 truncate">📎 {att.file_name}</span>
            {att.tags.map((tag) => (
              <span key={tag} className="rounded-full bg-inset px-2 py-0.5 text-[10px] text-secondary">
                {tag}
              </span>
            ))}
            {att.size_bytes != null && (
              <span className="text-xs text-tertiary">
                {(att.size_bytes / 1024 / 1024).toFixed(1)} MB
              </span>
            )}
            <button
              disabled={pending}
              onClick={() => download(att.id)}
              className="rounded border border-hairline px-2 py-0.5 text-xs"
            >
              ⬇ {t("download")}
            </button>
            {canEdit && (
              <button
                disabled={pending}
                onClick={() =>
                  startTransition(async () => {
                    await deleteAttachment(orgSlug, tourId, date, att.id);
                  })
                }
                className="rounded px-1.5 py-0.5 text-xs text-danger hover:bg-danger-subtle"
              >
                🗑
              </button>
            )}
          </li>
        ))}
      </ul>

      {canEdit && (
        <div className="flex flex-wrap items-center gap-2">
          <label className="btn-quiet h-7 px-2.5cursor-pointer ">
            {uploading ? t("uploading") : `⬆ ${t("upload")}`}
            <input
              type="file"
              className="hidden"
              disabled={uploading}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void upload(file);
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
