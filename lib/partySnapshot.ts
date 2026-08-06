/** Snapshot-ul travel parties la crearea turului (SP3a, spec §2).
 *  Best-effort: un eșec aici nu blochează crearea turului. */

type SupabaseLike = {
  from: (table: string) => any;
};

export async function copyArtistPartiesToTour(
  supabase: SupabaseLike,
  orgId: string,
  artistId: string,
  tourId: string,
  userId: string,
): Promise<void> {
  const { data: template, error } = await supabase
    .from("artist_parties")
    .select("name, per_diem_rate, per_diem_currency, sort_order")
    .eq("artist_id", artistId)
    .is("deleted_at", null)
    .order("sort_order")
    .order("created_at");
  if (error || !template || template.length === 0) return;
  const { error: insertError } = await supabase.from("tour_parties").insert(
    template.map((p: {
      name: string;
      per_diem_rate: number | null;
      per_diem_currency: string | null;
      sort_order: number;
    }) => ({
      organization_id: orgId,
      tour_id: tourId,
      name: p.name,
      per_diem_rate: p.per_diem_rate,
      per_diem_currency: p.per_diem_currency,
      sort_order: p.sort_order,
      created_by: userId,
    })),
  );
  if (insertError) console.error("copyArtistPartiesToTour:", insertError.message);
}
