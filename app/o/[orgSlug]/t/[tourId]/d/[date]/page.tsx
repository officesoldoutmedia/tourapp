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
import { TimeRail, type RailBlock } from "@/components/TimeRail";
import {
  WeatherCard,
  MapCard,
  VenuesCard,
  HotelsCard,
  KeyContactsCard,
  type MapPinLink,
  type VenueCardData,
  type HotelCardData,
} from "@/components/DayDashboardCards";
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
      .select("id, title, venues(name, address_line1, city, postal_code, country, urls, phones)")
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
  const weatherHighlight =
    weather?.some((w) => w.date === date) ? date : todayKey;

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
  const hotelCards: HotelCardData[] = hotelData.map((h) => ({
    name: h.name,
    address: [
      (h as { address_line1?: string | null }).address_line1,
      h.city,
      (h as { country?: string | null }).country,
    ].filter(Boolean).join(", "),
    phone: ((h as { phones?: { number?: string }[] }).phones ?? [])[0]?.number ?? null,
  }));
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

  const mapPins: MapPinLink[] = [
    ...(events ?? []).flatMap((e) => {
      const v = e.venues as unknown as {
        name: string;
        address_line1: string | null;
        city: string | null;
      } | null;
      if (!v) return [];
      return [{
        kind: "venue" as const,
        name: v.name,
        query: [v.name, v.address_line1, v.city].filter(Boolean).join(", "),
      }];
    }),
    ...hotelData.map((h) => ({
      kind: "hotel" as const,
      name: h.name,
      query: [h.name, h.city].filter(Boolean).join(", "),
    })),
  ];

  return (
    <main className="mx-auto w-full max-w-3xl space-y-8 p-6">
      <header className="space-y-1">
        <div className="flex items-baseline justify-between gap-4">
          <h1 className="font-display text-xl font-semibold tracking-tight">{location || "—"}</h1>
          <span className="rounded-full bg-inset px-3 py-1 text-xs font-semibold">
            {td(day.day_type)}
          </span>
        </div>
        <p className="text-sm text-secondary">
          {formatDayHeader(day.date, tz, locale)}
        </p>
        <DayActionsBar orgSlug={orgSlug} dayId={day.id} canEdit={canEdit} />
        {isDstTransitionDay(day.date, tz) && (
          <p className="rounded-md border border-warning bg-warning-subtle px-3 py-1.5 text-xs text-warning">
            {t("dstNotice")}
          </p>
        )}
      </header>

      {(weather || dayLat !== null) && (
        <div className="grid gap-4 md:grid-cols-2">
          {weather && (
            <WeatherCard
              days={weather}
              highlight={weatherHighlight}
              tz={tz}
              locale={locale}
              locationLabel={day.city ?? ""}
            />
          )}
          {dayLat !== null && dayLng !== null && (
            <MapCard lat={dayLat} lng={dayLng} pins={mapPins} />
          )}
        </div>
      )}

      {(venueCards.length > 0 || hotelCards.length > 0) && (
        <div className="grid gap-4 md:grid-cols-2">
          <VenuesCard venues={venueCards} />
          <HotelsCard hotels={hotelCards} />
        </div>
      )}
      <KeyContactsCard text={keyContactsText} />

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
        <TimeRail date={date} tz={tz} blocks={railBlocks} />
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
    </main>
  );
}
