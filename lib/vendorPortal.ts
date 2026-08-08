/** C4 — logica pură a portalului de vendor: normalizarea input-ului de
 *  angajat (shape-ul tour_personnel), starea link-ului și igiena
 *  numelor de fișiere. Limitele anti-abuz per link trăiesc aici. */

export const MAX_VENDOR_EMPLOYEES = 20;
export const MAX_VENDOR_FILES = 30;

export interface VendorEmployeeInput {
  firstName: string;
  lastName?: string;
  role?: string;
  phone?: string;
  email?: string;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function trimmed(v: string | undefined, max: number): string | null | undefined {
  if (v == null) return null;
  const t = v.trim();
  if (t.length > max) return undefined; // prea lung = invalid
  return t || null;
}

export function normalizeVendorEmployee(input: VendorEmployeeInput): {
  first_name: string;
  last_name: string | null;
  role: string | null;
  phones: string[];
  emails: string[];
} | null {
  const first = trimmed(input.firstName, 80);
  if (!first) return null; // gol sau prea lung
  const last = trimmed(input.lastName, 80);
  const role = trimmed(input.role, 80);
  const phone = trimmed(input.phone, 40);
  const email = trimmed(input.email, 120);
  if (last === undefined || role === undefined || phone === undefined || email === undefined) {
    return null;
  }
  if (email && !EMAIL_RE.test(email)) return null;
  return {
    first_name: first,
    last_name: last,
    role,
    phones: phone ? [phone] : [],
    emails: email ? [email] : [],
  };
}

export function vendorLinkState(
  row: { expires_at: string; revoked_at: string | null },
  now: Date = new Date(),
): "live" | "expired" | "revoked" {
  if (row.revoked_at) return "revoked";
  if (new Date(row.expires_at).getTime() <= now.getTime()) return "expired";
  return "live";
}

/** Taie separatoarele de path, caracterele de control și pe cele care rup
 *  header-ele (pattern C3); păstrează diacriticele. Max 140 de caractere. */
export function sanitizeFileName(name: string): string {
  const cleaned = name
    .replace(/[\/\\<>:"|?*\x00-\x1F]/g, "_")
    .trim()
    .slice(0, 140);
  return cleaned || "file";
}
