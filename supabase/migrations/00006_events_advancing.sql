-- ═══════════════════════════════════════════════════════════════════
-- 00006 — Faza 2: venues, events, promoters, field registry, local
--          crew, labor call, advances. (§3.4, §3.5, A.1)
-- ═══════════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────────────────────
-- venues — bibliotecă refolosibilă. [C]
-- organization_id NULL = record global (catalogul nostru, seed).
-- Copy-on-write [C]: la prima editare a unui venue global de către un
-- org se creează copie cu organization_id setat (logica în aplicație).
-- ───────────────────────────────────────────────────────────────────
create table public.venues (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  deleted_at timestamptz,
  organization_id uuid references public.organizations on delete cascade,
  name text not null,
  previous_names text,                             -- [C-S]
  address_line1 text, address_line2 text,          -- [C-S]
  city text, state text, country text, postal_code text,
  lat double precision, lng double precision,      -- [C-S] editabile
  venue_type text,                                 -- [C-S] dropdown
  capacity integer,                                 -- [C-S]
  age_requirement text,                            -- [C-S]
  public_notes text, private_notes text,           -- [C-S]
  phones jsonb not null default '[]',              -- [C-S] {number,label}
  emails jsonb not null default '[]',
  urls jsonb not null default '[]',
  source text not null default 'manual',           -- 'catalog'|'google'|'manual'
  google_place_id text,
  copied_from uuid references public.venues        -- proveniența copy-on-write
);

create trigger set_updated_at before update on public.venues
  for each row execute function public.set_updated_at();

create index venues_org_idx on public.venues (organization_id);
create index venues_name_city_idx on public.venues (lower(name), lower(city));

-- Key Contacts pe venue [C-S]: chips cu rol, draggable.
create table public.venue_key_contacts (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  venue_id uuid not null references public.venues on delete cascade,
  contact_id uuid,     -- FK către contacts în Faza 5
  role text,
  sort_order integer not null default 0
);

create index venue_key_contacts_venue_idx on public.venue_key_contacts (venue_id);

-- ───────────────────────────────────────────────────────────────────
-- events — pot fi MAI MULTE pe zi. [C]
-- ───────────────────────────────────────────────────────────────────
create table public.events (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  deleted_at timestamptz,
  day_id uuid not null references public.days on delete cascade,
  venue_id uuid references public.venues,
  title text,                        -- default = numele venue-ului
  status text not null default 'confirmed',  -- [D] confirmed|hold|cancelled
  notes text,
  labor_currency text,               -- [C-S] CURRENCY (Labor Call)
  labor_cost_at_settlement numeric   -- [C-S] COSTATSETTLEMENT
);

create trigger set_updated_at before update on public.events
  for each row execute function public.set_updated_at();

create index events_day_idx on public.events (day_id);

-- ───────────────────────────────────────────────────────────────────
-- promoters [C] — bibliotecă org
-- ───────────────────────────────────────────────────────────────────
create table public.promoters (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  deleted_at timestamptz,
  organization_id uuid not null references public.organizations on delete cascade,
  name text not null,
  address text, city text, state text, country text, postal_code text,
  phone text, url text, notes text
);

create trigger set_updated_at before update on public.promoters
  for each row execute function public.set_updated_at();

create index promoters_org_idx on public.promoters (organization_id);

create table public.event_promoters (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  event_id uuid not null references public.events on delete cascade,
  promoter_id uuid not null references public.promoters on delete cascade,
  unique (event_id, promoter_id)
);

-- ───────────────────────────────────────────────────────────────────
-- FIELD REGISTRY (§3.4 [N]) — nucleul Events tab + Advance.
-- "Events tab" și "Advance" sunt două view-uri peste aceleași valori →
-- sync-ul bidirecțional [C] e garantat by-design.
-- ───────────────────────────────────────────────────────────────────
create type public.event_section as enum (
  'venue_info','promoter_info','production','facilities',
  'equipment','logistics','local_crew','labor_call','custom'
);

create table public.field_definitions (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  deleted_at timestamptz,
  organization_id uuid references public.organizations on delete cascade,
  -- NULL = câmp standard din biblioteca noastră (seed A.3)
  section public.event_section not null,
  key text not null,                 -- ex 'production.dimensions'
  field_type text not null default 'textarea',
  -- 'text'|'textarea'|'number'|'time'|'date'|'boolean'|'dropdown'|'contact'
  subgroup text,                        -- [C-S] Production: staging|load_rigging|power|house_show
  options jsonb not null default '[]',  -- pt dropdown
  sort_order integer not null default 0,
  custom_label text                  -- doar pt câmpuri custom de org;
                                     -- cele standard se traduc prin i18n (A.5.2)
);

