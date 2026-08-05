"use server";

import { revalidatePath } from "next/cache";
import { requireOrg } from "@/lib/org";
import { can } from "@/lib/permissions";
import {
  isGoogleEnabled,
  lookupTimezoneByLatLng,
  searchGooglePlaces,
} from "@/lib/googlePlaces";
import { DEFAULT_TZ } from "@/lib/tzLookup";

async function requireManage(orgSlug: string) {
  const ctx = await requireOrg(orgSlug);
  if (!can({ tier: ctx.tier, permission: ctx.permission }, "manage_tours")) {
    throw new Error("forbidden");
  }
  return ctx;
}

export async function saveArtistProfile(
  orgSlug: string,
  artistId: string,
  formData: FormData,
): Promise<{ error?: string }> {
  const { supabase } = await requireManage(orgSlug);

  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { error: "invalid" };
  const homeBaseCity = String(formData.get("home_base_city") ?? "").trim() || null;

  // Starea curentă a artistului: dacă orașul home base NU s-a schimbat
  // față de ce era deja salvat, păstrăm coordonatele deja geocodate în loc
  // să reinterogăm Google la fiecare save — un fail tranzitoriu (rețea,
  // rate-limit, fără match) nu trebuie să șteargă silent lat/lng bune doar
  // pentru că userul a schimbat, ex., culoarea.
  const { data: current } = await supabase
    .from("artists")
    .select("home_base_city, home_base_lat, home_base_lng, timezone")
    .eq("id", artistId)
    .maybeSingle();
  const cityUnchanged = homeBaseCity !== null && homeBaseCity === current?.home_base_city;

  // Geocodare home base: refolosim Text Search-ul deja folosit la pagini de zi.
  let lat: number | null = null;
  let lng: number | null = null;
  let timezone = String(formData.get("timezone") ?? "").trim() || null;
  if (cityUnchanged) {
    lat = current?.home_base_lat != null ? Number(current.home_base_lat) : null;
    lng = current?.home_base_lng != null ? Number(current.home_base_lng) : null;
    if (!timezone) timezone = current?.timezone ?? null;
  } else if (homeBaseCity && isGoogleEnabled()) {
    const [place] = await searchGooglePlaces(homeBaseCity);
    if (place?.lat != null && place?.lng != null) {
      lat = place.lat;
      lng = place.lng;
      if (!timezone) {
        timezone = (await lookupTimezoneByLatLng(place.lat, place.lng)) ?? null;
      }
    }
  }
  // suggestTimezone() ia o țară (nu un oraș) — fără cheie Google nu avem
  // de unde deduce fusul din textul liber al home base-ului, deci userul
  // îl alege manual din select-ul de timezone; păstrăm doar fallback-ul
  // neutru dacă selectul a ajuns totuși gol.
  if (homeBaseCity && !timezone) {
    timezone = DEFAULT_TZ;
  }

  const { error } = await supabase
    .from("artists")
    .update({
      name,
      legal_name: String(formData.get("legal_name") ?? "").trim() || null,
      home_base_city: homeBaseCity,
      home_base_lat: lat,
      home_base_lng: lng,
      default_currency: String(formData.get("default_currency") ?? "").trim() || null,
      timezone,
      color: String(formData.get("color") ?? "").trim() || null,
      links: {
        spotify: String(formData.get("link_spotify") ?? "").trim() || undefined,
        instagram: String(formData.get("link_instagram") ?? "").trim() || undefined,
        youtube: String(formData.get("link_youtube") ?? "").trim() || undefined,
        website: String(formData.get("link_website") ?? "").trim() || undefined,
      },
    })
    .eq("id", artistId);
  if (error) return { error: error.message };
  revalidatePath(`/o/${orgSlug}`, "layout");
  return {};
}

export async function setArtistPhoto(
  orgSlug: string,
  artistSlug: string,
  artistId: string,
  path: string,
): Promise<{ error?: string }> {
  const { supabase } = await requireManage(orgSlug);
  const { error } = await supabase
    .from("artists")
    .update({ photo_path: path })
    .eq("id", artistId);
  if (error) return { error: error.message };
  // Layout-wide: poza apare și în roster-ul org-ului (/o/[orgSlug]), nu
  // doar pe tabul de profil.
  revalidatePath(`/o/${orgSlug}/a/${artistSlug}/profile`);
  revalidatePath(`/o/${orgSlug}`, "layout");
  return {};
}

export async function setArtistArchived(
  orgSlug: string,
  artistId: string,
  archived: boolean,
): Promise<{ error?: string }> {
  const { supabase } = await requireManage(orgSlug);
  const { error } = await supabase
    .from("artists")
    .update({ is_archived: archived })
    .eq("id", artistId);
  if (error) return { error: error.message };
  revalidatePath(`/o/${orgSlug}`, "layout");
  return {};
}
