import { notFound } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { requireOrg } from "@/lib/org";
import { hasMinPermission } from "@/lib/permissions";

/** Grupuri pentru Visibility [C §5] — manager+. */
export default async function GroupsSettingsPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;
  const { supabase, org, permission } = await requireOrg(orgSlug);
  const t = await getTranslations("settings");
  if (!hasMinPermission(permission, "manager")) notFound();

  const [{ data: groups }, { data: members }] = await Promise.all([
    supabase
      .from("groups")
      .select("id, name, group_members(user_id)")
      .eq("organization_id", org.id)
      .is("deleted_at", null)
      .order("name"),
    supabase
      .from("organization_members")
      .select("user_id")
      .eq("organization_id", org.id),
  ]);

  const memberIds = (members ?? []).map((m) => m.user_id);
  const { data: profiles } = memberIds.length
    ? await supabase
        .from("profiles")
        .select("id, first_name, last_name, email")
        .in("id", memberIds)
    : { data: [] as { id: string; first_name: string | null; last_name: string | null; email: string | null }[] };
  const nameOf = (id: string) => {
    const p = (profiles ?? []).find((x) => x.id === id);
    return [p?.first_name, p?.last_name].filter(Boolean).join(" ") || p?.email || id.slice(0, 8);
  };

  async function addGroup(formData: FormData) {
    "use server";
    const ctx = await requireOrg(orgSlug);
    const name = String(formData.get("name") ?? "").trim();
    if (!name) return;
    await ctx.supabase.from("groups").insert({ organization_id: ctx.org.id, name });
    revalidatePath(`/o/${orgSlug}/settings/groups`);
  }

  async function removeGroup(formData: FormData) {
    "use server";
    const ctx = await requireOrg(orgSlug);
    await ctx.supabase
      .from("groups")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", String(formData.get("id")));
    revalidatePath(`/o/${orgSlug}/settings/groups`);
  }

  async function toggleMember(formData: FormData) {
    "use server";
    const ctx = await requireOrg(orgSlug);
    const groupId = String(formData.get("groupId"));
    const userId = String(formData.get("userId"));
    const inGroup = String(formData.get("inGroup")) === "1";
    if (inGroup) {
      await ctx.supabase
        .from("group_members")
        .delete()
        .eq("group_id", groupId)
        .eq("user_id", userId);
    } else {
      await ctx.supabase.from("group_members").insert({ group_id: groupId, user_id: userId });
    }
    revalidatePath(`/o/${orgSlug}/settings/groups`);
  }

  return (
    <main className="mx-auto w-full max-w-2xl space-y-6 p-6">
      <h1 className="font-display text-xl font-semibold tracking-tight">{t("groups")}</h1>

      {(groups ?? []).length === 0 && (
        <p className="text-sm text-secondary">{t("noGroups")}</p>
      )}

      {(groups ?? []).map((group) => {
        const inGroup = new Set(
          ((group.group_members ?? []) as { user_id: string }[]).map((m) => m.user_id),
        );
        return (
          <section key={group.id} className="rounded-[12px] border border-hairline bg-surface">
            <header className="flex items-center justify-between border-b border-hairline bg-subtle px-4 py-2">
              <b className="text-sm">{group.name}</b>
              <form action={removeGroup}>
                <input type="hidden" name="id" value={group.id} />
                <button className="rounded px-2 py-0.5 text-xs text-danger hover:bg-danger-subtle">🗑</button>
              </form>
            </header>
            <div className="flex flex-wrap gap-1.5 p-3">
              {memberIds.map((userId) => {
                const active = inGroup.has(userId);
                return (
                  <form key={userId} action={toggleMember}>
                    <input type="hidden" name="groupId" value={group.id} />
                    <input type="hidden" name="userId" value={userId} />
                    <input type="hidden" name="inGroup" value={active ? "1" : "0"} />
                    <button
                      className={`rounded-full px-3 py-1 text-xs transition-colors ${active ? "bg-accent-subtle font-medium text-accent-soft" : "border border-hairline text-secondary hover:bg-fill-control"}`}
                    >
                      {nameOf(userId)}
                    </button>
                  </form>
                );
              })}
            </div>
          </section>
        );
      })}

      <form action={addGroup} className="flex gap-2">
        <input name="name" required placeholder={t("groupName")} className="min-w-40 flex-1 rounded border border-hairline px-3 py-2 text-sm" />
        <button className="btn-primary h-9">
          + {t("addGroup")}
        </button>
      </form>
    </main>
  );
}
