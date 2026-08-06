"use server";

import { requireOrg } from "@/lib/org";
import { can } from "@/lib/permissions";
import { buildDealSnapshot, withholdingLine } from "@/lib/dealSnapshot";

/**
 * Aplică un deal template pe un event: scrie snapshot-ul pe `events`,
 * sincronizează fee-ul din `show_finances` (doar când e liber sau userul
 * a confirmat suprascrierea) și upsert-ează linia de reținere calculată
 * pe fee-ul EFECTIV. Acțiune partajată (C1 spec §2) — folosită de Task 5
 * (panoul Costs) și Task 6 (wizard-ul de creare event).
 *
 * Nu revalidează căi — caller-ii au orgSlug/tourId/date în scope.
 */
export async function applyDealToEvent(
  orgSlug: string,
  eventId: string,
  dealTemplateId: string,
  opts: { overwriteFee: boolean },
): Promise<{ error?: string; feeConflict?: boolean }> {
  const { supabase, permission, tier, user } = await requireOrg(orgSlug);
  if (!can({ tier, permission }, "edit_accounting")) return { error: "forbidden" };

  const { data: template } = await supabase
    .from("deal_templates")
    .select(
      "id, name, fee_amount, fee_currency, deal_basis, withholding_percent, landed_items, accommodation, required_category_ids",
    )
    .eq("id", dealTemplateId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!template) return { error: "not_found" };

  const snapshot = buildDealSnapshot(template);

  // Fee: doar dacă e gol/zero sau userul a confirmat suprascrierea.
  const { data: finance } = await supabase
    .from("show_finances")
    .select("id, fee, fee_currency")
    .eq("event_id", eventId)
    .maybeSingle();
  const currentFee = Number(finance?.fee ?? 0);
  const templateFee = snapshot.fee_amount ?? 0;

  if (
    currentFee > 0 &&
    templateFee > 0 &&
    currentFee !== templateFee &&
    !opts.overwriteFee
  ) {
    return { feeConflict: true };
  }

  // 1. Snapshot-ul pe event.
  const { error: eventError } = await supabase
    .from("events")
    .update({ deal_template_id: template.id, deal_snapshot: snapshot })
    .eq("id", eventId);
  if (eventError) return { error: eventError.message };

  // 2. Fee (aplicat doar când e cazul).
  let effectiveFee = currentFee;
  let effectiveCurrency = finance?.fee_currency ?? snapshot.fee_currency ?? "EUR";
  if (templateFee > 0 && (currentFee <= 0 || opts.overwriteFee)) {
    effectiveFee = templateFee;
    effectiveCurrency = snapshot.fee_currency ?? effectiveCurrency;
    const payload = { fee: effectiveFee, fee_currency: effectiveCurrency };
    const res = finance?.id
      ? await supabase.from("show_finances").update(payload).eq("id", finance.id)
      : await supabase
          .from("show_finances")
          .insert({ event_id: eventId, ...payload });
    if (res.error) return { error: res.error.message };
  }

  // 3. Withholding pe fee-ul EFECTIV (spec §2 pas 3).
  const line = withholdingLine(
    snapshot.withholding_percent ?? 0,
    effectiveFee,
    effectiveCurrency,
  );
  if (line) {
    const { data: existing } = await supabase
      .from("show_costs")
      .select("id")
      .eq("event_id", eventId)
      .eq("generated_key", line.key)
      .is("deleted_at", null)
      .maybeSingle();
    if (existing) {
      await supabase
        .from("show_costs")
        .update({
          label: line.label,
          amount: line.amount,
          currency: line.currency,
          updated_by: user.id,
        })
        .eq("id", existing.id);
    } else {
      await supabase.from("show_costs").insert({
        event_id: eventId,
        kind: "extra",
        label: line.label,
        amount: line.amount,
        currency: line.currency,
        generated_key: line.key,
        billable_to_booker: false,
        updated_by: user.id,
      });
    }
  }
  return {};
}
