import { notFound } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { requireOrg } from "@/lib/org";
import { can } from "@/lib/permissions";
import { PassPhoto } from "./pass-photo-client";

/** Tour Passes [C-S ecran 61] — tipuri de pass cu poza laminate-ului. */
export default async function TourPassesPage({
  params,
}: {
  params: Promise<{ orgSlug: string; tourId: string }>;
}) {
  const { orgSlug, tourId } = await params;
  const { supabase, org, permission, tier } = await requireOrg(orgSlug);
  const t = await getTranslations("passes");
  const tc = await getTranslations("common");
  if (!can({ tier, permission }, "edit_tour_content")) notFound();

  const { data: passes } = await supabase
    .from("tour_passes")
    .select("id, name, description, image_path")
    .eq("tour_id", tourId)
    .is("deleted_at", null)
    .order("sort_order")
    .order("created_at");

  // signed URLs pentru pozele existente (bucket privat)
  const paths = (passes ?? []).flatMap((p) => (p.image_path ? [p.image_path] : []));
  const urlByPath = new Map<string, string>();
  if (paths.length) {
    const { data: signed } = await supabase.storage
      .from("attachments")
      .createSignedUrls(paths, 3600);
    for (const s of signed ?? []) {
      if (s.signedUrl && s.path) urlByPath.set(s.path, s.signedUrl);
    }
  }

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
      <div>
        <h1 className="page-title">{t("title")}</h1>
        <p className="mt-1 text-[12px] text-tertiary">{t("photoHint")}</p>
      </div>

      {(passes ?? []).length === 0 ? (
        <p className="rounded-[12px] border border-hairline bg-surface px-4 py-8 text-center text-[12px] text-tertiary">
          {t("empty")}
        </p>
      ) : (
        <ul className="divide-y divide-hairline rounded-[12px] border border-hairline bg-surface">
          {(passes ?? []).map((pass) => (
            <li key={pass.id} className="flex items-center gap-4 px-4 py-3">
              <PassPhoto
                orgSlug={orgSlug}
                orgId={org.id}
                tourId={tourId}
                passId={pass.id}
                imageUrl={pass.image_path ? (urlByPath.get(pass.image_path) ?? null) : null}
                canEdit
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-medium text-primary">
                  {pass.name}
                </span>
                {pass.description && (
                  <span className="block truncate text-[11.5px] text-secondary">
                    {pass.description}
                  </span>
                )}
              </span>
              <form action={removePass}>
                <input type="hidden" name="id" value={pass.id} />
                <button className="btn-danger">{tc("delete")}</button>
              </form>
            </li>
          ))}
        </ul>
      )}

      <form action={addPass} className="flex flex-wrap gap-2">
        <input
          name="name"
          required
          placeholder={t("name")}
          className="h-9 w-40 rounded-[8px] border border-hairline bg-fill-control px-3 text-sm"
        />
        <input
          name="description"
          placeholder={t("description")}
          className="h-9 min-w-48 flex-1 rounded-[8px] border border-hairline bg-fill-control px-3 text-sm"
        />
        <button className="btn-primary h-9">+ {t("add")}</button>
      </form>
    </main>
  );
}
