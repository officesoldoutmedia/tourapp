-- ═══ Faza 3 — RLS pe travel_items/day_hotels/room_list ═══
-- Rulează după faza2 (org, admin a0…, crew c0… în grupul Band; turul are
-- reguli de visibility care INCLUD grupul Band → crew vede turul; ziua
-- 2026-07-18 e restricționată doar la admin din faza2).
\set ON_ERROR_STOP on

select id as org_id from public.organizations limit 1 \gset
select id as tour_id from public.tours limit 1 \gset

-- ── Admin: zi nouă vizibilă tuturor + travel + hotel + room list ──
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-00000000000a"}', false);
set role authenticated;

insert into public.days (tour_id, date, day_type, city, country, timezone)
values (:'tour_id', '2026-07-19', 'travel', 'Cluj', 'România', 'Europe/Bucharest')
returning id as day3_id \gset

insert into public.travel_items (day_id, travel_type, origin_label, dest_label,
                                 depart_time, distance, duration_min)
values (:'day3_id', 'ground', 'Satu Mare', 'Cluj-Napoca', '10:00', 189, 180)
returning id as travel_id \gset

insert into public.day_hotels (day_id, name, city, check_in_date, check_out_date)
values (:'day3_id', 'Hotel Beta', 'Cluj', '2026-07-19', '2026-07-20')
returning id as hotel_id \gset

insert into public.room_list_entries (day_hotel_id, guest_name, room_number)
values (:'hotel_id', 'Crew, Cri', '101');
\echo 'PASS: admin creeaza travel/hotel/room list'

-- ── Crew vede tot (fara reguli pe items) ──
select set_config('request.jwt.claims', '{"sub":"c0000000-0000-0000-0000-00000000000c"}', false);
do $$ begin
  if (select count(*) from public.travel_items) <> 1
     or (select count(*) from public.day_hotels) <> 1
     or (select count(*) from public.room_list_entries) <> 1 then
    raise exception 'FAIL: crew nu vede travel/hotel/room list';
  end if;
end $$;

-- crew nu poate scrie
do $$ begin
  update public.day_hotels set name = 'HACKED';
  if exists (select 1 from public.day_hotels where name = 'HACKED') then
    raise exception 'FAIL: crew a editat hotelul';
  end if;
end $$;
\echo 'PASS: crew vede dar nu scrie'

-- ── Visibility per HOTEL [C]: restrictionat la admin → crew nu vede
--    hotelul si nici room list-ul lui ──
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-00000000000a"}', false);
insert into public.visibility_rules (organization_id, subject_type, subject_id, target_type, target_id)
values (:'org_id', 'day_hotel', :'hotel_id', 'user', 'a0000000-0000-0000-0000-00000000000a');

select set_config('request.jwt.claims', '{"sub":"c0000000-0000-0000-0000-00000000000c"}', false);
do $$ begin
  if (select count(*) from public.day_hotels) <> 0 then
    raise exception 'FAIL: crew vede hotelul restrictionat';
  end if;
  if (select count(*) from public.room_list_entries) <> 0 then
    raise exception 'FAIL: room list nu urmeaza hotelul restrictionat';
  end if;
  -- travel-ul zilei ramane vizibil
  if (select count(*) from public.travel_items) <> 1 then
    raise exception 'FAIL: restrictia pe hotel a ascuns travel-ul';
  end if;
end $$;
\echo 'PASS: visibility per hotel + room list cascadat'

-- ── Visibility per TRAVEL ITEM [C] ──
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-00000000000a"}', false);
insert into public.visibility_rules (organization_id, subject_type, subject_id, target_type, target_id)
values (:'org_id', 'travel_item', :'travel_id', 'user', 'a0000000-0000-0000-0000-00000000000a');

select set_config('request.jwt.claims', '{"sub":"c0000000-0000-0000-0000-00000000000c"}', false);
do $$ begin
  if (select count(*) from public.travel_items) <> 0 then
    raise exception 'FAIL: crew vede travel item restrictionat';
  end if;
end $$;
\echo 'PASS: visibility per travel item'

-- ── Extend stay: 3 hoteluri LINKED; propagarea e in aplicatie, dar
--    verificam ca stay_group_id functioneaza la nivel de date ──
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-00000000000a"}', false);
do $$ declare gid uuid := gen_random_uuid(); d record; begin
  update public.day_hotels set stay_group_id = gid where name = 'Hotel Beta';
  for d in
    insert into public.days (tour_id, date, day_type, timezone)
    select t.id, x.dt, 'travel', 'Europe/Bucharest'
    from public.tours t,
         (values ('2026-07-20'::date), ('2026-07-21'::date)) as x(dt)
    returning id
  loop
    insert into public.day_hotels (day_id, name, city, stay_group_id)
    values (d.id, 'Hotel Beta', 'Cluj', gid);
  end loop;
  if (select count(*) from public.day_hotels where stay_group_id = gid) <> 3 then
    raise exception 'FAIL: extend stay nu are 3 records linked';
  end if;
  -- edit propagat (cum face server action-ul): update pe tot grupul
  update public.day_hotels set notes = 'late checkout' where stay_group_id = gid;
  if (select count(*) from public.day_hotels
      where stay_group_id = gid and notes = 'late checkout') <> 3 then
    raise exception 'FAIL: edit-ul nu s-a propagat pe grup';
  end if;
  -- unlink pe unul → edit local nu se mai propagă
  update public.day_hotels set stay_group_id = null
  where id = (select id from public.day_hotels where stay_group_id = gid limit 1);
  if (select count(*) from public.day_hotels where stay_group_id = gid) <> 2 then
    raise exception 'FAIL: unlink nu a scos recordul din grup';
  end if;
end $$;
\echo 'PASS: extend stay linked (3 zile) + edit pe grup + unlink'

\echo '═══ FAZA 3 RLS: TOATE PROBELE AU TRECUT ═══'
