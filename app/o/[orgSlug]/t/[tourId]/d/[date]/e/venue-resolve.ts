import type { GooglePlaceResult } from "@/lib/googlePlaces";
import type { requireOrg } from "@/lib/org";

type Supabase = Awaited<ReturnType<typeof requireOrg>>["supabase"];

export interface VenueHit {
  id: string;
  name: string;
  city: string | null;
  country: string | null;
  source: "org" | "catalog" | "google";
  /** doar pt source='google' — payload-ul complet pt creare la selectare */
  google?: GooglePlaceResult;
}

export function normalize(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

export async function findDuplicates(
  supabase: Supabase,
  orgId: string,
  name: string,
  city: string,
): Promise<VenueHit[]> {
  const { data: candidates } = await supabase
    .from("venues")
    .select("id, name, city, country")
    .eq("organization_id", orgId)
    .is("deleted_at", null);
  return (candidates ?? [])
    .filter(
      (v) =>
        normalize(v.name) === normalize(name) &&
        normalize(v.city ?? "") === normalize(city),
    )
    .map((v) => ({
      id: v.id,
      name: v.name,
      city: v.city,
      country: v.country,
      source: "org" as const,
    }));
}

export interface VenueInput {
  venueId?: string;
  newVenue?: { name: string; city: string; country: string };
  googleVenue?: GooglePlaceResult;
  ignoreDuplicates?: boolean;
}

export interface ResolveVenueResult {
  venueId: string | null;
  venueName: string | null;
  error?: string;
  duplicates?: VenueHit[];
}

export async function resolveVenue(
  supabase: Supabase,
  orgId: string,
  input: VenueInput,
): Promise<ResolveVenueResult> {
  let venueId = input.venueId ?? null;
  let venueName: string | null = null;

  if (!venueId && input.googleVenue) {
    const g = input.googleVenue;
    // duplicate matching [C] se aplică și selecțiilor din Google
    if (!input.ignoreDuplicates) {
      const dupes = await findDuplicates(supabase, orgId, g.name, g.city ?? "");
      if (dupes.length > 0) return { venueId: null, venueName: null, duplicates: dupes };
    }
    const { data: venue, error } = await supabase
      .from("venues")
      .insert({
        organization_id: orgId,
        name: g.name,
        address_line1: g.addressLine1,
        city: g.city,
        state: g.state,
        country: g.country,
        postal_code: g.postalCode,
        lat: g.lat,
        lng: g.lng,
        phones: g.phone ? [{ number: g.phone, label: "Main Number" }] : [],
        urls: g.website ? [g.website] : [],
        source: "google",
        google_place_id: g.googlePlaceId,
      })
      .select("id, name")
      .single();
    if (error || !venue) {
      return { venueId: null, venueName: null, error: error?.message ?? "venue_failed" };
    }
    venueId = venue.id;
    venueName = venue.name;
  }

  if (!venueId && input.newVenue) {
    const name = input.newVenue.name.trim();
    if (!name) return { venueId: null, venueName: null, error: "venue_name_required" };

    // Smart duplicate matching [C]: nume normalizat + oraș, în org
    if (!input.ignoreDuplicates) {
      const dupes = await findDuplicates(
        supabase, orgId, name, input.newVenue.city ?? "",
      );
      if (dupes.length > 0) return { venueId: null, venueName: null, duplicates: dupes };
    }

    const { data: venue, error } = await supabase
      .from("venues")
      .insert({
        organization_id: orgId,
        name,
        city: input.newVenue.city || null,
        country: input.newVenue.country || null,
        source: "manual",
      })
      .select("id, name")
      .single();
    if (error || !venue) {
      return { venueId: null, venueName: null, error: error?.message ?? "venue_failed" };
    }
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

  return { venueId, venueName };
}
