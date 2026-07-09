"use client";

/** Poza de profil a membrului — upload direct în Storage. */
import { useState, useTransition } from "react";
import { UserRound, Camera } from "lucide-react";
import { createClient } from "@/lib/supabase/browser";
import { setPersonnelPhoto } from "./profile-actions";

export function PersonnelPhoto({
  orgSlug,
  orgId,
  tourId,
  personnelId,
  photoUrl,
  canEdit,
}: {
  orgSlug: string;
  orgId: string;
  tourId: string;
  personnelId: string;
  photoUrl: string | null;
  canEdit: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [uploading, setUploading] = useState(false);

  async function upload(file: File) {
    setUploading(true);
    const supabase = createClient();
    const path = `${orgId}/personnel/${personnelId}/photo-${crypto.randomUUID()}-${file.name}`;
    const { error } = await supabase.storage.from("attachments").upload(path, file);
    setUploading(false);
    if (error) return;
    startTransition(async () => {
      await setPersonnelPhoto(orgSlug, tourId, personnelId, path);
    });
  }

  return (
    <label
      className={`group relative flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-full border border-hairline bg-subtle ${canEdit ? "cursor-pointer" : ""}`}
    >
      {photoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={photoUrl} alt="" className="h-full w-full object-cover" />
      ) : (
        <UserRound size={40} strokeWidth={1.25} className="text-tertiary" />
      )}
      {canEdit && (
        <>
          <span className="absolute inset-0 hidden items-center justify-center bg-black/40 text-white group-hover:flex">
            <Camera size={20} strokeWidth={1.5} />
          </span>
          <input
            type="file"
            accept="image/*"
            disabled={pending || uploading}
            onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])}
            className="hidden"
          />
        </>
      )}
    </label>
  );
}
