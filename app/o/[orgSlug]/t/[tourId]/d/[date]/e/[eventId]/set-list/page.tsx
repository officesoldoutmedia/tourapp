import Link from "next/link";
import { notFound } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { requireOrg } from "@/lib/org";
import { can } from "@/lib/permissions";
import { formatMmSs, setListTotals } from "@/lib/setlist";
import { SetListEditor, type SetItem, type SongOption } from "./setlist-client";

export default async function SetListPage({
  params,
}: {
  params: Promise<{ orgSlug: string; tourId: string; date: string; eventId: string }>;
}) {
  const { orgSlug, tourId, date, eventId } = await params;
  const { supabase, org, permission, tier } = await requireOrg(orgSlug);
  const t = await getTranslations("setlist");

  const { data: event } = await supabase
    .from("events")
    .select("id, title, venues(name)")
    .eq("id", eventId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!event) notFound();

  // set list-ul se creează lazy la prima deschidere de către un editor
  const canEdit = can({ tier, permission }, "edit_tour_content");
  if (canEdit) {
    await supabase.from("set_lists").upsert({ event_id: eventId }, { onConflict: "event_id" });
    revalidatePath(`/o/${orgSlug}/t/${tourId}/d/${date}/e/${eventId}/set-list`);
  }

  const [{ data: items }, { data: songs }] = await Promise.all([
    supabase
      .from("set_list_items")
      .select(
        "id, position, item_type, song_id, break_label, set_specific_notes, guest_performers, songs(title, length_seconds, bpm, song_key)",
      )
      .eq("set_list_id", eventId)
      .order("position"),
    supabase
      .from("songs")
      .select("id, title, length_seconds, bpm, song_key")
      .eq("organization_id", org.id)
      .is("deleted_at", null)
      .order("title"),
  ]);

  const setItems: SetItem[] = (items ?? []).map((item) => {
    const song = item.songs as unknown as {
      title: string;
      length_seconds: number | null;
      bpm: number | null;
      song_key: string | null;
    } | null;
    return {
      id: item.id,
      position: item.position,
      item_type: item.item_type as "song" | "break",
      song_id: item.song_id,
      title: item.item_type === "break" ? (item.break_label ?? "Break") : (song?.title ?? "—"),
      length_seconds: song?.length_seconds ?? null,
      bpm: song?.bpm ?? null,
      song_key: song?.song_key ?? null,
      set_specific_notes: item.set_specific_notes,
      guest_performers: item.guest_performers,
    };
  });

  const totals = setListTotals(setItems);

  return (
    <main className="mx-auto w-full max-w-3xl space-y-4 p-6">
      <header className="flex flex-wrap items-baseline gap-3">
        <div className="mr-auto">
          <Link
            href={`/o/${orgSlug}/t/${tourId}/d/${date}/e/${eventId}`}
            className="text-xs text-neutral-500 hover:underline"
          >
            ← {event.title ?? (event.venues as unknown as { name: string } | null)?.name}
          </Link>
          <h1 className="text-xl font-semibold">{t("title")}</h1>
        </div>
        <a
          href={`/api/pdf/setlist/${eventId}`}
          target="_blank"
          className="rounded border border-neutral-300 px-3 py-1 text-xs font-medium"
        >
          🖨 {t("pdf")}
        </a>
        <Link
          href={`/o/${orgSlug}/settings/songs`}
          className="rounded border border-neutral-300 px-3 py-1 text-xs font-medium"
        >
          {t("editSongList")}
        </Link>
      </header>

      <SetListEditor
        orgSlug={orgSlug}
        tourId={tourId}
        date={date}
        eventId={eventId}
        items={setItems}
        songs={(songs ?? []) as SongOption[]}
        canEdit={canEdit}
      />

      {/* totaluri [C-S] */}
      <p className="border-t border-neutral-200 pt-2 text-sm font-medium text-neutral-600">
        {t("totals", {
          songs: totals.songs,
          breaks: totals.breaks,
          duration: formatMmSs(totals.totalSeconds),
        })}
      </p>
    </main>
  );
}
