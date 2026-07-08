# TourApp Faza 1 — Schelet de tur: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tours + Days + Schedule end-to-end: migrations (tours, tour_gear, days, tour_personnel, schedule_items, schedule_templates) cu RLS pe pattern-ul §5.2, `lib/datetime.ts` timezone-aware cu teste (+1, DST), wizard creare tur zi-cu-zi, layout tur (sidebar zile + mini-calendar), pagina zilei cu Notes (3 zone) + Schedule complet, Realtime pe day channel.

**Spec:** blueprint §3.3, §3.6, §3.9 (tour_personnel), §6.2–§6.4, §10 Faza 1.
**Global constraints:** identice cu Faza 0 (vezi planul Faza 0) + §11.5 timezone discipline.

### Task 1: Migration 00004 — tours/days/schedule (+ helpers acces)
- [x] Enums `day_type` (§3.3 lista completă, default 'new'), `schedule_item_type`
- [x] Tabele: tours (is_archived, visible_on_mobile), tour_gear, days (unique tour+date, 3 note fields, tz), tour_personnel (v1.1 inventar; `contact_id uuid` FĂRĂ FK — contacts vine în Faza 5, FK adăugat atunci; notat în DECISIONS), schedule_items (§3.6 exact), schedule_templates
- [x] Indexuri §3.12: days(tour_id,date), schedule_items(day_id,start_at), tour_personnel(tour_id)
- [x] Helpers reutilizabili: `private.tour_org(tour)`, `private.can_access_tour(tour)`, `private.can_access_day(day)` (tour visible + day visible [C-S v1.1])
- [x] Politici: select prin can_access_* + can_see_subject per item (schedule_item, tour_personnel); write = manager+ AND is_pro
- [x] Test RLS `supabase/tests/faza1_rls.test.sql`: manager creează tur+zi+item; crew vede; regulă visibility pe tur → crew nu mai vede nici zilele/itemii; regulă pe schedule_item individual; personnel restricționat; `./scripts/test-rls.sh` verde
- [x] Commit

### Task 2: `lib/datetime.ts` + teste
- [x] `pnpm add date-fns date-fns-tz`
- [x] API: `dayInstant(date, time, tz)`, `scheduleInterval({date,tz,start,end}) → {startAt,endAt,plusOne}` (end ≤ start → +1 zi), `formatTimeInZone(instant, tz, locale)`, `formatDayHeader(date, tz, locale)`, `isDstTransition(date, tz)` (afișare ambele tz-uri [C §6.3.1])
- [x] Teste: +1 peste miezul nopții; DST Europe/Bucharest 2026-03-29 și 2026-10-25; check-in la graniță de fus (America/New_York vs Europe/Bucharest)
- [x] Commit

### Task 3: Onboarding + wizard creare tur (§6.3.2)
- [x] `/o/[orgSlug]` — dashboard org: lista tururilor (+ arhivate), guard membership
- [x] `/o/[orgSlug]/tours/new` — wizard: nume + FROM/TO → pas zi-cu-zi: day type per dată (Show/Day Off/Travel), city/state/country, timezone lookup automat (listă IANA + heuristică țară→tz în `lib/tzLookup.ts`, izolat [D]), aplicare schedule template opțională
- [x] Server actions: createTour (tour + days bulk insert)
- [x] Commit

### Task 4: Layout tur + pagina zilei + Schedule UI
- [x] `/o/[orgSlug]/t/[tourId]` layout: sidebar zile grupate pe luni (A.2: DD/MM + event + oraș, bară roșie selecție) + redirect la prima zi
- [x] `/o/[orgSlug]/t/[tourId]/d/[date]`: header zi (§A.2), Notes 3 zone (general/travel/hotel, autosave), Schedule listă: add/edit inline, start/end cu +1 badge, is_confirmed/is_complete toggles, publicity type cu icon, reordonare (time_priority/sort_order), CONFIRMALL [C-S]
- [x] Schedule Templates: Save As Template + Apply (server actions; CRUD complet în settings = Faza 1 minim: save + apply)
- [x] Commit

### Task 5: Realtime pe day channel (§7.2)
- [x] Hook `useDayRealtime(dayId)` — postgres_changes pe schedule_items/days filtrate pe day_id → router.refresh() (MVP: refetch, nu patch local)
- [x] Enable realtime publication în migrație (alter publication supabase_realtime add table…)
- [x] Commit

### Task 6: Verificare
- [x] `pnpm lint && pnpm typecheck && pnpm test && pnpm build` verzi; `./scripts/test-rls.sh` verde
- [ ] DoD manual (tur 10 zile prin wizard, template aplicat, +1 corect, 2 useri live) — necesită stack Supabase real (Docker/cloud); pașii în VERIFICATION.md
