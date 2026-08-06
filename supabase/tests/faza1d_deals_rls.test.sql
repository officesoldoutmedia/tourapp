-- ═══ Faza 1d — deal_templates (C1): template per artist + snapshot pe event ═══
-- Rulează DUPĂ faza1c (alfabetic: faza1c < faza1d < faza2).
-- Refolosește org/userii din faza0, artistul 'speak' și event-urile din faza2?
-- NU — faza2 rulează DUPĂ; folosim doar artistul din faza1. Cleanup: hard
-- delete pe rândurile proprii (fără copii).
\set ON_ERROR_STOP on

select id as org_id from public.organizations limit 1 \gset

select set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-00000000000a"}', false);
set role authenticated;

select id as artist_id from public.artists where slug = 'speak' \gset

-- ── Admin creează template ──
insert into public.deal_templates
  (organization_id, artist_id, name, fee_amount, fee_currency, deal_basis,
   withholding_percent, landed_items, accommodation, required_category_ids, created_by)
values
  (:'org_id', :'artist_id', 'Festival TEST', 3500, 'EUR', 'landed',
   5, '["SFX","Backline"]'::jsonb, '{"rooms_single":2,"nights":1}'::jsonb,
   '{}'::uuid[], 'a0000000-0000-0000-0000-00000000000a')
returning id as dt_id \gset
\echo 'PASS: admin creeaza deal template'

-- ── Org mismatch respins (with-check pe artist_org) ──
do $$ declare aid uuid; begin
  select id into aid from public.artists where slug = 'speak';
  begin
    insert into public.deal_templates (organization_id, artist_id, name)
    values (gen_random_uuid(), aid, 'CROSS');
    raise exception 'FAIL: org mismatch acceptat';
  exception when others then
    if sqlerrm like 'FAIL%' then raise; end if;
  end;
end $$;
\echo 'PASS: organization_id legat de artist_org (mismatch respins)'

-- ── Crew citește, nu scrie ──
select set_config('request.jwt.claims', '{"sub":"c0000000-0000-0000-0000-00000000000c"}', false);
do $$ begin
  if not exists (select 1 from public.deal_templates where name = 'Festival TEST') then
    raise exception 'FAIL: crew nu vede template-ul';
  end if;
end $$;
do $$ declare aid uuid; oid uuid; begin
  select artist_id, organization_id into aid, oid from public.deal_templates limit 1;
  begin
    insert into public.deal_templates (organization_id, artist_id, name)
    values (oid, aid, 'HACK');
    raise exception 'FAIL: crew a creat template';
  exception when others then
    if sqlerrm like 'FAIL%' then raise; end if;
  end;
end $$;
\echo 'PASS: crew read-only pe deal templates'

-- ── Restricția pe artist cascadează ──
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-00000000000a"}', false);
insert into public.visibility_rules
  (organization_id, subject_type, subject_id, target_type, target_id, created_by)
values
  (:'org_id', 'artist', :'artist_id', 'user',
   'a0000000-0000-0000-0000-00000000000a', 'a0000000-0000-0000-0000-00000000000a');

select set_config('request.jwt.claims', '{"sub":"c0000000-0000-0000-0000-00000000000c"}', false);
do $$ begin
  if exists (select 1 from public.deal_templates) then
    raise exception 'FAIL: cascada artist -> deal_templates nu functioneaza';
  end if;
end $$;
\echo 'PASS: restrictia pe artist ascunde deal templates'

-- ── Cleanup ──
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-00000000000a"}', false);
delete from public.visibility_rules
  where subject_type = 'artist' and subject_id = :'artist_id';
delete from public.deal_templates where id = :'dt_id';

reset role;
