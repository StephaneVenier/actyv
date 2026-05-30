do $$
declare
  session_hiit_id uuid;
  session_mobility_id uuid;
  session_fullbody_id uuid;
  session_core_id uuid;
begin
  /*
    Verification utile avant application si besoin :

    select id, name, visibility
    from public.training_sessions
    where visibility = 'public'
      and name in (
        'HIIT express — 20 min',
        'Mobilité récupération — 15 min',
        'Full body salle — 45 min',
        'Gainage & stabilité — 25 min'
      )
    order by name;
  */

  update public.training_sessions
  set
    sport = 'Fitness',
    description = 'Circuit cardio rapide pour faire monter le rythme sans materiel complexe.'
  where visibility = 'public'
    and name = 'HIIT express — 20 min';

  update public.training_sessions
  set
    sport = 'Mobilité',
    description = 'Routine douce pour recuperer, respirer et retrouver de l amplitude.'
  where visibility = 'public'
    and name = 'Mobilité récupération — 15 min';

  update public.training_sessions
  set
    sport = 'Fitness',
    description = 'Seance salle complete orientee force utile et posture.'
  where visibility = 'public'
    and name = 'Full body salle — 45 min';

  update public.training_sessions
  set
    sport = 'Fitness',
    description = 'Bloc court pour renforcer le centre et la stabilite generale.'
  where visibility = 'public'
    and name = 'Gainage & stabilité — 25 min';

  select id into session_hiit_id
  from public.training_sessions
  where visibility = 'public'
    and name = 'HIIT express — 20 min'
  order by created_at asc
  limit 1;

  select id into session_mobility_id
  from public.training_sessions
  where visibility = 'public'
    and name = 'Mobilité récupération — 15 min'
  order by created_at asc
  limit 1;

  select id into session_fullbody_id
  from public.training_sessions
  where visibility = 'public'
    and name = 'Full body salle — 45 min'
  order by created_at asc
  limit 1;

  select id into session_core_id
  from public.training_sessions
  where visibility = 'public'
    and name = 'Gainage & stabilité — 25 min'
  order by created_at asc
  limit 1;

  -- HIIT express — 20 min
  insert into public.training_session_blocks (session_id, position, name, block_type, target_value, charge_kg, sets_count, rest_seconds)
  select session_hiit_id, 1, 'Burpees', 'duration', 30, null, 3, 30
  where session_hiit_id is not null
    and not exists (
      select 1
      from public.training_session_blocks
      where session_id = session_hiit_id
        and position = 1
    );

  insert into public.training_session_blocks (session_id, position, name, block_type, target_value, charge_kg, sets_count, rest_seconds)
  select session_hiit_id, 2, 'Squats', 'duration', 30, null, 3, 30
  where session_hiit_id is not null
    and not exists (
      select 1
      from public.training_session_blocks
      where session_id = session_hiit_id
        and position = 2
    );

  insert into public.training_session_blocks (session_id, position, name, block_type, target_value, charge_kg, sets_count, rest_seconds)
  select session_hiit_id, 3, 'Mountain climbers', 'duration', 30, null, 3, 30
  where session_hiit_id is not null
    and not exists (
      select 1
      from public.training_session_blocks
      where session_id = session_hiit_id
        and position = 3
    );

  insert into public.training_session_blocks (session_id, position, name, block_type, target_value, charge_kg, sets_count, rest_seconds)
  select session_hiit_id, 4, 'Pompes adaptées', 'reps', 10, null, 3, 30
  where session_hiit_id is not null
    and not exists (
      select 1
      from public.training_session_blocks
      where session_id = session_hiit_id
        and position = 4
    );

  insert into public.training_session_blocks (session_id, position, name, block_type, target_value, charge_kg, sets_count, rest_seconds)
  select session_hiit_id, 5, 'Jumping jacks', 'duration', 30, null, 3, 30
  where session_hiit_id is not null
    and not exists (
      select 1
      from public.training_session_blocks
      where session_id = session_hiit_id
        and position = 5
    );

  -- Mobilité récupération — 15 min
  insert into public.training_session_blocks (session_id, position, name, block_type, target_value, charge_kg, sets_count, rest_seconds)
  select session_mobility_id, 1, 'Respiration diaphragmatique', 'duration', 180, null, 1, 0
  where session_mobility_id is not null
    and not exists (
      select 1
      from public.training_session_blocks
      where session_id = session_mobility_id
        and position = 1
    );

  insert into public.training_session_blocks (session_id, position, name, block_type, target_value, charge_kg, sets_count, rest_seconds)
  select session_mobility_id, 2, 'Mobilité hanches', 'duration', 180, null, 1, 15
  where session_mobility_id is not null
    and not exists (
      select 1
      from public.training_session_blocks
      where session_id = session_mobility_id
        and position = 2
    );

  insert into public.training_session_blocks (session_id, position, name, block_type, target_value, charge_kg, sets_count, rest_seconds)
  select session_mobility_id, 3, 'Rotation thoracique', 'duration', 180, null, 1, 15
  where session_mobility_id is not null
    and not exists (
      select 1
      from public.training_session_blocks
      where session_id = session_mobility_id
        and position = 3
    );

  insert into public.training_session_blocks (session_id, position, name, block_type, target_value, charge_kg, sets_count, rest_seconds)
  select session_mobility_id, 4, 'Étirements doux', 'duration', 240, null, 1, 0
  where session_mobility_id is not null
    and not exists (
      select 1
      from public.training_session_blocks
      where session_id = session_mobility_id
        and position = 4
    );

  insert into public.training_session_blocks (session_id, position, name, block_type, target_value, charge_kg, sets_count, rest_seconds)
  select session_mobility_id, 5, 'Retour au calme', 'duration', 120, null, 1, 0
  where session_mobility_id is not null
    and not exists (
      select 1
      from public.training_session_blocks
      where session_id = session_mobility_id
        and position = 5
    );

  -- Full body salle — 45 min
  insert into public.training_session_blocks (session_id, position, name, block_type, target_value, charge_kg, sets_count, rest_seconds)
  select session_fullbody_id, 1, 'Presse', 'reps', 10, 80, 4, 75
  where session_fullbody_id is not null
    and not exists (
      select 1
      from public.training_session_blocks
      where session_id = session_fullbody_id
        and position = 1
    );

  insert into public.training_session_blocks (session_id, position, name, block_type, target_value, charge_kg, sets_count, rest_seconds)
  select session_fullbody_id, 2, 'Rowing', 'reps', 10, 35, 4, 60
  where session_fullbody_id is not null
    and not exists (
      select 1
      from public.training_session_blocks
      where session_id = session_fullbody_id
        and position = 2
    );

  insert into public.training_session_blocks (session_id, position, name, block_type, target_value, charge_kg, sets_count, rest_seconds)
  select session_fullbody_id, 3, 'Développé haltères', 'reps', 12, 12, 3, 60
  where session_fullbody_id is not null
    and not exists (
      select 1
      from public.training_session_blocks
      where session_id = session_fullbody_id
        and position = 3
    );

  insert into public.training_session_blocks (session_id, position, name, block_type, target_value, charge_kg, sets_count, rest_seconds)
  select session_fullbody_id, 4, 'Hip thrust', 'reps', 12, 50, 3, 75
  where session_fullbody_id is not null
    and not exists (
      select 1
      from public.training_session_blocks
      where session_id = session_fullbody_id
        and position = 4
    );

  insert into public.training_session_blocks (session_id, position, name, block_type, target_value, charge_kg, sets_count, rest_seconds)
  select session_fullbody_id, 5, 'Gainage', 'duration', 45, null, 3, 30
  where session_fullbody_id is not null
    and not exists (
      select 1
      from public.training_session_blocks
      where session_id = session_fullbody_id
        and position = 5
    );

  -- Gainage & stabilité — 25 min
  insert into public.training_session_blocks (session_id, position, name, block_type, target_value, charge_kg, sets_count, rest_seconds)
  select session_core_id, 1, 'Planche', 'duration', 45, null, 3, 25
  where session_core_id is not null
    and not exists (
      select 1
      from public.training_session_blocks
      where session_id = session_core_id
        and position = 1
    );

  insert into public.training_session_blocks (session_id, position, name, block_type, target_value, charge_kg, sets_count, rest_seconds)
  select session_core_id, 2, 'Side plank', 'duration', 30, null, 3, 25
  where session_core_id is not null
    and not exists (
      select 1
      from public.training_session_blocks
      where session_id = session_core_id
        and position = 2
    );

  insert into public.training_session_blocks (session_id, position, name, block_type, target_value, charge_kg, sets_count, rest_seconds)
  select session_core_id, 3, 'Dead bug', 'reps', 12, null, 3, 20
  where session_core_id is not null
    and not exists (
      select 1
      from public.training_session_blocks
      where session_id = session_core_id
        and position = 3
    );

  insert into public.training_session_blocks (session_id, position, name, block_type, target_value, charge_kg, sets_count, rest_seconds)
  select session_core_id, 4, 'Bird dog', 'reps', 12, null, 3, 20
  where session_core_id is not null
    and not exists (
      select 1
      from public.training_session_blocks
      where session_id = session_core_id
        and position = 4
    );

  insert into public.training_session_blocks (session_id, position, name, block_type, target_value, charge_kg, sets_count, rest_seconds)
  select session_core_id, 5, 'Mountain climbers contrôlés', 'duration', 25, null, 3, 20
  where session_core_id is not null
    and not exists (
      select 1
      from public.training_session_blocks
      where session_id = session_core_id
        and position = 5
    );
end $$;

notify pgrst, 'reload schema';