create trigger set_updated_at before update on public.field_definitions
  for each row execute function public.set_updated_at();

-- unicitate: un key per org (sau per catalogul global)
create unique index field_definitions_key_unique
  on public.field_definitions (
    coalesce(organization_id, '00000000-0000-0000-0000-000000000000'::uuid),
    key
  );

create table public.event_field_values (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  event_id uuid not null references public.events on delete cascade,
  field_key text not null,
  value text,
  updated_by uuid references auth.users,
  unique (event_id, field_key)
);

create index event_field_values_event_idx on public.event_field_values (event_id);

-- "Hide Data Fields" per org [C]
create table public.org_hidden_fields (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  organization_id uuid not null references public.organizations on delete cascade,
  field_key text not null,
  unique (organization_id, field_key)
);

-- ───────────────────────────────────────────────────────────────────
-- LOCAL CREW — set de câmpuri, NU grid de contacte [C-S v1.1]
-- ───────────────────────────────────────────────────────────────────
create table public.event_local_crew_details (
  event_id uuid primary key references public.events on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  local_union text,        -- [C-S] LOCALUNION
  minimum_in text,         -- [C-S] MINIMUMIN
  minimum_out text,        -- [C-S] MINIMUMOUT
  penalties text,          -- [C-S] PENALTIES
  crew_comments text       -- [C-S] CREWCOMMENTS
);

create trigger set_updated_at before update on public.event_local_crew_details
  for each row execute function public.set_updated_at();

-- LABOR CALL — grid de rânduri per event [C-S v1.1]
create table public.event_labor_calls (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  deleted_at timestamptz,
  event_id uuid not null references public.events on delete cascade,
  call_time time,
  day_offset integer not null default 0,   -- [C-S] DAYOF|DAYAFTER
  call_count text,          -- [C-S] CALL
  worker_type text,         -- [C-S] TYPE
  add_count text,           -- [C-S] ADD
  cut_count text,           -- [C-S] CUT
  notes text,
  sort_order integer not null default 0
);

create trigger set_updated_at before update on public.event_labor_calls
  for each row execute function public.set_updated_at();

create index event_labor_calls_event_idx on public.event_labor_calls (event_id);

-- ───────────────────────────────────────────────────────────────────
-- ADVANCES [C] — multiple per event; layout = listă ordonată de itemi:
--   {"type":"field","key":"production.dimensions"}
--   {"type":"title","title":"Audio","description":"…"}
--   {"type":"schedule_row","schedule_item_id":"…"}   [C-S v1.1]
-- Valorile NU se stochează aici — trăiesc în event_field_values.
-- ───────────────────────────────────────────────────────────────────
create type public.advance_status as enum ('not_started','in_progress','done');

create table public.advances (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  deleted_at timestamptz,
  event_id uuid not null references public.events on delete cascade,
  title text not null,
  status public.advance_status not null default 'not_started',
  layout jsonb not null default '[]',
  sort_order integer not null default 0
);

create trigger set_updated_at before update on public.advances
  for each row execute function public.set_updated_at();

create index advances_event_idx on public.advances (event_id);

create table public.advance_templates (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  deleted_at timestamptz,
  organization_id uuid not null references public.organizations on delete cascade,
  title text not null,
  layout jsonb not null default '[]'
);

create trigger set_updated_at before update on public.advance_templates
  for each row execute function public.set_updated_at();

