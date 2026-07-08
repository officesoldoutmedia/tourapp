# TourApp Faza 0 — Fundație: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the TourApp foundation: Next.js 15 + TS + Tailwind + next-intl scaffold, Supabase migrations for identity/orgs/permissions/groups/visibility/notifications/audit with full RLS, the centralized permission matrix (`lib/permissions.ts`) with unit tests, and auth flows (signup/login/magic link/invite).

**Architecture:** Single Next.js App Router app (per blueprint §2). All SQL lives in `supabase/migrations/` (numbered, RLS on every table from migration 1). Permission logic centralized in `lib/permissions.ts` (TS) mirrored by SQL helper functions in a `private` schema (§5.2). i18n (RO+EN) via next-intl from commit 1 — no hardcoded strings.

**Tech Stack:** Next.js 15 (App Router), TypeScript strict, Tailwind CSS v4, next-intl, @supabase/supabase-js + @supabase/ssr, Vitest, Supabase CLI (migrations), pnpm.

**Spec:** `/Volumes/SSD BRUTURI 1/NU SE STERGE/SOLD OUT TOUR/TOURAPP_BLUEPRINT_v1.1.md` (v1.1). Faza 0 scope = blueprint §10 "Faza 0", implementing §3.2 + §3.10 schema, §4 permissions, §5 visibility, §6.1 partial (org creation), §8 auth routes.

## Global Constraints (blueprint §2.2, §11)

- Multi-tenant from day 1: every content table carries/derives `organization_id`; ALL RLS policies start from `organization_members`.
- No table without RLS enabled + policies (blueprint §11.4).
- Soft delete: `deleted_at timestamptz` on content entities.
- All timestamps UTC in DB. UI display via `lib/datetime.ts` only (built in Faza 1; Faza 0 has no date display).
- i18n: zero hardcoded UI strings; `messages/ro.json` + `messages/en.json` from first commit; default locale `ro`.
- Permission checks ONLY via `lib/permissions.ts` (TS) / `private.*` SQL functions. No inline role conditions.
- [C] items implemented literally; [D] items isolated in config/pure functions; [N] is final spec. Decisions log: `docs/DECISIONS.md`.
- Conventional commits, small commits.
- ENVIRONMENT CONSTRAINT (discovered): no Docker on this machine → `supabase start` unavailable. All Faza 0 verification that needs a live DB is deferred to a "DB verification" task that requires either OrbStack/Docker install or a Supabase cloud dev project (Supabase MCP is connected). Migrations must be written so `supabase db reset` works unchanged once a runtime exists.

---

### Task 1: Repo + Next.js scaffold + tooling

**Files:**
- Create: `tourapp/` via `create-next-app` (TS, Tailwind, ESLint, App Router, src dir NO — use root `app/` per blueprint §2.3)
- Create: `docs/DECISIONS.md`, `.github/workflows/ci.yml`, `vitest.config.ts`
- Modify: `package.json` (scripts: `test`, `typecheck`)

**Interfaces:**
- Produces: repo layout per blueprint §2.3 (`app/`, `components/`, `lib/`, `supabase/`, `emails/`, `pdf/`, `docs/`).

**Steps:**
- [x] Scaffold: `pnpm create next-app@latest . --ts --tailwind --eslint --app --no-src-dir --import-alias "@/*"` (run inside `tourapp/`)
- [x] `git init` + initial commit
- [x] Add Vitest: `pnpm add -D vitest`; `vitest.config.ts` with `include: ['**/*.test.ts']`
- [x] Add scripts: `"test": "vitest run"`, `"typecheck": "tsc --noEmit"`
- [x] Create `docs/DECISIONS.md` seeded with the no-Docker decision + folders `components/ lib/ supabase/migrations/ emails/ pdf/`
- [x] CI: `.github/workflows/ci.yml` running `pnpm install`, `pnpm lint`, `pnpm typecheck`, `pnpm test`
- [x] Commit: `chore: scaffold next.js 15 + tooling`

### Task 2: i18n infrastructure (next-intl, RO+EN)

**Files:**
- Create: `i18n/request.ts`, `messages/ro.json`, `messages/en.json`, `lib/locale.ts`
- Modify: `next.config.ts` (next-intl plugin), `app/layout.tsx` (NextIntlClientProvider)

**Interfaces:**
- Produces: `useTranslations()` / `getTranslations()` usable in all components; locale from `profiles.locale` later, cookie `locale` for now (default `ro`).

**Steps:**
- [x] `pnpm add next-intl`
- [x] Configure without i18n routing (single-domain, cookie-based): `i18n/request.ts` with `getRequestConfig` reading `locale` cookie, fallback `ro`
- [x] Seed `messages/ro.json` / `en.json` with `common.appName`, auth strings (used in Task 7)
- [x] Verify `pnpm build` passes
- [x] Commit: `feat: next-intl RO/EN infrastructure`

