-- ═══════════════════════════════════════════════════════════════════
-- 00008 — Faza 3: travel_items, flight_legs, travel_passengers,
--          day_hotels, hotel_key_contacts, room_list_entries. (§3.7)
-- ═══════════════════════════════════════════════════════════════════

create type public.travel_type as enum ('ground', 'air', 'rail', 'sea');  -- [C]

create table public.travel_items (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  deleted_at timestamptz,
  day_id uuid not null references public.days on delete cascade,
  travel_type public.travel_type not null default 'ground',  -- [C] ground default
  title text,
  auto_title boolean not null default true,      -- [C-S] AUTOTITLE|CUSTOMTITLE
  is_confirmed boolean not null default false,   -- [C-S] CONFIRMED|UNCONFIRMED
  party text,                                    -- [C-S] badge PARTY
  origin_label text, origin_address text,
  origin_lat double precision, origin_lng double precision,
  dest_label text, dest_address text,
  dest_lat double precision, dest_lng double precision,
  origin_ref_type text, origin_ref_id uuid,      -- [C-S] pin-picker venue/hotel
  dest_ref_type text,   dest_ref_id uuid,
  depart_time time, depart_day_offset integer not null default 0,  -- [C-S] DAYOF|DAYAFTER
  arrive_time time, arrive_day_offset integer not null default 0,
  depart_tz text, arrive_tz text,                -- [C-S] TIMEZONE pe ambele capete
  distance numeric,
  distance_unit text not null default 'kilometers',  -- [C-S] miles|kilometers
  duration_min integer,                          -- [C-S] TRAVELTIME auto
  eta text,                                      -- [C-S]
  display_time_as text not null default 'exact', -- [C-S] DISPLAYTIMEAS
  detail text,                                   -- [C-S] DETAIL în Summary
  -- Câmpuri RAIL [C-S ecran 19] (aplicabile și sea/ground unde are sens):
  ticket_status text, rail_line text, train_number text,
  ticket_price numeric, confirmation_number text,
  sort_order integer not null default 0,
  updated_by uuid references auth.users
);

create trigger set_updated_at before update on public.travel_items
  for each row execute function public.set_updated_at();

create index travel_items_day_idx on public.travel_items (day_id);

-- Zboruri: un travel_item 'air' are 1..n LEGS. [C]
create table public.flight_legs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  travel_item_id uuid not null references public.travel_items on delete cascade,
  leg_index integer not null default 0,
  airline text, flight_number text,              -- [C] cheia de căutare
  dep_airport_iata text, arr_airport_iata text,
  scheduled_dep timestamptz, scheduled_arr timestamptz,
  actual_dep timestamptz, actual_arr timestamptz,
  terminal_dep text, gate_dep text, terminal_arr text, gate_arr text,  -- [C]
  status text,                                   -- [C] live status (Faza 2 provider)
  raw_provider_data jsonb not null default '{}'
);

create trigger set_updated_at before update on public.flight_legs
  for each row execute function public.set_updated_at();

create index flight_legs_item_idx on public.flight_legs (travel_item_id, leg_index);

-- Passengers pe travel [D §3.7]
create table public.travel_passengers (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  travel_item_id uuid not null references public.travel_items on delete cascade,
  personnel_id uuid not null references public.tour_personnel on delete cascade,
  unique (travel_item_id, personnel_id)
);

-- ───────────────────────────────────────────────────────────────────
-- Hoteluri per zi [C §6.8] + v1.1 [C-S]
-- ───────────────────────────────────────────────────────────────────
create table public.day_hotels (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  deleted_at timestamptz,
  day_id uuid not null references public.days on delete cascade,
  name text not null,
  address_line1 text, address_line2 text, city text, state text,
  postal_code text, country text,
  lat double precision, lng double precision,        -- [C-S] editabile
  phones jsonb not null default '[]',                -- [C-S] {number,label}
  emails jsonb not null default '[]',
  urls jsonb not null default '[]',
  google_place_id text,
  source text not null default 'manual',
  party text,                                        -- [C-S]
  check_in_time time, check_out_time time,           -- [C-S] ORE pe record
  check_in_date date, check_out_date date,           -- [C] DATE din Add Hotel
  notes text,
  -- [C-S] Bloc FACILITIES (ecran 17): restaurant, lounge, room_service,
  -- bus_parking, dist_to_venue, distance_to_airport, internet, cable,
  -- health_facilities, laundry, rate
  facilities jsonb not null default '{}',
  sort_order integer not null default 0,             -- [C] drag&drop
  stay_group_id uuid,                                -- [C] extend-stay/unlink
  updated_by uuid references auth.users
);

