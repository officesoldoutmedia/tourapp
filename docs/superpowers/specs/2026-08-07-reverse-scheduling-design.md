# Reverse scheduling — design (Faza C2)

**Data:** 2026-08-07
**Status:** aprobat în brainstorming, în așteptarea review-ului pe spec
**Sursa:** feedback Zola §9.4 (reverse scheduling din stage time) + §9.1 (deal type
→ pre-populează day template); al doilea sub-proiect din Faza C, după C1 deal
templates (livrat). Ordinea Fazei C decisă cu utilizatorul: C1 → C2 → C3 → C4.

## Decizii clarificate cu utilizatorul

- **Offset-urile trăiesc pe template-urile de program existente** — fiecare item
  primește o ancoră: `day` (oră fixă, comportamentul de azi) sau `show` (offset
  semnat față de T = stage time). Respins tabelul separat de offset-uri per deal
  type (dubla conceptul de template).
- **Recalcul explicit** — buton „Recalculează" care mută DOAR slot-urile
  neconfirmate generate relativ la show. Respins recalculul automat (mută
  lucruri pe la spate) și varianta fără recalcul.
- **Conflict & gap detection (§9.5) exclus** — backlog C2b, sub-proiect separat.
- **Ancorele se setează prin capture inteligent + editor nou în settings**
  (corecție post-explorare: azi NU există editor de template-uri — se salvează
  dintr-o zi și se aplică, fără delete/rename). 1) „Save as template" pe o zi
  cu slot „Show" timpat capturează itemii timpați ca relativi la T (slotul
  Show însuși NU intră în template — el e reperul); fără slot Show → oră fixă,
  ca azi. 2) Pagină nouă în settings „Template-uri de program": redenumire,
  ștergere, editarea itemilor (titlu, ancoră, offset/oră, durată) — acolo se
  întoarce soundcheck-ul pe „fereastră fixă AM".
- Legătura deal → program: `deal_templates.schedule_template_id`, folosită DOAR
  la pre-popularea wizard-ului (programul aplicat E copia — consistent cu regula
  snapshot-ului; „Re-aplică" pe deal nu atinge programul).

## 1. Modelul de date

**`schedule_templates.items` (jsonb, fără migrare):** itemul
`{title, offset_min, duration_min?, type}` primește opțional
`anchor: "day" | "show"`. Absent = `"day"` (minute de la începutul zilei,
comportamentul actual — template-urile existente rămân valide fără conversie).
La `anchor: "show"`, `offset_min` e semnat față de T: −480 = T−8h, +30 = T+30min.

**`schedule_items` (migrarea `00032_reverse_scheduling.sql`, aditivă):** două
coloane de proveniență pe pattern-ul `generated_key` din SP3a/C1:
`generated_anchor text` (null = item manual; `'show'` = generat relativ la show)
și `generated_offset_min integer`. Se scriu la aplicarea template-ului;
„Recalculează" le citește. Itemii ancorați pe zi NU primesc proveniență (nu
sunt recalculabili).

**`deal_templates.schedule_template_id`** — uuid, FK `schedule_templates`
on delete set null, nullable. Server action-ul de salvare validează că
template-ul de program aparține aceluiași org ca artistul (previne legarea
cross-org de către un membru multi-org).

**Zero schimbări de RLS** — coloanele noi călătoresc pe politicile existente
(`schedule_items` prin zi→tur, `deal_templates` prin artist).

## 2. Generarea și recalculul

