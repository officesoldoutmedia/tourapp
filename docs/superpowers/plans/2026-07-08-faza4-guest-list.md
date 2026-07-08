# TourApp Faza 4 — Guest List: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Guest List complet (§3.8, §6.9): tour passes (nivel de TUR, v1.1), setări per event (cutoff/lock/allotments + Enforced), grid manager cu comportamentele de tastatură [C §6.9.3], form crew, RLS-ul special §4.3.2, email Resend la aprobare.

**DoD (blueprint):** un singur pass type OK; cutoff blochează submit dar nu managerul; remaining roșu la negativ; email conține bilete+passes.

### Task 1: Migration 00009 — tabele + RLS special
- [ ] tour_passes (TUR-level [C-S]: name/description/image_path), event_guest_list_settings (cutoff_at, is_locked, tickets_allotment), event_pass_allotments (num_allowed, enforced), guest_list_requests (toate câmpurile v1.1: phone/row/seat/email_notify/priority/pickup/payment_status), guest_request_passes
- [ ] Helper `private.gl_can_submit(event)` — false când locked SAU cutoff depășit; bypass gl_manage_all+ [C]; `private.gl_tickets_blocked(event, n)` pt Enforced Allotment
- [ ] RLS §4.3.2: SELECT — gl_view_all_submit+ vede tot; gl_submit DOAR requesturile proprii; mobile_access nimic. INSERT — gl_submit+ cu requested_by=uid + gl_can_submit + enforced check. UPDATE/DELETE — gl_manage_all+ orice; ownerul doar rândurile proprii cât timp pending [D]
- [ ] Teste RLS faza4: fiecare nivel de permisiune (schimb membru pe rând), cutoff blochează submitterul dar nu managerul, enforced allotment blochează, owner edit doar pending
- [ ] Realtime += guest_list_requests
- [ ] Commit

### Task 2: Email de aprobare (Resend)
- [ ] `lib/email.ts` server-only: fetch pe API-ul Resend; fără RESEND_API_KEY → console.log (mod dev [N §2.4])
- [ ] Trimis din server action la status→approved DACĂ org.settings.guest_list_approval_emails ȘI request.email_notify [C §6.9.1]; conținut: nr bilete + pass types aprobate [C]
- [ ] Commit

### Task 3: Grid manager (§6.9.3 [C] — comportamentele de tastatură)
- [ ] Rând "New Guest" permanent sus; Tab/Shift-Tab între câmpuri; Enter/Shift-Enter între rânduri; în Notes Enter = rând nou de text, Tab iese; Tab din Notes pe rândul nou finalizează guestul și mută focus pe Last Name
- [ ] Coloane [C-S]: LAST|FIRST|#TIX|câte o coloană per pass type|STATUS|AFFILIATION|REQUESTOR|DATE|PICKUP|PRIORITY (Space comută)|NOTES|EMAIL NOTIFY
- [ ] Smart defaults (valorile devin default pe New Guest) [C]; filtre Requestor/Status/Affiliation; master checkbox pe selecția filtrată; bulk status; sortare pe coloane; totaluri DOAR pe selecția filtrată [C]
- [ ] Header: REQUEST CUTOFF + toggle LOCKED [C-S]; footer per coloană numerică: NUM ALLOWED + ENFORCED checkbox + Remaining ROȘU la negativ [C]
- [ ] Panou detaliu cu buton APPROVE [C-S]
- [ ] Commit

### Task 4: Form crew + setări
- [ ] Form simplu (gl_submit): nume, affiliation, nr bilete, pass type, note → Pending [C §6.9.4]; vede doar requesturile proprii + status
- [ ] Tour passes CRUD în setările turului; toggle emailuri în org settings [C]
- [ ] Commit

### Task 5: Verificare
- [ ] Edge cases [C §6.9.3]: UN singur pass type nu dă eroare la submit; mesaj cutoff corect după expirare — în teste
- [ ] lint/typecheck/test/build + test-rls.sh verzi
