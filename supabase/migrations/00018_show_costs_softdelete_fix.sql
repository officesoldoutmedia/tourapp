-- ═══════════════════════════════════════════════════════════════════
-- 00018 — FIX: soft delete pe show_costs se auto-bloca. Aceeași lecție
-- din Faza 0: politica SELECT cu `deleted_at is null` strict respinge
-- rândul NOU la UPDATE (ExecWithCheckOptions). Editorii de accounting
-- trebuie să poată "vedea" și rândurile șterse (paginile filtrează
-- oricum cu .is('deleted_at', null)).
-- ═══════════════════════════════════════════════════════════════════
drop policy show_costs_select on public.show_costs;
create policy show_costs_select on public.show_costs for select
  using (
    (deleted_at is null or private.can_edit_accounting(event_id))
    and private.can_view_accounting(event_id)
  );
