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

  const billing = ((org.settings ?? {}) as { billing?: Record<string, string> }).billing ?? {};

  async function saveBilling(formData: FormData) {
    "use server";
    const ctx = await requireOrg(orgSlug);
    const keys = ["name", "cui", "reg_com", "address", "iban", "bank", "representative"];
    const next = Object.fromEntries(
      keys.map((k) => [k, String(formData.get(k) ?? "").trim()]).filter(([, v]) => v),
    );
    await ctx.supabase
      .from("organizations")
      .update({ settings: { ...ctx.org.settings, billing: next } })
      .eq("id", ctx.org.id);
    revalidatePath(`/o/${orgSlug}/settings`);
  }

  const BILLING_FIELDS: [string, string][] = [
    ["name", t("billingName")],
    ["cui", "CUI"],
    ["reg_com", "Reg. Com."],
    ["address", t("billingAddress")],
    ["iban", "IBAN"],
    ["bank", t("billingBank")],
    ["representative", t("billingRepresentative")],
  ];

  return (
    <main className="mx-auto w-full max-w-2xl space-y-6 p-6">
      <h1 className="font-display text-xl font-semibold tracking-tight">{t("title")}</h1>

      <ul className="divide-y divide-hairline rounded-lg border border-hairline bg-surface shadow-xs">
        {canManageUsers && (
          <li>
            <Link href={`/o/${orgSlug}/settings/users`} className="block px-4 py-3 hover:bg-subtle">
              👤 {t("users")}
            </Link>
          </li>
        )}
        <li>
          <Link href={`/o/${orgSlug}/settings/groups`} className="block px-4 py-3 hover:bg-subtle">
            👥 {t("groups")}
          </Link>
        </li>
        <li>
          <Link href={`/o/${orgSlug}/settings/songs`} className="block px-4 py-3 hover:bg-subtle">
            🎵 {t("songs")}
          </Link>
        </li>
      </ul>

      {canManageUsers && (
        <section className="rounded-lg border border-hairline bg-surface shadow-xs p-4">
          <h2 className="mb-1 font-display text-lg font-semibold tracking-tight">{t("billingTitle")}</h2>
          <p className="mb-3 text-xs text-tertiary">{t("billingHint")}</p>
          <form action={saveBilling} className="flex flex-wrap gap-2">
            {BILLING_FIELDS.map(([key, label]) => (
              <label key={key} className="min-w-44 flex-1 space-y-1 text-xs font-semibold uppercase tracking-wider text-secondary">
                {label}
                <input
                  name={key}
                  defaultValue={billing[key] ?? ""}
                  className={`block w-full rounded border border-hairline px-2 py-1 text-sm ${key === "iban" || key === "cui" ? "font-mono" : ""}`}
                />
              </label>
            ))}
            <button className="self-end rounded bg-accent hover:bg-accent-hover px-4 py-1.5 text-sm font-medium text-white">
              {t("billingSave")}
            </button>
          </form>
        </section>
      )}

      {canManageUsers && (
        <form action={toggleGlEmails} className="flex items-center justify-between rounded-lg border border-hairline bg-surface shadow-xs px-4 py-3">
          <span>
            <span className="block text-sm font-medium">{t("glEmails")}</span>
            <span className="text-xs text-secondary">{t("glEmailsHint")}</span>
          </span>
          <button
            className={`rounded-full px-4 py-1 text-xs font-bold ${glEmailsOn ? "bg-success text-white" : "border border-hairline text-secondary"}`}
          >
            {glEmailsOn ? "ON" : "OFF"}
          </button>
        </form>
      )}
    </main>
  );
}
