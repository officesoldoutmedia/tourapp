import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { Users, ChevronRight } from "lucide-react";
import { requireOrg } from "@/lib/org";
import { hasMinPermission } from "@/lib/permissions";

/** Tour Settings — nume, arhivare, vizibilitate mobil, ștergere [C-S MT]. */
export default async function TourSettingsPage({
  params,
}: {
  params: Promise<{ orgSlug: string; tourId: string }>;
}) {
  const { orgSlug, tourId } = await params;
  const { supabase, permission } = await requireOrg(orgSlug);
  const t = await getTranslations("tourSettings");
  const tc = await getTranslations("common");
  if (!hasMinPermission(permission, "manager")) notFound();

  const { data: tour } = await supabase
    .from("tours")
    .select("id, name, is_archived, visible_on_mobile, booking_percent")
    .eq("id", tourId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!tour) notFound();

  const path = `/o/${orgSlug}/t/${tourId}/settings`;

  async function rename(formData: FormData) {
    "use server";
    const { supabase } = await requireOrg(orgSlug);
    const name = String(formData.get("name") ?? "").trim();
    if (!name) return;
    await supabase.from("tours").update({ name }).eq("id", tourId);
    revalidatePath(`/o/${orgSlug}`, "layout");
  }

  async function saveBooking(formData: FormData) {
    "use server";
    const { supabase } = await requireOrg(orgSlug);
    const raw = String(formData.get("bookingPercent") ?? "");
    await supabase
      .from("tours")
      .update({ booking_percent: raw === "" ? null : Number(raw) })
      .eq("id", tourId);
    revalidatePath(path);
  }

  async function toggle(formData: FormData) {
    "use server";
    const { supabase } = await requireOrg(orgSlug);
    const field = String(formData.get("field"));
    const value = String(formData.get("value")) === "true";
    if (!["is_archived", "visible_on_mobile"].includes(field)) return;
    await supabase.from("tours").update({ [field]: value }).eq("id", tourId);
    revalidatePath(path);
  }

  async function removeTour(formData: FormData) {
    "use server";
    const ctx = await requireOrg(orgSlug);
    if (String(formData.get("confirm")) !== "DELETE") return;
    await ctx.supabase
      .from("tours")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", tourId);
    redirect(`/o/${orgSlug}`);
  }

  const toggles: [string, string, boolean][] = [
    ["is_archived", t("archived"), tour.is_archived],
    ["visible_on_mobile", t("visibleMobile"), tour.visible_on_mobile],
  ];

  return (
    <main className="mx-auto w-full max-w-2xl space-y-6 p-6">
      <h1 className="font-display text-xl font-semibold tracking-tight">{t("title")}</h1>

      <form action={rename} className="space-y-2 rounded-lg border border-hairline bg-surface p-4 shadow-xs">
        <label className="block text-xs font-semibold uppercase tracking-wider text-secondary">
          {t("tourName")}
        </label>
        <div className="flex gap-2">
          <input name="name" defaultValue={tour.name} required className="flex-1 rounded border border-hairline px-3 py-2 text-sm" />
          <button className="rounded bg-accent hover:bg-accent-hover px-4 py-2 text-sm font-medium text-white">
            {tc("save")}
          </button>
        </div>
      </form>

      <div className="divide-y divide-hairline rounded-lg border border-hairline bg-surface shadow-xs">
        {toggles.map(([field, label, value]) => (
          <div key={field} className="flex items-center justify-between px-4 py-3">
            <span className="text-sm">{label}</span>
            <form action={toggle} className="flex rounded-full bg-inset p-0.5 text-xs font-semibold">
              <input type="hidden" name="field" value={field} />
              <button
                name="value"
                value="true"
                className={`rounded-full px-3 py-1 transition-colors ${value ? "bg-surface text-primary shadow-xs" : "text-tertiary hover:text-secondary"}`}
              >
                {tc("yes")}
              </button>
              <button
                name="value"
                value="false"
                className={`rounded-full px-3 py-1 transition-colors ${!value ? "bg-surface text-primary shadow-xs" : "text-tertiary hover:text-secondary"}`}
              >
                {tc("no")}
              </button>
            </form>
          </div>
        ))}
      </div>

      <Link
        href={`/o/${orgSlug}/t/${tourId}/personnel`}
        className="flex items-center justify-between rounded-lg border border-hairline bg-surface px-4 py-3 shadow-xs transition-colors hover:bg-subtle"
      >
        <span className="flex items-center gap-2.5 text-sm">
          <Users size={18} strokeWidth={1.5} className="text-secondary" />
          <span>
            <span className="block font-medium">{t("crewLink")}</span>
            <span className="text-xs text-secondary">{t("crewLinkHint")}</span>
          </span>
        </span>
        <ChevronRight size={16} className="text-tertiary" />
      </Link>

      <form action={saveBooking} className="space-y-2 rounded-lg border border-hairline bg-surface p-4 shadow-xs">
        <label className="block text-xs font-semibold uppercase tracking-wider text-secondary">
          {t("bookingPercent")}
        </label>
        <p className="text-xs text-tertiary">{t("bookingPercentHint")}</p>
        <div className="flex gap-2">
          <input
            name="bookingPercent"
            type="number"
            step="0.1"
            min="0"
            max="100"
            defaultValue={tour.booking_percent ?? ""}
            className="w-32 rounded border border-hairline px-3 py-2 font-mono text-sm"
          />
          <button className="rounded bg-accent hover:bg-accent-hover px-4 py-2 text-sm font-medium text-white">
            {tc("save")}
          </button>
        </div>
      </form>

      <form
        action={removeTour}
        className="space-y-2 rounded-lg border border-danger bg-danger-subtle/40 p-4"
      >
        <p className="text-sm font-medium text-danger">{t("deleteTitle")}</p>
        <p className="text-xs text-secondary">{t("deleteHint")}</p>
        <div className="flex gap-2">
          <input
            name="confirm"
            required
            pattern="DELETE"
            placeholder={t("deletePlaceholder")}
            className="flex-1 rounded border border-hairline px-3 py-2 text-sm"
          />
          <button className="rounded bg-danger px-4 py-2 text-sm font-medium text-white hover:opacity-90">
            {tc("delete")}
          </button>
        </div>
      </form>
    </main>
  );
}
