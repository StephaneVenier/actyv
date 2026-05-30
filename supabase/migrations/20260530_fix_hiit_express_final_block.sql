do $$
declare
  session_hiit_id uuid := '574e29a9-9aa2-45d5-8cde-5971938bea4b';
begin
  update public.training_session_blocks
  set
    name = 'Mountain climbers',
    block_type = 'duration',
    target_value = 30,
    charge_kg = null,
    sets_count = 3,
    rest_seconds = 30
  where session_id = session_hiit_id
    and position = 5
    and exists (
      select 1
      from public.training_sessions
      where id = session_hiit_id
        and visibility = 'public'
    );

  insert into public.training_session_blocks
    (session_id, position, name, block_type, target_value, charge_kg, sets_count, rest_seconds)
  select session_hiit_id, 5, 'Mountain climbers', 'duration', 30, null, 3, 30
  where exists (
      select 1
      from public.training_sessions
      where id = session_hiit_id
        and visibility = 'public'
    )
    and not exists (
      select 1
      from public.training_session_blocks
      where session_id = session_hiit_id
        and position = 5
    );
end $$;

notify pgrst, 'reload schema';
