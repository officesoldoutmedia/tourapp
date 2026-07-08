# TourApp Faza 6 — Notificări, ICS, Day Sheets & PDF: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** §10 Faza 6: notificări in-app + compose (§6.15), ICS feeds tokenizate în ambele moduri (§6.16), Day Sheet PDF single + multi-day + rooming + share link public (§6.17).

**DoD (blueprint):** ICS validat cu timezone-uri corecte pe zi cu DST; day sheet PDF respectă visibility.

### Task 1: Migration 00011 + refactor visibility-for-user
- [ ] Refactor: `private.*_for(uid, …)` (is_org_member_for, has_min_permission_for, can_see_subject_for) — versiunile existente deleghează cu auth.uid(); ICS-ul poate astfel respecta visibility-ul FĂRĂ sesiune [C §6.16]
- [ ] Tabele: ical_tokens (per user, revocabile [N]), share_links (day sheet public, expirare opțională [N §6.17.4]), push_subscriptions (VAPID-ready, Faza 2 push)
- [ ] `public.ical_feed(token)` SECURITY DEFINER → jsonb cu zilele/schedule/travel/hotels vizibile userului token-ului (doar service_role)
- [ ] RLS: tokens/subscriptions doar ale userului; share_links doar editorii zilei
- [ ] Teste faza6: feed-ul crew exclude itemul restricționat, feed-ul admin îl include; share link doar de editor
- [ ] Commit

### Task 2: lib/ics.ts + endpoint
- [ ] `buildIcs(mode, days)`: summary = un VEVENT all-day per Tour Date cu notes/venue/hotel în descriere [C]; items = VEVENT per schedule + travel item [C]; instante UTC (corecte peste DST), escaping RFC 5545 — pure + teste
- [ ] `/api/ical/[token]?mode=summary|items` — service client → ical_feed → ICS; 404 pe token revocat
- [ ] Commit

### Task 3: Day Sheets & PDF (§6.17)
- [ ] `lib/daysheet.ts` — asamblare date pt o zi (note/schedule/events+logistics/travel/hoteluri+room list) prin clientul PRIMIT (user = visibility respectat prin RLS ✓ DoD; publicOnly = doar itemi fără reguli [N])
- [ ] `pdf/DaySheetPdf.tsx` + rute: `/api/pdf/daysheet/[dayId]?rooms=1&gl=1`, `/api/pdf/tourbook/[tourId]?from&to` (o pagină+/zi), `/api/pdf/rooming/[hotelId]`
- [ ] `/share/day/[token]` — pagină publică read-only (service client + publicOnly), expira/revocare; buton de share pe pagina zilei (editor)
- [ ] Commit

### Task 4: Notificări in-app (§6.15 MVP)
- [ ] `/o/[slug]/notifications`: lista mea + mark read; compose (manager+pro): toți / useri selectați → insert în notifications
- [ ] Realtime: bell cu count necitite în headerul org
- [ ] Web Push = REST DE FĂCUT (tabelul push_subscriptions e gata; VAPID + SW în faza de hardening)
- [ ] Commit + verificări verzi
