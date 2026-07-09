-- 00017 — Baza comisionului de booking (cererea lui Ștefan): 'gross' =
-- procent din fee-ul total; 'net' = procent din fee MINUS costuri
-- (crew + extra). Default 'net' — așa lucrează el cu booking-ul.
alter table public.show_finances
  add column booking_base text not null default 'net'
    check (booking_base in ('gross', 'net'));