create trigger set_updated_at before update on public.day_hotels
  for each row execute function public.set_updated_at();

create index day_hotels_day_idx on public.day_hotels (day_id, sort_order);
create index day_hotels_stay_group_idx on public.day_hotels (stay_group_id);

-- Key Contacts pe hotel [C-S]
create table public.hotel_key_contacts (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  day_hotel_id uuid not null references public.day_hotels on delete cascade,
  contact_id uuid,     -- FK către contacts în Faza 5
  role text,
  sort_order integer not null default 0
);

create index hotel_key_contacts_hotel_idx on public.hotel_key_contacts (day_hotel_id);

-- Room list [C §6.8] + v1.1 [C-S ecran 15]
create table public.room_list_entries (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  deleted_at timestamptz,
  day_hotel_id uuid not null references public.day_hotels on delete cascade,
  personnel_id uuid references public.tour_personnel,
  guest_name text,                            -- fallback fără personnel
  bag_tag text,                               -- [C-S] BAGTAG
  room_number text,                           -- [C-S] ROOM #
  room_type text,                             -- [C-S] TYPE dropdown
  smoking boolean not null default false,     -- [C-S] nonSmoking|smoking
  check_in date, check_out date,              -- [C-S]
  confirmation_number text,                   -- [C-S] CONF
  notes text,
  sort_order integer not null default 0
);

create trigger set_updated_at before update on public.room_list_entries
  for each row execute function public.set_updated_at();

create index room_list_entries_hotel_idx on public.room_list_entries (day_hotel_id);

-- ═══════════════════════════════════════════════════════════════════
-- RLS — pattern §5.2 (visibility per travel item și per hotel [C])
-- ═══════════════════════════════════════════════════════════════════

