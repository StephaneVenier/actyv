do $$
declare
  session_hiit_id uuid;
begin
  select id
  into session_hiit_id
  from public.training_sessions
  where visibility = 'public'
    and name = 'HIIT express — 20 min'
  order by created_at asc
  limit 1;

  if session_hiit_id is null then
    return;
  end if;

  insert into public.training_session_blocks
    (session_id, position, name, block_type, target_value, charge_kg, sets_count, rest_seconds)
  select session_hiit_id, 1, 'Burpees', 'duration', 30, null, 3, 30
  where not exists (
    select 1
    from public.training_session_blocks
    where session_id = session_hiit_id
      and position = 1
  );

  insert into public.training_session_blocks
    (session_id, position, name, block_type, target_value, charge_kg, sets_count, rest_seconds)
  select session_hiit_id, 2, 'Squats', 'duration', 30, null, 3, 30
  where not exists (
    select 1
    from public.training_session_blocks
    where session_id = session_hiit_id
      and position = 2
  );

  insert into public.training_session_blocks
    (session_id, position, name, block_type, target_value, charge_kg, sets_count, rest_seconds)
  select session_hiit_id, 3, 'Mountain climbers', 'duration', 30, null, 3, 30
  where not exists (
    select 1
    from public.training_session_blocks
    where session_id = session_hiit_id
      and position = 3
  );

  insert into public.training_session_blocks
    (session_id, position, name, block_type, target_value, charge_kg, sets_count, rest_seconds)
  select session_hiit_id, 4, 'Pompes adaptées', 'reps', 10, null, 3, 30
  where not exists (
    select 1
    from public.training_session_blocks
    where session_id = session_hiit_id
      and position = 4
  );

  insert into public.training_session_blocks
    (session_id, position, name, block_type, target_value, charge_kg, sets_count, rest_seconds)
  select session_hiit_id, 5, 'Jumping Jacks', 'duration', 30, null, 3, 30
  where not exists (
    select 1
    from public.training_session_blocks
    where session_id = session_hiit_id
      and position = 5
  );

  update public.training_session_blocks
  set
    name = case position
      when 1 then 'Burpees'
      when 2 then 'Squats'
      when 3 then 'Mountain climbers'
      when 4 then 'Pompes adaptées'
      when 5 then 'Jumping Jacks'
      else name
    end,
    block_type = case position
      when 4 then 'reps'
      else 'duration'
    end,
    target_value = case position
      when 4 then 10
      else 30
    end,
    charge_kg = null,
    sets_count = 3,
    rest_seconds = 30
  where session_id = session_hiit_id
    and position between 1 and 5;

  delete from public.training_session_blocks
  where session_id = session_hiit_id
    and (
      position > 5
      or lower(trim(name)) = 'repos'
    );
end $$;

notify pgrst, 'reload schema';
