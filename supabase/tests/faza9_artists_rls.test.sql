-- ═══ Faza 9 — RLS pe artists + cascada artist → tur → conținut ═══
-- Rulează DUPĂ faza1 (refolosește org-ul, userii și turul de acolo).
\set ON_ERROR_STOP on

select id as org_id from public.organizations limit 1 \gset

-- ── Admin: artistul creat în faza1 există și e vizibil ──
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-00000000000a"}', false);
set role authenticated;

select id as artist_id from public.artists where slug = 'speak' \gset
do $$ begin
  if (select count(*) from public.artists) < 1 then
    raise exception 'FAIL: adminul nu vede artistul din faza1';
  end if;
end $$;
\echo 'PASS: adminul vede artistul'

-- ── Tur fără artist_id → respins (NOT NULL) ──
do $$ declare oid uuid; begin
  select id into oid from public.organizations limit 1;
  begin
    insert into public.tours (organization_id, name) values (oid, 'Fara artist');
    raise exception 'FAIL: tur creat fara artist_id';
  exception when not_null_violation then null;
  end;
end $$;
\echo 'PASS: tur fara artist_id respins'

-- ── Crew (mobile_access/free) vede artistul fără reguli ──
select set_config('request.jwt.claims', '{"sub":"c0000000-0000-0000-0000-00000000000c"}', false);
do $$ begin
  if (select count(*) from public.artists) <> (
       select count(*) from public.artists a
       where private.can_see_subject(a.organization_id, 'artist', a.id))
     or not exists (select 1 from public.artists) then
    raise exception 'FAIL: crew nu vede artistul fara reguli';
  end if;
end $$;
\echo 'PASS: crew vede artistul (default deschis)'

-- crew NU poate crea/edita artiști
do $$ declare oid uuid; begin
  select organization_id into oid from public.artists limit 1;
  begin
    insert into public.artists (organization_id, name, slug) values (oid, 'Hack', 'hack');
    raise exception 'FAIL: crew a creat artist';
  exception when others then
    if sqlerrm like 'FAIL%' then raise; end if;
  end;
  update public.artists set name = 'HACKED';
  if exists (select 1 from public.artists where name = 'HACKED') then
    raise exception 'FAIL: crew a editat artistul';
  end if;
end $$;
\echo 'PASS: crew nu poate scrie artisti'

-- ── Travel item + hotel pe ziua din faza1 (pentru testul de cascadă) ──
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-00000000000a"}', false);
select id as day_id from public.days limit 1 \gset

insert into public.travel_items (day_id, travel_type, origin_label, dest_label,
                                 depart_time, distance, duration_min)
values (:'day_id', 'ground', 'Satu Mare', 'Cluj-Napoca', '10:00', 189, 180)
returning id as travel_id \gset

insert into public.day_hotels (day_id, name, city, check_in_date, check_out_date)
values (:'day_id', 'Hotel Beta', 'Cluj', '2026-07-17', '2026-07-18')
returning id as hotel_id \gset
\echo 'PASS: admin a creat travel item si hotel pentru cascada artist'

-- token iCal al crew-ului (pentru verificarea feed-ului fara sesiune)
select set_config('request.jwt.claims', '{"sub":"c0000000-0000-0000-0000-00000000000c"}', false);
insert into public.ical_tokens (user_id) values ('c0000000-0000-0000-0000-00000000000c')
returning token as crew_token \gset

-- ── Restricție pe artist: regulă care țintește DOAR adminul ──
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-00000000000a"}', false);
insert into public.visibility_rules
  (organization_id, subject_type, subject_id, target_type, target_id, created_by)
values
  (:'org_id', 'artist', :'artist_id', 'user',
   'a0000000-0000-0000-0000-00000000000a', 'a0000000-0000-0000-0000-00000000000a');

-- attachment pe artist (pentru testul de vizibilitate al fișierelor)
insert into public.attachments
  (organization_id, parent_type, parent_id, file_name, storage_path, uploaded_by)
values
  (:'org_id', 'artist', :'artist_id', 'rider.pdf',
   :'org_id' || '/artists/' || :'artist_id' || '/rider.pdf',
   'a0000000-0000-0000-0000-00000000000a');
\echo 'PASS: admin a restrictionat artistul si a urcat fisier de artist'

-- ── Crew restricționat: cascada acoperă tot ──
select set_config('request.jwt.claims', '{"sub":"c0000000-0000-0000-0000-00000000000c"}', false);
do $$ begin
  if exists (select 1 from public.artists)
     or exists (select 1 from public.tours)
     or exists (select 1 from public.days)
     or exists (select 1 from public.schedule_items)
     or exists (select 1 from public.tour_personnel)
     or exists (select 1 from public.travel_items)
     or exists (select 1 from public.day_hotels)
     or exists (select 1 from public.attachments where parent_type = 'artist') then
    raise exception 'FAIL: cascada artist -> continut nu functioneaza';
  end if;
end $$;
\echo 'PASS: crew restrictionat nu vede artist/tur/zile/schedule/personnel/travel/hoteluri/fisiere'

-- ── ical_feed pentru crew restricționat: ziua artistului dispare din feed ──
reset role;
select set_config('test.crew_token', :'crew_token', false);
set role service_role;
do $$ declare feed jsonb; begin
  select public.ical_feed(current_setting('test.crew_token')::uuid) into feed;
  if feed is not null and jsonb_array_length(feed) <> 0 then
    raise exception 'FAIL: ical_feed al crew-ului contine zile ale artistului restrictionat';
  end if;
end $$;
\echo 'PASS: ical_feed nu contine zilele artistului restrictionat'
reset role;
set role authenticated;

-- ── Adminul (manager+) vede tot în continuare ──
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-00000000000a"}', false);
do $$ begin
  if not exists (select 1 from public.artists)
     or not exists (select 1 from public.tours)
     or not exists (select 1 from public.days) then
    raise exception 'FAIL: adminul a pierdut acces dupa regula';
  end if;
end $$;
\echo 'PASS: management bypass functioneaza'

-- ── Scoatem regula → crew vede din nou ──
delete from public.visibility_rules
where subject_type = 'artist' and subject_id = :'artist_id';

select set_config('request.jwt.claims', '{"sub":"c0000000-0000-0000-0000-00000000000c"}', false);
do $$ begin
  if not exists (select 1 from public.artists)
     or not exists (select 1 from public.tours) then
    raise exception 'FAIL: crew nu revede continutul dupa stergerea regulii';
  end if;
end $$;
\echo 'PASS: stergerea regulii redeschide accesul'

-- ── Ștergerea artistului cu tururi → blocată de FK restrict ──
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-00000000000a"}', false);
do $$ declare aid uuid; begin
  select id into aid from public.artists limit 1;
  begin
    delete from public.artists where id = aid;
    raise exception 'FAIL: artist cu tururi a fost sters';
  exception when foreign_key_violation then null;
  end;
end $$;
\echo 'PASS: artist cu tururi nu poate fi sters (se arhiveaza)'

reset role;
