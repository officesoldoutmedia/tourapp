-- ═══════════════════════════════════════════════════════════════════
-- 00005 — Realtime (§7.2): publicăm tabelele zilei pentru
-- postgres_changes. Guard: publicația supabase_realtime există doar pe
-- stack-ul Supabase (nu și pe Postgres-ul de test local).
-- ═══════════════════════════════════════════════════════════════════

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.days;
    alter publication supabase_realtime add table public.schedule_items;
  end if;
end $$;
