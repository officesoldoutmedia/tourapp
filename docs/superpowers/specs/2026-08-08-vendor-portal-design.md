# Vendor portal — design (Faza C4)

**Data:** 2026-08-08
**Status:** aprobat în brainstorming, în așteptarea review-ului pe spec
**Sursa:** feedback Zola §11 (Share & Vendor Portal); ultimul sub-proiect din
Faza C, după C1 deal templates, C2 reverse scheduling și C3 contract
automation (livrate).

## Decizii clarificate cu utilizatorul

- **Scope v1 = portalul complet:** view filtrat + self-assignment de angajați
  + upload de fișiere — cele două întrebări de WhatsApp pe care §11 le omoară
  („cine vine de la voi?", „mi-ați trimis lista?").
- **Angajații vendorului aterizează în `tour_personnel`** cu `company_id` nou
  (FK `companies`) — apar automat în crew list / rooming / day sheet, per §11.
  Fără date financiare (cost null, fără billing, fără party).
- **Departamentul vendorului = categoria de fișiere** (`companies.
  file_category_id` FK `file_categories`, SP3b): portalul arată și primește
  DOAR fișierele categoriei lui; upload-ul intră direct în advancing.
- **Magic link per (companie, event), 30 de zile**, revocabil, regenerabil;
  trimis pe email prin Resend (infrastructura există) + copiabil manual.
- **Abordarea A:** extinderea pattern-ului `share_links` (00011, verificat în
  producție la day sheet): tabelă nouă `vendor_links`, rută publică nouă pe
  service client, scrieri validate prin token la FIECARE apel. Respinse:
  vendori ca useri Supabase Auth (onboarding cu cont — §11 cere explicit fără
  cont) și portal read-only (pierde self-assignment-ul).

## 1. Modelul de date și accesul (migrarea `00034_vendor_portal.sql`, aditivă)

**`vendor_links`**: `token uuid unique default gen_random_uuid()`,
`organization_id`, `company_id` (FK cascade), `event_id` (FK cascade),
`expires_at timestamptz not null default now() + interval '30 days'`,
`revoked_at`, `created_by`, `created_at` — clona structurii `share_links`.
Partial unique index `(company_id, event_id) where revoked_at is null` — un
singur link viu per vendor per show; „regenerare" = revocă + creează.
RLS: select + write pe `can_edit_tour_content(organization_id)` — tabela e
administrativă; publicul trece prin service client, ca la day sheet.

**`companies.file_category_id`** — FK `file_categories` on delete set null.
**`tour_personnel.company_id`** — FK `companies` on delete set null.
Rândurile create din portal: nume, rol, telefon, email, `company_id`; cost
null, fără billing, fără party. În crew list apar normal, cu capsulă discretă
cu numele companiei; echipa le editează/șterge ca pe orice rând.

**Accesul public** (pattern `/share/day/[token]`): validare format UUID →
rând `vendor_links` cu `revoked_at is null` și `expires_at > now()`, prin
`createServiceClient()`. Miss → pagină neutră „link invalid/expirat".
Scrierile re-validează token-ul la FIECARE apel — token-ul e singura
autoritate; nu există sesiune.

## 2. Portalul (`/share/vendor/[token]`)

**Vede** (queries enumerate explicit — nimic altceva nu intră în pagină):
- Header: show/venue, data (în timezone-ul zilei), oraș + țară, numele
  companiei invitate și al organizației.
- Program: `getDaySheetData(..., publicOnly: true)` — filtrul care servește
  deja day sheet-ul public (itemii cu `visibility_rules` excluși). Programul
  n-are departamente — v1 arată programul public-safe întreg.
- Hotel: din `day_hotels` doar nume, oraș, check-in/check-out (fără room
  list, fără note).
- Fișierele departamentului: attachments-urile ZILEI din categoria companiei,
  download prin URL-uri semnate (service client, expirare ~1h) — inclusiv
  cele urcate de echipă pentru vendor (sensul invers al share-ului).
- Echipa voastră: `tour_personnel` cu `company_id` = compania lui, pe turul
  event-ului (nume/rol/telefon).

**Face:**
- „Adaugă persoană" — nume* (obligatoriu), rol, telefon, email → server
  action `addVendorEmployee(token, input)`: re-validare token, tur derivat
  din event, insert `tour_personnel` cu `company_id`; sanitizare strictă
  (lungimi, trim). Poate șterge DOAR rândurile cu `company_id`-ul lui.
