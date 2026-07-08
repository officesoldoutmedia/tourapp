"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import {
  deleteHotel,
  deleteRoomEntry,
  extendStay,
  moveHotel,
  searchHotels,
  unlinkHotel,
  upsertHotel,
  upsertRoomEntry,
  type HotelHit,
  type RoomEntryInput,
} from "./hotel-actions";
import type { PersonnelOption } from "./travel-client";

export interface RoomEntryData {
  id: string;
  personnel_id: string | null;
  guest_name: string | null;
  bag_tag: string | null;
  room_number: string | null;
  room_type: string | null;
  smoking: boolean;
  check_in: string | null;
  check_out: string | null;
  confirmation_number: string | null;
}

export interface HotelData {
  id: string;
  name: string;
  city: string | null;
  party: string | null;
  check_in_date: string | null;
  check_out_date: string | null;
  check_in_time: string | null;
  check_out_time: string | null;
  notes: string | null;
  stay_group_id: string | null;
  rooms: RoomEntryData[];
}

export function HotelsSection({
  orgSlug,
  tourId,
  date,
  dayId,
  hotels,
  prevDayHotels,
  personnel,
  canEdit,
}: {
  orgSlug: string;
  tourId: string;
  date: string;
  dayId: string;
  hotels: HotelData[];
  prevDayHotels: { id: string; name: string }[];
  personnel: PersonnelOption[];
  canEdit: boolean;
}) {
  const t = useTranslations("hotels");
  const [adding, setAdding] = useState(false);
  const [extending, setExtending] = useState(false);
  const [pending, startTransition] = useTransition();

  function run(fn: () => Promise<{ error?: string }>) {
    startTransition(async () => {
      await fn();
      setAdding(false);
      setExtending(false);
    });
  }

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="mr-auto font-display text-lg font-semibold tracking-tight">{t("title")}</h2>
        {canEdit && prevDayHotels.length > 0 && (
          <button
            onClick={() => setExtending(!extending)}
            className="rounded border border-hairline px-3 py-1 text-xs font-medium"
          >
            {t("extendStay")}
          </button>
        )}
        {canEdit && !adding && (
          <button
            onClick={() => setAdding(true)}
            className="rounded bg-accent hover:bg-accent-hover px-3 py-1 text-xs font-medium text-white"
          >
            + {t("add")}
          </button>
        )}
      </div>

      {extending && (
        <div className="space-y-1 rounded-lg border border-hairline bg-surface shadow-xs p-3 text-sm">
          <p className="text-xs font-semibold text-secondary">{t("extendFrom")}</p>
          {prevDayHotels.map((hotel) => (
            <button
              key={hotel.id}
              disabled={pending}
              onClick={() => run(() => extendStay(orgSlug, tourId, date, hotel.id, dayId))}
              className="block w-full rounded px-2 py-1 text-left hover:bg-subtle"
            >
              🏨 {hotel.name}
            </button>
          ))}
        </div>
      )}

      {hotels.length === 0 && !adding && (
        <p className="text-sm text-tertiary">{t("noHotels")}</p>
      )}

      <div className="space-y-3">
        {hotels.map((hotel, idx) => (
          <HotelCard
            key={hotel.id}
            orgSlug={orgSlug}
            tourId={tourId}
            date={date}
            dayId={dayId}
            hotel={hotel}
            personnel={personnel}
            canEdit={canEdit}
            pending={pending}
            isFirst={idx === 0}
            isLast={idx === hotels.length - 1}
            run={run}
          />
        ))}
      </div>

      {adding && (
        <AddHotelForm
          orgSlug={orgSlug}
          tourId={tourId}
          date={date}
          dayId={dayId}
          pending={pending}
          onCancel={() => setAdding(false)}
          run={run}
        />
      )}
    </section>
  );
}

