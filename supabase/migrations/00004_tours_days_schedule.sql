-- ═══════════════════════════════════════════════════════════════════
-- 00004 — Faza 1: tours, tour_gear, days, tour_personnel,
--          schedule_items, schedule_templates + RLS. (§3.3, §3.6, §3.9)
-- ═══════════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────────────────────
-- tours [C] + toggles v1.1 [C-S]
-- ───────────────────────────────────────────────────────────────────
create table public.tours (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  deleted_at timestamptz,
  organization_id uuid not null references public.organizations on delete cascade,
  name text not null,
  start_date date,
  end_date date,
  is_archived boolean not null default false,      -- [C-S] tourArchived?
  visible_on_mobile boolean not null default true, -- [C-S] tourVisibleMobile?
  created_by uuid references auth.users
);

create trigger set_updated_at before update on public.tours
  for each row execute function public.set_updated_at();

create index tours_org_idx on public.tours (organization_id);

-- Tour Gear — modul v1.1 [C-S ecran 54]
create table public.tour_gear (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  deleted_at timestamptz,
  tour_id uuid not null references public.tours on delete cascade,
  name text not null,
  details jsonb not null default '{}',  -- [D] câmpurile interne nevăzute (ecran gol)
  notes text
);

create trigger set_updated_at before update on public.tour_gear
  for each row execute function public.set_updated_at();

create index tour_gear_tour_idx on public.tour_gear (tour_id);

-- ───────────────────────────────────────────────────────────────────
-- days + day_type [C] (lista completă §3.3; 'new' = default la creare)
-- ───────────────────────────────────────────────────────────────────
create type public.day_type as enum (
  'show','travel','day_off','rehearsal','promo','production',
  'home','studio','load_in','writing','new'
);

create table public.days (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  deleted_at timestamptz,
  tour_id uuid not null references public.tours on delete cascade,
  date date not null,
  day_type public.day_type not null default 'new',
  city text, state text, country text,
  lat double precision, lng double precision,
  timezone text,                    -- IANA, ex 'Europe/Bucharest'
  general_notes text,               -- [C] API: generalNotes
  travel_notes text,                -- [C] API: travelNotes
  hotel_notes text,                 -- [C] API: hotelNotes
  unique (tour_id, date)
);

create trigger set_updated_at before update on public.days
  for each row execute function public.set_updated_at();

create index days_tour_date_idx on public.days (tour_id, date);

-- ───────────────────────────────────────────────────────────────────
-- tour_personnel — crew-ul turului, DISTINCT de users. [C]
-- Inventar v1.1 [C-S ecrane 55/56/58/62].
-- ───────────────────────────────────────────────────────────────────
create table public.tour_personnel (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  deleted_at timestamptz,
  tour_id uuid not null references public.tours on delete cascade,
  user_id uuid references auth.users,   -- null dacă nu are cont
  contact_id uuid,  -- FK către contacts adăugat în Faza 5 (tabelul nu există încă)
  first_name text, last_name text,
  preferred_name text, stage_name text,   -- [C-S]
  role text, title text,                  -- [C-S] coloane separate
  company text,                           -- [C-S]
  phones jsonb not null default '[]',
  emails jsonb not null default '[]',
  urls jsonb not null default '[]',
  address jsonb not null default '{}',
  bag_tag text,                           -- [C-S]
  party text,                             -- [C] party badges
  notes text,
  personnel_details jsonb not null default '{}',   -- gender, birthday, nationality…
  travel_preferences jsonb not null default '{}',  -- bunk, flight seat, ff_info…
  emergency_contact jsonb not null default '{}',
  diet jsonb not null default '{}',
  family jsonb not null default '{}',
  swag_sizes jsonb not null default '{}',
  sort_order integer not null default 0
);

create trigger set_updated_at before update on public.tour_personnel
  for each row execute function public.set_updated_at();

create index tour_personnel_tour_idx on public.tour_personnel (tour_id);

-- ───────────────────────────────────────────────────────────────────
-- schedule_items [C §3.6] + publicity
-- ───────────────────────────────────────────────────────────────────
create type public.schedule_item_type as enum ('schedule', 'publicity');

