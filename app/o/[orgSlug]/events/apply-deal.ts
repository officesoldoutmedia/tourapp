"use server";

import { requireOrg } from "@/lib/org";
import { can } from "@/lib/permissions";
import {
  buildDealSnapshot,
  hasFeeConflict,
  withholdingLine,
  DEAL_TEMPLATE_COLUMNS,
} from "@/lib/dealSnapshot";

/**
 * Aplică un deal template pe un event: scrie snapshot-ul pe `events`,
 * sincronizează fee-ul din `show_finances` (doar când e liber sau userul
 * a confirmat suprascrierea) și upsert-ează linia de reținere calculată
 * pe fee-ul EFECTIV. Acțiune partajată (C1 spec §2) — folosită de Task 5
 * (panoul Costs) și Task 6 (wizard-ul de creare event).
 *
 * Conflict de fee (fee curent ≠ fee template, ambele reale): fără
 * `overwriteFee`/`keepFee` → `{ feeConflict: true }` ÎNAINTE de orice
 * scriere. `overwriteFee: true` → fee-ul template-ului câștigă (comportament
 * neschimbat). `keepFee: true` → deal-ul se aplică oricum (snapshot scris),
 * dar fee-ul curent din `show_finances` rămâne neatins, iar reținerea (pas
 * 3) se calculează pe el, nu pe fee-ul template-ului. Dacă ambele flag-uri
 * vin true, `overwriteFee` are precedență — nu se întoarce eroare.
 *
 * Nu revalidează căi — caller-ii au orgSlug/tourId/date în scope.
 */
export async function applyDealToEvent(
  orgSlug: string,
  eventId: string,
  dealTemplateId: string,
  opts: { overwriteFee?: boolean; keepFee?: boolean },
): Promise<{ error?: string; feeConflict?: boolean }> {
  const { supabase, permission, tier, user } = await requireOrg(orgSlug);
  if (!can({ tier, permission }, "edit_accounting")) return { error: "forbidden" };

  // Ownership (review C1-T8 fix 1): `edit_accounting` vede TOȚI artiștii
  // org-ului (posibil mai multe org-uri) — fără legarea explicită
  // template↔event, un caller ar putea atașa deal-ul artistului X pe
  // show-ul artistului Y. Rezolvăm artistul show-ului pe lanțul event →
  // day → tour → artist_id (același pattern ca `costsheet/route.ts`) și
  // constrângem select-ul de template pe el — asta fixează implicit și
  // org-ul (tranzitiv prin artist). Wizard-ul (`events/new/actions.ts`)
  // își păstrează propriul pre-check — defense in depth, ramura lui
  // ne-privilegiată nu trece prin acțiunea asta.
  const { data: event } = await supabase
    .from("events")
    .select("id, days!inner(tours!inner(artist_id))")
    .eq("id", eventId)
    .is("deleted_at", null)
    .maybeSingle();
  const day = event?.days as unknown as { tours: { artist_id: string } | null } | undefined;
  const artistId = day?.tours?.artist_id;
  if (!artistId) return { error: "not_found" };

  const { data: template } = await supabase
    .from("deal_templates")
    .select(DEAL_TEMPLATE_COLUMNS)
    .eq("id", dealTemplateId)
    .eq("artist_id", artistId)
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
    hasFeeConflict(
      { fee: currentFee, currency: finance?.fee_currency ?? null },
      { fee: templateFee, currency: snapshot.fee_currency ?? null },
    ) &&
    !opts.overwriteFee &&
    !opts.keepFee
  ) {
    return { feeConflict: true };
  }

  // 1. Snapshot-ul pe event.
  const { error: eventError } = await supabase
    .from("events")
    .update({ deal_template_id: template.id, deal_snapshot: snapshot })
    .eq("id", eventId);
  if (eventError) return { error: eventError.message };

  // 2. Fee (aplicat doar când e cazul). `overwriteFee` are precedență peste
  // `keepFee` dacă ambele vin setate (spec: „both flags true → treat as
  // overwriteFee, don't error") — de-aia `keepFee` efectiv se dezactivează
  // când `overwriteFee` e true, în loc să fie citit direct din opts.
  const overwriteFee = !!opts.overwriteFee;
  const keepFee = !!opts.keepFee && !overwriteFee;
  let effectiveFee = currentFee;
  let effectiveCurrency = finance?.fee_currency ?? snapshot.fee_currency ?? "EUR";
  if (!keepFee && templateFee > 0 && (currentFee <= 0 || overwriteFee)) {
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
  // Când `keepFee`, blocul de mai sus e sărit complet — `effectiveFee` /
  // `effectiveCurrency` rămân exact ce am citit din `show_finances` la
  // început (fee-ul PĂSTRAT, cu moneda lui), deci pasul 3 (reținerea)
  // calculează pe fee-ul curent al show-ului, nu pe cel al template-ului.

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
  } else {
    // Fix 2 (review C1-T8): deal-ul nou nu are reținere — dacă deal-ul
    // ANTERIOR lăsase o linie generată `withholding` vie, ea supraviețuia
    // re-apply-ului și rămânea în P&L. Soft-delete pe orice rând viu, ca
    // să nu tragă `deleted_at` peste ceva deja șters.
    await supabase
      .from("show_costs")
      .update({ deleted_at: new Date().toISOString() })
      .eq("event_id", eventId)
      .eq("generated_key", "withholding")
      .is("deleted_at", null);
  }
  return {};
}
