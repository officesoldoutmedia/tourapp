import { notFound } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { requireOrg } from "@/lib/org";
import { can } from "@/lib/permissions";

/** Companies & Contacts — agenda de business a organizației [C §6.14]. */
export default async function ContactsPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;
  const { supabase, org, permission, tier } = await requireOrg(orgSlug);
  const t = await getTranslations("contacts");
  const tc = await getTranslations("common");
  const canEdit = can({ tier, permission }, "edit_tour_content");
  if (!canEdit && permission !== "mobile_access") notFound();

  const [{ data: companies }, { data: contacts }] = await Promise.all([
    supabase
      .from("companies")
      .select("id, name, kind, phone, email")
      .eq("organization_id", org.id)
      .is("deleted_at", null)
      .order("name"),
    supabase
      .from("contacts")
      .select("id, first_name, last_name, role, phone, email, company_id")
      .eq("organization_id", org.id)
      .is("deleted_at", null)
      .order("last_name"),
  ]);

  async function addCompany(formData: FormData) {
    "use server";
    const { supabase, org } = await requireOrg(orgSlug);
    const name = String(formData.get("name") ?? "").trim();
    if (!name) return;
    await supabase.from("companies").insert({
      organization_id: org.id,
      name,
      kind: String(formData.get("kind") ?? "").trim() || null,
      phone: String(formData.get("phone") ?? "").trim() || null,
      email: String(formData.get("email") ?? "").trim() || null,
    });
    revalidatePath(`/o/${orgSlug}/contacts`);
  }

  async function addContact(formData: FormData) {
    "use server";
    const { supabase, org } = await requireOrg(orgSlug);
    const lastName = String(formData.get("lastName") ?? "").trim();
    if (!lastName) return;
    await supabase.from("contacts").insert({
      organization_id: org.id,
      company_id: String(formData.get("companyId") ?? "") || null,
      first_name: String(formData.get("firstName") ?? "").trim() || null,
      last_name: lastName,
      role: String(formData.get("role") ?? "").trim() || null,
      phone: String(formData.get("phone") ?? "").trim() || null,
      email: String(formData.get("email") ?? "").trim() || null,
    });
    revalidatePath(`/o/${orgSlug}/contacts`);
  }

  async function remove(formData: FormData) {
    "use server";
    const { supabase } = await requireOrg(orgSlug);
    const table = String(formData.get("table")) === "companies" ? "companies" : "contacts";
    await supabase
      .from(table)
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", String(formData.get("id")));
    revalidatePath(`/o/${orgSlug}/contacts`);
  }

  const companyName = new Map((companies ?? []).map((c) => [c.id, c.name]));
  const inputCls = "rounded border border-hairline px-2 py-1 text-sm";

  return (
    <main className="mx-auto w-full max-w-3xl space-y-8 p-6">
      <h1 className="font-display text-xl font-semibold tracking-tight">{t("title")}</h1>

      <section className="space-y-3">
        <h2 className="font-display text-lg font-semibold tracking-tight">{t("companies")}</h2>
        {(companies ?? []).length === 0 ? (
          <p className="text-sm text-secondary">{t("emptyCompanies")}</p>
        ) : (
          <ul className="divide-y divide-hairline rounded-lg border border-hairline bg-surface shadow-xs">
            {(companies ?? []).map((company) => (
              <li key={company.id} className="flex items-center gap-2 px-4 py-2 text-sm">
                <span className="min-w-0 flex-1">
                  <b>{company.name}</b>
                  {company.kind && <span className="ml-2 text-xs text-secondary">{company.kind}</span>}
                </span>
                {company.phone && <a href={`tel:${company.phone}`} className="text-xs text-secondary hover:underline">{company.phone}</a>}
                {company.email && <a href={`mailto:${company.email}`} className="text-xs text-secondary hover:underline">{company.email}</a>}
                {canEdit && (
                  <form action={remove}>
                    <input type="hidden" name="table" value="companies" />
                    <input type="hidden" name="id" value={company.id} />
                    <button className="rounded px-2 py-0.5 text-xs text-danger hover:bg-danger-subtle">{tc("delete")}</button>
                  </form>
                )}
              </li>
            ))}
          </ul>
        )}
        {canEdit && (
          <form action={addCompany} className="flex flex-wrap gap-2">
            <input name="name" required placeholder={t("companies")} className={`${inputCls} min-w-36 flex-1`} />
            <input name="kind" placeholder={t("kind")} className={`${inputCls} w-32`} />
            <input name="phone" placeholder="Tel" className={`${inputCls} w-28`} />
            <input name="email" placeholder="Email" className={`${inputCls} w-40`} />
            <button className="rounded bg-accent hover:bg-accent-hover px-3 py-1.5 text-sm font-medium text-white">+ {t("addCompany")}</button>
          </form>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="font-display text-lg font-semibold tracking-tight">{t("contactsList")}</h2>
        {(contacts ?? []).length === 0 ? (
          <p className="text-sm text-secondary">{t("emptyContacts")}</p>
        ) : (
          <ul className="divide-y divide-hairline rounded-lg border border-hairline bg-surface shadow-xs">
            {(contacts ?? []).map((contact) => (
              <li key={contact.id} className="flex items-center gap-2 px-4 py-2 text-sm">
                <span className="min-w-0 flex-1">
                  <b>{contact.last_name}{contact.first_name && `, ${contact.first_name}`}</b>
                  {contact.role && <span className="ml-2 text-xs text-secondary">{contact.role}</span>}
                  {contact.company_id && (
                    <span className="ml-2 text-xs text-tertiary">
                      @ {companyName.get(contact.company_id) ?? t("none")}
                    </span>
                  )}
                </span>
                {contact.phone && <a href={`tel:${contact.phone}`} className="text-xs text-secondary hover:underline">{contact.phone}</a>}
                {contact.email && <a href={`mailto:${contact.email}`} className="text-xs text-secondary hover:underline">{contact.email}</a>}
                {canEdit && (
                  <form action={remove}>
                    <input type="hidden" name="table" value="contacts" />
                    <input type="hidden" name="id" value={contact.id} />
                    <button className="rounded px-2 py-0.5 text-xs text-danger hover:bg-danger-subtle">{tc("delete")}</button>
                  </form>
                )}
              </li>
            ))}
          </ul>
        )}
        {canEdit && (
          <form action={addContact} className="flex flex-wrap gap-2">
            <input name="lastName" required placeholder={t("contactsList")} className={`${inputCls} w-32`} />
            <input name="firstName" placeholder="Prenume / First" className={`${inputCls} w-32`} />
            <input name="role" placeholder={t("role")} className={`${inputCls} w-28`} />
            <select name="companyId" className={inputCls}>
              <option value="">{t("company")}: {t("none")}</option>
              {(companies ?? []).map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            <input name="phone" placeholder="Tel" className={`${inputCls} w-28`} />
            <input name="email" placeholder="Email" className={`${inputCls} w-40`} />
            <button className="rounded bg-accent hover:bg-accent-hover px-3 py-1.5 text-sm font-medium text-white">+ {t("addContact")}</button>
          </form>
        )}
      </section>
    </main>
  );
}
