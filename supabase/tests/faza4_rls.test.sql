-- ═══ Faza 4 — RLS Guest List (§4.3.2) ═══
-- Continuă starea din faza3. Useri: admin a0… (administrator/pro),
-- crew c0… (mobile_access/free, în grupul Band). Adăugăm g0… (gl_submit).
\set ON_ERROR_STOP on

select id as org_id from public.organizations limit 1 \gset
select id as tour_id from public.tours limit 1 \gset

-- Setup superuser: user nou gl_submit, membru + în grupul Band (vede turul)
reset role;
insert into auth.users (id, email) values
  ('90000000-0000-0000-0000-000000000009', 'gl@test.local');
insert into public.organization_members (organization_id, user_id, permission)
values (:'org_id', '90000000-0000-0000-0000-000000000009', 'gl_submit');
insert into public.group_members (group_id, user_id)
select id, '90000000-0000-0000-0000-000000000009' from public.groups where name = 'Band';

-- Admin: event pe ziua vizibilă (2026-07-19) + UN singur pass type [C edge]
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-00000000000a"}', false);
set role authenticated;

select id as day3_id from public.days where date = '2026-07-19' \gset

insert into public.events (day_id, title) values (:'day3_id', 'GL SHOW')
returning id as event_id \gset

insert into public.tour_passes (tour_id, name) values (:'tour_id', 'AAA')
returning id as pass_id \gset

insert into public.event_guest_list_settings (event_id, tickets_allotment, tickets_enforced)
values (:'event_id', 5, true);
\echo 'PASS: setup event + pass unic + allotment enforced'

-- ── gl_submit: submite request cu 2 bilete + pass-ul AAA (un singur tip [C]) ──
select set_config('request.jwt.claims', '{"sub":"90000000-0000-0000-0000-000000000009"}', false);
insert into public.guest_list_requests (event_id, last_name, first_name, num_tickets, requested_by)
values (:'event_id', 'Pop', 'Ion', 2, '90000000-0000-0000-0000-000000000009')
returning id as req_id \gset
insert into public.guest_request_passes (request_id, pass_type_id, quantity)
values (:'req_id', :'pass_id', 1);
do $$ begin
  if (select count(*) from public.guest_list_requests) <> 1 then
    raise exception 'FAIL: submitterul nu-si vede requestul';
  end if;
end $$;
\echo 'PASS: gl_submit submite (un singur pass type OK) si isi vede requestul'

-- ── Enforced allotment: 4 bilete în plus (2+4 > 5) → blocat [C] ──
do $$ begin
  begin
    insert into public.guest_list_requests (event_id, last_name, num_tickets, requested_by)
    select e.id, 'Prea', 4, '90000000-0000-0000-0000-000000000009'
    from public.events e where e.title = 'GL SHOW';
    raise exception 'FAIL: enforced allotment nu a blocat';
  exception when others then
    if sqlerrm like 'FAIL%' then raise; end if;
  end;
end $$;
\echo 'PASS: enforced allotment blocheaza submitterul'

-- owner edit pe pending OK; nu-si poate aproba singur requestul
update public.guest_list_requests set notes = 'plus one' where id = :'req_id';
do $$ declare rid uuid; begin
  select id into rid from public.guest_list_requests limit 1;
  if (select notes from public.guest_list_requests where id = rid) <> 'plus one' then
    raise exception 'FAIL: ownerul nu-si poate edita requestul pending';
  end if;
  begin
    update public.guest_list_requests set status = 'approved' where id = rid;
    if exists (select 1 from public.guest_list_requests where status = 'approved') then
      raise exception 'FAIL: submitterul si-a aprobat singur requestul';
    end if;
  exception when others then
    if sqlerrm like 'FAIL%' then raise; end if;
  end;
end $$;
\echo 'PASS: owner edit pending, dar nu se poate auto-aproba'

-- ── mobile_access (crew): nu vede si nu poate submite [C §4.2] ──
select set_config('request.jwt.claims', '{"sub":"c0000000-0000-0000-0000-00000000000c"}', false);
do $$ declare eid uuid; begin
  if (select count(*) from public.guest_list_requests) <> 0 then
    raise exception 'FAIL: mobile_access vede guest list';
  end if;
  select e.id into eid from public.events e where e.title = 'GL SHOW';
  begin
    insert into public.guest_list_requests (event_id, last_name, requested_by)
    values (eid, 'Hack', 'c0000000-0000-0000-0000-00000000000c');
    raise exception 'FAIL: mobile_access a submis request';
  exception when others then
    if sqlerrm like 'FAIL%' then raise; end if;
  end;
end $$;
\echo 'PASS: mobile_access nu vede si nu submite GL'

-- ── Cutoff depășit: submitterul e blocat, managerul NU [C] ──
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-00000000000a"}', false);
update public.event_guest_list_settings
set cutoff_at = now() - interval '1 hour', tickets_enforced = false
where event_id = :'event_id';

select set_config('request.jwt.claims', '{"sub":"90000000-0000-0000-0000-000000000009"}', false);
do $$ declare eid uuid; begin
  select e.id into eid from public.events e where e.title = 'GL SHOW';
  begin
    insert into public.guest_list_requests (event_id, last_name, requested_by)
    values (eid, 'Late', '90000000-0000-0000-0000-000000000009');
    raise exception 'FAIL: cutoff nu a blocat submitterul';
  exception when others then
    if sqlerrm like 'FAIL%' then raise; end if;
  end;
end $$;

select set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-00000000000a"}', false);
insert into public.guest_list_requests (event_id, last_name, requested_by)
values (:'event_id', 'VIP Late', 'a0000000-0000-0000-0000-00000000000a');
\echo 'PASS: cutoff blocheaza submitterul dar NU managerul'

-- ── Managerul aprobă; ownerul nu mai poate edita după aprobare [D] ──
update public.guest_list_requests set status = 'approved', seat_row = 'A', seat = '12'
where id = :'req_id';

select set_config('request.jwt.claims', '{"sub":"90000000-0000-0000-0000-000000000009"}', false);
do $$ declare rid uuid; begin
  select id into rid from public.guest_list_requests where status = 'approved' limit 1;
  update public.guest_list_requests set notes = 'schimbat' where id = rid;
  if (select notes from public.guest_list_requests where id = rid) = 'schimbat' then
    raise exception 'FAIL: ownerul a editat un request aprobat';
  end if;
  -- dar il vede in continuare, cu status si loc
  if (select count(*) from public.guest_list_requests where status = 'approved') <> 1 then
    raise exception 'FAIL: ownerul nu-si vede requestul aprobat';
  end if;
end $$;
\echo 'PASS: aprobarea e doar la gl_manage_all+; ownerul vede statusul'

\echo '═══ FAZA 4 RLS: TOATE PROBELE AU TRECUT ═══'
