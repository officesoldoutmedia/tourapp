-- ═══ Faza 1e — Contract automation (C3): registru juridic, emitenți,
-- template-uri și documente de contract ═══
-- Rulează DUPĂ faza1d (alfabetic: faza1d < faza1e < faza2).
-- Refolosește org/userii din faza0 (admin a0…0a administrator/pro,
-- crew c0…0c mobile_access/free — tier 'pro' e default din 00014).
-- Adaugă 3 useri noi, needed doar aici:
--   f0…0f accounting/pro (scrie financiar), d0…0d manager/pro (fără
--   accounting), 6…6 outsider/pro (administrator, dar într-un AL DOILEA
--   org — pt. proba de izolare cross-org, ca în faza1b).
-- Cleanup: hard-delete pe rândurile proprii + org-ul al doilea, ca să nu
-- polueze fazele 2-9 (vezi nota din faza1b/faza1a despre `limit 1`).
\set ON_ERROR_STOP on

select id as org_id from public.organizations limit 1 \gset

-- al doilea org, doar pt. proba de izolare cross-org (vezi faza1b)
insert into public.organizations (name, slug, org_type, owner_id)
values ('SxS Outsider', 'sxs-outsider', 'music', 'a0000000-0000-0000-0000-00000000000a')
returning id as org2_id \gset

-- setup superuser: userii noi + membership-urile lor
reset role;
insert into auth.users (id, email) values
  ('f0000000-0000-0000-0000-00000000000f', 'accounting-c3@test.local'),
  ('d0000000-0000-0000-0000-00000000000d', 'manager-c3@test.local'),
  ('60000000-0000-0000-0000-000000000006', 'outsider-c3@test.local');
insert into public.organization_members (organization_id, user_id, permission) values
  (:'org_id', 'f0000000-0000-0000-0000-00000000000f', 'accounting'),
  (:'org_id', 'd0000000-0000-0000-0000-00000000000d', 'manager'),
  (:'org2_id', '60000000-0000-0000-0000-000000000006', 'administrator');

select set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-00000000000a"}', false);
set role authenticated;

-- ── 1. Admin: creează cele 4 tipuri de rânduri — toate reușesc ──
insert into public.crew_entities
  (organization_id, entity_type, display_name, company_name, cui, default_rate,
   rate_unit, rate_currency, created_by)
values
  (:'org_id', 'srl', 'Contract Crew SRL', 'Contract Crew SRL', 'RO11111111',
   500, 'per_show', 'EUR', 'a0000000-0000-0000-0000-00000000000a')
returning id as ce_id \gset

insert into public.issuing_entities
  (organization_id, name, cui, reg_com, iban, is_default)
values
  (:'org_id', 'SxS Productions SRL', 'RO22222222', 'J40/1/2026',
   'RO00BTRL00000000000001', true)
returning id as ie_id \gset

insert into public.contract_templates
  (organization_id, name, doc_kind, match_role, issuing_entity_id, series_prefix)
values
  (:'org_id', 'Anexă tehnician TEST', 'annex', 'Driver', :'ie_id', 'ANX')
returning id as ct_id \gset

insert into public.contract_documents
  (organization_id, kind, crew_entity_id, template_id, issuing_entity_id, doc_number)
values
  (:'org_id', 'framework', :'ce_id', :'ct_id', :'ie_id', 'CTR-0001')
returning id as cd_id \gset
-- stash pt. referință în do-blocks de sub alte roluri (`:'var'` NU se
-- substituie în corpul $$...$$ — vezi psql docs pe quoting)
select set_config('test.org_id', :'org_id', false);
select set_config('test.ce_id', :'ce_id', false);
\echo 'PASS: admin creeaza crew_entities + issuing_entities + contract_templates + contract_documents'

-- ── 2. Accounting: citește și scrie crew_entities + contract_documents ──
select set_config('request.jwt.claims', '{"sub":"f0000000-0000-0000-0000-00000000000f"}', false);
do $$ begin
  if not exists (select 1 from public.crew_entities where display_name = 'Contract Crew SRL') then
    raise exception 'FAIL: accounting nu citeste crew_entities';
  end if;
end $$;

insert into public.crew_entities (organization_id, display_name, created_by)
values (:'org_id', 'Accounting-created SRL', 'f0000000-0000-0000-0000-00000000000f')
returning id as ce2_id \gset

