-- ═══════════════════════════════════════════════════════════════════
-- 00020 — Profil de crew + ANEXE DE PLATĂ (cererea lui Ștefan):
-- per membru: date de facturare (firmă sau PF), poză, situația
-- financiară (show-uri plătite/neplătite); anexe numerotate per
-- persoană (nr. anexă + nr. contract), cu snapshot-ul datelor ambelor
-- părți la momentul emiterii → trasabilitate completă la final de an.
-- Vizibilitate financiară: admin/accounting (ca restul accounting-ului).
-- ═══════════════════════════════════════════════════════════════════

alter table public.tour_personnel
  add column photo_path text,
  add column billing_details jsonb not null default '{}';
  -- billing_details: {company_name, cui, reg_com, address, iban, bank,
  --                   representative, contract_number} sau pt PF:
  --                   {full_name, id_number, address, iban, bank}

create table public.payment_annexes (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  deleted_at timestamptz,
  organization_id uuid not null references public.organizations on delete cascade,
  tour_id uuid not null references public.tours on delete cascade,
  personnel_id uuid not null references public.tour_personnel on delete cascade,
  annex_number integer not null,
  contract_number text,
  issue_date date not null default current_date,
  currency text not null default 'RON',
  total numeric not null default 0,
  payer jsonb not null default '{}',   -- snapshot societatea noastră
  payee jsonb not null default '{}',   -- snapshot firma/PF-ul membrului
  paid_at date,                        -- null = de plătit
  notes text,
  created_by uuid references auth.users,
  unique (personnel_id, annex_number)
);
create index payment_annexes_personnel_idx on public.payment_annexes (personnel_id);

-- liniile de cost se alocă unei anexe (un calup de plăți)
alter table public.show_costs
  add column annex_id uuid references public.payment_annexes on delete set null;

-- ── RLS: admin/accounting pe organizația turului ──
alter table public.payment_annexes enable row level security;

create or replace function private.can_edit_tour_accounting(tour uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.has_min_permission(
    (select organization_id from public.tours where id = tour),
    'accounting'
  ) and private.is_pro();
$$;

create policy payment_annexes_select on public.payment_annexes for select
  using (
    (deleted_at is null or private.can_edit_tour_accounting(tour_id))
    and private.has_min_permission(organization_id, 'accounting')
  );
create policy payment_annexes_insert on public.payment_annexes for insert
  with check (private.can_edit_tour_accounting(tour_id));
create policy payment_annexes_update on public.payment_annexes for update
  using (private.can_edit_tour_accounting(tour_id))
  with check (private.can_edit_tour_accounting(tour_id));
create policy payment_annexes_delete on public.payment_annexes for delete
  using (private.can_edit_tour_accounting(tour_id));
