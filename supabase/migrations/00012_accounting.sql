-- ═══════════════════════════════════════════════════════════════════
-- 00012 — Faza 7: Accounting (Settlement). (§3.11, A.4)
-- Vizibil DOAR pentru administrator + accounting [C §4.2].
-- ═══════════════════════════════════════════════════════════════════

create table public.settlements (
  event_id uuid primary key references public.events on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  currency text not null default 'EUR',      -- [C-S] + multi-currency [N]
  deal_type text,                            -- 'guarantee'|'vs_split'|'door_deal'|'flat'
  guarantee numeric,                         -- [C-S]
  split_percent_artist numeric,
  -- Waterfall A.4 (inputuri; derivatele se calculează în computeSettlement):
  venue_capacity integer,
  tickets_sold integer,
  comps integer,
  gross_ticket_sales numeric,
  taxes_fees numeric,
  total_expenses numeric,
  overage numeric,                           -- input manual SAU calculat
  production_reimbursements numeric,
  additional_chargebacks numeric,
  deposit numeric,
  withholding numeric,
  cash numeric,
  ticket_buys numeric,
  night_of_show_deductions numeric,
  total_merch_sales numeric,                 -- informativ, în afara waterfall-ului
  notes text,
  finalized_at timestamptz,
  updated_by uuid references auth.users
);

create trigger set_updated_at before update on public.settlements
  for each row execute function public.set_updated_at();

create table public.ticket_sales (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  settlement_id uuid not null references public.settlements (event_id) on delete cascade,
  label text not null,             -- 'GA', 'VIP', … [C multiple types]
  capacity integer,
  comps integer not null default 0,
  kills integer not null default 0,    -- [C] nevandabile
  scans integer not null default 0,    -- [C]
  sold integer not null default 0,
  gross_price numeric,
  net_price numeric,
  sort_order integer not null default 0
);

create trigger set_updated_at before update on public.ticket_sales
  for each row execute function public.set_updated_at();

create index ticket_sales_settlement_idx on public.ticket_sales (settlement_id);

-- [C] 3 etape cu semantică financiară strictă (§6.12)
create type public.expense_stage as enum ('pre_split', 'post_split', 'withholding');

create table public.settlement_expenses (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  settlement_id uuid not null references public.settlements (event_id) on delete cascade,
  stage public.expense_stage not null default 'pre_split',
  label text not null,
  formula text,                    -- [C] ex '5% of gross'; parser simplu [N]
  amount numeric,                  -- valoarea finală (calculată sau introdusă)
  notes text,
  sort_order integer not null default 0
);

create trigger set_updated_at before update on public.settlement_expenses
  for each row execute function public.set_updated_at();

create index settlement_expenses_settlement_idx
  on public.settlement_expenses (settlement_id, stage);

-- Line Items = non-settlement income/expenses [C-S]
create table public.non_settlement_items (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  event_id uuid not null references public.events on delete cascade,
  category text,
  description text,
  income numeric not null default 0,
  expense numeric not null default 0,
  notes text,
  sort_order integer not null default 0
);

create trigger set_updated_at before update on public.non_settlement_items
  for each row execute function public.set_updated_at();

create index non_settlement_items_event_idx on public.non_settlement_items (event_id);

-- ═══════════════════════════════════════════════════════════════════
-- RLS — modulul Accounting: DOAR administrator + accounting [C §4.2]
-- ═══════════════════════════════════════════════════════════════════
create or replace function private.can_view_accounting(event uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.can_access_event(event)
    and private.has_min_permission(private.event_org(event), 'accounting');
$$;

create or replace function private.can_edit_accounting(event uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.can_view_accounting(event) and private.is_pro();
$$;

grant execute on all functions in schema private to authenticated;

alter table public.settlements enable row level security;

create policy settlements_select on public.settlements
  for select to authenticated
  using (private.can_view_accounting(event_id));

create policy settlements_insert on public.settlements
  for insert to authenticated
  with check (private.can_edit_accounting(event_id));

create policy settlements_update on public.settlements
  for update to authenticated
  using (private.can_edit_accounting(event_id))
  with check (private.can_edit_accounting(event_id));

create policy settlements_delete on public.settlements
  for delete to authenticated
  using (private.can_edit_accounting(event_id));

alter table public.ticket_sales enable row level security;

create policy ticket_sales_select on public.ticket_sales
  for select to authenticated
  using (private.can_view_accounting(settlement_id));

create policy ticket_sales_insert on public.ticket_sales
  for insert to authenticated
  with check (private.can_edit_accounting(settlement_id));

create policy ticket_sales_update on public.ticket_sales
  for update to authenticated
  using (private.can_edit_accounting(settlement_id))
  with check (private.can_edit_accounting(settlement_id));

create policy ticket_sales_delete on public.ticket_sales
  for delete to authenticated
  using (private.can_edit_accounting(settlement_id));

alter table public.settlement_expenses enable row level security;

create policy settlement_expenses_select on public.settlement_expenses
  for select to authenticated
  using (private.can_view_accounting(settlement_id));

create policy settlement_expenses_insert on public.settlement_expenses
  for insert to authenticated
  with check (private.can_edit_accounting(settlement_id));

create policy settlement_expenses_update on public.settlement_expenses
  for update to authenticated
  using (private.can_edit_accounting(settlement_id))
  with check (private.can_edit_accounting(settlement_id));

create policy settlement_expenses_delete on public.settlement_expenses
  for delete to authenticated
  using (private.can_edit_accounting(settlement_id));

alter table public.non_settlement_items enable row level security;

create policy non_settlement_select on public.non_settlement_items
  for select to authenticated
  using (private.can_view_accounting(event_id));

create policy non_settlement_insert on public.non_settlement_items
  for insert to authenticated
  with check (private.can_edit_accounting(event_id));

create policy non_settlement_update on public.non_settlement_items
  for update to authenticated
  using (private.can_edit_accounting(event_id))
  with check (private.can_edit_accounting(event_id));

create policy non_settlement_delete on public.non_settlement_items
  for delete to authenticated
  using (private.can_edit_accounting(event_id));
