import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { requireOrg } from "@/lib/org";
import { can } from "@/lib/permissions";
import { PageHeader } from "@/components/ui/PageHeader";
import {
  CrewGlForm,
  GuestListGrid,
  type GlSettings,
  type GuestRow,
} from "./gl-client";

export default async function GuestListPage({
  params,
}: {
  params: Promise<{ orgSlug: string; tourId: string; date: string; eventId: string }>;
}) {
  const { orgSlug, tourId, date, eventId } = await params;
  const { supabase, permission, tier } = await requireOrg(orgSlug);
  const t = await getTranslations("gl");

  const glManage = can({ tier, permission }, "gl_manage");
  const glViewAll = can({ tier, permission }, "gl_view_all");
  const glSubmit = can({ tier, permission }, "gl_submit_request");

  const { data: event } = await supabase
    .from("events")
    .select("id, title, venues(name)")
    .eq("id", eventId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!event) notFound();

  const [
    { data: requests },
    { data: passTypes },
    { data: settings },
    { data: allotments },
  ] = await Promise.all([
    supabase
      .from("guest_list_requests")
      .select("*, guest_request_passes(pass_type_id, quantity)")
      .eq("event_id", eventId)
      .is("deleted_at", null)
      .order("requested_at"),
    supabase
      .from("tour_passes")
      .select("id, name")
      .eq("tour_id", tourId)
      .is("deleted_at", null)
      .order("sort_order")
      .order("created_at"),
    supabase
      .from("event_guest_list_settings")
      .select("cutoff_at, is_locked, tickets_allotment, tickets_enforced")
      .eq("event_id", eventId)
      .maybeSingle(),
    supabase
      .from("event_pass_allotments")
      .select("pass_type_id, num_allowed, enforced")
      .eq("event_id", eventId),
  ]);

  // numele requestor-ilor din profiles
  const requestorIds = [
    ...new Set((requests ?? []).map((r) => r.requested_by).filter(Boolean)),
  ] as string[];
  const { data: profiles } = requestorIds.length
    ? await supabase
        .from("profiles")
        .select("id, first_name, last_name, email")
        .in("id", requestorIds)
    : { data: [] as { id: string; first_name: string | null; last_name: string | null; email: string | null }[] };
  const nameOf = new Map(
    (profiles ?? []).map((p) => [
      p.id,
      [p.first_name, p.last_name].filter(Boolean).join(" ") || (p.email ?? "—"),
    ]),
  );

  const rows: GuestRow[] = (requests ?? []).map((r) => ({
    id: r.id,
    last_name: r.last_name,
    first_name: r.first_name,
    affiliation: r.affiliation,
    num_tickets: r.num_tickets,
    status: r.status,
    pickup: r.pickup,
    priority: r.priority,
    notes: r.notes,
    email_notify: r.email_notify,
    phone: r.phone,
    seat_row: r.seat_row,
    seat: r.seat,
    requested_by: r.requested_by,
    requestor_name: r.requested_by ? (nameOf.get(r.requested_by) ?? "—") : "—",
    requested_at: r.requested_at,
    passes: Object.fromEntries(
      ((r.guest_request_passes ?? []) as { pass_type_id: string; quantity: number }[]).map(
        (p) => [p.pass_type_id, p.quantity],
      ),
    ),
  }));

  const glSettings: GlSettings = settings ?? {
    cutoff_at: null,
    is_locked: false,
    tickets_allotment: null,
    tickets_enforced: false,
  };
  const ctx = { orgSlug, tourId, date, eventId };

  const totalPasses = rows
    .filter((r) => r.status !== "declined")
    .reduce((s, r) => s + r.num_tickets + Object.values(r.passes).reduce((a, b) => a + b, 0), 0);
  const eventName = event.title ?? (event.venues as unknown as { name: string } | null)?.name;

  return (
    <main className="w-full pb-11">
      <PageHeader
        eyebrow={
          <Link
            href={`/o/${orgSlug}/t/${tourId}/d/${date}/e/${eventId}`}
            className="hover:text-primary"
          >
            {eventName} · {t("metaLine", { entries: rows.length, passes: totalPasses })}
          </Link>
        }
        title={t("title")}
      />
      <div className="max-w-[1040px] space-y-4 px-8 pt-4">

      {!glViewAll && !glSubmit ? (
        <p className="text-sm text-secondary">{t("noAccess")}</p>
      ) : glViewAll ? (
        <GuestListGrid
          ctx={ctx}
          rows={rows}
          passTypes={passTypes ?? []}
          settings={glSettings}
          allotments={allotments ?? []}
          canManage={glManage}
          canSubmit={glManage}
        />
      ) : (
        // gl_submit: form simplu + doar requesturile proprii (RLS le filtrează)
        <CrewGlForm ctx={ctx} rows={rows} passTypes={passTypes ?? []} canSubmit={glSubmit} />
      )}

      {/* gl_view_all_submit: vede grid-ul read-only + poate submite */}
      {glViewAll && !glManage && glSubmit && (
        <CrewGlForm
          ctx={ctx}
          rows={rows.filter((r) => r.requested_by !== null)}
          passTypes={passTypes ?? []}
          canSubmit
        />
      )}
      </div>
    </main>
  );
}
