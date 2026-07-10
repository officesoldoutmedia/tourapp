"use client";

/** Logo-ul turului/artistului — upload în Storage, preview, ștergere. */
import { useState, useTransition } from "react";
import { ImageIcon, Upload, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/browser";
import { toast } from "@/components/ui/Toaster";
import { setTourLogo } from "./logo-actions";

export function TourLogo({
  orgSlug,
  orgId,
  tourId,
  logoUrl,
  labels,
}: {
  orgSlug: string;
  orgId: string;
  tourId: string;
  logoUrl: string | null;
  labels: { upload: string; remove: string; uploaded: string; hint: string };
}) {
  const [pending, startTransition] = useTransition();
  const [uploading, setUploading] = useState(false);

  async function upload(file: File) {
    setUploading(true);
    const supabase = createClient();
    const path = `${orgId}/tours/${tourId}/logo-${crypto.randomUUID()}-${file.name}`;
    const { error } = await supabase.storage.from("attachments").upload(path, file);
    setUploading(false);
    if (error) {
      toast(error.message, "danger");
      return;
    }
    startTransition(async () => {
      await setTourLogo(orgSlug, tourId, path);
      toast(labels.uploaded);
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-4">
      <div className="flex h-16 w-44 items-center justify-center overflow-hidden rounded-[8px] border border-hairline bg-inset">
        {logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logoUrl} alt="Tour logo" className="max-h-12 max-w-40 object-contain" />
        ) : (
          <ImageIcon size={20} strokeWidth={1.5} className="text-tertiary" />
        )}
      </div>
      <div className="flex items-center gap-2">
        <label className={`btn-quiet cursor-pointer ${pending || uploading ? "opacity-50" : ""}`}>
          <Upload size={13} strokeWidth={1.75} />
          {labels.upload}
          <input
            type="file"
            accept="image/png,image/jpeg,image/svg+xml,image/webp"
            disabled={pending || uploading}
            onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])}
            className="hidden"
          />
        </label>
        {logoUrl && (
          <button
            disabled={pending}
            onClick={() => startTransition(async () => setTourLogo(orgSlug, tourId, null))}
            className="btn-danger"
          >
            <Trash2 size={13} strokeWidth={1.75} />
            {labels.remove}
          </button>
        )}
      </div>
      <p className="w-full text-[10.5px] text-tertiary">{labels.hint}</p>
    </div>
  );
}
