"use server";

import { revalidatePath } from "next/cache";
import { requireOrg } from "@/lib/org";
import { can, type Capability } from "@/lib/permissions";
import { sendGuestApprovalEmail } from "@/lib/email";

async function requireGl(orgSlug: string, capability: Capability) {
  const ctx = await requireOrg(orgSlug);
  if (!can({ tier: ctx.tier, permission: ctx.permission }, capability)) {
    throw new Error("forbidden");
  }
  return ctx;
}

function glPath(orgSlug: string, tourId: string, date: string, eventId: string) {
  return `/o/${orgSlug}/t/${tourId}/d/${date}/e/${eventId}/guest-list`;
}

export interface GuestRequestInput {
  id?: string;
  lastName: string;
  firstName: string;
  affiliation: string;
  numTickets: number;
  pickup: string; // '' | will_call | box_office | venue | other
  priority: boolean;
  notes: string;
  emailNotify: string;
  phone: string;
  seatRow?: string;
  seat?: string;
  /** pass_type_id → cantitate */
  passes: Record<string, number>;
}

export async function upsertGuestRequest(
  orgSlug: string,
  tourId: string,
  date: string,
  eventId: string,
  input: GuestRequestInput,
): Promise<{ error?: string }> {
  const { supabase, user } = await requireGl(orgSlug, "gl_submit_request");
  if (!input.lastName.trim()) return { error: "last_name_required" };

  const row = {
    event_id: eventId,
    last_name: input.lastName.trim(),
    first_name: input.firstName.trim() || null,
    affiliation: input.affiliation.trim() || null,
    num_tickets: input.numTickets || 0,
    pickup: input.pickup || null,
    priority: input.priority,
    notes: input.notes || null,
    email_notify: input.emailNotify.trim() || null,
    phone: input.phone.trim() || null,
    seat_row: input.seatRow?.trim() || null,
    seat: input.seat?.trim() || null,
  };

  let requestId = input.id;
  if (requestId) {
    const { error } = await supabase
      .from("guest_list_requests")
      .update(row)
      .eq("id", requestId);
    if (error) return { error: error.message };
  } else {
    const { data, error } = await supabase
      .from("guest_list_requests")
      .insert({ ...row, requested_by: user.id })
      .select("id")
      .single();
    if (error || !data) return { error: error?.message ?? "insert_failed" };
    requestId = data.id;
  }

  // passes: sincronizare simplă (delete + insert cantități > 0)
  const { error: delError } = await supabase
    .from("guest_request_passes")
    .delete()
    .eq("request_id", requestId);
  if (delError) return { error: delError.message };
  const passRows = Object.entries(input.passes)
    .filter(([, qty]) => qty > 0)
    .map(([passId, qty]) => ({
      request_id: requestId,
      pass_type_id: passId,
      quantity: qty,
    }));
  if (passRows.length > 0) {
    const { error } = await supabase.from("guest_request_passes").insert(passRows);
    if (error) return { error: error.message };
  }

  revalidatePath(glPath(orgSlug, tourId, date, eventId));
  return {};
}

/**
 * Schimbare de status (single sau bulk) [C]. La approved → email automat
 * dacă toggle-ul org-ului e ON și requestul are Email Notify [C §6.9.1].
 */
