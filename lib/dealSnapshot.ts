/** Snapshot-ul de deal pe event (C1, spec §1-2). Pur — fără fetch. */

export interface DealSnapshot {
  name: string;
  fee_amount: number | null;
  fee_currency: string | null;
  deal_basis: string | null;
  withholding_percent: number | null;
  landed_items: string[];
  accommodation: {
    rooms_single?: number;
    rooms_double?: number;
    category?: string;
    nights?: number;
  };
  required_category_ids: string[];
}

export interface DealTemplateRow {
  name: string;
  fee_amount: number | null;
  fee_currency: string | null;
  deal_basis: string | null;
  withholding_percent: number | null;
  landed_items: unknown;
  accommodation: unknown;
  required_category_ids: string[] | null;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function buildDealSnapshot(template: DealTemplateRow): DealSnapshot {
  const landed = Array.isArray(template.landed_items)
    ? template.landed_items.filter((x): x is string => typeof x === "string")
    : [];
  const acc =
    template.accommodation && typeof template.accommodation === "object"
      ? (template.accommodation as DealSnapshot["accommodation"])
      : {};
  return {
    name: template.name,
    fee_amount: template.fee_amount != null ? Number(template.fee_amount) : null,
    fee_currency: template.fee_currency ?? null,
    deal_basis: template.deal_basis ?? null,
    withholding_percent:
      template.withholding_percent != null ? Number(template.withholding_percent) : null,
    landed_items: landed,
    accommodation: acc,
    required_category_ids: template.required_category_ids ?? [],
  };
}

export function parseDealSnapshot(value: unknown): DealSnapshot | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  if (typeof v.name !== "string") return null;
  if (!Array.isArray(v.landed_items) || !Array.isArray(v.required_category_ids)) {
    return null;
  }
  return buildDealSnapshot({
    name: v.name,
    fee_amount: typeof v.fee_amount === "number" ? v.fee_amount : null,
    fee_currency: typeof v.fee_currency === "string" ? v.fee_currency : null,
    deal_basis: typeof v.deal_basis === "string" ? v.deal_basis : null,
    withholding_percent:
      typeof v.withholding_percent === "number" ? v.withholding_percent : null,
    landed_items: v.landed_items,
    accommodation: v.accommodation,
    required_category_ids: v.required_category_ids.filter(
      (x): x is string => typeof x === "string",
    ),
  });
}

/** Uniunea listelor ne-goale din snapshot-uri ∩ categoriile live.
 *  null = niciun snapshot nu definește obligatorii → fallback pe org. */
export function requiredCategoriesForDay(
  snapshots: (DealSnapshot | null)[],
  liveCategoryIds: ReadonlySet<string>,
): string[] | null {
  const union = new Set<string>();
  let any = false;
  for (const s of snapshots) {
    if (!s || s.required_category_ids.length === 0) continue;
    any = true;
    for (const id of s.required_category_ids) union.add(id);
  }
  if (!any) return null;
  return [...union].filter((id) => liveCategoryIds.has(id));
}

export function withholdingLine(
  percent: number,
  fee: number,
  currency: string,
): { key: "withholding"; label: string; amount: number; currency: string } | null {
  if (!(percent > 0) || !(fee > 0)) return null;
  const amount = round2((percent / 100) * fee);
  return {
    key: "withholding",
    label: `Impozit reținut ${percent}% — ${amount} ${currency}`,
    amount,
    currency,
  };
}
