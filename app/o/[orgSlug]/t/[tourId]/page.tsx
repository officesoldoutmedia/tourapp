import { notFound, redirect } from "next/navigation";
import { requireOrg } from "@/lib/org";

/** Landing-ul turului: redirect la prima zi (sau azi, dacă e în interval). */
export default async function TourIndexPage({
  params,
}: {
  params: Promise<{ orgSlug: string; tourId: string }>;
}) {
  const { orgSlug, tourId } = await params;
  const { supabase } = await requireOrg(orgSlug);

  const { data: days } = await supabase
    .from("days")
    .select("date")
    .eq("tour_id", tourId)
    .is("deleted_at", null)
    .order("date");

  if (!days || days.length === 0) notFound();

  const today = new Date().toISOString().slice(0, 10);
  const target = days.find((d) => d.date >= today) ?? days[days.length - 1];
  redirect(`/o/${orgSlug}/t/${tourId}/d/${target.date}`);
}
