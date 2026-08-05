"use client";

/**
 * Fișierele permanente ale artistului (tab Acces): rider, hospitality,
 * press — se vor moșteni în event-uri (sub-proiectul 3, YAGNI aici).
 * Clonat din `attachments/docs-client.tsx`, fără tag-uri/căutare — doar
 * listă + upload + download + ștergere, ca-n brief. Reutilizează
 * `getAttachmentUrl` (generic, parent-agnostic) pentru signed URL.
 */
import { useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Download, File, Trash2, Upload } from "lucide-react";
import { createClient } from "@/lib/supabase/browser";
import { toast } from "@/components/ui/Toaster";
import { getAttachmentUrl } from "@/app/o/[orgSlug]/t/[tourId]/d/[date]/extras-actions";
import { addArtistAttachment, deleteArtistAttachment } from "./actions";

export interface ArtistFileData {
  id: string;
  file_name: string;
  mime_type: string | null;
  size_bytes: number | null;
  created_at: string;
}

function formatSize(bytes: number | null): string {
  if (bytes == null) return "";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function ArtistFiles({
  orgSlug,
  artistSlug,
  orgId,
  artistId,
  files,
}: {
  orgSlug: string;
  artistSlug: string;
  orgId: string;
  artistId: string;
  files: ArtistFileData[];
}) {
  const t = useTranslations("artist");
  const ta = useTranslations("attachments");
  const locale = useLocale();
  const [pending, startTransition] = useTransition();
  const [uploading, setUploading] = useState(false);

  const dateFmt = new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", year: "numeric" });

  async function upload(file: File) {
    setUploading(true);
    const supabase = createClient();
    const path = `${orgId}/artists/${artistId}/${crypto.randomUUID()}-${file.name}`;
    const { error } = await supabase.storage.from("attachments").upload(path, file);
    if (error) {
      toast(error.message, "danger");
      setUploading(false);
      return;
    }
    startTransition(async () => {
      await addArtistAttachment(orgSlug, artistSlug, artistId, {
        fileName: file.name,
        storagePath: path,
        mimeType: file.type,
        sizeBytes: file.size,
      });
      setUploading(false);
      toast(ta("uploadedToast"));
    });
  }

  function download(id: string) {
    startTransition(async () => {
      const r = await getAttachmentUrl(orgSlug, id);
      if (r.url) window.open(r.url, "_blank");
    });
  }

  return (
    <div className="space-y-3">
      {files.length === 0 ? (
        <p className="rounded-[12px] border border-hairline bg-surface px-4 py-8 text-center text-[12px] text-tertiary">
          {t("noFiles")}
        </p>
      ) : (
        <ul className="divide-y divide-hairline rounded-[12px] border border-hairline bg-surface">
          {files.map((f) => (
            <li
              key={f.id}
              className="grid h-12 grid-cols-[32px_minmax(0,1fr)_90px_110px_auto] items-center gap-2 px-3"
            >
              <File size={16} strokeWidth={1.5} className="shrink-0 text-secondary" />
              <button
                onClick={() => download(f.id)}
                disabled={pending}
                className="truncate text-left text-[12.5px] text-primary hover:underline"
                title={f.file_name}
              >
                {f.file_name}
              </button>
              <span className="text-right font-mono text-[11px] text-tertiary">
                {formatSize(f.size_bytes)}
              </span>
              <span className="text-right text-[11px] text-tertiary">
                {dateFmt.format(new Date(f.created_at))}
              </span>
              <span className="flex items-center gap-1">
                <button
                  disabled={pending}
                  onClick={() => download(f.id)}
                  title={ta("download")}
                  className="flex h-7 w-7 items-center justify-center rounded-[6px] text-secondary transition-colors hover:bg-fill-control-hover hover:text-primary"
                >
                  <Download size={14} strokeWidth={1.75} />
                </button>
                <button
                  disabled={pending}
                  onClick={() =>
                    startTransition(async () => {
                      await deleteArtistAttachment(orgSlug, artistSlug, f.id);
                      toast(ta("deletedToast"));
                    })
                  }
                  title={ta("deleteFile")}
                  className="flex h-7 w-7 items-center justify-center rounded-[6px] text-secondary transition-colors hover:bg-danger-subtle hover:text-danger"
                >
                  <Trash2 size={14} strokeWidth={1.75} />
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}

      <label className={`btn-quiet cursor-pointer ${uploading || pending ? "opacity-50" : ""}`}>
        <Upload size={13} strokeWidth={1.75} />
        {uploading ? ta("uploading") : t("upload")}
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
    </div>
  );
}
