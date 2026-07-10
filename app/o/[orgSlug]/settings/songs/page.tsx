import { notFound } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { requireOrg } from "@/lib/org";
import { can } from "@/lib/permissions";
import { formatMmSs, parseMmSs } from "@/lib/setlist";

/** Song Library la nivel de organizație [C §6.10]. */
export default async function SongsPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;
  const { supabase, org, permission, tier } = await requireOrg(orgSlug);
  const t = await getTranslations("songs");
  const tc = await getTranslations("common");
  if (!can({ tier, permission }, "edit_tour_content")) notFound();

  const { data: songs } = await supabase
    .from("songs")
    .select("id, title, length_seconds, bpm, song_key, tech_notes")
    .eq("organization_id", org.id)
    .is("deleted_at", null)
    .order("title");

  async function saveSong(formData: FormData) {
    "use server";
    const { supabase, org } = await requireOrg(orgSlug);
    const id = String(formData.get("id") ?? "");
    const row = {
      title: String(formData.get("title") ?? "").trim(),
      length_seconds: parseMmSs(String(formData.get("length") ?? "")),
      bpm: Number(formData.get("bpm")) || null,
      song_key: String(formData.get("key") ?? "").trim() || null,
      tech_notes: String(formData.get("techNotes") ?? "").trim() || null,
    };
    if (!row.title) return;
    if (id) await supabase.from("songs").update(row).eq("id", id);
    else await supabase.from("songs").insert({ ...row, organization_id: org.id });
    revalidatePath(`/o/${orgSlug}/settings/songs`);
  }

  async function removeSong(formData: FormData) {
    "use server";
    const { supabase } = await requireOrg(orgSlug);
    await supabase
      .from("songs")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", String(formData.get("id")));
    revalidatePath(`/o/${orgSlug}/settings/songs`);
  }

  const inputCls = "rounded border border-hairline px-2 py-1 text-sm";

  return (
    <main className="mx-auto w-full max-w-3xl space-y-6 p-6">
      <h1 className="font-display text-xl font-semibold tracking-tight">{t("title")}</h1>

      {(songs ?? []).length === 0 ? (
        <p className="text-sm text-secondary">{t("empty")}</p>
      ) : (
        <ul className="divide-y divide-hairline rounded-[12px] border border-hairline bg-surface">
          {(songs ?? []).map((song) => (
            <li key={song.id} className="px-4 py-2">
              {/* editare inline: modificarea se propagă în toate set lists [C] */}
              <form action={saveSong} className="flex flex-wrap items-center gap-2">
                <input type="hidden" name="id" value={song.id} />
                <input name="title" defaultValue={song.title} className={`${inputCls} min-w-40 flex-1 font-medium`} />
                <input name="length" defaultValue={song.length_seconds != null ? formatMmSs(song.length_seconds) : ""} placeholder={t("length")} className={`${inputCls} w-20`} />
                <input name="bpm" defaultValue={song.bpm ?? ""} placeholder={t("bpm")} className={`${inputCls} w-16`} />
                <input name="key" defaultValue={song.song_key ?? ""} placeholder={t("key")} className={`${inputCls} w-16`} />
                <input name="techNotes" defaultValue={song.tech_notes ?? ""} placeholder={t("techNotes")} className={`${inputCls} min-w-32 flex-1`} />
                <button className="btn-quiet h-7 px-2.5">{tc("save")}</button>
                <button formAction={removeSong} className="rounded px-2 py-1 text-xs text-danger hover:bg-danger-subtle">🗑</button>
              </form>
            </li>
          ))}
        </ul>
      )}

      <form action={saveSong} className="flex flex-wrap gap-2 rounded-[12px] border border-hairline bg-surface p-3">
        <input name="title" required placeholder={t("songTitle")} className={`${inputCls} min-w-40 flex-1`} />
        <input name="length" placeholder={t("length")} className={`${inputCls} w-20`} />
        <input name="bpm" placeholder={t("bpm")} className={`${inputCls} w-16`} />
        <input name="key" placeholder={t("key")} className={`${inputCls} w-16`} />
        <input name="techNotes" placeholder={t("techNotes")} className={`${inputCls} min-w-32 flex-1`} />
        <button className="btn-quiet h-7 px-2.5">
          + {t("add")}
        </button>
      </form>
    </main>
  );
}
