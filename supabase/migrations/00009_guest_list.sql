-- ═══════════════════════════════════════════════════════════════════
-- 00009 — Faza 4: Guest List. (§3.8, §4.3.2, §6.9)
-- Singurul modul unde userii sub Manager pot SCRIE — RLS cu atenție
-- maximă [C §4.3.2].
-- ═══════════════════════════════════════════════════════════════════

-- Tour Passes — nivel de TUR (v1.1 [C-S ecran 61])
create table public.tour_passes (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  deleted_at timestamptz,
  tour_id uuid not null references public.tours on delete cascade,
  name text not null,                -- ex 'AAA', 'Photo', 'Aftershow'
  description text,                  -- [C-S]
  image_path text,                   -- [C-S] design-ul laminatului
  sort_order integer not null default 0
);

create trigger set_updated_at before update on public.tour_passes
  for each row execute function public.set_updated_at();

create index tour_passes_tour_idx on public.tour_passes (tour_id);

-- Setări GL per event [C]
create table public.event_guest_list_settings (
  event_id uuid primary key references public.events on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  cutoff_at timestamptz,             -- [C] după oră: submit-only blocați
  is_locked boolean not null default false,  -- [C] lock manual
  tickets_allotment integer,         -- [C] allotment bilete simple
  tickets_enforced boolean not null default false  -- [C] checkbox ENFORCED [C-S]
);

create trigger set_updated_at before update on public.event_guest_list_settings
  for each row execute function public.set_updated_at();

create table public.event_pass_allotments (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  event_id uuid not null references public.events on delete cascade,
  pass_type_id uuid not null references public.tour_passes on delete cascade,
  num_allowed integer not null,
  enforced boolean not null default false,   -- [C] blochează submit la atingere
  unique (event_id, pass_type_id)
);

create trigger set_updated_at before update on public.event_pass_allotments
  for each row execute function public.set_updated_at();

create type public.guest_status as enum ('pending', 'approved', 'declined');  -- [C]
-- [D §3.8] valorile pickup nu sunt publicate — set propriu:
create type public.guest_pickup as enum ('will_call', 'box_office', 'venue', 'other');

create table public.guest_list_requests (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  deleted_at timestamptz,
  event_id uuid not null references public.events on delete cascade,
  first_name text,
  last_name text not null,
  affiliation text,                  -- [C]
  num_tickets integer not null default 0,     -- [C-S]
  status public.guest_status not null default 'pending',
  pickup public.guest_pickup,
  priority boolean not null default false,    -- [C]
  notes text,
  email_notify text,                 -- [C-S]
  phone text,                        -- [C-S]
  seat_row text, seat text,          -- [C-S] alocate la aprobare
  requested_by uuid references auth.users,    -- [C-S] REQUESTOR
  requested_at timestamptz not null default now(),  -- [C-S] DATE
  payment_status text                -- [C API: paymentStatusCode]
);

create trigger set_updated_at before update on public.guest_list_requests
  for each row execute function public.set_updated_at();

create index guest_list_requests_event_idx
  on public.guest_list_requests (event_id, status);

create table public.guest_request_passes (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  request_id uuid not null references public.guest_list_requests on delete cascade,
  pass_type_id uuid not null references public.tour_passes on delete cascade,
  quantity integer not null default 1,
  unique (request_id, pass_type_id)
);

-- ═══════════════════════════════════════════════════════════════════
-- Helpers GL
-- ═══════════════════════════════════════════════════════════════════

-- [C §6.9.2] Submit permis: nu e locked, cutoff-ul nu a trecut.
-- gl_manage_all+ ocolește ambele (verificat separat în politici).
create or replace function private.gl_can_submit(event uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select not exists (
    select 1 from public.event_guest_list_settings s
    where s.event_id = event
      and (s.is_locked or (s.cutoff_at is not null and s.cutoff_at < now()))
  );
$$;

-- [C] Enforced Allotment pe bilete: blocat dacă (existente, ne-declined)
-- + cele noi ar depăși tickets_allotment. Doar când există allotment setat.
create or replace function private.gl_tickets_blocked(event uuid, extra integer)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.event_guest_list_settings s
    where s.event_id = event
      and s.tickets_allotment is not null
      and s.tickets_enforced
      and (
        coalesce((
          select sum(r.num_tickets) from public.guest_list_requests r
          where r.event_id = event
            and r.status <> 'declined'
            and r.deleted_at is null
        ), 0) + extra
      ) > s.tickets_allotment
  );
