begin;

with missing_exercises (
  slug,
  name,
  sport,
  category,
  movement_type,
  tracking_type,
  supports_load,
  primary_muscles,
  secondary_muscles,
  equipment,
  difficulty,
  metadata
) as (
  values
    (
      'developpe-halteres-leger',
      'Developpe halteres leger',
      'musculation',
      'Pectoraux',
      'push',
      'reps',
      true,
      '{pectoraux}'::text[],
      '{triceps,epaules}'::text[],
      '{halteres,banc}'::text[],
      'debutant',
      '{"seed_source":"exercise-library-mastery-links","seed_patch":"20260816_03"}'::jsonb
    ),
    (
      'etirement-chaine-posterieure',
      'Etirement chaine posterieure',
      'fitness',
      'Mobilite',
      'stretch',
      'duration',
      false,
      '{ischio-jambiers,lombaires}'::text[],
      '{mollets}'::text[],
      '{tapis}'::text[],
      'debutant',
      '{"seed_source":"exercise-library-mastery-links","seed_patch":"20260816_03"}'::jsonb
    ),
    (
      'mobilite-dynamique',
      'Mobilite dynamique',
      'fitness',
      'Mobilite',
      'mobility',
      'duration',
      false,
      '{corps-entier}'::text[],
      '{}'::text[],
      '{poids-du-corps}'::text[],
      'debutant',
      '{"seed_source":"exercise-library-mastery-links","seed_patch":"20260816_03"}'::jsonb
    ),
    (
      'ouverture-thoracique',
      'Ouverture thoracique',
      'fitness',
      'Mobilite',
      'mobility',
      'duration',
      false,
      '{dos,epaules}'::text[],
      '{pectoraux}'::text[],
      '{poids-du-corps}'::text[],
      'debutant',
      '{"seed_source":"exercise-library-mastery-links","seed_patch":"20260816_03"}'::jsonb
    ),
    (
      'presse-a-cuisses',
      'Presse a cuisses',
      'musculation',
      'Jambes',
      'squat',
      'reps',
      true,
      '{quadriceps,fessiers}'::text[],
      '{ischio-jambiers}'::text[],
      '{machine}'::text[],
      'debutant',
      '{"seed_source":"exercise-library-mastery-links","seed_patch":"20260816_03"}'::jsonb
    ),
    (
      'retour-calme-assis',
      'Retour calme assis',
      'fitness',
      'Mobilite',
      'recovery',
      'duration',
      false,
      '{}'::text[],
      '{}'::text[],
      '{tapis}'::text[],
      'debutant',
      '{"seed_source":"exercise-library-mastery-links","seed_patch":"20260816_03"}'::jsonb
    ),
    (
      'rowing-assis',
      'Rowing assis',
      'musculation',
      'Dos',
      'pull',
      'reps',
      true,
      '{dos}'::text[],
      '{biceps,avant-bras}'::text[],
      '{machine,poulie}'::text[],
      'debutant',
      '{"seed_source":"exercise-library-mastery-links","seed_patch":"20260816_03"}'::jsonb
    ),
    (
      'ski-erg',
      'Ski erg',
      'cardio',
      'Cardio',
      'conditioning',
      'distance',
      false,
      '{corps-entier,cardio}'::text[],
      '{dos,epaules}'::text[],
      '{machine}'::text[],
      'intermediaire',
      '{"seed_source":"exercise-library-mastery-links","seed_patch":"20260816_03"}'::jsonb
    )
)
insert into public.exercise_library (
  slug,
  name,
  sport,
  category,
  movement_type,
  tracking_type,
  supports_load,
  primary_muscles,
  secondary_muscles,
  equipment,
  difficulty,
  metadata
)
select
  missing_exercises.slug,
  missing_exercises.name,
  missing_exercises.sport,
  missing_exercises.category,
  missing_exercises.movement_type,
  missing_exercises.tracking_type,
  missing_exercises.supports_load,
  missing_exercises.primary_muscles,
  missing_exercises.secondary_muscles,
  missing_exercises.equipment,
  missing_exercises.difficulty,
  missing_exercises.metadata
from missing_exercises
on conflict (slug) do update
set
  name = excluded.name,
  sport = coalesce(public.exercise_library.sport, excluded.sport),
  category = coalesce(public.exercise_library.category, excluded.category),
  movement_type = coalesce(public.exercise_library.movement_type, excluded.movement_type),
  tracking_type = coalesce(public.exercise_library.tracking_type, excluded.tracking_type),
  supports_load = public.exercise_library.supports_load or excluded.supports_load,
  primary_muscles = case
    when coalesce(array_length(public.exercise_library.primary_muscles, 1), 0) = 0 then excluded.primary_muscles
    else public.exercise_library.primary_muscles
  end,
  secondary_muscles = case
    when coalesce(array_length(public.exercise_library.secondary_muscles, 1), 0) = 0 then excluded.secondary_muscles
    else public.exercise_library.secondary_muscles
  end,
  equipment = case
    when coalesce(array_length(public.exercise_library.equipment, 1), 0) = 0 then excluded.equipment
    else public.exercise_library.equipment
  end,
  difficulty = coalesce(public.exercise_library.difficulty, excluded.difficulty),
  metadata = public.exercise_library.metadata || excluded.metadata;

update public.training_session_blocks tsb
set exercise_id = el.id
from public.exercise_library el
where el.slug in (
    'developpe-halteres-leger',
    'etirement-chaine-posterieure',
    'mobilite-dynamique',
    'ouverture-thoracique',
    'presse-a-cuisses',
    'retour-calme-assis',
    'rowing-assis',
    'ski-erg'
  )
  and nullif(btrim(tsb.name), '') is not null
  and public.normalize_mastery_exercise_key(tsb.name) = el.slug
  and (tsb.exercise_id is null or tsb.exercise_id <> el.id);

update public.mastery_exercise_links mel
set exercise_id = el.id
from public.exercise_library el
where el.slug in (
    'developpe-halteres-leger',
    'etirement-chaine-posterieure',
    'mobilite-dynamique',
    'ouverture-thoracique',
    'presse-a-cuisses',
    'retour-calme-assis',
    'rowing-assis',
    'ski-erg'
  )
  and public.normalize_mastery_exercise_key(coalesce(nullif(mel.exercise_name, ''), mel.exercise_key)) = el.slug
  and (mel.exercise_id is null or mel.exercise_id <> el.id);

commit;
