# Vendor Portal (C4) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Portal public tokenizat per (companie, show): vendorul vede pachetul lui filtrat (program public, hotel, fișierele categoriei), își adaugă singur angajații (→ `tour_personnel`) și urcă fișierele cerute (→ categoria lui pe zi → advancing), fără cont.

**Architecture:** Clona pattern-ului `share_links`/`/share/day/[token]` verificat în producție: tabelă nouă `vendor_links`, rută publică pe `createServiceClient()` cu validare de token, scrieri (server action + route handler multipart) care RE-validează token-ul la fiecare apel. Logica pură (normalizare input, stare link, limite anti-abuz) în `lib/vendorPortal.ts` (TDD). Partea echipei: buton „Share cu vendor" în `DayActionsBar` + select de departament pe companii.

**Tech Stack:** Next.js App Router (`params` Promises), Supabase (service client `lib/supabase/service.ts` + storage signed URLs), Resend (`lib/email.ts` — `sendEmail({to, subject, html})`), next-intl DOAR pe partea echipei (portalul e standalone cu L10N local RO/EN), vitest.

## Global Constraints

- Token-ul e SINGURA autoritate pe rutele publice: fiecare citire ȘI fiecare scriere validează `vendor_links` cu `revoked_at is null` + `expires_at > now()` prin service client; format pre-verificat cu `/^[0-9a-f-]{36}$/i` (pattern `app/share/day/[token]/page.tsx:18`). Miss → `notFound()` / 404 neutru, fără detalii.
- Portalul NU expune prin construcție: fee, P&L, costuri, alți vendori, alte categorii de fișiere, room lists, note de hotel, link-uri către app. Query-urile selectează DOAR coloanele enumerate în Task 3.
- Angajații din portal: `tour_personnel` cu `company_id`, cost null, fără billing/party; ștergere din portal DOAR pe rândurile cu `company_id`-ul link-ului.
- Limite anti-abuz per link: `MAX_VENDOR_EMPLOYEES = 20`, `MAX_VENDOR_FILES = 30` (contorizate la validare, în `lib/vendorPortal.ts`).
- Un singur link viu per (company, event): partial unique index + revocare automată la re-creare.
- Upload: max 50MB, path `{orgId}/vendor/{companyId}/{uuid}-{numeSanitizat}`, insert `attachments` pe ZIUA show-ului cu `category_id` = `companies.file_category_id`, `uploaded_by` null.
- Eșecul emailului NU strică crearea link-ului (warning, pattern attachmentError C3).
- Chei i18n (partea echipei) în AMBELE `messages/ro.json` + `messages/en.json`; portalul folosește L10N local (ro/en după `Accept-Language`, fallback en).
- Migrarea `00034_vendor_portal.sql` aditivă; test RLS nou `faza1f_vendor_rls.test.sql` (alfabetic faza1e < faza1f < faza2); `share_links`/day sheet public NEATINSE.

---

### Task 1: Migrarea 00034 + testul RLS faza1f

**Files:**
- Create: `supabase/migrations/00034_vendor_portal.sql`
- Create: `supabase/tests/faza1f_vendor_rls.test.sql`

**Interfaces:**
- Produces: `vendor_links`, `companies.file_category_id`, `tour_personnel.company_id` — folosite de Task 3–5.

- [ ] **Step 1: Scrie migrarea**

