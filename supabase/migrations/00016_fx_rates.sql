-- ═══════════════════════════════════════════════════════════════════
-- 00016 — Cursuri valutare MANUALE per show (cererea lui Ștefan):
-- {"EUR": 5.05} = 1 EUR în moneda show-ului. Fără API de curs — omul
-- pune cursul zilei; liniile în alte monede se convertesc la afișare.
-- ═══════════════════════════════════════════════════════════════════
alter table public.show_finances
  add column fx_rates jsonb not null default '{}';
