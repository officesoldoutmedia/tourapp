import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { requireUser } from "@/lib/auth";
import { createOrganization } from "./actions";

export default async function AppPage() {
  const { supabase } = await requireUser();
  const t = await getTranslations("orgs");
  const tp = await getTranslations("permissions");

  const { data: memberships } = await supabase
    .from("organization_members")
    .select("permission, organizations(id, name, slug, org_type)")
    .order("created_at", { ascending: true });

  const orgs = (memberships ?? []).flatMap((m) => {
    const org = m.organizations as unknown as {
      id: string;
      name: string;
      slug: string;
      org_type: string | null;
    } | null;
    return org ? [{ ...org, permission: m.permission }] : [];
  });

  return (
    <main className="mx-auto w-full max-w-2xl space-y-10 p-6">
      <section className="space-y-4">
        <h1 className="font-display text-2xl font-semibold tracking-tight">{t("yourOrganizations")}</h1>
        {orgs.length === 0 ? (
          <p className="text-sm text-secondary">{t("empty")}</p>
        ) : (
          <ul className="divide-y divide-hairline rounded-lg border border-hairline bg-surface shadow-xs">
            {orgs.map((org) => (
              <li key={org.id}>
                <Link
                  href={`/o/${org.slug}`}
                  className="flex items-center justify-between px-4 py-3 hover:bg-subtle"
                >
                  <span className="font-medium">{org.name}</span>
                  <span className="text-xs text-secondary">
                    {tp(org.permission)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-4">
        <h2 className="font-display text-lg font-semibold tracking-tight">
          {orgs.length === 0 ? t("createFirst") : t("create")}
        </h2>
        <form action={createOrganization} className="space-y-4">
          <label className="block space-y-1">
            <span className="text-sm font-medium">{t("name")}</span>
            <input
              name="name"
              required
              className="w-full rounded-md border border-hairline bg-surface px-3 py-2 text-sm"
            />
          </label>
          <label className="block space-y-1">
            <span className="text-sm font-medium">{t("orgType")}</span>
            <select
              name="orgType"
              defaultValue="music"
              className="w-full rounded-md border border-hairline bg-surface px-3 py-2 text-sm"
            >
              <option value="music">{t("orgTypeMusic")}</option>
              <option value="other">{t("orgTypeOther")}</option>
            </select>
          </label>
          <button
            type="submit"
            className="rounded-md bg-accent hover:bg-accent-hover px-4 py-2 text-sm font-medium text-white"
          >
            {t("create")}
          </button>
        </form>
      </section>
    </main>
  );
}
