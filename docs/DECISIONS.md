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
