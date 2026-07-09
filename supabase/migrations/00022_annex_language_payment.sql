-- 00022 — Anexa: limbă selectabilă (RO/EN — "dacă o facem internațională")
-- + plata în altă monedă decât cea de calcul (facturare RO: costuri în
-- EUR, plată în RON la curs setat pe anexă).
alter table public.payment_annexes
  add column language text not null default 'ro' check (language in ('ro', 'en')),
  add column payment_currency text,
  add column fx_rate numeric check (fx_rate > 0);
