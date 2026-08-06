import { notFound } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { requireOrg } from "@/lib/org";
import { can } from "@/lib/permissions";
import { DeleteCategoryForm } from "./delete-category-form";

/**
 * Categorii de fișiere (org-level, ca groups/songs) — folosite la
 * calcularea procentului de advancing per show [SP3b]. Gate identic cu
 * songs/page.tsx: RLS pe `file_categories` verifică deja
 * `can_edit_tour_content`, gate-ul de aici e doar UX (evită un formular
 * pe care requestul l-ar respinge oricum).
 */
export default async function FileCategoriesPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;
  const { supabase, org, permission, tier } = await requireOrg(orgSlug);
  const t = await getTranslations("fileCategories");
  const tc = await getTranslations("common");
  if (!can({ tier, permission }, "edit_tour_content")) notFound();

  const { data: categories } = await supabase
    .from("file_categories")
    .select("id, name, is_required, sort_order")
    .eq("organization_id", org.id)
    .is("deleted_at", null)
    .order("sort_order")
    .order("created_at");

  const list = categories ?? [];

  async function saveCategory(formData: FormData) {
    "use server";
    const { supabase, org } = await requireOrg(orgSlug);
    const id = String(formData.get("id") ?? "");
    const name = String(formData.get("name") ?? "").trim();
    if (!name) return;
    if (id) {
      await supabase.from("file_categories").update({ name }).eq("id", id);
    } else {
      // sort_order la insert = numărul de rânduri nesterse, ca noua
      // categorie să aterizeze la finalul listei fără să reordoneze restul
      // (pattern identic cu saveArtistParty, SP3a).
      const { count } = await supabase
        .from("file_categories")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", org.id)
        .is("deleted_at", null);
      await supabase.from("file_categories").insert({
        organization_id: org.id,
        name,
        sort_order: count ?? 0,
      });
    }
    revalidatePath(`/o/${orgSlug}/settings/file-categories`);
  }

  async function toggleRequired(formData: FormData) {
    "use server";
    const { supabase } = await requireOrg(orgSlug);
    const id = String(formData.get("id") ?? "");
    const { data: row } = await supabase
      .from("file_categories")
      .select("is_required")
      .eq("id", id)
      .maybeSingle();
    if (!row) return;
    await supabase
      .from("file_categories")
      .update({ is_required: !row.is_required })
      .eq("id", id);
    revalidatePath(`/o/${orgSlug}/settings/file-categories`);
  }

  async function moveCategory(formData: FormData) {
    "use server";
    const { supabase, org } = await requireOrg(orgSlug);
    const id = String(formData.get("id") ?? "");
    const direction = String(formData.get("direction") ?? "");
    const { data: siblings } = await supabase
      .from("file_categories")
      .select("id, sort_order")
      .eq("organization_id", org.id)
      .is("deleted_at", null)
      .order("sort_order")
      .order("created_at");
    const rows = siblings ?? [];
    const idx = rows.findIndex((c) => c.id === id);
    const swap = direction === "up" ? idx - 1 : idx + 1;
    if (idx < 0 || swap < 0 || swap >= rows.length) return;
    await supabase.from("file_categories").update({ sort_order: swap }).eq("id", rows[idx].id);
    await supabase.from("file_categories").update({ sort_order: idx }).eq("id", rows[swap].id);
    revalidatePath(`/o/${orgSlug}/settings/file-categories`);
  }

  async function deleteCategory(formData: FormData) {
    "use server";
    const { supabase } = await requireOrg(orgSlug);
    await supabase
      .from("file_categories")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", String(formData.get("id")));
    revalidatePath(`/o/${orgSlug}/settings/file-categories`);
  }

  const inputCls = "rounded border border-hairline px-2 py-1 text-sm";

  return (
    <main className="mx-auto w-full max-w-2xl space-y-6 p-6">
      <div>
        <h1 className="font-display text-xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="mt-1 text-xs text-tertiary">{t("hint")}</p>
      </div>

      {list.length === 0 ? (
        <p className="text-sm text-secondary">{t("empty")}</p>
      ) : (
        <ul className="divide-y divide-hairline rounded-[12px] border border-hairline bg-surface">
          {list.map((cat, i) => (
            <li key={cat.id} className="flex flex-wrap items-center gap-2 px-3 py-2">
              <form action={saveCategory} className="flex min-w-40 flex-1 items-center gap-2">
                <input type="hidden" name="id" value={cat.id} />
                <input
                  name="name"
                  defaultValue={cat.name}
                  aria-label={t("nameLabel")}
                  className={`${inputCls} min-w-40 flex-1`}
                />
                <button className="btn-quiet h-7 shrink-0 px-2.5">{tc("save")}</button>
              </form>

              <form action={toggleRequired}>
                <input type="hidden" name="id" value={cat.id} />
                <button
                  type="submit"
                  role="checkbox"
                  aria-checked={cat.is_required}
                  title={t("hint")}
                  className={`shrink-0 rounded-full px-2.5 py-1 text-xs transition-colors ${
                    cat.is_required
                      ? "bg-accent-subtle font-medium text-accent-soft"
                      : "border border-hairline text-secondary hover:bg-fill-control"
                  }`}
                >
                  {cat.is_required ? "✓ " : ""}
                  {t("required")}
                </button>
              </form>

              <span className="flex shrink-0 items-center gap-0.5">
                <form action={moveCategory}>
                  <input type="hidden" name="id" value={cat.id} />
                  <input type="hidden" name="direction" value="up" />
                  <button
                    disabled={i === 0}
                    aria-label="Move up"
                    className="flex h-7 w-7 items-center justify-center rounded text-secondary hover:bg-fill-control disabled:opacity-30"
                  >
                    ↑
                  </button>
                </form>
                <form action={moveCategory}>
                  <input type="hidden" name="id" value={cat.id} />
                  <input type="hidden" name="direction" value="down" />
                  <button
                    disabled={i === list.length - 1}
                    aria-label="Move down"
                    className="flex h-7 w-7 items-center justify-center rounded text-secondary hover:bg-fill-control disabled:opacity-30"
                  >
                    ↓
                  </button>
                </form>
              </span>

              <DeleteCategoryForm
                categoryId={cat.id}
                action={deleteCategory}
                confirmText={`${t("delete")}?`}
                label={t("delete")}
              />
            </li>
          ))}
        </ul>
      )}

      <form
        action={saveCategory}
        className="flex flex-wrap gap-2 rounded-[12px] border border-hairline bg-surface p-3"
      >
        <input name="name" required placeholder={t("nameLabel")} className={`${inputCls} min-w-40 flex-1`} />
        <button className="btn-quiet h-7 px-2.5">+ {t("add")}</button>
      </form>
    </main>
  );
}
