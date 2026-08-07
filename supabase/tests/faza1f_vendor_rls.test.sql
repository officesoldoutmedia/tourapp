-- ═══ Faza 1f — Vendor portal (C4): vendor_links + departament pe
-- companii + proveniență personnel ═══
-- Rulează DUPĂ faza1e (alfabetic: faza1e < faza1f < faza2).
-- Refolosește org/userii din faza0 + faza1e (nesterse la cleanup-ul lor
-- ca fixturi reutilizabile, cf. faza1e):
--   a0…0a administrator/pro, c0…0c mobile_access/free (faza0),
--   d0…0d manager/pro fără accounting (faza1e) — el e "managerul" de mai
--   jos, 6…6 outsider/pro (faza1e) — org2-ul lui a fost șters la finalul
--   faza1e, îi dăm unul nou doar pt. proba de izolare cross-org.
-- Turul/ziua 'SxS Summer 2026' / 2026-07-17 din faza1 + personnel-ul
-- 'Dan Driver' — le refolosim. faza2 (care rulează DUPĂ acest fișier)
-- nu a creat încă niciun event, deci creăm unul singur aici pe ziua
-- existentă și îl ștergem complet la cleanup, ca să nu strice
-- count(*)-urile din faza2 (care presupune exact 2 events, ale ei).
-- (`:'var'` NU se substituie în corpul do $$...$$ — vezi faza1e —
-- de-asta stash-uim prin set_config/current_setting.)
\set ON_ERROR_STOP on

select id as org_id from public.organizations limit 1 \gset
select id as tour_id from public.tours limit 1 \gset
select id as day_id from public.days
  where tour_id = :'tour_id' and date = '2026-07-17' \gset
select id as personnel_id from public.tour_personnel
  where tour_id = :'tour_id' and first_name = 'Dan' and last_name = 'Driver' \gset
select id as fc_id from public.file_categories
  where organization_id = :'org_id' and name = 'Show files' \gset

-- al doilea org, doar pt. proba de izolare cross-org (userul outsider
-- persistă din faza1e, dar org2-ul lui a fost șters la finalul ei)
insert into public.organizations (name, slug, org_type, owner_id)
values ('SxS Vendor Outsider', 'sxs-vendor-outsider', 'music', 'a0000000-0000-0000-0000-00000000000a')
returning id as org2_id \gset
insert into public.organization_members (organization_id, user_id, permission)
values (:'org2_id', '60000000-0000-0000-0000-000000000006', 'administrator');

select set_config('test.org_id', :'org_id', false);
select set_config('test.personnel_id', :'personnel_id', false);
select set_config('test.fc_id', :'fc_id', false);

-- ── 1. Managerul creează un event de test + o companie + un vendor_link ──
select set_config('request.jwt.claims', '{"sub":"d0000000-0000-0000-0000-00000000000d"}', false);
set role authenticated;

insert into public.events (day_id, title)
values (:'day_id', 'VENDOR TEST EVENT')
returning id as event_id \gset

insert into public.companies (organization_id, name, kind)
values (:'org_id', 'Rigging Co TEST', 'Backline Rental')
returning id as company_id \gset

insert into public.vendor_links (organization_id, company_id, event_id, created_by)
values (:'org_id', :'company_id', :'event_id', 'd0000000-0000-0000-0000-00000000000d')
returning id as vl_id, token as vl_token \gset

select set_config('test.event_id', :'event_id', false);
select set_config('test.company_id', :'company_id', false);
select set_config('test.vl_id', :'vl_id', false);
select set_config('test.vl_token', :'vl_token', false);
\echo 'PASS: managerul creeaza event/companie/vendor_link'

do $$ declare vid uuid; tok uuid; cid uuid; eid uuid; begin
  vid := current_setting('test.vl_id')::uuid;
  tok := current_setting('test.vl_token')::uuid;
  cid := current_setting('test.company_id')::uuid;
  eid := current_setting('test.event_id')::uuid;
  if not exists (
    select 1 from public.vendor_links
    where id = vid and token = tok and company_id = cid and event_id = eid
  ) then
    raise exception 'FAIL: managerul nu-si citeste vendor_link-ul creat';
  end if;
end $$;
\echo 'PASS: managerul citeste vendor_link-ul creat'

