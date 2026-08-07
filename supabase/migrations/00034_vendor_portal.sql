-- ═══════════════════════════════════════════════════════════════════
-- 00034 — Vendor portal (C4, feedback Zola §11): link-uri magice per
-- (companie, event) pe pattern-ul share_links (00011), departamentul
-- companiei = categoria de fișiere (SP3b), angajații vendorului în
-- tour_personnel. Publicul trece prin service client (ca la day sheet)
-- — RLS-ul de aici e doar pentru partea de administrare a echipei.
-- ═══════════════════════════════════════════════════════════════════

create table public.vendor_links (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  token uuid not null unique default gen_random_uuid(),
  organization_id uuid not null references public.organizations on delete cascade,
  company_id uuid not null references public.companies on delete cascade,
  event_id uuid not null references public.events on delete cascade,
  expires_at timestamptz not null default now() + interval '30 days',
  revoked_at timestamptz,
  created_by uuid references auth.users
);
create index vendor_links_event_idx on public.vendor_links (event_id);
-- un singur link viu per (companie, show); regenerare = revocă + creează
create unique index vendor_links_live_key
  on public.vendor_links (company_id, event_id)
  where revoked_at is null;

alter table public.companies
  add column file_category_id uuid references public.file_categories on delete set null;
comment on column public.companies.file_category_id is
  'C4: departamentul vendorului — portalul vede/urcă DOAR fișierele acestei categorii.';

alter table public.tour_personnel
  add column company_id uuid references public.companies on delete set null;
comment on column public.tour_personnel.company_id is
  'C4: proveniența angajaților adăugați din portalul de vendor (fără date financiare).';

alter table public.vendor_links enable row level security;
create policy vendor_links_all on public.vendor_links for all
  using (private.can_edit_tour_content(organization_id))
  with check (private.can_edit_tour_content(organization_id));
