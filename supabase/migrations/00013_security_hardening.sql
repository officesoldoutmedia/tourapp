-- ═══════════════════════════════════════════════════════════════════
-- 00013 — Faza 8: hardening pe funcțiile SECURITY DEFINER expuse prin
-- RPC (constatările advisor-ului Supabase, 2026-07-08).
-- ═══════════════════════════════════════════════════════════════════

-- handle_new_user e DOAR trigger pe auth.users — nu trebuie apelabilă
-- prin /rest/v1/rpc de nimeni.
revoke execute on function public.handle_new_user() from public, anon, authenticated;

-- create_organization / accept_invitation: doar useri logați.
revoke execute on function public.create_organization(text, text, text) from public, anon;
grant execute on function public.create_organization(text, text, text) to authenticated;

revoke execute on function public.accept_invitation(uuid) from public, anon;
grant execute on function public.accept_invitation(uuid) to authenticated;

-- get_invitation rămâne apelabilă și de anon (pagina /invite/[token]
-- funcționează fără login [C §4.3.3]) — expune DOAR numele org-ului,
-- emailul invitat și permisiunea, pe baza unui token de 128 biți.
revoke execute on function public.get_invitation(uuid) from public;
grant execute on function public.get_invitation(uuid) to anon, authenticated;
