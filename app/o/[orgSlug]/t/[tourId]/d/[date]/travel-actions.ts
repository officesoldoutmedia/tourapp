"use server";

import { revalidatePath } from "next/cache";
import { requireOrg } from "@/lib/org";
import { can } from "@/lib/permissions";
import { travelAutoTitle, arrivalFrom } from "@/lib/travel";
import { computeGroundDistance } from "@/lib/googlePlaces";

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

export interface TravelItemInput {
  id?: string;
  dayId: string;
  travelType: "ground" | "air" | "rail" | "sea";
  title: string;
  autoTitle: boolean;
  party: string;
  originLabel: string;
  destLabel: string;
  departTime: string; // 'HH:mm' | ''
  departDayOffset: number;
  arriveTime: string;
  arriveDayOffset: number;
  detail: string;
  distanceUnit: "kilometers" | "miles";
  // rail/sea extra
  railLine: string;
  trainNumber: string;
  ticketStatus: string;
  confirmationNumber: string;
  /** true → recalculează distanța/durata/sosirea prin Distance Matrix [C] */
  autoCalc: boolean;
}

export async function upsertTravelItem(
  orgSlug: string,
  tourId: string,
  date: string,
  tz: string,
  input: TravelItemInput,
): Promise<{ error?: string }> {
  const { supabase, user } = await requireEditor(orgSlug);

  let distance: number | null = null;
  let durationMin: number | null = null;
  let arriveTime = input.arriveTime || null;
  let arriveDayOffset = input.arriveDayOffset;

  // [C §6.7] Ground auto-calc: Arrival Time, Travel Time, Distance
  if (
    input.autoCalc &&
    input.travelType === "ground" &&
    input.originLabel &&
    input.destLabel
  ) {
    const result = await computeGroundDistance(input.originLabel, input.destLabel);
    if (result) {
      distance =
        input.distanceUnit === "miles"
          ? Math.round(result.distanceKm * 0.621371 * 10) / 10
          : result.distanceKm;
      durationMin = result.durationMin;
      if (input.departTime) {
        const arrival = arrivalFrom(date, input.departTime, result.durationMin, tz);
        arriveTime = arrival.time;
        arriveDayOffset = input.departDayOffset + arrival.dayOffset;
      }
    }
  }

  const row: Record<string, unknown> = {
    day_id: input.dayId,
    travel_type: input.travelType,
    auto_title: input.autoTitle,
    party: input.party || null,
    origin_label: input.originLabel || null,
    dest_label: input.destLabel || null,
    depart_time: input.departTime || null,
    depart_day_offset: input.departDayOffset,
    arrive_time: arriveTime,
    arrive_day_offset: arriveDayOffset,
    depart_tz: tz,
    arrive_tz: tz,
    detail: input.detail || null,
    distance_unit: input.distanceUnit,
    rail_line: input.railLine || null,
    train_number: input.trainNumber || null,
    ticket_status: input.ticketStatus || null,
    confirmation_number: input.confirmationNumber || null,
    updated_by: user.id,
  };
  if (distance != null) row.distance = distance;
  if (durationMin != null) row.duration_min = durationMin;

  row.title = input.autoTitle
    ? travelAutoTitle({
        travel_type: input.travelType,
        origin_label: input.originLabel,
        dest_label: input.destLabel,
        distance,
        distance_unit: input.distanceUnit,
        duration_min: durationMin,
      })
    : input.title.trim() || null;

  const { error } = input.id
    ? await supabase.from("travel_items").update(row).eq("id", input.id)
    : await supabase.from("travel_items").insert(row);
  if (error) return { error: error.message };
  revalidatePath(dayPath(orgSlug, tourId, date));
  return {};
}

export async function toggleTravelConfirmed(
  orgSlug: string,
  tourId: string,
  date: string,
  itemId: string,
  value: boolean,
): Promise<{ error?: string }> {
  const { supabase } = await requireEditor(orgSlug);
  const { error } = await supabase
    .from("travel_items")
    .update({ is_confirmed: value })
    .eq("id", itemId);
  if (error) return { error: error.message };
  revalidatePath(dayPath(orgSlug, tourId, date));
  return {};
}

export async function deleteTravelItem(
  orgSlug: string,
  tourId: string,
  date: string,
  itemId: string,
): Promise<{ error?: string }> {
  const { supabase } = await requireEditor(orgSlug);
  const { error } = await supabase
    .from("travel_items")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", itemId);
  if (error) return { error: error.message };
  revalidatePath(dayPath(orgSlug, tourId, date));
  return {};
}

export interface FlightLegInput {
  id?: string;
  travelItemId: string;
  airline: string;
  flightNumber: string;
  depIata: string;
  arrIata: string;
  depTime: string; // 'HH:mm'
  arrTime: string;
}

export async function upsertFlightLeg(
  orgSlug: string,
  tourId: string,
  date: string,
  tz: string,
  input: FlightLegInput,
): Promise<{ error?: string }> {
  const { supabase } = await requireEditor(orgSlug);
  const row = {
    travel_item_id: input.travelItemId,
    airline: input.airline || null,
    flight_number: input.flightNumber || null,
    dep_airport_iata: input.depIata.toUpperCase() || null,
    arr_airport_iata: input.arrIata.toUpperCase() || null,
    scheduled_dep: input.depTime
      ? new Date(`${date}T${input.depTime}:00`).toISOString()
      : null,
    scheduled_arr: input.arrTime
      ? new Date(`${date}T${input.arrTime}:00`).toISOString()
      : null,
  };
  void tz; // MVP: orele legs se introduc manual; provider live = Faza 2 [N]
  const { error } = input.id
    ? await supabase.from("flight_legs").update(row).eq("id", input.id)
    : await supabase.from("flight_legs").insert(row);
  if (error) return { error: error.message };
  revalidatePath(dayPath(orgSlug, tourId, date));
  return {};
}

export async function deleteFlightLeg(
  orgSlug: string,
  tourId: string,
  date: string,
  legId: string,
): Promise<{ error?: string }> {
  const { supabase } = await requireEditor(orgSlug);
  const { error } = await supabase.from("flight_legs").delete().eq("id", legId);
  if (error) return { error: error.message };
  revalidatePath(dayPath(orgSlug, tourId, date));
  return {};
}

export async function setTravelPassengers(
  orgSlug: string,
  tourId: string,
  date: string,
  travelItemId: string,
  personnelIds: string[],
): Promise<{ error?: string }> {
  const { supabase } = await requireEditor(orgSlug);
  const { error: delError } = await supabase
    .from("travel_passengers")
    .delete()
    .eq("travel_item_id", travelItemId);
  if (delError) return { error: delError.message };
  if (personnelIds.length > 0) {
    const { error } = await supabase.from("travel_passengers").insert(
      personnelIds.map((pid) => ({
        travel_item_id: travelItemId,
        personnel_id: pid,
      })),
    );
    if (error) return { error: error.message };
  }
  revalidatePath(dayPath(orgSlug, tourId, date));
  return {};
}
