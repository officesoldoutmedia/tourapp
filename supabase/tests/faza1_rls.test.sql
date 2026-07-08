-- ═══ Faza 1 — RLS pe tours/days/schedule_items/tour_personnel ═══
-- Rulează DUPĂ faza0_rls.test.sql (refolosește org-ul + userii creați acolo:
-- admin a0…0a = administrator/pro, crew c0…0c = mobile_access/free).
\set ON_ERROR_STOP on

select id as org_id from public.organizations limit 1 \gset

-- ── Admin creează tur + zile + schedule item ──
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-00000000000a"}', false);
set role authenticated;

insert into public.tours (organization_id, name, start_date, end_date, created_by)
values (:'org_id', 'SxS Summer 2026', '2026-07-17', '2026-07-26',
        'a0000000-0000-0000-0000-00000000000a')
returning id as tour_id \gset

insert into public.days (tour_id, date, day_type, city, country, timezone)
values (:'tour_id', '2026-07-17', 'show', 'Costinești', 'România', 'Europe/Bucharest')
returning id as day_id \gset

insert into public.schedule_items (day_id, title, start_at, end_at)
values (:'day_id', 'Load-in',
        '2026-07-17 07:00+00'::timestamptz, '2026-07-17 09:00+00'::timestamptz)
returning id as item_id \gset

insert into public.tour_personnel (tour_id, first_name, last_name, role)
values (:'tour_id', 'Dan', 'Driver', 'Driver')
returning id as personnel_id \gset
\echo 'PASS: manager+pro creeaza tur/zi/item/personnel'

-- ── Crew (mobile_access/free) vede tot (fara reguli de visibility) ──
select set_config('request.jwt.claims', '{"sub":"c0000000-0000-0000-0000-00000000000c"}', false);
do $$ begin
  if (select count(*) from public.tours) <> 1
     or (select count(*) from public.days) <> 1
     or (select count(*) from public.schedule_items) <> 1
     or (select count(*) from public.tour_personnel) <> 1 then
    raise exception 'FAIL: crew nu vede continutul de tur fara reguli';
  end if;
end $$;
\echo 'PASS: crew vede tur/zi/schedule/personnel (default deschis)'

-- crew NU poate scrie conținut de tur
do $$ declare tid uuid; begin
  select id into tid from public.tours limit 1;
  begin
    insert into public.days (tour_id, date) values (tid, '2026-07-18');
    raise exception 'FAIL: crew a creat o zi';
  exception when others then
    if sqlerrm like 'FAIL%' then raise; end if;
  end;
  update public.schedule_items set title = 'HACKED';
  if exists (select 1 from public.schedule_items where title = 'HACKED') then
    raise exception 'FAIL: crew a editat schedule item';
  end if;
end $$;
\echo 'PASS: crew nu poate scrie continut de tur'

-- ── Visibility pe SCHEDULE ITEM individual: doar adminul tinta ──
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-00000000000a"}', false);
insert into public.visibility_rules (organization_id, subject_type, subject_id, target_type, target_id)
values (:'org_id', 'schedule_item', :'item_id', 'user', 'a0000000-0000-0000-0000-00000000000a');

select set_config('request.jwt.claims', '{"sub":"c0000000-0000-0000-0000-00000000000c"}', false);
do $$ begin
  if (select count(*) from public.schedule_items) <> 0 then
    raise exception 'FAIL: crew vede schedule item restrictionat';
  end if;
  -- ziua si turul raman vizibile
  if (select count(*) from public.days) <> 1 then
    raise exception 'FAIL: restrictia pe item a ascuns si ziua';
  end if;
end $$;
\echo 'PASS: visibility pe schedule_item individual'

-- ── Visibility pe TUR: crew nu mai vede nimic (tur, zile, itemi, crew) ──
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-00000000000a"}', false);
insert into public.visibility_rules (organization_id, subject_type, subject_id, target_type, target_id)
values (:'org_id', 'tour', :'tour_id', 'user', 'a0000000-0000-0000-0000-00000000000a');

-- adminul vede în continuare tot (bypass [C])
do $$ begin
  if (select count(*) from public.tours) <> 1
     or (select count(*) from public.schedule_items) <> 1 then
    raise exception 'FAIL: adminul a pierdut accesul la propriul tur';
  end if;
end $$;

select set_config('request.jwt.claims', '{"sub":"c0000000-0000-0000-0000-00000000000c"}', false);
do $$ begin
  if (select count(*) from public.tours) <> 0
     or (select count(*) from public.days) <> 0
     or (select count(*) from public.schedule_items) <> 0
     or (select count(*) from public.tour_personnel) <> 0 then
    raise exception 'FAIL: turul restrictionat nu cascadeaza pe zile/itemi/crew';
  end if;
end $$;
\echo 'PASS: tur restrictionat -> dispare complet pentru crew (cascada §5.1.5)'

-- ── Grupul din faza0 (crew e membru) primeste acces la tur ──
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-00000000000a"}', false);
insert into public.visibility_rules (organization_id, subject_type, subject_id, target_type, target_id)
select :'org_id', 'tour', :'tour_id', 'group', id from public.groups where name = 'Band';

select set_config('request.jwt.claims', '{"sub":"c0000000-0000-0000-0000-00000000000c"}', false);
do $$ begin
  if (select count(*) from public.tours) <> 1 or (select count(*) from public.days) <> 1 then
    raise exception 'FAIL: membrul grupului tintit nu vede turul';
  end if;
  -- itemul individual restrictionat ramane ascuns
  if (select count(*) from public.schedule_items) <> 0 then
    raise exception 'FAIL: item-level rule ignorata dupa deschiderea turului';
  end if;
end $$;
\echo 'PASS: visibility pe tur prin grup + item-level rule respectata'

-- ── Soft delete: zi stearsa dispare din select ──
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-00000000000a"}', false);
update public.days set deleted_at = now() where id = :'day_id';
do $$ begin
  -- editorul vede randul sters (trash/restore), dar filtrat pe deleted_at
  if (select count(*) from public.days where deleted_at is null) <> 0 then
    raise exception 'FAIL: ziua soft-deleted apare ca activa';
  end if;
  if (select count(*) from public.days) <> 1 then
    raise exception 'FAIL: editorul nu vede randul sters (restore imposibil)';
  end if;
end $$;
-- crew nu vede deloc randul sters
select set_config('request.jwt.claims', '{"sub":"c0000000-0000-0000-0000-00000000000c"}', false);
do $$ begin
  if (select count(*) from public.days) <> 0 then
    raise exception 'FAIL: crew vede ziua soft-deleted';
  end if;
end $$;
-- restore de catre editor
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-00000000000a"}', false);
update public.days set deleted_at = null where id = :'day_id';
do $$ begin
  if (select count(*) from public.days where deleted_at is null) <> 1 then
    raise exception 'FAIL: restore esuat';
  end if;
end $$;
\echo 'PASS: soft delete + trash editor + restore'

\echo '═══ FAZA 1 RLS: TOATE PROBELE AU TRECUT ═══'
