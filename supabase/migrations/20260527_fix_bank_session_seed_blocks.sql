do $$
declare
  session_renfo_id uuid;
  session_hiit_id uuid;
  session_mobility_id uuid;
  session_fullbody_id uuid;
  session_core_id uuid;
begin
  update public.training_sessions
  set
    sport = 'Fitness',
    description = 'Renforcement utile pour la course avec jambes, tronc et stabilite.'
  where name = 'Renfo coureur — 35 min'
    and visibility = 'public';

  update public.training_sessions
  set
    sport = 'Fitness',
    description = 'Circuit cardio rapide pour faire monter le rythme sans materiel complexe.'
  where name = 'HIIT express — 20 min'
    and visibility = 'public';

  update public.training_sessions
  set
    sport = 'Mobilité',
    description = 'Routine douce pour recuperer, respirer et retrouver de l amplitude.'
  where name = 'Mobilité récupération — 15 min'
    and visibility = 'public';

  update public.training_sessions
  set
    sport = 'Fitness',
    description = 'Seance salle complete orientee force utile et posture.'
  where name = 'Full body salle — 45 min'
    and visibility = 'public';

  update public.training_sessions
  set
    sport = 'Fitness',
    description = 'Bloc court pour renforcer le centre et la stabilite generale.'
  where name = 'Gainage & stabilité — 25 min'
    and visibility = 'public';

  select id into session_renfo_id
  from public.training_sessions
  where name = 'Renfo coureur — 35 min'
    and visibility = 'public'
  order by created_at asc
  limit 1;

  select id into session_hiit_id
  from public.training_sessions
  where name = 'HIIT express — 20 min'
    and visibility = 'public'
  order by created_at asc
  limit 1;

  select id into session_mobility_id
  from public.training_sessions
  where name = 'Mobilité récupération — 15 min'
    and visibility = 'public'
  order by created_at asc
  limit 1;

  select id into session_fullbody_id
  from public.training_sessions
  where name = 'Full body salle — 45 min'
    and visibility = 'public'
  order by created_at asc
  limit 1;

  select id into session_core_id
  from public.training_sessions
  where name = 'Gainage & stabilité — 25 min'
    and visibility = 'public'
  order by created_at asc
  limit 1;

  insert into public.training_session_blocks (session_id, position, name, block_type, sets_count, target_value, charge_kg, rest_seconds)
  select session_renfo_id, 1, 'Mobilite dynamique', 'duration', 1, 240, null, 15
  where session_renfo_id is not null
    and not exists (select 1 from public.training_session_blocks where session_id = session_renfo_id and position = 1);
  insert into public.training_session_blocks (session_id, position, name, block_type, sets_count, target_value, charge_kg, rest_seconds)
  select session_renfo_id, 2, 'Squat goblet', 'reps', 3, 10, 16, 60
  where session_renfo_id is not null
    and not exists (select 1 from public.training_session_blocks where session_id = session_renfo_id and position = 2);
  insert into public.training_session_blocks (session_id, position, name, block_type, sets_count, target_value, charge_kg, rest_seconds)
  select session_renfo_id, 3, 'Fentes arriere', 'reps', 3, 8, 10, 60
  where session_renfo_id is not null
    and not exists (select 1 from public.training_session_blocks where session_id = session_renfo_id and position = 3);
  insert into public.training_session_blocks (session_id, position, name, block_type, sets_count, target_value, charge_kg, rest_seconds)
  select session_renfo_id, 4, 'Gainage frontal', 'duration', 3, 40, null, 30
  where session_renfo_id is not null
    and not exists (select 1 from public.training_session_blocks where session_id = session_renfo_id and position = 4);
  insert into public.training_session_blocks (session_id, position, name, block_type, sets_count, target_value, charge_kg, rest_seconds)
  select session_renfo_id, 5, 'Mollets debout', 'reps', 3, 15, 12, 30
  where session_renfo_id is not null
    and not exists (select 1 from public.training_session_blocks where session_id = session_renfo_id and position = 5);
  insert into public.training_session_blocks (session_id, position, name, block_type, sets_count, target_value, charge_kg, rest_seconds)
  select session_renfo_id, 6, 'Retour au calme', 'duration', 1, 180, null, 0
  where session_renfo_id is not null
    and not exists (select 1 from public.training_session_blocks where session_id = session_renfo_id and position = 6);

  insert into public.training_session_blocks (session_id, position, name, block_type, sets_count, target_value, charge_kg, rest_seconds)
  select session_hiit_id, 1, 'Burpees', 'duration', 3, 30, null, 30
  where session_hiit_id is not null
    and not exists (select 1 from public.training_session_blocks where session_id = session_hiit_id and position = 1);
  insert into public.training_session_blocks (session_id, position, name, block_type, sets_count, target_value, charge_kg, rest_seconds)
  select session_hiit_id, 2, 'Squats', 'duration', 3, 30, null, 30
  where session_hiit_id is not null
    and not exists (select 1 from public.training_session_blocks where session_id = session_hiit_id and position = 2);
  insert into public.training_session_blocks (session_id, position, name, block_type, sets_count, target_value, charge_kg, rest_seconds)
  select session_hiit_id, 3, 'Mountain climbers', 'duration', 3, 30, null, 20
  where session_hiit_id is not null
    and not exists (select 1 from public.training_session_blocks where session_id = session_hiit_id and position = 3);
  insert into public.training_session_blocks (session_id, position, name, block_type, sets_count, target_value, charge_kg, rest_seconds)
  select session_hiit_id, 4, 'Pompes adaptees', 'reps', 3, 10, null, 30
  where session_hiit_id is not null
    and not exists (select 1 from public.training_session_blocks where session_id = session_hiit_id and position = 4);
  insert into public.training_session_blocks (session_id, position, name, block_type, sets_count, target_value, charge_kg, rest_seconds)
  select session_hiit_id, 5, 'Jumping jacks', 'duration', 3, 30, null, 30
  where session_hiit_id is not null
    and not exists (select 1 from public.training_session_blocks where session_id = session_hiit_id and position = 5);

  insert into public.training_session_blocks (session_id, position, name, block_type, sets_count, target_value, charge_kg, rest_seconds)
  select session_mobility_id, 1, 'Respiration diaphragmatique', 'duration', 1, 120, null, 0
  where session_mobility_id is not null
    and not exists (select 1 from public.training_session_blocks where session_id = session_mobility_id and position = 1);
  insert into public.training_session_blocks (session_id, position, name, block_type, sets_count, target_value, charge_kg, rest_seconds)
  select session_mobility_id, 2, 'Mobilite hanches', 'duration', 2, 45, null, 15
  where session_mobility_id is not null
    and not exists (select 1 from public.training_session_blocks where session_id = session_mobility_id and position = 2);
  insert into public.training_session_blocks (session_id, position, name, block_type, sets_count, target_value, charge_kg, rest_seconds)
  select session_mobility_id, 3, 'Ouverture thoracique', 'duration', 2, 45, null, 15
  where session_mobility_id is not null
    and not exists (select 1 from public.training_session_blocks where session_id = session_mobility_id and position = 3);
  insert into public.training_session_blocks (session_id, position, name, block_type, sets_count, target_value, charge_kg, rest_seconds)
  select session_mobility_id, 4, 'Etirement chaine posterieure', 'duration', 2, 40, null, 10
  where session_mobility_id is not null
    and not exists (select 1 from public.training_session_blocks where session_id = session_mobility_id and position = 4);
  insert into public.training_session_blocks (session_id, position, name, block_type, sets_count, target_value, charge_kg, rest_seconds)
  select session_mobility_id, 5, 'Retour calme assis', 'duration', 1, 120, null, 0
  where session_mobility_id is not null
    and not exists (select 1 from public.training_session_blocks where session_id = session_mobility_id and position = 5);

  insert into public.training_session_blocks (session_id, position, name, block_type, sets_count, target_value, charge_kg, rest_seconds)
  select session_fullbody_id, 1, 'Presse a cuisses', 'reps', 4, 10, 80, 75
  where session_fullbody_id is not null
    and not exists (select 1 from public.training_session_blocks where session_id = session_fullbody_id and position = 1);
  insert into public.training_session_blocks (session_id, position, name, block_type, sets_count, target_value, charge_kg, rest_seconds)
  select session_fullbody_id, 2, 'Rowing assis', 'reps', 4, 10, 35, 60
  where session_fullbody_id is not null
    and not exists (select 1 from public.training_session_blocks where session_id = session_fullbody_id and position = 2);
  insert into public.training_session_blocks (session_id, position, name, block_type, sets_count, target_value, charge_kg, rest_seconds)
  select session_fullbody_id, 3, 'Developpe halteres leger', 'reps', 3, 10, 12, 60
  where session_fullbody_id is not null
    and not exists (select 1 from public.training_session_blocks where session_id = session_fullbody_id and position = 3);
  insert into public.training_session_blocks (session_id, position, name, block_type, sets_count, target_value, charge_kg, rest_seconds)
  select session_fullbody_id, 4, 'Hip thrust', 'reps', 4, 10, 50, 75
  where session_fullbody_id is not null
    and not exists (select 1 from public.training_session_blocks where session_id = session_fullbody_id and position = 4);
  insert into public.training_session_blocks (session_id, position, name, block_type, sets_count, target_value, charge_kg, rest_seconds)
  select session_fullbody_id, 5, 'Gainage', 'duration', 3, 45, null, 30
  where session_fullbody_id is not null
    and not exists (select 1 from public.training_session_blocks where session_id = session_fullbody_id and position = 5);

  insert into public.training_session_blocks (session_id, position, name, block_type, sets_count, target_value, charge_kg, rest_seconds)
  select session_core_id, 1, 'Planche', 'duration', 3, 40, null, 25
  where session_core_id is not null
    and not exists (select 1 from public.training_session_blocks where session_id = session_core_id and position = 1);
  insert into public.training_session_blocks (session_id, position, name, block_type, sets_count, target_value, charge_kg, rest_seconds)
  select session_core_id, 2, 'Side plank', 'duration', 3, 30, null, 25
  where session_core_id is not null
    and not exists (select 1 from public.training_session_blocks where session_id = session_core_id and position = 2);
  insert into public.training_session_blocks (session_id, position, name, block_type, sets_count, target_value, charge_kg, rest_seconds)
  select session_core_id, 3, 'Bird dog', 'reps', 3, 10, null, 20
  where session_core_id is not null
    and not exists (select 1 from public.training_session_blocks where session_id = session_core_id and position = 3);
  insert into public.training_session_blocks (session_id, position, name, block_type, sets_count, target_value, charge_kg, rest_seconds)
  select session_core_id, 4, 'Dead bug', 'reps', 3, 10, null, 20
  where session_core_id is not null
    and not exists (select 1 from public.training_session_blocks where session_id = session_core_id and position = 4);
  insert into public.training_session_blocks (session_id, position, name, block_type, sets_count, target_value, charge_kg, rest_seconds)
  select session_core_id, 5, 'Mountain climbers controles', 'duration', 3, 25, null, 20
  where session_core_id is not null
    and not exists (select 1 from public.training_session_blocks where session_id = session_core_id and position = 5);
end $$;

notify pgrst, 'reload schema';
