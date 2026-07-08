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
import { formatTimeInZone } from "@/lib/datetime";

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
      "id, date, day_type, city, state, country, timezone, general_notes, travel_notes, hotel_notes",
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
      .select("id, title, venues(name)")
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

  return (
    <main className="mx-auto w-full max-w-3xl space-y-8 p-6">
      <header className="space-y-1">
        <div className="flex items-baseline justify-between gap-4">
          <h1 className="text-xl font-semibold">{location || "—"}</h1>
          <span className="rounded-full bg-neutral-100 px-3 py-1 text-xs font-semibold">
            {td(day.day_type)}
          </span>
        </div>
        <p className="text-sm text-neutral-500">
          {formatDayHeader(day.date, tz, locale)}
        </p>
        {isDstTransitionDay(day.date, tz) && (
          <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs text-amber-900">
            {t("dstNotice")}
          </p>
        )}
      </header>

      <NotesSection
        orgSlug={orgSlug}
        tourId={tourId}
        day={day as DayData}
        canEdit={canEdit}
      />

      {day.day_type === "show" && (
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
        />
      )}

      <ScheduleSection
        orgSlug={orgSlug}
        tourId={tourId}
        day={day as DayData}
        items={(items ?? []) as ScheduleItemData[]}
        templates={templates ?? []}
        canEdit={canEdit}
      />

      <TravelSection
        orgSlug={orgSlug}
        tourId={tourId}
        date={date}
        dayId={day.id}
        tz={tz}
        items={travelData}
        personnel={personnelOptions}
        pins={pins}
        canEdit={canEdit}
      />

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
    </main>
  );
}
