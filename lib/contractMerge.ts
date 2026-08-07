/** C3 — merge fields (§13.5), umplerea template-urilor și dry-run-ul de
 *  blocare. PDF-ul se randează EXCLUSIV din snapshot (regula casei). */
import { amountInWords } from "./numberToWords";

export interface ContractBlock {
  kind: "heading" | "paragraph";
  text: string;
}
export type MergeValues = Record<string, string>;
export interface ContractSnapshot {
  title: string;
  language: string;
  values: MergeValues;
  blocks: ContractBlock[];
}

export const MERGE_FIELD_KEYS = [
  "company.name", "company.cui", "company.reg_com", "company.address",
  "company.iban", "company.bank", "company.rep",
  "crew.entity_name", "crew.cui", "crew.reg_com", "crew.address",
  "crew.iban", "crew.bank", "crew.rep", "crew.role", "crew.vat_payer",
  "crew.payment_terms", "crew.id_document",
  "event.name", "event.date", "event.city", "event.country",
  "event.venue", "event.stage_time", "event.artist",
  "deal.fee", "deal.currency", "deal.fee_in_words",
  "doc.number", "doc.date", "doc.framework_ref", "doc.language",
] as const;

const FIELD_RE = /\{\{\s*([a-z_]+\.[a-z_]+)\s*\}\}/g;

export function listMergeFields(body: ContractBlock[]): string[] {
  const seen: string[] = [];
  for (const block of body) {
    for (const match of block.text.matchAll(FIELD_RE)) {
      if (!seen.includes(match[1])) seen.push(match[1]);
    }
  }
  return seen;
}

export function fillTemplate(
  body: ContractBlock[],
  values: MergeValues,
): { blocks: ContractBlock[]; unresolved: string[] } {
  const unresolved: string[] = [];
  const blocks = body.map((block) => ({
    kind: block.kind,
    text: block.text.replace(FIELD_RE, (_, key: string) => {
      const value = values[key] ?? "";
      if (!value && !unresolved.includes(key)) unresolved.push(key);
      return value;
    }),
  }));
  return { blocks, unresolved };
}

export interface CollectInput {
  issuing: {
    name?: string | null; cui?: string | null; reg_com?: string | null;
    address?: string | null; iban?: string | null; bank?: string | null;
    representative?: string | null;
  } | null;
  entity: {
    display_name: string; company_name?: string | null; cui?: string | null;
    reg_com?: string | null; address?: string | null; iban?: string | null;
    bank?: string | null; representative?: string | null; vat_payer: boolean;
    payment_terms_days?: number | null; id_document?: string | null;
    entity_type: string;
  } | null;
  role: string | null;
  event: {
    name?: string | null; date?: string | null; city?: string | null;
    country?: string | null; venue?: string | null; stage_time?: string | null;
    artist?: string | null;
  } | null;
  fee: { amount: number | null; currency: string | null };
  doc: {
    number: string; date: string; frameworkRef: string | null;
    language: "ro" | "en" | "bi";
  };
}

const s = (v: string | number | null | undefined): string =>
  v == null ? "" : String(v);

export function collectMergeValues(input: CollectInput): MergeValues {
  const lang = input.doc.language === "en" ? "en" : "ro";
  const yes = lang === "en" ? "YES" : "DA";
  const no = lang === "en" ? "NO" : "NU";
  const feeWords =
    input.fee.amount != null && input.fee.currency
      ? amountInWords(input.fee.amount, input.fee.currency, lang)
      : "";
  const values: MergeValues = {
    "company.name": s(input.issuing?.name),
    "company.cui": s(input.issuing?.cui),
    "company.reg_com": s(input.issuing?.reg_com),
    "company.address": s(input.issuing?.address),
    "company.iban": s(input.issuing?.iban),
    "company.bank": s(input.issuing?.bank),
    "company.rep": s(input.issuing?.representative),
    "crew.entity_name": s(input.entity?.company_name || input.entity?.display_name),
    "crew.cui": s(input.entity?.cui),
    "crew.reg_com": s(input.entity?.reg_com),
    "crew.address": s(input.entity?.address),
    "crew.iban": s(input.entity?.iban),
    "crew.bank": s(input.entity?.bank),
    "crew.rep": s(input.entity?.representative || input.entity?.display_name),
    "crew.role": s(input.role),
    "crew.vat_payer": input.entity ? (input.entity.vat_payer ? yes : no) : "",
    "crew.payment_terms": s(input.entity?.payment_terms_days),
    "crew.id_document": s(input.entity?.id_document),
    "event.name": s(input.event?.name),
    "event.date": s(input.event?.date),
    "event.city": s(input.event?.city),
    "event.country": s(input.event?.country),
    "event.venue": s(input.event?.venue),
    "event.stage_time": s(input.event?.stage_time),
    "event.artist": s(input.event?.artist),
    "deal.fee": input.fee.amount != null ? String(input.fee.amount) : "",
    "deal.currency": s(input.fee.currency),
    "deal.fee_in_words": feeWords,
    "doc.number": input.doc.number,
    "doc.date": input.doc.date,
    "doc.framework_ref": s(input.doc.frameworkRef),
    "doc.language": input.doc.language,
  };
  return values;
}

/** Regulile de asignare §13.4: primul template viu cu kind egal, match pe
 *  rol (null = orice; case-insensitive) și tip entitate (null = orice),
 *  în ordinea sort_order. Pur — folosit și server-side (auto-hook) și
 *  client-side (pre-selecție în UI). */
export interface MatchableTemplate {
  id: string;
  doc_kind: string;
  match_role: string | null;
  match_entity_type: string | null;
  sort_order: number;
}
export function findMatchingTemplate<T extends MatchableTemplate>(
  templates: T[],
  kind: string,
  role: string | null,
  entityType: string,
): T | null {
  return (
    templates
      .filter((t) => t.doc_kind === kind)
      .filter(
        (t) =>
          !t.match_role ||
          (role ?? "").trim().toLowerCase() === t.match_role.trim().toLowerCase(),
      )
      .filter((t) => !t.match_entity_type || t.match_entity_type === entityType)
      .sort((a, b) => a.sort_order - b.sort_order)[0] ?? null
  );
}

/** Parsează defensiv un snapshot din jsonb. */
export function parseContractSnapshot(value: unknown): ContractSnapshot | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  if (typeof v.title !== "string" || !Array.isArray(v.blocks)) return null;
  return {
    title: v.title,
    language: typeof v.language === "string" ? v.language : "ro",
    values: (v.values && typeof v.values === "object" ? v.values : {}) as MergeValues,
    blocks: (v.blocks as ContractBlock[]).filter(
      (b) => b && typeof b.text === "string" && (b.kind === "heading" || b.kind === "paragraph"),
    ),
  };
}