```sql
-- ═══════════════════════════════════════════════════════════════════
-- 00034 — Vendor portal (C4, feedback Zola §11): link-uri magice per
-- (companie, event) pe pattern-ul share_links (00011), departamentul
-- companiei = categoria de fișiere (SP3b), angajații vendorului în
-- tour_personnel. Publicul trece prin service client (ca la day sheet)
-- — RLS-ul de aici e doar pentru partea de administrare a echipei.
-- ═══════════════════════════════════════════════════════════════════

create table public.vendor_links (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  token uuid not null unique default gen_random_uuid(),
  organization_id uuid not null references public.organizations on delete cascade,
  company_id uuid not null references public.companies on delete cascade,
  event_id uuid not null references public.events on delete cascade,
  expires_at timestamptz not null default now() + interval '30 days',
  revoked_at timestamptz,
  created_by uuid references auth.users
);
create index vendor_links_event_idx on public.vendor_links (event_id);
-- un singur link viu per (companie, show); regenerare = revocă + creează
create unique index vendor_links_live_key
  on public.vendor_links (company_id, event_id)
  where revoked_at is null;

alter table public.companies
  add column file_category_id uuid references public.file_categories on delete set null;
comment on column public.companies.file_category_id is
  'C4: departamentul vendorului — portalul vede/urcă DOAR fișierele acestei categorii.';

alter table public.tour_personnel
  add column company_id uuid references public.companies on delete set null;
comment on column public.tour_personnel.company_id is
  'C4: proveniența angajaților adăugați din portalul de vendor (fără date financiare).';

alter table public.vendor_links enable row level security;
create policy vendor_links_all on public.vendor_links for all
  using (private.can_edit_tour_content(organization_id))
  with check (private.can_edit_tour_content(organization_id));
```

- [ ] **Step 2: Testul RLS**

`supabase/tests/faza1f_vendor_rls.test.sql` pe harness-ul EXACT din `faza1e_contracts_rls.test.sql` (citește-l întâi; aceleași fixture-uri/impersonări/cleanup). Aserțiunile:
1. Managerul org-ului creează companie + `vendor_links` (cu org/company/event din fixture-uri) — reușește; citește link-ul înapoi.
2. Managerul setează `companies.file_category_id` și `tour_personnel.company_id` — reușesc (politicile existente pe companies/tour_personnel le acoperă).
3. Crew (viewer) NU vede `vendor_links` (select gol) și insertul e respins.
4. Membrul altui org nu vede link-urile.
5. Unique-ul parțial: al doilea link viu pe același (company, event) → eroare prinsă (`unique_violation`) → PASS; după `update ... set revoked_at=now()` pe primul, insertul nou reușește.
Cleanup complet la final.

- [ ] **Step 3: Aplică local + suita**

Run: `supabase db reset && bash scripts/test-rls.sh`
Expected: toate fazele verzi, inclusiv faza1f (`RLS TESTS: OK`).

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/00034_vendor_portal.sql supabase/tests/faza1f_vendor_rls.test.sql
git commit -m "feat: migrarea 00034 — vendor_links, departament pe companii, company_id pe personnel"
```

---

### Task 2: `lib/vendorPortal.ts` (TDD)

**Files:**
- Create: `lib/vendorPortal.ts`
- Test: `lib/vendorPortal.test.ts`

**Interfaces:**
- Produces (semnături exacte, folosite de Task 3):
  - `MAX_VENDOR_EMPLOYEES = 20`, `MAX_VENDOR_FILES = 30`
  - `VendorEmployeeInput = { firstName: string; lastName?: string; role?: string; phone?: string; email?: string }`
  - `normalizeVendorEmployee(input: VendorEmployeeInput): { first_name: string; last_name: string | null; role: string | null; phones: string[]; emails: string[] } | null`
  - `vendorLinkState(row: { expires_at: string; revoked_at: string | null }, now?: Date): "live" | "expired" | "revoked"`
  - `sanitizeFileName(name: string): string`

- [ ] **Step 1: Testele (failing)**

```ts
// lib/vendorPortal.test.ts
import { describe, expect, it } from "vitest";
import {
  MAX_VENDOR_EMPLOYEES,
  MAX_VENDOR_FILES,
  normalizeVendorEmployee,
  sanitizeFileName,
  vendorLinkState,
} from "./vendorPortal";

