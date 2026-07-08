# VERIFICATION.md — playbook de verificare per fază

## Precondiție: runtime de bază de date

Mașina de dev nu are Docker (vezi DECISIONS.md). Alege una:

**(a) Local (preferat, blueprint §2.2.1):** instalează [OrbStack](https://orbstack.dev)
sau Docker Desktop, apoi:
```sh
supabase start          # pornește stack-ul local
supabase db reset       # rulează migrațiile + seed.sql
```
Copiază URL + anon key + service_role din output în `.env.local`.

**(b) Cloud dev:** proiect Supabase nou (free tier), apoi:
```sh
supabase link --project-ref <ref>
supabase db push        # aplică migrațiile
```

## Faza 0 — DoD

Obiectiv (blueprint §10): *doi useri în aceeași org cu permisiuni diferite
văd/nu văd corect un subiect cu visibility setat.* (Tabelul `tours` vine în
Faza 1; la nivelul Fazei 0 verificăm motorul: `visibility_rules` +
`private.can_see_subject` + politicile RLS.)

### Pași

1. **Signup 2 useri** prin UI (`pnpm dev` → `/signup`): `admin@test.local`
   (va fi pro) și `crew@test.local` (rămâne free).
2. **Ridică tier-ul** userului admin (SQL, ca service role):
   ```sql
   update profiles set user_tier = 'pro' where email = 'admin@test.local';
   ```
3. **Creează organizația** din UI ca admin (`/app`). Verifică:
   - rând în `organizations` + membership `administrator`;
   - `activity_log` are acțiunea `create/organization`.
4. **Invită crew**: inserează invitație ca admin (UI-ul de Users vine în
   Faza 0+; până atunci SQL ca admin autentificat sau service role):
   ```sql
   insert into org_invitations (organization_id, email, permission, invited_by)
   values ('<org>', 'crew@test.local', 'mobile_access', '<admin-uid>');
   ```
   Deschide `/invite/<token>` logat ca crew → Accept → membership creat.
5. **Verifică RLS + visibility** (rulează ca fiecare user — folosește
   `set request.jwt.claims` în SQL editor sau două sesiuni de browser):

   | Probă | admin (administrator/pro) | crew (mobile_access/free) |
   |---|---|---|
   | `select * from organizations` | vede org-ul | vede org-ul |
   | `update organizations set name=…` | reușește | 0 rânduri (RLS) |
   | `select * from organization_members` | ambele rânduri | ambele rânduri |
   | `insert into groups …` | reușește | respins |
   | `select private.can_see_subject('<org>','test','<uuid-nou>')` | true (bypass) | true (fără reguli) |
   | după `insert into visibility_rules (…, 'test', '<uuid>', 'user', '<admin-uid>')` | true (bypass) | **false** (are reguli, nu e țintă) |
   | `select * from visibility_rules` | vede regulile | 0 rânduri |
   | `select * from activity_log` | vede | 0 rânduri |

6. **Non-membru:** un al 3-lea user fără membership nu vede organizația,
   membrii, grupurile — toate SELECT-urile întorc 0 rânduri.

### Teste automate existente
- `pnpm test` — 171 teste pe matricea de permisiuni §4.2 (oglinda TS a RLS).
- `pnpm lint && pnpm typecheck && pnpm build` — verzi.

### Stare
- [x] Cod complet (migrații 00001–00003, permissions.ts, auth flows)
- [x] Verificare RLS pe Postgres 17 local (fără Docker): `./scripts/test-rls.sh`
      aplică stub-ul auth + toate migrațiile + rulează scenariile din
      `supabase/tests/*.test.sql` — 14 probe, toate PASS (2026-07-08).
- [ ] Verificare pe stack Supabase real (auth flows end-to-end prin UI) —
      la instalarea OrbStack/Docker sau la crearea proiectului cloud (Faza 8).

## Faza 1 — Stare

- [x] Migrații 00004 (tours/days/schedule/personnel/gear/templates) + 00005
      (realtime publication, guarded) — aplicate curat pe Postgres 17.
- [x] RLS: `supabase/tests/faza1_rls.test.sql` — 8 probe PASS (cascadă
      tur→zi→item, item-level rules, grup, soft delete + trash + restore).
- [x] `lib/datetime.ts` — 16 teste (+1 peste miezul nopții, DST 29 mar /
      25 oct 2026, formatare în tz-ul zilei).
- [x] UI: wizard tur zi-cu-zi cu tz lookup, sidebar zile pe luni, pagina
      zilei (note 3 zone + schedule cu +1/confirmed/complete/publicity/
      CONFIRMALL/templates), realtime hook. Build + lint + typecheck verzi.
- [ ] DoD manual pe stack Supabase real (2 useri live) — după instalarea
      Docker/OrbStack sau proiect cloud: tur de 10 zile prin wizard,
      template aplicat, +1 corect, edit live vizibil la al doilea user.
- [ ] Rămas din blueprint Faza 1: mini-calendar în sidebar (nice-to-have,
      lista pe luni acoperă navigarea).

## Faza 3 — Stare

- [x] Migrația 00008 (travel/flight_legs/passengers/day_hotels/key_contacts/
      room_list) + RLS — `faza3_rls.test.sql`: 5 probe PASS (visibility per
      hotel + per travel item, room list cascadat, extend-stay linked pe
      3 zile + edit pe grup + unlink).
- [x] `lib/travel.ts` — auto-title [C-S] + arrivalFrom (+1, DST) — 12 teste.
- [x] Ground calc live prin Distance Matrix: Satu Mare→Cluj = 189 km/180 min
      (DoD-ul fazei, verificat cu cheia reală).
- [x] UI: secțiunile Travel (tabs ground/air/rail/sea, auto-calc, legs,
      pasageri) și Hotels (căutare cu badge Google, extend stay/unlink,
      sortare, room list grid + copy clipboard TSV) pe pagina zilei;
      status advance agregat pe sidebarul zilelor (restanța Fazei 2).
- [ ] DoD manual pe stack Supabase live (extend stay prin UI, copy/paste
      room list în Excel) — la instalarea Docker/OrbStack sau proiect cloud.

## Faza 4 — Stare

- [x] Migrația 00009 (tour_passes, gl settings/allotments, requests, passes)
      + RLS §4.3.2 — `faza4_rls.test.sql`: 7 probe PASS (un singur pass type
      la submit; cutoff blochează submitterul dar nu managerul; enforced
      allotment respinge; owner edit doar pending, fără auto-aprobare;
      mobile_access fără acces).
- [x] Grid manager: New Guest row cu Enter/Tab-din-Notes + smart defaults [C],
      filtre Requestor/Status/Affiliation, master checkbox pe selecția
      filtrată, bulk status, sortare pe coloane, totaluri pe selecția
      filtrată, footer NUM ALLOWED + ENFORCED + Remaining roșu la negativ,
      header cutoff + LOCKED, panou detaliu cu APPROVE.
- [x] Form crew + lista requesturilor proprii; CRUD Tour Passes
      (/t/[tourId]/passes); email de aprobare (bilete + passes) prin Resend,
      mod log fără cheie.
- [ ] DoD manual pe stack live: emailul real prin Resend (cere RESEND_API_KEY)
      + fluxul cu 2 useri prin UI.

## Faza 5 — Stare

- [x] Migrația 00010 (songs/set lists/tasks/attachments/companies/contacts +
      FK-urile amânate + bucket Storage guarded) — `faza5_rls.test.sql`:
      7 probe PASS, inclusiv toate cele 3 DoD-uri (song edit → set list;
      attachment cu visibility ascuns; accounting attachments doar
      admin/accounting) + task restricționat.
- [x] lib/setlist.ts (totaluri N song/N break/MM:SS + parse m:ss) — 4 teste.
- [x] Set List PDF stage-ready (/api/pdf/setlist/[eventId], @react-pdf/renderer).
- [x] UI: Song Library (/settings/songs, edit inline propagat prin referință),
      Set List editor (picker songsNotInList, breaks, notes/performers,
      reorder, copy clipboard, totaluri live), Tasks pe zi (OVERDUE roșu),
      Attachments pe zi (upload Storage, tags, URL semnat), Companies &
      Contacts (/contacts, tap-to-call/email).
- [ ] Upload-ul real în Storage cere stack-ul Supabase (bucket-ul se creează
      din migrație, guarded).

## Faza 6 — Stare

- [x] Migrația 00011: refactor visibility-for-user (private.*_for), ical_tokens,
      share_links, push_subscriptions, public.ical_feed (doar service_role) —
      `faza6_rls.test.sql`: 4 probe PASS, inclusiv DoD-ul: feed-ul crew exclude
      itemul restricționat și ziua restricționată; token revocat = mort.
- [x] lib/ics.ts: summary (all-day per Tour Date) + items (schedule+travel),
      instante UTC corecte peste DST (testat pe 25 oct 2026), escaping +
      folding RFC 5545 — 7 teste. Ruta /api/ical/[token]?mode=….
- [x] Day Sheets: lib/daysheet.ts (visibility prin RLS = DoD; publicOnly pt
      share) + PDF-uri: /api/pdf/daysheet/[dayId], /api/pdf/tourbook/[tourId]
      ?from&to, /api/pdf/rooming/[hotelId]; /share/day/[token] public cu
      expirare/revocare + butonul Share pe pagina zilei.
- [x] Notificări in-app: /o/[slug]/notifications (listă + mark read + compose
      către toți membrii, gated pe send_push).
- [ ] Web Push (VAPID + service worker) — tabelul push_subscriptions e gata;
      trimiterea vine în hardening. Compose către grupuri/useri selectați —
      odată cu UI-ul de users.