$$;

grant execute on all functions in schema private to authenticated;

-- ═══════════════════════════════════════════════════════════════════
-- RLS
-- ═══════════════════════════════════════════════════════════════════

-- tour_passes: membrii văd; manager+pro administrează (setările turului)
alter table public.tour_passes enable row level security;

create policy tour_passes_select on public.tour_passes
  for select to authenticated
  using (
    (deleted_at is null or private.can_edit_tour_content(private.tour_org(tour_id)))
    and private.can_access_tour(tour_id)
  );

create policy tour_passes_insert on public.tour_passes
  for insert to authenticated
  with check (private.can_edit_tour_content(private.tour_org(tour_id)));

create policy tour_passes_update on public.tour_passes
  for update to authenticated
  using (private.can_edit_tour_content(private.tour_org(tour_id)))
  with check (private.can_edit_tour_content(private.tour_org(tour_id)));

create policy tour_passes_delete on public.tour_passes
  for delete to authenticated
  using (private.can_edit_tour_content(private.tour_org(tour_id)));

-- Setări + allotments: vizibile cui vede event-ul (footer-ul/headerul
-- grid-ului); scriere gl_manage_all+ (fără gating pe tier — §4.2 GL nu e ✔*)
alter table public.event_guest_list_settings enable row level security;

create policy gl_settings_select on public.event_guest_list_settings
  for select to authenticated
  using (private.can_access_event(event_id));

create policy gl_settings_insert on public.event_guest_list_settings
  for insert to authenticated
  with check (
    private.can_access_event(event_id)
    and private.has_min_permission(private.event_org(event_id), 'gl_manage_all')
  );

create policy gl_settings_update on public.event_guest_list_settings
  for update to authenticated
  using (
    private.can_access_event(event_id)
    and private.has_min_permission(private.event_org(event_id), 'gl_manage_all')
  )
  with check (
    private.can_access_event(event_id)
    and private.has_min_permission(private.event_org(event_id), 'gl_manage_all')
  );

alter table public.event_pass_allotments enable row level security;

create policy gl_allotments_select on public.event_pass_allotments
  for select to authenticated
  using (private.can_access_event(event_id));

create policy gl_allotments_insert on public.event_pass_allotments
  for insert to authenticated
  with check (
    private.can_access_event(event_id)
    and private.has_min_permission(private.event_org(event_id), 'gl_manage_all')
  );

create policy gl_allotments_update on public.event_pass_allotments
  for update to authenticated
  using (
    private.can_access_event(event_id)
    and private.has_min_permission(private.event_org(event_id), 'gl_manage_all')
  )
  with check (
    private.can_access_event(event_id)
    and private.has_min_permission(private.event_org(event_id), 'gl_manage_all')
  );

create policy gl_allotments_delete on public.event_pass_allotments
  for delete to authenticated
  using (
    private.can_access_event(event_id)
    and private.has_min_permission(private.event_org(event_id), 'gl_manage_all')
  );

-- guest_list_requests — inima §4.3.2:
alter table public.guest_list_requests enable row level security;

-- SELECT: gl_view_all_submit+ vede TOT; gl_submit doar ale lui [C]
create policy gl_requests_select on public.guest_list_requests
  for select to authenticated
  using (
    deleted_at is null
    and private.can_access_event(event_id)
    and (
      private.has_min_permission(private.event_org(event_id), 'gl_view_all_submit')
      or (
        private.has_min_permission(private.event_org(event_id), 'gl_submit')
        and requested_by = (select auth.uid())
      )
    )
  );