**Aplicarea template-ului** (extinderea acțiunii existente
`applyScheduleTemplate`): itemii `day` se calculează ca azi; itemii `show`
primesc `start_at = T + offset_min` și `end_at = start + duration_min` (dacă
există), plus proveniența. **Sursa lui T:** în wizard — câmpul „Stage time" din
formular (din care se creează oricum slotul „Show"); pe pagina de zi — ora
slotului „Show" existent (`lib/showSlot.ts`, sursa unică; mai multe itemi
„Show" → regula existentă de acolo).

**Fără T disponibil** (zi fără slot Show / wizard fără stage time): itemii
`show` se inserează **fără oră**, cu proveniența setată și `time_priority` după
ordinea offset-urilor (secvența logică între itemii netimpați). Se așază la
primul „Recalculează" după ce apare ora de show.

**Peste miezul nopții** (§9.5 — ziua de turneu ≠ ziua calendaristică): load-out
la T+set+30 care cade la 02:00 rămâne pe ziua show-ului — itemii sunt legați de
`day_id`, `start_at` e timestamptz, sortarea existentă `(day_id, start_at)` îl
pune natural la coadă. Modelul actual suportă deja (end < start pe ceas = +1);
zero schimbări.

**Capture-ul** (`saveScheduleAsTemplate`): ziua are slot „Show" cu oră →
itemii timpați se capturează cu `anchor:"show"` și
`offset_min = start item − start show` (minute semnate); slotul Show e exclus
din template; itemii netimpați rămân ca azi (oră fixă, offset 0). Zi fără slot
Show → capture-ul actual neschimbat (oră fixă din ceasul local al zilei).
Wizard-ul creează slotul Show ÎNAINTE de aplicarea template-ului (azi ordinea
e inversă), ca T să existe la generare.

**„Recalculează"** (buton pe secțiunea de program, doar editori): T din slotul
Show al zilei (fără slot Show → dezactivat cu hint). Pentru fiecare item cu
`generated_anchor='show'` și `is_confirmed=false` (nesters):
`start_at = T + generated_offset_min`; dacă itemul avea `end_at`, durata
actuală se păstrează (end nou = start nou + durata veche). Confirmații nu se
ating; itemii manuali nu se ating; editările de titlu/detalii supraviețuiesc —
se mută doar orele.

## 3. UI

- **Pagină nouă în settings „Template-uri de program"** (hub-ul org, pattern
  `file-categories` SP3b): listă template-uri cu redenumire, ștergere (soft),
  creare goală; itemii editabili — titlu, toggle de ancoră „Oră fixă" (input
  HH:mm, default) / „Relativ la show" (selector Înainte/După + ore+minute,
  stocat `offset_min` semnat), durată în minute, tip, adăugare/ștergere/
  reordonare. Itemii existenți apar pe „Oră fixă" neschimbați. Umple și golul
  actual: template-urile nu pot fi azi nici șterse, nici redenumite.
- **Tabul Deals al artistului** (C1): select nou „Template de program" în
  formular, sub categoriile obligatorii, cu template-urile org-ului; salvat pe
  deal template, rezumat pe rândul din listă.
- **Wizard „Show nou":** la alegerea unui deal cu template de program legat,
  selectul „Schedule template" se pre-completează (suprascriibil). Datele din
  extinderea query-ului de deals existent cu `schedule_template_id`.
- **Secțiunea de program a zilei:** butonul „Recalculează" lângă „Confirm all"
  (editori; dezactivat cu hint fără slot Show). Itemii generați relativ la show
  poartă o capsulă cu offset-ul („T−8h", „T+30min") — dispare la confirmare.

## 4. Margini

- Slot Show șters după generare → „Recalculează" dezactivat, itemii rămân pe
  ultimele ore.
- Template de program șters → FK-ul de pe deal devine null; wizard-ul nu
  pre-selectează.
- Offset-uri validate la ±24h în editor.
- Semantica existentă de aplicare a template-ului peste itemi existenți rămâne
  neschimbată (nu e scope-ul C2).

## 5. Migrare, testare

**`00032_reverse_scheduling.sql`**, aditivă: coloanele de proveniență pe
`schedule_items` + `schedule_template_id` pe `deal_templates`. Fără politici
noi → fără test RLS nou; suita existentă rămâne verde.

**Vitest (TDD):** logica pură în `lib/scheduleGeneration.ts` — calculul
T+offset (semnat, cu durată), fallback-ul netimpat cu ordinea din offset-uri,
derivarea setului de recalcul (doar neconfirmați cu proveniență `show`),
păstrarea duratei la recalcul.

**Standard:** suita RLS, `check-i18n`, `tsc --noEmit`, `pnpm build`.
**Smoke post-deploy prin Chrome:** template cu offset-uri (Load-in T−8h,
Load-out T+30min) → deal legat pe SPEAK → show nou cu stage time 22:30 → ziua
schițată complet → schimb ora la 23:00 → „Recalculează" mută doar
neconfirmații → cleanup.

## Excluse intenționat (YAGNI)

Conflict & gap detection (backlog C2b — decizia utilizatorului), paleta de slot
types cu culori (§9.2), personal view per persoană (§9.6), afișarea dublă de
timezone (§9.5), sync Google Calendar (§9.6), „soundcheck window" ca tip
special de slot (e item obișnuit pe „Oră fixă", confirmat manual).

## Criterii de succes

1. Definești offset-urile o dată pe template → show nou cu stage time are
   toată ziua schițată, fără nicio introducere manuală.
2. Schimbi ora de show → „Recalculează" mută doar neconfirmații; editările de
   titlu/detalii supraviețuiesc.
3. Template-urile existente pe „Oră fixă" se comportă identic ca azi — zero
   regresii.
4. Alegerea deal-ului aduce singură template-ul de program în wizard.
