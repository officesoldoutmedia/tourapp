-- C2 reverse scheduling: proveniența generării pe schedule_items +
-- legătura deal → template de program. Aditivă, zero politici noi —
-- coloanele călătoresc pe RLS-ul existent (schedule_items prin zi→tur,
-- deal_templates prin artist).

alter table public.schedule_items
  add column generated_anchor text check (generated_anchor in ('show')),
  add column generated_offset_min integer;

comment on column public.schedule_items.generated_anchor is
  'C2: null = item manual / oră fixă; ''show'' = generat relativ la stage time (T). Recalculează atinge doar ''show'' + neconfirmat.';
comment on column public.schedule_items.generated_offset_min is
  'C2: offset semnat în minute față de T (−480 = T−8h). Sursa recalculului.';

alter table public.deal_templates
  add column schedule_template_id uuid
    references public.schedule_templates (id) on delete set null;

comment on column public.deal_templates.schedule_template_id is
  'C2: template-ul de program pre-populat în wizard la alegerea deal-ului. Folosit DOAR la creare — programul aplicat e copie (regula snapshot).';
