-- ═══════════════════════════════════════════════════════════════════
-- SP3a — travel parties ca entitate + rate de cost. Spec:
-- docs/superpowers/specs/2026-08-06-travel-parties-costs-design.md
-- artist_parties = template pe artist; tour_parties = SNAPSHOT per tur
-- (fără FK între ele — modificarea template-ului nu se propagă).
-- ═══════════════════════════════════════════════════════════════════

-- ── artist_parties (template) ───────────────────────────────────────
create table public.artist_parties (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  deleted_at timestamptz,
  organization_id uuid not null references public.organizations on delete cascade,
  artist_id uuid not null references public.artists on delete cascade,
  name text not null,
  per_diem_rate numeric,            -- per persoană per zi; null/0 = fără diurnă
  per_diem_currency text,
  sort_order integer not null default 0,
  created_by uuid references auth.users
);
create index artist_parties_artist_idx on public.artist_parties (artist_id);
create trigger set_updated_at before update on public.artist_parties
  for each row execute function public.set_updated_at();

-- ── tour_parties (snapshot per tur) ─────────────────────────────────
create table public.tour_parties (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  deleted_at timestamptz,
  organization_id uuid not null references public.organizations on delete cascade,
  tour_id uuid not null references public.tours on delete cascade,
  name text not null,
  per_diem_rate numeric,
  per_diem_currency text,
  sort_order integer not null default 0,
  created_by uuid references auth.users
);
create index tour_parties_tour_idx on public.tour_parties (tour_id);
create trigger set_updated_at before update on public.tour_parties
  for each row execute function public.set_updated_at();

-- ── legături + rate ─────────────────────────────────────────────────
alter table public.tour_personnel
  add column party_id uuid references public.tour_parties on delete set null;
create index tour_personnel_party_idx on public.tour_personnel (party_id);

alter table public.artists
  add column ground_rate_per_km numeric,
  add column ground_rate_currency text;

-- Marker stabil pentru liniile de cost generate (upsert, nu duplicare).
alter table public.show_costs add column generated_key text;
create unique index show_costs_generated_uq
  on public.show_costs (event_id, generated_key)
  where generated_key is not null and deleted_at is null;

-- ── Backfill: textele de party existente devin entități per tur ────
insert into public.tour_parties (organization_id, tour_id, name)
select distinct t.organization_id, p.tour_id, p.party
from public.tour_personnel p
join public.tours t on t.id = p.tour_id
where p.party is not null and btrim(p.party) <> '' and p.deleted_at is null;

update public.tour_personnel p
set party_id = tp.id
from public.tour_parties tp
where tp.tour_id = p.tour_id and tp.name = p.party
  and p.party_id is null;

-- ── RLS ─────────────────────────────────────────────────────────────
alter table public.artist_parties enable row level security;

create policy artist_parties_select on public.artist_parties
  for select to authenticated
  using (
    (deleted_at is null or private.can_edit_tour_content(organization_id))
    and private.is_org_member(organization_id)
    and private.can_see_subject(organization_id, 'artist', artist_id)
  );
create policy artist_parties_insert on public.artist_parties
  for insert to authenticated
  with check (private.can_edit_tour_content(organization_id));
create policy artist_parties_update on public.artist_parties
  for update to authenticated
  using (private.can_edit_tour_content(organization_id))
  with check (private.can_edit_tour_content(organization_id));
create policy artist_parties_delete on public.artist_parties
  for delete to authenticated
  using (private.can_edit_tour_content(organization_id));

alter table public.tour_parties enable row level security;

create policy tour_parties_select on public.tour_parties
  for select to authenticated
  using (
    (deleted_at is null or private.can_edit_tour_content(organization_id))
    and private.can_access_tour(tour_id)
  );
create policy tour_parties_insert on public.tour_parties
  for insert to authenticated
  with check (private.can_edit_tour_content(organization_id));
create policy tour_parties_update on public.tour_parties
  for update to authenticated
  using (private.can_edit_tour_content(organization_id))
  with check (private.can_edit_tour_content(organization_id));
create policy tour_parties_delete on public.tour_parties
  for delete to authenticated
  using (private.can_edit_tour_content(organization_id));
