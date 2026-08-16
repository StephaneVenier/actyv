begin;

create table if not exists public.exercise_library (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  sport text,
  category text,
  movement_type text,
  tracking_type text not null check (tracking_type in ('reps', 'duration', 'distance', 'free')),
  supports_load boolean not null default false,
  primary_muscles text[] not null default '{}'::text[],
  secondary_muscles text[] not null default '{}'::text[],
  equipment text[] not null default '{}'::text[],
  difficulty text,
  description text,
  instructions text,
  image_path text,
  active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists exercise_library_active_idx
  on public.exercise_library (active);

create index if not exists exercise_library_tracking_type_idx
  on public.exercise_library (tracking_type);

create or replace function public.touch_exercise_library_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_exercise_library_updated_at on public.exercise_library;
create trigger trg_exercise_library_updated_at
before update on public.exercise_library
for each row
execute function public.touch_exercise_library_updated_at();

alter table public.exercise_library enable row level security;

drop policy if exists "Authenticated users can read exercise library" on public.exercise_library;
create policy "Authenticated users can read exercise library"
  on public.exercise_library
  for select
  to authenticated
  using (true);

revoke all on public.exercise_library from public;
revoke all on public.exercise_library from anon;
revoke all on public.exercise_library from authenticated;
grant select on public.exercise_library to authenticated;

with curated_seed (
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
    ('developpe-couche', 'Developpe couche', 'musculation', 'Pectoraux', 'push', 'reps', true, '{pectoraux}'::text[], '{triceps,epaules}'::text[], '{barre,banc}'::text[], 'intermediaire', '{"seed_source":"exercise-fallback"}'::jsonb),
    ('developpe-incline', 'Developpe incline', 'musculation', 'Pectoraux', 'push', 'reps', true, '{pectoraux}'::text[], '{triceps,epaules}'::text[], '{barre,banc}'::text[], 'intermediaire', '{"seed_source":"exercise-fallback"}'::jsonb),
    ('pompes', 'Pompes', 'fitness', 'Pectoraux', 'push', 'reps', false, '{pectoraux}'::text[], '{triceps,abdominaux}'::text[], '{poids-du-corps}'::text[], 'debutant', '{"seed_source":"exercise-fallback"}'::jsonb),
    ('dips', 'Dips', 'musculation', 'Pectoraux', 'push', 'reps', false, '{triceps}'::text[], '{pectoraux,epaules}'::text[], '{poids-du-corps}'::text[], 'intermediaire', '{"seed_source":"exercise-fallback"}'::jsonb),
    ('tirage-vertical', 'Tirage vertical', 'musculation', 'Dos', 'pull', 'reps', true, '{dos}'::text[], '{biceps}'::text[], '{machine,poulie}'::text[], 'debutant', '{"seed_source":"exercise-fallback"}'::jsonb),
    ('rowing-barre', 'Rowing barre', 'musculation', 'Dos', 'pull', 'reps', true, '{dos}'::text[], '{biceps,lombaires}'::text[], '{barre}'::text[], 'intermediaire', '{"seed_source":"exercise-fallback"}'::jsonb),
    ('rowing-haltere', 'Rowing haltere', 'musculation', 'Dos', 'pull', 'reps', true, '{dos}'::text[], '{biceps,lombaires}'::text[], '{halteres,banc}'::text[], 'intermediaire', '{"seed_source":"exercise-fallback"}'::jsonb),
    ('souleve-de-terre', 'Souleve de terre', 'musculation', 'Dos', 'hinge', 'reps', true, '{dos,fessiers,ischio-jambiers}'::text[], '{lombaires}'::text[], '{barre}'::text[], 'avance', '{"seed_source":"exercise-fallback"}'::jsonb),
    ('squat', 'Squat', 'musculation', 'Jambes', 'squat', 'reps', true, '{quadriceps,fessiers}'::text[], '{ischio-jambiers,abdominaux}'::text[], '{barre}'::text[], 'intermediaire', '{"seed_source":"exercise-fallback"}'::jsonb),
    ('presse-inclinee', 'Presse inclinee', 'musculation', 'Jambes', 'squat', 'reps', true, '{quadriceps,fessiers}'::text[], '{ischio-jambiers}'::text[], '{machine}'::text[], 'debutant', '{"seed_source":"exercise-fallback"}'::jsonb),
    ('fentes-bulgares', 'Fentes bulgares', 'musculation', 'Jambes', 'split-squat', 'reps', true, '{quadriceps,fessiers}'::text[], '{ischio-jambiers}'::text[], '{halteres,banc}'::text[], 'intermediaire', '{"seed_source":"exercise-fallback"}'::jsonb),
    ('mollets-debout', 'Mollets debout', 'musculation', 'Jambes', 'calves', 'reps', true, '{mollets}'::text[], '{}'::text[], '{poids-du-corps}'::text[], 'debutant', '{"seed_source":"exercise-fallback"}'::jsonb),
    ('developpe-militaire', 'Developpe militaire', 'musculation', 'Epaules', 'push', 'reps', true, '{epaules}'::text[], '{triceps}'::text[], '{barre,halteres}'::text[], 'intermediaire', '{"seed_source":"exercise-fallback"}'::jsonb),
    ('elevations-laterales', 'Elevations laterales', 'musculation', 'Epaules', 'raise', 'reps', true, '{epaules}'::text[], '{}'::text[], '{halteres}'::text[], 'debutant', '{"seed_source":"exercise-fallback"}'::jsonb),
    ('oiseau', 'Oiseau', 'musculation', 'Epaules', 'raise', 'reps', true, '{epaules}'::text[], '{dos}'::text[], '{halteres}'::text[], 'debutant', '{"seed_source":"exercise-fallback"}'::jsonb),
    ('curl-barre', 'Curl barre', 'musculation', 'Bras', 'curl', 'reps', true, '{biceps}'::text[], '{avant-bras}'::text[], '{barre}'::text[], 'debutant', '{"seed_source":"exercise-fallback"}'::jsonb),
    ('curl-halteres', 'Curl halteres', 'musculation', 'Bras', 'curl', 'reps', true, '{biceps}'::text[], '{avant-bras}'::text[], '{halteres}'::text[], 'debutant', '{"seed_source":"exercise-fallback"}'::jsonb),
    ('extension-triceps-poulie', 'Extension triceps poulie', 'musculation', 'Bras', 'extension', 'reps', true, '{triceps}'::text[], '{}'::text[], '{poulie}'::text[], 'debutant', '{"seed_source":"exercise-fallback"}'::jsonb),
    ('barre-au-front', 'Barre au front', 'musculation', 'Bras', 'extension', 'reps', true, '{triceps}'::text[], '{}'::text[], '{barre}'::text[], 'intermediaire', '{"seed_source":"exercise-fallback"}'::jsonb),
    ('gainage', 'Gainage', 'fitness', 'Abdos', 'core', 'duration', false, '{abdominaux}'::text[], '{lombaires}'::text[], '{tapis}'::text[], 'debutant', '{"seed_source":"exercise-fallback"}'::jsonb),
    ('crunch', 'Crunch', 'fitness', 'Abdos', 'core', 'reps', false, '{abdominaux}'::text[], '{}'::text[], '{tapis}'::text[], 'debutant', '{"seed_source":"exercise-fallback"}'::jsonb),
    ('releve-de-jambes', 'Releve de jambes', 'fitness', 'Abdos', 'core', 'reps', false, '{abdominaux}'::text[], '{lombaires}'::text[], '{tapis}'::text[], 'intermediaire', '{"seed_source":"exercise-fallback"}'::jsonb),
    ('burpees', 'Burpees', 'fitness', 'Cardio', 'conditioning', 'reps', false, '{corps-entier,cardio}'::text[], '{}'::text[], '{poids-du-corps}'::text[], 'intermediaire', '{"seed_source":"exercise-fallback"}'::jsonb),
    ('rameur', 'Rameur', 'cardio', 'Cardio', 'conditioning', 'distance', false, '{corps-entier,cardio}'::text[], '{}'::text[], '{rameur}'::text[], 'debutant', '{"seed_source":"exercise-fallback"}'::jsonb),
    ('air-bike', 'Air bike', 'cardio', 'Cardio', 'conditioning', 'distance', false, '{corps-entier,cardio}'::text[], '{}'::text[], '{assault-bike}'::text[], 'intermediaire', '{"seed_source":"exercise-fallback"}'::jsonb),
    ('course-tapis', 'Course tapis', 'fitness', 'Cardio', 'conditioning', 'distance', false, '{cardio}'::text[], '{quadriceps,mollets}'::text[], '{tapis}'::text[], 'debutant', '{"seed_source":"exercise-fallback"}'::jsonb),
    ('thrusters', 'Thrusters', 'fitness', 'Full body', 'conditioning', 'reps', true, '{corps-entier}'::text[], '{cardio}'::text[], '{halteres,barre}'::text[], 'avance', '{"seed_source":"exercise-fallback"}'::jsonb),
    ('kettlebell-swing', 'Kettlebell swing', 'fitness', 'Full body', 'hinge', 'reps', true, '{fessiers,ischio-jambiers}'::text[], '{epaules,cardio}'::text[], '{kettlebell}'::text[], 'intermediaire', '{"seed_source":"exercise-fallback"}'::jsonb),
    ('clean-and-press', 'Clean and press', 'musculation', 'Full body', 'olympic', 'reps', true, '{corps-entier}'::text[], '{cardio}'::text[], '{barre}'::text[], 'avance', '{"seed_source":"exercise-fallback"}'::jsonb),
    ('mountain-climbers', 'Mountain climbers', 'fitness', 'Full body', 'conditioning', 'reps', false, '{corps-entier,cardio}'::text[], '{abdominaux}'::text[], '{poids-du-corps}'::text[], 'debutant', '{"seed_source":"exercise-fallback"}'::jsonb)
),
existing_training_block_seed as (
  select
    public.normalize_mastery_exercise_key(tsb.name) as slug,
    min(tsb.name) as name,
    case
      when bool_or(coalesce(tsb.charge_kg, 0) > 0) then 'musculation'
      when min(tsb.block_type) = 'duration' then 'fitness'
      when min(tsb.block_type) = 'distance' then 'cardio'
      else 'fitness'
    end as sport,
    null::text as category,
    null::text as movement_type,
    coalesce(
      (
        array_agg(
          tsb.block_type
          order by
            case tsb.block_type
              when 'reps' then 1
              when 'duration' then 2
              when 'distance' then 3
              else 4
            end asc
        )
      )[1],
      'free'
    ) as tracking_type,
    bool_or(coalesce(tsb.charge_kg, 0) > 0) as supports_load
  from public.training_session_blocks tsb
  where nullif(btrim(tsb.name), '') is not null
  group by public.normalize_mastery_exercise_key(tsb.name)
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
  curated_seed.slug,
  curated_seed.name,
  curated_seed.sport,
  curated_seed.category,
  curated_seed.movement_type,
  curated_seed.tracking_type,
  curated_seed.supports_load,
  curated_seed.primary_muscles,
  curated_seed.secondary_muscles,
  curated_seed.equipment,
  curated_seed.difficulty,
  curated_seed.metadata
from curated_seed
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

insert into public.exercise_library (
  slug,
  name,
  sport,
  tracking_type,
  supports_load,
  metadata
)
select
  existing_training_block_seed.slug,
  existing_training_block_seed.name,
  existing_training_block_seed.sport,
  existing_training_block_seed.tracking_type,
  existing_training_block_seed.supports_load,
  jsonb_build_object('seed_source', 'training_session_blocks')
from existing_training_block_seed
where existing_training_block_seed.slug <> ''
on conflict (slug) do nothing;

notify pgrst, 'reload schema';

commit;
