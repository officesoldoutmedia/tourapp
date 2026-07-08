-- ═══════════════════════════════════════════════════════════════════
-- 00011 — Faza 6: refactor visibility-for-user + ical_tokens,
--          share_links, push_subscriptions, public.ical_feed().
-- ═══════════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────────────────────
-- Refactor: versiuni parametrizate pe user. Feed-urile ICS rulează fără
-- sesiune (service role) dar TREBUIE să respecte visibility-ul userului
-- [C §6.16] — de aici *_for(uid, …). Funcțiile existente deleghează.
-- ───────────────────────────────────────────────────────────────────
create or replace function private.member_permission_for(uid uuid, org uuid)
returns public.org_permission
language sql
stable
security definer
set search_path = ''
as $$
  select m.permission
  from public.organization_members m
  where m.organization_id = org and m.user_id = uid;
$$;

create or replace function private.is_org_member_for(uid uuid, org uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.member_permission_for(uid, org) is not null;
$$;

create or replace function private.has_min_permission_for(
  uid uuid, org uuid, required public.org_permission
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    private.permission_rank(private.member_permission_for(uid, org))
      <= private.permission_rank(required),
    false
  );
$$;

create or replace function private.can_see_subject_for(
  uid uuid, org uuid, stype text, sid uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    private.has_min_permission_for(uid, org, 'manager')
    or not exists (
      select 1 from public.visibility_rules r
      where r.subject_type = stype and r.subject_id = sid
    )
    or exists (
      select 1 from public.visibility_rules r
      where r.subject_type = stype and r.subject_id = sid
        and r.target_type = 'user' and r.target_id = uid
    )
    or exists (
      select 1
      from public.visibility_rules r
      join public.group_members gm on gm.group_id = r.target_id
      where r.subject_type = stype and r.subject_id = sid
        and r.target_type = 'group' and gm.user_id = uid
    );
$$;

-- delegările (păstrează semnăturile existente folosite de politici)
create or replace function private.current_member_permission(org uuid)
returns public.org_permission
language sql
stable
security definer
set search_path = ''
as $$
  select private.member_permission_for((select auth.uid()), org);
$$;

create or replace function private.can_see_subject(org uuid, stype text, sid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.can_see_subject_for((select auth.uid()), org, stype, sid);
$$;

grant execute on all functions in schema private to authenticated;

-- ───────────────────────────────────────────────────────────────────
-- ical_tokens [N §6.16] — per user, regenerabile (revocare)
-- ───────────────────────────────────────────────────────────────────
create table public.ical_tokens (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  user_id uuid not null references auth.users on delete cascade,
  token uuid not null unique default gen_random_uuid(),
  label text,
  revoked_at timestamptz
);

alter table public.ical_tokens enable row level security;

create policy ical_tokens_own_select on public.ical_tokens
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy ical_tokens_own_insert on public.ical_tokens
  for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy ical_tokens_own_update on public.ical_tokens
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy ical_tokens_own_delete on public.ical_tokens
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- ───────────────────────────────────────────────────────────────────
-- share_links [N §6.17.4] — day sheet public, expirare opțională
-- ───────────────────────────────────────────────────────────────────
create table public.share_links (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  token uuid not null unique default gen_random_uuid(),
  day_id uuid not null references public.days on delete cascade,
  created_by uuid references auth.users,
  expires_at timestamptz,
  revoked_at timestamptz
);

alter table public.share_links enable row level security;

create policy share_links_select on public.share_links
  for select to authenticated
  using (private.can_edit_day(day_id));

create policy share_links_insert on public.share_links
  for insert to authenticated
  with check (private.can_edit_day(day_id));

create policy share_links_update on public.share_links
  for update to authenticated
  using (private.can_edit_day(day_id))
  with check (private.can_edit_day(day_id));

create policy share_links_delete on public.share_links
  for delete to authenticated
  using (private.can_edit_day(day_id));

-- ───────────────────────────────────────────────────────────────────
-- push_subscriptions (Web Push VAPID — trimiterea vine în hardening)
-- ───────────────────────────────────────────────────────────────────
create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  user_id uuid not null references auth.users on delete cascade,
  endpoint text not null unique,
  keys jsonb not null default '{}'
);

alter table public.push_subscriptions enable row level security;

create policy push_subscriptions_own on public.push_subscriptions
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy push_subscriptions_own_insert on public.push_subscriptions
  for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy push_subscriptions_own_delete on public.push_subscriptions
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- ───────────────────────────────────────────────────────────────────
-- Feed-ul ICS: toate zilele vizibile userului token-ului. [C §6.16]
-- Doar service_role îl poate apela (ruta /api/ical).
-- ───────────────────────────────────────────────────────────────────
create or replace function public.ical_feed(feed_token uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  uid uuid;
begin
  select t.user_id into uid
  from public.ical_tokens t
  where t.token = feed_token and t.revoked_at is null;
  if uid is null then
    return null;
  end if;

  return coalesce((
    select jsonb_agg(day_obj order by day_obj->>'date')
    from (
      select jsonb_build_object(
        'date', d.date,
        'day_type', d.day_type,
        'city', d.city,
        'country', d.country,
        'timezone', d.timezone,
        'general_notes', d.general_notes,
        'tour', t.name,
        'venues', coalesce((
          select jsonb_agg(v.name)
          from public.events e join public.venues v on v.id = e.venue_id
          where e.day_id = d.id and e.deleted_at is null
        ), '[]'::jsonb),
        'hotels', coalesce((
          select jsonb_agg(h.name order by h.sort_order)
          from public.day_hotels h
          where h.day_id = d.id and h.deleted_at is null
            and private.can_see_subject_for(uid, t.organization_id, 'day_hotel', h.id)
        ), '[]'::jsonb),
        'schedule', coalesce((
          select jsonb_agg(jsonb_build_object(
            'title', si.title, 'start_at', si.start_at, 'end_at', si.end_at
          ) order by si.start_at)
          from public.schedule_items si
          where si.day_id = d.id and si.deleted_at is null
            and private.can_see_subject_for(uid, t.organization_id, 'schedule_item', si.id)
        ), '[]'::jsonb),
        'travel', coalesce((
          select jsonb_agg(jsonb_build_object(
            'title', tr.title,
            'depart_time', tr.depart_time, 'arrive_time', tr.arrive_time,
            'depart_day_offset', tr.depart_day_offset,
            'arrive_day_offset', tr.arrive_day_offset
          ) order by tr.depart_time)
          from public.travel_items tr
          where tr.day_id = d.id and tr.deleted_at is null
            and private.can_see_subject_for(uid, t.organization_id, 'travel_item', tr.id)
        ), '[]'::jsonb)
      ) as day_obj
      from public.days d
      join public.tours t on t.id = d.tour_id
      where d.deleted_at is null
        and t.deleted_at is null
        and private.is_org_member_for(uid, t.organization_id)
        and private.can_see_subject_for(uid, t.organization_id, 'tour', t.id)
        and private.can_see_subject_for(uid, t.organization_id, 'day', d.id)
    ) sub
  ), '[]'::jsonb);
end;
$$;

revoke execute on function public.ical_feed(uuid) from public, anon, authenticated;
grant execute on function public.ical_feed(uuid) to service_role;