export async function setGuestStatus(
  orgSlug: string,
  tourId: string,
  date: string,
  eventId: string,
  requestIds: string[],
  status: "pending" | "approved" | "declined",
): Promise<{ error?: string }> {
  const { supabase, org } = await requireGl(orgSlug, "gl_manage");
  if (requestIds.length === 0) return {};

  const { error } = await supabase
    .from("guest_list_requests")
    .update({ status })
    .in("id", requestIds);
  if (error) return { error: error.message };

  if (status === "approved") {
    // [D→DECISIONS] default ON dacă toggle-ul nu e setat
    const settings = (org.settings ?? {}) as Record<string, unknown>;
    const emailsOn = settings.guest_list_approval_emails !== false;
    if (emailsOn) {
      const [{ data: requests }, { data: event }] = await Promise.all([
        supabase
          .from("guest_list_requests")
          .select(
            "id, first_name, last_name, num_tickets, email_notify, guest_request_passes(quantity, tour_passes(name))",
          )
          .in("id", requestIds)
          .not("email_notify", "is", null),
        supabase
          .from("events")
          .select("title, venues(name)")
          .eq("id", eventId)
          .single(),
      ]);
      const eventTitle =
        event?.title ??
        (event?.venues as unknown as { name: string } | null)?.name ??
        "Show";
      for (const request of requests ?? []) {
        if (!request.email_notify) continue;
        await sendGuestApprovalEmail({
          to: request.email_notify,
          guestName: [request.first_name, request.last_name].filter(Boolean).join(" "),
          eventTitle,
          eventDate: date,
          numTickets: request.num_tickets,
          passes: (
            (request.guest_request_passes ?? []) as unknown as {
              quantity: number;
              tour_passes: { name: string } | null;
            }[]
          ).map((p) => ({ name: p.tour_passes?.name ?? "Pass", quantity: p.quantity })),
        });
      }
    }
  }

  revalidatePath(glPath(orgSlug, tourId, date, eventId));
  return {};
}

export async function deleteGuestRequests(
  orgSlug: string,
  tourId: string,
  date: string,
  eventId: string,
  requestIds: string[],
): Promise<{ error?: string }> {
  const { supabase } = await requireGl(orgSlug, "gl_submit_request");
  const { error } = await supabase
    .from("guest_list_requests")
    .update({ deleted_at: new Date().toISOString() })
    .in("id", requestIds);
  if (error) return { error: error.message };
  revalidatePath(glPath(orgSlug, tourId, date, eventId));
  return {};
}

export async function updateGlSettings(
  orgSlug: string,
  tourId: string,
  date: string,
  eventId: string,
  patch: {
    cutoffAt?: string | null; // ISO sau null
    isLocked?: boolean;
    ticketsAllotment?: number | null;
    ticketsEnforced?: boolean;
  },
): Promise<{ error?: string }> {
  const { supabase } = await requireGl(orgSlug, "gl_manage");
  const row: Record<string, unknown> = { event_id: eventId };
  if ("cutoffAt" in patch) row.cutoff_at = patch.cutoffAt;
  if ("isLocked" in patch) row.is_locked = patch.isLocked;
  if ("ticketsAllotment" in patch) row.tickets_allotment = patch.ticketsAllotment;
  if ("ticketsEnforced" in patch) row.tickets_enforced = patch.ticketsEnforced;

  const { error } = await supabase
    .from("event_guest_list_settings")
    .upsert(row, { onConflict: "event_id" });
  if (error) return { error: error.message };
  revalidatePath(glPath(orgSlug, tourId, date, eventId));
  return {};
}

export async function upsertPassAllotment(
  orgSlug: string,
  tourId: string,
  date: string,
  eventId: string,
  passTypeId: string,
  numAllowed: number | null,
  enforced: boolean,
): Promise<{ error?: string }> {
  const { supabase } = await requireGl(orgSlug, "gl_manage");
  if (numAllowed === null) {
    const { error } = await supabase
      .from("event_pass_allotments")
      .delete()
      .eq("event_id", eventId)
      .eq("pass_type_id", passTypeId);
    if (error) return { error: error.message };
  } else {
    const { error } = await supabase
      .from("event_pass_allotments")
      .upsert(
        { event_id: eventId, pass_type_id: passTypeId, num_allowed: numAllowed, enforced },
        { onConflict: "event_id,pass_type_id" },
      );
    if (error) return { error: error.message };
  }
  revalidatePath(glPath(orgSlug, tourId, date, eventId));
  return {};
}
