-- ═══════════════════════════════════════════════════════════════════
-- 00002 — Funcțiile helper RLS (schema private) + politicile de bază.
-- (Blueprint §4, §5.2 — O SINGURĂ implementare, refolosită peste tot.)
-- ═══════════════════════════════════════════════════════════════════

grant usage on schema private to authenticated;

-- ───────────────────────────────────────────────────────────────────
-- Ierarhia de permisiuni. Rank mic = putere mare.
-- administrator > accounting > manager > gl_manage_all >
-- gl_view_all_submit > gl_submit > mobile_access   (§4.2)
-- ───────────────────────────────────────────────────────────────────
create or replace function private.permission_rank(p public.org_permission)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case p
    when 'administrator'      then 1
    when 'accounting'         then 2
    when 'manager'            then 3
    when 'gl_manage_all'      then 4
    when 'gl_view_all_submit' then 5
    when 'gl_submit'          then 6
    when 'mobile_access'      then 7
  end;
$$;

-- Permisiunea userului curent în org (null = nu e membru).
-- SECURITY DEFINER: citește organization_members fără să declanșeze
-- recursiv politicile RLS de pe același tabel.
create or replace function private.current_member_permission(org uuid)
returns public.org_permission
language sql
stable
security definer
set search_path = ''
as $$
  select m.permission
  from public.organization_members m
  where m.organization_id = org
    and m.user_id = (select auth.uid());
$$;

create or replace function private.is_org_member(org uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.current_member_permission(org) is not null;
$$;

create or replace function private.has_min_permission(
  org uuid,
  required public.org_permission
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    private.permission_rank(private.current_member_permission(org))
      <= private.permission_rank(required),
    false
  );
$$;

-- User tier gate: editările de conținut cer cont 'pro'. (§4.1)
create or replace function private.is_pro()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select p.user_tier = 'pro'
     from public.profiles p
     where p.id = (select auth.uid())),
    false
  );
$$;

