"use server";

/** C3 — generarea documentelor de contract (dry-run + blocare cu lista
 *  lipsurilor §13.3, numerotare atomică pe serie, snapshot imutabil),
 *  statusuri și upload-ul semnatului (→ attachment în categoria Admin
 *  pe ziua show-ului, pentru anexe). */
import { revalidatePath } from "next/cache";
import { requireOrg } from "@/lib/org";
import { can } from "@/lib/permissions";
import {
  collectMergeValues,
  fillTemplate,
  type ContractBlock,
  type ContractSnapshot,
} from "@/lib/contractMerge";
import { findShowSlot } from "@/lib/scheduleGeneration";
import { formatTimeInZone } from "@/lib/datetime";

// Gate-ul TS de aici e "edit_accounting" (administrator + accounting), dar
// scrierile efective (insert pe contract_documents/attachments, upload-ul
// semnatului în storage) trec prin RLS-ul "private.can_edit_tour_content",
// care e un RANK check: has_min_permission(org, 'manager') ⇒ rank(member)
// <= rank('manager'). Cu administrator=1, accounting=2, manager=3
// (00002_rls_foundation.sql), accounting (rank 2) trece pragul de manager
// (rank 3) — deci utilizatorii accounting POT insera attachments/urca în
// storage, deși TS `can(..., "edit_tour_content")` îi exclude explicit.
// Divergența e LOAD-BEARING: dacă "reparăm" oglinda SQL ca să reflecte
// exact TS (blocând accounting), generarea/upload-ul semnat pentru
// accounting se rupe la RLS, chiar dacă gate-ul TS de mai jos le permite.
async function requireAccounting(orgSlug: string) {
  const ctx = await requireOrg(orgSlug);
  if (!can({ tier: ctx.tier, permission: ctx.permission }, "edit_accounting")) {
    throw new Error("forbidden");
  }
  return ctx;
}

/** Rândul complet de template folosit de generare și de UI-uri
 *  (satisface MatchableTemplate din lib/contractMerge). */
export interface TemplateRow {
  id: string;
  name: string;
  doc_kind: string;
  body: ContractBlock[];
  match_role: string | null;
  match_entity_type: string | null;
  issuing_entity_id: string | null;
  series_prefix: string;
  series_next: number;
  sort_order: number;
}