-- ── 2. Managerul setează companies.file_category_id + tour_personnel.company_id ──
update public.companies set file_category_id = :'fc_id' where id = :'company_id';
do $$ declare cid uuid; fcid uuid; begin
  cid := current_setting('test.company_id')::uuid;
  fcid := current_setting('test.fc_id')::uuid;
  if not exists (select 1 from public.companies where id = cid and file_category_id = fcid) then
    raise exception 'FAIL: managerul nu poate seta companies.file_category_id';
  end if;
end $$;

update public.tour_personnel set company_id = :'company_id' where id = :'personnel_id';
do $$ declare pid uuid; cid uuid; begin
  pid := current_setting('test.personnel_id')::uuid;
  cid := current_setting('test.company_id')::uuid;
  if not exists (select 1 from public.tour_personnel where id = pid and company_id = cid) then
    raise exception 'FAIL: managerul nu poate seta tour_personnel.company_id';
  end if;
end $$;
\echo 'PASS: managerul seteaza companies.file_category_id si tour_personnel.company_id'

-- ── 3. Crew (viewer): NU vede vendor_links, insertul e respins ──
select set_config('request.jwt.claims', '{"sub":"c0000000-0000-0000-0000-00000000000c"}', false);
do $$ begin
  if (select count(*) from public.vendor_links) <> 0 then
    raise exception 'FAIL: crew vede vendor_links';
  end if;
end $$;
do $$ declare oid uuid; cid uuid; eid uuid; begin
  oid := current_setting('test.org_id')::uuid;
  cid := current_setting('test.company_id')::uuid;
  eid := current_setting('test.event_id')::uuid;
  begin
    insert into public.vendor_links (organization_id, company_id, event_id)
    values (oid, cid, eid);
    raise exception 'FAIL: crew a creat vendor_link';
  exception when others then
    if sqlerrm like 'FAIL%' then raise; end if;
  end;
end $$;
\echo 'PASS: crew nu vede vendor_links si insertul e respins'

-- ── 4. Membrul altui org nu vede link-urile ──
select set_config('request.jwt.claims', '{"sub":"60000000-0000-0000-0000-000000000006"}', false);
do $$ begin
  if (select count(*) from public.vendor_links) <> 0 then
    raise exception 'FAIL: membrul altui org vede vendor_links';
  end if;
end $$;
\echo 'PASS: membrul altui org nu vede vendor_links'

-- ── 5. Unique parțial (company_id, event_id) where revoked_at is null ──
select set_config('request.jwt.claims', '{"sub":"d0000000-0000-0000-0000-00000000000d"}', false);
do $$ declare oid uuid; cid uuid; eid uuid; begin
  oid := current_setting('test.org_id')::uuid;
  cid := current_setting('test.company_id')::uuid;
  eid := current_setting('test.event_id')::uuid;
  begin
    insert into public.vendor_links (organization_id, company_id, event_id)
    values (oid, cid, eid);
    raise exception 'FAIL: al doilea link viu pe (companie, event) a fost acceptat';
  exception when unique_violation then null;
  end;
end $$;
\echo 'PASS: unique partial respinge al doilea link viu pe (companie, event)'

update public.vendor_links set revoked_at = now() where id = :'vl_id';

insert into public.vendor_links (organization_id, company_id, event_id, created_by)
values (:'org_id', :'company_id', :'event_id', 'd0000000-0000-0000-0000-00000000000d')
returning id as vl2_id \gset
select set_config('test.vl2_id', :'vl2_id', false);
do $$ declare v2 uuid; begin
  v2 := current_setting('test.vl2_id')::uuid;
  if not exists (select 1 from public.vendor_links where id = v2 and revoked_at is null) then
    raise exception 'FAIL: linkul nou dupa revocarea celui vechi nu a fost creat';
  end if;
end $$;
\echo 'PASS: dupa revocarea primului link, insertul nou reuseste'

-- ── Cleanup ──
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-00000000000a"}', false);
-- sterge compania -> cascada pe vendor_links + set null pe tour_personnel.company_id
delete from public.companies where id = :'company_id';
delete from public.events where id = :'event_id';

reset role;
delete from public.organizations where slug = 'sxs-vendor-outsider';
