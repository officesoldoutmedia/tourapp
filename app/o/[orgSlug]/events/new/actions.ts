"use server";

import { redirect } from "next/navigation";
import { requireOrg } from "@/lib/org";
import { can } from "@/lib/permissions";
import { scheduleInterval } from "@/lib/datetime";
import { DEFAULT_TZ, suggestTimezone } from "@/lib/tzLookup";
import { SHOW_SLOT_TITLE } from "@/lib/showSlot";
import { resolveVenue, type VenueInput } from "../../t/[tourId]/d/[date]/e/venue-resolve";
import { applyScheduleTemplate } from "../../t/[tourId]/d/[date]/actions";
import { createAdvance } from "../../t/[tourId]/d/[date]/e/[eventId]/advance/actions";

export interface OneOffPayload {
  artistId: string;
  date: string; // YYYY-MM-DD
  city: string;
  country: string;
  eventName?: string;
  stageTime?: string; // HH:MM local
  scheduleTemplateId?: string | null;
  advanceTemplateId?: string | null;
  venue?: VenueInput | null;
}

export async function createOneOffEvent(
  orgSlug: string,
  payload: OneOffPayload,
): Promise<{ error?: string }> {
  const { supabase, org, permission, tier, user } = await requireOrg(orgSlug);
  if (!can({ tier, permission }, "manage_tours")) return { error: "forbidden" };
  if (!payload.artistId || !/^\d{4}-\d{2}-\d{2}$/.test(payload.date ?? "")) {
    return { error: "invalid" };
  }

  // Artistul aparține org-ului (regula din SP1 — FK-ul ocolește RLS).
  const { data: artist } = await supabase
    .from("artists")
    .select("id, name")
    .eq("id", payload.artistId)
    .eq("organization_id", org.id)
    .maybeSingle();
  if (!artist) return { error: "invalid" };

  // 1. Find-or-create bucket „{Artist} {an}" — race-safe prin indexul unic:
  //    insertul pierzător pică pe 23505 și reia select-ul.
  const year = Number(payload.date.slice(0, 4));
  const bucketQuery = () =>
    supabase
      .from("tours")
      .select("id, start_date, end_date")
      .eq("artist_id", artist.id)
      .eq("bucket_year", year)
      .is("deleted_at", null)
      .maybeSingle();

  let bucket: { id: string; start_date: string | null; end_date: string | null } | null = null;
  ({ data: bucket } = await bucketQuery());
  if (!bucket) {
    const ins = await supabase.from("tours").insert({
      organization_id: org.id,
      artist_id: artist.id,
      name: `${artist.name} ${year}`,
      bucket_year: year,
      start_date: payload.date,
      end_date: payload.date,
      created_by: user.id,
    });
    if (ins.error && ins.error.code !== "23505") return { error: ins.error.message };

    // Amendament (review Task 1): indexul unic parțial tours_artist_bucket_uq
    // NU filtrează deleted_at, deci un bucket soft-șters ar bloca insertul
    // (23505) fără să apară în select-ul inițial (care ÎL filtrează) —
    // dead-end „bucket_failed". Re-select fără filtrul deleted_at; dacă
    // bucket-ul găsit e soft-șters, îl restaurăm înainte de a continua.
    const { data: found } = await supabase
      .from("tours")
      .select("id, start_date, end_date, deleted_at")
      .eq("artist_id", artist.id)
      .eq("bucket_year", year)
      .maybeSingle();
    if (found?.deleted_at) {
      await supabase.from("tours").update({ deleted_at: null }).eq("id", found.id);
    }
    bucket = found;
  }
  if (!bucket) return { error: "bucket_failed" };

  // Extinde intervalul bucket-ului să acopere data nouă.
  const patch: Record<string, string> = {};
  if (!bucket.start_date || payload.date < bucket.start_date) patch.start_date = payload.date;
  if (!bucket.end_date || payload.date > bucket.end_date) patch.end_date = payload.date;
  if (Object.keys(patch).length > 0) {
    await supabase.from("tours").update(patch).eq("id", bucket.id);
  }

  // 2. Ziua: find-or-create; la coliziune template-ul NU se re-aplică
  //    dacă ziua are deja schedule items (spec §1).
  const timezone = suggestTimezone(payload.country) ?? DEFAULT_TZ;
  let { data: day } = await supabase
    .from("days")
    .select("id")
    .eq("tour_id", bucket.id)
    .eq("date", payload.date)
    .is("deleted_at", null)
    .maybeSingle();
  let dayHadSchedule = false;
  if (day) {
    const { count } = await supabase
      .from("schedule_items")
      .select("id", { count: "exact", head: true })
      .eq("day_id", day.id)
      .is("deleted_at", null);
    dayHadSchedule = (count ?? 0) > 0;
  } else {
    const created = await supabase
      .from("days")
      .insert({
        tour_id: bucket.id,
        date: payload.date,
        day_type: "show",
        city: payload.city.trim() || null,
        country: payload.country.trim() || null,
        timezone,
      })
      .select("id")
      .single();
    if (created.error || !created.data) {
      return { error: created.error?.message ?? "day_failed" };
    }
    day = created.data;
  }

  // 3. Venue (opțional) + event. Wizard-ul sare peste dialogul de duplicate
  //    (ignoreDuplicates: true) — org hits apar oricum primele în căutare.
  let venueId: string | null = null;
  let venueName: string | null = null;
  if (payload.venue) {
    const resolved = await resolveVenue(supabase, org.id, {
      ...payload.venue,
      ignoreDuplicates: true,
    });
    if (resolved.error) return { error: resolved.error };
    venueId = resolved.venueId;
    venueName = resolved.venueName;
  }
  const title = payload.eventName?.trim() || venueName || payload.city.trim() || null;
  const ev = await supabase
    .from("events")
    .insert({ day_id: day.id, venue_id: venueId, title })
    .select("id")
    .single();
  if (ev.error || !ev.data) return { error: ev.error?.message ?? "event_failed" };

  // 4. Template de program — doar dacă ziua nu avea deja schedule (spec §1).
  if (payload.scheduleTemplateId && !dayHadSchedule) {
    const res = await applyScheduleTemplate(
      orgSlug, bucket.id, payload.date, day.id, payload.scheduleTemplateId,
    );
    if (res.error) return { error: res.error };
  }

  // 5. Slotul Show la stage time (titlu canonic, confirmat).
  if (payload.stageTime) {
    const interval = scheduleInterval({
      date: payload.date,
      tz: timezone,
      start: payload.stageTime,
      end: null,
    });
    const { error } = await supabase.from("schedule_items").insert({
      day_id: day.id,
      title: SHOW_SLOT_TITLE,
      item_type: "schedule",
      start_at: interval.startAt.toISOString(),
      end_at: null,
      is_confirmed: true,
      updated_by: user.id,
    });
    if (error) return { error: error.message };
  }

  // 6. Advancing din template (mereu — advance-ul e al event-ului nou).
  if (payload.advanceTemplateId) {
    const res = await createAdvance(
      orgSlug, bucket.id, payload.date, ev.data.id, "Advance", payload.advanceTemplateId,
    );
    if (res.error) return { error: res.error };
  }

  redirect(`/o/${orgSlug}/t/${bucket.id}/d/${payload.date}`);
}
