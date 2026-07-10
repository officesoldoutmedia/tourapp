-- 00023 — Logo-ul artistului/turului (MT parity "Logos → Primary"):
-- se urcă în Tour settings, apare pe antetul day sheet-urilor PDF.
alter table public.tours
  add column logo_path text;