### Task 3: Supabase project layout + clients

**Files:**
- Create: `supabase/config.toml` (via `supabase init`), `lib/supabase/browser.ts`, `lib/supabase/server.ts`, `lib/supabase/service.ts`, `.env.example`, `lib/database.types.ts` (placeholder, regenerated later)

**Interfaces:**
- Produces: `createBrowserClient()` (browser), `createServerSupabase()` (RSC/route handlers, cookie-bound), `createServiceClient()` (service-role, server-only).

**Steps:**
- [x] `supabase init` (no Docker start)
- [x] `pnpm add @supabase/supabase-js @supabase/ssr`
- [x] Write the 3 clients per @supabase/ssr docs; service client guards `server-only`
- [x] `.env.example`: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY` (placeholder)
- [x] Commit: `feat: supabase clients + project layout`

### Task 4: Migration 0001 — identity, orgs, permissions, groups, visibility, notifications, audit

**Files:**
- Create: `supabase/migrations/00001_identity_orgs.sql`

**Interfaces:**
- Produces (exact — later fazes depend on these):
  - enum `org_permission`: `administrator|accounting|manager|gl_manage_all|gl_view_all_submit|gl_submit|mobile_access` (§3.2)
  - tables: `profiles` (PK = auth.users id, `user_tier text default 'free'`, `locale text default 'ro'`), `organizations` (+`org_type`, 3 logo urls, `owner_id`, `settings jsonb`), `organization_members` (unique org+user, `permission org_permission default 'mobile_access'`), `groups`, `group_members`, `visibility_rules` (subject_type/subject_id/target_type/target_id, unique quad), `notifications` (enum `notification_kind`), `activity_log`
  - trigger fn `public.set_updated_at()` reused by all future tables
  - trigger: auto-create `profiles` row on `auth.users` insert
  - Standard columns on every table: `id uuid pk default gen_random_uuid()`, `created_at`, `updated_at` (trigger), `deleted_at` (content tables) — §3.1
  - Indexes: `visibility_rules(subject_type, subject_id)`, `notifications(recipient_id, read_at)`, `organization_members(user_id)` (§3.12)

**Steps:**
- [x] Write SQL exactly per §3.2 + §3.10 (org_type added per §6.1 v1.1; `organizations.settings` default `{}`)
- [x] `supabase db lint` if available without runtime; otherwise syntax-check via `psql` unavailable → rely on CI later; note in DECISIONS.md
- [x] Commit: `feat(db): migration 0001 identity/orgs/visibility/notifications/audit`

### Task 5: Migration 0002 — RLS helpers (private schema) + policies

**Files:**
- Create: `supabase/migrations/00002_rls_foundation.sql`

**Interfaces:**
- Produces (used by ALL future policies — §5.2 mandates single implementation):
  - `private.is_org_member(org uuid) -> boolean`
  - `private.current_member_permission(org uuid) -> org_permission | null`
  - `private.has_min_permission(org uuid, required org_permission) -> boolean` (hierarchy: administrator > accounting > manager > gl_manage_all > gl_view_all_submit > gl_submit > mobile_access)
  - `private.is_pro() -> boolean` (profiles.user_tier = 'pro')
  - `private.can_see_subject(org uuid, stype text, sid uuid) -> boolean` (manager+ bypass OR no rules OR user rule OR group rule — §5.1/§5.2)
  - All SECURITY DEFINER, `set search_path = ''`, EXECUTE granted to `authenticated`.
- RLS enabled + policies on: profiles (self select/update; org-mates select), organizations (members select; owner/admin update; any authed pro insert), organization_members (members select; admin all — §4.2 "Gestionează Users"), groups/group_members (members select; manager+ pro write), visibility_rules (manager+ select/write), notifications (recipient select/update-read; pro manager+ insert), activity_log (admin select; insert via service role only).

**Steps:**
- [x] Write helper functions once, policies referencing them (no duplicated logic — §5.2)
- [x] Commit: `feat(db): RLS helper functions + foundation policies`

### Task 6: `lib/permissions.ts` — capability matrix + tests

**Files:**
- Create: `lib/permissions.ts`, `lib/permissions.test.ts`

**Interfaces:**
- Produces (single source of truth §4.3.1):
  - `type OrgPermission = 'administrator'|'accounting'|'manager'|'gl_manage_all'|'gl_view_all_submit'|'gl_submit'|'mobile_access'`
  - `type UserTier = 'free'|'pro'`
  - `type Capability = 'view_itinerary'|'bypass_visibility'|'edit_tour_content'|'view_accounting'|'edit_accounting'|'manage_users'|'gl_submit_request'|'gl_view_all'|'gl_manage'|'gl_override_cutoff'|'manage_tours'|'send_push'`
  - `can(ctx: {tier: UserTier; permission: OrgPermission | null}, capability: Capability): boolean`
  - `PERMISSION_RANK: Record<OrgPermission, number>` + `hasMinPermission(p, min)` — mirrors `private.has_min_permission`
- Matrix EXACTLY per §4.2 table incl. `✔*` = requires `tier==='pro'` (edit_tour_content, edit_accounting, manage_tours, send_push; manage_users = admin only, NOT tier-gated for viewing but invite actions are pro — implement as admin && pro for mutations, admin for view; note [D] cells in comments).

**Steps:**
- [x] Write failing tests: full matrix table-driven test (7 permissions × 12 capabilities × 2 tiers, expected values transcribed from §4.2)
- [x] Run `pnpm test` → fails (module missing)
- [x] Implement matrix
- [x] `pnpm test` → green
- [x] Commit: `feat: centralized permission matrix with full-matrix tests`

### Task 7: Auth flows + /app org selector/creation

**Files:**
- Create: `middleware.ts`, `app/(auth)/login/page.tsx`, `app/(auth)/signup/page.tsx`, `app/auth/callback/route.ts`, `app/auth/confirm/route.ts`, `app/invite/[token]/page.tsx`, `app/app/page.tsx` (org list + create form), `app/app/actions.ts` (server actions: createOrganization, acceptInvite), `lib/auth.ts` (requireUser helper), `supabase/migrations/00003_invitations.sql` (org_invitations table + RLS + accept function)
- Modify: `app/page.tsx` (redirect `/app` per §8), `messages/*.json`

**Interfaces:**
- Consumes: Task 3 clients, Task 6 types.
- Produces: `requireUser()` (redirects to /login), `createOrganization(name, orgType)` server action → inserts org + admin membership (SQL function `public.create_organization` SECURITY DEFINER to bypass chicken-and-egg RLS), `org_invitations` table: `organization_id, email, permission org_permission, token uuid, invited_by, accepted_at`.
- Invite flow per §4.3.3: existing account → direct membership; else invitation row + magic-link signup → auto-attach on accept page.

**Steps:**
- [x] Migration 00003: `org_invitations` + RLS (admin manage; anon select-by-token via SECURITY DEFINER function `public.get_invitation(token)`) + `public.accept_invitation(token)` (attaches auth.uid())
- [x] Email+password + magic link forms (all strings via next-intl)
- [x] `middleware.ts`: refresh session (@supabase/ssr pattern); guard `/app` + `/o/*`
- [x] `pnpm build` + `pnpm test` green
- [x] Commit: `feat: auth flows (login/signup/magic/invite) + org creation`

### Task 8: Seed + DB verification (BLOCKED on runtime)

**Files:**
- Create: `supabase/seed.sql` (2 demo users note — auth users can't be seeded portably; document manual steps), `docs/VERIFICATION.md`

**Steps:**
- [x] Write `docs/VERIFICATION.md`: exact DoD script — user A (admin/pro) creates org + tour w/ visibility rule targeting group G; user B (mobile_access, not in G) must NOT see it; SQL probes to run
- [x] Attempt runtime: if Docker/OrbStack appears → `supabase start && supabase db reset`; else create Supabase cloud dev project via MCP (free tier, $0 — confirm cost first) and `supabase db push`
- [x] Commit: `docs: verification playbook + seed`
- [x] **Faza 0 DoD (blueprint):** doi useri în aceeași org cu permisiuni diferite văd/nu văd corect un tur cu visibility setat → requires Faza 1 `tours` table; the RLS-level equivalent here: visibility_rules + can_see_subject behavior verified via SQL against live DB. ✅ verified via 12 pgTAP-style SQL scenario tests on cloud DB (see VERIFICATION.md)

---

## Roadmap after Faza 0 (from blueprint §10 — each gets its own plan)
1. Faza 1 — Schelet de tur (tours/days/schedule + wizard + realtime)
2. Faza 2 — Events & Advancing (field registry §A.3 seed)
3. Faza 3 — Travel & Hotels; 4 — Guest List; 5 — SetLists/Tasks/Attachments/Contacts; 6 — Notificări/ICS/PDF; 7 — Accounting; 8 — Hardening & Deploy.

## Self-Review notes
- Spec coverage for Faza 0 checked against §10 Faza 0 bullet list: repo/CI ✔ (T1), migrations §3.2+§3.10 ✔ (T4), RLS funcs §5.2 ✔ (T5), permissions.ts + tests ✔ (T6), auth flows ✔ (T7), DoD ✔ (T8, partially blocked by no-Docker).
- Type consistency: `org_permission` enum values identical in SQL (T4), TS (T6), and invitations (T7).
- [D] markers preserved in code comments where blueprint flags uncertainty (permission-combination model §3.2 nota, accounting-edits-content §4.2).
