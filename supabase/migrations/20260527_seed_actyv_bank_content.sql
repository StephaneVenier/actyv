do $$
declare
  seed_owner_id uuid;
  session_renfo_id uuid;
  session_hiit_id uuid;
  session_mobility_id uuid;
  session_fullbody_id uuid;
  session_core_id uuid;
  program_reprise_id uuid;
  program_runner_id uuid;
  program_regular_id uuid;
begin
  select id
  into seed_owner_id
  from auth.users
  where lower(coalesce(email, '')) like '%actyv%'
  order by created_at asc
  limit 1;

  if seed_owner_id is null then
    select id
    into seed_owner_id
    from auth.users
    order by created_at asc
    limit 1;
  end if;

  if seed_owner_id is null then
    raise notice 'Actyv bank seed skipped: no auth.users row available.';
    return;
  end if;

  update public.training_sessions
  set
    sport = 'Fitness',
    description = 'Renforcement utile pour la course avec jambes, tronc et stabilite.'
  where name = 'Renfo coureur — 35 min'
    and visibility = 'public'
    and (
      coalesce(sport, '') <> 'Fitness'
      or coalesce(description, '') <> 'Renforcement utile pour la course avec jambes, tronc et stabilite.'
    );

  update public.training_sessions
  set
    sport = 'Fitness',
    description = 'Circuit cardio rapide pour faire monter le rythme sans materiel complexe.'
  where name = 'HIIT express — 20 min'
    and visibility = 'public'
    and (
      coalesce(sport, '') <> 'Fitness'
      or coalesce(description, '') <> 'Circuit cardio rapide pour faire monter le rythme sans materiel complexe.'
    );

  update public.training_sessions
  set
    sport = 'Mobilité',
    description = 'Routine douce pour recuperer, respirer et retrouver de l amplitude.'
  where name = 'Mobilité récupération — 15 min'
    and visibility = 'public'
    and (
      coalesce(sport, '') <> 'Mobilite'
      or coalesce(description, '') <> 'Routine douce pour recuperer, respirer et retrouver de l amplitude.'
    );

  update public.training_sessions
  set
    sport = 'Fitness',
    description = 'Seance salle complete orientee force utile et posture.'
  where name = 'Full body salle — 45 min'
    and visibility = 'public'
    and (
      coalesce(sport, '') <> 'Fitness'
      or coalesce(description, '') <> 'Seance salle complete orientee force utile et posture.'
    );

  update public.training_sessions
  set
    sport = 'Fitness',
    description = 'Bloc court pour renforcer le centre et la stabilite generale.'
  where name = 'Gainage & stabilité — 25 min'
    and visibility = 'public'
    and (
      coalesce(sport, '') <> 'Fitness'
      or coalesce(description, '') <> 'Bloc court pour renforcer le centre et la stabilite generale.'
    );

  insert into public.training_sessions (user_id, name, sport, description, visibility)
  select seed_owner_id, 'Renfo coureur — 35 min', 'Fitness', 'Renforcement utile pour la course avec jambes, tronc et stabilite.', 'public'
  where not exists (
    select 1 from public.training_sessions
    where name = 'Renfo coureur — 35 min'
      and visibility = 'public'
  );

  insert into public.training_sessions (user_id, name, sport, description, visibility)
  select seed_owner_id, 'HIIT express — 20 min', 'Fitness', 'Circuit cardio rapide pour faire monter le rythme sans materiel complexe.', 'public'
  where not exists (
    select 1 from public.training_sessions
    where name = 'HIIT express — 20 min'
      and visibility = 'public'
  );

  insert into public.training_sessions (user_id, name, sport, description, visibility)
  select seed_owner_id, 'Mobilité récupération — 15 min', 'Mobilité', 'Routine douce pour recuperer, respirer et retrouver de l amplitude.', 'public'
  where not exists (
    select 1 from public.training_sessions
    where name = 'Mobilité récupération — 15 min'
      and visibility = 'public'
  );

  insert into public.training_sessions (user_id, name, sport, description, visibility)
  select seed_owner_id, 'Full body salle — 45 min', 'Fitness', 'Seance salle complete orientee force utile et posture.', 'public'
  where not exists (
    select 1 from public.training_sessions
    where name = 'Full body salle — 45 min'
      and visibility = 'public'
  );

  insert into public.training_sessions (user_id, name, sport, description, visibility)
  select seed_owner_id, 'Gainage & stabilité — 25 min', 'Fitness', 'Bloc court pour renforcer le centre et la stabilite generale.', 'public'
  where not exists (
    select 1 from public.training_sessions
    where name = 'Gainage & stabilité — 25 min'
      and visibility = 'public'
  );

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
  select session_hiit_id, 1, 'Jumping jacks', 'duration', 2, 30, null, 15
  where session_hiit_id is not null
    and not exists (select 1 from public.training_session_blocks where session_id = session_hiit_id and position = 1);
  insert into public.training_session_blocks (session_id, position, name, block_type, sets_count, target_value, charge_kg, rest_seconds)
  select session_hiit_id, 2, 'Squats au poids du corps', 'reps', 3, 15, null, 20
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
  select session_hiit_id, 5, 'Planche finale', 'duration', 2, 30, null, 20
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

  insert into public.training_programs (user_id, name, description, sport, duration_weeks, visibility, start_date)
  select seed_owner_id, 'Reprise sport - 4 semaines', 'Programme progressif avec deux seances par semaine pour relancer l habitude.', 'Fitness', 4, 'public', current_date
  where not exists (
    select 1 from public.training_programs
    where name = 'Reprise sport - 4 semaines'
      and visibility = 'public'
  );

  insert into public.training_programs (user_id, name, description, sport, duration_weeks, visibility, start_date)
  select seed_owner_id, 'Renfo coureur - 6 semaines', 'Cycle de renforcement utile au coureur avec jambes, gainage et stabilite.', 'Fitness', 6, 'public', current_date
  where not exists (
    select 1 from public.training_programs
    where name = 'Renfo coureur - 6 semaines'
      and visibility = 'public'
  );

  insert into public.training_programs (user_id, name, description, sport, duration_weeks, visibility, start_date)
  select seed_owner_id, 'Objectif regularite - 3 semaines', 'Programme simple avec trois seances courtes par semaine pour tenir le rythme.', 'Fitness', 3, 'public', current_date
  where not exists (
    select 1 from public.training_programs
    where name = 'Objectif regularite - 3 semaines'
      and visibility = 'public'
  );

  select id into program_reprise_id
  from public.training_programs
  where name = 'Reprise sport - 4 semaines'
    and visibility = 'public'
  order by created_at asc
  limit 1;

  select id into program_runner_id
  from public.training_programs
  where name = 'Renfo coureur - 6 semaines'
    and visibility = 'public'
  order by created_at asc
  limit 1;

  select id into program_regular_id
  from public.training_programs
  where name = 'Objectif regularite - 3 semaines'
    and visibility = 'public'
  order by created_at asc
  limit 1;

  insert into public.training_program_sessions (program_id, session_id, session_name, sport, week_number, day_of_week, order_index)
  select program_reprise_id, session_mobility_id, 'Mobilité récupération — 15 min', 'Mobilité', 1, 2, 1
  where program_reprise_id is not null and session_mobility_id is not null
    and not exists (select 1 from public.training_program_sessions where program_id = program_reprise_id and week_number = 1 and day_of_week = 2 and order_index = 1);
  insert into public.training_program_sessions (program_id, session_id, session_name, sport, week_number, day_of_week, order_index)
  select program_reprise_id, session_renfo_id, 'Renfo coureur — 35 min', 'Fitness', 1, 5, 1
  where program_reprise_id is not null and session_renfo_id is not null
    and not exists (select 1 from public.training_program_sessions where program_id = program_reprise_id and week_number = 1 and day_of_week = 5 and order_index = 1);
  insert into public.training_program_sessions (program_id, session_id, session_name, sport, week_number, day_of_week, order_index)
  select program_reprise_id, session_mobility_id, 'Mobilité récupération — 15 min', 'Mobilité', 2, 2, 1
  where program_reprise_id is not null and session_mobility_id is not null
    and not exists (select 1 from public.training_program_sessions where program_id = program_reprise_id and week_number = 2 and day_of_week = 2 and order_index = 1);
  insert into public.training_program_sessions (program_id, session_id, session_name, sport, week_number, day_of_week, order_index)
  select program_reprise_id, session_hiit_id, 'HIIT express — 20 min', 'Fitness', 2, 5, 1
  where program_reprise_id is not null and session_hiit_id is not null
    and not exists (select 1 from public.training_program_sessions where program_id = program_reprise_id and week_number = 2 and day_of_week = 5 and order_index = 1);
  insert into public.training_program_sessions (program_id, session_id, session_name, sport, week_number, day_of_week, order_index)
  select program_reprise_id, session_mobility_id, 'Mobilité récupération — 15 min', 'Mobilité', 3, 2, 1
  where program_reprise_id is not null and session_mobility_id is not null
    and not exists (select 1 from public.training_program_sessions where program_id = program_reprise_id and week_number = 3 and day_of_week = 2 and order_index = 1);
  insert into public.training_program_sessions (program_id, session_id, session_name, sport, week_number, day_of_week, order_index)
  select program_reprise_id, session_renfo_id, 'Renfo coureur — 35 min', 'Fitness', 3, 5, 1
  where program_reprise_id is not null and session_renfo_id is not null
    and not exists (select 1 from public.training_program_sessions where program_id = program_reprise_id and week_number = 3 and day_of_week = 5 and order_index = 1);
  insert into public.training_program_sessions (program_id, session_id, session_name, sport, week_number, day_of_week, order_index)
  select program_reprise_id, session_mobility_id, 'Mobilité récupération — 15 min', 'Mobilité', 4, 2, 1
  where program_reprise_id is not null and session_mobility_id is not null
    and not exists (select 1 from public.training_program_sessions where program_id = program_reprise_id and week_number = 4 and day_of_week = 2 and order_index = 1);
  insert into public.training_program_sessions (program_id, session_id, session_name, sport, week_number, day_of_week, order_index)
  select program_reprise_id, session_hiit_id, 'HIIT express — 20 min', 'Fitness', 4, 5, 1
  where program_reprise_id is not null and session_hiit_id is not null
    and not exists (select 1 from public.training_program_sessions where program_id = program_reprise_id and week_number = 4 and day_of_week = 5 and order_index = 1);

  insert into public.training_program_sessions (program_id, session_id, session_name, sport, week_number, day_of_week, order_index)
  select program_runner_id, session_renfo_id, 'Renfo coureur — 35 min', 'Fitness', 1, 2, 1
  where program_runner_id is not null and session_renfo_id is not null
    and not exists (select 1 from public.training_program_sessions where program_id = program_runner_id and week_number = 1 and day_of_week = 2 and order_index = 1);
  insert into public.training_program_sessions (program_id, session_id, session_name, sport, week_number, day_of_week, order_index)
  select program_runner_id, session_core_id, 'Gainage & stabilité — 25 min', 'Fitness', 1, 5, 1
  where program_runner_id is not null and session_core_id is not null
    and not exists (select 1 from public.training_program_sessions where program_id = program_runner_id and week_number = 1 and day_of_week = 5 and order_index = 1);

  insert into public.training_program_sessions (program_id, session_id, session_name, sport, week_number, day_of_week, order_index)
  select program_runner_id, session_renfo_id, 'Renfo coureur — 35 min', 'Fitness', 2, 2, 1
  where program_runner_id is not null and session_renfo_id is not null
    and not exists (select 1 from public.training_program_sessions where program_id = program_runner_id and week_number = 2 and day_of_week = 2 and order_index = 1);
  insert into public.training_program_sessions (program_id, session_id, session_name, sport, week_number, day_of_week, order_index)
  select program_runner_id, session_core_id, 'Gainage & stabilité — 25 min', 'Fitness', 2, 5, 1
  where program_runner_id is not null and session_core_id is not null
    and not exists (select 1 from public.training_program_sessions where program_id = program_runner_id and week_number = 2 and day_of_week = 5 and order_index = 1);

  insert into public.training_program_sessions (program_id, session_id, session_name, sport, week_number, day_of_week, order_index)
  select program_runner_id, session_fullbody_id, 'Full body salle — 45 min', 'Fitness', 3, 2, 1
  where program_runner_id is not null and session_fullbody_id is not null
    and not exists (select 1 from public.training_program_sessions where program_id = program_runner_id and week_number = 3 and day_of_week = 2 and order_index = 1);
  insert into public.training_program_sessions (program_id, session_id, session_name, sport, week_number, day_of_week, order_index)
  select program_runner_id, session_core_id, 'Gainage & stabilité — 25 min', 'Fitness', 3, 5, 1
  where program_runner_id is not null and session_core_id is not null
    and not exists (select 1 from public.training_program_sessions where program_id = program_runner_id and week_number = 3 and day_of_week = 5 and order_index = 1);

  insert into public.training_program_sessions (program_id, session_id, session_name, sport, week_number, day_of_week, order_index)
  select program_runner_id, session_renfo_id, 'Renfo coureur — 35 min', 'Fitness', 4, 2, 1
  where program_runner_id is not null and session_renfo_id is not null
    and not exists (select 1 from public.training_program_sessions where program_id = program_runner_id and week_number = 4 and day_of_week = 2 and order_index = 1);
  insert into public.training_program_sessions (program_id, session_id, session_name, sport, week_number, day_of_week, order_index)
  select program_runner_id, session_core_id, 'Gainage & stabilité — 25 min', 'Fitness', 4, 5, 1
  where program_runner_id is not null and session_core_id is not null
    and not exists (select 1 from public.training_program_sessions where program_id = program_runner_id and week_number = 4 and day_of_week = 5 and order_index = 1);

  insert into public.training_program_sessions (program_id, session_id, session_name, sport, week_number, day_of_week, order_index)
  select program_runner_id, session_fullbody_id, 'Full body salle — 45 min', 'Fitness', 5, 2, 1
  where program_runner_id is not null and session_fullbody_id is not null
    and not exists (select 1 from public.training_program_sessions where program_id = program_runner_id and week_number = 5 and day_of_week = 2 and order_index = 1);
  insert into public.training_program_sessions (program_id, session_id, session_name, sport, week_number, day_of_week, order_index)
  select program_runner_id, session_core_id, 'Gainage & stabilité — 25 min', 'Fitness', 5, 5, 1
  where program_runner_id is not null and session_core_id is not null
    and not exists (select 1 from public.training_program_sessions where program_id = program_runner_id and week_number = 5 and day_of_week = 5 and order_index = 1);

  insert into public.training_program_sessions (program_id, session_id, session_name, sport, week_number, day_of_week, order_index)
  select program_runner_id, session_renfo_id, 'Renfo coureur — 35 min', 'Fitness', 6, 2, 1
  where program_runner_id is not null and session_renfo_id is not null
    and not exists (select 1 from public.training_program_sessions where program_id = program_runner_id and week_number = 6 and day_of_week = 2 and order_index = 1);
  insert into public.training_program_sessions (program_id, session_id, session_name, sport, week_number, day_of_week, order_index)
  select program_runner_id, session_core_id, 'Gainage & stabilité — 25 min', 'Fitness', 6, 5, 1
  where program_runner_id is not null and session_core_id is not null
    and not exists (select 1 from public.training_program_sessions where program_id = program_runner_id and week_number = 6 and day_of_week = 5 and order_index = 1);

  insert into public.training_program_sessions (program_id, session_id, session_name, sport, week_number, day_of_week, order_index)
  select program_regular_id, session_mobility_id, 'Mobilité récupération — 15 min', 'Mobilité', 1, 1, 1
  where program_regular_id is not null and session_mobility_id is not null
    and not exists (select 1 from public.training_program_sessions where program_id = program_regular_id and week_number = 1 and day_of_week = 1 and order_index = 1);
  insert into public.training_program_sessions (program_id, session_id, session_name, sport, week_number, day_of_week, order_index)
  select program_regular_id, session_hiit_id, 'HIIT express — 20 min', 'Fitness', 1, 3, 1
  where program_regular_id is not null and session_hiit_id is not null
    and not exists (select 1 from public.training_program_sessions where program_id = program_regular_id and week_number = 1 and day_of_week = 3 and order_index = 1);
  insert into public.training_program_sessions (program_id, session_id, session_name, sport, week_number, day_of_week, order_index)
  select program_regular_id, session_core_id, 'Gainage & stabilité — 25 min', 'Fitness', 1, 5, 1
  where program_regular_id is not null and session_core_id is not null
    and not exists (select 1 from public.training_program_sessions where program_id = program_regular_id and week_number = 1 and day_of_week = 5 and order_index = 1);

  insert into public.training_program_sessions (program_id, session_id, session_name, sport, week_number, day_of_week, order_index)
  select program_regular_id, session_mobility_id, 'Mobilité récupération — 15 min', 'Mobilité', 2, 1, 1
  where program_regular_id is not null and session_mobility_id is not null
    and not exists (select 1 from public.training_program_sessions where program_id = program_regular_id and week_number = 2 and day_of_week = 1 and order_index = 1);
  insert into public.training_program_sessions (program_id, session_id, session_name, sport, week_number, day_of_week, order_index)
  select program_regular_id, session_hiit_id, 'HIIT express — 20 min', 'Fitness', 2, 3, 1
  where program_regular_id is not null and session_hiit_id is not null
    and not exists (select 1 from public.training_program_sessions where program_id = program_regular_id and week_number = 2 and day_of_week = 3 and order_index = 1);
  insert into public.training_program_sessions (program_id, session_id, session_name, sport, week_number, day_of_week, order_index)
  select program_regular_id, session_fullbody_id, 'Full body salle — 45 min', 'Fitness', 2, 6, 1
  where program_regular_id is not null and session_fullbody_id is not null
    and not exists (select 1 from public.training_program_sessions where program_id = program_regular_id and week_number = 2 and day_of_week = 6 and order_index = 1);

  insert into public.training_program_sessions (program_id, session_id, session_name, sport, week_number, day_of_week, order_index)
  select program_regular_id, session_mobility_id, 'Mobilité récupération — 15 min', 'Mobilité', 3, 1, 1
  where program_regular_id is not null and session_mobility_id is not null
    and not exists (select 1 from public.training_program_sessions where program_id = program_regular_id and week_number = 3 and day_of_week = 1 and order_index = 1);
  insert into public.training_program_sessions (program_id, session_id, session_name, sport, week_number, day_of_week, order_index)
  select program_regular_id, session_hiit_id, 'HIIT express — 20 min', 'Fitness', 3, 3, 1
  where program_regular_id is not null and session_hiit_id is not null
    and not exists (select 1 from public.training_program_sessions where program_id = program_regular_id and week_number = 3 and day_of_week = 3 and order_index = 1);
  insert into public.training_program_sessions (program_id, session_id, session_name, sport, week_number, day_of_week, order_index)
  select program_regular_id, session_core_id, 'Gainage & stabilité — 25 min', 'Fitness', 3, 5, 1
  where program_regular_id is not null and session_core_id is not null
    and not exists (select 1 from public.training_program_sessions where program_id = program_regular_id and week_number = 3 and day_of_week = 5 and order_index = 1);
end $$;

notify pgrst, 'reload schema';
