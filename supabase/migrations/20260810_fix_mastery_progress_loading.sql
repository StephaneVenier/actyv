begin;

create or replace function public.get_my_masteries_progress()
returns table (
  mastery_id uuid,
  slug text,
  name text,
  category_id uuid,
  measurement_type text,
  unit text,
  description text,
  sort_order integer,
  total_value numeric,
  current_level integer,
  current_threshold numeric,
  next_level integer,
  next_threshold numeric,
  remaining_value numeric,
  progress_percent numeric,
  xp_reward_next_level integer,
  is_max_level boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  return query
  select
    m.id as mastery_id,
    m.slug,
    m.name,
    m.category_id,
    m.measurement_type,
    m.unit,
    m.description,
    m.sort_order,
    coalesce((progress.payload ->> 'total_value')::numeric, 0) as total_value,
    coalesce((progress.payload ->> 'current_level')::integer, 0) as current_level,
    coalesce((progress.payload ->> 'current_threshold')::numeric, 0) as current_threshold,
    coalesce((progress.payload ->> 'next_level')::integer, 0) as next_level,
    coalesce((progress.payload ->> 'next_threshold')::numeric, 0) as next_threshold,
    coalesce((progress.payload ->> 'remaining_value')::numeric, 0) as remaining_value,
    coalesce((progress.payload ->> 'progress_percent')::numeric, 0) as progress_percent,
    coalesce((progress.payload ->> 'xp_reward_next_level')::integer, 0) as xp_reward_next_level,
    coalesce((progress.payload ->> 'is_max_level')::boolean, false) as is_max_level
  from public.masteries as m
  cross join lateral (
    select public.compute_mastery_progress_internal(v_user_id, m.id) as payload
  ) as progress
  where m.active = true
  order by m.sort_order asc, m.slug asc;
end;
$$;

revoke all on function public.get_my_masteries_progress() from public;
revoke all on function public.get_my_masteries_progress() from anon;
revoke all on function public.get_my_masteries_progress() from authenticated;
grant execute on function public.get_my_masteries_progress() to authenticated;

notify pgrst, 'reload schema';

commit;