insert into public.contract_documents (organization_id, kind, crew_entity_id, doc_number, created_by)
values (:'org_id', 'framework', :'ce2_id', 'CTR-0002', 'f0000000-0000-0000-0000-00000000000f')
returning id as cd2_id \gset

do $$ begin
  if not exists (select 1 from public.contract_documents where doc_number = 'CTR-0002') then
    raise exception 'FAIL: accounting nu-si vede documentul creat';
  end if;
end $$;
\echo 'PASS: membrul accounting citeste si scrie crew_entities + contract_documents'

-- ── 3. Manager (fără accounting): NU vede crew_entities, NU poate insera contract_documents ──
select set_config('request.jwt.claims', '{"sub":"d0000000-0000-0000-0000-00000000000d"}', false);
do $$ begin
  if (select count(*) from public.crew_entities) <> 0 then
    raise exception 'FAIL: managerul (fara accounting) vede crew_entities';
  end if;
end $$;
do $$ declare oid uuid; ceid uuid; begin
  oid := current_setting('test.org_id')::uuid;
  ceid := current_setting('test.ce_id')::uuid;
  begin
    insert into public.contract_documents (organization_id, kind, crew_entity_id, doc_number)
    values (oid, 'framework', ceid, 'CTR-HACK-MGR');
    raise exception 'FAIL: managerul a creat contract_document';
  exception when others then
    if sqlerrm like 'FAIL%' then raise; end if;
  end;
end $$;
\echo 'PASS: managerul fara accounting nu vede crew_entities si nu scrie contract_documents'

-- ── 4. Crew (viewer): citește contract_templates, insertul e respins, NU vede crew_entities ──
select set_config('request.jwt.claims', '{"sub":"c0000000-0000-0000-0000-00000000000c"}', false);
do $$ begin
  if not exists (select 1 from public.contract_templates where name = 'Anexă tehnician TEST') then
    raise exception 'FAIL: crew nu citeste contract_templates';
  end if;
  if (select count(*) from public.crew_entities) <> 0 then
    raise exception 'FAIL: crew vede crew_entities';
  end if;
end $$;
do $$ declare oid uuid; begin
  select organization_id into oid from public.contract_templates limit 1;
  begin
    insert into public.contract_templates (organization_id, name) values (oid, 'HACK');
    raise exception 'FAIL: crew a creat contract_template';
  exception when others then
    if sqlerrm like 'FAIL%' then raise; end if;
  end;
end $$;
\echo 'PASS: crew citeste contract_templates, nu scrie, si nu vede crew_entities'

-- ── 5. Membrul altui org (outsider, administrator în org2) nu vede nimic din cele 4 tabele ──
select set_config('request.jwt.claims', '{"sub":"60000000-0000-0000-0000-000000000006"}', false);
do $$ begin
  if exists (select 1 from public.crew_entities)
     or exists (select 1 from public.issuing_entities)
     or exists (select 1 from public.contract_templates)
     or exists (select 1 from public.contract_documents) then
    raise exception 'FAIL: membrul altui org vede rânduri din cele 4 tabele';
  end if;
end $$;
\echo 'PASS: membrul altui org nu vede nimic din cele 4 tabele'

-- ── 6. Unique (organization_id, doc_number): duplicatul e respins ──
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-00000000000a"}', false);
do $$ declare oid uuid; ceid uuid; begin
  oid := current_setting('test.org_id')::uuid;
  ceid := current_setting('test.ce_id')::uuid;
  begin
    insert into public.contract_documents (organization_id, kind, crew_entity_id, doc_number)
    values (oid, 'framework', ceid, 'CTR-0001');
    raise exception 'FAIL: doc_number duplicat acceptat';
  exception when unique_violation then null;
  end;
end $$;
\echo 'PASS: unique (organization_id, doc_number) respinge duplicatul'

-- ── Cleanup ──
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-00000000000a"}', false);
delete from public.contract_documents where id in (:'cd_id', :'cd2_id');
delete from public.contract_templates where id = :'ct_id';
delete from public.issuing_entities where id = :'ie_id';
delete from public.crew_entities where id in (:'ce_id', :'ce2_id');

reset role;
delete from public.organizations where slug = 'sxs-outsider';
