-- 00019 — Nu toate costurile intră în înțelegerea cu booking-ul
-- (cererea lui Ștefan: "editul extra nu l-aș băga în costul de concert
-- al bookerului"). Per linie: billable_to_booker = intră în baza NET a
-- comisionului + apare pe fișa de costuri; false = cost intern (scade
-- doar profitul lui). Default true = comportamentul de până acum.
alter table public.show_costs
  add column billable_to_booker boolean not null default true;
