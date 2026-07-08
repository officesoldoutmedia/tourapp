import Link from "next/link";
import { notFound } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { requireOrg } from "@/lib/org";
import { can, hasMinPermission } from "@/lib/permissions";

/** Hub-ul de setări al organizației [C §6.1]. */
export default async function OrgSettingsPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;
  const { org, permission, tier } = await requireOrg(orgSlug);
  const t = await getTranslations("settings");
  if (!hasMinPermission(permission, "manager")) notFound();

  const canManageUsers = can({ tier, permission }, "manage_users");
  const glEmailsOn =
    (org.settings as Record<string, unknown>).guest_list_approval_emails !== false;

  async function toggleGlEmails() {
    "use server";
    const ctx = await requireOrg(orgSlug);
    if (!can({ tier: ctx.tier, permission: ctx.permission }, "manage_users")) return;
    const current =
      (ctx.org.settings as Record<string, unknown>).guest_list_approval_emails !== false;
    await ctx.supabase
      .from("organizations")
      .update({ settings: { ...ctx.org.settings, guest_list_approval_emails: !current } })
      .eq("id", ctx.org.id);
    revalidatePath(`/o/${orgSlug}/settings`);
  }

  return (
    <main className="mx-auto w-full max-w-2xl space-y-6 p-6">
      <h1 className="text-xl font-semibold">{t("title")}</h1>

      <ul className="divide-y divide-neutral-100 rounded-lg border border-neutral-200">
        {canManageUsers && (
          <li>
            <Link href={`/o/${orgSlug}/settings/users`} className="block px-4 py-3 hover:bg-neutral-50">
              👤 {t("users")}
            </Link>
          </li>
        )}
        <li>
          <Link href={`/o/${orgSlug}/settings/groups`} className="block px-4 py-3 hover:bg-neutral-50">
            👥 {t("groups")}
          </Link>
        </li>
        <li>
          <Link href={`/o/${orgSlug}/settings/songs`} className="block px-4 py-3 hover:bg-neutral-50">
            🎵 {t("songs")}
          </Link>
        </li>
      </ul>

      {canManageUsers && (
        <form action={toggleGlEmails} className="flex items-center justify-between rounded-lg border border-neutral-200 px-4 py-3">
          <span>
            <span className="block text-sm font-medium">{t("glEmails")}</span>
            <span className="text-xs text-neutral-500">{t("glEmailsHint")}</span>
          </span>
          <button
            className={`rounded-full px-4 py-1 text-xs font-bold ${glEmailsOn ? "bg-emerald-600 text-white" : "border border-neutral-300 text-neutral-500"}`}
          >
            {glEmailsOn ? "ON" : "OFF"}
          </button>
        </form>
      )}
    </main>
  );
}
