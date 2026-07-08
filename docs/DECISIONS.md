# DECISIONS.md — jurnal de decizii TourApp

Format: dată — decizie — motiv — impact. Regula din blueprint §11.3: orice detaliu
lipsă din blueprint se rezolvă cu varianta cea mai simplă care respectă
comportamentul [C] și se notează aici.

## 2026-07-08 — Next.js 16 în loc de 15
Blueprint-ul (scris pt "Next.js 15 App Router") precede Next 16. `create-next-app`
livrează 16.2.x; App Router identic, next-intl 4 compatibil. Rămânem pe 16 (nu
downgrade artificial). Impact: zero pe arhitectură.

## 2026-07-08 — Fără Docker pe mașina de dev → `supabase start` indisponibil
Mașina nu are Docker/OrbStack/Colima, deci stack-ul Supabase local nu poate rula.
Decizie: migrațiile se scriu identic în `supabase/migrations/` (replicabile),
iar verificarea RLS/DoD se face fie (a) după instalarea OrbStack/Docker, fie
(b) pe un proiect Supabase cloud de dev (MCP disponibil). Nu blocăm scrisul
codului. Vezi docs/VERIFICATION.md.

## 2026-07-08 — i18n fără routing pe locale
next-intl configurat cookie-based (fără prefix /ro /en în URL): aplicația e
app-shell autentificat, nu site public multi-locale; locale-ul e preferință de
user (profiles.locale), default 'ro'. Simplifică §8 (rutele rămân exact ca în
blueprint). Landing-ul de marketing (faza lansare) poate primi routing separat.

## 2026-07-08 — Permisiuni: enum unic per user per org
Conform §3.2 nota [D]: implementăm UN nivel efectiv (enum org_permission), nu
array de flags. Logica centralizată în lib/permissions.ts + private.* SQL face
migrarea la flags o schimbare locală dacă trialul Eventric o infirmă.

## 2026-07-08 — Testare RLS pe Postgres local cu stub auth (fără Docker)
`scripts/test-rls.sh` pornește un Postgres 17 (brew) efemer, aplică
`supabase/tests/00000_auth_stub.sql` (roluri anon/authenticated/service_role +
schema auth + auth.uid() identic Supabase), rulează TOATE migrațiile, apoi
scenariile din `supabase/tests/*.test.sql` (simulare useri prin
`set_config('request.jwt.claims', …)` + `set role authenticated`). Fiecare fază
adaugă un fișier `*.test.sql` cu probele ei de RLS. Nu s-a creat proiect
Supabase cloud (cost $10/lună — decizie de business, rămâne pentru Faza 8 /
utilizator).

## 2026-07-08 — Soft delete & politici RLS (2 corecții din testare)
1. Politicile de scriere sunt SEPARATE (insert/update/delete), niciodată
   `for all` — un `for all` acordă implicit și SELECT și ar ocoli filtrul
   `deleted_at is null` din politica de citire.
2. Postgres cere ca rândul NOU al unui UPDATE să treacă politicile de SELECT
   (când statement-ul citește tabelul). Soft-delete prin `set deleted_at=now()`
   s-ar bloca singur. Soluția: politica de SELECT devine
   `deleted_at is null OR <user-ul poate edita>` — crew nu vede niciodată
   rânduri șterse; editorii le văd (trash/restore — aliniat cu §2.2.3 "datele
   de tur nu se pierd niciodată"). Query-urile de UI filtrează explicit
   `deleted_at is null`.

## 2026-07-08 — Google Maps Platform configurat (proiect tourapp-501817)
Proiect GCP dedicat `tourapp` (org soldoutmedia.ro, owner office@soldoutmedia.ro),
billing pe "My Billing Account" (slot eliberat prin dezactivarea facturării pe
proiectul adormit PODASK — proiectul și cheia lui au rămas intacte, reversibil).
API-uri active: Places API (New), Distance Matrix API, Time Zone API. Cheia
"Maps Platform API Key" e restricționată exact la aceste 3 API-uri (verificat:
Geocoding → REQUEST_DENIED), fără application restriction (folosită DOAR
server-side prin lib/googlePlaces.ts; stă în GOOGLE_MAPS_API_KEY din .env.local,
gitignored). Teste live: Places găsește NIBIRU; Time Zone dă Europe/Bucharest;
Distance Matrix Satu Mare→Cluj 189 km/3h (fix exemplul din DoD-ul Fazei 3).
De făcut de utilizator (recomandat): buget + alertă în Billing → Budgets & alerts.

## 2026-07-08 — Guest List: decizii [D]
1. Emailurile de aprobare: toggle-ul org `guest_list_approval_emails` e tratat
   ca ON dacă nu e setat (feature-ul merge out-of-the-box; org settings UI vine
   în faza de settings).
2. Totalurile din footer: pe selecția filtrată [C]; fără selecție → toate
   rândurile filtrate. Remaining se calculează pe TOATE requesturile
   ne-declined (nu doar cele filtrate).
3. Tastatură pe rândul New Guest: Enter salvează din orice câmp; Tab din Notes
   salvează și mută focusul pe Last Name [C]; Tab/Shift-Tab navighează nativ.
