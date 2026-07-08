"use server";

import { revalidatePath } from "next/cache";
import { requireOrg } from "@/lib/org";
import { can } from "@/lib/permissions";
import { extendStayCopy, pickLinkedFields } from "@/lib/hotels";
import {
  isGoogleEnabled,
  searchGooglePlaces,
  type GooglePlaceResult,
} from "@/lib/googlePlaces";

async function requireEditor(orgSlug: string) {
  const ctx = await requireOrg(orgSlug);
  if (!can({ tier: ctx.tier, permission: ctx.permission }, "edit_tour_content")) {
    throw new Error("forbidden");
  }
  return ctx;
}

function dayPath(orgSlug: string, tourId: string, date: string) {
  return `/o/${orgSlug}/t/${tourId}/d/${date}`;
}

export interface HotelHit {
  name: string;
  city: string | null;
  source: "tour" | "google";
  google?: GooglePlaceResult;
}

/** Căutare hotel [C §6.8]: stock-ul turului + Google Places cu badge sursă. */
export async function searchHotels(
  orgSlug: string,
  tourId: string,
  query: string,
): Promise<HotelHit[]> {
  const { supabase } = await requireOrg(orgSlug);
  if (query.trim().length < 2) return [];

  const { data: days } = await supabase
    .from("days")
    .select("id")
    .eq("tour_id", tourId)
    .is("deleted_at", null);
  const dayIds = (days ?? []).map((d) => d.id);

  const hits: HotelHit[] = [];
  if (dayIds.length > 0) {
    const { data } = await supabase
      .from("day_hotels")
      .select("name, city")
      .in("day_id", dayIds)
      .ilike("name", `%${query.trim()}%`)
      .is("deleted_at", null)
      .limit(10);
    const seen = new Set<string>();
    for (const h of data ?? []) {
      const key = `${h.name}|${h.city ?? ""}`.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      hits.push({ name: h.name, city: h.city, source: "tour" });
    }
  }

  if (hits.length < 3 && isGoogleEnabled()) {
    const google = await searchGooglePlaces(query, {
      includedType: "lodging",
      maxResults: 6,
    });
    for (const g of google) {
      hits.push({ name: g.name, city: g.city, source: "google", google: g });
    }
  }
  return hits;
}

export interface HotelInput {
  id?: string;
  dayId: string;
  name: string;
  city: string;
  party: string;
  checkInDate: string;
  checkOutDate: string;
  checkInTime: string;
  checkOutTime: string;
  notes: string;
  google?: GooglePlaceResult;
}

export async function upsertHotel(
  orgSlug: string,
  tourId: string,
  date: string,
  input: HotelInput,
): Promise<{ error?: string }> {
  const { supabase, user } = await requireEditor(orgSlug);
  if (!input.name.trim() && !input.google) return { error: "name_required" };

  const row: Record<string, unknown> = {
    name: input.google?.name ?? input.name.trim(),
    city: input.google?.city ?? (input.city || null),
    party: input.party || null,
    check_in_date: input.checkInDate || null,
    check_out_date: input.checkOutDate || null,
    check_in_time: input.checkInTime || null,
    check_out_time: input.checkOutTime || null,
    notes: input.notes || null,
    updated_by: user.id,
  };
  if (input.google) {
    Object.assign(row, {
      address_line1: input.google.addressLine1,
      state: input.google.state,
      country: input.google.country,
      postal_code: input.google.postalCode,
      lat: input.google.lat,
      lng: input.google.lng,
      phones: input.google.phone
        ? [{ number: input.google.phone, label: "Main Number" }]
        : [],
      urls: input.google.website ? [input.google.website] : [],
      google_place_id: input.google.googlePlaceId,
      source: "google",
    });
  }

  if (input.id) {
    // [C] LINKED: editul unui hotel cu stay_group_id se propagă pe tot grupul
    const { data: existing } = await supabase
      .from("day_hotels")
      .select("stay_group_id")
      .eq("id", input.id)
      .single();
    const patch = pickLinkedFields(row);
    const query = existing?.stay_group_id
      ? supabase
          .from("day_hotels")
          .update({ ...patch, updated_by: user.id })
          .eq("stay_group_id", existing.stay_group_id)
      : supabase.from("day_hotels").update(row).eq("id", input.id);
    const { error } = await query;
    if (error) return { error: error.message };
  } else {
    const { error } = await supabase
      .from("day_hotels")
      .insert({ ...row, day_id: input.dayId });
    if (error) return { error: error.message };
  }
  revalidatePath(dayPath(orgSlug, tourId, date));
  return {};
}

/**
 * EXTEND STAY [C §6.8]: copiază hotelul (cu room list + key contacts) pe
 * ziua curentă și leagă recordurile prin stay_group_id.
 */