create table public.schedule_items (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  deleted_at timestamptz,
  day_id uuid not null references public.days on delete cascade,
  item_type public.schedule_item_type not null default 'schedule',
  title text not null,
  details text,
  start_at timestamptz,
  end_at timestamptz,               -- +1 e doar UI: end < start pe ceas ⇒ ziua următoare
  is_confirmed boolean not null default false,   -- [C]
  is_complete boolean not null default false,    -- [C]
  time_priority integer not null default 0,      -- [C] ordonare items fără oră
  publicity_meta jsonb not null default '{}',    -- [D] outlet, contact, tip apariție
  sort_order integer not null default 0,
  updated_by uuid references auth.users
);

create trigger set_updated_at before update on public.schedule_items
  for each row execute function public.set_updated_at();

create index schedule_items_day_idx on public.schedule_items (day_id, start_at);

-- ───────────────────────────────────────────────────────────────────
-- schedule_templates [C] — itemi cu ore relative la zi
-- ───────────────────────────────────────────────────────────────────
create table public.schedule_templates (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  deleted_at timestamptz,
  organization_id uuid not null references public.organizations on delete cascade,
  name text not null,
  items jsonb not null default '[]'
  -- [{"title":"Load-in","offset_min":600,"duration_min":120,"type":"schedule"}, …]
);

create trigger set_updated_at before update on public.schedule_templates
  for each row execute function public.set_updated_at();

create index schedule_templates_org_idx on public.schedule_templates (organization_id);

-- ═══════════════════════════════════════════════════════════════════
-- Helpers de acces reutilizabili (baza TUTUROR politicilor de conținut
-- de tur din fazele următoare — §5.2: o singură implementare)
-- ═══════════════════════════════════════════════════════════════════

