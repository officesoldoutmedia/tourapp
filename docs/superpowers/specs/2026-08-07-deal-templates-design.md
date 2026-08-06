# Deal templates — design (Faza C1)

**Data:** 2026-08-07
**Status:** aprobat în brainstorming, în așteptarea review-ului pe spec
**Sursa:** feedback Zola §6 (deal templates) + §10.4 (obligatorii per deal type);
primul sub-proiect din Faza C. Continuă SP1–SP3b (livrate). Ordinea Fazei C
decisă cu utilizatorul: C1 deal templates → C2 reverse scheduling → C3 contract
automation → C4 vendor portal.

## Decizii clarificate cu utilizatorul

- **Per artist** — fiecare artist își are template-urile lui (fee-uri diferite);
  consistent cu parties/home base din SP3a.
- **Scope v1:** FEE (sumă/valută/deal basis/withholding %), LANDED ITEMS
  (checklist), CAZARE (informativ), CATEGORII DE FIȘIERE OBLIGATORII per deal
  type (§10.4). Transport terestru și diurna RĂMÂN pe artist/parties (SP3a) —
  fără surse duble de adevăr. Transport aerian exclus.
- **Abordarea A:** tabelă `deal_templates` + SNAPSHOT jsonb pe event la aplicare
  (regula casei: template-ul modificat nu schimbă retroactiv show-urile);
  respinse coloanele normalizate (B) și referința live (C).
- Numele deal-urilor: text liber; cele 5 tipuri Zola (Festival/Club/Private/
  Corporate/Showcase) = sugestii rapide, nu enum.

## 1. Modelul de date

**`deal_templates`** (per artist; uuid PK, timestamps, `deleted_at`,
`organization_id` + `artist_id` FK cascade, `created_by`):

| Câmp | Detaliu |
|---|---|
| `name text not null` | „Festival", „Club"… |
| `fee_amount numeric`, `fee_currency text` | Fee-ul default |
| `deal_basis text` | `landed` / `all_in` / `fee_plus_costs` |
| `withholding_percent numeric` | Reținere la sursă |
| `landed_items jsonb` (default `[]`) | Array de stringuri bifate |
| `accommodation jsonb` (default `{}`) | `{ rooms_single, rooms_double, category, nights }` |
| `required_category_ids uuid[]` (default `{}`) | §10.4 — obligatorii per deal type |
| `sort_order integer` | Ordinea în selecturi |

**Pe `events`:** `deal_template_id uuid` (FK `deal_templates` on delete set
null — doar proveniență) + `deal_snapshot jsonb` — copia valorilor la aplicare.
Consumatorii citesc EXCLUSIV din snapshot.

**RLS:** politici pe pattern-ul `artist_parties` din SP3a — select prin
`is_org_member` + `can_see_subject('artist')`, scriere
`can_edit_tour_content(private.artist_org(artist_id))` cu with-check care leagă
`organization_id = private.artist_org(artist_id)` (helperul există din SP3a).
Snapshot-ul pe event călătorește pe lanțul RLS existent.

## 2. Aplicarea template-ului

**Unde:** (1) wizard-ul „Show nou" — select „Deal" opțional, populat la alegerea
artistului; (2) pagina Costs & profit — select „Deal" + buton „Re-aplică";
suprascrierea unui fee deja introdus manual cere confirmare.

**Efectele aplicării, în ordine:**
1. `deal_template_id` + `deal_snapshot` scrise pe event.
2. **Fee:** upsert `show_finances.fee`/`fee_currency` din snapshot — DOAR dacă
   fee-ul curent e gol/zero SAU userul a confirmat suprascrierea.
3. **Withholding:** `withholding_percent > 0` → linie de cost prin mecanismul
   SP3a: `generated_key: 'withholding'`, kind `extra`,
   `billable_to_booker: false`, etichetă „Impozit reținut {p}% — {sumă}", suma
   = round2(p% × fee-ul aplicat). Editabilă/ștergibilă; re-aplicarea face
   upsert, nu duplică.
4. **Landed items + cazare:** doar în snapshot; afișate (§3).
5. **Categorii obligatorii:** citite din snapshot la calculul advancing (§4).

**Snapshot:** „Re-aplică" e acțiune explicită (reface snapshot-ul din template-ul
curent + repetă pașii 2–3 cu confirmare). Schimbarea template-ului nu atinge
show-urile existente.

## 3. UI

- **Profil artist — tab nou „Deals"** (al 4-lea): listă + CRUD + reordonare
  (gate manager+, pattern `parties-client` SP3a). Formular: nume (chips-uri cu
  cele 5 sugestii când lista e goală), fee + valută, deal basis (radio),
  withholding %, checklist landed items (lista standard: SFX, Pyro, CO2,
  Lasers, Confetti, Risers, LED, Backline, Local crew + itemi liberi), cazare
  (single/double/categorie 3–5★/nopți), multi-select categorii obligatorii din
  `file_categories`.
- **Costs & profit — card „Deal"** (între fee și crew): numele + basis +
  withholding, landed items ca pastile, cazarea pe scurt; selectul de
  aplicare/schimbare + „Re-aplică". Fără deal → doar selectul.
- **Wizard „Show nou":** selectul „Deal" sub template-urile de program/advancing,
  reîncărcat la schimbarea artistului.

## 4. Advancing per deal type

În helperul comun `computeProgressOfDays` (SP3b):
- Zi cu ≥1 event cu `deal_snapshot.required_category_ids` NE-gol → setul
  obligatoriu al zilei = UNIUNEA listelor din snapshot-urile event-urilor.
- Altfel → fallback pe setul global `is_required` (comportamentul de azi).
- Restul regulilor neschimbate; modificarea e izolată în helper + datele pasate
  de cele 3 pagini (day/dashboard/timeline).

## 5. Migrare, RLS, testare

**`00031_deal_templates.sql`**, aditivă: tabela + coloanele pe events + RLS.
**`faza1d_deals_rls.test.sql`** (alfabetic: faza1c < faza1d < faza2; cleanup
standard): CRUD manager, crew read-only, cascada prin restricția de artist.

**Vitest (TDD):** `lib/dealSnapshot.ts` — `buildDealSnapshot(template)` (câmpuri
exacte), `requiredCategoriesForDay(snapshots, orgRequiredIds)` (uniune vs
fallback), `withholdingLine(percent, fee, currency)` (round2, etichetă, cheia
`withholding`); + teste extinse `computeProgressOfDays`.

**Standard:** suita RLS, `check-i18n`, `tsc --noEmit`, `pnpm build`.
**Smoke post-deploy prin Chrome:** template „Festival" pe SPEAK (withholding +
categorii obligatorii) → show nou cu deal → fee pre-populat, linia de
withholding în P&L, cardul Deal cu pastile, advancing pe setul template-ului →
cleanup.

## Excluse intenționat (YAGNI)

Valoarea monetară a landed items ca income (§12 — follow-up), transport aerian,
prețuri cazare, offset-uri de program pe template (C2 — tabela e pregătită),
deal basis cu efect de calcul (informativ la v1).

## Criterii de succes

1. Template „Festival" definit o dată pe SPEAK → show nou cu deal-ul ales are
   fee-ul în P&L și linia de withholding generată, fără nicio introducere
   manuală.
2. Cardul Deal arată landed items + cazarea pe pagina de costuri.
3. Advancing-ul unei zile cu deal folosește categoriile template-ului; zilele
   fără deal rămân pe setul global (zero regresii).
4. Schimbarea template-ului pe artist nu modifică show-urile existente;
   „Re-aplică" da, cu confirmare.
