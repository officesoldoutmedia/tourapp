import { notFound } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { requireOrg } from "@/lib/org";
import { can } from "@/lib/permissions";

/** Tour Passes [C-S ecran 61] — la nivel de TUR; coloane în guest list. */
export default async function TourPassesPage({
  params,
}: {
  params: Promise<{ orgSlug: string; tourId: string }>;
}) {
  const { orgSlug, tourId } = await params;
  const { supabase, permission, tier } = await requireOrg(orgSlug);
  const t = await getTranslations("passes");
  const tc = await getTranslations("common");
  if (!can({ tier, permission }, "edit_tour_content")) notFound();

  const { data: passes } = await supabase
    .from("tour_passes")
    .select("id, name, description")
    .eq("tour_id", tourId)
    .is("deleted_at", null)
    .order("sort_order")
    .order("created_at");

  async function addPass(formData: FormData) {
    "use server";
    const { supabase } = await requireOrg(orgSlug);
    const name = String(formData.get("name") ?? "").trim();
    if (!name) return;
    await supabase.from("tour_passes").insert({
      tour_id: tourId,
      name,
      description: String(formData.get("description") ?? "").trim() || null,
      sort_order: 100,
    });
    revalidatePath(`/o/${orgSlug}/t/${tourId}/passes`);
  }

  async function removePass(formData: FormData) {
    "use server";
    const { supabase } = await requireOrg(orgSlug);
    await supabase
      .from("tour_passes")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", String(formData.get("id")));
    revalidatePath(`/o/${orgSlug}/t/${tourId}/passes`);
  }

  return (
    <main className="mx-auto w-full max-w-2xl space-y-6 p-6">
      <h1 className="text-xl font-semibold">{t("title")}</h1>

      {(passes ?? []).length === 0 ? (
        <p className="text-sm text-neutral-500">{t("empty")}</p>
      ) : (
        <ul className="divide-y divide-neutral-100 rounded-lg border border-neutral-200">
          {(passes ?? []).map((pass) => (
            <li key={pass.id} className="flex items-center justify-between px-4 py-2">
              <span>
                <b>{pass.name}</b>
                {pass.description && (
                  <span className="ml-2 text-sm text-neutral-500">{pass.description}</span>
                )}
              </span>
              <form action={removePass}>
                <input type="hidden" name="id" value={pass.id} />
                <button className="rounded px-2 py-1 text-xs text-red-600 hover:bg-red-50">
                  {tc("delete")}
                </button>
              </form>
            </li>
          ))}
        </ul>
      )}

      <form action={addPass} className="flex flex-wrap gap-2">
        <input name="name" required placeholder={t("name")} className="w-40 rounded border border-neutral-300 px-3 py-2 text-sm" />
        <input name="description" placeholder={t("description")} className="min-w-48 flex-1 rounded border border-neutral-300 px-3 py-2 text-sm" />
        <button className="rounded bg-neutral-900 px-4 py-2 text-sm font-medium text-white">
          + {t("add")}
        </button>
      </form>
    </main>
  );
}
