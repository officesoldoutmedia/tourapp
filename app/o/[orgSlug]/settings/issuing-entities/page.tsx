import { notFound } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { requireOrg } from "@/lib/org";
import { can } from "@/lib/permissions";
import { DeleteEntityForm } from "./delete-entity-form";

/**
 * Entități emitente (org-level) — firmele care emit contractele [C3].
 * Server-only, pattern identic cu file-categories/page.tsx: RLS pe
 * `issuing_entities` verifică deja `can_edit_tour_content`, gate-ul de
 * aici e doar UX. `is_default` e unic per org — setDefaultEntity resetează
 * flagul pe toate rândurile înainte să-l pună pe cel ales.
 */
export default async function IssuingEntitiesPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;
  const { supabase, org, permission, tier } = await requireOrg(orgSlug);
  const t = await getTranslations("issuingEntities");
  const tc = await getTranslations("common");
  if (!can({ tier, permission }, "edit_tour_content")) notFound();

  const { data: entities } = await supabase
    .from("issuing_entities")
    .select("id, name, cui, reg_com, address, iban, bank, representative, is_default")
    .eq("organization_id", org.id)
    .is("deleted_at", null)
    .order("is_default", { ascending: false })
    .order("name");

  const list = entities ?? [];

  async function saveEntity(formData: FormData) {
    "use server";
    const { supabase, org } = await requireOrg(orgSlug);
    const id = String(formData.get("id") ?? "");
    const name = String(formData.get("name") ?? "").trim();
    if (!name) return;
    const payload = {
      name,
      cui: String(formData.get("cui") ?? "").trim() || null,
      reg_com: String(formData.get("reg_com") ?? "").trim() || null,
      address: String(formData.get("address") ?? "").trim() || null,
      iban: String(formData.get("iban") ?? "").trim() || null,
      bank: String(formData.get("bank") ?? "").trim() || null,
      representative: String(formData.get("representative") ?? "").trim() || null,
    };
    if (id) {
      await supabase
        .from("issuing_entities")
        .update(payload)
        .eq("id", id)
        .eq("organization_id", org.id);
    } else {
      await supabase.from("issuing_entities").insert({ ...payload, organization_id: org.id });
    }
    revalidatePath(`/o/${orgSlug}/settings/issuing-entities`);
  }

  async function setDefaultEntity(formData: FormData) {
    "use server";
    const { supabase, org } = await requireOrg(orgSlug);
    const id = String(formData.get("id") ?? "");
    if (!id) return;
    await supabase
      .from("issuing_entities")
      .update({ is_default: false })
      .eq("organization_id", org.id);
    await supabase
      .from("issuing_entities")
      .update({ is_default: true })
      .eq("id", id)
      .eq("organization_id", org.id);
    revalidatePath(`/o/${orgSlug}/settings/issuing-entities`);
  }

  async function deleteEntity(formData: FormData) {
    "use server";
    const { supabase, org } = await requireOrg(orgSlug);
    await supabase
      .from("issuing_entities")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", String(formData.get("id")))
      .eq("organization_id", org.id);
    revalidatePath(`/o/${orgSlug}/settings/issuing-entities`);
  }

  const inputCls = "block w-full rounded border border-hairline px-2 py-1 text-sm";
  const labelCls = "min-w-32 flex-1 space-y-1 text-xs font-semibold uppercase tracking-wider text-secondary";

  const FIELDS: [string, string, boolean][] = [
    ["cui", t("cui"), true],
    ["reg_com", t("regCom"), false],
    ["address", t("address"), false],
    ["iban", t("iban"), true],
    ["bank", t("bank"), false],
    ["representative", t("representative"), false],
  ];

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
          {list.map((ent) => (
            <li key={ent.id} className="space-y-2 p-3">
              <form action={saveEntity} className="flex flex-wrap gap-2">
                <input type="hidden" name="id" value={ent.id} />
                <label className={labelCls}>
                  {t("nameLabel")}
                  <input name="name" defaultValue={ent.name} required className={inputCls} />
                </label>
                {FIELDS.map(([key, label, mono]) => (
                  <label key={key} className={labelCls}>
                    {label}
                    <input
                      name={key}
                      defaultValue={(ent as Record<string, string | null>)[key] ?? ""}
                      className={`${inputCls} ${mono ? "font-mono" : ""}`}
                    />
                  </label>
                ))}
                <div className="flex items-end">
                  <button className="btn-quiet h-7 shrink-0 px-2.5">{tc("save")}</button>
                </div>
              </form>

              <div className="flex items-center gap-2">
                <form action={setDefaultEntity}>
                  <input type="hidden" name="id" value={ent.id} />
                  <button
                    type="submit"
                    role="radio"
                    aria-checked={ent.is_default}
                    disabled={ent.is_default}
                    className={`shrink-0 rounded-full px-2.5 py-1 text-xs transition-colors ${
                      ent.is_default
                        ? "bg-accent-subtle font-medium text-accent-soft"
                        : "border border-hairline text-secondary hover:bg-fill-control"
                    }`}
                  >
                    {ent.is_default ? "● " : "○ "}
                    {t("default")}
                  </button>
                </form>

                <DeleteEntityForm
                  entityId={ent.id}
                  action={deleteEntity}
                  confirmText={`${t("delete")}?`}
                  label={t("delete")}
                />
              </div>
            </li>
          ))}
        </ul>
      )}

      <form
        action={saveEntity}
        className="flex flex-wrap gap-2 rounded-[12px] border border-hairline bg-surface p-3"
      >
        <label className={labelCls}>
          {t("nameLabel")}
          <input name="name" required className={inputCls} />
        </label>
        {FIELDS.map(([key, label, mono]) => (
          <label key={key} className={labelCls}>
            {label}
            <input name={key} className={`${inputCls} ${mono ? "font-mono" : ""}`} />
          </label>
        ))}
        <div className="flex items-end">
          <button className="btn-quiet h-7 shrink-0 px-2.5">+ {t("add")}</button>
        </div>
      </form>
    </main>
  );
}
