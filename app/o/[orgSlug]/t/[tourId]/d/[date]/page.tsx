import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { requireOrg } from "@/lib/org";
import { can } from "@/lib/permissions";
import { formatDayHeader, isDstTransitionDay } from "@/lib/datetime";
import { DEFAULT_TZ } from "@/lib/tzLookup";
import {
  NotesSection,
  ScheduleSection,
  type DayData,
  type ScheduleItemData,
} from "./day-client";
import { EventsSection } from "./events-client";
import { TravelSection, type TravelItemData } from "./travel-client";
import { HotelsSection, type HotelData } from "./hotels-client";
import {
  AttachmentsSection,
  DayActionsBar,
  TasksSection,
  type AttachmentData,
  type TaskData,
} from "./extras-client";
import { formatTimeInZone, dayInstant, dayKeyInZone } from "@/lib/datetime";
import { DayFocus, type FocusItem } from "@/components/ui/DayFocus";
import { MetricStrip, type Metric } from "@/components/ui/MetricStrip";
import { HeaderClock } from "@/components/ui/HeaderClock";
import { ChevronLeft, ChevronRight, ExternalLink } from "lucide-react";
import Link from "next/link";
import type { VenueCardData } from "@/components/DayDashboardCards";
import { getWeather } from "@/lib/weather";
import { isGoogleEnabled, searchGooglePlaces } from "@/lib/googlePlaces";

