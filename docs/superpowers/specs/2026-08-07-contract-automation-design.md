# Contract automation — design (Faza C3)

**Data:** 2026-08-07
**Status:** aprobat în brainstorming, în așteptarea review-ului pe spec
**Sursa:** feedback Zola §13 (crew admin & contract automation); al treilea
sub-proiect din Faza C, după C1 deal templates și C2 reverse scheduling
(livrate). Ordinea Fazei C decisă cu utilizatorul: C1 → C2 → C3 → C4.

## Decizii clarificate cu utilizatorul

- **Scope C3 = fluxul core:** contract-cadru per entitate + legal & billing
  extins + generarea automată a anexei la asignarea pe show. Consola Crew
  Admin transversală, facturile cu reconciliere și bulk ZIP = **C3b**,
  sub-proiect separat.
- **Template-uri = PDF nativ cu text configurabil** (blocuri cu merge fields,
  randate prin pattern-ul react-pdf existent — 8 rute, inclusiv AnnexPdf).
  Respins DOCX cu placeholdere: conversia DOCX→PDF e impracticabilă pe
  Cloudflare Workers, iar output-ul .docx rupe fluxul de semnat.
- **Identitatea juridică = registru org-level nou `crew_entities`** —
  contractele traversează turneele/artiștii; `tour_personnel` (per tur) se
  leagă opțional de entitate; `billing_details` existent rămâne fallback și
  sursă de pre-completare.
- **Multi-entitate emitentă în C3** (`issuing_entities`, §13.4 — ex.
  ARTPROCESS vs AKOKO); billing-ul actual din `organizations.settings.billing`
  devine prima entitate prin seed la migrare.
- **Abordarea A:** subsistem nou `contract_documents`, SEPARAT de
  `payment_annexes` (plățile batch existente rămân neatinse — concepte
  diferite: calup financiar vs document juridic per event).

## 1. Modelul de date (migrarea `00033_contracts.sql`, aditivă)

**`crew_entities`** (org-level, registrul juridic; §13.3): `entity_type`
(`srl`/`pfa`/`ii`/`individual`/`foreign`), `display_name`, `company_name`,
`cui`, `reg_com`, `address`, `representative`, `iban`, `bank`,
`vat_payer boolean`, `fiscal_country` (default `RO`), `id_document` (doar PF),
`default_rate numeric` + `rate_unit` (`per_show`/`per_day`) +
`rate_currency`, `payment_terms_days integer`, `doc_language`
(`ro`/`en`/`bi`), timestamps + soft-delete + `organization_id`.
**Link:** `tour_personnel.crew_entity_id` (FK set null).

**`issuing_entities`**: `name`, `cui`, `reg_com`, `address`, `iban`, `bank`,
`representative`, `is_default boolean`, soft-delete, `organization_id`.
Seed la migrare din `organizations.settings.billing` (dacă există).

**`contract_templates`**: `name`, `doc_kind` (`framework`/`annex`; enum-ul
permite extinderi, UI-ul v1 expune doar cele două), `body jsonb` (blocuri de
text cu `{{merge.fields}}`), reguli de asignare opționale (`match_role`,
`match_department`, `match_entity_type` — null = orice), `issuing_entity_id`
FK, `series_prefix text` + `series_next integer`, `sort_order`, soft-delete.

**`contract_documents`**: `kind` (`framework`/`annex`), `crew_entity_id` FK
cascade, `template_id` FK set null, `issuing_entity_id` FK set null,
`event_id` FK set null (doar anexe), `doc_number text` (imutabil),
`merge_snapshot jsonb` (TOATE valorile la generare — PDF-ul se randează
EXCLUSIV din snapshot, regula casei), `status`
(`generated`/`sent`/`signed`/`void`), `valid_until date` (doar framework —
sursa 🟢🟡🔴), `signed_storage_path text`, soft-delete, `organization_id`.
Partial unique index `(crew_entity_id, event_id) where kind='annex' and
status <> 'void' and deleted_at is null` (anti-dublură la re-toggle) +
unique `(organization_id, doc_number)` (backstop pe serie).

**RLS:** `crew_entities` + `contract_documents` pe pattern-ul
`can_edit_tour_accounting` (admin/accounting, ca 00020); `issuing_entities` +
`contract_templates` citire membri, scriere manager+. `payment_annexes`
neatins.

## 2. Merge fields, randare, numerotare, blocare

**Dicționarul** (§13.5, mapat pe model): `{{company.*}}` din entitatea
emitentă (name, cui, reg_com, address, iban, bank, rep) · `{{crew.*}}` din
crew_entity + rândul de personnel (entity_name, cui, reg_com, address, iban,
bank, rep, role, vat_payer, payment_terms, id_document) · `{{event.*}}`
(date, city, country, venue, stage_time, artist, name) · `{{deal.fee}}` /
`{{deal.currency}}` / `{{deal.fee_in_words}}` · `{{doc.number}}` /
`{{doc.date}}` / `{{doc.framework_ref}}` / `{{doc.language}}`.

**Sursa fee-ului anexei:** linia de cost crew a persoanei pe event
(`show_costs.personnel_id` + event); fără linie → `default_rate` din
entitate; fără niciuna → gol (intră în blocare dacă template-ul îl
folosește). `{{deal.fee_in_words}}` prin helper pur nou
`lib/numberToWords.ts` (RO + EN, cu valuta în litere; obligatoriu în
contractele RO).

