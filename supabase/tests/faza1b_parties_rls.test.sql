-- ═══ Faza 1b — travel parties (SP3a): template pe artist + snapshot pe tur ═══
-- Rulează DUPĂ faza1a (alfabetic: faza1 < faza1a < faza1b < faza2).
-- Refolosește org/userii din faza0 și artistul 'speak' + turul din faza1.
-- Cleanup la final: hard-delete pe rândurile create aici (fără copii).
\set ON_ERROR_STOP on

select id as org_id from public.organizations limit 1 \gset

-- Al doilea org (superuser, fără rol) — doar pentru proba de mai jos cu
-- organization_id nepotrivit pe insert (with-check trebuie să lege rândul
-- de org-ul REAL al turului, nu de orice organization_id trimis de client).
insert into public.organizations (name, slug, org_type, owner_id)
values ('SxS Cross', 'sxs-cross', 'music', 'a0000000-0000-0000-0000-00000000000a')
returning id as org2_id \gset

select set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-00000000000a"}', false);
set role authenticated;

select id as artist_id from public.artists where slug = 'speak' \gset
select id as tour_id from public.tours
  where deleted_at is null and bucket_year is null limit 1 \gset

-- ── Admin creează party de template + party de tur ──
insert into public.artist_parties (organization_id, artist_id, name, per_diem_rate, per_diem_currency)
values (:'org_id', :'artist_id', 'CREW_TEST', 45, 'EUR')
returning id as ap_id \gset

insert into public.tour_parties (organization_id, tour_id, name, per_diem_rate, per_diem_currency)
values (:'org_id', :'tour_id', 'CREW_TEST', 45, 'EUR')
returning id as tp_id \gset
\echo 'PASS: admin creeaza artist_party si tour_party'

-- ── party_id pe personnel ──
update public.tour_personnel set party_id = :'tp_id'
where tour_id = :'tour_id';
\echo 'PASS: personnel primeste party_id'

-- ── Crew (mobile_access) vede ambele, nu poate scrie ──
select set_config('request.jwt.claims', '{"sub":"c0000000-0000-0000-0000-00000000000c"}', false);
do $$ begin
  if not exists (select 1 from public.artist_parties where name = 'CREW_TEST')
     or not exists (select 1 from public.tour_parties where name = 'CREW_TEST') then
    raise exception 'FAIL: crew nu vede parties (default deschis)';
  end if;
end $$;
do $$ declare oid uuid; aid uuid; begin
  select organization_id, artist_id into oid, aid from public.artist_parties limit 1;
  begin
    insert into public.artist_parties (organization_id, artist_id, name)
    values (oid, aid, 'HACK');
    raise exception 'FAIL: crew a creat artist_party';
  exception when others then
    if sqlerrm like 'FAIL%' then raise; end if;
  end;
  update public.tour_parties set name = 'HACKED';
  if exists (select 1 from public.tour_parties where name = 'HACKED') then
    raise exception 'FAIL: crew a editat tour_party';
  end if;
end $$;
\echo 'PASS: crew nu poate scrie parties'

-- ── Restricția pe artist cascadează peste ambele tabele ──
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-00000000000a"}', false);
insert into public.visibility_rules
  (organization_id, subject_type, subject_id, target_type, target_id, created_by)
values
  (:'org_id', 'artist', :'artist_id', 'user',
   'a0000000-0000-0000-0000-00000000000a', 'a0000000-0000-0000-0000-00000000000a');

select set_config('request.jwt.claims', '{"sub":"c0000000-0000-0000-0000-00000000000c"}', false);
do $$ begin
  if exists (select 1 from public.artist_parties)
     or exists (select 1 from public.tour_parties) then
    raise exception 'FAIL: cascada artist -> parties nu functioneaza';
  end if;
end $$;
\echo 'PASS: restrictia pe artist ascunde artist_parties si tour_parties'

-- ── organization_id nepotrivit e respins (leagă write-ul de tour_id) ──
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-00000000000a"}', false);
do $$ declare org2 uuid; tid uuid; begin
  select id into org2 from public.organizations where slug = 'sxs-cross';
  select id into tid from public.tours
    where deleted_at is null and bucket_year is null limit 1;
  begin
    insert into public.tour_parties (organization_id, tour_id, name)
    values (org2, tid, 'CROSS');
    raise exception 'FAIL: adminul a creat tour_party cu organization_id nepotrivit fata de tur';
  exception when others then
    if sqlerrm like 'FAIL%' then raise; end if;
  end;
end $$;
\echo 'PASS: insert cu organization_id nepotrivit e respins de with-check'

-- ── Cleanup ──
delete from public.visibility_rules
  where subject_type = 'artist' and subject_id = :'artist_id';
update public.tour_personnel set party_id = null where party_id = :'tp_id';
delete from public.tour_parties where id = :'tp_id';
delete from public.artist_parties where id = :'ap_id';

reset role;
delete from public.organizations where slug = 'sxs-cross';
