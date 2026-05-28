do $$
declare
  session_fullbody_id uuid := 'e2790534-a4d1-4c8c-bd7f-af3414d91da4';
  session_core_id uuid := '5e81b987-8914-468f-a1ee-8d5f8b95c129';
  session_hiit_id uuid := '574e29a9-9aa2-45d5-8cde-5971938bea4b';
  session_mobility_id uuid := '15471196-d2a0-464a-8859-ea287cc07ae2';
begin
  -- Ne cible que les templates publics connus.
  if exists (
    select 1 from public.training_sessions
    where id = session_hiit_id
      and visibility = 'public'
  ) then
    insert into public.training_session_blocks
      (session_id, position, name, block_type, target_value, charge_kg, sets_count, rest_seconds)
    select session_hiit_id, 1, 'Jumping jacks', 'duration', 45, null, 3, 15
    where not exists (
      select 1 from public.training_session_blocks
      where session_id = session_hiit_id and position = 1
    );

    insert into public.training_session_blocks
      (session_id, position, name, block_type, target_value, charge_kg, sets_count, rest_seconds)
    select session_hiit_id, 2, 'Squats', 'duration', 45, null, 3, 15
    where not exists (
      select 1 from public.training_session_blocks
      where session_id = session_hiit_id and position = 2
    );

    insert into public.training_session_blocks
      (session_id, position, name, block_type, target_value, charge_kg, sets_count, rest_seconds)
    select session_hiit_id, 3, 'Mountain climbers', 'duration', 45, null, 3, 15
    where not exists (
      select 1 from public.training_session_blocks
      where session_id = session_hiit_id and position = 3
    );

    insert into public.training_session_blocks
      (session_id, position, name, block_type, target_value, charge_kg, sets_count, rest_seconds)
    select session_hiit_id, 4, 'Pompes adaptées', 'reps', 10, null, 3, 30
    where not exists (
      select 1 from public.training_session_blocks
      where session_id = session_hiit_id and position = 4
    );

    insert into public.training_session_blocks
      (session_id, position, name, block_type, target_value, charge_kg, sets_count, rest_seconds)
    select session_hiit_id, 5, 'Repos', 'duration', 30, null, 3, 30
    where not exists (
      select 1 from public.training_session_blocks
      where session_id = session_hiit_id and position = 5
    );
  end if;

  if exists (
    select 1 from public.training_sessions
    where id = session_mobility_id
      and visibility = 'public'
  ) then
    insert into public.training_session_blocks
      (session_id, position, name, block_type, target_value, charge_kg, sets_count, rest_seconds)
    select session_mobility_id, 1, 'Respiration diaphragmatique', 'duration', 180, null, 1, 0
    where not exists (
      select 1 from public.training_session_blocks
      where session_id = session_mobility_id and position = 1
    );

    insert into public.training_session_blocks
      (session_id, position, name, block_type, target_value, charge_kg, sets_count, rest_seconds)
    select session_mobility_id, 2, 'Mobilité hanches', 'duration', 180, null, 1, 15
    where not exists (
      select 1 from public.training_session_blocks
      where session_id = session_mobility_id and position = 2
    );

    insert into public.training_session_blocks
      (session_id, position, name, block_type, target_value, charge_kg, sets_count, rest_seconds)
    select session_mobility_id, 3, 'Rotation thoracique', 'duration', 180, null, 1, 15
    where not exists (
      select 1 from public.training_session_blocks
      where session_id = session_mobility_id and position = 3
    );

    insert into public.training_session_blocks
      (session_id, position, name, block_type, target_value, charge_kg, sets_count, rest_seconds)
    select session_mobility_id, 4, 'Étirements doux', 'duration', 240, null, 1, 0
    where not exists (
      select 1 from public.training_session_blocks
      where session_id = session_mobility_id and position = 4
    );
  end if;

  if exists (
    select 1 from public.training_sessions
    where id = session_fullbody_id
      and visibility = 'public'
  ) then
    insert into public.training_session_blocks
      (session_id, position, name, block_type, target_value, charge_kg, sets_count, rest_seconds)
    select session_fullbody_id, 1, 'Presse', 'reps', 10, 80, 4, 75
    where not exists (
      select 1 from public.training_session_blocks
      where session_id = session_fullbody_id and position = 1
    );

    insert into public.training_session_blocks
      (session_id, position, name, block_type, target_value, charge_kg, sets_count, rest_seconds)
    select session_fullbody_id, 2, 'Rowing', 'reps', 10, 35, 4, 60
    where not exists (
      select 1 from public.training_session_blocks
      where session_id = session_fullbody_id and position = 2
    );

    insert into public.training_session_blocks
      (session_id, position, name, block_type, target_value, charge_kg, sets_count, rest_seconds)
    select session_fullbody_id, 3, 'Développé haltères', 'reps', 12, 12, 3, 60
    where not exists (
      select 1 from public.training_session_blocks
      where session_id = session_fullbody_id and position = 3
    );

    insert into public.training_session_blocks
      (session_id, position, name, block_type, target_value, charge_kg, sets_count, rest_seconds)
    select session_fullbody_id, 4, 'Hip thrust', 'reps', 12, 50, 3, 75
    where not exists (
      select 1 from public.training_session_blocks
      where session_id = session_fullbody_id and position = 4
    );

    insert into public.training_session_blocks
      (session_id, position, name, block_type, target_value, charge_kg, sets_count, rest_seconds)
    select session_fullbody_id, 5, 'Gainage', 'duration', 45, null, 3, 30
    where not exists (
      select 1 from public.training_session_blocks
      where session_id = session_fullbody_id and position = 5
    );
  end if;

  if exists (
    select 1 from public.training_sessions
    where id = session_core_id
      and visibility = 'public'
  ) then
    insert into public.training_session_blocks
      (session_id, position, name, block_type, target_value, charge_kg, sets_count, rest_seconds)
    select session_core_id, 1, 'Planche', 'duration', 45, null, 3, 25
    where not exists (
      select 1 from public.training_session_blocks
      where session_id = session_core_id and position = 1
    );

    insert into public.training_session_blocks
      (session_id, position, name, block_type, target_value, charge_kg, sets_count, rest_seconds)
    select session_core_id, 2, 'Side plank', 'duration', 30, null, 3, 25
    where not exists (
      select 1 from public.training_session_blocks
      where session_id = session_core_id and position = 2
    );

    insert into public.training_session_blocks
      (session_id, position, name, block_type, target_value, charge_kg, sets_count, rest_seconds)
    select session_core_id, 3, 'Dead bug', 'reps', 12, null, 3, 20
    where not exists (
      select 1 from public.training_session_blocks
      where session_id = session_core_id and position = 3
    );

    insert into public.training_session_blocks
      (session_id, position, name, block_type, target_value, charge_kg, sets_count, rest_seconds)
    select session_core_id, 4, 'Bird dog', 'reps', 12, null, 3, 20
    where not exists (
      select 1 from public.training_session_blocks
      where session_id = session_core_id and position = 4
    );

    insert into public.training_session_blocks
      (session_id, position, name, block_type, target_value, charge_kg, sets_count, rest_seconds)
    select session_core_id, 5, 'Mountain climbers contrôlés', 'duration', 25, null, 3, 20
    where not exists (
      select 1 from public.training_session_blocks
      where session_id = session_core_id and position = 5
    );
  end if;
end $$;

notify pgrst, 'reload schema';
