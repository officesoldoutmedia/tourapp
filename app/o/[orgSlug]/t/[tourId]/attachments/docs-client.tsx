"use client";

/**
 * Documentele turului (Graphite) — listă cu iconițe pe tip, căutare,
 * filtru pe tag, upload cu tag-uri. Folosește aceleași server actions
 * ca secțiunea de attachments a zilei (record/get-url/delete).
 */
import { useMemo, useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import {
  Download,
  File,
  FileImage,
  FileSpreadsheet,
  FileText,
  Film,
  Music,
  Search,
  Trash2,
  Upload,
} from "lucide-react";
import { createClient } from "@/lib/supabase/browser";
import { toast } from "@/components/ui/Toaster";
import {
  recordAttachment,
  getAttachmentUrl,
  deleteAttachment,
} from "../d/[date]/extras-actions";

export interface TourDocData {
  id: string;
  file_name: string;
  mime_type: string | null;
  size_bytes: number | null;
  tags: string[];
  created_at: string;
}

function TypeIcon({ mime, name }: { mime: string | null; name: string }) {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  const cls = "shrink-0 text-secondary";
  if (mime?.startsWith("image/")) return <FileImage size={16} strokeWidth={1.5} className={cls} />;
  if (mime?.startsWith("video/")) return <Film size={16} strokeWidth={1.5} className={cls} />;
  if (mime?.startsWith("audio/")) return <Music size={16} strokeWidth={1.5} className={cls} />;
  if (mime === "application/pdf" || ext === "pdf")
    return <FileText size={16} strokeWidth={1.5} className={cls} />;
  if (["xls", "xlsx", "csv", "numbers"].includes(ext))
    return <FileSpreadsheet size={16} strokeWidth={1.5} className={cls} />;
  if (["doc", "docx", "txt", "rtf", "pages"].includes(ext))
    return <FileText size={16} strokeWidth={1.5} className={cls} />;
  return <File size={16} strokeWidth={1.5} className={cls} />;
}

function formatSize(bytes: number | null): string {
  if (bytes == null) return "";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function TourDocuments({
  orgSlug,
  tourId,
  orgId,
  attachments,
  canEdit,
}: {
  orgSlug: string;
  tourId: string;
  orgId: string;
  attachments: TourDocData[];
  canEdit: boolean;
}) {
  const t = useTranslations("attachments");
  const locale = useLocale();
  const [pending, startTransition] = useTransition();
  const [uploading, setUploading] = useState(false);
  const [query, setQuery] = useState("");
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [tags, setTags] = useState("");

  const allTags = useMemo(
    () => [...new Set(attachments.flatMap((a) => a.tags))].sort(),
    [attachments],
  );

  const filtered = attachments.filter((att) => {
    if (activeTag && !att.tags.includes(activeTag)) return false;
    if (query.trim() && !att.file_name.toLowerCase().includes(query.trim().toLowerCase()))
      return false;
    return true;
  });

  const dateFmt = new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", year: "numeric" });

  async function upload(file: File) {
    setUploading(true);
    const supabase = createClient();
    const path = `${orgId}/tours/${tourId}/${crypto.randomUUID()}-${file.name}`;
    const { error } = await supabase.storage.from("attachments").upload(path, file);
    if (error) {
      toast(error.message, "danger");
      setUploading(false);
      return;
    }
    startTransition(async () => {
      await recordAttachment(orgSlug, tourId, "", {
        parentType: "tour",
        parentId: tourId,
        fileName: file.name,
        storagePath: path,
        mimeType: file.type,
        sizeBytes: file.size,
        tags: tags.split(",").map((tag) => tag.trim()).filter(Boolean),
      });
      setUploading(false);
      setTags("");
      toast(t("uploadedToast"));
    });
  }

  function download(id: string) {
    startTransition(async () => {
      const r = await getAttachmentUrl(orgSlug, id);
      if (r.url) window.open(r.url, "_blank");
    });
  }

  return (
    <div className="space-y-4">
      {/* căutare + filtru pe tag */}
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex h-[30px] w-56 items-center gap-2 rounded-[8px] border border-hairline bg-fill-control px-2.5">
          <Search size={13} strokeWidth={1.75} className="shrink-0 text-tertiary" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("search")}
            className="h-full min-w-0 flex-1 border-0 bg-transparent text-[12px] text-primary outline-none placeholder:text-tertiary"
            style={{ boxShadow: "none" }}
          />
        </label>
        {allTags.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              onClick={() => setActiveTag(null)}
              className={`rounded-full px-2.5 py-1 text-[11px] transition-colors ${activeTag === null ? "bg-fill-segment-active text-primary" : "text-secondary hover:text-primary"}`}
            >
              {t("allTags")}
            </button>
            {allTags.map((tag) => (
              <button
                key={tag}
                onClick={() => setActiveTag(tag === activeTag ? null : tag)}
                className={`rounded-full px-2.5 py-1 text-[11px] transition-colors ${activeTag === tag ? "bg-fill-segment-active text-primary" : "text-secondary hover:text-primary"}`}
              >
                {tag}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* lista */}
      {filtered.length === 0 ? (
        <p className="rounded-[12px] border border-hairline bg-surface px-4 py-8 text-center text-[12px] text-tertiary">
          {attachments.length === 0 ? t("empty") : t("noMatches")}
        </p>
      ) : (
        <ul className="divide-y divide-hairline rounded-[12px] border border-hairline bg-surface">
          {filtered.map((att) => (
            <li key={att.id} className="grid h-12 grid-cols-[32px_minmax(0,1fr)_auto_90px_110px_auto] items-center gap-2 px-3">
              <TypeIcon mime={att.mime_type} name={att.file_name} />
              <button
                onClick={() => download(att.id)}
                disabled={pending}
                className="truncate text-left text-[12.5px] text-primary hover:underline"
                title={att.file_name}
              >
                {att.file_name}
              </button>
              <span className="flex gap-1">
                {att.tags.map((tag) => (
                  <span key={tag} className="rounded-full bg-inset px-2 py-0.5 text-[10px] text-secondary">
                    {tag}
                  </span>
                ))}
              </span>
              <span className="text-right font-mono text-[11px] text-tertiary">
                {formatSize(att.size_bytes)}
              </span>
              <span className="text-right text-[11px] text-tertiary">
                {dateFmt.format(new Date(att.created_at))}
              </span>
              <span className="flex items-center gap-1">
                <button
                  disabled={pending}
                  onClick={() => download(att.id)}
                  title={t("download")}
                  className="flex h-7 w-7 items-center justify-center rounded-[6px] text-secondary transition-colors hover:bg-fill-control-hover hover:text-primary"
                >
                  <Download size={14} strokeWidth={1.75} />
                </button>
                {canEdit && (
                  <button
                    disabled={pending}
                    onClick={() =>
                      startTransition(async () => {
                        await deleteAttachment(orgSlug, tourId, "", att.id);
                        toast(t("deletedToast"));
                      })
                    }
                    title={t("deleteFile")}
                    className="flex h-7 w-7 items-center justify-center rounded-[6px] text-secondary transition-colors hover:bg-danger-subtle hover:text-danger"
                  >
                    <Trash2 size={14} strokeWidth={1.75} />
                  </button>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}

      {/* upload */}
      {canEdit && (
        <div className="flex flex-wrap items-center gap-2">
          <label className={`btn-quiet cursor-pointer ${uploading || pending ? "opacity-50" : ""}`}>
            <Upload size={13} strokeWidth={1.75} />
            {uploading ? t("uploading") : t("upload")}
            <input
              type="file"
              className="hidden"
              disabled={uploading || pending}
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
            className="h-[30px] w-48 rounded-[8px] border border-hairline bg-fill-control px-2.5 text-[12px]"
          />
        </div>
      )}
    </div>
  );
}
