import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { requireOrg } from "@/lib/org";
import { can } from "@/lib/permissions";
import { DealTemplates, type DealTemplateData, type FileCategoryData } from "./deals-client";

const CURRENCIES = ["EUR", "RON", "USD", "GBP"];

/** Tabul Deals al artistului: deal templates (fee, basis, withholding,
 * landed items, cazare, categorii obligatorii) — aplicate ca snapshot pe
 * show-uri (Task 4). Doar manage_tours. */
export default async function ArtistDealsPage({
  params,
}: {
  params: Promise<{ orgSlug: string; artistSlug: string }>;
}) {
  const { orgSlug, artistSlug } = await params;
  const { supabase, org, permission, tier } = await requireOrg(orgSlug);
  if (!can({ tier, permission }, "manage_tours")) {
    redirect(`/o/${orgSlug}/a/${artistSlug}`);
  }
  const t = await getTranslations("deals");

  const { data: artist } = await supabase
    .from("artists")
    .select("id")
    .eq("organization_id", org.id)
    .eq("slug", artistSlug)
    .is("deleted_at", null)
    .maybeSingle();
  if (!artist) notFound();
  const artistId = artist.id;

  const [{ data: templates }, { data: categories }, { data: scheduleTemplates }] =
    await Promise.all([
      supabase
        .from("deal_templates")
        .select(
          "id, name, fee_amount, fee_currency, deal_basis, withholding_percent, landed_items, accommodation, required_category_ids, schedule_template_id",
        )
        .eq("artist_id", artistId)
        .is("deleted_at", null)
        .order("sort_order")
        .order("created_at"),
      supabase
        .from("file_categories")
        .select("id, name")
        .eq("organization_id", org.id)
        .is("deleted_at", null)
        .order("sort_order")
        .order("created_at"),
      supabase
        .from("schedule_templates")
        .select("id, name")
        .eq("organization_id", org.id)
        .is("deleted_at", null)
        .order("name"),
    ]);

  return (
    <div className="space-y-3">
      <div>
        <h2 className="font-display text-lg font-semibold tracking-tight">{t("title")}</h2>
        <p className="text-[11.5px] text-tertiary">{t("hint")}</p>
      </div>
      <DealTemplates
        orgSlug={orgSlug}
        artistSlug={artistSlug}
        artistId={artistId}
        currencies={CURRENCIES}
        templates={(templates ?? []) as DealTemplateData[]}
        categories={(categories ?? []) as FileCategoryData[]}
        scheduleTemplates={scheduleTemplates ?? []}
      />
    </div>
  );
}
