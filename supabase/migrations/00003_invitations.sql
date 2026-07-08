-- ═══════════════════════════════════════════════════════════════════
-- 00003 — Invitații în organizație. (Blueprint §4.3.3 [C flow])
-- Adaugi user pe email → dacă are cont primește direct permisiunea;
-- dacă nu, invitație cu token → la signup e auto-atașat.
-- ═══════════════════════════════════════════════════════════════════

create table public.org_invitations (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  organization_id uuid not null references public.organizations on delete cascade,
  email text not null,
  permission public.org_permission not null default 'mobile_access',
  token uuid not null unique default gen_random_uuid(),
  invited_by uuid references auth.users,
  accepted_at timestamptz,
  accepted_by uuid references auth.users
);

create trigger set_updated_at before update on public.org_invitations
  for each row execute function public.set_updated_at();

create index org_invitations_org_idx on public.org_invitations (organization_id);

alter table public.org_invitations enable row level security;

-- Doar administratorii org-ului văd/administrează invitațiile. (§4.2)
create policy invitations_select_admin on public.org_invitations
  for select to authenticated
  using (private.has_min_permission(organization_id, 'administrator') and private.is_pro());

create policy invitations_insert_admin on public.org_invitations
  for insert to authenticated
  with check (private.has_min_permission(organization_id, 'administrator') and private.is_pro());

create policy invitations_update_admin on public.org_invitations
  for update to authenticated
  using (private.has_min_permission(organization_id, 'administrator') and private.is_pro())
  with check (private.has_min_permission(organization_id, 'administrator') and private.is_pro());

create policy invitations_delete_admin on public.org_invitations
  for delete to authenticated
  using (private.has_min_permission(organization_id, 'administrator') and private.is_pro());

-- ───────────────────────────────────────────────────────────────────
-- Lookup public după token (pagina /invite/[token] — userul poate să
-- nu fie logat încă). SECURITY DEFINER, expune DOAR câmpurile necesare.
-- ───────────────────────────────────────────────────────────────────
create or replace function public.get_invitation(invite_token uuid)
returns table (
  organization_name text,
  email text,
  permission public.org_permission,
  accepted boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select o.name, i.email, i.permission, i.accepted_at is not null
  from public.org_invitations i
  join public.organizations o on o.id = i.organization_id
  where i.token = invite_token;
$$;

grant execute on function public.get_invitation(uuid) to anon, authenticated;

-- ───────────────────────────────────────────────────────────────────
-- Acceptare: atașează auth.uid() la organizație cu permisiunea setată.
-- Emailul contului trebuie să corespundă cu emailul invitat.
-- ───────────────────────────────────────────────────────────────────
create or replace function public.accept_invitation(invite_token uuid)
returns uuid  -- organization_id
language plpgsql
security definer
set search_path = ''
as $$
declare
  inv public.org_invitations%rowtype;
  uid uuid := (select auth.uid());
  user_email text;
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;

  select * into inv from public.org_invitations where token = invite_token;
  if not found then
    raise exception 'invitation not found';
  end if;
  if inv.accepted_at is not null then
    raise exception 'invitation already accepted';
  end if;

  select u.email into user_email from auth.users u where u.id = uid;
  if lower(user_email) is distinct from lower(inv.email) then
    raise exception 'invitation was issued for a different email';
  end if;

  insert into public.organization_members (organization_id, user_id, permission, invited_by)
  values (inv.organization_id, uid, inv.permission, inv.invited_by)
  on conflict (organization_id, user_id)
    do update set permission = excluded.permission;

  update public.org_invitations
  set accepted_at = now(), accepted_by = uid
  where id = inv.id;

  insert into public.activity_log (organization_id, actor_id, action, entity_type, entity_id)
  values (inv.organization_id, uid, 'accept_invitation', 'org_invitation', inv.id);

  return inv.organization_id;
end;
$$;

grant execute on function public.accept_invitation(uuid) to authenticated;
