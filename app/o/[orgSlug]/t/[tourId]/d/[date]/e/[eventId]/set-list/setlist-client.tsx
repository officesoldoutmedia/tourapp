"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { formatMmSs } from "@/lib/setlist";
import { addSetItem, moveSetItem, removeSetItem, updateSetItem } from "./actions";

export interface SongOption {
  id: string;
  title: string;
  length_seconds: number | null;
  bpm: number | null;
  song_key: string | null;
}

export interface SetItem {
  id: string;
  position: number;
  item_type: "song" | "break";
  song_id: string | null;
  title: string;
  length_seconds: number | null;
  bpm: number | null;
  song_key: string | null;
  set_specific_notes: string | null;
  guest_performers: string | null;
}

export function SetListEditor({
  orgSlug,
  tourId,
  date,
  eventId,
  items,
  songs,
  canEdit,
}: {
  orgSlug: string;
  tourId: string;
  date: string;
  eventId: string;
  items: SetItem[];
  songs: SongOption[];
  canEdit: boolean;
}) {
  const t = useTranslations("setlist");
  const [pending, startTransition] = useTransition();
  const [breakLabel, setBreakLabel] = useState("");
  const [copied, setCopied] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  function run(fn: () => Promise<{ error?: string }>) {
    startTransition(async () => {
      await fn();
    });
  }

  // [C] piesele deja folosite dispar din picker (songsNotInList)
  const usedSongIds = new Set(items.filter((i) => i.song_id).map((i) => i.song_id));
  const available = songs.filter((s) => !usedSongIds.has(s.id));

  /** Copy set list [C §6.10 mobil] — text simplu pt WhatsApp. */
  function copyList() {
    const lines = items.map((item, idx) =>
      item.item_type === "break"
        ? `— ${item.title} —`
        : `${idx + 1}. ${item.title}${item.length_seconds != null ? ` (${formatMmSs(item.length_seconds)})` : ""}${item.guest_performers ? ` w/ ${item.guest_performers}` : ""}`,
    );
    void navigator.clipboard.writeText(lines.join("\n"));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="space-y-3">
      {canEdit && (
        <div className="flex flex-wrap items-center gap-2">
          <select
            value=""
            disabled={pending || available.length === 0}
            onChange={(e) => {
              if (e.target.value)
                run(() =>
                  addSetItem(orgSlug, tourId, date, eventId, {
                    songId: e.target.value,
                    position: items.length,
                  }),
                );
            }}
            className="rounded border border-hairline px-2 py-1 text-xs"
            title={t("songsNotInList")}
          >
            <option value="">+ {t("addSong")}…</option>
            {available.map((song) => (
              <option key={song.id} value={song.id}>
                {song.title}
                {song.length_seconds != null && ` (${formatMmSs(song.length_seconds)})`}
              </option>
            ))}
          </select>
          <input
            value={breakLabel}
            onChange={(e) => setBreakLabel(e.target.value)}
            placeholder={t("breakLabel")}
            className="w-36 rounded border border-hairline px-2 py-1 text-xs"
          />
          <button
            disabled={pending || !breakLabel.trim()}
            onClick={() =>
              run(async () => {
                const r = await addSetItem(orgSlug, tourId, date, eventId, {
                  breakLabel: breakLabel.trim(),
                  position: items.length,
                });
                if (!r.error) setBreakLabel("");
                return r;
              })
            }
            className="rounded border border-hairline px-2 py-1 text-xs font-medium disabled:opacity-40"
          >
            + {t("addBreak")}
          </button>
          <button
            onClick={copyList}
            disabled={items.length === 0}
            className="ml-auto rounded border border-hairline px-2 py-1 text-xs font-medium disabled:opacity-40"
          >
            {copied ? t("copied") : `📋 ${t("copy")}`}
          </button>
        </div>
      )}

      {items.length === 0 ? (
        <p className="text-sm text-tertiary">{t("empty")}</p>
      ) : (
        <ol className="divide-y divide-hairline rounded-[12px] border border-hairline bg-surface">
          {items.map((item, idx) => (
            <li key={item.id} className="px-3 py-2">
              <div className="flex items-center gap-2">
                {item.item_type === "break" ? (
                  <span className="flex-1 rounded bg-inset px-2 py-1 text-center text-xs font-semibold uppercase text-secondary">
                    — {item.title} —
                  </span>
                ) : (
                  <button
                    onClick={() => setExpanded(expanded === item.id ? null : item.id)}
                    className="min-w-0 flex-1 text-left text-sm hover:underline"
                  >
                    <span className="mr-2 font-mono text-xs text-tertiary">
                      {items.slice(0, idx + 1).filter((i) => i.item_type === "song").length}.
                    </span>
                    <span className="font-medium">{item.title}</span>
                    <span className="ml-2 text-xs text-secondary">
                      {item.length_seconds != null && formatMmSs(item.length_seconds)}
                      {item.bpm != null && ` · ${item.bpm} BPM`}
                      {item.song_key && ` · ${item.song_key}`}
                      {item.guest_performers && ` · w/ ${item.guest_performers}`}
                    </span>
                  </button>
                )}
                {canEdit && (
                  <span className="flex shrink-0 gap-1">
                    <button disabled={pending || idx === 0} onClick={() => run(() => moveSetItem(orgSlug, tourId, date, eventId, item.id, -1))} className="rounded px-1 text-xs hover:bg-subtle disabled:opacity-30">↑</button>
                    <button disabled={pending || idx === items.length - 1} onClick={() => run(() => moveSetItem(orgSlug, tourId, date, eventId, item.id, 1))} className="rounded px-1 text-xs hover:bg-subtle disabled:opacity-30">↓</button>
                    <button disabled={pending} onClick={() => run(() => removeSetItem(orgSlug, tourId, date, eventId, item.id))} className="rounded px-1 text-xs text-danger hover:bg-danger-subtle">🗑</button>
                  </span>
                )}
              </div>

              {expanded === item.id && item.item_type === "song" && (
                <div className="mt-2 flex flex-wrap gap-2 border-t border-hairline pt-2">
                  <input
                    defaultValue={item.set_specific_notes ?? ""}
                    readOnly={!canEdit}
                    placeholder={t("notes")}
                    onBlur={(e) => {
                      if (canEdit && e.target.value !== (item.set_specific_notes ?? ""))
                        run(() =>
                          updateSetItem(orgSlug, tourId, date, eventId, item.id, {
                            set_specific_notes: e.target.value,
                          }),
                        );
                    }}
                    className="min-w-40 flex-1 rounded border border-hairline px-2 py-1 text-xs"
                  />
                  <input
                    defaultValue={item.guest_performers ?? ""}
                    readOnly={!canEdit}
                    placeholder={t("performers")}
                    onBlur={(e) => {
                      if (canEdit && e.target.value !== (item.guest_performers ?? ""))
                        run(() =>
                          updateSetItem(orgSlug, tourId, date, eventId, item.id, {
                            guest_performers: e.target.value,
                          }),
                        );
                    }}
                    className="min-w-40 flex-1 rounded border border-hairline px-2 py-1 text-xs"
                  />
                </div>
              )}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
