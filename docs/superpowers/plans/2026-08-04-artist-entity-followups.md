# Entitatea Artist — follow-up-uri (post-merge)

Triate în review-ul final de branch (2026-08-06, merge `71e0a82`): **niciunul blocant**,
toate ship-uite ca datorie asumată. Grupate pe valoare:

## Prioritate 1 — „error surfacing" (un singur PR mic)

- Wrapper-ele inline din `a/[artistSlug]/access/page.tsx` și `t/[tourId]/settings`
  (`changeArtist`) înghit `{error}` fără feedback (gap identic preexistent în
  `settings/users` + `settings/groups`). Un wrapper comun toast-on-error.
- `profile/photo-client.tsx` — eroarea de upload e înghițită (`if (error) return;`);
  `access/files-client.tsx` face toast pentru același caz. Fix de o linie, inclus aici.

## Prioritate 2 — comportament

- **Timezone auto e cod mort în flow-ul real** (deviere de la spec §3): select-ul de
  timezone trimite mereu valoare nenulă, deci `lookupTimezoneByLatLng`/fallback-ul nu
  se ating; schimbarea home base nu actualizează timezone-ul. Fix: opțiune „Auto"
  goală sau suprascriere tz când orașul s-a schimbat.
- **FK compus** `(organization_id, artist_id)` pe `tours` + `unique (id, organization_id)`
  pe `artists` — întărirea la nivel de schemă a validării făcute acum în acțiuni
  (`createTour`/`updateTourArtist`).
- Timeline-ul artistului: fără paginare — cap implicit Supabase 1000 rânduri va
  trunchia silențios istoric multi-an. Marker pentru sub-proiectul 2.

## Prioritate 3 — polish

- Taburile Profil/Acces vizibile și pentru non-manageri (redirect la click) — gating
  cosmetic în layout.
- Roster: query dublu pe tours (metrics + artistOfTour) — un singur select cu
  `artist_id`; signed URL per artist → `createSignedUrls` batch (precedent
  `passes/page.tsx`).
- Select reasignare: artist soft-deleted ar fi etichetat „(arhivat)" (mislabel edge).
- Comparația de home base city e case/whitespace-sensitive (re-geocode inutil).
- `formatSize()` duplicat în `access/files-client.tsx` vs `attachments/docs-client.tsx`;
  `getAttachmentUrl` importat cross-domain din `extras-actions` → `lib/attachments.ts`.
- Confirmarea de arhivare artist refolosește label-ul (fără copy dedicat).
- Teste: caz pentru `slice(0,40)` din `slugify`; cazuri extra la `artistTimeline`
  (ties pe dată, all-not_started); check-ul „default deschis" din faza9 e
  cvasi-tautologic; comentariul `subject_type` din 00001 nu enumeră `'artist'`.
- `required` pe select-ul de artist din wizard e inert (gating-ul real = butonul
  disabled); guard client pentru `?artist=` cu id invalid (backstop-ul server există).

## Checklist post-deploy (o singură dată, după migrările 00025–00027)

1. Redenumește artistul auto-creat (numele org-ului) în numele real + poză/culoare/home base.
2. Creează restul roster-ului; reasignează tururi dacă e cazul.
3. Smoke: roster cu next show corect · tur nou cu `?artist=` preselectat · restricție
   artist pe grup → user mobile_access pierde roster/tur/zi/iCal · share link public
   existent funcționează · mobil neschimbat.
