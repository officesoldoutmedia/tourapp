import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { ChevronRight } from "lucide-react";
import { requireOrg } from "@/lib/org";
import { can } from "@/lib/permissions";
import { formatMoney } from "@/lib/showFinance";

/**
 * Personnel — listă Graphite (README §9): rânduri h56 cu avatar,
 * identitate, capsulă de party, telefon mono și chevron. Toată editarea
 * (funcții, prețuri, poză, date) se face în PROFILUL persoanei —
 * preferința explicită a userului (2026-07-10).
 */
export default async function PersonnelPage({
  params,
}: {
  params: Promise<{ orgSlug: string; tourId: string }>;
}) {
  const { orgSlug, tourId } = await params;
  const { supabase, permission, tier } = await requireOrg(orgSlug);
  const t = await getTranslations("personnel");
  const canEdit = can({ tier, permission }, "edit_tour_content");
  const canSeeCosts = can({ tier, permission }, "view_accounting");

  const [{ data: tour }, { data: people }] = await Promise.all([
    supabase.from("tours").select("id, name").eq("id", tourId).is("deleted_at", null).maybeSingle(),
    supabase
      .from("tour_personnel")
      .select("id, first_name, last_name, role, company, party, phones, cost_per_show, cost_currency, payment_type")
      .eq("tour_id", tourId)
      .is("deleted_at", null)
      .order("last_name"),
  ]);
  if (!tour) notFound();

  async function addPerson(formData: FormData) {
    "use server";
    const ctx = await requireOrg(orgSlug);
    const first = String(formData.get("first") ?? "").trim();
    const last = String(formData.get("last") ?? "").trim();
    const role = String(formData.get("role") ?? "").trim();
    if (!first && !last) return;
    const { data: person } = await ctx.supabase
      .from("tour_personnel")
      .insert({
        tour_id: tourId,
        first_name: first || null,
        last_name: last || null,
        role: role || null,
      })
      .select("id")
      .single();
    revalidatePath(`/o/${orgSlug}/t/${tourId}/personnel`);
    // direct pe profil — acolo se setează prețul, datele, poza [cererea userului]
    if (person) redirect(`/o/${orgSlug}/t/${tourId}/personnel/${person.id}`);
  }

  type Person = {
    id: string;
    first_name: string | null;
    last_name: string | null;
    role: string | null;
    company: string | null;
    party: string | null;
    phones: { number?: string }[];
    cost_per_show: number | null;
    cost_currency: string;
    payment_type: string | null;
  };
  const rows = (people ?? []) as Person[];

  const input =
    "h-8 rounded-[8px] border border-hairline px-2.5 text-[12.5px] text-primary placeholder:text-tertiary";

  return (
    <main className="w-full px-8 pb-11">
      <header className="border-b border-hairline pb-5 pt-[26px]">
        <p className="text-[11.5px] text-secondary">
          {t("countLine", { count: rows.length })}
        </p>
        <h1 className="page-title mt-1">{t("title")}</h1>
      </header>

      <div className="mx-auto w-full max-w-[960px] pt-6">
        {rows.length === 0 && (
          <p className="py-6 text-[12.5px] text-tertiary">{t("empty")}</p>
        )}

        <ul>
          {rows.map((person) => {
            const name =
              [person.first_name, person.last_name].filter(Boolean).join(" ") || "—";
            const initials =
              [person.first_name?.[0], person.last_name?.[0]]
                .filter(Boolean)
                .join("")
                .toUpperCase() || "?";
            const phone = person.phones?.[0]?.number ?? null;
            return (
              <li key={person.id}>
                <Link
                  href={`/o/${orgSlug}/t/${tourId}/personnel/${person.id}`}
                  className="grid h-14 grid-cols-[44px_1.3fr_90px_150px_140px_20px] items-center border-b border-faint transition-colors hover:bg-fill-row-hover"
                >
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-avatar font-display text-[9px] font-semibold text-secondary">
                    {initials}
                  </span>
                  <span className="min-w-0 pr-3">
                    <span className="block truncate text-[13px] font-medium text-primary">
                      {name}
                    </span>
                    <span className="block truncate text-[11px] text-secondary">
                      {[person.role, person.company].filter(Boolean).join(" · ") || "—"}
                    </span>
                  </span>
                  <span>
                    {person.party && (
                      <span className="rounded-full border border-hairline bg-fill-control px-2 py-[3px] text-[10px] font-medium text-secondary">
                        {person.party}
                      </span>
                    )}
                  </span>
                  <span className="font-mono text-[11.5px] text-tertiary">{phone ?? "—"}</span>
                  <span className="font-mono text-[11.5px] text-secondary">
                    {canSeeCosts && person.cost_per_show != null
                      ? formatMoney(Number(person.cost_per_show), person.cost_currency ?? "RON")
                      : ""}
                  </span>
                  <ChevronRight size={14} strokeWidth={1.75} className="text-disabled" />
                </Link>
              </li>
            );
          })}
        </ul>

        {canEdit && (
          <form action={addPerson} className="flex flex-wrap items-center gap-2 pt-4">
            <input name="first" placeholder={t("first")} className={`${input} w-36`} />
            <input name="last" placeholder={t("last")} className={`${input} w-36`} />
            <input name="role" placeholder={t("role")} className={`${input} w-44`} />
            <button className="btn-quiet">+ {t("addPerson")}</button>
            <p className="w-full text-[10.5px] text-tertiary">{t("addHint")}</p>
          </form>
        )}
      </div>
    </main>
  );
}
