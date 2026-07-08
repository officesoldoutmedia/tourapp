# TourApp Faza 8 — Hardening & Deploy: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** §10 Faza 8: security pass (RLS review, rate limiting pe rutele publice, headers), completarea UI-ului de administrare (users/groups/org settings — necesar pentru beta), pregătirea deploy-ului (Supabase cloud + Cloudflare Pages via OpenNext + Resend) cu runbook.

### Task 1: Org settings UI (golul funcțional pentru beta)
- [ ] `/o/[slug]/settings` — hub + toggle `guest_list_approval_emails` [C §6.9.1]
- [ ] `/o/[slug]/settings/users` — lista membrilor cu permisiuni (dropdown, admin-only [C]), invitație pe email (org_invitations + link + email Resend dacă e cheie), remove
- [ ] `/o/[slug]/settings/groups` — CRUD grupuri + membri (visibility [C])
- [ ] Bell cu count necitite în headerul org
- [ ] Commit

### Task 2: Security hardening
- [ ] Security headers (HSTS, nosniff, frame-deny, referrer-policy) în next.config
- [ ] Rate limiting best-effort pe /api/ical + /share/day (in-memory per instanță; producția pune Cloudflare în față — documentat)
- [ ] Review: grep servicii/secrete (service client doar în contexte token-validate; niciun secret în NEXT_PUBLIC), RLS suite completă verde
- [ ] Commit

### Task 3: Deploy prep (fără a executa deploy-ul — decizii ale userului)
- [ ] OpenNext/Cloudflare: @opennextjs/cloudflare + wrangler.jsonc + scripts (preview/deploy)
- [ ] docs/DEPLOY.md — runbook complet: proiect Supabase cloud nou ($10/lună, [N §2.4] NU refolosim proiectele existente), `supabase link + db push`, buckets/policies auto din migrații, Resend live + EMAIL_FROM, env vars pe Cloudflare, domenii, checklist de secret rotation
- [ ] Commit + verificări verzi