function HotelCard({
  orgSlug,
  tourId,
  date,
  dayId,
  hotel,
  personnel,
  canEdit,
  pending,
  isFirst,
  isLast,
  run,
}: {
  orgSlug: string;
  tourId: string;
  date: string;
  dayId: string;
  hotel: HotelData;
  personnel: PersonnelOption[];
  canEdit: boolean;
  pending: boolean;
  isFirst: boolean;
  isLast: boolean;
  run: (fn: () => Promise<{ error?: string }>) => void;
}) {
  const t = useTranslations("hotels");
  const [showRooms, setShowRooms] = useState(false);
  const [copied, setCopied] = useState(false);

  const personnelName = (id: string | null) =>
    personnel.find((p) => p.id === id)?.name ?? null;

  /** [C §6.8] Copy Room List → clipboard cu formatare păstrată (TSV). */
  function copyRoomList() {
    const header = [
      t("bagTag"), "LAST, FIRST", t("roomNumber"), t("roomType"),
      t("smoking"), t("checkIn"), t("checkOut"), t("confirmation"),
    ].join("\t");
    const lines = hotel.rooms.map((room) =>
      [
        room.bag_tag ?? "",
        personnelName(room.personnel_id) ?? room.guest_name ?? "",
        room.room_number ?? "",
        room.room_type ?? "",
        room.smoking ? t("smoking") : t("nonSmoking"),
        room.check_in ?? "",
        room.check_out ?? "",
        room.confirmation_number ?? "",
      ].join("\t"),
    );
    void navigator.clipboard.writeText([`${hotel.name}`, header, ...lines].join("\n"));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="rounded-lg border border-hairline bg-surface shadow-xs">
      <div className="flex flex-wrap items-center gap-2 px-3 py-2">
        <span className="min-w-0 flex-1 text-sm font-medium">
          {hotel.party && (
            <span className="mr-1 rounded bg-primary px-1.5 py-0.5 text-[10px] font-bold text-white">
              {hotel.party}
            </span>
          )}
          🏨 {hotel.name}
          {hotel.city && <span className="ml-1 text-xs text-secondary">{hotel.city}</span>}
          {hotel.stay_group_id && (
            <span className="ml-2 rounded-full bg-accent-subtle px-2 py-0.5 text-[10px] font-semibold text-accent">
              {t("linked")}
            </span>
          )}
        </span>
        <span className="text-xs text-secondary">
          {t("checkIn")} {hotel.check_in_date ?? "—"}
          {hotel.check_in_time && ` ${hotel.check_in_time.slice(0, 5)}`} · {t("checkOut")}{" "}
          {hotel.check_out_date ?? "—"}
          {hotel.check_out_time && ` ${hotel.check_out_time.slice(0, 5)}`}
        </span>
        <button
          onClick={() => setShowRooms(!showRooms)}
          className="rounded border border-hairline px-2 py-0.5 text-xs"
        >
          {t("roomList")} ({hotel.rooms.length})
        </button>
        {canEdit && (
          <span className="flex gap-1">
            <button disabled={pending || isFirst} onClick={() => run(() => moveHotel(orgSlug, tourId, date, dayId, hotel.id, -1))} className="rounded px-1 text-xs hover:bg-subtle disabled:opacity-30">↑</button>
            <button disabled={pending || isLast} onClick={() => run(() => moveHotel(orgSlug, tourId, date, dayId, hotel.id, 1))} className="rounded px-1 text-xs hover:bg-subtle disabled:opacity-30">↓</button>
            {hotel.stay_group_id && (
              <button
                disabled={pending}
                onClick={() => run(() => unlinkHotel(orgSlug, tourId, date, hotel.id))}
                className="rounded border border-hairline px-2 py-0.5 text-xs"
              >
                {t("unlink")}
              </button>
            )}
            <button
              disabled={pending}
              onClick={() => run(() => deleteHotel(orgSlug, tourId, date, hotel.id))}
              className="rounded px-1.5 py-0.5 text-xs text-danger hover:bg-danger-subtle"
            >
              🗑
            </button>
          </span>
        )}
      </div>

      {showRooms && (
        <div className="space-y-2 border-t border-hairline p-3">
          <RoomListGrid
            orgSlug={orgSlug}
            tourId={tourId}
            date={date}
            hotel={hotel}
            personnel={personnel}
            canEdit={canEdit}
            pending={pending}
            run={run}
          />
          <div className="flex items-center gap-3 text-xs text-secondary">
            <span>
              {t("totalGuests")}: <b>{hotel.rooms.length}</b> · {t("totalRooms")}:{" "}
              <b>{new Set(hotel.rooms.map((r) => r.room_number).filter(Boolean)).size}</b>
            </span>
            <button
              onClick={copyRoomList}
              className="rounded border border-hairline px-2 py-0.5 font-medium"
            >
              {copied ? t("copied") : t("copyRoomList")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function RoomListGrid({
  orgSlug,
  tourId,
  date,
  hotel,
  personnel,
  canEdit,
  pending,
  run,
}: {
  orgSlug: string;
  tourId: string;
  date: string;
  hotel: HotelData;
  personnel: PersonnelOption[];
  canEdit: boolean;
  pending: boolean;
  run: (fn: () => Promise<{ error?: string }>) => void;
}) {
  const t = useTranslations("hotels");
  const empty: RoomEntryInput = {
    dayHotelId: hotel.id,
    personnelId: null,
    guestName: "",
    bagTag: "",
    roomNumber: "",
    roomType: "",
    smoking: false,
    checkIn: "",
    checkOut: "",
    confirmationNumber: "",
  };
  const [draft, setDraft] = useState<RoomEntryInput>(empty);

  const personnelName = (id: string | null) =>
    personnel.find((p) => p.id === id)?.name ?? null;

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead className="text-left uppercase text-secondary">
          <tr>
            <th className="px-1 py-1">{t("bagTag")}</th>
            <th className="px-1 py-1">Nume</th>
            <th className="px-1 py-1">{t("roomNumber")}</th>
            <th className="px-1 py-1">{t("roomType")}</th>
            <th className="px-1 py-1">🚬</th>
            <th className="px-1 py-1">{t("checkIn")}</th>
            <th className="px-1 py-1">{t("checkOut")}</th>
            <th className="px-1 py-1">{t("confirmation")}</th>
            <th />
          </tr>
        </thead>
        <tbody className="divide-y divide-hairline">
          {hotel.rooms.map((room) => (
            <tr key={room.id}>
              <td className="px-1 py-1">{room.bag_tag}</td>
              <td className="px-1 py-1">
                {personnelName(room.personnel_id) ?? room.guest_name}
              </td>
              <td className="px-1 py-1">{room.room_number}</td>
              <td className="px-1 py-1">{room.room_type}</td>
              <td className="px-1 py-1">{room.smoking ? "🚬" : "—"}</td>
              <td className="px-1 py-1">{room.check_in}</td>
              <td className="px-1 py-1">{room.check_out}</td>
              <td className="px-1 py-1">{room.confirmation_number}</td>
              <td className="px-1 py-1">
                {canEdit && (
                  <button
                    disabled={pending}
                    onClick={() => run(() => deleteRoomEntry(orgSlug, tourId, date, room.id))}
                    className="text-danger"
                  >
                    ×
                  </button>
                )}
              </td>
            </tr>
          ))}
          {canEdit && (
            <tr>
              <td className="px-1 py-1">
                <input value={draft.bagTag} onChange={(e) => setDraft({ ...draft, bagTag: e.target.value })} className="w-12 rounded border border-hairline px-1 py-0.5" />
              </td>
              <td className="px-1 py-1">
                <select
                  value={draft.personnelId ?? ""}
                  onChange={(e) => setDraft({ ...draft, personnelId: e.target.value || null })}
                  className="w-32 rounded border border-hairline px-1 py-0.5"
                >
                  <option value="">{t("guestName")}…</option>
                  {personnel.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
                {!draft.personnelId && (
                  <input
                    value={draft.guestName}
                    onChange={(e) => setDraft({ ...draft, guestName: e.target.value })}
                    placeholder={t("guestName")}
                    className="mt-0.5 w-32 rounded border border-hairline px-1 py-0.5"
                  />
                )}
              </td>
              <td className="px-1 py-1"><input value={draft.roomNumber} onChange={(e) => setDraft({ ...draft, roomNumber: e.target.value })} className="w-14 rounded border border-hairline px-1 py-0.5" /></td>
              <td className="px-1 py-1"><input value={draft.roomType} onChange={(e) => setDraft({ ...draft, roomType: e.target.value })} className="w-16 rounded border border-hairline px-1 py-0.5" /></td>
              <td className="px-1 py-1"><input type="checkbox" checked={draft.smoking} onChange={(e) => setDraft({ ...draft, smoking: e.target.checked })} /></td>
              <td className="px-1 py-1"><input type="date" value={draft.checkIn} onChange={(e) => setDraft({ ...draft, checkIn: e.target.value })} className="rounded border border-hairline px-1 py-0.5" /></td>
              <td className="px-1 py-1"><input type="date" value={draft.checkOut} onChange={(e) => setDraft({ ...draft, checkOut: e.target.value })} className="rounded border border-hairline px-1 py-0.5" /></td>
              <td className="px-1 py-1"><input value={draft.confirmationNumber} onChange={(e) => setDraft({ ...draft, confirmationNumber: e.target.value })} className="w-20 rounded border border-hairline px-1 py-0.5" /></td>
              <td className="px-1 py-1">
                <button
                  disabled={pending || (!draft.personnelId && !draft.guestName)}
                  onClick={() =>
                    run(async () => {
                      const r = await upsertRoomEntry(orgSlug, tourId, date, draft);
                      if (!r.error) setDraft(empty);
                      return r;
                    })
                  }
                  className="rounded bg-accent hover:bg-accent-hover px-2 py-0.5 text-white disabled:opacity-40"
                >
                  +
                </button>
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function AddHotelForm({
  orgSlug,
  tourId,
  date,
  dayId,
  pending,
  onCancel,
  run,
}: {
  orgSlug: string;
  tourId: string;
  date: string;
  dayId: string;
  pending: boolean;
  onCancel: () => void;
  run: (fn: () => Promise<{ error?: string }>) => void;
}) {
  const t = useTranslations("hotels");
  const tc = useTranslations("common");
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<HotelHit[]>([]);
  const [checkIn, setCheckIn] = useState(date);
  const [checkOut, setCheckOut] = useState("");
  const [, startSearch] = useTransition();

  function search(q: string) {
    setQuery(q);
    if (q.trim().length >= 2) {
      startSearch(async () => setHits(await searchHotels(orgSlug, tourId, q)));
    } else setHits([]);
  }

  function add(hit?: HotelHit) {
    run(() =>
      upsertHotel(orgSlug, tourId, date, {
        dayId,
        name: hit?.name ?? query,
        city: hit?.city ?? "",
        party: "",
        checkInDate: checkIn,
        checkOutDate: checkOut,
        checkInTime: "",
        checkOutTime: "",
        notes: "",
        google: hit?.google,
      }),
    );
  }

  return (
    <div className="space-y-2 rounded-lg border border-hairline bg-surface shadow-xs p-3">
      <div className="flex flex-wrap gap-2">
        <input
          autoFocus
          value={query}
          onChange={(e) => search(e.target.value)}
          placeholder={t("searchHotel")}
          className="min-w-48 flex-1 rounded border border-hairline px-3 py-1.5 text-sm"
        />
        <label className="flex items-center gap-1 text-xs">
          {t("checkIn")}
          <input type="date" value={checkIn} onChange={(e) => setCheckIn(e.target.value)} className="rounded border border-hairline px-2 py-1 text-sm" />
        </label>
        <label className="flex items-center gap-1 text-xs">
          {t("checkOut")}
          <input type="date" value={checkOut} onChange={(e) => setCheckOut(e.target.value)} className="rounded border border-hairline px-2 py-1 text-sm" />
        </label>
      </div>
      <ul className="divide-y divide-hairline empty:hidden">
        {hits.map((hit, i) => (
          <li key={i}>
            <button
              disabled={pending}
              onClick={() => add(hit)}
              className="flex w-full items-center justify-between px-2 py-1.5 text-left text-sm hover:bg-subtle"
            >
              <span>
                {hit.name}
                {hit.city && <span className="ml-2 text-xs text-secondary">{hit.city}</span>}
              </span>
              <span
                className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${hit.source === "google" ? "bg-success-subtle text-success" : "bg-inset text-secondary"}`}
              >
                {hit.source === "google" ? "Google" : t("sourceTour")}
              </span>
            </button>
          </li>
        ))}
      </ul>
      <div className="flex gap-2">
        <button
          disabled={pending || query.trim().length < 2}
          onClick={() => add()}
          className="rounded bg-accent hover:bg-accent-hover px-3 py-1 text-xs font-medium text-white disabled:opacity-40"
        >
          {t("createManually")}
        </button>
        <button onClick={onCancel} className="rounded border border-hairline px-3 py-1 text-xs">
          {tc("cancel")}
        </button>
      </div>
    </div>
  );
}
