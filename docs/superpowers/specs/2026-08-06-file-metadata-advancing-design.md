# File metadata + advancing % automat — design (SP3b)

**Data:** 2026-08-06
**Status:** aprobat în brainstorming, în așteptarea review-ului pe spec
**Sursa:** feedback Zola §10 (Files & Documents) + §10.4/§2.3 (advancing automat);
al doilea cluster din Sub-proiectul 3. Continuă SP1–SP3a (livrate).

## Decizii clarificate cu utilizatorul

- **Obligatorii:** câmpurile se marchează în advance template/layout (`required` în
  jsonb); categoriile de fișiere obligatorii se marchează per org. Template-urile
  joacă rolul deal type-urilor până există acestea.
- **Versiuni:** lanț (`supersedes_id`), ultima versiune afișată cu badge, istoricul
  expandabil și descărcabil.
- **Statusuri:** set redus `draft` / `approved` / `final` + `superseded` setat
  AUTOMAT pe predecesor la upload de versiune nouă.
- **Due dates:** vizual — placeholder „fișier așteptat" cu deadline, badge roșu
  overdue pe zi și în Upcoming/dashboard; fără notificări (Faza C).
- **Abordarea A:** extindere in-place pe `attachments` + `required` în layout-ul
  jsonb existent (zero schimbări pe `advances`); respinse tabelele separate (B) și
  varianta minimală (C).

## 1. Schema

**Tabelă nouă `file_categories`** (per org): `name`, `is_required boolean not null
default false`, `sort_order`, timestamps + soft-delete, `organization_id` FK.
**Seed la migrare** pentru fiecare org existent, lista Zola §10.2: Show files,
Video/VJ, Lighting, SFX, Technical, Hospitality, Admin, Post-show. Editabile în
settings.

**`attachments` extins:**

| Coloană | Detaliu |
|---|---|
| `category_id` | FK → `file_categories`, on delete set null; `tags` rămân neatinse |
| `status` | enum nou `attachment_status`: `draft` (default) / `approved` / `final` / `superseded` |
| `due_date date` | Deadline de predare |
| `supersedes_id` | self-FK; v3 → v2 → v1; NUMĂRUL versiunii = lungimea lanțului (calculat) |
| `storage_path` | devine NULLABLE; rând fără fișier = placeholder „fișier așteptat" |

**Advance layout (jsonb, fără migrare):** itemii `type: "field"` primesc opțional
`required: true`; checkbox nou în editorul de layout; template-urile îl propagă
automat (layout-ul se copiază deja la creare).

Nimic stocat pe `advances`/`events` — procentul e calculat.

## 2. Calculul advancing-ului

**Helper pur `lib/advanceProgress.ts`** → `{ done, total, percent }`:

- **Câmpuri obligatorii:** itemii `field` cu `required: true` din layout-urile
  advance-urilor show-ului; completat = valoare non-goală în `event_field_values`.
- **Fișiere obligatorii:** categoriile org cu `is_required`; completat = attachment
  REAL pe ziua respectivă în categoria aia (storage_path non-null, status ≠
  `superseded`, nesters).
- `percent = done/total`; culori §2.3: gri 0%, galben 1–99%, verde 100%.
  („Locked/Day sheet sent" = Faza C.)
- **Fallback:** `total = 0` (niciun obligatoriu definit) → procentul manual
  existent din statusurile advances, neschimbat.

**Propagare** (înlocuiește agregatul manual):
1. badge-ul de pe pagina de zi / advance;
2. `buildArtistTimeline` (câmpul `advance`);
3. dashboard — next event card + `buildUpcoming`.
Datele pentru dashboard (10 zile) vin din extinderea query-urilor bulk existente
(layouts + field values + attachments), join în memorie ca până acum.

## 3. Files UI pe zi + moștenirea

Secțiunea de attachments a zilei se reorganizează **pe categorii**
(necategorisate sub „Fără categorie"):

- Per fișier: nume, badge versiune (`vN` din lanț), pastilă status (select pentru
  editori), due date + badge roșu overdue, download.
- **„Versiune nouă"** → upload → rând nou legat de predecesor; predecesorul devine
  automat `superseded`; istoric expandabil, versiunile vechi descărcabile.
- **„Așteaptă fișier"** → categorie + deadline (+ nume opțional) → placeholder;
  upload-ul pe placeholder îl transformă în fișier real (completează
  storage_path/mime/size, păstrează categoria/due date-ul).
- **Moștenire (§10.6):** sub-secțiune „Din profilul artistului" — fișierele cu
  parent `artist` ale artistului turului, read-only, marcate *inherited*,
  descărcabile. NU se copiază; override local = fișier propriu pe zi în aceeași
  categorie. Fișierele artistului primesc selectul de categorie în tabul Acces.

**Settings:** pagină nouă „Categorii de fișiere" în hub (CRUD + reordonare + bifă
Obligatoriu, cu explicația legăturii cu advancing).

**Editor advance layout:** checkbox „Obligatoriu" pe itemii field — singura
schimbare acolo.

## 4. Migrare, RLS, testare

**`00030_file_metadata.sql`**, aditivă: `file_categories` + politici (citire
membri org, scriere manager+ — org derivat, NU client-supplied; lecția SP3a),
coloanele pe `attachments` + enum nou `attachment_status` (CREATE TYPE — fără
restricția de tranzacție a lui ADD VALUE), `storage_path` nullable, seed-ul
categoriilor. Zero schimbări de politici pe `attachments`.

**Test SQL `faza1c_files_rls.test.sql`** (ordine alfabetică verificată:
faza1b < faza1c < faza2; cleanup ca la faza1a/1b): seed-ul prezent, crew citește
categoriile, crew nu scrie, placeholder + versiune vizibile prin lanțul existent.

**Vitest (TDD):** `lib/advanceProgress.ts` (fallback total=0, mix câmpuri+fișiere,
superseded/placeholder excluse) și `lib/fileVersions.ts` (număr versiune din lanț,
ordonarea istoricului, lanțuri rupte tratate defensiv).

**Standard:** suita RLS, `check-i18n`, `tsc --noEmit`, `pnpm build`.

**Smoke post-deploy prin Chrome:** categorie obligatorie + câmp obligatoriu →
procentul de pe dashboard reacționează la completare/upload; versiune nouă (badge
v2, istoric, v1 superseded); placeholder cu deadline depășit → badge roșu; cleanup.

## Excluse intenționat (YAGNI)

Naming convention automată (§10.5), vizibilitate per departament (§10.3 — cere
modelul de crew din Faza C), auto-share (§11), notificări email/push pe due dates,
statusul „Locked / Day sheet sent", legarea fișierelor de slot-uri (§9.3).

## Criterii de succes

1. Marchezi un câmp obligatoriu + o categorie obligatorie → procentul de advancing
   de pe dashboard/timeline devine real și se mișcă la completare/upload.
2. Show-urile fără obligatorii definite arată exact procentul de dinainte
   (fallback-ul manual) — zero regresii vizuale.
3. Versiunile: urci v2 → v1 devine superseded, istoricul rămâne descărcabil.
4. Placeholder cu deadline depășit → badge roșu pe zi și în Upcoming.
5. Fișierele artistului apar inherited pe fiecare zi a lui, fără copiere.
