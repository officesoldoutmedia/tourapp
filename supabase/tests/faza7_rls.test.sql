-- ═══ Faza 7 — RLS Accounting (doar admin+accounting [C §4.2]) ═══
\set ON_ERROR_STOP on

select id as org_id from public.organizations limit 1 \gset
select e.id as event_id from public.events e where e.title = 'GL SHOW' \gset

-- Setup superuser: user manager (pro) + user accounting (pro), în Band
reset role;
insert into auth.users (id, email) values
  ('40000000-0000-0000-0000-000000000004', 'manager@test.local'),
  ('50000000-0000-0000-0000-000000000005', 'acc@test.local');
update public.profiles set user_tier = 'pro'
where id in ('40000000-0000-0000-0000-000000000004', '50000000-0000-0000-0000-000000000005');
insert into public.organization_members (organization_id, user_id, permission) values
  (:'org_id', '40000000-0000-0000-0000-000000000004', 'manager'),
  (:'org_id', '50000000-0000-0000-0000-000000000005', 'accounting');
insert into public.group_members (group_id, user_id)
select id, u from public.groups, (values
  ('40000000-0000-0000-0000-000000000004'::uuid),
  ('50000000-0000-0000-0000-000000000005'::uuid)) as x(u)
where name = 'Band';

-- ── Accounting creează settlement-ul DoD: 85/15 cu taxe + withholding ──
set role authenticated;
select set_config('request.jwt.claims', '{"sub":"50000000-0000-0000-0000-000000000005"}', false);

insert into public.settlements (event_id, currency, deal_type, guarantee,
  split_percent_artist, venue_capacity, tickets_sold, gross_ticket_sales,
  taxes_fees, total_expenses, withholding, deposit)
values (:'event_id', 'EUR', 'vs_split', 10000, 85, 5000, 4000, 100000,
        19000, 21000, 2000, 5000);

insert into public.ticket_sales (settlement_id, label, sold, kills, scans, gross_price)
values (:'event_id', 'GA', 3500, 50, 3400, 20),
       (:'event_id', 'VIP', 500, 0, 480, 60);

insert into public.settlement_expenses (settlement_id, stage, label, formula, amount)
values (:'event_id', 'pre_split', 'Production', null, 15000),
       (:'event_id', 'pre_split', 'Marketing', '5% of gross', 5000),
       (:'event_id', 'withholding', 'Tax retinut', null, 2000);

insert into public.non_settlement_items (event_id, category, description, income, expense)
values (:'event_id', 'Merch', 'Tricouri', 3000, 800);
\echo 'PASS: accounting creeaza settlement + tickets + expenses + line items'

do $$ begin
  if (select count(*) from public.settlements) <> 1
     or (select count(*) from public.ticket_sales) <> 2 then
    raise exception 'FAIL: accounting nu-si vede settlement-ul';
  end if;
end $$;

-- ── MANAGERUL nu vede modulul Accounting [C] ──
select set_config('request.jwt.claims', '{"sub":"40000000-0000-0000-0000-000000000004"}', false);
do $$ declare eid uuid; begin
  if (select count(*) from public.settlements) <> 0
     or (select count(*) from public.ticket_sales) <> 0
     or (select count(*) from public.settlement_expenses) <> 0
     or (select count(*) from public.non_settlement_items) <> 0 then
    raise exception 'FAIL: managerul vede accounting [C spune ca NU]';
  end if;
  select e.id into eid from public.events e where e.title = 'GL SHOW';
  begin
    insert into public.non_settlement_items (event_id, category, income)
    values (eid, 'Hack', 1);
    raise exception 'FAIL: managerul a scris in accounting';
  exception when others then
    if sqlerrm like 'FAIL%' then raise; end if;
  end;
end $$;
\echo 'PASS: managerul NU vede si NU scrie accounting (C §4.2)'

-- crew la fel
select set_config('request.jwt.claims', '{"sub":"c0000000-0000-0000-0000-00000000000c"}', false);
do $$ begin
  if (select count(*) from public.settlements) <> 0 then
    raise exception 'FAIL: crew vede settlements';
  end if;
end $$;

-- adminul vede
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-00000000000a"}', false);
do $$ begin
  if (select count(*) from public.settlements) <> 1 then
    raise exception 'FAIL: adminul nu vede settlements';
  end if;
end $$;
\echo 'PASS: crew nu vede; adminul vede'

\echo '═══ FAZA 7 RLS: TOATE PROBELE AU TRECUT ═══'