-- ═══════════════════════════════════════════════════════════════════
-- Helper: org-ul + accesul unui event (prin zi → tur)
-- ═══════════════════════════════════════════════════════════════════
create or replace function private.event_day(event uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select e.day_id from public.events e where e.id = event;
$$;

create or replace function private.event_org(event uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select private.tour_org(d.tour_id)
  from public.events e
  join public.days d on d.id = e.day_id
  where e.id = event;
$$;

create or replace function private.can_access_event(event uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.events e
    where e.id = event
      and e.deleted_at is null
      and private.can_access_day(e.day_id)
  );
$$;

create or replace function private.can_edit_event(event uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.can_edit_tour_content(private.event_org(event));
$$;

grant execute on all functions in schema private to authenticated;

-- ═══════════════════════════════════════════════════════════════════
-- RLS
-- ═══════════════════════════════════════════════════════════════════

-- venues: catalogul global (org null) e vizibil tuturor autentificaților;
-- venue-urile org-ului doar membrilor. Scriere: manager+pro pe org propriu.
alter table public.venues enable row level security;

create policy venues_select on public.venues
  for select to authenticated
  using (
    (organization_id is null and deleted_at is null)
    or (
      organization_id is not null
      and private.is_org_member(organization_id)
      and (deleted_at is null or private.can_edit_tour_content(organization_id))
    )
  );

create policy venues_insert on public.venues
  for insert to authenticated
  with check (
    organization_id is not null
    and private.can_edit_tour_content(organization_id)
  );

create policy venues_update on public.venues
  for update to authenticated
  using (organization_id is not null and private.can_edit_tour_content(organization_id))
  with check (organization_id is not null and private.can_edit_tour_content(organization_id));

create policy venues_delete on public.venues
  for delete to authenticated
  using (organization_id is not null and private.can_edit_tour_content(organization_id));

-- venue_key_contacts: urmează venue-ul
alter table public.venue_key_contacts enable row level security;

create policy venue_key_contacts_select on public.venue_key_contacts
  for select to authenticated
  using (
    exists (
      select 1 from public.venues v
      where v.id = venue_id
        and (
          v.organization_id is null
          or private.is_org_member(v.organization_id)
        )
    )
  );

create policy venue_key_contacts_insert on public.venue_key_contacts
  for insert to authenticated
  with check (
    exists (
      select 1 from public.venues v
      where v.id = venue_id
        and v.organization_id is not null
        and private.can_edit_tour_content(v.organization_id)
    )
  );

create policy venue_key_contacts_update on public.venue_key_contacts
  for update to authenticated
  using (
    exists (
      select 1 from public.venues v
      where v.id = venue_id
        and v.organization_id is not null
        and private.can_edit_tour_content(v.organization_id)
    )
  )
  with check (
    exists (
      select 1 from public.venues v
      where v.id = venue_id
        and v.organization_id is not null
        and private.can_edit_tour_content(v.organization_id)
    )
  );

create policy venue_key_contacts_delete on public.venue_key_contacts
  for delete to authenticated
  using (
    exists (
      select 1 from public.venues v
      where v.id = venue_id
        and v.organization_id is not null
        and private.can_edit_tour_content(v.organization_id)
    )
  );

-- events: cascadă prin zi
alter table public.events enable row level security;

create policy events_select on public.events
  for select to authenticated
  using (
    (deleted_at is null or private.can_edit_tour_content(private.event_org(id)))
    and private.can_access_day(day_id)
  );

create policy events_insert on public.events
  for insert to authenticated
  with check (
    exists (
      select 1 from public.days d
      where d.id = day_id
        and private.can_edit_tour_content(private.tour_org(d.tour_id))
    )
  );

create policy events_update on public.events
  for update to authenticated
  using (private.can_edit_event(id))
  with check (private.can_edit_event(id));

create policy events_delete on public.events
  for delete to authenticated
  using (private.can_edit_event(id));

-- promoters (bibliotecă org)
alter table public.promoters enable row level security;

create policy promoters_select on public.promoters
  for select to authenticated
  using (
    private.is_org_member(organization_id)
    and (deleted_at is null or private.can_edit_tour_content(organization_id))
  );

create policy promoters_insert on public.promoters
  for insert to authenticated
  with check (private.can_edit_tour_content(organization_id));

create policy promoters_update on public.promoters
  for update to authenticated
  using (private.can_edit_tour_content(organization_id))
  with check (private.can_edit_tour_content(organization_id));

create policy promoters_delete on public.promoters
  for delete to authenticated
  using (private.can_edit_tour_content(organization_id));

-- event_promoters
alter table public.event_promoters enable row level security;

create policy event_promoters_select on public.event_promoters
  for select to authenticated
  using (private.can_access_event(event_id));

create policy event_promoters_insert on public.event_promoters
  for insert to authenticated
  with check (private.can_edit_event(event_id));

create policy event_promoters_delete on public.event_promoters
  for delete to authenticated
  using (private.can_edit_event(event_id));

-- field_definitions: standard (org null) = read-only pentru toți;
-- custom = org-scoped, scriere manager+pro
alter table public.field_definitions enable row level security;

create policy field_definitions_select on public.field_definitions
  for select to authenticated
  using (
    (organization_id is null and deleted_at is null)
    or (
      organization_id is not null
      and private.is_org_member(organization_id)
      and (deleted_at is null or private.can_edit_tour_content(organization_id))
    )
  );

create policy field_definitions_insert on public.field_definitions
  for insert to authenticated
  with check (
    organization_id is not null
    and private.can_edit_tour_content(organization_id)
  );

create policy field_definitions_update on public.field_definitions
  for update to authenticated
  using (organization_id is not null and private.can_edit_tour_content(organization_id))
  with check (organization_id is not null and private.can_edit_tour_content(organization_id));

create policy field_definitions_delete on public.field_definitions
  for delete to authenticated
  using (organization_id is not null and private.can_edit_tour_content(organization_id));

-- event_field_values: urmează event-ul
alter table public.event_field_values enable row level security;

create policy event_field_values_select on public.event_field_values
  for select to authenticated
  using (private.can_access_event(event_id));

create policy event_field_values_insert on public.event_field_values
  for insert to authenticated
  with check (private.can_edit_event(event_id));

create policy event_field_values_update on public.event_field_values
  for update to authenticated
  using (private.can_edit_event(event_id))
  with check (private.can_edit_event(event_id));

create policy event_field_values_delete on public.event_field_values
  for delete to authenticated
  using (private.can_edit_event(event_id));

-- org_hidden_fields
alter table public.org_hidden_fields enable row level security;

create policy org_hidden_fields_select on public.org_hidden_fields
  for select to authenticated
  using (private.is_org_member(organization_id));

create policy org_hidden_fields_insert on public.org_hidden_fields
  for insert to authenticated
  with check (private.can_edit_tour_content(organization_id));

create policy org_hidden_fields_delete on public.org_hidden_fields
  for delete to authenticated
  using (private.can_edit_tour_content(organization_id));

-- event_local_crew_details
alter table public.event_local_crew_details enable row level security;

create policy local_crew_select on public.event_local_crew_details
  for select to authenticated
  using (private.can_access_event(event_id));

create policy local_crew_insert on public.event_local_crew_details
  for insert to authenticated
  with check (private.can_edit_event(event_id));

create policy local_crew_update on public.event_local_crew_details
  for update to authenticated
  using (private.can_edit_event(event_id))
  with check (private.can_edit_event(event_id));

create policy local_crew_delete on public.event_local_crew_details
  for delete to authenticated
  using (private.can_edit_event(event_id));

-- event_labor_calls — [C §6.5.2] legat STRICT de event (nu de zi):
-- politica garantează că un labor call nu "scapă" pe alt event.
alter table public.event_labor_calls enable row level security;

create policy labor_calls_select on public.event_labor_calls
  for select to authenticated
  using (
    (deleted_at is null or private.can_edit_event(event_id))
    and private.can_access_event(event_id)
  );

create policy labor_calls_insert on public.event_labor_calls
  for insert to authenticated
  with check (private.can_edit_event(event_id));

create policy labor_calls_update on public.event_labor_calls
  for update to authenticated
  using (private.can_edit_event(event_id))
  with check (private.can_edit_event(event_id));

create policy labor_calls_delete on public.event_labor_calls
  for delete to authenticated
  using (private.can_edit_event(event_id));

-- advances
alter table public.advances enable row level security;

create policy advances_select on public.advances
  for select to authenticated
  using (
    (deleted_at is null or private.can_edit_event(event_id))
    and private.can_access_event(event_id)
  );

create policy advances_insert on public.advances
  for insert to authenticated
  with check (private.can_edit_event(event_id));

create policy advances_update on public.advances
  for update to authenticated
  using (private.can_edit_event(event_id))
  with check (private.can_edit_event(event_id));

create policy advances_delete on public.advances
  for delete to authenticated
  using (private.can_edit_event(event_id));

-- advance_templates
alter table public.advance_templates enable row level security;

create policy advance_templates_select on public.advance_templates
  for select to authenticated
  using (
    private.is_org_member(organization_id)
    and (deleted_at is null or private.can_edit_tour_content(organization_id))
  );

create policy advance_templates_insert on public.advance_templates
  for insert to authenticated
  with check (private.can_edit_tour_content(organization_id));

create policy advance_templates_update on public.advance_templates
  for update to authenticated
  using (private.can_edit_tour_content(organization_id))
  with check (private.can_edit_tour_content(organization_id));

create policy advance_templates_delete on public.advance_templates
  for delete to authenticated
  using (private.can_edit_tour_content(organization_id));

-- Realtime pe tabelele de event (folosite în Faza 2 UI)
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.events;
    alter publication supabase_realtime add table public.event_field_values;
    alter publication supabase_realtime add table public.advances;
  end if;
end $$;