create or replace function private.tour_org(tour uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select t.organization_id from public.tours t where t.id = tour;
$$;

-- Membru al org-ului + turul vizibil pentru user (§5.1 reg. 1–3) + nesters.
create or replace function private.can_access_tour(tour uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.tours t
    where t.id = tour
      and t.deleted_at is null
      and private.is_org_member(t.organization_id)
      and private.can_see_subject(t.organization_id, 'tour', t.id)
  );
$$;

-- Acces pe zi: tur accesibil + visibility la nivel de zi [C-S v1.1].
create or replace function private.can_access_day(day uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.days d
    where d.id = day
      and d.deleted_at is null
      and private.can_access_tour(d.tour_id)
      and private.can_see_subject(private.tour_org(d.tour_id), 'day', d.id)
  );
$$;

-- Poate edita conținut de tur: manager+ ȘI cont pro (§4.2 ✔*).
create or replace function private.can_edit_tour_content(org uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.has_min_permission(org, 'manager') and private.is_pro();
$$;

grant execute on all functions in schema private to authenticated;

-- ═══════════════════════════════════════════════════════════════════
-- Politici RLS
-- ═══════════════════════════════════════════════════════════════════

-- tours ─────────────────────────────────────────────────────────────
alter table public.tours enable row level security;

create policy tours_select on public.tours
  for select to authenticated
  using (
    (deleted_at is null or private.can_edit_tour_content(organization_id))
    and private.is_org_member(organization_id)
    and private.can_see_subject(organization_id, 'tour', id)
  );

create policy tours_insert on public.tours
  for insert to authenticated
  with check (private.can_edit_tour_content(organization_id));

create policy tours_update on public.tours
  for update to authenticated
  using (private.can_edit_tour_content(organization_id))
  with check (private.can_edit_tour_content(organization_id));

create policy tours_delete on public.tours
  for delete to authenticated
  using (private.can_edit_tour_content(organization_id));

-- tour_gear ─────────────────────────────────────────────────────────
alter table public.tour_gear enable row level security;

create policy tour_gear_select on public.tour_gear
  for select to authenticated
  using (
    (deleted_at is null or private.can_edit_tour_content(private.tour_org(tour_id)))
    and private.can_access_tour(tour_id)
  );

create policy tour_gear_insert on public.tour_gear
  for insert to authenticated
  with check (private.can_edit_tour_content(private.tour_org(tour_id)));

create policy tour_gear_update on public.tour_gear
  for update to authenticated
  using (private.can_edit_tour_content(private.tour_org(tour_id)))
  with check (private.can_edit_tour_content(private.tour_org(tour_id)));

create policy tour_gear_delete on public.tour_gear
  for delete to authenticated
  using (private.can_edit_tour_content(private.tour_org(tour_id)));

-- days ──────────────────────────────────────────────────────────────
alter table public.days enable row level security;

create policy days_select on public.days
  for select to authenticated
  using (
    (deleted_at is null or private.can_edit_tour_content(private.tour_org(tour_id)))
    and private.can_access_tour(tour_id)
    and private.can_see_subject(private.tour_org(tour_id), 'day', id)
  );

create policy days_insert on public.days
  for insert to authenticated
  with check (private.can_edit_tour_content(private.tour_org(tour_id)));

create policy days_update on public.days
  for update to authenticated
  using (private.can_edit_tour_content(private.tour_org(tour_id)))
  with check (private.can_edit_tour_content(private.tour_org(tour_id)));

create policy days_delete on public.days
  for delete to authenticated
  using (private.can_edit_tour_content(private.tour_org(tour_id)));

-- tour_personnel ────────────────────────────────────────────────────
alter table public.tour_personnel enable row level security;

create policy tour_personnel_select on public.tour_personnel
  for select to authenticated
  using (
    (deleted_at is null or private.can_edit_tour_content(private.tour_org(tour_id)))
    and private.can_access_tour(tour_id)
    and private.can_see_subject(private.tour_org(tour_id), 'tour_personnel', id)
  );

create policy tour_personnel_insert on public.tour_personnel
  for insert to authenticated
  with check (private.can_edit_tour_content(private.tour_org(tour_id)));

create policy tour_personnel_update on public.tour_personnel
  for update to authenticated
  using (private.can_edit_tour_content(private.tour_org(tour_id)))
  with check (private.can_edit_tour_content(private.tour_org(tour_id)));

create policy tour_personnel_delete on public.tour_personnel
  for delete to authenticated
  using (private.can_edit_tour_content(private.tour_org(tour_id)));

-- schedule_items ────────────────────────────────────────────────────
-- Pattern-ul exact din §5.2: tur vizibil + zi vizibilă + item vizibil.
alter table public.schedule_items enable row level security;

create policy schedule_items_select on public.schedule_items
  for select to authenticated
  using (
    (deleted_at is null
     or exists (select 1 from public.days d where d.id = schedule_items.day_id
                and private.can_edit_tour_content(private.tour_org(d.tour_id))))
    and private.can_access_day(day_id)
    and exists (
      select 1 from public.days d
      where d.id = schedule_items.day_id
        and private.can_see_subject(
              private.tour_org(d.tour_id), 'schedule_item', schedule_items.id)
    )
  );

create policy schedule_items_insert on public.schedule_items
  for insert to authenticated
  with check (
    exists (
      select 1 from public.days d
      where d.id = schedule_items.day_id
        and private.can_edit_tour_content(private.tour_org(d.tour_id))
    )
  );

create policy schedule_items_update on public.schedule_items
  for update to authenticated
  using (
    exists (
      select 1 from public.days d
      where d.id = schedule_items.day_id
        and private.can_edit_tour_content(private.tour_org(d.tour_id))
    )
  )
  with check (
    exists (
      select 1 from public.days d
      where d.id = schedule_items.day_id
        and private.can_edit_tour_content(private.tour_org(d.tour_id))
    )
  );

create policy schedule_items_delete on public.schedule_items
  for delete to authenticated
  using (
    exists (
      select 1 from public.days d
      where d.id = schedule_items.day_id
        and private.can_edit_tour_content(private.tour_org(d.tour_id))
    )
  );

-- schedule_templates ────────────────────────────────────────────────
alter table public.schedule_templates enable row level security;

create policy schedule_templates_select on public.schedule_templates
  for select to authenticated
  using (
    (deleted_at is null or private.can_edit_tour_content(organization_id))
    and private.is_org_member(organization_id)
  );

create policy schedule_templates_insert on public.schedule_templates
  for insert to authenticated
  with check (private.can_edit_tour_content(organization_id));

create policy schedule_templates_update on public.schedule_templates
  for update to authenticated
  using (private.can_edit_tour_content(organization_id))
  with check (private.can_edit_tour_content(organization_id));

create policy schedule_templates_delete on public.schedule_templates
  for delete to authenticated
  using (private.can_edit_tour_content(organization_id));
