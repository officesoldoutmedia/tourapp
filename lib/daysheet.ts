import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Asamblarea datelor pentru Day Sheet (§6.17). Rulează prin clientul
 * PRIMIT: cu clientul userului, RLS aplică visibility-ul lui (DoD);
 * cu service client + publicOnly, rămân doar itemii fără reguli [N].
 */

export interface DaySheetData {
  date: string;
  day_type: string;
  city: string | null;
  country: string | null;
  timezone: string | null;
  tour: string;
  general_notes: string | null;
  travel_notes: string | null;
  hotel_notes: string | null;
  schedule: { title: string; start_at: string | null; end_at: string | null; is_confirmed: boolean }[];
  events: { title: string; venue: string | null; address: string | null; capacity: number | null }[];
  travel: { title: string | null; depart_time: string | null; arrive_time: string | null; party: string | null }[];
  hotels: {
    name: string;
    city: string | null;
    check_in_date: string | null;
    check_out_date: string | null;
    rooms: { name: string; room_number: string | null; room_type: string | null }[];
  }[];
  tasks: { title: string; due_at: string | null; is_complete: boolean }[];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = SupabaseClient<any, "public", any>;

export async function getDaySheetData(
  supabase: AnyClient,
  dayId: string,
  opts: { includeRooms?: boolean; publicOnly?: boolean } = {},
): Promise<DaySheetData | null> {
  const { data: day } = await supabase
    .from("days")
    .select(
      "id, date, day_type, city, country, timezone, general_notes, travel_notes, hotel_notes, tours(name, organization_id)",
    )
    .eq("id", dayId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!day) return null;
  const tour = day.tours as unknown as { name: string; organization_id: string };

  const [
    { data: schedule },
    { data: events },
    { data: travel },
    { data: hotels },
    { data: tasks },
  ] = await Promise.all([
    supabase
      .from("schedule_items")
      .select("id, title, start_at, end_at, is_confirmed")
      .eq("day_id", dayId)
      .is("deleted_at", null)
      .order("start_at", { ascending: true, nullsFirst: false }),
    supabase
      .from("events")
      .select("id, title, venues(name, address_line1, city, capacity)")
      .eq("day_id", dayId)
      .is("deleted_at", null),
    supabase
      .from("travel_items")
      .select("id, title, depart_time, arrive_time, party")
      .eq("day_id", dayId)
      .is("deleted_at", null)
      .order("depart_time", { ascending: true, nullsFirst: false }),
    supabase
      .from("day_hotels")
      .select(
        "id, name, city, check_in_date, check_out_date, room_list_entries(guest_name, room_number, room_type, deleted_at, tour_personnel(first_name, last_name))",
      )
      .eq("day_id", dayId)
      .is("deleted_at", null)
      .order("sort_order"),
    supabase
      .from("tasks")
      .select("id, title, due_at, is_complete")
      .eq("day_id", dayId)
      .is("deleted_at", null),
  ]);

  // publicOnly [N]: service client vede tot → excludem manual orice item
  // cu reguli de visibility (share link = "basic itinerary")
  let restricted = new Set<string>();
  if (opts.publicOnly) {
    const ids = [
      ...(schedule ?? []).map((s) => s.id),
      ...(travel ?? []).map((t) => t.id),
      ...(hotels ?? []).map((h) => h.id),
      ...(tasks ?? []).map((t) => t.id),
    ];
    if (ids.length > 0) {
      const { data: rules } = await supabase
        .from("visibility_rules")
        .select("subject_id")
        .in("subject_id", ids);
      restricted = new Set((rules ?? []).map((r) => r.subject_id));
    }
  }
  const visible = <T extends { id: string }>(rows: T[] | null): T[] =>
    (rows ?? []).filter((row) => !restricted.has(row.id));

  return {
    date: day.date,
    day_type: day.day_type,
    city: day.city,
    country: day.country,
    timezone: day.timezone,
    tour: tour.name,
    general_notes: day.general_notes,
    travel_notes: day.travel_notes,
    hotel_notes: day.hotel_notes,
    schedule: visible(schedule).map((s) => ({
      title: s.title,
      start_at: s.start_at,
      end_at: s.end_at,
      is_confirmed: s.is_confirmed,
    })),
    events: (events ?? []).map((e) => {
      const venue = e.venues as unknown as {
        name: string;
        address_line1: string | null;
        city: string | null;
        capacity: number | null;
      } | null;
      return {
        title: e.title ?? venue?.name ?? "—",
        venue: venue?.name ?? null,
        address: [venue?.address_line1, venue?.city].filter(Boolean).join(", ") || null,
        capacity: venue?.capacity ?? null,
      };
    }),
    travel: visible(travel).map((t) => ({
      title: t.title,
      depart_time: t.depart_time,
      arrive_time: t.arrive_time,
      party: t.party,
    })),
    hotels: visible(hotels).map((h) => ({
      name: h.name,
      city: h.city,
      check_in_date: h.check_in_date,
      check_out_date: h.check_out_date,
      rooms: !opts.includeRooms
        ? []
        : (
            (h.room_list_entries ?? []) as unknown as {
              guest_name: string | null;
              room_number: string | null;
              room_type: string | null;
              deleted_at: string | null;
              tour_personnel: { first_name: string | null; last_name: string | null } | null;
            }[]
          )
            .filter((r) => r.deleted_at === null)
            .map((r) => ({
              name:
                r.guest_name ??
                [r.tour_personnel?.last_name, r.tour_personnel?.first_name]
                  .filter(Boolean)
                  .join(", "),
              room_number: r.room_number,
              room_type: r.room_type,
            })),
    })),
    tasks: visible(tasks).map((t) => ({
      title: t.title,
      due_at: t.due_at,
      is_complete: t.is_complete,
    })),
  };
}
