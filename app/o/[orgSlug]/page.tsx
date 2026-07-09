import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { requireOrg } from "@/lib/org";
import { can } from "@/lib/permissions";

export default async function OrgDashboard({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;
  const { supabase, org, permission, tier } = await requireOrg(orgSlug);
  const t = await getTranslations("tours");

  const { data: tours } = await supabase
    .from("tours")
    .select("id, name, start_date, end_date, is_archived")
    .eq("organization_id", org.id)
    .is("deleted_at", null)
      .eq("is_archived", false)
    .order("start_date", { ascending: false });

  const active = (tours ?? []).filter((t) => !t.is_archived);
  const archived = (tours ?? []).filter((t) => t.is_archived);
  const canManage = can({ tier, permission }, "manage_tours");

  return (
    <main className="mx-auto w-full max-w-2xl space-y-8 p-6">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-2xl font-semibold tracking-tight">{t("title")}</h1>
        {canManage && (
          <Link
            href={`/o/${org.slug}/tours/new`}
            className="rounded-md bg-accent hover:bg-accent-hover px-4 py-2 text-sm font-medium text-white"
          >
            {t("newTour")}
          </Link>
        )}
      </div>

      {active.length === 0 ? (
        <p className="text-sm text-secondary">{t("empty")}</p>
      ) : (
        <ul className="divide-y divide-hairline rounded-lg border border-hairline bg-surface shadow-xs">
          {active.map((tour) => (
            <li key={tour.id}>
              <Link
                href={`/o/${org.slug}/t/${tour.id}`}
                className="flex items-center justify-between px-4 py-3 hover:bg-subtle"
              >
                <span className="font-medium">{tour.name}</span>
                <span className="text-xs text-secondary">
                  {tour.start_date} → {tour.end_date}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {archived.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-medium text-secondary">
            {t("archived")}
          </h2>
          <ul className="divide-y divide-hairline rounded-lg border border-hairline bg-surface shadow-xs opacity-60">
            {archived.map((tour) => (
              <li key={tour.id}>
                <Link
                  href={`/o/${org.slug}/t/${tour.id}`}
                  className="flex items-center justify-between px-4 py-3 hover:bg-subtle"
                >
                  <span>{tour.name}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
