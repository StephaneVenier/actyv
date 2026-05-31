create temporary table _actyv_program_templates (
  name text primary key,
  sport text not null,
  description text not null,
  difficulty text,
  duration_weeks integer not null
) on commit drop;

insert into _actyv_program_templates (name, sport, description, difficulty, duration_weeks)
values
  ('Débuter la course', 'Course', 'Premières sorties progressives pour lancer une routine course.', 'Débutant', 4),
  ('Premier 5 km', 'Course', 'Cycle simple pour préparer un premier 5 km avec régularité.', 'Débutant', 6),
  ('5 km < 30 min', 'Course', 'Travail d''allure et de cardio pour passer sous les 30 minutes.', 'Intermédiaire', 8),
  ('Premier 10 km', 'Course', 'Progression accessible pour tenir un premier 10 km sereinement.', 'Intermédiaire', 8),
  ('10 km < 1 h', 'Course', 'Programme intermédiaire pour viser un 10 km en moins d''une heure.', 'Intermédiaire', 10),
  ('Semi marathon finisher', 'Course', 'Base d''endurance, renforcement et récupération pour finir un semi.', 'Intermédiaire', 12),
  ('Marathon finisher', 'Course', 'Cycle long avec endurance, soutien musculaire et récupération.', 'Intermédiaire', 16),
  ('Objectif 10 000 pas', 'Marche', 'Routine simple pour installer plus de marche au quotidien.', 'Débutant', 6),
  ('Reprise activité physique', 'Marche', 'Retour en mouvement avec marche, mobilité et full body doux.', 'Débutant', 4),
  ('Reprise vélo', 'Vélo', 'Reprise progressive avec cardio léger, jambes et mobilité.', 'Débutant', 6),
  ('Premier 50 km vélo', 'Vélo', 'Préparation endurance et renforcement pour viser 50 km.', 'Intermédiaire', 8),
  ('Renforcement débutant', 'Renforcement', 'Fondations musculaires simples pour reprendre proprement.', 'Débutant', 4),
  ('Renforcement coureur', 'Renforcement', 'Soutien jambes, tronc et stabilité pour mieux courir.', 'Intermédiaire', 8),
  ('Gainage progressif', 'Renforcement', 'Progression courte pour renforcer le centre du corps.', 'Débutant', 4),
  ('Mobilité quotidienne', 'Mobilité', 'Routine quotidienne sur 21 jours pour délier et respirer.', 'Débutant', 3);

create temporary table _actyv_program_schedule (
  program_name text not null,
  session_name text not null,
  sport text not null,
  week_number integer not null,
  day_of_week integer not null,
  order_index integer not null,
  primary key (program_name, week_number, day_of_week, order_index)
) on commit drop;

insert into _actyv_program_schedule (program_name, session_name, sport, week_number, day_of_week, order_index)
select 'Débuter la course', 'Footing 30 min', 'Course', week_number, 2, 1
from generate_series(1, 4) as week_number;

insert into _actyv_program_schedule (program_name, session_name, sport, week_number, day_of_week, order_index)
select 'Débuter la course', 'Mobilité récupération — 15 min', 'Mobilité', week_number, 5, 1
from generate_series(1, 4) as week_number;

insert into _actyv_program_schedule (program_name, session_name, sport, week_number, day_of_week, order_index)
select 'Premier 5 km', 'Footing 30 min', 'Course', week_number, 2, 1
from generate_series(1, 6) as week_number;

insert into _actyv_program_schedule (program_name, session_name, sport, week_number, day_of_week, order_index)
select 'Premier 5 km', 'Fractionné Débutant', 'Course', week_number, 4, 1
from generate_series(1, 6) as week_number;

insert into _actyv_program_schedule (program_name, session_name, sport, week_number, day_of_week, order_index)
select 'Premier 5 km', 'Mobilité récupération — 15 min', 'Mobilité', week_number, 6, 1
from generate_series(1, 6) as week_number;

