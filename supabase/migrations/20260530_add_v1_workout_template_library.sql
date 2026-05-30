create temporary table _actyv_session_templates (
  name text primary key,
  sport text not null,
  description text not null,
  difficulty text
) on commit drop;

insert into _actyv_session_templates (name, sport, description, difficulty)
values
  ('Full Body Débutant', 'Fitness', 'Séance simple pour reprendre avec des bases full body accessibles.', 'Débutant'),
  ('Renforcement Général', 'Renforcement', 'Renforcement global avec travail complet du corps.', 'Intermédiaire'),
  ('Abdos Express', 'Renforcement', 'Routine courte pour renforcer la sangle abdominale.', 'Débutant'),
  ('Jambes & Fessiers', 'Renforcement', 'Séance ciblée bas du corps, cuisses et fessiers.', 'Intermédiaire'),
  ('Mobilité Quotidienne', 'Mobilité', 'Routine fluide pour délier les articulations et respirer.', 'Débutant'),
  ('Circuit Cardio', 'HIIT', 'Circuit cardio simple pour monter le rythme et relancer le souffle.', 'Intermédiaire'),
  ('Gainage Complet', 'Renforcement', 'Travail complet du tronc avec gainage et stabilité.', 'Intermédiaire'),
  ('Footing 30 min', 'Course', 'Footing simple avec échauffement et retour au calme.', 'Débutant'),
  ('Marche Active 30 min', 'Marche', 'Séance de marche progressive pour bouger facilement.', 'Débutant'),
  ('Fractionné Débutant', 'Course', 'Premiers intervalles accessibles avec récupération courte.', 'Débutant');

create temporary table _actyv_block_templates (
  session_name text not null,
  position integer not null,
  name text not null,
  block_type text not null,
  sets_count integer not null,
  target_value integer,
  charge_kg numeric,
  rest_seconds integer not null,
  primary key (session_name, position)
) on commit drop;

insert into _actyv_block_templates
  (session_name, position, name, block_type, sets_count, target_value, charge_kg, rest_seconds)
values
  ('Full Body Débutant', 1, 'Squats', 'reps', 3, 12, null, 45),
  ('Full Body Débutant', 2, 'Pompes adaptées', 'reps', 3, 8, null, 45),
  ('Full Body Débutant', 3, 'Fentes alternées', 'reps', 3, 10, null, 45),
  ('Full Body Débutant', 4, 'Gainage', 'duration', 3, 30, null, 45),
  ('Full Body Débutant', 5, 'Jumping jacks', 'duration', 3, 30, null, 45),

  ('Renforcement Général', 1, 'Squats', 'reps', 4, 12, null, 60),
  ('Renforcement Général', 2, 'Pompes', 'reps', 4, 10, null, 60),
  ('Renforcement Général', 3, 'Fentes alternées', 'reps', 4, 12, null, 60),
  ('Renforcement Général', 4, 'Gainage', 'duration', 4, 40, null, 60),
  ('Renforcement Général', 5, 'Mountain climbers', 'duration', 4, 30, null, 60),

  ('Abdos Express', 1, 'Crunchs', 'reps', 3, 15, null, 30),
  ('Abdos Express', 2, 'Gainage', 'duration', 3, 30, null, 30),
  ('Abdos Express', 3, 'Relevés de jambes', 'reps', 3, 12, null, 30),
  ('Abdos Express', 4, 'Mountain climbers', 'duration', 3, 30, null, 30),

  ('Jambes & Fessiers', 1, 'Squats', 'reps', 4, 15, null, 60),
  ('Jambes & Fessiers', 2, 'Fentes alternées', 'reps', 4, 12, null, 60),
  ('Jambes & Fessiers', 3, 'Pont fessier', 'reps', 4, 15, null, 60),
  ('Jambes & Fessiers', 4, 'Chaise contre un mur', 'duration', 3, 45, null, 60),
  ('Jambes & Fessiers', 5, 'Mollets debout', 'reps', 3, 20, null, 45),

  ('Mobilité Quotidienne', 1, 'Cercles d’épaules', 'duration', 2, 45, null, 15),
  ('Mobilité Quotidienne', 2, 'Rotation du buste', 'duration', 2, 45, null, 15),
  ('Mobilité Quotidienne', 3, 'Étirement ischios', 'duration', 2, 45, null, 15),
  ('Mobilité Quotidienne', 4, 'Ouverture de hanches', 'duration', 2, 45, null, 15),
  ('Mobilité Quotidienne', 5, 'Respiration calme', 'duration', 2, 60, null, 15),

  ('Circuit Cardio', 1, 'Jumping jacks', 'duration', 4, 30, null, 30),
  ('Circuit Cardio', 2, 'Montées de genoux', 'duration', 4, 30, null, 30),
  ('Circuit Cardio', 3, 'Squats sautés', 'reps', 4, 10, null, 45),
  ('Circuit Cardio', 4, 'Mountain climbers', 'duration', 4, 30, null, 30),
  ('Circuit Cardio', 5, 'Burpees adaptés', 'reps', 4, 8, null, 60),

  ('Gainage Complet', 1, 'Gainage face', 'duration', 3, 40, null, 30),
  ('Gainage Complet', 2, 'Gainage côté gauche', 'duration', 3, 30, null, 30),
  ('Gainage Complet', 3, 'Gainage côté droit', 'duration', 3, 30, null, 30),
  ('Gainage Complet', 4, 'Superman hold', 'duration', 3, 30, null, 30),
  ('Gainage Complet', 5, 'Dead bug', 'reps', 3, 12, null, 30),

  ('Footing 30 min', 1, 'Échauffement marche rapide', 'duration', 1, 300, null, 0),
  ('Footing 30 min', 2, 'Footing facile', 'duration', 1, 1200, null, 0),
  ('Footing 30 min', 3, 'Retour au calme', 'duration', 1, 300, null, 0),

  ('Marche Active 30 min', 1, 'Marche tranquille', 'duration', 1, 300, null, 0),
  ('Marche Active 30 min', 2, 'Marche active', 'duration', 1, 1200, null, 0),
  ('Marche Active 30 min', 3, 'Retour au calme', 'duration', 1, 300, null, 0),

  ('Fractionné Débutant', 1, 'Échauffement footing', 'duration', 1, 600, null, 0),
  ('Fractionné Débutant', 2, 'Accélérations courtes', 'duration', 8, 30, null, 30),
  ('Fractionné Débutant', 3, 'Retour au calme', 'duration', 1, 480, null, 0);

