-- ═══════════════════════════════════════════════════════════════════
-- 00010 — Faza 5: songs, set lists, tasks, attachments, companies &
--          contacts + FK-urile amânate. (§3.9)
-- ═══════════════════════════════════════════════════════════════════

-- Song Library la nivel de organizație [C]
create table public.songs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  deleted_at timestamptz,
  organization_id uuid not null references public.organizations on delete cascade,
  title text not null,
  length_seconds integer,
  bpm numeric,
  song_key text,
  tech_notes text
);

create trigger set_updated_at before update on public.songs
  for each row execute function public.set_updated_at();

create index songs_org_idx on public.songs (organization_id);

create table public.set_lists (
  event_id uuid primary key references public.events on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);

create trigger set_updated_at before update on public.set_lists
  for each row execute function public.set_updated_at();

create type public.set_item_type as enum ('song', 'break');  -- [C] breaks există

create table public.set_list_items (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  set_list_id uuid not null references public.set_lists (event_id) on delete cascade,
  position integer not null default 0,
  item_type public.set_item_type not null default 'song',
  song_id uuid references public.songs,
  break_label text,
  set_specific_notes text,     -- [C]
  guest_performers text        -- [C]
);

create trigger set_updated_at before update on public.set_list_items
  for each row execute function public.set_updated_at();

create index set_list_items_list_idx on public.set_list_items (set_list_id, position);

-- Tasks [C §6.11] — per tur, opțional legat de o zi
create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  deleted_at timestamptz,
  tour_id uuid not null references public.tours on delete cascade,
  day_id uuid references public.days on delete set null,
  title text not null,
  details text,
  due_at timestamptz,
  is_complete boolean not null default false,
  assigned_to uuid references auth.users,   -- [D]
  created_by uuid references auth.users
);

create trigger set_updated_at before update on public.tasks
  for each row execute function public.set_updated_at();

create index tasks_tour_idx on public.tasks (tour_id, due_at);
create index tasks_day_idx on public.tasks (day_id);

-- Attachments [C]: tour / day / event_accounting / song
create type public.attachment_parent as enum ('tour', 'day', 'event_accounting', 'song');

create table public.attachments (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  deleted_at timestamptz,
  organization_id uuid not null references public.organizations on delete cascade,
  parent_type public.attachment_parent not null,
  parent_id uuid not null,
  file_name text not null,
  storage_path text not null,          -- Supabase Storage, bucket 'attachments'
  mime_type text,
  size_bytes bigint,
  tags text[] not null default '{}',   -- [C]
  uploaded_by uuid references auth.users
);

create trigger set_updated_at before update on public.attachments
  for each row execute function public.set_updated_at();

create index attachments_parent_idx on public.attachments (parent_type, parent_id);

-- Agenda de business [C]
create table public.companies (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  deleted_at timestamptz,
  organization_id uuid not null references public.organizations on delete cascade,
  name text not null,
  kind text,          -- ex 'Travel Agency','Booking','Backline Rental'
  phone text, email text, url text, address text, notes text
);

create trigger set_updated_at before update on public.companies
  for each row execute function public.set_updated_at();

create index companies_org_idx on public.companies (organization_id);

create table public.contacts (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  deleted_at timestamptz,
  organization_id uuid not null references public.organizations on delete cascade,
  company_id uuid references public.companies on delete set null,
  first_name text, last_name text,
  role text, phone text, email text, notes text
);

create trigger set_updated_at before update on public.contacts
  for each row execute function public.set_updated_at();

create index contacts_org_idx on public.contacts (organization_id);

-- FK-urile amânate din fazele 1–3 (contacts nu exista încă atunci)
alter table public.tour_personnel
  add constraint tour_personnel_contact_fk
  foreign key (contact_id) references public.contacts on delete set null;
alter table public.venue_key_contacts
  add constraint venue_key_contacts_contact_fk
  foreign key (contact_id) references public.contacts on delete cascade;
alter table public.hotel_key_contacts
  add constraint hotel_key_contacts_contact_fk
  foreign key (contact_id) references public.contacts on delete cascade;

-- ═══════════════════════════════════════════════════════════════════
-- RLS
-- ═══════════════════════════════════════════════════════════════════

-- songs: org-scoped; editările se propagă în set lists prin referință [C]
alter table public.songs enable row level security;

create policy songs_select on public.songs
  for select to authenticated
  using (
    private.is_org_member(organization_id)
    and (deleted_at is null or private.can_edit_tour_content(organization_id))
  );

create policy songs_insert on public.songs
  for insert to authenticated
  with check (private.can_edit_tour_content(organization_id));

create policy songs_update on public.songs
  for update to authenticated
  using (private.can_edit_tour_content(organization_id))
  with check (private.can_edit_tour_content(organization_id));

create policy songs_delete on public.songs
  for delete to authenticated
  using (private.can_edit_tour_content(organization_id));

-- set_lists / set_list_items: prin event [C]; vizibile mobile_access+ [D §6.10]
alter table public.set_lists enable row level security;

create policy set_lists_select on public.set_lists
  for select to authenticated
  using (private.can_access_event(event_id));

create policy set_lists_insert on public.set_lists
  for insert to authenticated
  with check (private.can_edit_event(event_id));

create policy set_lists_delete on public.set_lists
  for delete to authenticated
  using (private.can_edit_event(event_id));

alter table public.set_list_items enable row level security;

create policy set_list_items_select on public.set_list_items
  for select to authenticated
  using (private.can_access_event(set_list_id));

