"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireOrg } from "@/lib/org";
import { can } from "@/lib/permissions";

async function requireEditor(orgSlug: string) {
  const ctx = await requireOrg(orgSlug);
  if (!can({ tier: ctx.tier, permission: ctx.permission }, "edit_tour_content")) {
    throw new Error("forbidden");
  }
  return ctx;
}

function normalize(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

export interface VenueHit {
  id: string;
  name: string;
  city: string | null;
  country: string | null;
  source: "org" | "catalog";
}

/** Căutare venue: biblioteca org + catalogul global, cu badge sursă. [C §6.5.1] */
export async function searchVenues(
  orgSlug: string,
  query: string,
): Promise<VenueHit[]> {
  const { supabase, org } = await requireOrg(orgSlug);
  if (query.trim().length < 2) return [];

  const { data } = await supabase
    .from("venues")
    .select("id, name, city, country, organization_id")
    .ilike("name", `%${query.trim()}%`)
    .is("deleted_at", null)
    .limit(15);

  return (data ?? [])
    .filter((v) => v.organization_id === null || v.organization_id === org.id)
    .map((v) => ({
      id: v.id,
      name: v.name,
      city: v.city,
      country: v.country,
      source: v.organization_id === org.id ? ("org" as const) : ("catalog" as const),
    }));
}

export interface CreateEventResult {
  error?: string;
  /** [C §6.5.1.5] "Multiple Records Found" — org-ul a mai folosit venue-ul. */
  duplicates?: VenueHit[];
}

export async function createEvent(
  orgSlug: string,
  tourId: string,
  date: string,
  input: {
    dayId: string;
    venueId?: string; // venue existent selectat
    newVenue?: { name: string; city: string; country: string }; // creare manuală
    /** true = userul a confirmat "creează duplicat nou" în dialog */
    ignoreDuplicates?: boolean;
  },
): Promise<CreateEventResult> {
  const { supabase, org } = await requireEditor(orgSlug);

  let venueId = input.venueId ?? null;
  let venueName: string | null = null;

  if (!venueId && input.newVenue) {
    const name = input.newVenue.name.trim();
    if (!name) return { error: "venue_name_required" };

    // Smart duplicate matching [C]: nume normalizat + oraș, în org
    if (!input.ignoreDuplicates) {
      const { data: candidates } = await supabase
        .from("venues")
        .select("id, name, city, country, organization_id")
        .eq("organization_id", org.id)
        .is("deleted_at", null);
      const dupes = (candidates ?? []).filter(
        (v) =>
          normalize(v.name) === normalize(name) &&
          normalize(v.city ?? "") === normalize(input.newVenue!.city ?? ""),
      );
      if (dupes.length > 0) {
        return {
          duplicates: dupes.map((v) => ({
            id: v.id,
            name: v.name,
            city: v.city,
            country: v.country,
            source: "org" as const,
          })),
        };
      }
    }

    const { data: venue, error } = await supabase
      .from("venues")
      .insert({
        organization_id: org.id,
        name,
        city: input.newVenue.city || null,
        country: input.newVenue.country || null,
        source: "manual",
      })
      .select("id, name")
      .single();
    if (error || !venue) return { error: error?.message ?? "venue_failed" };
    venueId = venue.id;
    venueName = venue.name;
  }

  if (venueId && !venueName) {
    const { data: v } = await supabase
      .from("venues")
      .select("name")
      .eq("id", venueId)
      .single();
    venueName = v?.name ?? null;
  }

  const { data: event, error } = await supabase
    .from("events")
    .insert({
      day_id: input.dayId,
      venue_id: venueId,
      title: venueName, // default = numele venue-ului [C]
    })
    .select("id")
    .single();
  if (error || !event) return { error: error?.message ?? "event_failed" };

  // [C §6.5.1.6] la atașare aterizezi pe Overview-ul event-ului
  redirect(`/o/${orgSlug}/t/${tourId}/d/${date}/e/${event.id}`);
}

export async function setEventFieldValue(
  orgSlug: string,
  eventId: string,
  fieldKey: string,
  value: string,
): Promise<{ error?: string }> {
  const { supabase, user } = await requireEditor(orgSlug);
  const { error } = await supabase.from("event_field_values").upsert(
    {
      event_id: eventId,
      field_key: fieldKey,
      value,
      updated_by: user.id,
    },
    { onConflict: "event_id,field_key" },
  );
  if (error) return { error: error.message };
  return {};
}

/** +ADDFIELD [C-S]: adaugă câmpul pe event (rând de valoare, gol). */
export async function addFieldToEvent(
  orgSlug: string,
  eventId: string,
  fieldKey: string,
): Promise<{ error?: string }> {
  return setEventFieldValue(orgSlug, eventId, fieldKey, "");
}

export async function removeFieldFromEvent(
  orgSlug: string,
  eventId: string,
  fieldKey: string,
): Promise<{ error?: string }> {
  const { supabase } = await requireEditor(orgSlug);
  const { error } = await supabase
    .from("event_field_values")
    .delete()
    .eq("event_id", eventId)
    .eq("field_key", fieldKey);
  if (error) return { error: error.message };
  return {};
}

/** Hide Data Fields per org [C] — 👁 pe rând. */
export async function toggleHiddenField(
  orgSlug: string,
  fieldKey: string,
  hidden: boolean,
): Promise<{ error?: string }> {
  const { supabase, org } = await requireEditor(orgSlug);
  const { error } = hidden
    ? await supabase
        .from("org_hidden_fields")
        .upsert(
          { organization_id: org.id, field_key: fieldKey },
          { onConflict: "organization_id,field_key" },
        )
    : await supabase
        .from("org_hidden_fields")
        .delete()
        .eq("organization_id", org.id)
        .eq("field_key", fieldKey);
  if (error) return { error: error.message };
  return {};
}

export async function updateLocalCrew(
  orgSlug: string,
  eventId: string,
  patch: Partial<
    Record<
      "local_union" | "minimum_in" | "minimum_out" | "penalties" | "crew_comments",
      string
    >
  >,
): Promise<{ error?: string }> {
  const { supabase } = await requireEditor(orgSlug);
  const { error } = await supabase
    .from("event_local_crew_details")
    .upsert({ event_id: eventId, ...patch }, { onConflict: "event_id" });
  if (error) return { error: error.message };
  return {};
}

export interface LaborCallRow {
  id?: string;
  call_time: string | null;
  day_offset: number;
  call_count: string;
  worker_type: string;
  add_count: string;
  cut_count: string;
  notes: string;
}

export async function upsertLaborCall(
  orgSlug: string,
  eventId: string,
  row: LaborCallRow,
): Promise<{ error?: string }> {
  const { supabase } = await requireEditor(orgSlug);
  const payload = {
    event_id: eventId,
    call_time: row.call_time || null,
    day_offset: row.day_offset,
    call_count: row.call_count || null,
    worker_type: row.worker_type || null,
    add_count: row.add_count || null,
    cut_count: row.cut_count || null,
    notes: row.notes || null,
  };
  const { error } = row.id
    ? await supabase.from("event_labor_calls").update(payload).eq("id", row.id)
    : await supabase.from("event_labor_calls").insert(payload);
  if (error) return { error: error.message };
  return {};
}

export async function deleteLaborCall(
  orgSlug: string,
  laborCallId: string,
): Promise<{ error?: string }> {
  const { supabase } = await requireEditor(orgSlug);
  const { error } = await supabase
    .from("event_labor_calls")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", laborCallId);
  if (error) return { error: error.message };
  return {};
}

export async function refreshEventPath(
  orgSlug: string,
  tourId: string,
  date: string,
  eventId: string,
): Promise<void> {
  revalidatePath(`/o/${orgSlug}/t/${tourId}/d/${date}/e/${eventId}`);
}