do $$
declare
  seed_owner_id uuid;
  session_row record;
  block_row record;
  target_session_id uuid;
  expected_block_count integer;
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
    raise notice 'Workout template library seed skipped: no auth.users row available.';
    return;
  end if;

  for session_row in
    select *
    from _actyv_session_templates
    order by name
  loop
    insert into public.training_sessions (user_id, name, sport, description, difficulty, visibility)
    select
      seed_owner_id,
      session_row.name,
      session_row.sport,
      session_row.description,
      session_row.difficulty,
      'public'
    where not exists (
      select 1
      from public.training_sessions
      where name = session_row.name
        and visibility = 'public'
    );

    update public.training_sessions
    set
      sport = session_row.sport,
      description = session_row.description,
      difficulty = session_row.difficulty
    where name = session_row.name
      and visibility = 'public'
      and (
        coalesce(sport, '') <> coalesce(session_row.sport, '')
        or coalesce(description, '') <> coalesce(session_row.description, '')
        or coalesce(difficulty, '') <> coalesce(session_row.difficulty, '')
      );

    select id
    into target_session_id
    from public.training_sessions
    where name = session_row.name
      and visibility = 'public'
    order by created_at asc
    limit 1;

    if target_session_id is null then
      continue;
    end if;

    for block_row in
      select *
      from _actyv_block_templates
      where session_name = session_row.name
      order by position asc
    loop
      insert into public.training_session_blocks
        (session_id, position, name, block_type, sets_count, target_value, charge_kg, rest_seconds)
      select
        target_session_id,
        block_row.position,
        block_row.name,
        block_row.block_type,
        block_row.sets_count,
        block_row.target_value,
        block_row.charge_kg,
        block_row.rest_seconds
      where not exists (
        select 1
        from public.training_session_blocks
        where session_id = target_session_id
          and position = block_row.position
      );

      update public.training_session_blocks
      set
        name = block_row.name,
        block_type = block_row.block_type,
        sets_count = block_row.sets_count,
        target_value = block_row.target_value,
        charge_kg = block_row.charge_kg,
        rest_seconds = block_row.rest_seconds
      where session_id = target_session_id
        and position = block_row.position
        and (
          coalesce(name, '') <> coalesce(block_row.name, '')
          or coalesce(block_type, '') <> coalesce(block_row.block_type, '')
          or coalesce(sets_count, 0) <> coalesce(block_row.sets_count, 0)
          or coalesce(target_value, 0) <> coalesce(block_row.target_value, 0)
          or coalesce(charge_kg, 0) <> coalesce(block_row.charge_kg, 0)
          or coalesce(rest_seconds, 0) <> coalesce(block_row.rest_seconds, 0)
        );
    end loop;

    select count(*)
    into expected_block_count
    from _actyv_block_templates
    where session_name = session_row.name;

    delete from public.training_session_blocks
    where session_id = target_session_id
      and position > expected_block_count;
  end loop;
end $$;

notify pgrst, 'reload schema';
