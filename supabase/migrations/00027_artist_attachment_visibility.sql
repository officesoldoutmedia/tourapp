-- Vizibilitatea attachment-urilor cu parent 'artist' derivă din
-- vizibilitatea artistului (același mecanism ca la §2 din spec).
create or replace function private.can_see_attachment_parent(
  ptype public.attachment_parent,
  pid uuid,
  org uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case ptype
    when 'tour' then private.can_access_tour(pid)
    when 'day' then private.can_access_day(pid)
    -- [C] accounting attachments: DOAR administrator + accounting
    when 'event_accounting' then
      private.can_access_event(pid)
      and private.has_min_permission(org, 'accounting')
    when 'song' then private.is_org_member(org)
    when 'artist' then
      private.is_org_member(org)
      and private.can_see_subject(org, 'artist', pid)
  end;
$$;

grant execute on all functions in schema private to authenticated;
