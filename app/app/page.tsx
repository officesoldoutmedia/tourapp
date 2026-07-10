import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { requireUser } from "@/lib/auth";
import { createOrganization } from "./actions";

export default async function AppPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { supabase, user } = await requireUser();
  const t = await getTranslations("orgs");
  const tp = await getTranslations("permissions");
  const { error } = await searchParams;

  const { data: profile } = await supabase
    .from("profiles")
    .select("user_tier")
    .eq("id", user.id)
    .maybeSingle();
  const isPro = profile?.user_tier === "pro";

  // RLS lasă orice membru să vadă TOATE membership-urile organizației
  // (members_select_orgmate), deci fără filtrul pe user organizația ar
  // apărea o dată pentru fiecare coleg.
  const { data: memberships } = await supabase
    .from("organization_members")
    .select("permission, organizations(id, name, slug, org_type)")
    .eq("user_id", user.id)
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
      {error && (
        <div className="rounded-md border border-danger bg-danger-subtle px-4 py-3 text-sm text-danger">
          {error === "pro_required"
            ? t("errorProRequired")
            : error === "name_required"
              ? t("errorNameRequired")
              : t("errorCreateFailed")}
        </div>
      )}
      <section className="space-y-4">
        <h1 className="font-display text-2xl font-semibold tracking-tight">{t("yourOrganizations")}</h1>
        {orgs.length === 0 ? (
          <p className="text-sm text-secondary">{t("empty")}</p>
        ) : (
          <ul className="divide-y divide-hairline rounded-[12px] border border-hairline bg-surface">
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
        {!isPro && (
          <div className="rounded-md border border-hairline bg-subtle px-4 py-3 text-sm text-secondary">
            {t("proGate")}
          </div>
        )}
        {isPro && (
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
            className="btn-primary h-9"
          >
            {t("create")}
          </button>
        </form>
        )}
      </section>
    </main>
  );
}
