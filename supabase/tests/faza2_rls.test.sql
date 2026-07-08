-- ═══ Faza 2 — RLS pe events/field registry/advances/labor calls ═══
-- Rulează după faza1 (org + userii + turul "SxS Summer 2026" există;
-- turul are regulă de visibility: admin + grupul Band → crew VEDE turul).
\set ON_ERROR_STOP on

select id as org_id from public.organizations limit 1 \gset
select id as tour_id from public.tours limit 1 \gset

-- ── Setup ca admin: a doua zi + 2 events pe aceeași zi ──
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-00000000000a"}', false);
set role authenticated;

insert into public.days (tour_id, date, day_type, city, country, timezone)
values (:'tour_id', '2026-07-18', 'show', 'Cluj', 'România', 'Europe/Bucharest')
returning id as day2_id \gset

insert into public.venues (organization_id, name, city, country, capacity)
values (:'org_id', 'NIBIRU', 'Costinești', 'România', 5000)
returning id as venue_id \gset

insert into public.events (day_id, venue_id, title)
values (:'day2_id', :'venue_id', 'GALAXIA FESTIVAL')
returning id as event1_id \gset

insert into public.events (day_id, venue_id, title)
values (:'day2_id', :'venue_id', 'AFTERPARTY')
returning id as event2_id \gset
\echo 'PASS: 2 events pe aceeasi zi (multiple events [C])'

-- ── Field registry: seed-ul global vizibil; valori per event ──
do $$ begin
  if (select count(*) from public.field_definitions where organization_id is null) < 90 then
    raise exception 'FAIL: seed-ul A.3 lipseste';
  end if;
end $$;

insert into public.event_field_values (event_id, field_key, value, updated_by)
values (:'event1_id', 'production.dimensions', '12m x 10m x 8m',
        'a0000000-0000-0000-0000-00000000000a');

-- Labor call pe event1 (NU trebuie sa "scape" pe event2 [C §6.5.2])
insert into public.event_labor_calls (event_id, call_time, call_count, worker_type)
values (:'event1_id', '08:00', '8', 'Loaders');

insert into public.advances (event_id, title, layout)
values (:'event1_id', 'Production Advance',
        '[{"type":"field","key":"production.dimensions"},{"type":"title","title":"Audio","description":"PA specs"}]');
\echo 'PASS: field values + labor call + advance create'

do $$ declare e2 uuid; begin
  select id into e2 from public.events where title = 'AFTERPARTY';
  if exists (select 1 from public.event_labor_calls where event_id = e2) then
    raise exception 'FAIL: labor call a scapat pe alt event';
  end if;
end $$;
\echo 'PASS: labor call strict pe event-ul lui'

-- ── Crew (mobile_access, in grupul Band -> vede turul) ──
select set_config('request.jwt.claims', '{"sub":"c0000000-0000-0000-0000-00000000000c"}', false);
do $$ begin
  if (select count(*) from public.events) <> 2 then
    raise exception 'FAIL: crew nu vede events pe zi vizibila';
  end if;
  if (select count(*) from public.event_field_values) <> 1 then
    raise exception 'FAIL: crew nu vede field values';
  end if;
  if (select count(*) from public.advances) <> 1 then
    raise exception 'FAIL: crew nu vede advance-ul';
  end if;
  if (select count(*) from public.venues where name = 'NIBIRU') <> 1 then
    raise exception 'FAIL: crew nu vede venue-ul org-ului';
  end if;
end $$;
\echo 'PASS: crew vede events/values/advances/venues'

-- crew nu poate scrie
do $$ declare e1 uuid; begin
  select id into e1 from public.events where title = 'GALAXIA FESTIVAL';
  begin
    insert into public.event_field_values (event_id, field_key, value)
    values (e1, 'production.pyro', 'DA');
    raise exception 'FAIL: crew a scris field value';
  exception when others then
    if sqlerrm like 'FAIL%' then raise; end if;
  end;
  update public.advances set status = 'done';
  if exists (select 1 from public.advances where status = 'done') then
    raise exception 'FAIL: crew a schimbat statusul advance-ului';
  end if;
end $$;
\echo 'PASS: crew nu poate scrie in event/advance'

-- ── Visibility pe ZI: ziua 2 restrictionata doar la admin → crew nu
--    mai vede NIMIC din event-uri/values/advances (cascada) ──
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-00000000000a"}', false);
insert into public.visibility_rules (organization_id, subject_type, subject_id, target_type, target_id)
values (:'org_id', 'day', :'day2_id', 'user', 'a0000000-0000-0000-0000-00000000000a');

select set_config('request.jwt.claims', '{"sub":"c0000000-0000-0000-0000-00000000000c"}', false);
do $$ begin
  if (select count(*) from public.events) <> 0
     or (select count(*) from public.event_field_values) <> 0
     or (select count(*) from public.advances) <> 0
     or (select count(*) from public.event_labor_calls) <> 0 then
    raise exception 'FAIL: day-level visibility nu cascadeaza pe events';
  end if;
end $$;
\echo 'PASS: day visibility cascadeaza pe events/values/advances/labor'

-- ── Non-membrul nu vede venue-urile org-ului, dar vede catalogul global ──
reset role;
insert into auth.users (id, email) values
  ('e0000000-0000-0000-0000-00000000000e', 'extern@test.local');
insert into public.venues (organization_id, name, city, source)
values (null, 'Arenele Romane', 'București', 'catalog');
set role authenticated;
select set_config('request.jwt.claims', '{"sub":"e0000000-0000-0000-0000-00000000000e"}', false);
do $$ begin
  if (select count(*) from public.venues where name = 'NIBIRU') <> 0 then
    raise exception 'FAIL: externul vede venue-ul org-ului';
  end if;
  if (select count(*) from public.venues where name = 'Arenele Romane') <> 1 then
    raise exception 'FAIL: externul nu vede catalogul global';
  end if;
end $$;
\echo 'PASS: venue org privat, catalog global public'

\echo '═══ FAZA 2 RLS: TOATE PROBELE AU TRECUT ═══'
