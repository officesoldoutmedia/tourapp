-- ═══ Faza 6 — ICS feed (visibility fără sesiune) + share links ═══
-- Stare moștenită: schedule item 'Load-in' pe 2026-07-17 e restricționat
-- DOAR la admin (faza1); crew c0… e în Band → vede turul și ziua.
\set ON_ERROR_STOP on

-- Tokens: fiecare user și-l creează singur
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-00000000000a"}', false);
set role authenticated;
insert into public.ical_tokens (user_id) values ('a0000000-0000-0000-0000-00000000000a')
returning token as admin_token \gset

select set_config('request.jwt.claims', '{"sub":"c0000000-0000-0000-0000-00000000000c"}', false);
insert into public.ical_tokens (user_id) values ('c0000000-0000-0000-0000-00000000000c')
returning token as crew_token \gset

-- crew nu poate crea token pentru altcineva și nu vede token-ul adminului
do $$ begin
  begin
    insert into public.ical_tokens (user_id) values ('a0000000-0000-0000-0000-00000000000a');
    raise exception 'FAIL: crew a creat token pentru admin';
  exception when others then
    if sqlerrm like 'FAIL%' then raise; end if;
  end;
  if (select count(*) from public.ical_tokens) <> 1 then
    raise exception 'FAIL: crew vede token-urile altora';
  end if;
end $$;
\echo 'PASS: ical tokens doar ale userului'

-- ── Feed-ul respectă visibility-ul FĂRĂ sesiune (service_role) ──
reset role;
select set_config('test.admin_token', :'admin_token', false);
select set_config('test.crew_token', :'crew_token', false);
set role service_role;

do $$ declare feed jsonb; day17 jsonb; begin
  -- adminul vede itemul restricționat 'Load-in' pe 17 iulie
  select public.ical_feed(current_setting('test.admin_token')::uuid) into feed;
  select value into day17 from jsonb_array_elements(feed) where value->>'date' = '2026-07-17';
  if day17 is null then
    raise exception 'FAIL: feed-ul adminului nu are ziua de 17';
  end if;
  if not exists (
    select 1 from jsonb_array_elements(day17->'schedule') s
    where s.value->>'title' like 'Load-in%'
  ) then
    raise exception 'FAIL: feed-ul adminului nu contine itemul restrictionat';
  end if;

  -- crew NU vede itemul restricționat, dar vede ziua
  select public.ical_feed(current_setting('test.crew_token')::uuid) into feed;
  select value into day17 from jsonb_array_elements(feed) where value->>'date' = '2026-07-17';
  if day17 is null then
    raise exception 'FAIL: feed-ul crew nu are ziua de 17 (vizibila prin Band)';
  end if;
  if exists (
    select 1 from jsonb_array_elements(day17->'schedule') s
    where s.value->>'title' like 'Load-in%'
  ) then
    raise exception 'FAIL: feed-ul crew contine itemul restrictionat (DoD)';
  end if;
  -- ziua 2026-07-18 e restricționată la admin (faza2) → lipsește la crew
  if exists (
    select 1 from jsonb_array_elements(feed) d where d.value->>'date' = '2026-07-18'
  ) then
    raise exception 'FAIL: feed-ul crew contine ziua restrictionata';
  end if;

  -- token inexistent → null
  if public.ical_feed(gen_random_uuid()) is not null then
    raise exception 'FAIL: feed pe token inexistent';
  end if;
end $$;
\echo 'PASS: ical_feed respecta visibility per user (DoD ICS)'

-- token revocat → null
reset role;
update public.ical_tokens set revoked_at = now()
where token = :'crew_token';
set role service_role;
do $$ begin
  if public.ical_feed(current_setting('test.crew_token')::uuid) is not null then
    raise exception 'FAIL: feed pe token revocat';
  end if;
end $$;
\echo 'PASS: token revocat -> feed mort'

-- ── Share links: doar editorii zilei le pot crea ──
reset role;
set role authenticated;
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-00000000000a"}', false);
select d.id as day17_id from public.days d where d.date = '2026-07-17' \gset
insert into public.share_links (day_id, created_by)
values (:'day17_id', 'a0000000-0000-0000-0000-00000000000a');

select set_config('request.jwt.claims', '{"sub":"c0000000-0000-0000-0000-00000000000c"}', false);
do $$ declare did uuid; begin
  select d.id into did from public.days d where d.date = '2026-07-17';
  begin
    insert into public.share_links (day_id, created_by)
    values (did, 'c0000000-0000-0000-0000-00000000000c');
    raise exception 'FAIL: crew a creat share link';
  exception when others then
    if sqlerrm like 'FAIL%' then raise; end if;
  end;
  if (select count(*) from public.share_links) <> 0 then
    raise exception 'FAIL: crew vede share links';
  end if;
end $$;
\echo 'PASS: share links doar pentru editori'

\echo '═══ FAZA 6 RLS: TOATE PROBELE AU TRECUT ═══'
