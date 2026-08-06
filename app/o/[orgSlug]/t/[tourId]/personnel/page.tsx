import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireOrg } from "@/lib/org";
import { can } from "@/lib/permissions";
import { formatMoney } from "@/lib/showFinance";
import { PersonnelClient, type PersonRow } from "./personnel-client";

/**
 * Personnel — listă Graphite (README §9): rânduri h56 cu avatar,
 * identitate, capsulă de party, telefon mono și chevron. Toată editarea
 * (funcții, prețuri, poză, date) se face în PROFILUL persoanei —
 * preferința explicită a userului (2026-07-10).
 */
export default async function PersonnelPage({
  params,
}: {
  params: Promise<{ orgSlug: string; tourId: string }>;
}) {
  const { orgSlug, tourId } = await params;
  const { supabase, permission, tier } = await requireOrg(orgSlug);
  const canEdit = can({ tier, permission }, "edit_tour_content");
  const canSeeCosts = can({ tier, permission }, "view_accounting");

  const [{ data: tour }, { data: people }, { data: parties }] = await Promise.all([
    supabase.from("tours").select("id, name").eq("id", tourId).is("deleted_at", null).maybeSingle(),
    supabase
      .from("tour_personnel")
      .select(
        "id, first_name, last_name, role, company, party, party_id, phones, cost_per_show, cost_currency, payment_type",
      )
      .eq("tour_id", tourId)
      .is("deleted_at", null)
      .order("last_name"),
    supabase
      .from("tour_parties")
      .select("id, name, per_diem_rate, per_diem_currency")
      .eq("tour_id", tourId)
      .is("deleted_at", null)
      .order("sort_order")
      .order("created_at"),
  ]);
  if (!tour) notFound();

  const tourParties = parties ?? [];
  const partyNameById = new Map(tourParties.map((p) => [p.id, p.name]));

  async function addPerson(formData: FormData) {
    "use server";
    const ctx = await requireOrg(orgSlug);
    const first = String(formData.get("first") ?? "").trim();
    const last = String(formData.get("last") ?? "").trim();
    const role = String(formData.get("role") ?? "").trim();
    if (!first && !last) return;
    const { data: person } = await ctx.supabase
      .from("tour_personnel")
      .insert({
        tour_id: tourId,
        first_name: first || null,
        last_name: last || null,
        role: role || null,
      })
      .select("id")
      .single();
    revalidatePath(`/o/${orgSlug}/t/${tourId}/personnel`);
    // direct pe profil — acolo se setează prețul, datele, poza [cererea userului]
    if (person) redirect(`/o/${orgSlug}/t/${tourId}/personnel/${person.id}`);
  }

  type Person = {
    id: string;
    first_name: string | null;
    last_name: string | null;
    role: string | null;
    company: string | null;
    party: string | null;
    party_id: string | null;
    phones: { number?: string }[];
    cost_per_show: number | null;
    cost_currency: string;
    payment_type: string | null;
  };
  const rows = (people ?? []) as Person[];

  const listRows: PersonRow[] = rows.map((person) => ({
    id: person.id,
    name: [person.first_name, person.last_name].filter(Boolean).join(" ") || "—",
    initials:
      [person.first_name?.[0], person.last_name?.[0]].filter(Boolean).join("").toUpperCase() ||
      "?",
    sub: [person.role, person.company].filter(Boolean).join(" · ") || "—",
    // FK are prioritate; textul liber vechi rămâne vizibil doar pentru
    // rândurile nemigrate (party_id null dar party text existent).
    party: person.party_id ? (partyNameById.get(person.party_id) ?? null) : person.party,
    phone: person.phones?.[0]?.number ?? null,
    cost:
      canSeeCosts && person.cost_per_show != null
        ? formatMoney(Number(person.cost_per_show), person.cost_currency ?? "RON")
        : null,
  }));

  return (
    <PersonnelClient
      orgSlug={orgSlug}
      tourId={tourId}
      rows={listRows}
      parties={tourParties}
      canEdit={canEdit}
      addAction={addPerson}
    />
  );
}
