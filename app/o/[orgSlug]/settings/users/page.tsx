import { notFound } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { requireOrg } from "@/lib/org";
import { can } from "@/lib/permissions";
import { sendEmail } from "@/lib/email";

const PERMISSIONS = [
  "administrator",
  "accounting",
  "manager",
  "gl_manage_all",
  "gl_view_all_submit",
  "gl_submit",
  "mobile_access",
] as const;

/** Users & permisiuni [C §4.3.3] — doar administratorii. */
export default async function UsersSettingsPage({
  params,
  searchParams,
}: {
  params: Promise<{ orgSlug: string }>;
  searchParams: Promise<{ invited?: string }>;
}) {
  const { orgSlug } = await params;
  const { invited } = await searchParams;
  const { supabase, org, user, permission, tier } = await requireOrg(orgSlug);
  const t = await getTranslations("settings");
  const tp = await getTranslations("permissions");
  if (!can({ tier, permission }, "manage_users")) notFound();

  const [{ data: members }, { data: invites }] = await Promise.all([
    supabase
      .from("organization_members")
      .select("id, user_id, permission")
      .eq("organization_id", org.id)
      .order("created_at"),
    supabase
      .from("org_invitations")
      .select("id, email, permission, token")
      .eq("organization_id", org.id)
      .is("accepted_at", null)
      .order("created_at", { ascending: false }),
  ]);

  const memberIds = (members ?? []).map((m) => m.user_id);
  const { data: profiles } = memberIds.length
    ? await supabase
        .from("profiles")
        .select("id, first_name, last_name, email, user_tier")
        .in("id", memberIds)
    : { data: [] as { id: string; first_name: string | null; last_name: string | null; email: string | null; user_tier: string }[] };
  const profileOf = new Map((profiles ?? []).map((p) => [p.id, p]));

  const base = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  async function invite(formData: FormData) {
    "use server";
    const ctx = await requireOrg(orgSlug);
    if (!can({ tier: ctx.tier, permission: ctx.permission }, "manage_users")) return;
    const email = String(formData.get("email") ?? "").trim().toLowerCase();
    const perm = String(formData.get("permission") ?? "mobile_access");
    if (!email) return;

    const { data: inviteRow } = await ctx.supabase
      .from("org_invitations")
      .insert({
        organization_id: ctx.org.id,
        email,
        permission: perm,
        invited_by: ctx.user.id,
      })
      .select("token")
      .single();

    if (inviteRow) {
      const url = `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/invite/${inviteRow.token}`;
      // email opțional [C §4.3.3] — mod log fără RESEND_API_KEY
      await sendEmail({
        to: email,
        subject: `Invitație în ${ctx.org.name} pe TourApp`,
        html: `<p>Ai fost invitat(ă) în organizația <b>${ctx.org.name}</b>.</p><p><a href="${url}">Acceptă invitația</a></p>`,
      });
    }
    revalidatePath(`/o/${orgSlug}/settings/users`);
  }

  async function setPermission(formData: FormData) {
    "use server";
    const ctx = await requireOrg(orgSlug);
    if (!can({ tier: ctx.tier, permission: ctx.permission }, "manage_users")) return;
    await ctx.supabase
      .from("organization_members")
      .update({ permission: String(formData.get("permission")) })
      .eq("id", String(formData.get("id")));
    revalidatePath(`/o/${orgSlug}/settings/users`);
  }

  async function removeMember(formData: FormData) {
    "use server";
    const ctx = await requireOrg(orgSlug);
    if (!can({ tier: ctx.tier, permission: ctx.permission }, "manage_users")) return;
    await ctx.supabase
      .from("organization_members")
      .delete()
      .eq("id", String(formData.get("id")));
    revalidatePath(`/o/${orgSlug}/settings/users`);
  }

  return (
    <main className="mx-auto w-full max-w-2xl space-y-6 p-6">
      <h1 className="text-xl font-semibold">{t("users")}</h1>

      <section className="space-y-2">
        <h2 className="text-sm font-medium text-neutral-500">{t("members")}</h2>
        <ul className="divide-y divide-neutral-100 rounded-lg border border-neutral-200">
          {(members ?? []).map((member) => {
            const profile = profileOf.get(member.user_id);
            const name =
              [profile?.first_name, profile?.last_name].filter(Boolean).join(" ") ||
              profile?.email ||
              member.user_id.slice(0, 8);
            return (
              <li key={member.id} className="flex items-center gap-2 px-4 py-2 text-sm">
                <span className="min-w-0 flex-1">
                  <b>{name}</b>
                  {profile?.user_tier === "pro" && (
                    <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800">PRO</span>
                  )}
                  <span className="ml-2 text-xs text-neutral-400">{profile?.email}</span>
                </span>
                <form action={setPermission} className="flex items-center gap-1">
                  <input type="hidden" name="id" value={member.id} />
                  <select
                    name="permission"
                    defaultValue={member.permission}
                    disabled={member.user_id === user.id}
                    className="rounded border border-neutral-300 px-2 py-1 text-xs"
                  >
                    {PERMISSIONS.map((p) => (
                      <option key={p} value={p}>{tp(p)}</option>
                    ))}
                  </select>
                  {member.user_id !== user.id && (
                    <button className="rounded bg-neutral-900 px-2 py-1 text-xs text-white">✓</button>
                  )}
                </form>
                {member.user_id !== user.id && (
                  <form action={removeMember}>
                    <input type="hidden" name="id" value={member.id} />
                    <button className="rounded px-2 py-1 text-xs text-red-600 hover:bg-red-50">
                      {t("remove")}
                    </button>
                  </form>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      {(invites ?? []).length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-medium text-neutral-500">{t("pendingInvites")}</h2>
          <ul className="divide-y divide-neutral-100 rounded-lg border border-neutral-200">
            {(invites ?? []).map((inv) => (
              <li key={inv.id} className="px-4 py-2 text-sm">
                <b>{inv.email}</b>
                <span className="ml-2 text-xs text-neutral-500">{tp(inv.permission)}</span>
                <code className="mt-1 block truncate rounded bg-neutral-50 px-2 py-1 text-xs text-neutral-600">
                  {base}/invite/{inv.token}
                </code>
              </li>
            ))}
          </ul>
        </section>
      )}

      <form action={invite} className="flex flex-wrap gap-2 rounded-lg border border-neutral-200 p-3">
        <input name="email" type="email" required placeholder={t("email")} className="min-w-48 flex-1 rounded border border-neutral-300 px-3 py-2 text-sm" />
        <select name="permission" defaultValue="mobile_access" className="rounded border border-neutral-300 px-2 py-2 text-sm">
          {PERMISSIONS.map((p) => (
            <option key={p} value={p}>{tp(p)}</option>
          ))}
        </select>
        <button className="rounded bg-neutral-900 px-4 py-2 text-sm font-medium text-white">
          + {t("invite")}
        </button>
      </form>
      {invited && <p className="text-xs text-emerald-700">{t("inviteSent")}</p>}
    </main>
  );
}