describe("normalizeVendorEmployee", () => {
  it("normalizează câmpurile valide (trim, shape-ul tour_personnel)", () => {
    expect(
      normalizeVendorEmployee({
        firstName: "  Andrei ", lastName: " Pop ", role: " VJ ",
        phone: "+40 722 000 111", email: "andrei@visuals.ro",
      }),
    ).toEqual({
      first_name: "Andrei", last_name: "Pop", role: "VJ",
      phones: ["+40 722 000 111"], emails: ["andrei@visuals.ro"],
    });
  });
  it("prenumele e obligatoriu; opționalele goale → null/[]", () => {
    expect(normalizeVendorEmployee({ firstName: "   " })).toBeNull();
    expect(normalizeVendorEmployee({ firstName: "Ana" })).toEqual({
      first_name: "Ana", last_name: null, role: null, phones: [], emails: [],
    });
  });
  it("respinge lungimi excesive și email invalid", () => {
    expect(normalizeVendorEmployee({ firstName: "x".repeat(81) })).toBeNull();
    expect(
      normalizeVendorEmployee({ firstName: "Ana", email: "nu-e-email" }),
    ).toBeNull();
    expect(
      normalizeVendorEmployee({ firstName: "Ana", phone: "1".repeat(41) }),
    ).toBeNull();
  });
});

describe("vendorLinkState", () => {
  const NOW = new Date("2026-08-08T12:00:00Z");
  it("revoked bate expired", () => {
    expect(
      vendorLinkState(
        { expires_at: "2026-01-01T00:00:00Z", revoked_at: "2026-02-01T00:00:00Z" },
        NOW,
      ),
    ).toBe("revoked");
  });
  it("expirat vs viu", () => {
    expect(
      vendorLinkState({ expires_at: "2026-01-01T00:00:00Z", revoked_at: null }, NOW),
    ).toBe("expired");
    expect(
      vendorLinkState({ expires_at: "2026-12-01T00:00:00Z", revoked_at: null }, NOW),
    ).toBe("live");
  });
});

describe("sanitizeFileName", () => {
  it("păstrează diacriticele, taie caracterele periculoase și limitează lungimea", () => {
    expect(sanitizeFileName('cue/sheet:"v2".pdf')).toBe("cue_sheet__v2_.pdf");
    expect(sanitizeFileName("Anexă finală.pdf")).toBe("Anexă finală.pdf");
    expect(sanitizeFileName("x".repeat(200) + ".pdf")).toHaveLength(140);
    expect(sanitizeFileName("")).toBe("file");
  });
});

describe("limite", () => {
  it("constantele exportate", () => {
    expect(MAX_VENDOR_EMPLOYEES).toBe(20);
    expect(MAX_VENDOR_FILES).toBe(30);
  });
});
```

- [ ] **Step 2: Rulează — FAIL** (`npx vitest run lib/vendorPortal.test.ts`)

- [ ] **Step 3: Implementarea**

```ts
// lib/vendorPortal.ts
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
```

Notă `trimmed`: întoarce `undefined` pentru „prea lung" (invalid) și `null` pentru „gol" (valid, opțional) — testele acoperă ambele.

- [ ] **Step 4: Rulează — PASS**, apoi toată suita (`npx vitest run`).

- [ ] **Step 5: Commit**

```bash
git add lib/vendorPortal.ts lib/vendorPortal.test.ts
git commit -m "feat: lib/vendorPortal — normalizare angajat, stare link, igienă fișiere (TDD)"
```

---

### Task 3: Portalul public — pagină + scrieri

**Files:**
- Create: `app/share/vendor/[token]/resolve.ts`
- Create: `app/share/vendor/[token]/page.tsx`
- Create: `app/share/vendor/[token]/actions.ts`
- Create: `app/share/vendor/[token]/portal-client.tsx`
- Create: `app/api/vendor/[token]/upload/route.ts`

**Interfaces:**
- Consumes (Task 1) tabelele; (Task 2) tot exportul `lib/vendorPortal`; `createServiceClient` din `@/lib/supabase/service`; `getDaySheetData` din `@/lib/daysheet` (semnătura: `(supabase, dayId, { publicOnly: true, includeRooms: false })` — vezi `app/share/day/[token]/page.tsx:31-34`); `formatDayHeader`, `formatTimeInZone` din `@/lib/datetime`.
- Produces: `resolveVendorLink(token)` + `VendorLinkContext` (în `resolve.ts`, modul `server-only` — NU în fișierul `"use server"`: un export de acolo ar deveni endpoint public care întoarce UUID-urile interne), `addVendorEmployee(token, input)`, `removeVendorEmployee(token, personnelId)`.

- [ ] **Step 1a: `resolve.ts` — validarea partajată (server-only, NU action)**

```ts
// app/share/vendor/[token]/resolve.ts
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
```

- [ ] **Step 1b: `actions.ts` — scrierile**

```ts
// app/share/vendor/[token]/actions.ts
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
```

- [ ] **Step 2: Route handler-ul de upload**

```ts
// app/api/vendor/[token]/upload/route.ts
import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { MAX_VENDOR_FILES, sanitizeFileName } from "@/lib/vendorPortal";
import { resolveVendorLink } from "@/app/share/vendor/[token]/resolve";