- „Urcă fișier" — `POST /api/vendor/[token]/upload` (multipart, max 50MB):
  validare token → storage `{orgId}/vendor/{companyId}/{uuid}-{nume}` →
  insert `attachments` pe ZIUA show-ului cu `category_id` = categoria
  companiei, `uploaded_by` null → advancing-ul SP3b se bifează singur.

**NU există în pagină prin construcție:** fee, P&L, costuri, alți vendori,
alte categorii, room lists, note interne, link-uri către app. Pagina e
standalone; bilingvă simplu (RO/EN după `Accept-Language`, fallback EN).

## 3. Partea echipei

- **Pagina de zi** (`DayActionsBar`, lângă „Share day sheet"): buton „Share
  cu vendor" → secțiune per event: select companii (cele cu categorie
  marcate; fără categorie → hint „fișierele nu vor fi vizibile"), „Creează
  link + trimite email" → `createVendorLink(orgSlug, eventId, companyId)`:
  revocă automat link-ul viu anterior, creează, trimite email prin Resend la
  `companies.email` (fără email → doar link copiabil + hint), afișează URL-ul
  cu copy (pattern-ul share-day).
- **Lista link-urilor** per event: companie · creat/expiră · status
  (viu/expirat/revocat) · Copy · Retrimite email · Revoke (confirm).
  Gate `edit_tour_content`. Nimic automat la crearea event-ului (ecranul
  obligatoriu din §11 = follow-up).
- **Companies (contacts):** select nou „Departament (categoria de fișiere)"
  pe formularul de companie — singura schimbare acolo.
- **Email** (`lib/email.ts`): template text simplu cu link + expirare;
  eșecul trimiterii NU strică crearea link-ului (warning, pattern
  attachmentError din C3).

## 4. Margini

- Companie fără categorie → secțiunea de fișiere goală cu mesaj
  („departament neconfigurat"), upload dezactivat.
- Angajat șters de echipă → dispare din portal. Link expirat → pagină neutră.
  Event/companie șterse soft → 404 neutru.
- Rate limiting simplu pe scrieri: max 20 angajați + 30 fișiere per link
  (contoare la validare) — anti-abuz pe endpoint public.
- Numele de fișiere sanitizate (pattern-ul C3 header/path).

## 5. Migrare, testare

**`00034_vendor_portal.sql`**, aditivă: `vendor_links` + RLS + cele două
coloane noi. **Test SQL `faza1f_vendor_rls.test.sql`** (alfabetic: faza1e <
faza1f < faza2): echipa CRUD pe `vendor_links`, crew nu, cross-org nu.
Accesul anonim trece prin service client (în afara RLS) — verificat la smoke.

**Vitest (TDD):** `lib/vendorPortal.ts` — validarea/shaping-ul input-ului de
angajat (lungimi, trim, câmpuri permise), starea link-ului
(viu/expirat/revocat) dintr-un rând, verificarea limitelor (20/30).

**Standard:** suita RLS, `check-i18n`, `tsc --noEmit`, `pnpm build`.
**Smoke post-deploy prin Chrome:** companie cu categoria SFX → link + email →
portal în incognito (program+hotel vizibile, nimic financiar) → adaug angajat
→ apare în crew list-ul turului → urc fișier → apare în categoria SFX pe zi +
advancing crește → revoke → pagina moare → cleanup.

## Excluse intenționat (YAGNI)

Ecranul obligatoriu de share la Create Event, share-ul către parties pe email
(partea de sus a §11 — separat), slot-uri per departament în program,
conturi/sesiuni vendor, notificări către echipă la upload, editarea
angajaților din portal (doar add/delete), ZIP-uri, personal view (§9.6).

## Criterii de succes

1. Vendorul cu link vede DOAR pachetul lui (program public, hotel, fișierele
   categoriei) — nimic financiar, niciun alt vendor.
2. Vendorul adaugă angajați → apar instant în crew list-ul turului cu capsula
   companiei.
3. Vendorul urcă fișierul cerut → aterizează în categoria lui pe zi și
   advancing-ul crește.
4. Revoke → portalul moare imediat.
5. Zero regresii pe share-ul de day sheet existent.