create or replace function private.day_org(day uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select private.tour_org(d.tour_id) from public.days d where d.id = day;
$$;

create or replace function private.can_edit_day(day uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.can_edit_tour_content(private.day_org(day));
$$;

grant execute on all functions in schema private to authenticated;

-- travel_items ──────────────────────────────────────────────────────
alter table public.travel_items enable row level security;

create policy travel_items_select on public.travel_items
  for select to authenticated
  using (
    (deleted_at is null or private.can_edit_day(day_id))
    and private.can_access_day(day_id)
    and private.can_see_subject(private.day_org(day_id), 'travel_item', id)
  );

create policy travel_items_insert on public.travel_items
  for insert to authenticated
  with check (private.can_edit_day(day_id));

create policy travel_items_update on public.travel_items
  for update to authenticated
  using (private.can_edit_day(day_id))
  with check (private.can_edit_day(day_id));

create policy travel_items_delete on public.travel_items
  for delete to authenticated
  using (private.can_edit_day(day_id));

-- flight_legs / travel_passengers: urmează travel item-ul ─────────────
alter table public.flight_legs enable row level security;

create policy flight_legs_select on public.flight_legs
  for select to authenticated
  using (
    exists (
      select 1 from public.travel_items t
      where t.id = travel_item_id
        and private.can_access_day(t.day_id)
        and private.can_see_subject(private.day_org(t.day_id), 'travel_item', t.id)
    )
  );

create policy flight_legs_insert on public.flight_legs
  for insert to authenticated
  with check (
    exists (select 1 from public.travel_items t
            where t.id = travel_item_id and private.can_edit_day(t.day_id))
  );

create policy flight_legs_update on public.flight_legs
  for update to authenticated
  using (
    exists (select 1 from public.travel_items t
            where t.id = travel_item_id and private.can_edit_day(t.day_id))
  )
  with check (
    exists (select 1 from public.travel_items t
            where t.id = travel_item_id and private.can_edit_day(t.day_id))
  );

create policy flight_legs_delete on public.flight_legs
  for delete to authenticated
  using (
    exists (select 1 from public.travel_items t
            where t.id = travel_item_id and private.can_edit_day(t.day_id))
  );

alter table public.travel_passengers enable row level security;

create policy travel_passengers_select on public.travel_passengers
  for select to authenticated
  using (
    exists (
      select 1 from public.travel_items t
      where t.id = travel_item_id
        and private.can_access_day(t.day_id)
        and private.can_see_subject(private.day_org(t.day_id), 'travel_item', t.id)
    )
  );

create policy travel_passengers_insert on public.travel_passengers
  for insert to authenticated
  with check (
    exists (select 1 from public.travel_items t
            where t.id = travel_item_id and private.can_edit_day(t.day_id))
  );

create policy travel_passengers_delete on public.travel_passengers
  for delete to authenticated
  using (
    exists (select 1 from public.travel_items t
            where t.id = travel_item_id and private.can_edit_day(t.day_id))
  );

-- day_hotels ────────────────────────────────────────────────────────
alter table public.day_hotels enable row level security;

create policy day_hotels_select on public.day_hotels
  for select to authenticated
  using (
    (deleted_at is null or private.can_edit_day(day_id))
    and private.can_access_day(day_id)
    and private.can_see_subject(private.day_org(day_id), 'day_hotel', id)
  );

create policy day_hotels_insert on public.day_hotels
  for insert to authenticated
  with check (private.can_edit_day(day_id));

create policy day_hotels_update on public.day_hotels
  for update to authenticated
  using (private.can_edit_day(day_id))
  with check (private.can_edit_day(day_id));

create policy day_hotels_delete on public.day_hotels
  for delete to authenticated
  using (private.can_edit_day(day_id));

-- hotel_key_contacts / room_list_entries: urmează hotelul ────────────
alter table public.hotel_key_contacts enable row level security;

create policy hotel_key_contacts_select on public.hotel_key_contacts
  for select to authenticated
  using (
    exists (
      select 1 from public.day_hotels h
      where h.id = day_hotel_id
        and private.can_access_day(h.day_id)
        and private.can_see_subject(private.day_org(h.day_id), 'day_hotel', h.id)
    )
  );

create policy hotel_key_contacts_insert on public.hotel_key_contacts
  for insert to authenticated
  with check (
    exists (select 1 from public.day_hotels h
            where h.id = day_hotel_id and private.can_edit_day(h.day_id))
  );

create policy hotel_key_contacts_update on public.hotel_key_contacts
  for update to authenticated
  using (
    exists (select 1 from public.day_hotels h
            where h.id = day_hotel_id and private.can_edit_day(h.day_id))
  )
  with check (
    exists (select 1 from public.day_hotels h
            where h.id = day_hotel_id and private.can_edit_day(h.day_id))
  );

create policy hotel_key_contacts_delete on public.hotel_key_contacts
  for delete to authenticated
  using (
    exists (select 1 from public.day_hotels h
            where h.id = day_hotel_id and private.can_edit_day(h.day_id))
  );

alter table public.room_list_entries enable row level security;

create policy room_list_select on public.room_list_entries
  for select to authenticated
  using (
    deleted_at is null
    and exists (
      select 1 from public.day_hotels h
      where h.id = day_hotel_id
        and private.can_access_day(h.day_id)
        and private.can_see_subject(private.day_org(h.day_id), 'day_hotel', h.id)
    )
  );

create policy room_list_insert on public.room_list_entries
  for insert to authenticated
  with check (
    exists (select 1 from public.day_hotels h
            where h.id = day_hotel_id and private.can_edit_day(h.day_id))
  );

create policy room_list_update on public.room_list_entries
  for update to authenticated
  using (
    exists (select 1 from public.day_hotels h
            where h.id = day_hotel_id and private.can_edit_day(h.day_id))
  )
  with check (
    exists (select 1 from public.day_hotels h
            where h.id = day_hotel_id and private.can_edit_day(h.day_id))
  );

create policy room_list_delete on public.room_list_entries
  for delete to authenticated
  using (
    exists (select 1 from public.day_hotels h
            where h.id = day_hotel_id and private.can_edit_day(h.day_id))
  );

-- Realtime
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.travel_items;
    alter publication supabase_realtime add table public.day_hotels;
    alter publication supabase_realtime add table public.room_list_entries;
  end if;
end $$;
