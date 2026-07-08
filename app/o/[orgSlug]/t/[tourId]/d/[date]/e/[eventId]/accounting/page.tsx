import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { requireOrg } from "@/lib/org";
import { can } from "@/lib/permissions";
import {
  AccountingClient,
  type ExpenseRow,
  type LineItemRow,
  type SettlementRow,
  type TicketRow,
} from "./accounting-client";

export default async function AccountingPage({
  params,
}: {
  params: Promise<{ orgSlug: string; tourId: string; date: string; eventId: string }>;
}) {
  const { orgSlug, tourId, date, eventId } = await params;
  const { supabase, permission, tier } = await requireOrg(orgSlug);
  const t = await getTranslations("accounting");

  // guard: admin|accounting [C §4.2]
  if (!can({ tier, permission }, "view_accounting")) notFound();
  const canEdit = can({ tier, permission }, "edit_accounting");

  const { data: event } = await supabase
    .from("events")
    .select("id, title, venues(name)")
    .eq("id", eventId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!event) notFound();

  const [
    { data: settlement },
    { data: tickets },
    { data: expenses },
    { data: lineItems },
    { data: siblingEvents },
  ] = await Promise.all([
    supabase.from("settlements").select("*").eq("event_id", eventId).maybeSingle(),
    supabase
      .from("ticket_sales")
      .select("id, label, capacity, comps, kills, scans, sold, gross_price")
      .eq("settlement_id", eventId)
      .order("sort_order")
      .order("created_at"),
    supabase
      .from("settlement_expenses")
      .select("id, stage, label, formula, amount")
      .eq("settlement_id", eventId)
      .order("sort_order")
      .order("created_at"),
    supabase
      .from("non_settlement_items")
      .select("id, category, description, income, expense")
      .eq("event_id", eventId)
      .order("sort_order")
      .order("created_at"),
    // Copy From Another Event [C]: alte events din tur cu settlement
    supabase
      .from("settlements")
      .select("event_id, events!inner(title, venues(name), days!inner(date, tour_id))")
      .eq("events.days.tour_id", tourId)
      .neq("event_id", eventId),
  ]);

  const defaults: SettlementRow = {
    currency: "EUR",
    deal_type: "vs_split",
    guarantee: null,
    split_percent_artist: null,
    venue_capacity: null,
    tickets_sold: null,
    comps: null,
    gross_ticket_sales: null,
    taxes_fees: null,
    total_expenses: null,
    overage: null,
    production_reimbursements: null,
    additional_chargebacks: null,
    deposit: null,
    withholding: null,
    cash: null,
    ticket_buys: null,
    night_of_show_deductions: null,
    total_merch_sales: null,
  };

  return (
    <main className="mx-auto w-full max-w-4xl space-y-4 p-6">
      <header>
        <Link
          href={`/o/${orgSlug}/t/${tourId}/d/${date}/e/${eventId}`}
          className="text-xs text-neutral-500 hover:underline"
        >
          ← {event.title ?? (event.venues as unknown as { name: string } | null)?.name}
        </Link>
        <h1 className="text-xl font-semibold">{t("title")}</h1>
      </header>

      <AccountingClient
        ctx={{ orgSlug, tourId, date, eventId }}
        settlement={(settlement as SettlementRow | null) ?? defaults}
        tickets={(tickets ?? []) as TicketRow[]}
        expenses={(expenses ?? []) as ExpenseRow[]}
        lineItems={(lineItems ?? []) as LineItemRow[]}
        otherEvents={(siblingEvents ?? []).map((s) => {
          const ev = s.events as unknown as {
            title: string | null;
            venues: { name: string } | null;
            days: { date: string };
          };
          return {
            id: s.event_id,
            label: `${ev.days.date} — ${ev.title ?? ev.venues?.name ?? "Event"}`,
          };
        })}
        canEdit={canEdit}
      />
    </main>
  );
}
