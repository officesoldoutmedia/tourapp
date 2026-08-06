# New Event one-off + Master Dashboard — design (Sub-proiectul 2)

**Data:** 2026-08-06
**Status:** aprobat în brainstorming, în așteptarea review-ului pe spec
**Sursa:** feedback Zola §2 (Master Dashboard) + §8 (New Event flow); continuă
`2026-08-04-artist-entity-design.md` (sub-proiectul 1, livrat).

## Context

Entitatea Artist e live (roster, pagini de artist, RLS per artist). Acest sub-proiect
livrează: crearea de show-uri one-off fără tur explicit (majoritatea business-ului)
și dashboard-ul peste roster ca pagină de start.

## Decizii clarificate cu utilizatorul

- **Landing:** pagina de org devine Master Dashboard complet — next event + upcoming
  + calendar + grila de roster, într-o singură pagină.
- **Pre-populare:** schelet complet la creare — schedule template + advancing
  inițializat + stage time.
- **Bucket-uri:** vizibile ca tururi normale (ex. „SPEAK 2026") — zero magie de UI.
- **Calendar:** grilă lunară cu puncte colorate per artist + filtru toggle pe artiști
  (default toți); fără views salvabile (Faza C).
- **Abordare:** pagină-wizard pentru New Event; calendar client-side pe date
  pre-încărcate server-side (scara actuală: sute de zile — corect și simplu).

## 1. Flow-ul „New Event"

**Intrări:** buton „Show nou" (primary) în header-ul dashboard-ului + pe tabul Date
al artistului (artist preselectat prin query `?artist=`). Gate `manage_tours`.

**Pagina** `/o/[orgSlug]/events/new` — server page + client form (pattern-ul
`tours/new`):

| Câmp | Comportament |
|---|---|
| Artist | Select, obligatoriu; preselect din `?artist=` sau singurul activ |
| Dată | Date picker, obligatoriu |
| Oraș / Țară | Text + țară; timezone auto (convenția din wizard-ul de tur: `suggestTimezone(country)` / `DEFAULT_TZ`) |
| Venue | Opțional — refolosește căutarea existentă de venue-uri (catalog org + Google Places) de la event-uri |
| Nume event | Opțional; default: numele venue-ului, altfel orașul |
| Stage time | Opțional — oră locală |
| Template program | Select opțional din `schedule_templates` ale org-ului |
| Template advancing | Select opțional din `advance_templates` ale org-ului |

**Acțiunea `createOneOffEvent` face, în ordine:**

1. **Find-or-create bucket:** turul cu `artist_id` + `bucket_year = year(dată)`;
   dacă lipsește → insert `on conflict do nothing` + select (race-safe prin indexul
   unic din §4), nume `{artist.name} {year}`, `created_by` userul curent.
   `start_date`/`end_date` ale bucket-ului se extind să acopere data nouă
   (min/max), la fiecare creare.
2. Creează **ziua**: `day_type='show'`, dată, oraș, țară, timezone.
3. Creează **event-ul** pe zi: titlu (numele din formular sau default-ul), legătura
   cu venue-ul dacă a fost ales (același mecanism ca la crearea de event pe pagina
   de zi).
4. **Aplică template-ul de program** pe zi — refolosește exact logica din
   `createTour` (`clockFromOffset` + insert `schedule_items`).
5. **Stage time** → un `schedule_item` „Show" la ora dată, `is_confirmed = true`,
   creat DUPĂ template (coexistă cu itemii lui).
6. **Template-ul de advancing** → creează `advances` pe event din layout-ul
   template-ului ales (mecanismul existent de la advance templates).
7. Validări: artistul aparține org-ului (regula din SP1, aceeași verificare
   RLS-scoped); dată validă. Redirect la pagina zilei create.

**Coliziune de zi:** dacă în bucket există deja o zi la data respectivă, acțiunea
NU creează alta — adaugă event-ul pe ziua existentă și redirecționează acolo.
La coliziune: pasul 4 (template de program) rulează DOAR dacă ziua nu are deja
schedule items (evită duplicarea); pașii 5 (item Show) și 6 (advancing) rulează
întotdeauna — advancing-ul e per event, iar itemul Show e al show-ului nou. Două
show-uri în aceeași seară = două event-uri pe aceeași zi, ca în modelul existent.

## 2. Master Dashboard (pagina de org)

Layout pe două coloane; dreapta sticky la scroll (stil documentul Zolei).

**Stânga:**
1. **Next Event card:** avatar + culoare artist, numele event-ului (sau venue/oraș),
   oraș + țară, dată + „în N zile", stage time-ul zilei (dacă există) și bara de
   advancing (procentul agregat existent). Stage time = itemul de program cu titlul
   exact `SHOW_SLOT_TITLE` — o constantă partajată (`lib/showSlot.ts`, valoare
   `"Show"`) folosită și de wizard la creare, și de dashboard la afișare; fără
   match pe stringuri traduse.
   Click → pagina zilei.
2. **Upcoming:** următoarele 10 zile de show peste toți artiștii vizibili: dată,
   pastilă/avatar artist, event/venue, oraș, țară, procent advancing. Click → ziua.
3. **Roster:** grila de artiști existentă, neschimbată, sub Upcoming.

`MetricStrip`-ul existent rămâne sus. Header: „Show nou" (primary) + „Artist nou" +
„Reports".

**Date:** o singură trecere server-side, extinzând query-urile deja existente în
pagină (tururi active + zile + maparea tur→artist); advancing agregat cu același
join în memorie ca pe timeline-ul artistului. RLS filtrează automat per user.

**Empty states:** fără artiști → CTA „Artist nou" (existent); fără show-uri viitoare
→ card cu CTA „Show nou".

## 3. Calendarul multi-artist

**Componentă client `MasterCalendar`** în coloana dreaptă, sticky:

- Grilă lunară (vizual: pattern-ul calendarului de tur), navigare ‹ › client-side
  pe datele complete primite de la server (toate zilele tururilor active).
- **Punct colorat per artist** pe zi: plin pentru `show`, estompat pentru celelalte
  tipuri; mai mulți artiști = mai multe puncte; fiecare punct = link către ziua lui
  (tooltip: numele artistului).
- **Filtru:** chips artist (culoare + nume) deasupra, toți activi by default;
  toggle-ul filtrează calendarul ȘI lista Upcoming (stare comună, în client, la
  nivelul unei componente-părinte client care înfășoară Upcoming + Calendar; restul
  paginii rămâne server component).
- Ziua de azi marcată (convenția existentă).

**Interfață:** primește `artists` (id, name, color), `days` (date, artistId,
dayType, tourId) — nu face fetch. Gruparea zile→celule: helper pur
`lib/masterCalendar.ts`, testat vitest.

**Marker de scalare:** la mii de zile, se trece pe fereastră server-driven —
notat în cod, nu construit acum.

## 4. Schema și migrarea

`00028_bucket_tours.sql`, aditivă, fără backfill și fără fereastră de
incompatibilitate (codul vechi ignoră coloana):

```sql
alter table public.tours add column bucket_year int;
create unique index tours_artist_bucket_uq
  on public.tours (artist_id, bucket_year)
  where bucket_year is not null;
```

`bucket_year NULL` = tur normal. Zero schimbări RLS — bucket-urile sunt tururi
normale sub toate politicile existente.

## 5. Testare

- **Vitest (TDD)** pe helperii puri: `lib/masterCalendar.ts` (grupare zile→celule,
  filtru artiști), `lib/dashboard.ts` (next event + upcoming din liste de
  zile/advances), numele bucket-ului.
- **SQL** în suita RLS (fișier nou `faza1a_bucket_rls.test.sql`): unicitate bucket
  (al doilea insert același artist+an → eșec), bucket vizibil prin politicile
  normale de tur.
- **Standard:** `check-i18n`, `tsc --noEmit`, `pnpm build`, `bash scripts/test-rls.sh`.
- **Smoke post-deploy prin Chrome:** creare show one-off pe SPEAK → bucket
  „SPEAK 2026" apare ca tur, ziua e pre-populată (template + Show item + advancing),
  dashboard-ul și calendarul o afișează cu culoarea artistului, filtrul funcționează;
  apoi ștergerea show-ului de test (soft-delete existent).

## Excluse intenționat (YAGNI)

Reverse scheduling din stage time (Faza C), views salvabile, filtre pe deal
type/țară (deal templates nu există încă — sub-proiectul 3+), dropdown ISO de țări
cu flags și dataset de orașe cu coordonate (§8 Zola — rămâne convenția text
existentă până la calculul de km din SP3), ascunderea bucket-urilor din UI.

## Criterii de succes

1. Un show one-off se creează în <30 secunde și aterizezi într-o zi pre-populată
   (template + Show + advancing).
2. Dashboard-ul e pagina de start și arată next event + upcoming + calendar cu
   culorile artiștilor, filtrabil.
3. Bucket-urile respectă RLS-ul existent (un crew restricționat nu vede show-urile
   altui artist nicăieri pe dashboard).
4. Toate flow-urile existente rămân neschimbate (tur clasic, pagini de zi, mobil).
