-- ═══════════════════════════════════════════════════════════════════
-- 00033 — Contract automation (C3, feedback Zola §13): registru juridic
-- org-level, entități emitente, template-uri de contract cu merge
-- fields și documente generate cu snapshot imutabil. Subsistem SEPARAT
-- de payment_annexes (plățile batch rămân neatinse).
-- ═══════════════════════════════════════════════════════════════════

create table public.crew_entities (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  deleted_at timestamptz,
  organization_id uuid not null references public.organizations on delete cascade,
  entity_type text not null default 'srl'
    check (entity_type in ('srl','pfa','ii','individual','foreign')),
  display_name text not null,
  company_name text,
  cui text,
  reg_com text,
  address text,
  representative text,
  iban text,
  bank text,
  vat_payer boolean not null default false,
  fiscal_country text not null default 'RO',
  id_document text,
  default_rate numeric,
  rate_unit text not null default 'per_show' check (rate_unit in ('per_show','per_day')),
  rate_currency text not null default 'EUR',
  payment_terms_days integer,
  doc_language text not null default 'ro' check (doc_language in ('ro','en','bi')),
  created_by uuid references auth.users
);
create index crew_entities_org_idx on public.crew_entities (organization_id);

alter table public.tour_personnel
  add column crew_entity_id uuid references public.crew_entities on delete set null;

create table public.issuing_entities (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  deleted_at timestamptz,
  organization_id uuid not null references public.organizations on delete cascade,
  name text not null,
  cui text,
  reg_com text,
  address text,
  iban text,
  bank text,
  representative text,
  is_default boolean not null default false
);
create index issuing_entities_org_idx on public.issuing_entities (organization_id);

create table public.contract_templates (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  deleted_at timestamptz,
  organization_id uuid not null references public.organizations on delete cascade,
  name text not null,
  doc_kind text not null default 'annex' check (doc_kind in ('framework','annex')),
  body jsonb not null default '[]',
  match_role text,
  match_entity_type text
    check (match_entity_type in ('srl','pfa','ii','individual','foreign')),
  issuing_entity_id uuid references public.issuing_entities on delete set null,
  series_prefix text not null default '',
  series_next integer not null default 1,
  sort_order integer not null default 0
);
create index contract_templates_org_idx on public.contract_templates (organization_id);

create table public.contract_documents (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  deleted_at timestamptz,
  organization_id uuid not null references public.organizations on delete cascade,
  kind text not null check (kind in ('framework','annex')),
  crew_entity_id uuid not null references public.crew_entities on delete cascade,
  template_id uuid references public.contract_templates on delete set null,
  issuing_entity_id uuid references public.issuing_entities on delete set null,
  event_id uuid references public.events on delete set null,
  doc_number text not null,
  merge_snapshot jsonb not null default '{}',
  status text not null default 'generated'
    check (status in ('generated','sent','signed','void')),
  valid_until date,
  signed_storage_path text,
  created_by uuid references auth.users
);
create index contract_documents_entity_idx on public.contract_documents (crew_entity_id);
create index contract_documents_event_idx on public.contract_documents (event_id);
create unique index contract_documents_number_key
  on public.contract_documents (organization_id, doc_number)
  where deleted_at is null;
-- anti-dublură: o singură anexă vie per (entitate, event)
create unique index contract_documents_annex_key
  on public.contract_documents (crew_entity_id, event_id)
  where kind = 'annex' and status <> 'void' and deleted_at is null;

-- seed: prima entitate emitentă din billing-ul existent al org-ului
insert into public.issuing_entities
  (organization_id, name, cui, reg_com, address, iban, bank, representative, is_default)
select o.id,
  coalesce(nullif(o.settings->'billing'->>'name',''), o.name),
  nullif(o.settings->'billing'->>'cui',''),
  nullif(o.settings->'billing'->>'reg_com',''),
  nullif(o.settings->'billing'->>'address',''),
  nullif(o.settings->'billing'->>'iban',''),
  nullif(o.settings->'billing'->>'bank',''),
  nullif(o.settings->'billing'->>'representative',''),
  true
from public.organizations o
where o.settings ? 'billing'
  and coalesce(nullif(o.settings->'billing'->>'name',''), '') <> '';

-- ── RLS ──
alter table public.crew_entities enable row level security;
alter table public.issuing_entities enable row level security;
alter table public.contract_templates enable row level security;
alter table public.contract_documents enable row level security;

-- date financiare → admin/accounting (pattern 00020)
create policy crew_entities_all on public.crew_entities for all
  using (private.has_min_permission(organization_id, 'accounting') and private.is_pro())
  with check (private.has_min_permission(organization_id, 'accounting') and private.is_pro());

create policy contract_documents_all on public.contract_documents for all
  using (private.has_min_permission(organization_id, 'accounting') and private.is_pro())
  with check (private.has_min_permission(organization_id, 'accounting') and private.is_pro());

-- emitenți + template-uri: citire membri, scriere editori de conținut
create policy issuing_entities_select on public.issuing_entities for select
  using (private.is_org_member(organization_id));
create policy issuing_entities_write on public.issuing_entities
  for all using (private.can_edit_tour_content(organization_id))
  with check (private.can_edit_tour_content(organization_id));

create policy contract_templates_select on public.contract_templates for select
  using (private.is_org_member(organization_id));
create policy contract_templates_write on public.contract_templates
  for all using (private.can_edit_tour_content(organization_id))
  with check (private.can_edit_tour_content(organization_id));

comment on table public.contract_documents is
  'C3: documente juridice generate (cadru/anexă). merge_snapshot = tot ce s-a umplut la emitere; PDF-ul se randează EXCLUSIV din snapshot. doc_number imutabil.';
