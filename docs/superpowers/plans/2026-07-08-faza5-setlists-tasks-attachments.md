# TourApp Faza 5 — Set Lists, Tasks, Attachments, Contacts: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** §10 Faza 5: song library org + set list editor (breaks, notes, performers, totaluri [C-S]) + Set List PDF; Tasks cu overdue roșu; Attachments (Storage, tags, visibility); Companies & Contacts + FK-urile amânate.

**DoD (blueprint):** piesa editată în org se schimbă în set list; task overdue roșu; attachment cu visibility ascuns pentru user simplu.

### Task 1: Migration 00010 + RLS + teste
- [x] songs (org-level: title/length_seconds/bpm/song_key/tech_notes), set_lists (event_id PK), set_list_items (position, song|break, set_specific_notes, guest_performers), tasks (tour+day opțional, due_at, assigned_to [D]), attachments (parent: tour|day|event_accounting|song; tags text[]; storage_path), companies, contacts
- [x] FK-urile amânate: tour_personnel/venue_key_contacts/hotel_key_contacts → contacts
- [x] RLS: songs/companies/contacts org-scoped; set list via event; tasks cu visibility [D §5.1.4]; attachments per parent — event_accounting DOAR admin+accounting [C]; storage bucket + politici guarded (doar pe stack Supabase)
- [x] Teste faza5: song edit se vede prin set list (join), attachment cu visibility ascuns pt crew (DoD), accounting attachment invizibil pt manager, task restricționat
- [x] Commit

### Task 2: lib/setlist.ts + PDF
- [x] Totaluri [C-S]: "N song, N break, MM:SS" — pure + teste
- [x] `pdf/SetListPdf.tsx` (@react-pdf/renderer, font mare stage-ready) + route `/api/pdf/setlist/[eventId]` (RLS prin clientul server)
- [x] Commit

### Task 3: UI
- [x] `/o/[slug]/settings/songs` — bibliotecă (add/edit/delete; editarea se propagă în set lists prin referință [C])
- [x] `/e/[eventId]/set-list` — ADDSONG (picker songsNotInList [C]), ADDBREAK, reorder, notes/performers per item, totaluri live, EDITSONGLIST, copy clipboard, buton PDF
- [x] Day page: secțiunea Tasks (add, complete, due, OVERDUE roșu [C]) + secțiunea Attachments (upload în Storage, tags, download prin URL semnat, delete)
- [x] `/o/[slug]/contacts` — Companies & Contacts CRUD [C]
- [x] Commit + lint/typecheck/test/build/rls verzi