insert into _actyv_program_schedule (program_name, session_name, sport, week_number, day_of_week, order_index)
select '5 km < 30 min', 'Footing 30 min', 'Course', week_number, 2, 1
from generate_series(1, 8) as week_number;

insert into _actyv_program_schedule (program_name, session_name, sport, week_number, day_of_week, order_index)
select '5 km < 30 min', 'Fractionné Débutant', 'Course', week_number, 4, 1
from generate_series(1, 8) as week_number;

insert into _actyv_program_schedule (program_name, session_name, sport, week_number, day_of_week, order_index)
select '5 km < 30 min', 'HIIT express — 20 min', 'HIIT', week_number, 6, 1
from generate_series(1, 8) as week_number;

insert into _actyv_program_schedule (program_name, session_name, sport, week_number, day_of_week, order_index)
select 'Premier 10 km', 'Footing 30 min', 'Course', week_number, 2, 1
from generate_series(1, 8) as week_number;

insert into _actyv_program_schedule (program_name, session_name, sport, week_number, day_of_week, order_index)
select 'Premier 10 km', 'Fractionné Débutant', 'Course', week_number, 4, 1
from generate_series(1, 8) as week_number;

insert into _actyv_program_schedule (program_name, session_name, sport, week_number, day_of_week, order_index)
select 'Premier 10 km', 'Renfo coureur — 35 min', 'Renforcement', week_number, 6, 1
from generate_series(1, 8) as week_number;

insert into _actyv_program_schedule (program_name, session_name, sport, week_number, day_of_week, order_index)
select '10 km < 1 h', 'Footing 30 min', 'Course', week_number, 2, 1
from generate_series(1, 10) as week_number;

insert into _actyv_program_schedule (program_name, session_name, sport, week_number, day_of_week, order_index)
select '10 km < 1 h', 'Fractionné Débutant', 'Course', week_number, 4, 1
from generate_series(1, 10) as week_number;

insert into _actyv_program_schedule (program_name, session_name, sport, week_number, day_of_week, order_index)
select '10 km < 1 h', 'Renfo coureur — 35 min', 'Renforcement', week_number, 6, 1
from generate_series(1, 10) as week_number;

insert into _actyv_program_schedule (program_name, session_name, sport, week_number, day_of_week, order_index)
select 'Semi marathon finisher', 'Footing 30 min', 'Course', week_number, 2, 1
from generate_series(1, 12) as week_number;

insert into _actyv_program_schedule (program_name, session_name, sport, week_number, day_of_week, order_index)
select 'Semi marathon finisher', 'Fractionné Débutant', 'Course', week_number, 4, 1
from generate_series(1, 12) as week_number;

insert into _actyv_program_schedule (program_name, session_name, sport, week_number, day_of_week, order_index)
select 'Semi marathon finisher', 'Renfo coureur — 35 min', 'Renforcement', week_number, 6, 1
from generate_series(1, 12) as week_number;

insert into _actyv_program_schedule (program_name, session_name, sport, week_number, day_of_week, order_index)
select 'Semi marathon finisher', 'Mobilité récupération — 15 min', 'Mobilité', week_number, 7, 1
from generate_series(1, 12) as week_number;

insert into _actyv_program_schedule (program_name, session_name, sport, week_number, day_of_week, order_index)
select 'Marathon finisher', 'Footing 30 min', 'Course', week_number, 2, 1
from generate_series(1, 16) as week_number;

insert into _actyv_program_schedule (program_name, session_name, sport, week_number, day_of_week, order_index)
select 'Marathon finisher', 'Fractionné Débutant', 'Course', week_number, 4, 1
from generate_series(1, 16) as week_number;

insert into _actyv_program_schedule (program_name, session_name, sport, week_number, day_of_week, order_index)
select 'Marathon finisher', 'Renfo coureur — 35 min', 'Renforcement', week_number, 6, 1
from generate_series(1, 16) as week_number;

