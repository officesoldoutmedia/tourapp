-- ═══ Faza 1c — file_categories + metadata pe attachments (SP3b) ═══
-- Rulează DUPĂ faza1b (alfabetic: faza1b < faza1c < faza2).
-- Refolosește org/userii din faza0 și ziua din faza1.
\set ON_ERROR_STOP on

select id as org_id from public.organizations limit 1 \gset

select set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-00000000000a"}', false);
set role authenticated;

-- ── Seed-ul a creat cele 8 categorii pentru org-ul existent ──
do $$ declare n int; begin
  select count(*) into n from public.file_categories;
  if n < 8 then
    raise exception 'FAIL: seed-ul de categorii lipseste (gasit %)', n;
  end if;
  if exists (select 1 from public.file_categories where is_required) then
    raise exception 'FAIL: seed-ul nu trebuie sa marcheze nimic obligatoriu';
  end if;
end $$;
\echo 'PASS: seed categorii prezent, nimic obligatoriu'

-- ── Admin: placeholder (storage_path null) + fisier real cu categorie ──
select id as cat_id from public.file_categories order by sort_order limit 1 \gset
select d.id as day_id from public.days d
  join public.tours t on t.id = d.tour_id
  where d.deleted_at is null and t.deleted_at is null limit 1 \gset

insert into public.attachments
  (organization_id, parent_type, parent_id, file_name, storage_path,
   category_id, due_date, uploaded_by)
values
  (:'org_id', 'day', :'day_id', 'setlist-asteptat.pdf', null,
   :'cat_id', '2026-09-01', 'a0000000-0000-0000-0000-00000000000a')
returning id as ph_id \gset

insert into public.attachments
  (organization_id, parent_type, parent_id, file_name, storage_path,
   category_id, status, uploaded_by)
values
  (:'org_id', 'day', :'day_id', 'setlist-v1.pdf',
   :'org_id' || '/test/setlist-v1.pdf', :'cat_id', 'final',
   'a0000000-0000-0000-0000-00000000000a')
returning id as v1_id \gset

-- versiune noua legata de v1
insert into public.attachments
  (organization_id, parent_type, parent_id, file_name, storage_path,
   category_id, supersedes_id, uploaded_by)
values
  (:'org_id', 'day', :'day_id', 'setlist-v2.pdf',
   :'org_id' || '/test/setlist-v2.pdf', :'cat_id', :'v1_id',
   'a0000000-0000-0000-0000-00000000000a')
returning id as v2_id \gset
\echo 'PASS: placeholder, fisier cu status si lant de versiuni acceptate'

-- ── Crew citeste categoriile si fisierele, nu scrie categorii ──
select set_config('request.jwt.claims', '{"sub":"c0000000-0000-0000-0000-00000000000c"}', false);
do $$ begin
  if not exists (select 1 from public.file_categories) then
    raise exception 'FAIL: crew nu vede categoriile';
  end if;
  if (select count(*) from public.attachments where parent_type = 'day'
        and file_name like 'setlist%') <> 3 then
    raise exception 'FAIL: crew nu vede attachment-urile noi prin lantul existent';
  end if;
end $$;
do $$ declare oid uuid; begin
  select id into oid from public.organizations limit 1;
  begin
    insert into public.file_categories (organization_id, name) values (oid, 'HACK');
    raise exception 'FAIL: crew a creat categorie';
  exception when others then
    if sqlerrm like 'FAIL%' then raise; end if;
  end;
end $$;
\echo 'PASS: crew citeste, nu scrie categorii'

-- ── Cleanup (hard delete, fara copii) ──
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-00000000000a"}', false);
delete from public.attachments where id in (:'v2_id', :'v1_id', :'ph_id');

reset role;