const MAX_BYTES = 50 * 1024 * 1024; // limita bucket-ului attachments

/** C4 — upload-ul vendorului: fișier real în categoria companiei pe ZIUA
 *  show-ului → intră direct în advancing (SP3b). */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const ctx = await resolveVendorLink(token);
  if (!ctx) return NextResponse.json({ error: "invalid_link" }, { status: 404 });
  if (!ctx.fileCategoryId) {
    return NextResponse.json({ error: "no_category" }, { status: 400 });
  }

  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "no_file" }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "too_large" }, { status: 413 });
  }

  const supabase = createServiceClient();
  const { count } = await supabase
    .from("attachments")
    .select("id", { count: "exact", head: true })
    .eq("parent_type", "day")
    .eq("parent_id", ctx.dayId)
    .eq("category_id", ctx.fileCategoryId)
    .is("deleted_at", null);
  if ((count ?? 0) >= MAX_VENDOR_FILES) {
    return NextResponse.json({ error: "limit" }, { status: 429 });
  }

  const name = sanitizeFileName(file.name);
  const path = `${ctx.organizationId}/vendor/${ctx.companyId}/${crypto.randomUUID()}-${name}`;
  const { error: upError } = await supabase.storage
    .from("attachments")
    .upload(path, file);
  if (upError) {
    return NextResponse.json({ error: upError.message }, { status: 500 });
  }

  const { error } = await supabase.from("attachments").insert({
    organization_id: ctx.organizationId,
    parent_type: "day",
    parent_id: ctx.dayId,
    file_name: name,
    storage_path: path,
    mime_type: file.type || "application/octet-stream",
    size_bytes: file.size,
    tags: [],
    category_id: ctx.fileCategoryId,
    uploaded_by: null,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 3: Pagina publică**

`page.tsx` pe scheletul EXACT al `app/share/day/[token]/page.tsx` (citește-l): `export const dynamic = "force-dynamic"`, validare token cu `notFound()`, apoi:
- `resolveVendorLink(token)` → null → `notFound()`.
- Date (toate prin service client, DOAR coloanele de mai jos):
  - org name (`organizations.name` where id), event (`title, venues(name)`), day (`date, city, country, timezone` where id=ctx.dayId),
  - `getDaySheetData(supabase, ctx.dayId, { publicOnly: true, includeRooms: false })` → folosește DOAR `day.schedule` și `day.events` din rezultat,
  - hoteluri cu ore: `day_hotels` → `name, city, check_in_date, check_in_time, check_out_date, check_out_time` (day, nesters) — FĂRĂ notes/room list,
  - fișiere: `attachments` → `id, file_name, size_bytes, created_at, storage_path, status` (parent day + `category_id = ctx.fileCategoryId`, nesters, `storage_path` non-null, `status <> 'superseded'`), plus numele categoriei (`file_categories.name`); pentru fiecare: `supabase.storage.from("attachments").createSignedUrl(storage_path, 3600)` → `signedUrl`,
  - angajați: `tour_personnel` → `id, first_name, last_name, role, phones` (tour + company, nesters).
- Limba: `const lang = (await headers()).get("accept-language")?.toLowerCase().startsWith("ro") ? "ro" : "en";` (import `headers` din `next/headers`) + obiect local `L10N = { ro: {...}, en: {...} }` cu toate stringurile paginii (titluri secțiuni: Program/Schedule, Hotel, „Fișierele voastre"/"Your files", „Echipa voastră"/"Your team", „Adaugă persoană"/"Add person", „Urcă fișier"/"Upload file", „Departament neconfigurat — cere organizatorului."/"No department configured — ask the organizer.", etichete formular, „Link invalid sau expirat"/"Invalid or expired link").
- Layout standalone (fără nav): header cu `{event.title ?? venue ?? city}`, `formatDayHeader(date, tz, lang)`, oraș+țară, „{companyName} · invitat de {orgName}"; secțiunile Program (ora prin `formatTimeInZone`), Hotel, Fișiere (link-uri semnate + `<PortalClient>` pentru upload), Echipa (+ formular add + delete) — footer „TourApp".
- `<PortalClient>` primește `token`, `lang`, `canUpload` (categoria există), `employees` — vezi Step 4.

- [ ] **Step 4: `portal-client.tsx`**

Client component cu stringurile primite ca prop `t: Record<string, string>` (din L10N-ul paginii — fără next-intl):
- Formularul „Adaugă persoană": inputuri firstName* / lastName / role / phone / email → `addVendorEmployee(token, {...})` în `useTransition`; eroare → text roșu (`t.errorGeneric`, `t.errorLimit` la `error === "limit"`); succes → golește formularul (revalidatePath reface lista server-side).
- Lista angajaților cu buton 🗑 per rând → `window.confirm(t.confirmRemove)` → `removeVendorEmployee(token, id)`.
- Upload: `<input type="file">` → `fetch(`/api/vendor/${token}/upload`, { method: "POST", body: formData })` → la `!res.ok` afișează eroarea mapată (`no_category`/`too_large`/`limit`/generic); succes → `router.refresh()`.
- Dezactivează upload-ul când `canUpload === false` (mesajul de departament neconfigurat vine din pagină).

- [ ] **Step 5: Verificări + commit**

Run: `npx tsc --noEmit && npx vitest run && pnpm build`
Expected: verzi; rutele `/share/vendor/[token]` și `/api/vendor/[token]/upload` apar la build.

```bash
git add app/share/vendor/ app/api/vendor/
git commit -m "feat: portalul public de vendor — view filtrat, self-assign, upload"
```

---

### Task 4: Partea echipei — share, listă, email

**Files:**
- Modify: `app/o/[orgSlug]/t/[tourId]/d/[date]/extras-actions.ts` (3 acțiuni noi, după `createShareLink`:250-270)
- Modify: `app/o/[orgSlug]/t/[tourId]/d/[date]/extras-client.tsx` (`DayActionsBar`:597-650 — buton + panou)
- Modify: `app/o/[orgSlug]/t/[tourId]/d/[date]/page.tsx` (query-uri: companiile org-ului + vendor_links pe events-urile zilei; props noi spre `DayActionsBar`)
- Modify: `messages/ro.json`, `messages/en.json` (namespace nou `vendorShare`)

**Interfaces:**
- Consumes: (Task 1) `vendor_links`; `sendEmail` din `@/lib/email` (`{to, subject, html} → {error?}`); `vendorLinkState` din `@/lib/vendorPortal` (pentru status în listă).
- Produces: `createVendorLink(orgSlug, tourId, date, eventId, companyId): Promise<{ url?: string; emailWarning?: boolean; error?: string }>`, `revokeVendorLink(orgSlug, tourId, date, linkId)`, `resendVendorEmail(orgSlug, tourId, date, linkId): Promise<{ error?: string }>`.

- [ ] **Step 1: Acțiunile (în `extras-actions.ts`)**

```ts
// ── Vendor share [C4 §11] ───────────────────────────────────────────
export async function createVendorLink(
  orgSlug: string,
  tourId: string,
  date: string,
  eventId: string,
  companyId: string,
): Promise<{ url?: string; emailWarning?: boolean; error?: string }> {
  const { supabase, org, user } = await requireEditor(orgSlug);
  const { data: company } = await supabase
    .from("companies")
    .select("id, name, email")
    .eq("id", companyId)
    .eq("organization_id", org.id)
    .is("deleted_at", null)
    .maybeSingle();
  if (!company) return { error: "not_found" };

  // un singur link viu per (companie, show): revocă-l pe cel existent
  await supabase
    .from("vendor_links")
    .update({ revoked_at: new Date().toISOString() })
    .eq("company_id", companyId)
    .eq("event_id", eventId)
    .is("revoked_at", null);

  const { data, error } = await supabase
    .from("vendor_links")
    .insert({
      organization_id: org.id,
      company_id: companyId,
      event_id: eventId,
      created_by: user.id,
    })
    .select("token, expires_at")
    .single();
  if (error || !data) return { error: error?.message ?? "failed" };

  const base = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const url = `${base}/share/vendor/${data.token}`;

  let emailWarning = false;
  if (company.email) {
    const sent = await sendEmail({
      to: company.email,
      subject: `${org.name} — acces vendor / vendor access`,
      html: vendorEmailHtml(org.name, url, data.expires_at),
    });
    if (sent.error) emailWarning = true;
  } else {
    emailWarning = true; // fără email pe companie — doar link copiabil
  }
  revalidatePath(dayPath(orgSlug, tourId, date));
  return { url, emailWarning };
}

function vendorEmailHtml(orgName: string, url: string, expiresAt: string): string {
  const until = String(expiresAt).slice(0, 10);
  return [
    `<p>${orgName} v-a invitat în portalul de vendor al unui show.</p>`,
    `<p>${orgName} invited you to a show's vendor portal.</p>`,
    `<p><a href="${url}">${url}</a></p>`,
    `<p>Link valabil până la / valid until: ${until}</p>`,
  ].join("\n");
}

