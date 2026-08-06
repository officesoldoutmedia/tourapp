import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { requireOrg } from "@/lib/org";
import { can } from "@/lib/permissions";
import { addArtistVisibilityRule, removeArtistVisibilityRule } from "./actions";
import { ArtistFiles, type ArtistFileData } from "./files-client";

/** Tabul Acces al artistului: reguli de vizibilitate (grup/user, [C §5]) +
 * fișierele permanente ale artistului (rider, hospitality, press — se vor
 * moșteni în event-uri, sub-proiectul 3). Doar manage_tours. */
export default async function ArtistAccessPage({
  params,
}: {
  params: Promise<{ orgSlug: string; artistSlug: string }>;
}) {
  const { orgSlug, artistSlug } = await params;
  const { supabase, org, permission, tier } = await requireOrg(orgSlug);
  if (!can({ tier, permission }, "manage_tours")) {
    redirect(`/o/${orgSlug}/a/${artistSlug}`);
  }
  const t = await getTranslations("artist");

  const { data: artist } = await supabase
    .from("artists")
    .select("id")
    .eq("organization_id", org.id)
    .eq("slug", artistSlug)
    .is("deleted_at", null)
    .maybeSingle();
  if (!artist) notFound();
  const artistId = artist.id;

  const [{ data: rules }, { data: groups }, { data: members }, { data: attachments }, { data: categories }] =
    await Promise.all([
      supabase
        .from("visibility_rules")
        .select("id, target_type, target_id")
        .eq("organization_id", org.id)
        .eq("subject_type", "artist")
        .eq("subject_id", artistId)
        .order("created_at"),
      supabase
        .from("groups")
        .select("id, name")
        .eq("organization_id", org.id)
        .is("deleted_at", null)
        .order("name"),
      supabase
        .from("organization_members")
        .select("user_id")
        .eq("organization_id", org.id),
      supabase
        .from("attachments")
        .select("id, file_name, mime_type, size_bytes, created_at, category_id")
        .eq("parent_type", "artist")
        .eq("parent_id", artistId)
        .is("deleted_at", null)
        .order("created_at", { ascending: false }),
      supabase
        .from("file_categories")
        .select("id, name")
        .eq("organization_id", org.id)
        .is("deleted_at", null)
        .order("sort_order")
        .order("created_at"),
    ]);

  const memberIds = (members ?? []).map((m) => m.user_id);
  const { data: profiles } = memberIds.length
    ? await supabase
        .from("profiles")
        .select("id, first_name, last_name, email")
        .in("id", memberIds)
    : {
        data: [] as {
          id: string;
          first_name: string | null;
          last_name: string | null;
          email: string | null;
        }[],
      };

  const nameOfUser = (id: string) => {
    const p = (profiles ?? []).find((x) => x.id === id);
    return [p?.first_name, p?.last_name].filter(Boolean).join(" ") || p?.email || id.slice(0, 8);
  };
  const nameOfGroup = (id: string) => (groups ?? []).find((g) => g.id === id)?.name ?? id.slice(0, 8);

  const targetedGroupIds = new Set(
    (rules ?? []).filter((r) => r.target_type === "group").map((r) => r.target_id),
  );
  const targetedUserIds = new Set(
    (rules ?? []).filter((r) => r.target_type === "user").map((r) => r.target_id),
  );
  const availableGroups = (groups ?? []).filter((g) => !targetedGroupIds.has(g.id));
  const availableUserIds = memberIds.filter((id) => !targetedUserIds.has(id));

  async function addGroupTarget(formData: FormData) {
    "use server";
    const targetId = String(formData.get("targetId") ?? "");
    if (!targetId) return;
    await addArtistVisibilityRule(orgSlug, artistSlug, artistId, { type: "group", id: targetId });
  }

  async function addUserTarget(formData: FormData) {
    "use server";
    const targetId = String(formData.get("targetId") ?? "");
    if (!targetId) return;
    await addArtistVisibilityRule(orgSlug, artistSlug, artistId, { type: "user", id: targetId });
  }

  async function removeTarget(formData: FormData) {
    "use server";
    const ruleId = String(formData.get("ruleId") ?? "");
    if (!ruleId) return;
    await removeArtistVisibilityRule(orgSlug, artistSlug, ruleId);
  }

  return (
    <div className="space-y-8">
      {/* Reguli de vizibilitate [C §5] */}
      <section className="space-y-3">
        <h2 className="font-display text-lg font-semibold tracking-tight">{t("accessTitle")}</h2>

        {(rules ?? []).length === 0 ? (
          <p className="rounded-[12px] border border-hairline bg-surface px-4 py-3 text-sm text-secondary">
            {t("accessOpen")}
          </p>
        ) : (
          <div className="space-y-2">
            <p className="text-sm text-secondary">{t("accessRestricted")}</p>
            <ul className="divide-y divide-hairline rounded-[12px] border border-hairline bg-surface">
              {(rules ?? []).map((rule) => (
                <li key={rule.id} className="flex items-center gap-2 px-4 py-2 text-sm">
                  <span className="min-w-0 flex-1 truncate">
                    {rule.target_type === "group" ? nameOfGroup(rule.target_id) : nameOfUser(rule.target_id)}
                  </span>
                  <form action={removeTarget}>
                    <input type="hidden" name="ruleId" value={rule.id} />
                    <button className="rounded px-2 py-1 text-xs text-danger hover:bg-danger-subtle">
                      {t("remove")}
                    </button>
                  </form>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          {availableGroups.length > 0 && (
            <form action={addGroupTarget} className="flex items-center gap-2">
              <select
                name="targetId"
                required
                className="rounded border border-hairline px-2 py-1.5 text-sm"
              >
                {availableGroups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>
              <button className="btn-quiet h-8 px-2.5">{t("addGroup")}</button>
            </form>
          )}
          {availableUserIds.length > 0 && (
            <form action={addUserTarget} className="flex items-center gap-2">
              <select
                name="targetId"
                required
                className="rounded border border-hairline px-2 py-1.5 text-sm"
              >
                {availableUserIds.map((id) => (
                  <option key={id} value={id}>
                    {nameOfUser(id)}
                  </option>
                ))}
              </select>
              <button className="btn-quiet h-8 px-2.5">{t("addUser")}</button>
            </form>
          )}
        </div>

        <p className="text-xs text-tertiary">{t("accessNote")}</p>
      </section>

      {/* Fișierele artistului — permanente, YAGNI: fără moștenire în event-uri aici */}
      <section className="space-y-3">
        <div>
          <h2 className="font-display text-lg font-semibold tracking-tight">{t("filesTitle")}</h2>
          <p className="text-xs text-tertiary">{t("filesHint")}</p>
        </div>
        <ArtistFiles
          orgSlug={orgSlug}
          artistSlug={artistSlug}
          orgId={org.id}
          artistId={artistId}
          files={(attachments ?? []) as ArtistFileData[]}
          categories={categories ?? []}
        />
      </section>
    </div>
  );
}