export async function generateContractDocument(
  orgSlug: string,
  input: {
    kind: "framework" | "annex";
    crewEntityId: string;
    templateId: string;
    eventId?: string;
    personnelId?: string;
  },
): Promise<{ error?: string; missing?: string[]; documentId?: string }> {
  const { supabase, org, user } = await requireAccounting(orgSlug);

  const [{ data: template }, { data: entity }] = await Promise.all([
    supabase
      .from("contract_templates")
      .select("id, name, doc_kind, body, issuing_entity_id, series_prefix, series_next")
      .eq("id", input.templateId)
      .eq("organization_id", org.id)
      .is("deleted_at", null)
      .maybeSingle(),
    supabase
      .from("crew_entities")
      .select("*")
      .eq("id", input.crewEntityId)
      .eq("organization_id", org.id)
      .is("deleted_at", null)
      .maybeSingle(),
  ]);
  if (!template || template.doc_kind !== input.kind || !entity) {
    return { error: "not_found" };
  }

  // anexa cere event; refolosește documentul viu (anti-dublură)
  if (input.kind === "annex") {
    if (!input.eventId) return { error: "invalid" };
    const { data: existing } = await supabase
      .from("contract_documents")
      .select("id")
      .eq("crew_entity_id", input.crewEntityId)
      .eq("event_id", input.eventId)
      .eq("kind", "annex")
      .neq("status", "void")
      .is("deleted_at", null)
      .maybeSingle();
    if (existing) return { documentId: existing.id };
  }

  const { data: issuing } = template.issuing_entity_id
    ? await supabase
        .from("issuing_entities")
        .select("name, cui, reg_com, address, iban, bank, representative")
        .eq("id", template.issuing_entity_id)
        .eq("organization_id", org.id)
        .is("deleted_at", null)
        .maybeSingle()
    : { data: null };

  // datele event-ului (doar anexe): lanțul event→day→tour→artist + venue
  let eventValues = null;
  let fee: { amount: number | null; currency: string | null } = { amount: null, currency: null };
  let role: string | null = null;
  if (input.kind === "annex" && input.eventId) {
    const { data: ev } = await supabase
      .from("events")
      .select(
        "id, title, day_id, venues(name), days!inner(id, date, city, country, timezone, tours!inner(artists(name)))",
      )
      .eq("id", input.eventId)
      .is("deleted_at", null)
      .maybeSingle();
    if (!ev) return { error: "not_found" };
    const day = ev.days as unknown as {
      id: string; date: string; city: string | null; country: string | null;
      timezone: string | null;
      tours: { artists: { name: string } | null };
    };
    const { data: dayItems } = await supabase
      .from("schedule_items")
      .select("id, title, start_at")
      .eq("day_id", day.id)
      .is("deleted_at", null)
      .order("start_at", { ascending: true, nullsFirst: false });
    const show = findShowSlot(dayItems ?? []);
    eventValues = {
      name: ev.title,
      date: day.date,
      city: day.city,
      country: day.country,
      venue: (ev.venues as unknown as { name: string } | null)?.name ?? null,
      stage_time: show?.start_at
        ? formatTimeInZone(new Date(show.start_at), day.timezone ?? "UTC")
        : null,
      artist: day.tours?.artists?.name ?? null,
    };
    // fee: linia de cost crew a persoanei pe event → fallback default_rate
    if (input.personnelId) {
      const { data: cost } = await supabase
        .from("show_costs")
        .select("amount, currency")
        .eq("event_id", input.eventId)
        .eq("personnel_id", input.personnelId)
        .is("deleted_at", null)
        .maybeSingle();
      if (cost && Number(cost.amount) > 0) {
        fee = { amount: Number(cost.amount), currency: cost.currency };
      }
      const { data: person } = await supabase
        .from("tour_personnel")
        .select("role")
        .eq("id", input.personnelId)
        .maybeSingle();
      role = person?.role ?? null;
    }
    if (fee.amount == null && entity.default_rate != null && Number(entity.default_rate) > 0) {
      fee = { amount: Number(entity.default_rate), currency: entity.rate_currency };
    }
  }

  // referința contractului-cadru: ultimul semnat al entității,
  // preferat cel valabil la data event-ului
  let frameworkRef: string | null = null;
  if (input.kind === "annex") {
    const { data: frameworks } = await supabase
      .from("contract_documents")
      .select("doc_number, valid_until, created_at")
      .eq("crew_entity_id", input.crewEntityId)
      .eq("kind", "framework")
      .eq("status", "signed")
      .is("deleted_at", null)
      .order("created_at", { ascending: false });
    const eventDate = eventValues?.date ?? null;
    const valid = (frameworks ?? []).find(
      (f) => !eventDate || !f.valid_until || f.valid_until >= eventDate,
    );
    frameworkRef = valid?.doc_number ?? (frameworks ?? [])[0]?.doc_number ?? null;
  }

  const language = (entity.doc_language === "en" ? "en" : entity.doc_language === "bi" ? "ro" : "ro") as "ro" | "en";
  const today = new Date().toISOString().slice(0, 10);

  // dry-run FĂRĂ număr: numărul se emite doar dacă totul e complet
  const probeValues = collectMergeValues({
    issuing,
    entity,
    role,
    event: eventValues,
    fee,
    doc: { number: "PROBE", date: today, frameworkRef, language },
  });
  const body = (template.body ?? []) as ContractBlock[];
  // template fără niciun bloc de conținut e salvabil în editor (T5), dar
  // ar genera un document "gol" (fillTemplate nu are ce marca unresolved)
  // — blocat explicit, ca să nu ardem un număr de serie pe nimic.
  if (body.length === 0) return { error: "invalid" };
  const { unresolved } = fillTemplate(body, probeValues);
  const missing = unresolved.filter((k) => k !== "doc.number");
  if (missing.length > 0) return { missing };

  // numărul: increment atomic pe serie
  const { data: bumped } = await supabase
    .from("contract_templates")
    .update({ series_next: template.series_next + 1 })
    .eq("id", template.id)
    .eq("series_next", template.series_next) // optimistic lock
    .select("series_prefix")
    .maybeSingle();
  if (!bumped) return { error: "series_conflict" }; // re-încearcă din UI
  const docNumber = `${bumped.series_prefix}${String(template.series_next).padStart(4, "0")}`;

  const values = { ...probeValues, "doc.number": docNumber };
  const { blocks } = fillTemplate(body, values);
  const snapshot: ContractSnapshot = {
    title: template.name,
    language,
    values,
    blocks,
  };

  const { data: inserted, error } = await supabase
    .from("contract_documents")
    .insert({
      organization_id: org.id,
      kind: input.kind,
      crew_entity_id: input.crewEntityId,
      template_id: template.id,
      issuing_entity_id: template.issuing_entity_id,
      event_id: input.eventId ?? null,
      doc_number: docNumber,
      merge_snapshot: snapshot,
      status: "generated",
      created_by: user.id,
    })
    .select("id")
    .single();
  if (error) return { error: error.message };
  return { documentId: inserted.id };
}