create policy set_list_items_insert on public.set_list_items
  for insert to authenticated
  with check (private.can_edit_event(set_list_id));

create policy set_list_items_update on public.set_list_items
  for update to authenticated
  using (private.can_edit_event(set_list_id))
  with check (private.can_edit_event(set_list_id));

create policy set_list_items_delete on public.set_list_items
  for delete to authenticated
  using (private.can_edit_event(set_list_id));

-- tasks: tur + visibility [D §5.1.4 — extindem uniform]
alter table public.tasks enable row level security;

create policy tasks_select on public.tasks
  for select to authenticated
  using (
    (deleted_at is null or private.can_edit_tour_content(private.tour_org(tour_id)))
    and private.can_access_tour(tour_id)
    and private.can_see_subject(private.tour_org(tour_id), 'task', id)
  );

create policy tasks_insert on public.tasks
  for insert to authenticated
  with check (private.can_edit_tour_content(private.tour_org(tour_id)));

create policy tasks_update on public.tasks
  for update to authenticated
  using (private.can_edit_tour_content(private.tour_org(tour_id)))
  with check (private.can_edit_tour_content(private.tour_org(tour_id)));

create policy tasks_delete on public.tasks
  for delete to authenticated
  using (private.can_edit_tour_content(private.tour_org(tour_id)));

-- attachments: acces per părinte + visibility per fișier [C]
create or replace function private.can_see_attachment_parent(
  ptype public.attachment_parent,
  pid uuid,
  org uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case ptype
    when 'tour' then private.can_access_tour(pid)
    when 'day' then private.can_access_day(pid)
    -- [C] accounting attachments: DOAR administrator + accounting
    when 'event_accounting' then
      private.can_access_event(pid)
      and private.has_min_permission(org, 'accounting')
    when 'song' then private.is_org_member(org)
  end;
$$;

grant execute on all functions in schema private to authenticated;

alter table public.attachments enable row level security;

create policy attachments_select on public.attachments
  for select to authenticated
  using (
    (deleted_at is null or private.can_edit_tour_content(organization_id))
    and private.is_org_member(organization_id)
    and private.can_see_attachment_parent(parent_type, parent_id, organization_id)
    and private.can_see_subject(organization_id, 'attachment', id)
  );

create policy attachments_insert on public.attachments
  for insert to authenticated
  with check (
    private.can_edit_tour_content(organization_id)
    and (
      parent_type <> 'event_accounting'
      or private.has_min_permission(organization_id, 'accounting')
    )
  );

create policy attachments_update on public.attachments
  for update to authenticated
  using (private.can_edit_tour_content(organization_id))
  with check (private.can_edit_tour_content(organization_id));

create policy attachments_delete on public.attachments
  for delete to authenticated
  using (private.can_edit_tour_content(organization_id));

-- companies / contacts: org-scoped [C]
alter table public.companies enable row level security;

create policy companies_select on public.companies
  for select to authenticated
  using (
    private.is_org_member(organization_id)
    and (deleted_at is null or private.can_edit_tour_content(organization_id))
  );

create policy companies_insert on public.companies
  for insert to authenticated
  with check (private.can_edit_tour_content(organization_id));

create policy companies_update on public.companies
  for update to authenticated
  using (private.can_edit_tour_content(organization_id))
  with check (private.can_edit_tour_content(organization_id));

create policy companies_delete on public.companies
  for delete to authenticated
  using (private.can_edit_tour_content(organization_id));

alter table public.contacts enable row level security;

create policy contacts_select on public.contacts
  for select to authenticated
  using (
    private.is_org_member(organization_id)
    and (deleted_at is null or private.can_edit_tour_content(organization_id))
  );

create policy contacts_insert on public.contacts
  for insert to authenticated
  with check (private.can_edit_tour_content(organization_id));

create policy contacts_update on public.contacts
  for update to authenticated
  using (private.can_edit_tour_content(organization_id))
  with check (private.can_edit_tour_content(organization_id));

create policy contacts_delete on public.contacts
  for delete to authenticated
  using (private.can_edit_tour_content(organization_id));

-- Realtime
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.set_list_items;
    alter publication supabase_realtime add table public.tasks;
    alter publication supabase_realtime add table public.attachments;
  end if;
end $$;

-- ═══════════════════════════════════════════════════════════════════
-- Storage (doar pe stack-ul Supabase; guarded pt Postgres-ul de test)
-- Bucket privat 'attachments'; path: {orgId}/... [N §6.13]
-- ═══════════════════════════════════════════════════════════════════
do $$
begin
  if to_regclass('storage.buckets') is not null then
    insert into storage.buckets (id, name, public, file_size_limit)
    values ('attachments', 'attachments', false, 52428800)  -- 50MB [N]
    on conflict (id) do nothing;

    execute $pol$
      create policy attachments_storage_read on storage.objects
        for select to authenticated
        using (
          bucket_id = 'attachments'
          and private.is_org_member(((storage.foldername(name))[1])::uuid)
        )
    $pol$;
    execute $pol$
      create policy attachments_storage_write on storage.objects
        for insert to authenticated
        with check (
          bucket_id = 'attachments'
          and private.can_edit_tour_content(((storage.foldername(name))[1])::uuid)
        )
    $pol$;
    execute $pol$
      create policy attachments_storage_delete on storage.objects
        for delete to authenticated
        using (
          bucket_id = 'attachments'
          and private.can_edit_tour_content(((storage.foldername(name))[1])::uuid)
        )
    $pol$;
  end if;
end $$;
