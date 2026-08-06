import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { requireOrg } from "@/lib/org";
import { can } from "@/lib/permissions";
import { allTimezones, DEFAULT_TZ } from "@/lib/tzLookup";
import { ARTIST_COLORS } from "@/app/o/[orgSlug]/artists/new/colors";
import { ArtistPhoto } from "./photo-client";
import { ProfileForm } from "./form";
import { ArtistParties } from "./parties-client";

const CURRENCIES = ["EUR", "RON", "USD", "GBP"];

/** Tabul Profil al artistului: identitate, poză, home base, valută, fus
 * orar, culoare de calendar, linkuri, arhivare. Doar manage_tours. */
export default async function ArtistProfilePage({
  params,
}: {
  params: Promise<{ orgSlug: string; artistSlug: string }>;
}) {
  const { orgSlug, artistSlug } = await params;
  const { supabase, org, permission, tier } = await requireOrg(orgSlug);
  if (!can({ tier, permission }, "manage_tours")) {
    redirect(`/o/${orgSlug}/a/${artistSlug}`);
  }
  const t = await getTranslations("artist");

  const { data: artist } = await supabase
    .from("artists")
    .select(
      "id, name, slug, legal_name, home_base_city, default_currency, timezone, color, links, photo_path, is_archived, ground_rate_per_km, ground_rate_currency",
    )
    .eq("organization_id", org.id)
    .eq("slug", artistSlug)
    .is("deleted_at", null)
    .maybeSingle();
  if (!artist) notFound();

  const { data: parties } = await supabase
    .from("artist_parties")
    .select("id, name, per_diem_rate, per_diem_currency")
    .eq("artist_id", artist.id)
    .is("deleted_at", null)
    .order("sort_order");

  const photoUrl = artist.photo_path
    ? ((await supabase.storage.from("attachments").createSignedUrl(artist.photo_path, 3600))
        .data?.signedUrl ?? null)
    : null;

  const links = (artist.links ?? {}) as Record<string, string>;

  return (
    <div className="space-y-6">
      <h2 className="font-display text-lg font-semibold tracking-tight">
        {t("profileTitle")}
      </h2>

      <div className="flex items-center gap-4">
        <ArtistPhoto
          orgSlug={orgSlug}
          orgId={org.id}
          artistSlug={artistSlug}
          artistId={artist.id}
          photoUrl={photoUrl}
        />
        <p className="text-[11.5px] text-tertiary">{t("photoLabel")}</p>
      </div>

      <ProfileForm
        orgSlug={orgSlug}
        artistId={artist.id}
        colors={ARTIST_COLORS}
        timezones={allTimezones()}
        currencies={CURRENCIES}
        isArchived={artist.is_archived}
        initial={{
          name: artist.name,
          legalName: artist.legal_name ?? "",
          homeBaseCity: artist.home_base_city ?? "",
          currency: artist.default_currency ?? "",
          timezone: artist.timezone ?? DEFAULT_TZ,
          color: artist.color ?? ARTIST_COLORS[0],
          links: {
            spotify: links.spotify ?? "",
            instagram: links.instagram ?? "",
            youtube: links.youtube ?? "",
            website: links.website ?? "",
          },
          groundRatePerKm: artist.ground_rate_per_km != null ? String(artist.ground_rate_per_km) : "",
          groundRateCurrency: artist.ground_rate_currency ?? "",
        }}
      />

      <div className="space-y-2">
        <h3 className="font-display text-[13.5px] font-semibold tracking-tight text-primary">
          {t("partiesTitle")}
        </h3>
        <p className="text-[11.5px] text-tertiary">{t("partiesHint")}</p>
        <ArtistParties
          orgSlug={orgSlug}
          artistSlug={artistSlug}
          artistId={artist.id}
          currencies={CURRENCIES}
          parties={parties ?? []}
        />
      </div>
    </div>
  );
}
