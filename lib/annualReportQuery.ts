import type { SupabaseClient } from "@supabase/supabase-js";
import { buildAnnualReport, type AnnualAnnexRow, type PersonYearReport } from "./annualReport";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = SupabaseClient<any, "public", any>;

/** Anexele active emise în anul dat, la nivel de organizație (RLS gate-uiește accounting). */
export async function fetchAnnualReport(
  supabase: AnyClient,
  orgId: string,
  year: number,
): Promise<PersonYearReport[]> {
  const { data } = await supabase
    .from("payment_annexes")
    .select(
      "id, annex_number, contract_number, issue_date, currency, total, payment_currency, fx_rate, paid_at, tour_personnel(first_name, last_name, company), tours(name)",
    )
    .eq("organization_id", orgId)
    .is("deleted_at", null)
    .gte("issue_date", `${year}-01-01`)
    .lte("issue_date", `${year}-12-31`)
    .order("issue_date");

  const rows: AnnualAnnexRow[] = (data ?? []).map((annex) => {
    const person = annex.tour_personnel as unknown as {
      first_name: string | null;
      last_name: string | null;
      company: string | null;
    } | null;
    const tour = annex.tours as unknown as { name: string } | null;
    return {
      id: annex.id,
      annexNumber: annex.annex_number,
      contractNumber: annex.contract_number,
      issueDate: annex.issue_date,
      currency: annex.currency,
      total: Number(annex.total),
      paymentCurrency: annex.payment_currency,
      fxRate: annex.fx_rate == null ? null : Number(annex.fx_rate),
      paidAt: annex.paid_at,
      personFirstName: person?.first_name ?? null,
      personLastName: person?.last_name ?? null,
      personCompany: person?.company ?? null,
      tourName: tour?.name ?? "—",
    };
  });

  return buildAnnualReport(rows);
}
