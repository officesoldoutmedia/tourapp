-- ═══════════════════════════════════════════════════════════════════
-- Faza 9 — Entitatea Artist (roster). Spec:
-- docs/superpowers/specs/2026-08-04-artist-entity-design.md
-- ═══════════════════════════════════════════════════════════════════

-- ── artists ─────────────────────────────────────────────────────────
create table public.artists (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  deleted_at timestamptz,
  organization_id uuid not null references public.organizations on delete cascade,
  name text not null,
  slug text not null,
  legal_name text,                 -- entitatea juridică (pt. contracte, §13 Zola)
  photo_path text,                 -- Storage: {orgId}/artists/{artistId}/photo-…
  home_base_city text,             -- punct de plecare pt. calcul km (sub-proiect 3)
  home_base_lat numeric,
  home_base_lng numeric,
  default_currency text,
  timezone text,
  color text,                      -- culoarea artistului în calendar (§2.4 Zola)
  links jsonb not null default '{}'::jsonb,  -- {spotify, instagram, youtube, website}
  is_archived boolean not null default false,
  created_by uuid references auth.users,
  unique (organization_id, slug)
);

create index artists_org_idx on public.artists (organization_id);

create trigger set_updated_at before update on public.artists
  for each row execute function public.set_updated_at();

-- ── RLS pe artists (oglindește politicile de pe tours) ──────────────
alter table public.artists enable row level security;

create policy artists_select on public.artists
  for select to authenticated
  using (
    (deleted_at is null or private.can_edit_tour_content(organization_id))
    and private.is_org_member(organization_id)
    and private.can_see_subject(organization_id, 'artist', id)
  );

create policy artists_insert on public.artists
  for insert to authenticated
  with check (private.can_edit_tour_content(organization_id));

create policy artists_update on public.artists
  for update to authenticated
  using (private.can_edit_tour_content(organization_id))
  with check (private.can_edit_tour_content(organization_id));

create policy artists_delete on public.artists
  for delete to authenticated
  using (private.can_edit_tour_content(organization_id));

-- ── tours.artist_id + backfill ──────────────────────────────────────
-- on delete restrict: un artist cu tururi nu se șterge — se arhivează.
alter table public.tours
  add column artist_id uuid references public.artists on delete restrict;

create index tours_artist_idx on public.tours (artist_id);

-- Backfill: un artist per org care are tururi, numit după org.
-- Post-deploy se redenumește din UI (vezi spec §4).
insert into public.artists (organization_id, name, slug, created_by)
select o.id, o.name, o.slug, null
from public.organizations o
where exists (select 1 from public.tours t where t.organization_id = o.id);

update public.tours t
set artist_id = a.id
from public.artists a
where a.organization_id = t.organization_id
  and t.artist_id is null;

alter table public.tours alter column artist_id set not null;

-- ── Cascada: vizibilitatea artistului intră în lanțul turului ───────
-- Punct unic de aplicare (spec §2): can_access_tour e folosit de toate
-- politicile copiilor (days, travel, hotels, …), deci restricția pe
-- artist cascadează automat, inclusiv în feed-urile iCal.
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
      and private.can_see_subject(t.organization_id, 'artist', t.artist_id)
  );
$$;

drop policy tours_select on public.tours;
create policy tours_select on public.tours
  for select to authenticated
  using (
    (deleted_at is null or private.can_edit_tour_content(organization_id))
    and private.is_org_member(organization_id)
    and private.can_see_subject(organization_id, 'tour', id)
    and private.can_see_subject(organization_id, 'artist', artist_id)
  );

-- ── iCal feed: aceeași cascadă, fără sesiune (uid explicit) ──────────
-- ical_feed() nu delegă la can_access_tour (rulează sub service_role,
-- fără auth.uid()) — are propria implementare cu can_see_subject_for.
-- O redefinim identic cu 00011, adăugând verificarea de vizibilitate
-- a artistului, ca să rămână sincronizată cu cascada de mai sus.
create or replace function public.ical_feed(feed_token uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  uid uuid;
begin
  select t.user_id into uid
  from public.ical_tokens t
  where t.token = feed_token and t.revoked_at is null;
  if uid is null then
    return null;
  end if;

  return coalesce((
    select jsonb_agg(day_obj order by day_obj->>'date')
    from (
      select jsonb_build_object(
        'date', d.date,
        'day_type', d.day_type,
        'city', d.city,
        'country', d.country,
        'timezone', d.timezone,
        'general_notes', d.general_notes,
        'tour', t.name,
        'venues', coalesce((
          select jsonb_agg(v.name)
          from public.events e join public.venues v on v.id = e.venue_id
          where e.day_id = d.id and e.deleted_at is null
        ), '[]'::jsonb),
        'hotels', coalesce((
          select jsonb_agg(h.name order by h.sort_order)
          from public.day_hotels h
          where h.day_id = d.id and h.deleted_at is null
            and private.can_see_subject_for(uid, t.organization_id, 'day_hotel', h.id)
        ), '[]'::jsonb),
        'schedule', coalesce((
          select jsonb_agg(jsonb_build_object(
            'title', si.title, 'start_at', si.start_at, 'end_at', si.end_at
          ) order by si.start_at)
          from public.schedule_items si
          where si.day_id = d.id and si.deleted_at is null
            and private.can_see_subject_for(uid, t.organization_id, 'schedule_item', si.id)
        ), '[]'::jsonb),
        'travel', coalesce((
          select jsonb_agg(jsonb_build_object(
            'title', tr.title,
            'depart_time', tr.depart_time, 'arrive_time', tr.arrive_time,
            'depart_day_offset', tr.depart_day_offset,
            'arrive_day_offset', tr.arrive_day_offset
          ) order by tr.depart_time)
          from public.travel_items tr
          where tr.day_id = d.id and tr.deleted_at is null
            and private.can_see_subject_for(uid, t.organization_id, 'travel_item', tr.id)
        ), '[]'::jsonb)
      ) as day_obj
      from public.days d
      join public.tours t on t.id = d.tour_id
      where d.deleted_at is null
        and t.deleted_at is null
        and private.is_org_member_for(uid, t.organization_id)
        and private.can_see_subject_for(uid, t.organization_id, 'tour', t.id)
        and private.can_see_subject_for(uid, t.organization_id, 'day', d.id)
        and private.can_see_subject_for(uid, t.organization_id, 'artist', t.artist_id)
    ) sub
  ), '[]'::jsonb);
end;
$$;

grant execute on all functions in schema private to authenticated;
