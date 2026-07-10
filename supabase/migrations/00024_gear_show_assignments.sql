-- Gear per show: ce articole din inventarul turului merg la fiecare show.
create table public.gear_show_assignments (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  gear_id uuid not null references public.tour_gear(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade,
  unique (gear_id, event_id)
);

create index gear_show_assignments_gear_idx on public.gear_show_assignments (gear_id);
create index gear_show_assignments_event_idx on public.gear_show_assignments (event_id);

alter table public.gear_show_assignments enable row level security;

create policy "gear_assign_select" on public.gear_show_assignments
  for select to authenticated
  using (
    exists (
      select 1 from public.tour_gear g
      where g.id = gear_id and private.can_access_tour(g.tour_id)
    )
  );

create policy "gear_assign_insert" on public.gear_show_assignments
  for insert to authenticated
  with check (
    exists (
      select 1 from public.tour_gear g
      where g.id = gear_id
        and private.can_edit_tour_content(private.tour_org(g.tour_id))
    )
  );

create policy "gear_assign_delete" on public.gear_show_assignments
  for delete to authenticated
  using (
    exists (
      select 1 from public.tour_gear g
      where g.id = gear_id
        and private.can_edit_tour_content(private.tour_org(g.tour_id))
    )
  );