export async function extendStay(
  orgSlug: string,
  tourId: string,
  date: string,
  sourceHotelId: string,
  targetDayId: string,
): Promise<{ error?: string }> {
  const { supabase } = await requireEditor(orgSlug);

  const { data: source } = await supabase
    .from("day_hotels")
    .select("*")
    .eq("id", sourceHotelId)
    .single();
  if (!source) return { error: "hotel_not_found" };

  // asigură grupul pe sursă
  let groupId: string = source.stay_group_id;
  if (!groupId) {
    groupId = crypto.randomUUID();
    const { error } = await supabase
      .from("day_hotels")
      .update({ stay_group_id: groupId })
      .eq("id", sourceHotelId);
    if (error) return { error: error.message };
  }

  const { data: copy, error: copyError } = await supabase
    .from("day_hotels")
    .insert(extendStayCopy(source, targetDayId, groupId))
    .select("id")
    .single();
  if (copyError || !copy) return { error: copyError?.message ?? "copy_failed" };

  // room list + key contacts se copiază [C]
  const [{ data: rooms }, { data: contacts }] = await Promise.all([
    supabase
      .from("room_list_entries")
      .select(
        "personnel_id, guest_name, bag_tag, room_number, room_type, smoking, check_in, check_out, confirmation_number, notes, sort_order",
      )
      .eq("day_hotel_id", sourceHotelId)
      .is("deleted_at", null),
    supabase
      .from("hotel_key_contacts")
      .select("contact_id, role, sort_order")
      .eq("day_hotel_id", sourceHotelId),
  ]);
  if (rooms && rooms.length > 0) {
    const { error } = await supabase
      .from("room_list_entries")
      .insert(rooms.map((r) => ({ ...r, day_hotel_id: copy.id })));
    if (error) return { error: error.message };
  }
  if (contacts && contacts.length > 0) {
    const { error } = await supabase
      .from("hotel_key_contacts")
      .insert(contacts.map((c) => ({ ...c, day_hotel_id: copy.id })));
    if (error) return { error: error.message };
  }

  revalidatePath(dayPath(orgSlug, tourId, date));
  return {};
}

/** UNLINK [C]: rupe legătura ca să editezi independent. */
export async function unlinkHotel(
  orgSlug: string,
  tourId: string,
  date: string,
  hotelId: string,
): Promise<{ error?: string }> {
  const { supabase } = await requireEditor(orgSlug);
  const { error } = await supabase
    .from("day_hotels")
    .update({ stay_group_id: null })
    .eq("id", hotelId);
  if (error) return { error: error.message };
  revalidatePath(dayPath(orgSlug, tourId, date));
  return {};
}

export async function deleteHotel(
  orgSlug: string,
  tourId: string,
  date: string,
  hotelId: string,
): Promise<{ error?: string }> {
  const { supabase } = await requireEditor(orgSlug);
  const { error } = await supabase
    .from("day_hotels")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", hotelId);
  if (error) return { error: error.message };
  revalidatePath(dayPath(orgSlug, tourId, date));
  return {};
}

/** Sortare custom [C]: swap de sort_order cu vecinul. */
export async function moveHotel(
  orgSlug: string,
  tourId: string,
  date: string,
  dayId: string,
  hotelId: string,
  direction: -1 | 1,
): Promise<{ error?: string }> {
  const { supabase } = await requireEditor(orgSlug);
  const { data: hotels } = await supabase
    .from("day_hotels")
    .select("id, sort_order")
    .eq("day_id", dayId)
    .is("deleted_at", null)
    .order("sort_order")
    .order("created_at");
  if (!hotels) return { error: "not_found" };

  const idx = hotels.findIndex((h) => h.id === hotelId);
  const target = idx + direction;
  if (idx < 0 || target < 0 || target >= hotels.length) return {};

  // normalizează sort_order la index, apoi swap
  const updates = hotels.map((h, i) => ({ id: h.id, sort_order: i }));
  [updates[idx].sort_order, updates[target].sort_order] = [
    updates[target].sort_order,
    updates[idx].sort_order,
  ];
  for (const u of updates) {
    const { error } = await supabase
      .from("day_hotels")
      .update({ sort_order: u.sort_order })
      .eq("id", u.id);
    if (error) return { error: error.message };
  }
  revalidatePath(dayPath(orgSlug, tourId, date));
  return {};
}

export interface RoomEntryInput {
  id?: string;
  dayHotelId: string;
  personnelId: string | null;
  guestName: string;
  bagTag: string;
  roomNumber: string;
  roomType: string;
  smoking: boolean;
  checkIn: string;
  checkOut: string;
  confirmationNumber: string;
}

export async function upsertRoomEntry(
  orgSlug: string,
  tourId: string,
  date: string,
  input: RoomEntryInput,
): Promise<{ error?: string }> {
  const { supabase } = await requireEditor(orgSlug);
  const row = {
    day_hotel_id: input.dayHotelId,
    personnel_id: input.personnelId,
    guest_name: input.guestName || null,
    bag_tag: input.bagTag || null,
    room_number: input.roomNumber || null,
    room_type: input.roomType || null,
    smoking: input.smoking,
    check_in: input.checkIn || null,
    check_out: input.checkOut || null,
    confirmation_number: input.confirmationNumber || null,
  };
  const { error } = input.id
    ? await supabase.from("room_list_entries").update(row).eq("id", input.id)
    : await supabase.from("room_list_entries").insert(row);
  if (error) return { error: error.message };
  revalidatePath(dayPath(orgSlug, tourId, date));
  return {};
}

export async function deleteRoomEntry(
  orgSlug: string,
  tourId: string,
  date: string,
  entryId: string,
): Promise<{ error?: string }> {
  const { supabase } = await requireEditor(orgSlug);
  const { error } = await supabase
    .from("room_list_entries")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", entryId);
  if (error) return { error: error.message };
  revalidatePath(dayPath(orgSlug, tourId, date));
  return {};
}
