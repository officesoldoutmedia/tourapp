"use client";

/** Poza pass-ului (laminate) — upload/înlocuire/ștergere per tip de pass. */
import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { ImageIcon, Upload, X } from "lucide-react";
import { createClient } from "@/lib/supabase/browser";
import { toast } from "@/components/ui/Toaster";
import { setPassImage } from "./photo-actions";

export function PassPhoto({
  orgSlug,
  orgId,
  tourId,
  passId,
  imageUrl,
  canEdit,
}: {
  orgSlug: string;
  orgId: string;
  tourId: string;
  passId: string;
  imageUrl: string | null;
  canEdit: boolean;
}) {
  const t = useTranslations("passes");
  const [pending, startTransition] = useTransition();
  const [uploading, setUploading] = useState(false);

  async function upload(file: File) {
    setUploading(true);
    const supabase = createClient();
    const path = `${orgId}/tours/${tourId}/passes/${passId}-${crypto.randomUUID()}-${file.name}`;
    const { error } = await supabase.storage.from("attachments").upload(path, file);
    setUploading(false);
    if (error) {
      toast(error.message, "danger");
      return;
    }
    startTransition(async () => {
      await setPassImage(orgSlug, tourId, passId, path);
      toast(t("photoSaved"));
    });
  }

  return (
    <div className="group relative">
      <label
        className={`flex h-12 w-[76px] items-center justify-center overflow-hidden rounded-[6px] border border-hairline bg-inset ${canEdit ? "cursor-pointer" : ""} ${pending || uploading ? "opacity-50" : ""}`}
        title={canEdit ? t("uploadPhoto") : undefined}
      >
        {imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={imageUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <ImageIcon size={15} strokeWidth={1.5} className="text-tertiary" />
        )}
        {canEdit && (
          <>
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              disabled={pending || uploading}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void upload(file);
                e.target.value = "";
              }}
              className="hidden"
            />
            {!imageUrl && (
              <span className="absolute -bottom-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full border border-hairline bg-raised text-secondary">
                <Upload size={9} strokeWidth={2} />
              </span>
            )}
          </>
        )}
      </label>
      {canEdit && imageUrl && (
        <button
          disabled={pending}
          onClick={() => startTransition(async () => setPassImage(orgSlug, tourId, passId, null))}
          title={t("removePhoto")}
          className="absolute -right-1.5 -top-1.5 hidden h-4 w-4 items-center justify-center rounded-full border border-strong bg-raised text-secondary hover:text-danger group-hover:flex"
        >
          <X size={10} strokeWidth={2} />
        </button>
      )}
    </div>
  );
}
