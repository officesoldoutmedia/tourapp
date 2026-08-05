-- ═══════════════════════════════════════════════════════════════════
-- SP2 — bucket-uri pentru show-uri one-off. Spec:
-- docs/superpowers/specs/2026-08-06-new-event-master-dashboard-design.md
-- bucket_year NULL = tur normal; 2026 = bucket-ul de one-off-uri al
-- artistului pe anul respectiv (ex. „SPEAK 2026"). Un singur bucket per
-- artist/an — indexul unic parțial face find-or-create-ul race-safe.
-- ═══════════════════════════════════════════════════════════════════

alter table public.tours add column bucket_year int;

create unique index tours_artist_bucket_uq
  on public.tours (artist_id, bucket_year)
  where bucket_year is not null;