insert into _actyv_program_schedule (program_name, session_name, sport, week_number, day_of_week, order_index)
select 'Marathon finisher', 'Mobilité récupération — 15 min', 'Mobilité', week_number, 7, 1
from generate_series(1, 16) as week_number;

insert into _actyv_program_schedule (program_name, session_name, sport, week_number, day_of_week, order_index)
select 'Objectif 10 000 pas', 'Marche Active 30 min', 'Marche', week_number, 2, 1
from generate_series(1, 6) as week_number;

insert into _actyv_program_schedule (program_name, session_name, sport, week_number, day_of_week, order_index)
select 'Objectif 10 000 pas', 'Mobilité Quotidienne', 'Mobilité', week_number, 5, 1
from generate_series(1, 6) as week_number;

insert into _actyv_program_schedule (program_name, session_name, sport, week_number, day_of_week, order_index)
select 'Reprise activité physique', 'Marche Active 30 min', 'Marche', week_number, 2, 1
from generate_series(1, 4) as week_number;

insert into _actyv_program_schedule (program_name, session_name, sport, week_number, day_of_week, order_index)
select 'Reprise activité physique', 'Full Body Débutant', 'Fitness', week_number, 5, 1
from generate_series(1, 4) as week_number;

insert into _actyv_program_schedule (program_name, session_name, sport, week_number, day_of_week, order_index)
select 'Reprise vélo', 'Circuit Cardio', 'HIIT', week_number, 2, 1
from generate_series(1, 6) as week_number;

insert into _actyv_program_schedule (program_name, session_name, sport, week_number, day_of_week, order_index)
select 'Reprise vélo', 'Jambes & Fessiers', 'Renforcement', week_number, 5, 1
from generate_series(1, 6) as week_number;

insert into _actyv_program_schedule (program_name, session_name, sport, week_number, day_of_week, order_index)
select 'Premier 50 km vélo', 'Circuit Cardio', 'HIIT', week_number, 2, 1
from generate_series(1, 8) as week_number;

insert into _actyv_program_schedule (program_name, session_name, sport, week_number, day_of_week, order_index)
select 'Premier 50 km vélo', 'Jambes & Fessiers', 'Renforcement', week_number, 5, 1
from generate_series(1, 8) as week_number;

insert into _actyv_program_schedule (program_name, session_name, sport, week_number, day_of_week, order_index)
select 'Renforcement débutant', 'Full Body Débutant', 'Fitness', week_number, 1, 1
from generate_series(1, 4) as week_number;

insert into _actyv_program_schedule (program_name, session_name, sport, week_number, day_of_week, order_index)
select 'Renforcement débutant', 'Abdos Express', 'Renforcement', week_number, 3, 1
from generate_series(1, 4) as week_number;

insert into _actyv_program_schedule (program_name, session_name, sport, week_number, day_of_week, order_index)
select 'Renforcement débutant', 'Mobilité Quotidienne', 'Mobilité', week_number, 5, 1
from generate_series(1, 4) as week_number;

insert into _actyv_program_schedule (program_name, session_name, sport, week_number, day_of_week, order_index)
select 'Renforcement coureur', 'Renfo coureur — 35 min', 'Renforcement', week_number, 2, 1
from generate_series(1, 8) as week_number;

insert into _actyv_program_schedule (program_name, session_name, sport, week_number, day_of_week, order_index)
select 'Renforcement coureur', 'Gainage & stabilité — 25 min', 'Renforcement', week_number, 4, 1
from generate_series(1, 8) as week_number;

insert into _actyv_program_schedule (program_name, session_name, sport, week_number, day_of_week, order_index)
select 'Renforcement coureur', 'Gainage Complet', 'Renforcement', week_number, 6, 1
from generate_series(1, 8) as week_number;

insert into _actyv_program_schedule (program_name, session_name, sport, week_number, day_of_week, order_index)
select 'Gainage progressif', 'Gainage & stabilité — 25 min', 'Renforcement', week_number, 2, 1
from generate_series(1, 4) as week_number;

