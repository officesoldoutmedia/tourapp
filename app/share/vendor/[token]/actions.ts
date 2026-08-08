"use server";

/** C4 — scrierile portalului de vendor. FĂRĂ sesiune: token-ul se
 *  RE-validează la fiecare apel prin resolveVendorLink. */
import { revalidatePath } from "next/cache";
import { createServiceClient } from "@/lib/supabase/service";
import {
  MAX_VENDOR_EMPLOYEES,
  normalizeVendorEmployee,
  type VendorEmployeeInput,
} from "@/lib/vendorPortal";
import { resolveVendorLink } from "./resolve";

export async function addVendorEmployee(
  token: string,
  input: VendorEmployeeInput,
): Promise<{ error?: string }> {
  const ctx = await resolveVendorLink(token);
  if (!ctx) return { error: "invalid_link" };
  const person = normalizeVendorEmployee(input);
  if (!person) return { error: "invalid" };

  const supabase = createServiceClient();
  const { count } = await supabase
    .from("tour_personnel")
    .select("id", { count: "exact", head: true })
    .eq("tour_id", ctx.tourId)
    .eq("company_id", ctx.companyId)
    .is("deleted_at", null);
  if ((count ?? 0) >= MAX_VENDOR_EMPLOYEES) return { error: "limit" };

  const { error } = await supabase.from("tour_personnel").insert({
    tour_id: ctx.tourId,
    company_id: ctx.companyId,
    first_name: person.first_name,
    last_name: person.last_name,
    role: person.role,
    phones: person.phones,
    emails: person.emails,
  });
  if (error) return { error: error.message };
  revalidatePath(`/share/vendor/${token}`);
  return {};
}

export async function removeVendorEmployee(
  token: string,
  personnelId: string,
): Promise<{ error?: string }> {
  const ctx = await resolveVendorLink(token);
  if (!ctx) return { error: "invalid_link" };
  const supabase = createServiceClient();
  // DOAR rândurile propriei companii, pe turul link-ului
  const { error } = await supabase
    .from("tour_personnel")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", personnelId)
    .eq("tour_id", ctx.tourId)
    .eq("company_id", ctx.companyId);
  if (error) return { error: error.message };
  revalidatePath(`/share/vendor/${token}`);
  return {};
}
