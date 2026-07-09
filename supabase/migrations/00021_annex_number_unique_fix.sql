-- 00021 — FIX: numărul de anexă trebuie să fie unic doar între anexele
-- ACTIVE. O anexă ștearsă (soft delete) nu mai blochează numărul —
-- altfel "Anexa 1" ștearsă făcea imposibilă emiterea alteia cu nr. 1.
alter table public.payment_annexes
  drop constraint payment_annexes_personnel_id_annex_number_key;
create unique index payment_annexes_personnel_annex_unique
  on public.payment_annexes (personnel_id, annex_number)
  where deleted_at is null;
