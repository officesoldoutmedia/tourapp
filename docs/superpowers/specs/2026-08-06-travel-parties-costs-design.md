# Travel parties + costuri calculate (diurnă, €/km) — design (SP3a)

**Data:** 2026-08-06
**Status:** aprobat în brainstorming, în așteptarea review-ului pe spec
**Sursa:** feedback Zola §6 (transport, per diem) + §7 (travel parties); primul
cluster din Sub-proiectul 3 (quick wins Faza A). Clusterul B (file metadata +
advancing % automat) urmează separat.

## Decizii clarificate cu utilizatorul

- **Parties per artist, moștenite în tururi** — template pe artist, SNAPSHOT la
  crearea turului/show-ului (regula Zolei: modificarea template-ului nu schimbă
  retroactiv show-urile existente).
- **Costurile calculate intră în P&L cu un click** — panoul „Calculat" pe pagina
  de costuri generează linii normale `show_costs`, editabile; fără sincronizare
  automată.
- **Rata €/km pe profilul artistului** — lângă home base; diurna per party.
- **Abordarea A:** template + snapshot (`artist_parties` → `tour_parties`),
  respinsă referința live (ar încălca regula de snapshot).

## 1. Modelul de date

**`artist_parties`** (template, per artist): `artist_id` FK cascade, `name`,
`per_diem_rate numeric` (null/0 = fără diurnă), `per_diem_currency text`,
`sort_order`, timestamps + soft-delete ca restul.

**`tour_parties`** (snapshot, per tur): aceleași câmpuri + `tour_id` FK cascade.
Editabile local; fără FK către template (snapshot adevărat).

**`tour_personnel.party_id`** — FK nullable → `tour_parties` (on delete set null).
Coloana text `party` rămâne pentru compatibilitate; UI-ul trece integral pe FK.

**`artists`** + `ground_rate_per_km numeric`, `ground_rate_currency text`.

**`show_costs.generated_key text`** — nullable; marker stabil pentru liniile
generate (`per_diem:{tour_party_id}` / `ground_transport`). Butonul „Adaugă în
costuri" face upsert pe `(event_id, generated_key)` — de aici „actualizează, nu
duplică". Liniile manuale au `generated_key NULL` și nu sunt atinse niciodată.

**Neatinse:** `travel_items.party`, `day_hotels.party` (text liber) — se leagă de
entitate la rooming/manifest (luna 2 Zola).

## 2. Moștenirea și UI-ul

- **Profil artist:** secțiune „Travel parties" sub home base — CRUD + diurnă +
  reordonare (manager+). Câmpuri noi €/km + valută în formularul de profil.
- **Snapshot:** la crearea turului (wizard) și la crearea bucket-ului one-off
  (DOAR prima dată — bucket-ul existent își păstrează parties-urile), rândurile
  `artist_parties` se copiază în `tour_parties`.
- **Backfill migrare:** textele distincte `tour_personnel.party` per tur devin
  rânduri `tour_parties` (fără diurnă), oamenii legați prin `party_id`.
- **Personnel (tur):** coloana Party = select din `tour_parties` + administrare
  „Parties" în header (adaugă/editează diurna local). Profilul de persoană
  folosește același select.
- **Reasignarea turului la alt artist:** parties-urile de tur rămân neatinse
  (snapshot — nu se re-copiază).

## 3. Panoul „Calculat" (pagina Costs & profit a show-ului)

**Diurnă** — rând per `tour_party` cu diurnă setată:
`headcount × rate × zile = total`; headcount = `tour_personnel` cu `party_id`-ul
respectiv (nesterși); zile = input editabil, default 1. Buton „Adaugă în costuri"
→ linie `show_costs` (kind `extra`) cu etichetă auto-generată
(ex. „Diurnă Crew — 6 × 45 EUR × 2 zile").

**Transport terestru** — `home base artist ↔ orașul zilei`:
- distanța din `computeGroundDistance` (Distance Matrix existent), pe lat/lng-ul
  artistului (există din SP1) și lat/lng-ul zilei (cache-uit pe `days`; dacă
  lipsește, geocodare pe city+country ca pe pagina de zi);
- afișată dus-întors (×2), cu **input km editabil manual** (pre-completat);
- total = km × `ground_rate_per_km`; buton „Adaugă în costuri" → linie
  „Transport {oraș} — {km} km".

**Reguli:**
- Re-apăsarea butonului **actualizează** linia generată anterior — upsert pe
  `show_costs.generated_key` (§1); nu duplică.
- Liniile adăugate sunt snapshot-uri — schimbarea ratelor nu le modifică;
  regenerare explicită.
- Valute mixte → conversia FX existentă din P&L.
- Rate lipsă (fără €/km, fără diurne, fără home base) → hint cu link către
  profilul artistului / administrarea parties; fără erori.
- Fără Google / fără distanță → input km gol, introducere manuală.

## 4. Migrarea și RLS

**`00029_travel_parties.sql`**, aditivă: cele două tabele + indexuri FK,
`tour_personnel.party_id`, coloanele de rată pe `artists`, backfill-ul descris
la §2. Zero ferestre de incompatibilitate (codul vechi ignoră coloanele noi).

**RLS:** `artist_parties` — select prin `is_org_member` + `can_see_subject('artist')`,
scriere `can_edit_tour_content`; `tour_parties` — select prin `can_access_tour`,
scriere `can_edit_tour_content`. Restricția pe artist din SP1 cascadează automat.
Test SQL nou `faza1b_parties_rls.test.sql` (ordonare alfabetică între faza1a și
faza2 — verificată): vizibilitate default, scriere refuzată crew-ului, cascada
prin restricția de artist, cleanup ca faza1a.

## 5. Testarea

- **Vitest (TDD)** pe `lib/costCalc.ts`: totaluri diurnă (null-safe), km
  dus-întors × rată, etichete de linie + match-ul de actualizare.
- **RLS:** fișierul de mai sus în suita `scripts/test-rls.sh`.
- **Standard:** `check-i18n`, `tsc --noEmit`, `pnpm vitest run`, `pnpm build`.
- **Smoke post-deploy prin Chrome:** rată €/km + party cu diurnă pe SPEAK →
  moștenire pe show nou → generare ambele linii → corectare km manual → P&L →
  cleanup.

## Excluse intenționat (YAGNI)

Transport/hotel defaults pe party (nu alimentează nimic încă), legarea
`travel_items`/`day_hotels` de entitate, share per party (Faza C), deal
templates (§6 complet), rooming list (luna 2).

## Criterii de succes

1. Parties definite o dată pe SPEAK apar automat pe fiecare show nou, cu diurnele
   lor, editabile local.
2. Pe un show, diurna și transportul se generează într-un click fiecare și apar
   în P&L; km-ul e corectabil manual.
3. Datele existente migrează fără pierderi (textele de party devin entități).
4. Restricția de vizibilitate pe artist acoperă și parties (verificat RLS).
