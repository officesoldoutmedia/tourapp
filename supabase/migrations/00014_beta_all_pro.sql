-- ═══════════════════════════════════════════════════════════════════
-- 00014 — BETA: toate conturile sunt Pro (decizia lui Ștefan, 2026-07-09:
-- "dă-le voie să-și facă organizație"). Doar Pro poate crea organizații
-- și edita conținut (§1.3, §4.2) — regulile rămân, dar în beta toată
-- lumea primește Pro. La lansarea comercială: revert default + billing.
-- ═══════════════════════════════════════════════════════════════════

alter table public.profiles alter column user_tier set default 'pro';

update public.profiles set user_tier = 'pro' where user_tier = 'free';

-- handle_new_user folosește default-ul coloanei, deci nu necesită schimbare.
