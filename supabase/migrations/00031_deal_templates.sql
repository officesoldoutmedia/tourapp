-- ═══════════════════════════════════════════════════════════════════
-- C1 — deal templates per artist. Spec:
-- docs/superpowers/specs/2026-08-07-deal-templates-design.md
-- Snapshot pe event la aplicare — template-ul modificat NU schimbă
-- retroactiv show-urile (regula casei, ca la tour_parties).
-- ═══════════════════════════════════════════════════════════════════

create table public.deal_templates (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  deleted_at timestamptz,
  organization_id uuid not null references public.organizations on delete cascade,
  artist_id uuid not null references public.artists on delete cascade,
  name text not null,
  fee_amount numeric,
  fee_currency text,
  deal_basis text check (deal_basis in ('landed', 'all_in', 'fee_plus_costs')),
  withholding_percent numeric,
  landed_items jsonb not null default '[]'::jsonb,
  accommodation jsonb not null default '{}'::jsonb,
  required_category_ids uuid[] not null default '{}',  -- §10.4, per deal type
  sort_order integer not null default 0,
  created_by uuid references auth.users
);
create index deal_templates_artist_idx on public.deal_templates (artist_id);
create trigger set_updated_at before update on public.deal_templates
  for each row execute function public.set_updated_at();

alter table public.deal_templates enable row level security;

create policy deal_templates_select on public.deal_templates
  for select to authenticated
  using (
    (deleted_at is null or private.can_edit_tour_content(organization_id))
    and private.is_org_member(organization_id)
    and private.can_see_subject(organization_id, 'artist', artist_id)
  );
create policy deal_templates_insert on public.deal_templates
  for insert to authenticated
  with check (
    private.can_edit_tour_content(private.artist_org(artist_id))
    and organization_id = private.artist_org(artist_id)
  );
create policy deal_templates_update on public.deal_templates
  for update to authenticated
  using (private.can_edit_tour_content(private.artist_org(artist_id)))
  with check (
    private.can_edit_tour_content(private.artist_org(artist_id))
    and organization_id = private.artist_org(artist_id)
  );
create policy deal_templates_delete on public.deal_templates
  for delete to authenticated
  using (private.can_edit_tour_content(private.artist_org(artist_id)));

-- ── Snapshot pe event ───────────────────────────────────────────────
alter table public.events
  add column deal_template_id uuid references public.deal_templates on delete set null,
  add column deal_snapshot jsonb;
