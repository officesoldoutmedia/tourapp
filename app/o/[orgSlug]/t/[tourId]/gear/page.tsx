import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { requireOrg } from "@/lib/org";
import { can } from "@/lib/permissions";
import { GearList, type GearItem, type GearShow } from "./gear-client";

/** Gear — inventarul turului, cu asignare per show. */
export default async function TourGearPage({
  params,
}: {
  params: Promise<{ orgSlug: string; tourId: string }>;
}) {
  const { orgSlug, tourId } = await params;
  const { supabase, permission, tier } = await requireOrg(orgSlug);
  const t = await getTranslations("gear");
  const canEdit = can({ tier, permission }, "edit_tour_content");

  const [{ data: tour }, { data: gear }, { data: showDays }] = await Promise.all([
    supabase.from("tours").select("id, name").eq("id", tourId).is("deleted_at", null).maybeSingle(),
    supabase
      .from("tour_gear")
      .select("id, name, details, notes, gear_show_assignments(event_id)")
      .eq("tour_id", tourId)
      .is("deleted_at", null)
      .order("created_at"),
    supabase
      .from("days")
      .select("id, date, city, events(id, title, deleted_at)")
      .eq("tour_id", tourId)
      .eq("day_type", "show")
      .is("deleted_at", null)
      .order("date"),
  ]);
  if (!tour) notFound();

  const shows: GearShow[] = (showDays ?? []).flatMap((day) => {
    const events = (day.events ?? []) as { id: string; title: string; deleted_at: string | null }[];
    return events
      .filter((e) => !e.deleted_at)
      .map((e) => ({ eventId: e.id, date: day.date, city: day.city, title: e.title }));
  });

  const items: GearItem[] = (gear ?? []).map((g) => {
    const details = (g.details ?? {}) as { category?: string; quantity?: number; provider?: string };
    const assignments = (g.gear_show_assignments ?? []) as { event_id: string }[];
    return {
      id: g.id,
      name: g.name,
      notes: g.notes,
      category: ["backline", "lights", "video", "other"].includes(details.category ?? "")
        ? (details.category as string)
        : "other",
      quantity: details.quantity && details.quantity > 0 ? details.quantity : 1,
      provider: ["own", "venue", "rented"].includes(details.provider ?? "")
        ? (details.provider as string)
        : "own",
      showIds: assignments.map((a) => a.event_id),
    };
  });

  return (
    <main className="mx-auto w-full max-w-3xl space-y-5 p-6">
      <div>
        <p className="eyebrow">{tour.name}</p>
        <h1 className="page-title mt-1">{t("title")}</h1>
        <p className="mt-1 text-[12px] text-tertiary">{t("hint")}</p>
      </div>
      <GearList orgSlug={orgSlug} tourId={tourId} items={items} shows={shows} canEdit={canEdit} />
    </main>
  );
}
