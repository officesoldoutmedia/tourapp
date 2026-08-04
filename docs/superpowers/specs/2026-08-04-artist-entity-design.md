# Entitatea Artist — design

**Data:** 2026-08-04
**Status:** aprobat în brainstorming, în așteptarea review-ului pe spec
**Sursa:** feedback Zola (production manager) — `APP DEV ZOLA ADVANCING - V1.docx`

## Context și motivație

Aplicația e construită pe modelul Org → Tur → Zile → Event-uri (stil Master Tour: un
artist, un turneu lung). Realitatea business-ului e alta: **roster de artiști activi**,
cu show-uri **majoritar one-off** (festivaluri, cluburi, private). Documentul Zolei
propune reorganizarea în jurul artistului: template-uri per artist, dashboard peste
roster, acces per artist.

Scopul complet e prea mare pentru un singur spec. Descompunere agreată:

1. **Sub-proiectul 1 (acest spec):** entitatea Artist — fundația.
2. Sub-proiectul 2: flow „New Event" one-off cu pre-populare + Master Dashboard.
3. Sub-proiectul 3: quick wins Faza A (advancing % automat, km/per-diem, file
   metadata, travel parties ca entitate).
4. Faza C (ulterior): reverse scheduling, share per party, vendor portal, contract
   templates.

## Decizii clarificate cu utilizatorul

- **Business:** mai mulți artiști activi acum — roster-ul e realitatea zilnică.
- **Show-uri:** majoritar one-off-uri; turneele clasice sunt rare.
- **Date:** producție cu date reale în uz — migrare aditivă obligatorie, fără resetări.
- **Acces:** managementul (administrator/accounting/manager) vede tot; crew-ul vede
  doar artistul la care e asignat.

## Abordarea aleasă

**A. Artist deasupra turneelor — schemă minimă, UX complet.**

`artists` + `tours.artist_id`. Pagina artistului agregă zilele tuturor turneelor lui
într-un singur timeline — „calendarul artistului" e o interogare, nu o schimbare de
schemă. Lanțul RLS existent (totul atârnă de tur) rămâne intact.

Alternative respinse:

- **B. Event standalone real** (event legat direct de artist, zile opționale): rupe
  lanțul RLS, toate URL-urile și majoritatea paginilor; cost 5–10× față de A fără
  beneficiu vizibil suplimentar.
- **C. Artist ca etichetă pe tur** (câmp text + filtru): nu susține template-uri per
  artist, acces per artist, dashboard — ar fi reconstruit totul la sub-proiectul 2.

## 1. Modelul de date

Tabelă nouă `public.artists` (aceleași convenții ca restul: uuid PK, timestamps,
soft-delete prin `deleted_at`, `organization_id` FK cu cascade):

| Câmp | Tip | Notă |
|---|---|---|
| `name` | text not null | Nume de scenă |
| `slug` | text not null | Pentru URL; unic per org |
| `legal_name` | text | Entitatea juridică — pregătit pentru contracte (§13 Zola) |
| `photo_path` | text | Supabase Storage, ca la `tour_personnel.photo_path` |
| `home_base_city` | text | Punct de plecare — fundația calculului de km (sub-proiect 3) |
| `home_base_lat`, `home_base_lng` | numeric | Din Google Places |
| `default_currency` | text | Valuta implicită |
| `timezone` | text | Auto din home base, editabil |
| `color` | text | Culoarea artistului în calendar (§2.4 Zola) |
| `links` | jsonb | Spotify, IG, YouTube, site |
| `is_archived` | boolean not null default false | Pentru artiști ieșiți din roster |
| `created_by` | uuid FK auth.users | |

Constrângere: `unique (organization_id, slug)`.

Legătura cu schema existentă — **o singură coloană nouă**: `tours.artist_id` FK către
`artists`, NOT NULL după backfill (vezi §4). Zilele, event-urile, crew-ul, finanțele
nu se mută — atârnă deja de tur.

Fișiere permanente per artist (§3.2 Zola): enum-ul `attachment_parent` primește
valoarea `artist`; upload pe profilul artistului. Moștenirea fișierelor în event-uri
NU intră aici (sub-proiectul 3).

**Excluse intenționat din acest sub-proiect:** bucket-uri pentru one-off-uri
(sub-proiectul 2), template-uri per artist (crew/deal/parties — vin cu
funcționalitățile care le consumă). Schema de față nu le blochează.

## 2. Accesul per artist

Zero schimbări de schemă: `visibility_rules.subject_type` e text liber — se adaugă
tipul nou `'artist'`.

Semantica (identică cu mecanismul existent din `private.can_see_subject`):

