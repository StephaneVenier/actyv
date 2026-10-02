begin;

-- One row per performed block, with the completed set snapshots retained.
alter table public.workout_exercise_history
  add column if not exists actual_sets jsonb;

create or replace function public.sync_workout_exercise_history(p_history_id uuid)
returns setof public.workout_exercise_history
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_history public.workout_sessions_history%rowtype;
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  -- Serialize all repairs of this history, including concurrent retries.
  select * into v_history from public.workout_sessions_history
  where id = p_history_id and user_id = auth.uid()
  for update;
  if not found then
    raise exception 'WORKOUT_HISTORY_NOT_FOUND';
  end if;
  if jsonb_typeof(v_history.metadata -> 'actual_sets') is distinct from 'array' then
    raise exception 'ACTUAL_SETS_MISSING';
  end if;

  -- Atomic replacement is scoped to this owned history only. No backfill.
  delete from public.workout_exercise_history
  where history_id = v_history.id and user_id = auth.uid();

  return query
  with completed as (
    select item
    from jsonb_array_elements(v_history.metadata -> 'actual_sets') item
    where item ->> 'status' = 'completed'
      and nullif(item ->> 'block_id', '') is not null
      and nullif(btrim(item ->> 'block_name'), '') is not null
  ), distinct_sets as (
    select distinct on (item ->> 'block_id', item ->> 'set_number') item
    from completed
    order by item ->> 'block_id', item ->> 'set_number'
  ), values_by_set as (
    select item,
      item ->> 'block_id' as block_id,
      item ->> 'block_type' as block_type,
      greatest(coalesce((item ->> 'actual_reps')::numeric, 0), 0) as reps,
      greatest(coalesce((item ->> 'actual_charge_kg')::numeric, 0), 0) as charge,
      greatest(coalesce((item ->> 'actual_value')::numeric, 0), 0) as value
    from distinct_sets
  )
  insert into public.workout_exercise_history (
    history_id, user_id, workout_id, exercise_name, block_type,
    sets_count, reps, duration_seconds, distance, charge_kg, volume,
    completed_at, actual_sets
  )
  select v_history.id, v_history.user_id, v_history.workout_id,
    min(btrim(item ->> 'block_name')), block_type, count(*)::integer,
    -- Existing consumers interpret reps/charge/duration as best set values.
    max(case when block_type = 'reps' then reps else 0 end),
    trunc(max(case when block_type = 'duration' then value else 0 end))::integer,
    max(case when block_type = 'distance' then value else 0 end),
    max(case when block_type = 'reps' then charge else 0 end),
    sum(case when block_type = 'reps' then reps * charge else 0 end),
    v_history.completed_at,
    jsonb_agg(item order by (item ->> 'set_number')::integer)
  from values_by_set
  group by block_id, block_type
  returning *;
end;
$$;

revoke all on function public.sync_workout_exercise_history(uuid) from public, anon;
grant execute on function public.sync_workout_exercise_history(uuid) to authenticated;
notify pgrst, 'reload schema';
commit;
