-- ═══ Faza 5 — RLS songs/set lists/tasks/attachments/contacts ═══
-- Continuă starea: admin a0… (administrator/pro), crew c0… (mobile_access,
-- în Band → vede turul), gl 90… (gl_submit). Event 'GL SHOW' pe 2026-07-19.
\set ON_ERROR_STOP on

select id as org_id from public.organizations limit 1 \gset
select id as tour_id from public.tours limit 1 \gset
select e.id as event_id from public.events e where e.title = 'GL SHOW' \gset

-- ── Admin: piesă + set list + item ──
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-00000000000a"}', false);
set role authenticated;

insert into public.songs (organization_id, title, length_seconds, bpm, song_key)
values (:'org_id', 'Anthem', 240, 128, 'Am')
returning id as song_id \gset

insert into public.set_lists (event_id) values (:'event_id');
insert into public.set_list_items (set_list_id, position, item_type, song_id, guest_performers)
values (:'event_id', 0, 'song', :'song_id', 'MC Guest');
insert into public.set_list_items (set_list_id, position, item_type, break_label)
values (:'event_id', 1, 'break', 'Outfit change');
\echo 'PASS: song + set list + break create'

-- DoD: editarea piesei în org se vede prin set list (referință, nu copie)
update public.songs set title = 'Anthem (VIP Mix)', length_seconds = 250
where id = :'song_id';
do $$ begin
  if not exists (
    select 1 from public.set_list_items i
    join public.songs s on s.id = i.song_id
    where s.title = 'Anthem (VIP Mix)' and s.length_seconds = 250
  ) then
    raise exception 'FAIL: editarea piesei nu se vede prin set list';
  end if;
end $$;
\echo 'PASS: song edit se propaga in set list (DoD)'

-- crew vede set list-ul [D §6.10] dar nu-l editează
select set_config('request.jwt.claims', '{"sub":"c0000000-0000-0000-0000-00000000000c"}', false);
do $$ begin
  if (select count(*) from public.set_list_items) <> 2 then
    raise exception 'FAIL: crew nu vede set list-ul';
  end if;
  begin
    insert into public.set_list_items (set_list_id, position, item_type, break_label)
    select event_id, 9, 'break', 'HACK' from public.set_lists limit 1;
    raise exception 'FAIL: crew a editat set list-ul';
  exception when others then
    if sqlerrm like 'FAIL%' then raise; end if;
  end;
end $$;
\echo 'PASS: crew vede set list, nu editeaza'

-- ── Tasks: overdue e UI; aici verificăm accesul + visibility ──
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-00000000000a"}', false);
insert into public.tasks (tour_id, title, due_at)
values (:'tour_id', 'Trimite riderul', now() - interval '1 day')
returning id as task_id \gset

insert into public.visibility_rules (organization_id, subject_type, subject_id, target_type, target_id)
values (:'org_id', 'task', :'task_id', 'user', 'a0000000-0000-0000-0000-00000000000a');

select set_config('request.jwt.claims', '{"sub":"c0000000-0000-0000-0000-00000000000c"}', false);
do $$ begin
  if (select count(*) from public.tasks) <> 0 then
    raise exception 'FAIL: task restrictionat vizibil pentru crew';
  end if;
end $$;
\echo 'PASS: task cu visibility ascuns pentru crew'

-- ── Attachments: DoD — attachment cu visibility ascuns pt user simplu ──
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-00000000000a"}', false);
select d.id as day3_id from public.days d where d.date = '2026-07-19' \gset

insert into public.attachments (organization_id, parent_type, parent_id, file_name, storage_path, tags)
values (:'org_id', 'day', :'day3_id', 'rider.pdf', :'org_id' || '/riders/rider.pdf', '{rider,audio}')
returning id as att_id \gset

-- fără reguli: crew îl vede
select set_config('request.jwt.claims', '{"sub":"c0000000-0000-0000-0000-00000000000c"}', false);
do $$ begin
  if (select count(*) from public.attachments) <> 1 then
    raise exception 'FAIL: crew nu vede attachment-ul fara reguli';
  end if;
end $$;

-- cu regulă doar pt admin: crew NU-l mai vede (DoD)
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-00000000000a"}', false);
insert into public.visibility_rules (organization_id, subject_type, subject_id, target_type, target_id)
values (:'org_id', 'attachment', :'att_id', 'user', 'a0000000-0000-0000-0000-00000000000a');

select set_config('request.jwt.claims', '{"sub":"c0000000-0000-0000-0000-00000000000c"}', false);
do $$ begin
  if (select count(*) from public.attachments) <> 0 then
    raise exception 'FAIL: attachment cu visibility vizibil pentru crew (DoD)';
  end if;
end $$;
\echo 'PASS: attachment cu visibility ascuns pentru user simplu (DoD)'

-- ── Accounting attachments: invizibile sub accounting [C] ──
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-00000000000a"}', false);
insert into public.attachments (organization_id, parent_type, parent_id, file_name, storage_path)
values (:'org_id', 'event_accounting', :'event_id', 'settlement.xlsx', :'org_id' || '/acc/settlement.xlsx');

do $$ begin
  if (select count(*) from public.attachments where parent_type = 'event_accounting') <> 1 then
    raise exception 'FAIL: adminul nu vede accounting attachment';
  end if;
end $$;

select set_config('request.jwt.claims', '{"sub":"90000000-0000-0000-0000-000000000009"}', false);
do $$ begin
  if (select count(*) from public.attachments where parent_type = 'event_accounting') <> 0 then
    raise exception 'FAIL: gl_submit vede accounting attachments';
  end if;
end $$;
\echo 'PASS: accounting attachments doar pentru admin/accounting'

-- ── Contacts: FK-urile amânate funcționează ──
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-00000000000a"}', false);
insert into public.companies (organization_id, name, kind)
values (:'org_id', 'Backline SRL', 'Backline Rental')
returning id as company_id \gset
insert into public.contacts (organization_id, company_id, first_name, last_name, role)
values (:'org_id', :'company_id', 'Radu', 'Tehnic', 'Owner')
returning id as contact_id \gset

update public.tour_personnel set contact_id = :'contact_id'
where last_name = 'Driver';
do $$ begin
  if not exists (select 1 from public.tour_personnel where contact_id is not null) then
    raise exception 'FAIL: FK tour_personnel->contacts nu functioneaza';
  end if;
end $$;
\echo 'PASS: companies/contacts + FK-urile amanate'

\echo '═══ FAZA 5 RLS: TOATE PROBELE AU TRECUT ═══'