export async function setContractStatus(
  orgSlug: string,
  documentId: string,
  status: "sent" | "void",
  revalidate: string,
): Promise<{ error?: string }> {
  const { supabase, org } = await requireAccounting(orgSlug);
  const { error } = await supabase
    .from("contract_documents")
    .update({ status })
    .eq("id", documentId)
    .eq("organization_id", org.id)
    .is("deleted_at", null);
  if (error) return { error: error.message };
  revalidatePath(revalidate);
  return {};
}

export async function recordSignedContract(
  orgSlug: string,
  documentId: string,
  file: { storagePath: string; fileName: string; mimeType: string; sizeBytes: number },
  revalidate: string,
): Promise<{ error?: string; attachmentError?: string }> {
  const { supabase, org, user } = await requireAccounting(orgSlug);
  const { data: doc } = await supabase
    .from("contract_documents")
    .select("id, kind, event_id")
    .eq("id", documentId)
    .eq("organization_id", org.id)
    .is("deleted_at", null)
    .maybeSingle();
  if (!doc) return { error: "not_found" };

  const { error } = await supabase
    .from("contract_documents")
    .update({ status: "signed", signed_storage_path: file.storagePath })
    .eq("id", doc.id);
  if (error) return { error: error.message };

  // anexă cu event → semnatul devine fișier REAL în categoria Admin pe zi;
  // status-ul de mai sus a fost deja scris, deci un eșec aici NU retrage
  // succesul principal — e semnalat separat, ca succes parțial.
  let attachmentError: string | undefined;
  if (doc.kind === "annex" && doc.event_id) {
    const [{ data: ev }, { data: adminCat }] = await Promise.all([
      supabase
        .from("events")
        .select("day_id")
        .eq("id", doc.event_id)
        .maybeSingle(),
      supabase
        .from("file_categories")
        .select("id")
        .eq("organization_id", org.id)
        .eq("name", "Admin")
        .is("deleted_at", null)
        .maybeSingle(),
    ]);
    if (ev?.day_id) {
      const { error: insertError } = await supabase.from("attachments").insert({
        organization_id: org.id,
        parent_type: "day",
        parent_id: ev.day_id,
        file_name: file.fileName,
        storage_path: file.storagePath,
        mime_type: file.mimeType,
        size_bytes: file.sizeBytes,
        tags: [],
        category_id: adminCat?.id ?? null,
        uploaded_by: user.id,
      });
      if (insertError) attachmentError = insertError.message;
    }
  }
  revalidatePath(revalidate);
  return attachmentError ? { attachmentError } : {};
}
