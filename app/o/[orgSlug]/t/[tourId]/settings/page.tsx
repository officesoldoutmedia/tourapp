import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { Users, ChevronRight } from "lucide-react";
import { requireOrg } from "@/lib/org";
import { hasMinPermission } from "@/lib/permissions";
import { PageHeader } from "@/components/ui/PageHeader";
import { TourLogo } from "./logo-client";

/** Tour Settings (prototip Graphite): Tour details / Preferences / Archive. */
export default async function TourSettingsPage({
  params,
}: {
  params: Promise<{ orgSlug: string; tourId: string }>;
}) {
  const { orgSlug, tourId } = await params;
  const { org, supabase, permission } = await requireOrg(orgSlug);
  const t = await getTranslations("tourSettings");
  const tc = await getTranslations("common");
  if (!hasMinPermission(permission, "manager")) notFound();

  const { data: tour } = await supabase
    .from("tours")
    .select("id, name, is_archived, visible_on_mobile, booking_percent, logo_path")
    .eq("id", tourId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!tour) notFound();

  const logoUrl = tour.logo_path
    ? ((await supabase.storage.from("attachments").createSignedUrl(tour.logo_path, 3600)).data
        ?.signedUrl ?? null)
    : null;

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

  const label = "block text-[11.5px] font-medium text-secondary";
  const input =
    "h-9 w-full rounded-[8px] border border-hairline bg-inset px-3 text-[13px] text-primary outline-none";

  return (
    <main className="w-full pb-11">
      <PageHeader eyebrow={tour.name} title={t("title")} />

      <div className="max-w-[640px] px-8 pt-7">
        {/* ── Tour details ── */}
        <h2 className="mb-4 font-display text-[13px] font-semibold text-primary">
          {t("detailsSection")}
        </h2>
        <div className="grid gap-4">
          <form action={rename}>
            <label className={label} htmlFor="tour-name">
              {t("tourName")}
            </label>
            <div className="mt-1.5 flex gap-2">
              <input id="tour-name" name="name" defaultValue={tour.name} required className={input} />
              <button className="btn-quiet h-9 shrink-0">{tc("save")}</button>
            </div>
          </form>

          <div>
            <span className={label}>{t("logoTitle")}</span>
            <div className="mt-1.5">
              <TourLogo
                orgSlug={orgSlug}
                orgId={org.id}
                tourId={tourId}
                logoUrl={logoUrl}
                labels={{
                  upload: t("logoUpload"),
                  remove: t("logoRemove"),
                  uploaded: t("logoUploaded"),
                  hint: t("logoHint"),
                }}
              />
            </div>
          </div>

          <form action={saveBooking}>
            <label className={label} htmlFor="booking-pct">
              {t("bookingPercent")}
            </label>
            <p className="mt-0.5 text-[11px] text-tertiary">{t("bookingPercentHint")}</p>
            <div className="mt-1.5 flex gap-2">
              <input
                id="booking-pct"
                name="bookingPercent"
                type="number"
                step="0.1"
                min="0"
                max="100"
                defaultValue={tour.booking_percent ?? ""}
                className={`${input} !w-32 font-mono`}
              />
              <button className="btn-quiet h-9 shrink-0">{tc("save")}</button>
            </div>
          </form>
        </div>

        {/* ── Preferences ── */}
        <h2 className="mb-1 mt-[34px] font-display text-[13px] font-semibold text-primary">
          {t("prefsSection")}
        </h2>
        <div className="border-t border-faint">
          <div className="flex min-h-[52px] items-center justify-between gap-4 border-b border-faint py-2">
            <div>
              <p className="text-[12.5px] font-medium text-primary">{t("visibleMobile")}</p>
              <p className="mt-0.5 text-[11px] text-tertiary">{t("visibleMobileHint")}</p>
            </div>
            <form action={toggle} className="shrink-0">
              <input type="hidden" name="field" value="visible_on_mobile" />
              <button
                name="value"
                value={String(!tour.visible_on_mobile)}
                role="switch"
                aria-checked={tour.visible_on_mobile}
                className="relative h-5 w-[34px] rounded-full transition-colors"
                style={{
                  background: tour.visible_on_mobile ? "var(--accent)" : "var(--switch-off)",
                }}
              >
                <i
                  className="absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white transition-transform"
                  style={{
                    transform: tour.visible_on_mobile ? "translateX(14px)" : "translateX(0)",
                  }}
                />
              </button>
            </form>
          </div>
        </div>

        <Link
          href={`/o/${orgSlug}/t/${tourId}/personnel`}
          className="mt-[26px] flex items-center justify-between rounded-[12px] border border-hairline bg-surface px-4 py-3 transition-colors hover:bg-subtle"
        >
          <span className="flex items-center gap-2.5">
            <Users size={17} strokeWidth={1.5} className="text-secondary" />
            <span>
              <span className="block text-[12.5px] font-medium text-primary">{t("crewLink")}</span>
              <span className="text-[11px] text-tertiary">{t("crewLinkHint")}</span>
            </span>
          </span>
          <ChevronRight size={15} className="text-tertiary" />
        </Link>

        {/* ── Archive (prototip: card cu bordură danger soft) ── */}
        <div
          className="mt-[34px] flex items-center justify-between gap-4 rounded-[12px] px-[18px] py-4"
          style={{ border: "1px solid rgba(237,106,103,.25)" }}
        >
          <div>
            <p className="text-[12.5px] font-medium text-primary">{t("archiveTitle")}</p>
            <p className="mt-0.5 text-[11.5px] text-secondary">{t("archiveHint")}</p>
          </div>
          <form action={toggle}>
            <input type="hidden" name="field" value="is_archived" />
            <button name="value" value={String(!tour.is_archived)} className="btn-danger h-8">
              {tour.is_archived ? t("unarchive") : t("archive")}
            </button>
          </form>
        </div>

        {/* ── Delete ── */}
        <form
          action={removeTour}
          className="mt-4 space-y-2 rounded-[12px] px-[18px] py-4"
          style={{ border: "1px solid rgba(237,106,103,.25)" }}
        >
          <p className="text-[12.5px] font-medium text-danger">{t("deleteTitle")}</p>
          <p className="text-[11.5px] text-secondary">{t("deleteHint")}</p>
          <div className="flex gap-2 pt-1">
            <input
              name="confirm"
              required
              pattern="DELETE"
              placeholder={t("deletePlaceholder")}
              className={input}
            />
            <button className="btn-danger h-9 shrink-0">{tc("delete")}</button>
          </div>
        </form>
      </div>
    </main>
  );
}
