# TourApp Faza 3 — Travel & Hotels: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Travel (ground cu auto-calc Distance Matrix, air cu legs manuale, rail/sea) + Hotels (căutare cu badge sursă, extend stay linked/unlink, sortare, room lists cu copy clipboard). Blueprint §3.7, §6.7, §6.8, §10 Faza 3.

**DoD (blueprint):** extend stay pe 3 zile propagă un edit; unlink îl oprește; ground calc corect Satu Mare→Cluj; room list copy păstrează formatarea.

### Task 1: Migration 00008 — travel + hotels + RLS
- [x] Enum travel_type (ground/air/rail/sea); tabele: travel_items (toate câmpurile v1.1 [C-S] incl. auto_title, party, day_offsets, depart_tz/arrive_tz, display_time_as, eta, câmpuri rail), flight_legs, travel_passengers (→tour_personnel), day_hotels (facilities jsonb, party, stay_group_id, sort_order, check in/out date+time), hotel_key_contacts (contact_id fără FK până în Faza 5), room_list_entries (BAGTAG/ROOM#/TYPE/SMOKING/CONF [C-S])
- [x] Indexuri §3.12: travel_items(day_id), day_hotels(day_id, sort_order)
- [x] RLS pe pattern §5.2: select = can_access_day + can_see_subject('travel_item'|'day_hotel'); write = can_edit; flight_legs/passengers/room_list/key_contacts urmează părintele
- [x] Realtime publication += travel_items, day_hotels, room_list_entries
- [x] Teste RLS faza3: visibility per hotel [C], per travel item [C], cascadă zi→travel/hotel, room list urmează hotelul restricționat
- [x] Commit

### Task 2: `lib/travel.ts` — auto-title + ground calc
- [x] `travelAutoTitle(item, locale)` [C-S]: ground "Drive To X — 240 kilometers / 3 hours 21 mins", sea "Sail to X…", rail "Dep X arr Y", air "Fly" — pure + teste
- [x] `computeGround(origin, dest)` server-only: Distance Matrix → {distanceKm, durationMin}; graceful fără cheie
- [x] `arrivalFrom(departISO, durationMin)`; timezones capete: din venue/hotel ref (lat/lng → Time Zone API) sau tz-ul zilei
- [x] Verificare live: Satu Mare→Cluj ≈ 189 km / ~3h (DoD)
- [x] Commit

### Task 3: `lib/hotels.ts` — extend stay / unlink semantics
- [x] Extend stay [C]: copiază day_hotel pe zilele țintă (cu room list + contacts + urls), același stay_group_id — LINKED
- [x] Edit propagat: update pe un hotel cu stay_group_id → toate records din grup (câmpurile de hotel, nu day_id/sort_order); room list copiată la extend, editată independent după ([D] — blueprint leagă recordurile de hotel; notat în DECISIONS)
- [x] Unlink [C]: stay_group_id=null pe record → edit local
- [x] Teste unit pe funcțiile pure de propagare (ce câmpuri se copiază)
- [x] Commit

### Task 4: UI Travel pe pagina zilei (§6.7)
- [x] Secțiune Travel cu TRAVELNOTES (days.travel_notes) sus [C-S]; listă items cu icon per tip, CONFIRMED/UNCONFIRMED pill, party badge, ore cu +1/day_offset
- [x] Form add/edit cu tabs GROUND|AIR|RAIL|SEA [C-S]: ground = origin/dest (text sau pin-picker din venues/hotels turului) + buton calc (Distance Matrix) + AUTOTITLE/CUSTOMTITLE toggle; air = flight legs manuale (airline, număr, IATA, ore); rail/sea = câmpuri §3.7
- [x] Passengers: multi-select din tour_personnel
- [x] Commit

### Task 5: UI Hotels pe pagina zilei (§6.8)
- [x] Secțiune Hotels cu HOTELNOTES sus; listă sortabilă (↑↓), party badge, check-in/out
- [x] Add hotel: căutare day_hotels existente ale turului + Google Places (badge) + manual
- [x] EXTEND STAY (alege hotelurile din ziua precedentă → copiere linked) + UNLINK [C]
- [x] Room list grid: BAGTAG|LAST|FIRST|ROOM#|TYPE|SMOKING|CHECKIN|CHECKOUT|CONF + Add din personnel + totaluri (TOTALHOTELGUESTS/TOTALROOMS) + Copy clipboard cu formatare TSV ("Last, First (Preferred)") [C]
- [x] Commit

### Task 6: Verificare + restanțe Faza 2
- [x] `pnpm lint/typecheck/test/build` + `./scripts/test-rls.sh` verzi
- [x] Status advance agregat pe sidebarul zilelor (restanță Faza 2 — pie/check [C])
- [ ] DoD manual pe stack live rămâne în VERIFICATION.md
