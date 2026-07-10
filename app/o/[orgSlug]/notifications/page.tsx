import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { requireOrg } from "@/lib/org";
import { can } from "@/lib/permissions";

/** Notificări in-app (§6.15 MVP): lista mea + compose pentru manageri. */
export default async function NotificationsPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;
  const { supabase, user, permission, tier } = await requireOrg(orgSlug);
  const t = await getTranslations("notifications");
  const canSend = can({ tier, permission }, "send_push");

  const { data: notifications } = await supabase
    .from("notifications")
    .select("id, kind, title, body, read_at, created_at, sent_by")
    .eq("recipient_id", user.id)
    .order("created_at", { ascending: false })
    .limit(50);

  async function markRead(formData: FormData) {
    "use server";
    const { supabase } = await requireOrg(orgSlug);
    await supabase
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("id", String(formData.get("id")));
    revalidatePath(`/o/${orgSlug}/notifications`);
  }

  async function compose(formData: FormData) {
    "use server";
    const ctx = await requireOrg(orgSlug);
    if (!can({ tier: ctx.tier, permission: ctx.permission }, "send_push")) return;
    const title = String(formData.get("title") ?? "").trim();
    const body = String(formData.get("body") ?? "").trim();
    if (!title && !body) return;

    // destinatari: toți membrii org-ului (compose către grupuri/useri
    // selectați vine odată cu UI-ul de users din faza de settings)
    const { data: members } = await ctx.supabase
      .from("organization_members")
      .select("user_id")
      .eq("organization_id", ctx.org.id);
    const rows = (members ?? [])
      .filter((m) => m.user_id !== ctx.user.id)
      .map((m) => ({
        organization_id: ctx.org.id,
        recipient_id: m.user_id,
        kind: "message" as const,
        title: title || null,
        body: body || null,
        sent_by: ctx.user.id,
      }));
    if (rows.length > 0) await ctx.supabase.from("notifications").insert(rows);
    revalidatePath(`/o/${orgSlug}/notifications`);
  }

  return (
    <main className="mx-auto w-full max-w-2xl space-y-6 p-6">
      <h1 className="font-display text-xl font-semibold tracking-tight">{t("title")}</h1>

      {canSend && (
        <form action={compose} className="space-y-2 rounded-[12px] border border-hairline bg-surface p-3">
          <p className="text-sm font-medium">{t("compose")} — {t("toAll")}</p>
          <input name="title" placeholder={t("subject")} className="w-full rounded border border-hairline px-3 py-2 text-sm" />
          <textarea name="body" rows={2} placeholder={t("body")} className="w-full rounded border border-hairline px-3 py-2 text-sm" />
          <button className="btn-primary h-9">
            {t("send")}
          </button>
        </form>
      )}

      {(notifications ?? []).length === 0 ? (
        <p className="text-sm text-secondary">{t("empty")}</p>
      ) : (
        <ul className="divide-y divide-hairline rounded-[12px] border border-hairline bg-surface">
          {(notifications ?? []).map((n) => (
            <li key={n.id} className={`flex items-start gap-3 px-4 py-3 ${n.read_at ? "opacity-60" : ""}`}>
              <span className="mt-1 text-xs">{n.read_at ? "○" : "●"}</span>
              <span className="min-w-0 flex-1">
                {n.title && <b className="block text-sm">{n.title}</b>}
                {n.body && <span className="block whitespace-pre-wrap text-sm text-secondary">{n.body}</span>}
                <span className="text-xs text-tertiary">{n.created_at.slice(0, 16).replace("T", " ")}</span>
              </span>
              {!n.read_at && (
                <form action={markRead}>
                  <input type="hidden" name="id" value={n.id} />
                  <button className="rounded border border-hairline px-2 py-1 text-xs">
                    {t("markRead")}
                  </button>
                </form>
              )}
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
