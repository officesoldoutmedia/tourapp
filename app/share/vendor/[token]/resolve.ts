import "server-only";

/** C4 — validarea token-ului de vendor: singura autoritate pe rutele
 *  publice, prin service client (pattern /share/day). Modul server-only,
 *  NU "use server" — exporturile de aici nu sunt endpoint-uri publice. */
import { createServiceClient } from "@/lib/supabase/service";

const TOKEN_RE = /^[0-9a-f-]{36}$/i;

export interface VendorLinkContext {
  linkId: string;
  organizationId: string;
  companyId: string;
  eventId: string;
  dayId: string;
  tourId: string;
  fileCategoryId: string | null;
  companyName: string;
}

export async function resolveVendorLink(
  token: string,
): Promise<VendorLinkContext | null> {
  if (!TOKEN_RE.test(token)) return null;
  const supabase = createServiceClient();
  const { data: link } = await supabase
    .from("vendor_links")
    .select(
      "id, organization_id, company_id, event_id, companies!inner(name, file_category_id, deleted_at), events!inner(day_id, deleted_at, days!inner(id, tour_id))",
    )
    .eq("token", token)
    .is("revoked_at", null)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();
  if (!link) return null;
  const company = link.companies as unknown as {
    name: string; file_category_id: string | null; deleted_at: string | null;
  };
  const event = link.events as unknown as {
    day_id: string; deleted_at: string | null;
    days: { id: string; tour_id: string };
  };
  if (company.deleted_at || event.deleted_at) return null;
  return {
    linkId: link.id,
    organizationId: link.organization_id,
    companyId: link.company_id,
    eventId: link.event_id,
    dayId: event.day_id,
    tourId: event.days.tour_id,
    fileCategoryId: company.file_category_id,
    companyName: company.name,
  };
}
