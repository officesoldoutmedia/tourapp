-- ═══ Faza 0 DoD — scenariu RLS cu 2 useri ═══
\set ON_ERROR_STOP on

-- Setup (superuser): 2 useri; admin devine 'pro'.
insert into auth.users (id, email, raw_user_meta_data) values
  ('a0000000-0000-0000-0000-00000000000a', 'admin@test.local', '{"first_name":"Ana","last_name":"Admin"}'),
  ('c0000000-0000-0000-0000-00000000000c', 'crew@test.local',  '{"first_name":"Cri","last_name":"Crew"}');

do $$ begin
  if (select count(*) from public.profiles) <> 2 then
    raise exception 'FAIL: trigger handle_new_user nu a creat profilele';
  end if;
end $$;
\echo 'PASS: profiles auto-create la signup'

update public.profiles set user_tier = 'pro' where email = 'admin@test.local';

-- ── Ca ADMIN (pro) ──
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-00000000000a"}', false);
set role authenticated;

select public.create_organization('SxS', 'sxs', 'music') as org_id \gset
\echo 'PASS: create_organization ca pro'

do $$ begin
  if (select count(*) from public.organizations) <> 1 then
    raise exception 'FAIL: adminul nu-si vede organizatia';
  end if;
  if (select permission from public.organization_members
      where user_id = auth.uid()) <> 'administrator' then
    raise exception 'FAIL: owner-ul nu e administrator';
  end if;
end $$;
\echo 'PASS: admin vede org + e administrator'

-- ── Ca CREW înainte de membership: nu vede nimic ──
select set_config('request.jwt.claims', '{"sub":"c0000000-0000-0000-0000-00000000000c"}', false);
do $$ begin
  if (select count(*) from public.organizations) <> 0 then
    raise exception 'FAIL: non-membrul vede organizatia';
  end if;
end $$;
\echo 'PASS: non-membrul nu vede org'

-- crew (free) nu poate crea organizatii
-- (din 00014 default-ul de tier e 'pro' — proba forțează explicit 'free')
select set_config('role', 'service_role', false);
set role service_role;
update public.profiles set user_tier = 'free'
  where id = 'c0000000-0000-0000-0000-00000000000c';
set role authenticated;
select set_config('request.jwt.claims', '{"sub":"c0000000-0000-0000-0000-00000000000c"}', false);
do $$ begin
  begin
    perform public.create_organization('Hack', 'hack', null);
    raise exception 'FAIL: userul free a creat organizatie';
  exception when others then
    if sqlerrm like 'FAIL%' then raise; end if;
  end;
end $$;
\echo 'PASS: free user nu poate crea org (pro required)'

-- ── Invitație: admin invită crew ca mobile_access ──
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-00000000000a"}', false);
insert into public.org_invitations (organization_id, email, permission, invited_by)
values (:'org_id', 'crew@test.local', 'mobile_access', 'a0000000-0000-0000-0000-00000000000a');
select token as invite_token from public.org_invitations limit 1 \gset
\echo 'PASS: admin creeaza invitatie'

-- crew acceptă
select set_config('request.jwt.claims', '{"sub":"c0000000-0000-0000-0000-00000000000c"}', false);
select public.accept_invitation(:'invite_token');
do $$ begin
  if (select count(*) from public.organizations) <> 1 then
    raise exception 'FAIL: membrul nou nu vede organizatia';
  end if;
end $$;
\echo 'PASS: accept_invitation -> crew vede org'

-- crew NU poate edita org (0 rânduri afectate de update)
update public.organizations set name = 'HACKED';
do $$ begin
  if exists (select 1 from public.organizations where name = 'HACKED') then
    raise exception 'FAIL: mobile_access a editat organizatia';
  end if;
end $$;
\echo 'PASS: mobile_access nu poate edita org'

-- crew NU poate crea grupuri
do $$ begin
  begin
    insert into public.groups (organization_id, name)
    select id, 'Band' from public.organizations limit 1;
    raise exception 'FAIL: mobile_access a creat grup';
  exception when insufficient_privilege or check_violation then null;
  when others then
    if sqlerrm like 'FAIL%' then raise;
    elsif sqlstate <> '42501' then null; end if;
  end;
end $$;
\echo 'PASS: mobile_access nu poate crea grupuri'

-- ── VISIBILITY: subiect fictiv de tip test ──
-- fără reguli: ambii văd
do $$ begin
  if not private.can_see_subject('00000000-0000-0000-0000-000000000000'::uuid
        , 'x', 'b0000000-0000-0000-0000-0000000000b0') then
    raise exception 'FAIL: default-deschis nu functioneaza';
  end if;
end $$;
\echo 'PASS: fara reguli -> vizibil (default deschis)'

-- admin adaugă regulă care țintește DOAR adminul
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-00000000000a"}', false);
insert into public.visibility_rules (organization_id, subject_type, subject_id, target_type, target_id)
values (:'org_id', 'test_subject', 'b0000000-0000-0000-0000-0000000000b0', 'user', 'a0000000-0000-0000-0000-00000000000a');

do $$ declare org uuid; begin
  select id into org from public.organizations limit 1;
  if not private.can_see_subject(org, 'test_subject', 'b0000000-0000-0000-0000-0000000000b0') then
    raise exception 'FAIL: adminul (bypass manager+) nu vede subiectul restrictionat';
  end if;
end $$;
\echo 'PASS: admin bypass visibility'

-- crew: are reguli, nu e țintă → NU vede
select set_config('request.jwt.claims', '{"sub":"c0000000-0000-0000-0000-00000000000c"}', false);
do $$ declare org uuid; begin
  select id into org from public.organizations limit 1;
  if private.can_see_subject(org, 'test_subject', 'b0000000-0000-0000-0000-0000000000b0') then
    raise exception 'FAIL: crew vede subiect restrictionat fara sa fie tinta';
  end if;
  if (select count(*) from public.visibility_rules) <> 0 then
    raise exception 'FAIL: crew poate enumera visibility_rules';
  end if;
end $$;
\echo 'PASS: crew NU vede subiect restrictionat si nici regulile'

-- ── Grup: admin creează grup cu crew în el + regulă pe grup → crew vede ──
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-00000000000a"}', false);
insert into public.groups (organization_id, name) values (:'org_id', 'Band');
insert into public.group_members (group_id, user_id)
select id, 'c0000000-0000-0000-0000-00000000000c' from public.groups where name = 'Band';
insert into public.visibility_rules (organization_id, subject_type, subject_id, target_type, target_id)
select :'org_id', 'test_subject', 'b0000000-0000-0000-0000-0000000000b0', 'group', id
from public.groups where name = 'Band';

select set_config('request.jwt.claims', '{"sub":"c0000000-0000-0000-0000-00000000000c"}', false);
do $$ declare org uuid; begin
  select id into org from public.organizations limit 1;
  if not private.can_see_subject(org, 'test_subject', 'b0000000-0000-0000-0000-0000000000b0') then
    raise exception 'FAIL: membrul grupului tintit nu vede subiectul';
  end if;
end $$;
\echo 'PASS: visibility prin grup functioneaza'

-- ── activity_log: doar admin ──
do $$ begin
  if (select count(*) from public.activity_log) <> 0 then
    raise exception 'FAIL: crew vede activity_log';
  end if;
end $$;
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-00000000000a"}', false);
do $$ begin
  if (select count(*) from public.activity_log) < 2 then
    raise exception 'FAIL: adminul nu vede activity_log';
  end if;
end $$;
\echo 'PASS: activity_log doar pentru admin'

\echo '═══ TOATE PROBELE RLS AU TRECUT ═══'
