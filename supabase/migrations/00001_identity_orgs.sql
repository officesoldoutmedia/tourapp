-- ═══════════════════════════════════════════════════════════════════
-- 00001 — Identitate, organizații, permisiuni, grupuri, visibility,
--          notificări, audit. (Blueprint §3.2, §3.10)
-- ═══════════════════════════════════════════════════════════════════

-- Schema pentru funcțiile helper de RLS (populată în 00002).
create schema if not exists private;

-- ───────────────────────────────────────────────────────────────────
-- Trigger generic updated_at (refolosit de toate tabelele viitoare)
-- ───────────────────────────────────────────────────────────────────
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ───────────────────────────────────────────────────────────────────
-- profiles — echivalent "Crew Profile" global al userului. [C]
-- v1.1: inventarul complet de crew trăiește pe tour_personnel (Faza 1);
-- profiles păstrează identitatea + preferințele proprii ale userului.
-- ───────────────────────────────────────────────────────────────────
create table public.profiles (
  id uuid primary key references auth.users on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  first_name text,
  last_name text,
  preferred_name text,
  avatar_url text,
  phone text,
  email text,
  user_tier text not null default 'free' check (user_tier in ('free', 'pro')),
  travel_prefs jsonb not null default '{}',
  swag_sizes jsonb not null default '{}',
  emergency_contact jsonb not null default '{}',
  dietary_notes text,
  passport_info jsonb not null default '{}',
  locale text not null default 'ro'
);

create trigger set_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

-- Auto-creare profil la signup (email copiat din auth.users).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, first_name, last_name)
  values (
    new.id,
    new.email,
    new.raw_user_meta_data ->> 'first_name',
    new.raw_user_meta_data ->> 'last_name'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ───────────────────────────────────────────────────────────────────
-- organizations [C] + org_type [C-S §6.1 v1.1]
-- ───────────────────────────────────────────────────────────────────
create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  deleted_at timestamptz,
  name text not null,
  slug text not null unique,
  org_type text,                          -- [C-S] ORGANIZATION TYPE (ex 'music')
  logo_primary_url text,
  logo_horizontal_url text,
  logo_square_url text,                   -- [C] 3 formate logo
  owner_id uuid not null references auth.users,
  settings jsonb not null default '{}'    -- ex {"guest_list_approval_emails": true} [C]
);

create trigger set_updated_at before update on public.organizations
  for each row execute function public.set_updated_at();

-- ───────────────────────────────────────────────────────────────────
-- org_permission — nivelele exacte din docs Eventric. [C]
-- NOTĂ [D]: implementat ca UN nivel per user per org (vezi §3.2 nota
-- și docs/DECISIONS.md). Ordinea ierarhică e codificată în
-- private.permission_rank() (00002).
-- ───────────────────────────────────────────────────────────────────
create type public.org_permission as enum (
  'administrator',
  'accounting',
  'manager',
  'gl_manage_all',
  'gl_view_all_submit',
  'gl_submit',
  'mobile_access'
);

create table public.organization_members (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  organization_id uuid not null references public.organizations on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  permission public.org_permission not null default 'mobile_access',
  invited_by uuid references auth.users,
  unique (organization_id, user_id)
);

create trigger set_updated_at before update on public.organization_members
  for each row execute function public.set_updated_at();

create index organization_members_user_idx on public.organization_members (user_id);

-- ───────────────────────────────────────────────────────────────────
-- groups — grupuri pentru Visibility (ex "Band", "Crew"). [C]
-- ───────────────────────────────────────────────────────────────────
create table public.groups (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  deleted_at timestamptz,
  organization_id uuid not null references public.organizations on delete cascade,
  name text not null
);

create trigger set_updated_at before update on public.groups
  for each row execute function public.set_updated_at();

create table public.group_members (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  group_id uuid not null references public.groups on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  unique (group_id, user_id)
);

-- ───────────────────────────────────────────────────────────────────
-- visibility_rules — motorul de confidențialitate. [C §5]
-- Fără reguli = vizibil tuturor; cu reguli = doar țintele + manager+.
-- ───────────────────────────────────────────────────────────────────
create table public.visibility_rules (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  organization_id uuid not null references public.organizations on delete cascade,
  subject_type text not null,   -- 'tour'|'day'|'schedule_item'|'travel_item'|'day_hotel'|'attachment'|'tour_personnel'|'task'
  subject_id uuid not null,
  target_type text not null check (target_type in ('user', 'group')),
  target_id uuid not null,
  created_by uuid references auth.users,
  unique (subject_type, subject_id, target_type, target_id)
);

create index visibility_rules_subject_idx
  on public.visibility_rules (subject_type, subject_id);

-- ───────────────────────────────────────────────────────────────────
-- notifications [C: push messages, reminders, notification center]
-- ───────────────────────────────────────────────────────────────────
create type public.notification_kind as enum (
  'message', 'reminder', 'system', 'guest_list', 'flight'
);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  organization_id uuid references public.organizations on delete cascade,
  recipient_id uuid not null references auth.users on delete cascade,
  kind public.notification_kind not null default 'message',
  title text,
  body text,
  ref_type text,
  ref_id uuid,
  sent_by uuid references auth.users,
  read_at timestamptz
);

create index notifications_recipient_idx
  on public.notifications (recipient_id, read_at);

-- ───────────────────────────────────────────────────────────────────
-- activity_log — audit generic. [N §2.2.5]
-- ───────────────────────────────────────────────────────────────────
create table public.activity_log (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  organization_id uuid not null,
  actor_id uuid,
  action text not null,           -- 'create'|'update'|'delete'|'approve'|...
  entity_type text not null,
  entity_id uuid,
  diff jsonb not null default '{}'
);

create index activity_log_org_idx on public.activity_log (organization_id, created_at);
