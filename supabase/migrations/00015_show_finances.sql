-- ═══════════════════════════════════════════════════════════════════
-- 00015 — Economia show-ului (cererea lui Ștefan, 2026-07-09):
-- crew cu cost per persoană + tip de plată (firmă/PF), fee per show,
-- procent de booking (default pe tur, override pe show), costuri extra,
-- fișă de costuri pentru booking + profit per show.
-- Vizibilitate: EXACT ca accounting-ul (admin/accounting; managerul NU).
-- ═══════════════════════════════════════════════════════════════════

-- crew: cost + tip de plată
alter table public.tour_personnel
  add column cost_per_show numeric,
  add column cost_currency text not null default 'RON',
  add column payment_type text check (payment_type in ('company', 'individual'));

-- procentul default de booking al turului
alter table public.tours
  add column booking_percent numeric check (booking_percent >= 0 and booking_percent <= 100);

-- fee-ul + override-ul de procent per show — tabel SEPARAT de events,
-- ca RLS-ul de accounting să-l protejeze (fee-ul nu e pentru tot crew-ul)
create table public.show_finances (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  event_id uuid not null unique references public.events on delete cascade,
  fee numeric,
  fee_currency text not null default 'RON',
  booking_percent numeric check (booking_percent >= 0 and booking_percent <= 100),
  notes text,
  updated_by uuid references auth.users
);

-- liniile de cost per show: crew (importate din personnel) + extra
create table public.show_costs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  deleted_at timestamptz,
  event_id uuid not null references public.events on delete cascade,
  kind text not null default 'extra' check (kind in ('crew', 'extra')),
  label text not null,
  payment_type text check (payment_type in ('company', 'individual')),
  amount numeric not null default 0,
  currency text not null default 'RON',
  personnel_id uuid references public.tour_personnel on delete set null,
  sort_order integer not null default 0,
  updated_by uuid references auth.users
);
create index show_costs_event_idx on public.show_costs (event_id);

-- ── RLS: aceleași reguli ca settlements (00012) ──
alter table public.show_finances enable row level security;
alter table public.show_costs enable row level security;

create policy show_finances_select on public.show_finances for select
  using (private.can_view_accounting(event_id));
create policy show_finances_insert on public.show_finances for insert
  with check (private.can_edit_accounting(event_id));
create policy show_finances_update on public.show_finances for update
  using (private.can_edit_accounting(event_id))
  with check (private.can_edit_accounting(event_id));
create policy show_finances_delete on public.show_finances for delete
  using (private.can_edit_accounting(event_id));

create policy show_costs_select on public.show_costs for select
  using (deleted_at is null and private.can_view_accounting(event_id));
create policy show_costs_insert on public.show_costs for insert
  with check (private.can_edit_accounting(event_id));
create policy show_costs_update on public.show_costs for update
  using (private.can_edit_accounting(event_id))
  with check (private.can_edit_accounting(event_id));
create policy show_costs_delete on public.show_costs for delete
  using (private.can_edit_accounting(event_id));