-- ───────────────────────────────────────────────────────────────────
-- Visibility (§5.1, regulile exacte [C]):
--  1. fără reguli → vizibil tuturor membrilor
--  2. cu reguli   → doar țintele (user direct sau prin grup)
--  3. bypass      → administrator, accounting, manager
-- ───────────────────────────────────────────────────────────────────
create or replace function private.can_see_subject(
  org uuid,
  stype text,
  sid uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    private.has_min_permission(org, 'manager')
    or not exists (
      select 1 from public.visibility_rules r
      where r.subject_type = stype and r.subject_id = sid
    )
    or exists (
      select 1 from public.visibility_rules r
      where r.subject_type = stype and r.subject_id = sid
        and r.target_type = 'user' and r.target_id = (select auth.uid())
    )
    or exists (
      select 1
      from public.visibility_rules r
      join public.group_members gm on gm.group_id = r.target_id
      where r.subject_type = stype and r.subject_id = sid
        and r.target_type = 'group' and gm.user_id = (select auth.uid())
    );
$$;

grant execute on all functions in schema private to authenticated;

-- ───────────────────────────────────────────────────────────────────
-- Creare organizație: funcție SECURITY DEFINER care inserează org +
-- membership de administrator atomic (rezolvă chicken-and-egg cu RLS).
-- Doar useri 'pro' pot crea organizații. (§1.3, §4.2 manage_tours)
-- ───────────────────────────────────────────────────────────────────
create or replace function public.create_organization(
  org_name text,
  org_slug text,
  org_type_in text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_org_id uuid;
  uid uuid := (select auth.uid());
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;
  if not private.is_pro() then
    raise exception 'pro account required';
  end if;
  if org_name is null or length(trim(org_name)) = 0 then
    raise exception 'organization name required';
  end if;

  insert into public.organizations (name, slug, org_type, owner_id)
  values (trim(org_name), org_slug, org_type_in, uid)
  returning id into new_org_id;

  insert into public.organization_members (organization_id, user_id, permission)
  values (new_org_id, uid, 'administrator');

  insert into public.activity_log (organization_id, actor_id, action, entity_type, entity_id)
  values (new_org_id, uid, 'create', 'organization', new_org_id);

  return new_org_id;
end;
$$;

-- ═══════════════════════════════════════════════════════════════════
-- POLITICI RLS — niciun tabel fără RLS (§2.2.2)
-- ═══════════════════════════════════════════════════════════════════

-- profiles ──────────────────────────────────────────────────────────
alter table public.profiles enable row level security;

create policy profiles_select_self_or_orgmate on public.profiles
  for select to authenticated
  using (
    id = (select auth.uid())
    or exists (
      select 1
      from public.organization_members mine
      join public.organization_members theirs
        on theirs.organization_id = mine.organization_id
      where mine.user_id = (select auth.uid())
        and theirs.user_id = public.profiles.id
    )
  );

create policy profiles_update_self on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- insert: doar trigger-ul handle_new_user (security definer) / service role.

-- organizations ─────────────────────────────────────────────────────
alter table public.organizations enable row level security;

create policy orgs_select_member on public.organizations
  for select to authenticated
  using (private.is_org_member(id) and deleted_at is null);

create policy orgs_update_admin_pro on public.organizations
  for update to authenticated
  using (private.has_min_permission(id, 'administrator') and private.is_pro())
  with check (private.has_min_permission(id, 'administrator') and private.is_pro());

-- insert: exclusiv prin public.create_organization(). delete: soft (update).

-- organization_members ──────────────────────────────────────────────
alter table public.organization_members enable row level security;

create policy members_select_orgmate on public.organization_members
  for select to authenticated
  using (private.is_org_member(organization_id));

create policy members_insert_admin on public.organization_members
  for insert to authenticated
  with check (
    private.has_min_permission(organization_id, 'administrator')
    and private.is_pro()
  );

create policy members_update_admin on public.organization_members
  for update to authenticated
  using (
    private.has_min_permission(organization_id, 'administrator')
    and private.is_pro()
  )
  with check (
    private.has_min_permission(organization_id, 'administrator')
    and private.is_pro()
  );

-- Admin scoate membri; orice membru poate pleca singur (leave).
create policy members_delete_admin_or_self on public.organization_members
  for delete to authenticated
  using (
    (private.has_min_permission(organization_id, 'administrator') and private.is_pro())
    or user_id = (select auth.uid())
  );

-- groups ────────────────────────────────────────────────────────────
alter table public.groups enable row level security;

create policy groups_select_member on public.groups
  for select to authenticated
  using (private.is_org_member(organization_id) and deleted_at is null);

create policy groups_write_manager_pro on public.groups
  for all to authenticated
  using (private.has_min_permission(organization_id, 'manager') and private.is_pro())
  with check (private.has_min_permission(organization_id, 'manager') and private.is_pro());

-- group_members ─────────────────────────────────────────────────────
alter table public.group_members enable row level security;

create policy group_members_select_member on public.group_members
  for select to authenticated
  using (
    exists (
      select 1 from public.groups g
      where g.id = group_id and private.is_org_member(g.organization_id)
    )
  );

create policy group_members_write_manager_pro on public.group_members
  for all to authenticated
  using (
    exists (
      select 1 from public.groups g
      where g.id = group_id
        and private.has_min_permission(g.organization_id, 'manager')
        and private.is_pro()
    )
  )
  with check (
    exists (
      select 1 from public.groups g
      where g.id = group_id
        and private.has_min_permission(g.organization_id, 'manager')
        and private.is_pro()
    )
  );

-- visibility_rules ──────────────────────────────────────────────────
-- Doar manager+ vede și administrează regulile (§5.3: userii simpli nu
-- primesc niciun semnal despre existența restricțiilor).
alter table public.visibility_rules enable row level security;

create policy visibility_select_manager on public.visibility_rules
  for select to authenticated
  using (private.has_min_permission(organization_id, 'manager'));

create policy visibility_write_manager_pro on public.visibility_rules
  for all to authenticated
  using (private.has_min_permission(organization_id, 'manager') and private.is_pro())
  with check (private.has_min_permission(organization_id, 'manager') and private.is_pro());

-- notifications ─────────────────────────────────────────────────────
alter table public.notifications enable row level security;

create policy notifications_select_recipient on public.notifications
  for select to authenticated
  using (recipient_id = (select auth.uid()));

-- Recipient marchează citit (doar propriile rânduri).
create policy notifications_update_recipient on public.notifications
  for update to authenticated
  using (recipient_id = (select auth.uid()))
  with check (recipient_id = (select auth.uid()));

-- Push messages: admin/accounting/manager + pro, către membri ai org. (§4.2)
create policy notifications_insert_sender on public.notifications
  for insert to authenticated
  with check (
    organization_id is not null
    and private.has_min_permission(organization_id, 'manager')
    and private.is_pro()
    and sent_by = (select auth.uid())
    and exists (
      select 1 from public.organization_members m
      where m.organization_id = notifications.organization_id
        and m.user_id = notifications.recipient_id
    )
  );

-- activity_log ──────────────────────────────────────────────────────
alter table public.activity_log enable row level security;

create policy activity_select_admin on public.activity_log
  for select to authenticated
  using (private.has_min_permission(organization_id, 'administrator'));

-- insert: doar service role / funcții security definer (fără politică
-- de insert pentru authenticated).
