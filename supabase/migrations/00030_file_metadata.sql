-- ═══════════════════════════════════════════════════════════════════
-- SP3b — file metadata + advancing automat. Spec:
-- docs/superpowers/specs/2026-08-06-file-metadata-advancing-design.md
-- ═══════════════════════════════════════════════════════════════════

-- ── file_categories (org-level, ca groups/songs) ────────────────────
create table public.file_categories (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  deleted_at timestamptz,
  organization_id uuid not null references public.organizations on delete cascade,
  name text not null,
  is_required boolean not null default false,  -- intră în advancing % (spec §2)
  sort_order integer not null default 0,
  created_by uuid references auth.users
);
create index file_categories_org_idx on public.file_categories (organization_id);
create trigger set_updated_at before update on public.file_categories
  for each row execute function public.set_updated_at();

alter table public.file_categories enable row level security;

create policy file_categories_select on public.file_categories
  for select to authenticated
  using (
    (deleted_at is null or private.can_edit_tour_content(organization_id))
    and private.is_org_member(organization_id)
  );
create policy file_categories_insert on public.file_categories
  for insert to authenticated
  with check (private.can_edit_tour_content(organization_id));
create policy file_categories_update on public.file_categories
  for update to authenticated
  using (private.can_edit_tour_content(organization_id))
  with check (private.can_edit_tour_content(organization_id));
create policy file_categories_delete on public.file_categories
  for delete to authenticated
  using (private.can_edit_tour_content(organization_id));

-- ── Seed: lista Zola §10.2, pentru fiecare org existent ─────────────
insert into public.file_categories (organization_id, name, sort_order)
select o.id, c.name, c.ord
from public.organizations o
cross join (values
  ('Show files', 0), ('Video / VJ', 1), ('Lighting', 2), ('SFX', 3),
  ('Technical', 4), ('Hospitality', 5), ('Admin', 6), ('Post-show', 7)
) as c(name, ord);

-- Seed-ul de mai sus acoperă doar org-urile existente la data migrării;
-- org-urile create ulterior primesc aceeași listă la creare (create_organization).
create or replace function public.seed_org_file_categories()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.file_categories (organization_id, name, sort_order)
  values
    (new.id, 'Show files', 0), (new.id, 'Video / VJ', 1), (new.id, 'Lighting', 2),
    (new.id, 'SFX', 3), (new.id, 'Technical', 4), (new.id, 'Hospitality', 5),
    (new.id, 'Admin', 6), (new.id, 'Post-show', 7);
  return new;
end;
$$;

create trigger seed_org_file_categories
  after insert on public.organizations
  for each row execute function public.seed_org_file_categories();

-- ── Metadata pe attachments ─────────────────────────────────────────
create type public.attachment_status as enum
  ('draft', 'approved', 'final', 'superseded');

alter table public.attachments
  add column category_id uuid references public.file_categories on delete set null,
  add column status public.attachment_status not null default 'draft',
  add column due_date date,
  add column supersedes_id uuid references public.attachments on delete set null;

create index attachments_category_idx on public.attachments (category_id);
create index attachments_supersedes_idx on public.attachments (supersedes_id);

-- Placeholder „fișier așteptat" = rând fără storage_path (spec §1).
alter table public.attachments alter column storage_path drop not null;
