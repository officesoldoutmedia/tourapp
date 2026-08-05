-- ═══ Faza 1a — bucket_year pe tours (one-off shows, SP2) ═══
-- Rulează DUPĂ faza1 (refolosește org-ul, userii și artistul 'speak').
-- NOTĂ despre numele fișierului: planul inițial numea acest fișier
-- „faza10_bucket_rls.test.sql", presupunând că sortează alfabetic ÎNTRE
-- faza1 și faza2. Fals — în ASCII cifra '0' < '_', deci „faza10…" sortează
-- ÎNAINTE de „faza1_rls…" (imediat după faza0), moment în care artistul
-- 'speak' încă nu există. Redenumit „faza1a_…" ca să sorteze efectiv
-- între faza1 și faza2, cum a fost intenția inițială — vezi self-review
-- din task-1-report.md pt. detalii.
-- Fazele 2–9 rulează după acest fișier — de asta tururile create aici se
-- șterg (hard-delete) la final, ca să nu polueze fazele următoare.
-- NOTĂ: soft-delete (deleted_at = now()) nu e suficient — tours_select
-- lasă adminul să vadă în continuare rândurile șterse soft (bypass
-- pt. edit/trash), iar faza3 face un INSERT ... RETURNING pe `days`
-- cross-joinat pe `public.tours` fără WHERE; can_access_tour() cere
-- necondiționat deleted_at is null (fără bypass de admin), deci
-- RETURNING pe o zi legată de-un tur soft-deletat pică cu „new row
-- violates row-level security policy" — vezi self-review din
-- task-1-report.md. Hard-delete e sigur aici: n-am creat days/
-- personnel/etc. pe aceste tururi, deci nu există FK-uri de blocat.
\set ON_ERROR_STOP on

select id as org_id from public.organizations limit 1 \gset

select set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-00000000000a"}', false);
set role authenticated;

select id as artist_id from public.artists where slug = 'speak' \gset

-- ── Bucket-ul se creează ca tur normal ──
insert into public.tours (organization_id, artist_id, name, bucket_year,
                          start_date, end_date, created_by)
values (:'org_id', :'artist_id', 'SPEAK 2026', 2026,
        '2026-09-01', '2026-09-01', 'a0000000-0000-0000-0000-00000000000a')
returning id as bucket_id \gset
\echo 'PASS: bucket creat ca tur normal'

-- ── Unicitate: al doilea bucket același artist+an → respins ──
do $$ declare aid uuid; oid uuid; begin
  select id into aid from public.artists where slug = 'speak';
  select id into oid from public.organizations limit 1;
  begin
    insert into public.tours (organization_id, artist_id, name, bucket_year, created_by)
    values (oid, aid, 'SPEAK 2026 dup', 2026, 'a0000000-0000-0000-0000-00000000000a');
    raise exception 'FAIL: bucket duplicat acceptat';
  exception when unique_violation then null;
  end;
end $$;
\echo 'PASS: bucket duplicat respins (unique artist+an)'

-- ── TurURILE normale nu sunt afectate: două tururi fără bucket_year, ok ──
do $$ declare aid uuid; oid uuid; begin
  select id into aid from public.artists where slug = 'speak';
  select id into oid from public.organizations limit 1;
  insert into public.tours (organization_id, artist_id, name, created_by)
  values (oid, aid, 'Tur normal A', 'a0000000-0000-0000-0000-00000000000a'),
         (oid, aid, 'Tur normal B', 'a0000000-0000-0000-0000-00000000000a');
end $$;
\echo 'PASS: tururi normale multiple fara bucket_year'

-- ── Crew vede bucket-ul prin politicile normale de tur ──
select set_config('request.jwt.claims', '{"sub":"c0000000-0000-0000-0000-00000000000c"}', false);
do $$ begin
  if not exists (select 1 from public.tours where bucket_year = 2026) then
    raise exception 'FAIL: crew nu vede bucket-ul (default deschis)';
  end if;
end $$;
\echo 'PASS: bucket vizibil prin politicile existente de tur'

-- curatenie: hard-delete pe tururile create aici, sa nu polueze alte faze
-- (soft-delete nu ajunge — vezi nota de la inceputul fisierului)
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-00000000000a"}', false);
delete from public.tours
where name in ('SPEAK 2026', 'Tur normal A', 'Tur normal B');

reset role;
