import "server-only";

/**
 * Google Places API (New) + Time Zone API — folosite EXCLUSIV server-side
 * (cheia nu ajunge niciodată în browser). Fără GOOGLE_MAPS_API_KEY totul
 * degradează elegant: funcțiile întorc liste goale / null.
 *
 * Blueprint §6.5.1 [C]: căutarea de venue cade pe Google Places când
 * biblioteca nu are rezultate; rezultatele Google primesc badge de sursă.
 */

export function isGoogleEnabled(): boolean {
  return Boolean(process.env.GOOGLE_MAPS_API_KEY);
}

export interface GooglePlaceResult {
  googlePlaceId: string;
  name: string;
  addressLine1: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  postalCode: string | null;
  lat: number | null;
  lng: number | null;
  phone: string | null;
  website: string | null;
}

interface AddressComponent {
  longText: string;
  shortText: string;
  types: string[];
}

function component(
  components: AddressComponent[] | undefined,
  type: string,
): string | null {
  return components?.find((c) => c.types.includes(type))?.longText ?? null;
}

/**
 * Text Search pe Places API (New). FieldMask minimal = SKU-ul cel mai
 * ieftin care ne dă tot ce stocăm pe venue/hotel.
 */
export async function searchGooglePlaces(
  query: string,
  opts: { includedType?: string; maxResults?: number } = {},
): Promise<GooglePlaceResult[]> {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey || query.trim().length < 2) return [];

  const response = await fetch(
    "https://places.googleapis.com/v1/places:searchText",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": [
          "places.id",
          "places.displayName",
          "places.formattedAddress",
          "places.addressComponents",
          "places.location",
          "places.internationalPhoneNumber",
          "places.websiteUri",
        ].join(","),
      },
      body: JSON.stringify({
        textQuery: query,
        pageSize: Math.min(opts.maxResults ?? 8, 20),
        ...(opts.includedType ? { includedType: opts.includedType } : {}),
      }),
      // căutare interactivă — nu cache-ui agresiv
      cache: "no-store",
    },
  );

  if (!response.ok) {
    console.error("[googlePlaces] searchText failed:", response.status);
    return [];
  }

  const data = (await response.json()) as {
    places?: {
      id: string;
      displayName?: { text?: string };
      addressComponents?: AddressComponent[];
      location?: { latitude?: number; longitude?: number };
      internationalPhoneNumber?: string;
      websiteUri?: string;
    }[];
  };

  return (data.places ?? []).map((place) => {
    const streetNumber = component(place.addressComponents, "street_number");
    const route = component(place.addressComponents, "route");
    return {
      googlePlaceId: place.id,
      name: place.displayName?.text ?? "",
      addressLine1: [route, streetNumber].filter(Boolean).join(" ") || null,
      city:
        component(place.addressComponents, "locality") ??
        component(place.addressComponents, "postal_town"),
      state: component(place.addressComponents, "administrative_area_level_1"),
      country: component(place.addressComponents, "country"),
      postalCode: component(place.addressComponents, "postal_code"),
      lat: place.location?.latitude ?? null,
      lng: place.location?.longitude ?? null,
      phone: place.internationalPhoneNumber ?? null,
      website: place.websiteUri ?? null,
    };
  });
}

/**
 * Time Zone API: IANA timezone din lat/lng — sursa de adevăr pentru
 * days.timezone când ziua are coordonate (blueprint §6.3.1 [C]).
 * Fallback-ul rămâne euristica din lib/tzLookup.ts.
 */
export async function lookupTimezoneByLatLng(
  lat: number,
  lng: number,
): Promise<string | null> {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) return null;

  const timestamp = Math.floor(Date.now() / 1000);
  const url = `https://maps.googleapis.com/maps/api/timezone/json?location=${lat},${lng}&timestamp=${timestamp}&key=${apiKey}`;
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) return null;

  const data = (await response.json()) as {
    status: string;
    timeZoneId?: string;
  };
  return data.status === "OK" ? (data.timeZoneId ?? null) : null;
}
