"use server";

import { revalidatePath } from "next/cache";
import { requireOrg } from "@/lib/org";
import { can } from "@/lib/permissions";

async function requireAccounting(orgSlug: string) {
  const ctx = await requireOrg(orgSlug);
  if (!can({ tier: ctx.tier, permission: ctx.permission }, "edit_accounting")) {
    throw new Error("forbidden");
  }
  return ctx;
}

function path(orgSlug: string, tourId: string, date: string, eventId: string) {
  return `/o/${orgSlug}/t/${tourId}/d/${date}/e/${eventId}/accounting`;
}

export async function updateSettlement(
  orgSlug: string,
  tourId: string,
  date: string,
  eventId: string,
  patch: Record<string, string | number | null>,
): Promise<{ error?: string }> {
  const { supabase, user } = await requireAccounting(orgSlug);
  const { error } = await supabase
    .from("settlements")
    .upsert({ event_id: eventId, ...patch, updated_by: user.id }, { onConflict: "event_id" });
  if (error) return { error: error.message };
  revalidatePath(path(orgSlug, tourId, date, eventId));
  return {};
}

export async function upsertTicketSale(
  orgSlug: string,
  tourId: string,
  date: string,
  eventId: string,
  input: {
    id?: string;
    label: string;
    capacity: number | null;
    comps: number;
    kills: number;
    scans: number;
    sold: number;
    grossPrice: number | null;
  },
): Promise<{ error?: string }> {
  const { supabase } = await requireAccounting(orgSlug);
  // settlement-ul părinte trebuie să existe
  await supabase.from("settlements").upsert({ event_id: eventId }, { onConflict: "event_id" });
  const row = {
    settlement_id: eventId,
    label: input.label.trim() || "GA",
    capacity: input.capacity,
    comps: input.comps,
    kills: input.kills,
    scans: input.scans,
    sold: input.sold,
    gross_price: input.grossPrice,
  };
  const { error } = input.id
    ? await supabase.from("ticket_sales").update(row).eq("id", input.id)
    : await supabase.from("ticket_sales").insert(row);
  if (error) return { error: error.message };
  revalidatePath(path(orgSlug, tourId, date, eventId));
  return {};
}

export async function deleteTicketSale(
  orgSlug: string,
  tourId: string,
  date: string,
  eventId: string,
  id: string,
): Promise<{ error?: string }> {
  const { supabase } = await requireAccounting(orgSlug);
  const { error } = await supabase.from("ticket_sales").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidatePath(path(orgSlug, tourId, date, eventId));
  return {};
}

export async function upsertExpense(
  orgSlug: string,
  tourId: string,
  date: string,
  eventId: string,
  input: {
    id?: string;
    stage: "pre_split" | "post_split" | "withholding";
    label: string;
    formula: string;
    amount: number | null;
  },
): Promise<{ error?: string }> {
  const { supabase } = await requireAccounting(orgSlug);
  await supabase.from("settlements").upsert({ event_id: eventId }, { onConflict: "event_id" });
  const row = {
    settlement_id: eventId,
    stage: input.stage,
    label: input.label.trim(),
    formula: input.formula.trim() || null,
    amount: input.amount,
  };
  const { error } = input.id
    ? await supabase.from("settlement_expenses").update(row).eq("id", input.id)
    : await supabase.from("settlement_expenses").insert(row);
  if (error) return { error: error.message };
  revalidatePath(path(orgSlug, tourId, date, eventId));
  return {};
}

export async function deleteExpense(
  orgSlug: string,
  tourId: string,
  date: string,
  eventId: string,
  id: string,
): Promise<{ error?: string }> {
  const { supabase } = await requireAccounting(orgSlug);
  const { error } = await supabase.from("settlement_expenses").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidatePath(path(orgSlug, tourId, date, eventId));
  return {};
}

export async function upsertLineItem(
  orgSlug: string,
  tourId: string,
  date: string,
  eventId: string,
  input: {
    id?: string;
    category: string;
    description: string;
    income: number;
    expense: number;
  },
): Promise<{ error?: string }> {
  const { supabase } = await requireAccounting(orgSlug);
  const row = {
    event_id: eventId,
    category: input.category.trim() || null,
    description: input.description.trim() || null,
    income: input.income,
    expense: input.expense,
  };
  const { error } = input.id
    ? await supabase.from("non_settlement_items").update(row).eq("id", input.id)
    : await supabase.from("non_settlement_items").insert(row);
  if (error) return { error: error.message };
  revalidatePath(path(orgSlug, tourId, date, eventId));
  return {};
}

export async function deleteLineItem(
  orgSlug: string,
  tourId: string,
  date: string,
  eventId: string,
  id: string,
): Promise<{ error?: string }> {
  const { supabase } = await requireAccounting(orgSlug);
  const { error } = await supabase.from("non_settlement_items").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidatePath(path(orgSlug, tourId, date, eventId));
  return {};
}

/** Copy From Another Event [C]: copiază settlement + expenses + tickets. */
export async function copyFromEvent(
  orgSlug: string,
  tourId: string,
  date: string,
  eventId: string,
  sourceEventId: string,
): Promise<{ error?: string }> {
  const { supabase, user } = await requireAccounting(orgSlug);

  const [{ data: source }, { data: expenses }, { data: tickets }] = await Promise.all([
    supabase.from("settlements").select("*").eq("event_id", sourceEventId).maybeSingle(),
    supabase
      .from("settlement_expenses")
      .select("stage, label, formula, amount, sort_order")
      .eq("settlement_id", sourceEventId),
    supabase
      .from("ticket_sales")
      .select("label, capacity, comps, kills, scans, sold, gross_price, net_price, sort_order")
      .eq("settlement_id", sourceEventId),
  ]);
  if (!source) return { error: "source_not_found" };

  const {
    event_id: _e,
    created_at: _c,
    updated_at: _u,
    finalized_at: _f,
    ...fields
  } = source;
  void _e; void _c; void _u; void _f;
  const { error } = await supabase
    .from("settlements")
    .upsert({ ...fields, event_id: eventId, updated_by: user.id }, { onConflict: "event_id" });
  if (error) return { error: error.message };

  await supabase.from("settlement_expenses").delete().eq("settlement_id", eventId);
  await supabase.from("ticket_sales").delete().eq("settlement_id", eventId);
  if (expenses && expenses.length > 0) {
    await supabase
      .from("settlement_expenses")
      .insert(expenses.map((x) => ({ ...x, settlement_id: eventId })));
  }
  if (tickets && tickets.length > 0) {
    await supabase
      .from("ticket_sales")
      .insert(tickets.map((x) => ({ ...x, settlement_id: eventId })));
  }

  revalidatePath(path(orgSlug, tourId, date, eventId));
  return {};
}