export async function revokeVendorLink(
  orgSlug: string,
  tourId: string,
  date: string,
  linkId: string,
): Promise<{ error?: string }> {
  const { supabase, org } = await requireEditor(orgSlug);
  const { error } = await supabase
    .from("vendor_links")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", linkId)
    .eq("organization_id", org.id);
  if (error) return { error: error.message };
  revalidatePath(dayPath(orgSlug, tourId, date));
  return {};
}

export async function resendVendorEmail(
  orgSlug: string,
  tourId: string,
  date: string,
  linkId: string,
): Promise<{ error?: string }> {
  const { supabase, org } = await requireEditor(orgSlug);
  const { data: link } = await supabase
    .from("vendor_links")
    .select("token, expires_at, revoked_at, companies!inner(email)")
    .eq("id", linkId)
    .eq("organization_id", org.id)
    .maybeSingle();
  const email = (link?.companies as unknown as { email: string | null } | null)?.email;
  if (!link || link.revoked_at) return { error: "not_found" };
  if (!email) return { error: "no_email" };
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const sent = await sendEmail({
    to: email,
    subject: `${org.name} — acces vendor / vendor access`,
    html: vendorEmailHtml(org.name, `${base}/share/vendor/${link.token}`, link.expires_at),
  });
  return sent.error ? { error: sent.error } : {};
}
```

(`sendEmail` se importă în capul fișierului; `org.name` există pe contextul `requireOrg` — verifică shape-ul `org` din `lib/org` și folosește câmpul corect.)

- [ ] **Step 2: Query-urile din `page.tsx`**

În `Promise.all`-ul paginii de zi: companiile org-ului (`companies` → `id, name, email, file_category_id`, org, nesters, order name) + link-urile de vendor ale events-urilor zilei (`vendor_links` → `id, company_id, event_id, expires_at, revoked_at, token, created_at` where `event_id in (eventIds)`) + numele categoriilor (`file_categories` → `id, name`, pentru marcarea selectului). Pasează spre `DayActionsBar`: `companies`, `vendorLinks`, `eventOptions` (id+title al events-urilor zilei — pentru zilele cu mai multe show-uri, select de event).

- [ ] **Step 3: UI-ul în `DayActionsBar`**

Sub butonul „Share day sheet" (același stil): buton `vendorShare.button` care expandează un panou:
- select event (doar dacă `eventOptions.length > 1`, altfel implicit singurul),
- select companie: `{name}` + sufix ` · {categoria}` când `file_category_id` e setat, altfel ` · {t("noCategory")}`,
- buton `vendorShare.create` → `createVendorLink(...)` → afișează URL-ul cu copy-to-clipboard (pattern-ul share-day existent din același component) + warning `vendorShare.emailWarning` când `emailWarning`,
- lista link-urilor zilei: companie · `vendorLinkState(row)` ca badge (`vendorShare.stateLive/Expired/Revoked`) · Copy (`{base}/share/vendor/{token}` — folosește `window.location.origin`) · `vendorShare.resend` (doar live, cu confirmare de succes discretă) · `vendorShare.revoke` (window.confirm) — doar pe cele live.

- [ ] **Step 4: i18n `vendorShare`**

ro: `button` („Share cu vendor"), `title` („Acces vendor"), `event` („Show-ul"), `company` („Compania"), `noCategory` („fără departament — fișierele nu vor fi vizibile"), `create` („Creează link + trimite email"), `created` („Link creat"), `emailWarning` („Emailul nu a plecat — copiază link-ul manual."), `copy` („Copiază"), `copied` („Copiat!"), `resend` („Retrimite email"), `resent` („Trimis."), `revoke` („Revocă"), `revokeConfirm` („Revoci accesul? Link-ul moare imediat."), `stateLive` („activ"), `stateExpired` („expirat"), `stateRevoked` („revocat"), `empty` („Niciun link încă."). en: echivalentele.

- [ ] **Step 5: Verificări + commit**

Run: `node scripts/check-i18n.mjs && npx tsc --noEmit && npx vitest run`

```bash
git add app/o/\[orgSlug\]/t/\[tourId\]/d/\[date\]/ messages/ro.json messages/en.json
git commit -m "feat: share cu vendor pe pagina de zi — creare link, email, listă, revoke"
```

---

### Task 5: Departamentul pe companii

**Files:**
- Modify: `app/o/[orgSlug]/contacts/page.tsx` (selectul de categorie pe formularul de companie, load categorii)
- Modify: `messages/ro.json`, `messages/en.json` (1-2 chei în namespace-ul paginii de contacts)

**Interfaces:**
- Consumes: (Task 1) `companies.file_category_id`.

- [ ] **Step 1: Implementarea**

În `contacts/page.tsx` (server-only, form actions inline — citește fișierul):
- selectul de `companies` (linia ~23) primește și `file_category_id`;
- query nou `file_categories` (`id, name`, org, nesters, order sort_order);
- pe formularul de companie (rând existent + formularul de adăugare, linia ~113): select `fileCategory` cu opțiunea „—" + categoriile; acțiunea de save scrie `file_category_id` (validat: id-ul există în lista org-ului, altfel null);
- pe rândul companiei, lângă `kind`: numele categoriei ca text secundar (dacă există).
- Chei i18n: `department` („Departament (fișiere)"/"Department (files)") în namespace-ul folosit de pagină (verifică — probabil `contacts`), ambele fișiere.

- [ ] **Step 2: Verificări + commit**

Run: `node scripts/check-i18n.mjs && npx tsc --noEmit && npx vitest run`

```bash
git add app/o/\[orgSlug\]/contacts/ messages/ro.json messages/en.json
git commit -m "feat: departamentul (categoria de fișiere) pe companii"
```

---

### Task 6: Verificare finală

**Files:** fix-uri punctuale descoperite aici.

- [ ] **Step 1: Suita completă**

```bash
pnpm vitest run
bash scripts/test-rls.sh
node scripts/check-i18n.mjs
pnpm build
```
Expected: toate exit 0.

- [ ] **Step 2: Review final de branch**

`superpowers:requesting-code-review` (main model), cu ledger-ul de minors ca input. Atenție specială: suprafața publică (token gating pe TOATE căile, enumerarea coloanelor, signed URLs), scrierile prin service client, zero regresii pe `/share/day`.

- [ ] **Step 3: Merge gate + deploy**

Opțiunile de integrare; după decizia utilizatorului: migrarea `00034` pe producție + `pnpm run deploy` (verifică `/api/version`). Smoke prin Chrome per spec: companie cu categoria SFX + email → „Share cu vendor" pe un show → link + email → portalul (fereastră incognito nu e disponibilă prin MCP — deschide link-ul într-un tab nou; portalul nu depinde de sesiune, dar verifică că NU apar date financiare) → adaug angajat → apare în crew list-ul turului → urc fișier → apare în categoria SFX pe zi + advancing-ul crește → revoke → pagina moare (404) → cleanup complet (soft-delete pe datele de test).
