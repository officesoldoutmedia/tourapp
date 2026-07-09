import { notFound } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { requireOrg } from "@/lib/org";
import { can } from "@/lib/permissions";
import { Trash2 } from "lucide-react";

/** Tour Personnel [C-S] — grid-ul MT: Last/First/Role/Title/Company/Phone/Email. */
export default async function PersonnelPage({
  params,
}: {
  params: Promise<{ orgSlug: string; tourId: string }>;
}) {
  const { orgSlug, tourId } = await params;
  const { supabase, org, permission, tier } = await requireOrg(orgSlug);
  const t = await getTranslations("personnel");
  const tc = await getTranslations("common");
  const canEdit = can({ tier, permission }, "edit_tour_content");
  const canSeeCosts = can({ tier, permission }, "view_accounting");

  const [{ data: tour }, { data: people }, { data: contacts }] = await Promise.all([
    supabase.from("tours").select("id, name").eq("id", tourId).is("deleted_at", null).maybeSingle(),
    supabase
      .from("tour_personnel")
      .select("id, first_name, last_name, role, title, company, party, phones, emails, cost_per_show, cost_currency, payment_type")
      .eq("tour_id", tourId)
      .is("deleted_at", null)
      .order("last_name"),
    supabase
      .from("contacts")
      .select("id, first_name, last_name, role, phone, email")
      .eq("organization_id", org.id)
      .is("deleted_at", null)
      .order("last_name"),
  ]);
  if (!tour) notFound();

  const path = `/o/${orgSlug}/t/${tourId}/personnel`;

  async function savePerson(formData: FormData) {
    "use server";
    const { supabase } = await requireOrg(orgSlug);
    const id = String(formData.get("id") ?? "");
    const phone = String(formData.get("phone") ?? "").trim();
    const email = String(formData.get("email") ?? "").trim();
    const row = {
      last_name: String(formData.get("last") ?? "").trim() || null,
      first_name: String(formData.get("first") ?? "").trim() || null,
      role: String(formData.get("role") ?? "").trim() || null,
      title: String(formData.get("title") ?? "").trim() || null,
      company: String(formData.get("company") ?? "").trim() || null,
      party: String(formData.get("party") ?? "").trim() || null,
      phones: phone ? [{ number: phone }] : [],
      emails: email ? [{ email }] : [],
    };
    if (!row.last_name && !row.first_name) return;
    if (formData.has("cost")) {
      Object.assign(row, {
        cost_per_show: Number(formData.get("cost")) || null,
        cost_currency: String(formData.get("costCurrency") ?? "RON") || "RON",
        payment_type: String(formData.get("paymentType") ?? "") || null,
      });
    }
    if (id) await supabase.from("tour_personnel").update(row).eq("id", id);
    else await supabase.from("tour_personnel").insert({ ...row, tour_id: tourId });
    revalidatePath(path);
  }

  async function addFromContact(formData: FormData) {
    "use server";
    const { supabase } = await requireOrg(orgSlug);
    const contactId = String(formData.get("contactId") ?? "");
    if (!contactId) return;
    const { data: c } = await supabase
      .from("contacts")
      .select("first_name, last_name, role, phone, email")
      .eq("id", contactId)
      .maybeSingle();
    if (!c) return;
    await supabase.from("tour_personnel").insert({
      tour_id: tourId,
      contact_id: contactId,
      first_name: c.first_name,
      last_name: c.last_name,
      role: c.role,
      phones: c.phone ? [{ number: c.phone }] : [],
      emails: c.email ? [{ email: c.email }] : [],
    });
    revalidatePath(path);
  }

  async function removePerson(formData: FormData) {
    "use server";
    const { supabase } = await requireOrg(orgSlug);
    await supabase
      .from("tour_personnel")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", String(formData.get("id")));
    revalidatePath(path);
  }

  type Person = {
    id: string;
    first_name: string | null;
    last_name: string | null;
    role: string | null;
    title: string | null;
    company: string | null;
    party: string | null;
    phones: { number?: string }[];
    emails: { email?: string }[];
    cost_per_show: number | null;
    cost_currency: string;
    payment_type: string | null;
  };

  const cell = "rounded border border-hairline px-2 py-1 text-sm";
  // layout fluid — câmpurile curg pe 2 rânduri, FĂRĂ scroll orizontal
  const COLS = [
    ["last", t("last"), "w-24"],
    ["first", t("first"), "w-24"],
    ["role", t("role"), "w-27"],
    ["title", t("jobTitle"), "w-20"],
    ["company", t("company"), "w-24"],
    ["phone", t("phone"), "w-30"],
    ["email", t("email"), "w-36"],
    ["party", t("party"), "w-13"],
  ] as const;

  return (
    <main className="w-full space-y-6 p-6">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="font-display text-xl font-semibold tracking-tight">
          {t("title")} <span className="font-normal text-tertiary">· {tour.name}</span>
        </h1>
        {canEdit && (contacts ?? []).length > 0 && (
          <form action={addFromContact} className="flex items-center gap-2">
            <select name="contactId" required defaultValue="" className="rounded border border-hairline px-2 py-1.5 text-sm">
              <option value="" disabled>
                {t("addExistingContact")}
              </option>
              {(contacts ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {[c.last_name, c.first_name].filter(Boolean).join(", ")}
                  {c.role ? ` — ${c.role}` : ""}
                </option>
              ))}
            </select>
            <button className="rounded bg-accent hover:bg-accent-hover px-3 py-1.5 text-sm font-medium text-white">
              + {tc("add")}
            </button>
          </form>
        )}
      </header>

      <div className="rounded-lg border border-hairline bg-surface shadow-xs">
        {(people ?? []).length === 0 && (
          <p className="px-4 py-4 text-sm text-tertiary">{t("empty")}</p>
        )}

        {((people ?? []) as Person[]).map((p) => (
          <form
            key={p.id}
            action={savePerson}
            className="flex flex-wrap items-center gap-1.5 border-b border-hairline px-3 py-2 last:border-0"
          >
            <input type="hidden" name="id" value={p.id} />
            <input name="last" defaultValue={p.last_name ?? ""} placeholder={t("last")} title={t("last")} disabled={!canEdit} className={`${cell} w-24 font-medium`} />
            <input name="first" defaultValue={p.first_name ?? ""} placeholder={t("first")} title={t("first")} disabled={!canEdit} className={`${cell} w-24`} />
            <input name="role" defaultValue={p.role ?? ""} placeholder={t("role")} title={t("role")} disabled={!canEdit} className={`${cell} w-27`} />
            <input name="title" defaultValue={p.title ?? ""} placeholder={t("jobTitle")} title={t("jobTitle")} disabled={!canEdit} className={`${cell} w-20`} />
            <input name="company" defaultValue={p.company ?? ""} placeholder={t("company")} title={t("company")} disabled={!canEdit} className={`${cell} w-24`} />
            <input name="phone" defaultValue={p.phones?.[0]?.number ?? ""} placeholder={t("phone")} title={t("phone")} disabled={!canEdit} className={`${cell} w-30 font-mono`} />
            <input name="email" defaultValue={p.emails?.[0]?.email ?? ""} placeholder={t("email")} title={t("email")} disabled={!canEdit} className={`${cell} min-w-36 flex-1`} />
            <input name="party" defaultValue={p.party ?? ""} placeholder={t("party")} title={t("party")} disabled={!canEdit} className={`${cell} w-13`} />
            {canSeeCosts && (
              <>
                <input name="cost" type="number" step="0.01" defaultValue={p.cost_per_show ?? ""} placeholder={t("costPerShow")} title={t("costPerShow")} disabled={!canEdit} className={`${cell} w-20 text-right font-mono`} />
                <select name="costCurrency" defaultValue={p.cost_currency ?? "RON"} title={t("currency")} disabled={!canEdit} className={`${cell} font-mono`}>
                  {["RON", "EUR", "USD", "GBP"].map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
                <select name="paymentType" defaultValue={p.payment_type ?? ""} title={t("paymentType")} disabled={!canEdit} className={cell}>
                  <option value="">—</option>
                  <option value="company">{t("company")}</option>
                  <option value="individual">{t("individual")}</option>
                </select>
              </>
            )}
            {canEdit && (
              <span className="ml-auto flex items-center gap-1">
                <button title={tc("save")} className="rounded px-1.5 py-1 text-xs text-accent hover:bg-accent-subtle">✓</button>
                <button formAction={removePerson} title={tc("delete")} className="rounded p-1 text-danger hover:bg-danger-subtle">
                  <Trash2 size={13} strokeWidth={1.5} />
                </button>
              </span>
            )}
          </form>
        ))}

        {canEdit && (
          <form
            action={savePerson}
            className="flex flex-wrap items-center gap-1.5 border-t border-hairline bg-subtle/50 px-3 py-2"
          >
            {COLS.map(([name, label, width]) => (
              <input
                key={name}
                name={name}
                placeholder={label}
                title={label}
                className={`${cell} ${width} ${name === "phone" ? "font-mono" : ""} ${name === "email" ? "min-w-0 flex-1" : ""}`}
              />
            ))}
            {canSeeCosts && (
              <>
                <input name="cost" type="number" step="0.01" placeholder={t("costPerShow")} title={t("costPerShow")} className={`${cell} w-20 text-right font-mono`} />
                <select name="costCurrency" defaultValue="RON" title={t("currency")} className={`${cell} font-mono`}>
                  {["RON", "EUR", "USD", "GBP"].map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
                <select name="paymentType" defaultValue="" title={t("paymentType")} className={cell}>
                  <option value="">—</option>
                  <option value="company">{t("company")}</option>
                  <option value="individual">{t("individual")}</option>
                </select>
              </>
            )}
            <button className="ml-auto rounded bg-accent hover:bg-accent-hover px-3 py-1 text-sm font-medium text-white">
              + {tc("add")}
            </button>
          </form>
        )}
      </div>
    </main>
  );
}
