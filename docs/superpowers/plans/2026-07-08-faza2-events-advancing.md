# TourApp Faza 2 — Events & Advancing: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Inima produsului (§10 Faza 2): venues + events + promoters + field registry (seed A.3) + local crew/labor call + advances cu sync bidirecțional by-design, venue attach flow cu duplicate matching + copy-on-write, Events tab + Advance editor (Design/Advance mode).

**Spec:** blueprint §3.4, §3.5, §6.5, §6.6, ANEXA A.3.

### Task 1: Migration 00006 — venues/events/promoters/field registry
- [x] Tabele: venues (câmpuri v1.1 [C-S], organization_id NULL = catalog global), venue_key_contacts (contact_id fără FK până în Faza 5), events, promoters, event_promoters, field_definitions (unique index pe coalesce(org)+key), event_field_values, org_hidden_fields, event_local_crew_details, event_labor_calls (+ labor_currency/labor_cost_at_settlement pe events), advances (layout jsonb cu itemi field|title|schedule_row), advance_templates
- [x] Enum event_section; advance_status
- [x] Indexuri §3.12 (events(day_id), event_field_values(event_id))
- [x] RLS: select prin can_access_day(events.day_id) cascadat; write manager+pro; venues org-scoped (catalog global read-only pentru toți autentificații); field_definitions: standard (org null) read-all, custom org-scoped
- [x] Test RLS faza2_rls.test.sql (event pe zi restricționată invizibil; field values urmează event-ul; advance labor call NU scapă pe alt event al aceleiași zile [C §6.5.2])
- [x] Commit

### Task 2: Seed field_definitions (ANEXA A.3 — sursa REALĂ)
- [x] Migration 00007_field_seed.sql: toate cheile din A.3 cu section + key prefixat (`production.dimensions` etc.), sort_order per grup, tipuri (textarea default; number/dropdown unde e notat); cele 3 chei [D] din logistics marcate în comentariu
- [x] Labelurile în messages/ro.json + en.json sub `fields.*` (nu în DB — A.5.2)
- [x] Commit

### Task 3: `lib/advance.ts` + logica de sync
- [x] Tipuri layout: `{type:'field',key}` | `{type:'title',title,description}` | `{type:'schedule_row',scheduleItemId}` (A §6.6 v1.1)
- [x] Agregare status pe zi [C §6.6]: nimic/pie/check — funcție pură + teste
- [x] Commit

### Task 4: Venue attach flow (§6.5.1) + Events UI
- [x] Add Event pe Show Day → căutare venues (org + catalog) cu badge sursă; creare manuală; duplicate matching pe (nume normalizat + oraș) cu dialog; Google Places = REST DE FĂCUT (fără API key în dev)
- [x] Event overview + tabs Production/Facilities/Equipment/Logistics (+ADDFIELD, hide 👁 per org [C]) + Local Crew + Labor Call grid
- [ ] Copy-on-write la editarea unui venue global [C §3.4] — REST DE FĂCUT (editorul de venue nu e construit încă)
- [x] Commit

### Task 5: Advance editor
- [x] Lista advances per event cu status; +ADDADVANCE, SAVEASTEMPLATE, REMOVE
- [x] Design mode: adaugi fields (dropdown pe secțiuni), Titles, schedule_row; reorder ↑↓; trash
- [x] Advance mode: completezi valorile → scrise în event_field_values (sync cu Events tab by-design); schedule_row scrie schedule item real pe zi [C-S]
- [ ] Status agregat pe sidebar-ul ZILELOR (pie/check) — REST DE FĂCUT (e afișat pe event overview; sidebar-ul zilelor nu-l arată încă)
- [x] Commit

### Task 6: Verificare
- [ ] DoD: advance din template → valorile apar în Events tab și invers; status agregat corect; RLS suite verde; lint/typecheck/test/build verzi