- Artist fără reguli → vizibil întregii organizații.
- Artist cu reguli → doar userii/grupurile țintite.
- `has_min_permission('manager')` scurtcircuitează → administrator, accounting și
  manager văd întotdeauna tot.

**Punct unic de aplicare:** politica RLS de pe `tours` devine „vezi turul dacă vezi
turul ȘI vezi artistul lui" (`can_see_subject(org,'tour',id) AND
can_see_subject(org,'artist',artist_id)`). Toate celelalte tabele își derivă accesul
din vizibilitatea turului, deci restricția cascadează automat în toată aplicația,
inclusiv feed-urile iCal. Nicio altă politică nu se atinge.

RLS pe `artists`: citire pentru membrii org filtrată prin `can_see_subject`
(`'artist'`), scriere pentru manager+.

UI: pe profilul artistului, secțiunea „Acces" — implicit „toată organizația", cu
restricție la grupuri/useri. Pattern recomandat: un grup per artist (ex. „SPEAK
Crew"), refolosind pagina de grupuri.

Neatinse: share links (publice prin token) și permisiunile de guest list.

## 3. Navigare și UI

- **`/o/[orgSlug]` devine Roster-ul** (înlocuiește redirect-ul la primul tur): grilă
  de artiști — poză, nume, culoare, următorul show, câte show-uri urmează. Master
  Dashboard-ul complet rămâne sub-proiectul 2.
- **`/o/[orgSlug]/a/[artistSlug]`** — pagina artistului, trei taburi:
  - **Date:** timeline-ul tuturor zilelor artistului peste toate turneele,
    cronologic, cu tip zi + advancing status; rândurile duc la paginile de zi
    existente.
  - **Profil:** editare poză, nume, entitate juridică, home base (refolosește
    `/api/travel/autocomplete`; timezone auto), valută, links, culoare, arhivare.
  - **Acces:** regulile de vizibilitate + fișierele permanente ale artistului.
- **Sidebar:** switcher de artist (avatar + nume) deasupra navigării de tur.
  Breadcrumbs: Org → Artist → Tur → Zi.
- **Neschimbat:** toate URL-urile `/t/[tourId]/...` și paginile de tur/zi/event.
  Mobilul nu se atinge. Retușuri: „New tour" cere artistul; Tour Settings primește
  selector de artist (reasignare).
- **Drepturi:** creare/arhivare artist — manager+; roster-ul e filtrat automat de RLS.
- **i18n:** stringurile noi intră în `messages/` pentru toate limbile existente.

## 4. Migrare și rollout

O singură migrare SQL aditivă (`00025_artists.sql`):

1. Creează `artists` + politicile RLS.
2. Adaugă `tours.artist_id` nullable.
3. **Backfill:** pentru fiecare org cu tururi, creează un artist cu numele
   organizației și leagă toate tururile de el. Apoi `artist_id` → NOT NULL.
4. `alter type attachment_parent add value 'artist'` (valoarea nu e folosită în
   aceeași migrare — restricția Postgres e respectată).
5. Înlocuiește politica de pe `tours` cu varianta care verifică și artistul.

Post-deploy (manual, în UI): redenumirea artistului auto-creat în numele real, poză /
culoare / home base, crearea restului roster-ului, reasignarea tururilor dacă e cazul.
Zero downtime; în cel mai rău caz aplicația arată ca înainte, cu un nivel nou deasupra.

Ștergerea unui artist: blocată cât timp are tururi (FK `restrict`) — se arhivează.

## 5. Testare

- **Teste RLS** pe setup-ul local din `docs/VERIFICATION.md`:
  - managerul/accounting/adminul văd toți artiștii și toate tururile;
  - user cu regulă pe artistul X vede doar tururile/zilele/travel-ul/hotels lui X;
  - artist fără reguli → vizibil tuturor membrilor;
  - cascada verificată explicit pe zile, travel, hotels, iCal;
  - tur fără reguli proprii dar cu artist restricționat → invizibil.
- **Vitest** pentru helperul de timeline (agregarea zilelor peste tururi).
- **Smoke manual post-deploy:** redenumire artist, reasignare tur, mobil și share
  links neschimbate.

## Criterii de succes

1. Roster-ul cu ≥2 artiști funcționează pe datele de producție existente, fără
   pierderi.
2. Un user de crew cu regulă pe artistul X nu vede nimic din artistul Y (verificat
   prin teste RLS).
3. Toate URL-urile și flow-urile existente funcționează neschimbat.
4. Sub-proiectul 2 (New Event + Master Dashboard) poate începe fără alte schimbări
   de schemă pe `artists`/`tours`.