-- INSERT: gl_submit+ pe numele lui; sub gl_manage_all se aplică
-- cutoff/lock [C] + enforced tickets allotment [C]
create policy gl_requests_insert on public.guest_list_requests
  for insert to authenticated
  with check (
    private.can_access_event(event_id)
    and private.has_min_permission(private.event_org(event_id), 'gl_submit')
    and requested_by = (select auth.uid())
    and (
      private.has_min_permission(private.event_org(event_id), 'gl_manage_all')
      or (
        private.gl_can_submit(event_id)
        and not private.gl_tickets_blocked(event_id, num_tickets)
      )
    )
  );

-- UPDATE: gl_manage_all+ orice (aprobare/refuz/edit [C]); ownerul doar
-- rândurile PROPRII cât timp pending, fără să-și schimbe statusul [D]
create policy gl_requests_update_manager on public.guest_list_requests
  for update to authenticated
  using (
    private.can_access_event(event_id)
    and private.has_min_permission(private.event_org(event_id), 'gl_manage_all')
  )
  with check (
    private.can_access_event(event_id)
    and private.has_min_permission(private.event_org(event_id), 'gl_manage_all')
  );

create policy gl_requests_update_own_pending on public.guest_list_requests
  for update to authenticated
  using (
    private.can_access_event(event_id)
    and private.has_min_permission(private.event_org(event_id), 'gl_submit')
    and requested_by = (select auth.uid())
    and status = 'pending'
  )
  with check (
    requested_by = (select auth.uid())
    and status = 'pending'
  );

create policy gl_requests_delete on public.guest_list_requests
  for delete to authenticated
  using (
    private.can_access_event(event_id)
    and (
      private.has_min_permission(private.event_org(event_id), 'gl_manage_all')
      or (
        private.has_min_permission(private.event_org(event_id), 'gl_submit')
        and requested_by = (select auth.uid())
        and status = 'pending'
      )
    )
  );

-- guest_request_passes: urmează request-ul
alter table public.guest_request_passes enable row level security;

create policy grp_select on public.guest_request_passes
  for select to authenticated
  using (
    exists (
      select 1 from public.guest_list_requests r
      where r.id = request_id
        and private.can_access_event(r.event_id)
        and (
          private.has_min_permission(private.event_org(r.event_id), 'gl_view_all_submit')
          or r.requested_by = (select auth.uid())
        )
    )
  );

create policy grp_insert on public.guest_request_passes
  for insert to authenticated
  with check (
    exists (
      select 1 from public.guest_list_requests r
      where r.id = request_id
        and private.can_access_event(r.event_id)
        and (
          private.has_min_permission(private.event_org(r.event_id), 'gl_manage_all')
          or (r.requested_by = (select auth.uid()) and r.status = 'pending')
        )
    )
  );

create policy grp_update on public.guest_request_passes
  for update to authenticated
  using (
    exists (
      select 1 from public.guest_list_requests r
      where r.id = request_id
        and private.can_access_event(r.event_id)
        and (
          private.has_min_permission(private.event_org(r.event_id), 'gl_manage_all')
          or (r.requested_by = (select auth.uid()) and r.status = 'pending')
        )
    )
  )
  with check (
    exists (
      select 1 from public.guest_list_requests r
      where r.id = request_id
        and private.can_access_event(r.event_id)
        and (
          private.has_min_permission(private.event_org(r.event_id), 'gl_manage_all')
          or (r.requested_by = (select auth.uid()) and r.status = 'pending')
        )
    )
  );

create policy grp_delete on public.guest_request_passes
  for delete to authenticated
  using (
    exists (
      select 1 from public.guest_list_requests r
      where r.id = request_id
        and private.can_access_event(r.event_id)
        and (
          private.has_min_permission(private.event_org(r.event_id), 'gl_manage_all')
          or (r.requested_by = (select auth.uid()) and r.status = 'pending')
        )
    )
  );

-- Realtime
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.guest_list_requests;
  end if;
end $$;