export default async function DayPage({
  params,
}: {
  params: Promise<{ orgSlug: string; tourId: string; date: string }>;
}) {
  const { orgSlug, tourId, date } = await params;
  const { supabase, org, permission, tier } = await requireOrg(orgSlug);
  const locale = await getLocale();
  const td = await getTranslations("dayTypes");
  const t = await getTranslations("day");

  const { data: day } = await supabase
    .from("days")
    .select(
      "id, date, day_type, city, state, country, lat, lng, timezone, general_notes, travel_notes, hotel_notes",
    )
    .eq("tour_id", tourId)
    .eq("date", date)
    .is("deleted_at", null)
    .maybeSingle();

  if (!day) notFound();
  const tz = day.timezone ?? DEFAULT_TZ;

  const [{ data: items }, { data: templates }, { data: events }] = await Promise.all([
    supabase
      .from("schedule_items")
      .select(
        "id, title, details, item_type, start_at, end_at, is_confirmed, is_complete, time_priority, sort_order",
      )
      .eq("day_id", day.id)
      .is("deleted_at", null)
      .order("start_at", { ascending: true, nullsFirst: false })
      .order("time_priority")
      .order("sort_order"),
    supabase
      .from("schedule_templates")
      .select("id, name")
      .eq("organization_id", org.id)
      .is("deleted_at", null)
      .order("name"),
    supabase
      .from("events")
      .select("id, title, venues(name, address_line1, city, postal_code, country, urls, phones), advances(status, deleted_at)")
      .eq("day_id", day.id)
      .is("deleted_at", null)
      .order("created_at"),
  ]);

  const [
    { data: travelItems },
    { data: hotels },
    { data: personnel },
    { data: prevDay },
  ] = await Promise.all([
    supabase
      .from("travel_items")
      .select(
        "*, flight_legs(id, airline, flight_number, dep_airport_iata, arr_airport_iata, scheduled_dep, scheduled_arr), travel_passengers(personnel_id)",
      )
      .eq("day_id", day.id)
      .is("deleted_at", null)
      .order("depart_time", { ascending: true, nullsFirst: false })
      .order("sort_order"),
    supabase
      .from("day_hotels")
      .select(
        "id, name, city, party, check_in_date, check_out_date, check_in_time, check_out_time, notes, stay_group_id, room_list_entries(id, personnel_id, guest_name, bag_tag, room_number, room_type, smoking, check_in, check_out, confirmation_number, deleted_at)",
      )
      .eq("day_id", day.id)
      .is("deleted_at", null)
      .order("sort_order")
      .order("created_at"),
    supabase
      .from("tour_personnel")
      .select("id, first_name, last_name, preferred_name")
      .eq("tour_id", tourId)
      .is("deleted_at", null)
      .order("sort_order")
      .order("last_name"),
    supabase
      .from("days")
      .select("id")
      .eq("tour_id", tourId)
      .lt("date", date)
      .is("deleted_at", null)
      .order("date", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  // Pin-picker [C-S]: venue-urile events-urilor turului + hotelurile turului
  const [{ data: tourVenues }, { data: tourHotels }] = await Promise.all([
    supabase
      .from("events")
      .select("venue_id, venues(id, name, city), days!inner(tour_id)")
      .eq("days.tour_id", tourId)
      .is("deleted_at", null),
    supabase
      .from("day_hotels")
      .select("id, name, city, days!inner(tour_id)")
      .eq("days.tour_id", tourId)
      .is("deleted_at", null),
  ]);

  const pinSeen = new Set<string>();
  const pins = [
    ...(tourVenues ?? []).flatMap((e) => {
      const v = e.venues as unknown as { id: string; name: string; city: string | null } | null;
      if (!v || pinSeen.has(`v:${v.id}`)) return [];
      pinSeen.add(`v:${v.id}`);
      return [{
        type: "venue" as const,
        id: v.id,
        label: [v.name, v.city].filter(Boolean).join(", "),
      }];
    }),
    ...(tourHotels ?? []).flatMap((h) => {
      const key = `h:${h.name}|${h.city ?? ""}`;
      if (pinSeen.has(key)) return [];
      pinSeen.add(key);
      return [{
        type: "hotel" as const,
        id: h.id,
        label: [h.name, h.city].filter(Boolean).join(", "),
      }];
    }),
  ];

  const [{ data: dayTasks }, { data: dayAttachments }] = await Promise.all([
    supabase
      .from("tasks")
      .select("id, title, due_at, is_complete")
      .eq("day_id", day.id)
      .is("deleted_at", null)
      .order("due_at", { ascending: true, nullsFirst: false }),
    supabase
      .from("attachments")
      .select("id, file_name, size_bytes, tags")
      .eq("parent_type", "day")
      .eq("parent_id", day.id)
      .is("deleted_at", null)
      .order("created_at"),
  ]);

  const { data: prevDayHotels } = prevDay
    ? await supabase
        .from("day_hotels")
        .select("id, name")
        .eq("day_id", prevDay.id)
        .is("deleted_at", null)
        .order("sort_order")
    : { data: [] as { id: string; name: string }[] };

  const personnelOptions = (personnel ?? []).map((p) => ({
    id: p.id,
    name:
      `${p.last_name ?? ""}, ${p.first_name ?? ""}${p.preferred_name ? ` (${p.preferred_name})` : ""}`
        .replace(/^, /, "")
        .trim(),
  }));

  const travelData: TravelItemData[] = (travelItems ?? []).map((item) => ({
    ...(item as unknown as Omit<TravelItemData, "legs" | "passenger_ids">),
    legs: (
      (item.flight_legs ?? []) as {
        id: string;
        airline: string | null;
        flight_number: string | null;
        dep_airport_iata: string | null;
        arr_airport_iata: string | null;
        scheduled_dep: string | null;
        scheduled_arr: string | null;
      }[]
    ).map((leg) => ({
      id: leg.id,
      airline: leg.airline,
      flight_number: leg.flight_number,
      dep_airport_iata: leg.dep_airport_iata,
      arr_airport_iata: leg.arr_airport_iata,
      dep_time: leg.scheduled_dep
        ? formatTimeInZone(new Date(leg.scheduled_dep), tz)
        : "—",
      arr_time: leg.scheduled_arr
        ? formatTimeInZone(new Date(leg.scheduled_arr), tz)
        : "—",
    })),
    passenger_ids: (
      (item.travel_passengers ?? []) as { personnel_id: string }[]
    ).map((p) => p.personnel_id),
  }));

  const hotelData: HotelData[] = (hotels ?? []).map((hotel) => ({
    id: hotel.id,
    name: hotel.name,
    city: hotel.city,
    party: hotel.party,
    check_in_date: hotel.check_in_date,
    check_out_date: hotel.check_out_date,
    check_in_time: hotel.check_in_time,
    check_out_time: hotel.check_out_time,
    notes: hotel.notes,
    stay_group_id: hotel.stay_group_id,
    rooms: (
      (hotel.room_list_entries ?? []) as (HotelData["rooms"][number] & {
        deleted_at: string | null;
      })[]
    ).filter((room) => room.deleted_at === null),
  }));

  const canEdit = can({ tier, permission }, "edit_tour_content");
  const location = [day.city, day.state, day.country].filter(Boolean).join(", ");

  // §5.6 — blocurile ancorate pe time rail: schedule + travel
  function addDaysIso(d: string, n: number): string {
    const x = new Date(`${d}T00:00:00Z`);
    x.setUTCDate(x.getUTCDate() + n);
    return x.toISOString().slice(0, 10);
  }
  type RailBlock = {
    id: string;
    kind: "schedule" | "publicity" | "ground" | "air" | "rail" | "sea";
    title: string;
    startAt: string;
    endAt: string | null;
    confirmed: boolean;
    party?: string | null;
  };
  const railBlocks: RailBlock[] = [
    ...(items ?? [])
      .filter((i) => i.start_at)
      .map((i) => ({
        id: i.id,
        kind: (i.item_type === "publicity" ? "publicity" : "schedule") as RailBlock["kind"],
        title: i.title,
        startAt: i.start_at as string,
        endAt: i.end_at,
        confirmed: i.is_confirmed,
      })),
    ...travelData
      .filter((t) => t.depart_time)
      .map((t) => {
        const startAt = dayInstant(
          addDaysIso(date, t.depart_day_offset),
          (t.depart_time as string).slice(0, 5),
          tz,
        ).toISOString();
        const endAt = t.arrive_time
          ? dayInstant(
              addDaysIso(date, t.arrive_day_offset),
              t.arrive_time.slice(0, 5),
              tz,
            ).toISOString()
          : null;
        return {
          id: t.id,
          kind: t.travel_type as RailBlock["kind"],
          title: t.title ?? "Travel",
          startAt,
          endAt,
          confirmed: t.is_confirmed,
          party: t.party,
        };
      }),
  ];

  // ── Weather + Local Map (blueprint §3.3 [C-S]) ──
  let dayLat = (day as { lat?: number | null }).lat ?? null;
  let dayLng = (day as { lng?: number | null }).lng ?? null;
  if (dayLat === null && day.city && isGoogleEnabled()) {
    const hits = await searchGooglePlaces(
      [day.city, day.country].filter(Boolean).join(", "),
      { maxResults: 1 },
    );
    if (hits[0]?.lat != null) {
      dayLat = hits[0].lat;
      dayLng = hits[0].lng;
      if (canEdit) {
        // backfill o singură dată — următoarele vizite nu mai geocodează
        await supabase
          .from("days")
          .update({ lat: dayLat, lng: dayLng })
          .eq("id", day.id);
      }
    }
  }
  const todayKey = dayKeyInZone(new Date(), tz);
  const weatherStart = addDaysIso(todayKey, -1);
  const weather =
    dayLat !== null && dayLng !== null
      ? await getWeather(dayLat, dayLng, weatherStart, tz, 4).catch(() => null)
      : null;

  // cardurile Venues / Hotels / Key contacts (dashboard MT)
  type VenueJoin = {
    name: string;
    address_line1: string | null;
    city: string | null;
    postal_code: string | null;
    country: string | null;
    urls: { url?: string }[] | string[] | null;
    phones: { number?: string }[] | null;
  } | null;
  const venueCards: VenueCardData[] = (events ?? []).flatMap((e) => {
    const v = e.venues as unknown as VenueJoin;
    if (!v) return [];
    const firstUrl = Array.isArray(v.urls)
      ? typeof v.urls[0] === "string"
        ? (v.urls[0] as string)
        : ((v.urls[0] as { url?: string } | undefined)?.url ?? null)
      : null;
    return [{
      eventHref: `/o/${orgSlug}/t/${tourId}/d/${date}/e/${e.id}`,
      name: v.name,
      address: [v.address_line1, v.city, v.postal_code, v.country].filter(Boolean).join(", "),
      url: firstUrl,
    }];
  });
  const { data: contactValues } = (events ?? []).length
    ? await supabase
        .from("event_field_values")
        .select("value")
        .in("event_id", (events ?? []).map((e) => e.id))
        .eq("field_key", "venue_info.venue_contacts")
    : { data: [] as { value: string | null }[] };
  const keyContactsText = (contactValues ?? [])
    .map((r) => r.value ?? "")
    .filter(Boolean)
    .join("\n");

  const firstTimed = (items ?? [])
    .filter((i) => i.start_at)
    .sort((a, b) => (a.start_at as string).localeCompare(b.start_at as string))[0];
  const firstSchedule = firstTimed
    ? { time: formatTimeInZone(new Date(firstTimed.start_at as string), tz), title: firstTimed.title }
    : null;


  // ── Graphite day workspace: hero + timeline + metric strip + inspector ──
  const isToday = date === todayKey;
  const isPast = date < todayKey;

  const focusItems: FocusItem[] = railBlocks
    .map((block) => ({
      id: block.id,
      time: formatTimeInZone(new Date(block.startAt), tz),
      title: block.title,
      sub: block.party ?? null,
      confirmed: block.confirmed,
      startMs: Date.parse(block.startAt),
      endMs: block.endAt ? Date.parse(block.endAt) : Date.parse(block.startAt) + 45 * 60_000,
    }))
    .sort((a, b) => a.startMs - b.startMs);
  const confirmedCount = focusItems.filter((i) => i.confirmed).length;

  const advanceStatuses = (events ?? []).flatMap((e) =>
    ((e as unknown as { advances?: { status: string; deleted_at: string | null }[] }).advances ?? [])
      .filter((a) => a.deleted_at === null)
      .map((a) => a.status),
  );
  const advanceTotal = advanceStatuses.length;
  const advanceDone = advanceStatuses.filter((st) => st === "done").length;
  const advancePct = advanceTotal > 0 ? Math.round((advanceDone / advanceTotal) * 100) : null;

  const firstVenue = venueCards[0] ?? null;
  const firstEvent = (events ?? [])[0] ?? null;
  const travelCount = travelData.length;
  const firstDepart = travelData
    .filter((t) => t.depart_time)
    .map((t) => (t.depart_time as string).slice(0, 5))
    .sort()[0];

  const metrics: Metric[] = [
    {
      label: t("metricSchedule"),
      value: `${focusItems.length}`,
      sub: t("metricConfirmed", { count: confirmedCount }),
    },
    ...(advancePct !== null
      ? [{
          label: t("metricAdvance"),
          value: `${advancePct}%`,
          sub: t("metricAdvanceSub", { done: advanceDone, total: advanceTotal }),
        }]
      : []),
    ...(travelCount > 0
      ? [{
          label: t("metricTravel"),
          value: firstDepart ?? `${travelCount}`,
          sub: t("metricTravelSub", { count: travelCount }),
        }]
      : []),
  ];

  const gmtLabel = new Intl.DateTimeFormat("en-US", { timeZone: tz, timeZoneName: "shortOffset" })
    .formatToParts(new Date())
    .find((part) => part.type === "timeZoneName")?.value ?? tz;
  const [, mmNav, ddNav] = date.split("-");
  void mmNav;
  void ddNav;
  const allDatesRes = await supabase
    .from("days")
    .select("date")
    .eq("tour_id", tourId)
    .is("deleted_at", null)
    .order("date");
  const tourDates = (allDatesRes.data ?? []).map((d) => d.date);
  const dateIdx = tourDates.indexOf(date);
  const prevDate = dateIdx > 0 ? tourDates[dateIdx - 1] : null;
  const nextDate = dateIdx >= 0 && dateIdx < tourDates.length - 1 ? tourDates[dateIdx + 1] : null;

  const contactLines = keyContactsText
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 4);

  const navBtn =
    "flex h-[30px] w-[30px] items-center justify-center rounded-[8px] border border-hairline bg-fill-control text-secondary transition-colors hover:bg-fill-control-hover hover:text-primary";

  return (
    <div className="flex min-h-full">
    <main className="min-w-0 flex-1 px-8 pb-11">
      <header className="flex items-end justify-between gap-6 border-b border-hairline pb-5 pt-[26px]">
        <div className="min-w-0">
          <p className="text-[11.5px] text-secondary">
            {formatDayHeader(day.date, tz, locale)}
            {" · "}
            <span className={day.day_type === "show" ? "text-success" : "text-secondary"}>
              {td(day.day_type)}
            </span>
          </p>
          <h1 className="page-title mt-1 truncate">
            {location || "—"}
            {firstVenue && ` — ${firstVenue.name}`}
          </h1>
        </div>
        <div className="flex shrink-0 items-end gap-4">
          <span className="flex items-center gap-1.5 pb-1">
            {prevDate ? (
              <Link href={`/o/${orgSlug}/t/${tourId}/d/${prevDate}`} title={prevDate} className={navBtn}>
                <ChevronLeft size={14} strokeWidth={1.75} />
              </Link>
            ) : (
              <span className={`${navBtn} pointer-events-none opacity-40`}>
                <ChevronLeft size={14} strokeWidth={1.75} />
              </span>
            )}
            {nextDate ? (
              <Link href={`/o/${orgSlug}/t/${tourId}/d/${nextDate}`} title={nextDate} className={navBtn}>
                <ChevronRight size={14} strokeWidth={1.75} />
              </Link>
            ) : (
              <span className={`${navBtn} pointer-events-none opacity-40`}>
                <ChevronRight size={14} strokeWidth={1.75} />
              </span>
            )}
          </span>
          <HeaderClock tz={tz} subLabel={`${t("localTime")} · ${gmtLabel}`} />
        </div>
      </header>

      <div className="mx-auto w-full max-w-[960px] space-y-7 pt-6">
      <DayActionsBar orgSlug={orgSlug} dayId={day.id} canEdit={canEdit} />
      {isDstTransitionDay(day.date, tz) && (
        <p className="rounded-md border border-warning bg-warning-subtle px-3 py-1.5 text-xs text-warning">
          {t("dstNotice")}
        </p>
      )}

      <DayFocus
        items={focusItems}
        isToday={isToday}
        isPast={isPast}
        labels={{
          upNext: t("upNext"),
          today: t("today"),
          scheduledItems: t("scheduledItems", { count: focusItems.length }),
          complete: t("complete"),
          onSchedule: t("onSchedule"),
          unconfirmed: t("unconfirmedState"),
        }}
      />

      <MetricStrip metrics={metrics} />

      <div id="notes" className="rounded-lg border border-hairline bg-surface p-4 shadow-xs">
        <NotesSection
          orgSlug={orgSlug}
          tourId={tourId}
          day={day as DayData}
          canEdit={canEdit}
        />
      </div>

      {day.day_type === "show" && (
        <div id="events" className="rounded-lg border border-hairline bg-surface p-4 shadow-xs">
          <EventsSection
            orgSlug={orgSlug}
            tourId={tourId}
            date={date}
            dayId={day.id}
            events={(events ?? []).map((e) => ({
              id: e.id,
              title: e.title,
              venue_name:
                (e.venues as unknown as { name: string } | null)?.name ?? null,
            }))}
            canEdit={canEdit}
            canAccounting={can({ tier, permission }, "view_accounting")}
          />
        </div>
      )}

      <div id="schedule" className="rounded-lg border border-hairline bg-surface p-4 shadow-xs space-y-4">
        <ScheduleSection
          orgSlug={orgSlug}
          tourId={tourId}
          day={day as DayData}
          items={(items ?? []) as ScheduleItemData[]}
          templates={templates ?? []}
          canEdit={canEdit}
        />
      </div>

      <div id="travel" className="rounded-lg border border-hairline bg-surface p-4 shadow-xs">
        <TravelSection
          orgSlug={orgSlug}
          tourId={tourId}
          date={date}
          dayId={day.id}
          tz={tz}
          items={travelData}
          personnel={personnelOptions}
          pins={pins}
          firstSchedule={firstSchedule}
          canEdit={canEdit}
        />
      </div>

      <div id="hotels" className="rounded-lg border border-hairline bg-surface p-4 shadow-xs">
        <HotelsSection
          orgSlug={orgSlug}
          tourId={tourId}
          date={date}
          dayId={day.id}
          hotels={hotelData}
          prevDayHotels={prevDayHotels ?? []}
          personnel={personnelOptions}
          canEdit={canEdit}
        />
      </div>

      <div id="tasks" className="rounded-lg border border-hairline bg-surface p-4 shadow-xs">
        <TasksSection
          orgSlug={orgSlug}
          tourId={tourId}
          date={date}
          dayId={day.id}
          tasks={(dayTasks ?? []) as TaskData[]}
          canEdit={canEdit}
        />
      </div>

      <div id="attachments" className="rounded-lg border border-hairline bg-surface p-4 shadow-xs">
        <AttachmentsSection
          orgSlug={orgSlug}
          tourId={tourId}
          date={date}
          dayId={day.id}
          orgId={org.id}
          attachments={(dayAttachments ?? []) as AttachmentData[]}
          canEdit={canEdit}
        />
      </div>
      </div>
    </main>

    {/* ── Context inspector (Graphite README §2) ── */}
    <aside className="sticky top-0 hidden h-[calc(100vh-52px)] w-[280px] shrink-0 self-start overflow-y-auto border-l border-hairline bg-surface px-5 xl:block">
      <div className="border-b border-hairline pb-4 pt-5">
        <p className="eyebrow">{t("inspDetails")}</p>
        {firstVenue ? (
          <>
            <p className="mt-1.5 font-display text-[14px] font-semibold text-primary">
              {firstVenue.name}
            </p>
            <p className="mt-0.5 text-[11px] leading-relaxed text-secondary">{firstVenue.address}</p>
          </>
        ) : (
          <p className="mt-1.5 text-[12px] text-secondary">{location || "—"}</p>
        )}
        {dayLat !== null && dayLng !== null && (
          <a
            href={`https://www.google.com/maps/search/?api=1&query=${dayLat},${dayLng}`}
            target="_blank"
            rel="noreferrer"
            className="mt-2 inline-flex items-center gap-1 text-[11px] text-accent hover:text-accent-hover"
          >
            {t("inspOpenMaps")} <ExternalLink size={11} strokeWidth={1.75} />
          </a>
        )}
      </div>

      {weather && weather.length > 0 && (
        <div className="border-b border-hairline py-[18px]">
          <p className="eyebrow">{t("inspConditions")}</p>
          <div className="mt-2 flex items-start justify-between">
            <p className="font-display text-[30px] font-medium leading-none text-primary">
              {(weather.find((w) => w.date === date) ?? weather[0]).tMax}°
            </p>
            <div className="text-right text-[10px] leading-[1.7] text-secondary">
              {(() => {
                const w = weather.find((x) => x.date === date) ?? weather[0];
                return (
                  <>
                    {w.precipProb != null && <p>{t("inspPrecip", { pct: w.precipProb })}</p>}
                    <p>{t("inspWind", { kmh: w.windMax })}</p>
                    <p>{w.sunrise} – {w.sunset}</p>
                  </>
                );
              })()}
            </div>
          </div>
        </div>
      )}

      {advancePct !== null && (
        <div className="border-b border-hairline py-[18px]">
          <p className="eyebrow">{t("inspAdvance")}</p>
          <div className="mt-2 flex items-end justify-between">
            <p className="font-display text-[26px] font-medium leading-none text-primary">
              {advancePct}%
            </p>
            <p className="font-mono text-[11px] text-secondary">
              {advanceDone} / {advanceTotal}
            </p>
          </div>
          <div className="mt-2.5 h-1 overflow-hidden rounded-[2px] bg-track">
            <div
              className="h-full origin-left rounded-[2px] bg-accent motion-safe:[animation:barIn_700ms_ease-out]"
              style={{ width: `${advancePct}%` }}
            />
          </div>
          {firstEvent && (
            <Link
              href={`/o/${orgSlug}/t/${tourId}/d/${date}/e/${firstEvent.id}/advance`}
              className="mt-2.5 inline-block text-[11px] text-accent hover:text-accent-hover"
            >
              {t("inspOpenAdvance")} →
            </Link>
          )}
        </div>
      )}

      {contactLines.length > 0 && (
        <div className="border-b border-hairline py-[18px]">
          <p className="eyebrow">{t("inspContacts")}</p>
          <ul className="mt-1">
            {contactLines.map((line, i) => {
              const phone = line.match(/\+?[\d][\d\s().-]{6,}\d/)?.[0];
              const nameText = line
                .replace(phone ?? "", "")
                .replace(/[\w.+-]+@[\w.-]+\.\w+/, "")
                .replace(/[-–,;·]+\s*$/, "")
                .trim();
              const initials = nameText
                .split(/\s+/)
                .slice(0, 2)
                .map((word) => word[0])
                .join("")
                .toUpperCase();
              return (
                <li key={i} className="flex items-center gap-2.5 py-2">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-avatar font-display text-[9px] font-semibold text-secondary">
                    {initials || "?"}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[12px] font-medium text-primary">
                    {nameText || line}
                  </span>
                  {phone && (
                    <a
                      href={`tel:${phone.replace(/[\s().-]/g, "")}`}
                      className="shrink-0 text-[11px] text-accent hover:underline"
                    >
                      {t("inspCall")}
                    </a>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {day.general_notes && (
        <div className="py-[18px]">
          <p className="eyebrow">{t("inspNote")}</p>
          <p className="mt-1.5 whitespace-pre-line text-[11.5px] leading-[1.55] text-secondary">
            {day.general_notes}
          </p>
        </div>
      )}
    </aside>
    </div>
  );
}