insert into _actyv_program_schedule (program_name, session_name, sport, week_number, day_of_week, order_index)
select 'Gainage progressif', 'Gainage Complet', 'Renforcement', week_number, 5, 1
from generate_series(1, 4) as week_number;

insert into _actyv_program_schedule (program_name, session_name, sport, week_number, day_of_week, order_index)
select
  'Mobilité quotidienne',
  case when day_of_week in (6, 7) then 'Mobilité récupération — 15 min' else 'Mobilité Quotidienne' end,
  'Mobilité',
  week_number,
  day_of_week,
  1
from generate_series(1, 3) as week_number
cross join generate_series(1, 7) as day_of_week;

do $$
declare
  seed_owner_id uuid;
  program_row record;
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
    raise notice 'Public Actyv training programs seed skipped: no auth.users row available.';
    return;
  end if;

  for program_row in
    select *
    from _actyv_program_templates
    order by name
  loop
    insert into public.training_programs (
      user_id,
      name,
      description,
      sport,
      difficulty,
      duration_weeks,
      visibility,
      start_date
    )
    select
      seed_owner_id,
      program_row.name,
      program_row.description,
      program_row.sport,
      program_row.difficulty,
      program_row.duration_weeks,
      'public',
      current_date
    where not exists (
      select 1
      from public.training_programs
      where name = program_row.name
        and visibility = 'public'
    );

    update public.training_programs
    set
      description = program_row.description,
      sport = program_row.sport,
      difficulty = program_row.difficulty,
      duration_weeks = program_row.duration_weeks
    where name = program_row.name
      and visibility = 'public'
      and (
        coalesce(description, '') <> coalesce(program_row.description, '')
        or coalesce(sport, '') <> coalesce(program_row.sport, '')
        or coalesce(difficulty, '') <> coalesce(program_row.difficulty, '')
        or coalesce(duration_weeks, 0) <> coalesce(program_row.duration_weeks, 0)
      );
  end loop;

  insert into public.training_program_sessions (
    program_id,
    session_id,
    session_name,
    sport,
    week_number,
    day_of_week,
    order_index
  )
  select
    programs.id,
    sessions.id,
    schedule.session_name,
    schedule.sport,
    schedule.week_number,
    schedule.day_of_week,
    schedule.order_index
  from _actyv_program_schedule schedule
  join public.training_programs programs
    on programs.name = schedule.program_name
   and programs.visibility = 'public'
  join public.training_sessions sessions
    on sessions.name = schedule.session_name
   and sessions.visibility = 'public'
  where not exists (
    select 1
    from public.training_program_sessions existing
    where existing.program_id = programs.id
      and existing.week_number = schedule.week_number
      and existing.day_of_week = schedule.day_of_week
      and existing.order_index = schedule.order_index
  );

  update public.training_program_sessions existing
  set
    session_id = sessions.id,
    session_name = schedule.session_name,
    sport = schedule.sport
  from _actyv_program_schedule schedule
  join public.training_programs programs
    on programs.name = schedule.program_name
   and programs.visibility = 'public'
  join public.training_sessions sessions
    on sessions.name = schedule.session_name
   and sessions.visibility = 'public'
  where existing.program_id = programs.id
    and existing.week_number = schedule.week_number
    and existing.day_of_week = schedule.day_of_week
    and existing.order_index = schedule.order_index
    and (
      existing.session_id <> sessions.id
      or coalesce(existing.session_name, '') <> coalesce(schedule.session_name, '')
      or coalesce(existing.sport, '') <> coalesce(schedule.sport, '')
    );

  delete from public.training_program_sessions existing
  using public.training_programs programs
  where existing.program_id = programs.id
    and programs.visibility = 'public'
    and programs.name in (select name from _actyv_program_templates)
    and not exists (
      select 1
      from _actyv_program_schedule schedule
      where schedule.program_name = programs.name
        and schedule.week_number = existing.week_number
        and schedule.day_of_week = existing.day_of_week
        and schedule.order_index = existing.order_index
    );
end $$;

notify pgrst, 'reload schema';