**Randarea:** logica pură în `lib/contractMerge.ts` —
`collectMergeValues(...)` construiește dicționarul, `fillTemplate(body,
values)` întoarce blocurile umplute + lista câmpurilor nerezolvate. Rută
PDF nouă `app/api/pdf/contract/[documentId]` (pattern AnnexPdf), randată
EXCLUSIV din `merge_snapshot` — template-ul editat ulterior nu schimbă
documentele emise.

**Regula de blocare (§13.3):** generarea rulează `fillTemplate` dry-run;
orice câmp folosit de template dar gol → refuz cu lista exactă a lipsurilor.
Acoperă natural `{{doc.framework_ref}}`: anexa fără contract-cadru semnat se
blochează doar dacă template-ul referențiază cadrul.

**Numerotarea:** `doc_number = series_prefix + next` (padding 4), increment
atomic pe `contract_templates.series_next` (update…returning), unique-ul
org+doc_number ca race backstop.

**`{{doc.framework_ref}}`:** ultimul document framework `signed` al
entității, preferat cel cu `valid_until` ≥ data event-ului.

## 3. UI și fluxul automat

- **Settings → „Entități emitente"** — CRUD mic (pattern file-categories),
  toggle default.
- **Settings → „Template-uri de contract"** — listă + editor (pattern
  editorul C2): nume, tip, regulile de asignare, emitentul, seria, body-ul ca
  blocuri de text cu chips-uri de inserare a merge fields.
- **Registru juridic** — pagină org-level nouă `app/o/[orgSlug]/crew/`:
  lista entităților (nume, tip, CUI, status cadru 🟢activ / 🟡expiră <60
  zile / 🔴lipsă) + detaliu: formularul Legal & Billing complet și secțiunea
  Contracte-cadru (generare din template-ul auto-detectat după regulile de
  asignare, download PDF, upload semnat + `valid_until`). Din profilul de
  crew al turneului: select „Entitate juridică" + „Creează din datele de
  facturare" (pre-completare din `billing_details`).
- **Fluxul automat (§13.6):** la asignarea pe show (toggle-ul „This show's
  crew" din Costs & profit) — entitate legată + template de anexă potrivit +
  profil complet → anexa se generează AUTOMAT (număr, snapshot, status
  `generated`), discret; la blocare, auto-generarea se abține silențios, iar
  pe rândul de crew apare „Generează anexa" care la click arată lista
  lipsurilor. Secțiune nouă „Contracte" pe pagina Costs: download PDF,
  „Trimis la semnat", upload semnat, void.
- **Semnatul devine fișier real:** upload-ul semnatului se salvează ca
  attachment pe ZIUA show-ului în categoria **Admin** (§13.6 pasul 5) —
  se leagă natural de advancing-ul SP3b.

## 4. Margini

- Entitate ștearsă soft → documentele rămân (snapshot imutabil, numărul emis
  rămâne emis). Template șters → FK set null, documentele își păstrează
  snapshot + număr.
- Re-toggle crew off/on → partial unique index; a doua generare refolosește
  documentul viu (nu duplică, nu re-numerotează).
- Schimbarea seriei mid-an → doar documentele noi; coliziunile prinse de
  unique org+doc_number cu eroare clară.
- `fee_in_words` acoperă RON/EUR/USD cu valuta în litere.

## 5. Migrare, testare

**`00033_contracts.sql`**, aditivă: 4 tabele + `tour_personnel.crew_entity_id`
+ seed-ul primei entități emitente din `settings.billing` + RLS.

**Test SQL `faza1e_contracts_rls.test.sql`** (alfabetic: faza1d < faza1e <
faza2; cleanup standard): accounting-gate pe entități + documente, manager pe
template-uri + emitenți, crew read-block.

**Vitest (TDD):** `lib/numberToWords.ts` (RO+EN, zecimale/bani, valute) și
`lib/contractMerge.ts` (dicționar, umplere, lista nerezolvatelor, dry-run).

**Standard:** suita RLS, `check-i18n`, `tsc --noEmit`, `pnpm build`.
**Smoke post-deploy prin Chrome:** entitate emitentă → template de anexă cu
serie → entitate juridică legată de un membru → asignare pe show → anexă
generată cu număr → download PDF → upload semnat → apare în categoria Admin
+ advancing → cleanup.

## Excluse intenționat (YAGNI)

Consola transversală cu filtre + bulk actions + ZIP + facturi/reconciliere
(C3b — decizia utilizatorului), tipurile NDA/cesiune/vendor (enum permite,
UI nu), bilingv pe două coloane (v1: două template-uri, RO și EN),
trimiterea la semnat prin email (statusul „Trimis" e manual), e-signature,
statusurile Countersigned/Archived, notificări de expirare.

## Criterii de succes

1. Template + emitent definite o dată, omul legat de entitate → asignarea pe
   show produce anexa numerotată fără nicio scriere manuală de document.
2. Profil incomplet → generarea blocată cu lista exactă a lipsurilor.
3. Editarea template-ului NU schimbă documentele emise (snapshot).
4. Upload semnat → status `signed` + fișier în categoria Admin pe zi,
   vizibil în advancing.
5. Contract-cadru cu valabilitate → 🟢🟡🔴 corect în registru.
