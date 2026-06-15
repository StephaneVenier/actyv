create extension if not exists pgcrypto;

create table if not exists public.users (
  id uuid primary key,
  name text,
  email text unique not null,
  avatar_url text,
  created_at timestamptz default now()
);

create table if not exists public.challenges (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  sport text,
  start_date date not null,
  end_date date,
  goal_km numeric,
  goal_type text,
  goal_value numeric,
  visibility text not null default 'private',
  invite_code text unique,
  created_by uuid,
  is_deleted boolean not null default false,
  created_at timestamptz default now()
);

create table if not exists public.challenge_members (
  id uuid primary key default gen_random_uuid(),
  challenge_id uuid not null references public.challenges(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  user_email text,
  role text not null default 'member',
  status text not null default 'active',
  joined_at timestamptz default now(),
  unique (challenge_id, user_id, user_email)
);

create table if not exists public.activities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  user_email text,
  challenge_id uuid references public.challenges(id) on delete set null,
  sport text,
  distance_km numeric(6,2),
  duration_minutes integer,
  unit_type text,
  unit_value numeric,
  exercise_type text,
  comment text,
  likes_count integer not null default 0,
  boosts_count integer not null default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.program_templates (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  sport_type text not null,
  weeks_count integer not null default 1,
  created_at timestamptz default now()
);

create table if not exists public.program_sessions (
  id uuid primary key default gen_random_uuid(),
  challenge_id uuid not null references public.challenges(id) on delete cascade,
  week_number integer not null,
  title text not null,
  description text,
  session_type text,
  target_duration integer,
  target_distance numeric(6,2),
  session_date date,
  created_at timestamptz default now()
);

create table if not exists public.activity_reactions (
  id uuid primary key default gen_random_uuid(),
  activity_id uuid not null references public.activities(id) on delete cascade,
  user_id uuid not null,
  reaction_type text not null,
  created_at timestamptz default now(),
  unique (activity_id, user_id, reaction_type)
);

create table if not exists public.activity_comments (
  id uuid primary key default gen_random_uuid(),
  activity_id uuid not null references public.activities(id) on delete cascade,
  user_id uuid not null,
  comment_text text not null,
  created_at timestamptz default now()
);

alter table if exists public.profiles
  add column if not exists total_xp integer not null default 0,
  add column if not exists level integer not null default 1;

create or replace view public.public_profiles as
select
  id,
  nullif(trim(username), '') as username,
  avatar_url,
  level,
  total_xp
from public.profiles;

grant select on public.public_profiles to anon;
grant select on public.public_profiles to authenticated;

create table if not exists public.challenge_participants (
  id uuid primary key default gen_random_uuid(),
  challenge_id uuid not null references public.challenges(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'participant',
  joined_at timestamptz not null default now(),
  unique (challenge_id, user_id)
);

create table if not exists public.activity_interactions (
  id uuid primary key default gen_random_uuid(),
  activity_id uuid not null references public.activities(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null,
  created_at timestamptz not null default now(),
  unique (activity_id, user_id, type)
);

create table if not exists public.xp_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  event_type text not null,
  xp_amount integer not null default 0,
  target_id text,
  created_at timestamptz not null default now()
);

create index if not exists xp_events_user_source_created_idx
  on public.xp_events (user_id, event_type, created_at);

create unique index if not exists xp_events_once_per_target_idx
  on public.xp_events (
    user_id,
    event_type,
    target_id
  )
  where target_id is not null;

create table if not exists public.user_badges (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  badge_code text not null,
  unlocked_at timestamptz not null default now(),
  unique (user_id, badge_code)
);

alter table if exists public.xp_events enable row level security;
alter table if exists public.user_badges enable row level security;

drop policy if exists "Users can read own xp events" on public.xp_events;
create policy "Users can read own xp events"
  on public.xp_events for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Users can insert own xp events" on public.xp_events;
create policy "Users can insert own xp events"
  on public.xp_events for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "Users can read own badges" on public.user_badges;
create policy "Users can read own badges"
  on public.user_badges for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert own badges" on public.user_badges;
create policy "Users can insert own badges"
  on public.user_badges for insert
  with check (auth.uid() = user_id);

create or replace function public.calculate_level(total_xp integer)
returns integer
language sql
immutable
as $$
  select case
    when total_xp >= 17500 then 20 + floor((total_xp - 17500) / 3500)::integer
    when total_xp >= 14500 then 19
    when total_xp >= 12000 then 18
    when total_xp >= 10000 then 17
    when total_xp >= 8300 then 16
    when total_xp >= 6900 then 15
    when total_xp >= 5850 then 14
    when total_xp >= 4900 then 13
    when total_xp >= 4050 then 12
    when total_xp >= 3300 then 11
    when total_xp >= 2650 then 10
    when total_xp >= 2075 then 9
    when total_xp >= 1575 then 8
    when total_xp >= 1150 then 7
    when total_xp >= 800 then 6
    when total_xp >= 525 then 5
    when total_xp >= 325 then 4
    when total_xp >= 175 then 3
    when total_xp >= 75 then 2
    else 1
  end;
$$;

create or replace function public.award_xp(
  p_user_id uuid,
  p_source text,
  p_target_id text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  reward_xp integer := 0;
  daily_xp integer := 0;
  daily_count integer := 0;
  next_total_xp integer := 0;
  next_level integer := 1;
begin
  if auth.uid() is null or p_user_id is null then
    return;
  end if;

  reward_xp := case p_source
    when 'challenge_created' then 20
    when 'challenge_joined' then 10
    when 'activity_added' then 25
    when 'like_received' then 1
    when 'boost_received' then 3
    when 'challenge_completed' then 50
    when 'session_created' then 5
    when 'session_completed' then 10
    when 'workout_completed' then 10
    when 'program_session_completed' then 15
    when 'program_completed' then 50
    when 'program_created' then 10
    when 'program_shared' then 15
    else 0
  end;

  if reward_xp <= 0 then
    return;
  end if;

  if p_source in ('challenge_created', 'activity_added') then
    select count(*) into daily_count
    from public.xp_events
    where user_id = p_user_id
      and event_type = p_source
      and created_at >= date_trunc('day', now());

    if (p_source = 'challenge_created' and daily_count >= 2)
      or (p_source = 'activity_added' and daily_count >= 4) then
      return;
    end if;
  end if;

  if p_source in ('like_received', 'boost_received') then
    select coalesce(sum(xp_amount), 0) into daily_xp
    from public.xp_events
    where user_id = p_user_id
      and event_type = p_source
      and created_at >= date_trunc('day', now());

    if (p_source = 'like_received' and daily_xp + reward_xp > 20)
      or (p_source = 'boost_received' and daily_xp + reward_xp > 30) then
      return;
    end if;
  end if;

  insert into public.xp_events (user_id, event_type, xp_amount, target_id)
  values (
    p_user_id,
    p_source,
    reward_xp,
    p_target_id
  )
  on conflict do nothing;

  if not found then
    return;
  end if;

  update public.profiles
  set
    total_xp = coalesce(total_xp, 0) + reward_xp,
    level = public.calculate_level(coalesce(total_xp, 0) + reward_xp)
  where id = p_user_id
  returning total_xp, level into next_total_xp, next_level;

  insert into public.user_badges (user_id, badge_code)
  select p_user_id, badge_code
  from (
    values
      ('premier_pas', p_source = 'activity_added'),
      ('challenger', p_source = 'challenge_created'),
      ('collectif', p_source = 'challenge_joined'),
      ('boosteur', p_source in ('like_received', 'boost_received')),
      (
        'actyv_motive',
        (
          select count(*)
          from public.activities
          where user_id = p_user_id
        ) >= 10
      ),
      (
        'actyv_regulier',
        (
          select count(*)
          from public.activities
          where user_id = p_user_id
        ) >= 5
      )
  ) as badge_rules(badge_code, should_unlock)
  where should_unlock
  on conflict (user_id, badge_code) do nothing;
end;
$$;

grant execute on function public.award_xp(uuid, text, text) to authenticated;

create or replace function public.award_xp_internal(
  p_user_id uuid,
  p_source text,
  p_target_id text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  reward_xp integer := 0;
  daily_xp integer := 0;
  daily_count integer := 0;
  next_level integer := 1;
begin
  if p_user_id is null then
    return;
  end if;

  reward_xp := case p_source
    when 'challenge_created' then 20
    when 'challenge_joined' then 10
    when 'activity_added' then 25
    when 'like_received' then 1
    when 'boost_received' then 3
    when 'challenge_completed' then 50
    when 'session_created' then 5
    when 'session_completed' then 10
    when 'workout_completed' then 10
    when 'program_session_completed' then 15
    when 'program_completed' then 50
    when 'program_created' then 10
    when 'program_shared' then 15
    else 0
  end;

  if reward_xp <= 0 then
    return;
  end if;

  if p_source in ('challenge_created', 'activity_added') then
    select count(*) into daily_count
    from public.xp_events
    where user_id = p_user_id
      and event_type = p_source
      and created_at >= date_trunc('day', now());

    if (p_source = 'challenge_created' and daily_count >= 2)
      or (p_source = 'activity_added' and daily_count >= 4) then
      return;
    end if;
  end if;

  if p_source in ('like_received', 'boost_received') then
    select coalesce(sum(xp_amount), 0) into daily_xp
    from public.xp_events
    where user_id = p_user_id
      and event_type = p_source
      and created_at >= date_trunc('day', now());

    if (p_source = 'like_received' and daily_xp + reward_xp > 20)
      or (p_source = 'boost_received' and daily_xp + reward_xp > 30) then
      return;
    end if;
  end if;

  insert into public.xp_events (user_id, event_type, xp_amount, target_id)
  values (
    p_user_id,
    p_source,
    reward_xp,
    p_target_id
  )
  on conflict do nothing;

  if not found then
    return;
  end if;

  update public.profiles
  set
    total_xp = coalesce(total_xp, 0) + reward_xp,
    level = public.calculate_level(coalesce(total_xp, 0) + reward_xp)
  where id = p_user_id
  returning level into next_level;

  perform public.refresh_user_badges(p_user_id);
end;
$$;

create or replace function public.grant_user_badge(
  p_user_id uuid,
  p_badge_code text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  canonical_badge_code text;
begin
  if p_user_id is null or p_badge_code is null or length(trim(p_badge_code)) = 0 then
    return;
  end if;

  canonical_badge_code := case trim(lower(p_badge_code))
    when 'premier_pas' then 'first_activity'
    when 'actyv_regulier' then 'five_activities'
    when 'actyv_motive' then 'ten_activities'
    when 'challenger' then 'first_challenge'
    when 'collectif' then 'first_joined_challenge'
    when 'distance_10_km' then 'distance_10'
    when 'distance_50_km' then 'distance_50'
    when 'boosteur' then 'first_like'
    when 'premiere_seance_terminee' then 'first_session_completed'
    when 'cinq_seances_terminees' then 'five_sessions_completed'
    when 'dix_seances_terminees' then 'ten_sessions_completed'
    when 'premier_programme_cree' then 'first_program_created'
    when 'programme_partage' then 'program_shared'
    when 'premier_programme_termine' then 'program_completed'
    else trim(p_badge_code)
  end;

  if exists (
    select 1
    from public.user_badges
    where user_id = p_user_id
      and (
        case trim(lower(badge_code))
          when 'premier_pas' then 'first_activity'
          when 'actyv_regulier' then 'five_activities'
          when 'actyv_motive' then 'ten_activities'
          when 'challenger' then 'first_challenge'
          when 'collectif' then 'first_joined_challenge'
          when 'distance_10_km' then 'distance_10'
          when 'distance_50_km' then 'distance_50'
          when 'boosteur' then 'first_like'
          when 'premiere_seance_terminee' then 'first_session_completed'
          when 'cinq_seances_terminees' then 'five_sessions_completed'
          when 'dix_seances_terminees' then 'ten_sessions_completed'
          when 'premier_programme_cree' then 'first_program_created'
          when 'programme_partage' then 'program_shared'
          when 'premier_programme_termine' then 'program_completed'
          else trim(badge_code)
        end
      ) = canonical_badge_code
  ) then
    return;
  end if;

  insert into public.user_badges (user_id, badge_code)
  values (p_user_id, canonical_badge_code)
  on conflict (user_id, badge_code) do nothing;
end;
$$;

create or replace function public.refresh_user_badges(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  badge_count integer := 0;
  badge_codes text[];
  activity_count integer := 0;
  created_challenges_count integer := 0;
  joined_challenges_count integer := 0;
  total_distance numeric := 0;
  reactions_given_count integer := 0;
  reactions_received_count integer := 0;
  completed_sessions_count integer := 0;
  created_programs_count integer := 0;
  shared_programs_count integer := 0;
  completed_challenges_count integer := 0;
  completed_programs_count integer := 0;
  distinct_sports_count integer := 0;
  daily_session_count integer := 0;
  daily_session_streak integer := 0;
  total_steps_count bigint := 0;
  best_daily_steps integer := 0;
  rolling_weekly_steps integer := 0;
  first_health_connect_sync_count integer := 0;
  ordered_daily_dates date[];
  streak_date date;
begin
  if p_user_id is null then
    return jsonb_build_object(
      'status', 'error',
      'reason', 'missing_user_id'
    );
  end if;

  select count(*)
  into activity_count
  from public.activities
  where coalesce(user_id, public.resolve_profile_id(user_email)) = p_user_id;

  select count(*)
  into created_challenges_count
  from public.challenges
  where created_by = p_user_id
    and coalesce(is_deleted, false) = false;

  select
    coalesce((
      select count(*)
      from public.challenge_participants
      where user_id = p_user_id
    ), 0)
    +
    coalesce((
      select count(*)
      from public.challenge_members
      where public.resolve_profile_id(user_email) = p_user_id
        and coalesce(role, 'member') = 'member'
    ), 0)
  into joined_challenges_count;

  select coalesce(sum(
    case
      when coalesce(unit_type, case when distance_km is not null then 'distance' else null end) = 'distance'
        then coalesce(unit_value, distance_km, 0)
      else 0
    end
  ), 0)
  into total_distance
  from public.activities
  where coalesce(user_id, public.resolve_profile_id(user_email)) = p_user_id;

  select count(*)
  into reactions_given_count
  from public.activity_interactions
  where user_id = p_user_id
    and type in ('like', 'boost');

  select count(*)
  into reactions_received_count
  from public.activity_interactions interactions
  join public.activities activities on activities.id = interactions.activity_id
  where coalesce(activities.user_id, public.resolve_profile_id(activities.user_email)) = p_user_id
    and interactions.user_id <> p_user_id;

  select count(*)
  into completed_sessions_count
  from public.workout_sessions_history
  where user_id = p_user_id;

  select count(*)
  into created_programs_count
  from public.training_programs
  where user_id = p_user_id
    and copied_from_program_id is null;

  select count(*)
  into shared_programs_count
  from public.training_programs
  where user_id = p_user_id
    and copied_from_program_id is null
    and visibility = 'shared';

  select count(*)
  into completed_challenges_count
  from public.xp_events
  where user_id = p_user_id
    and event_type = 'challenge_completed';

  select count(*)
  into completed_programs_count
  from public.xp_events
  where user_id = p_user_id
    and event_type = 'program_completed';

  select count(distinct lower(trim(sport)))
  into distinct_sports_count
  from public.activities
  where coalesce(user_id, public.resolve_profile_id(user_email)) = p_user_id
    and sport is not null
    and length(trim(sport)) > 0;

  select count(*)
  into daily_session_count
  from public.daily_session_completions
  where user_id = p_user_id;

  select
    coalesce(sum(steps_count), 0),
    coalesce(max(steps_count), 0),
    coalesce(count(*) filter (where source = 'health_connect'), 0)
  into total_steps_count,
    best_daily_steps,
    first_health_connect_sync_count
  from public.daily_steps
  where user_id = p_user_id;

  select coalesce(sum(steps_count), 0)
  into rolling_weekly_steps
  from (
    select step_date, steps_count
    from public.daily_steps
    where user_id = p_user_id
    order by step_date desc
    limit 7
  ) recent_steps;

  select coalesce(array_agg(scheduled_for order by scheduled_for desc), '{}')
  into ordered_daily_dates
  from (
    select distinct scheduled_for
    from public.daily_session_completions
    where user_id = p_user_id
    order by scheduled_for desc
    limit 120
  ) daily_dates;

  if coalesce(array_length(ordered_daily_dates, 1), 0) > 0
     and ordered_daily_dates[1] >= current_date - 1 then
    daily_session_streak := 0;

    foreach streak_date in array ordered_daily_dates
    loop
      if streak_date = current_date - daily_session_streak then
        daily_session_streak := daily_session_streak + 1;
      else
        exit;
      end if;
    end loop;
  end if;

  if activity_count >= 1 then
    perform public.grant_user_badge(p_user_id, 'first_activity');
  end if;

  if activity_count >= 5 then
    perform public.grant_user_badge(p_user_id, 'five_activities');
  end if;

  if activity_count >= 10 then
    perform public.grant_user_badge(p_user_id, 'ten_activities');
  end if;

  if activity_count >= 50 then
    perform public.grant_user_badge(p_user_id, 'fifty_activities');
  end if;

  if activity_count >= 100 then
    perform public.grant_user_badge(p_user_id, 'hundred_activities');
  end if;

  if created_challenges_count >= 1 then
    perform public.grant_user_badge(p_user_id, 'first_challenge');
  end if;

  if created_challenges_count >= 5 then
    perform public.grant_user_badge(p_user_id, 'five_challenges');
  end if;

  if joined_challenges_count >= 1 then
    perform public.grant_user_badge(p_user_id, 'first_joined_challenge');
  end if;

  if completed_challenges_count >= 1 then
    perform public.grant_user_badge(p_user_id, 'challenge_completed');
  end if;

  if total_distance >= 10 then
    perform public.grant_user_badge(p_user_id, 'distance_10');
  end if;

  if total_distance >= 50 then
    perform public.grant_user_badge(p_user_id, 'distance_50');
  end if;

  if total_distance >= 100 then
    perform public.grant_user_badge(p_user_id, 'distance_100');
  end if;

  if total_distance >= 500 then
    perform public.grant_user_badge(p_user_id, 'distance_500');
  end if;

  if reactions_given_count >= 1 then
    perform public.grant_user_badge(p_user_id, 'first_like');
  end if;

  if reactions_received_count >= 10 then
    perform public.grant_user_badge(p_user_id, 'ten_likes_received');
  end if;

  if reactions_received_count >= 50 then
    perform public.grant_user_badge(p_user_id, 'fifty_likes_received');
  end if;

  if completed_sessions_count >= 1 then
    perform public.grant_user_badge(p_user_id, 'first_session_completed');
  end if;

  if completed_sessions_count >= 5 then
    perform public.grant_user_badge(p_user_id, 'five_sessions_completed');
  end if;

  if completed_sessions_count >= 10 then
    perform public.grant_user_badge(p_user_id, 'ten_sessions_completed');
  end if;

  if completed_sessions_count >= 50 then
    perform public.grant_user_badge(p_user_id, 'fifty_sessions_completed');
  end if;

  if created_programs_count >= 1 then
    perform public.grant_user_badge(p_user_id, 'first_program_created');
  end if;

  if shared_programs_count >= 1 then
    perform public.grant_user_badge(p_user_id, 'program_shared');
  end if;

  if completed_programs_count >= 1 then
    perform public.grant_user_badge(p_user_id, 'program_completed');
  end if;

  if daily_session_count >= 1 then
    perform public.grant_user_badge(p_user_id, 'first_daily_session');
  end if;

  if daily_session_streak >= 3 then
    perform public.grant_user_badge(p_user_id, 'daily_streak_3');
  end if;

  if daily_session_streak >= 7 then
    perform public.grant_user_badge(p_user_id, 'daily_streak_7');
  end if;

  if daily_session_streak >= 30 then
    perform public.grant_user_badge(p_user_id, 'daily_streak_30');
  end if;

  if first_health_connect_sync_count >= 1 then
    perform public.grant_user_badge(p_user_id, 'first_health_connect_sync');
  end if;

  if best_daily_steps >= 5000 then
    perform public.grant_user_badge(p_user_id, 'steps_5000_day');
  end if;

  if best_daily_steps >= 10000 then
    perform public.grant_user_badge(p_user_id, 'steps_10000_day');
  end if;

  if best_daily_steps >= 20000 then
    perform public.grant_user_badge(p_user_id, 'steps_20000_day');
  end if;

  if total_steps_count >= 10000 then
    perform public.grant_user_badge(p_user_id, 'steps_10000_total');
  end if;

  if total_steps_count >= 50000 then
    perform public.grant_user_badge(p_user_id, 'steps_50000_total');
  end if;

  if total_steps_count >= 100000 then
    perform public.grant_user_badge(p_user_id, 'steps_100000_total');
  end if;

  if best_daily_steps > 0 then
    perform public.grant_user_badge(p_user_id, 'steps_first');
  end if;

  if rolling_weekly_steps >= 50000 then
    perform public.grant_user_badge(p_user_id, 'weekly_steps_50000');
  end if;

  if distinct_sports_count >= 3 then
    perform public.grant_user_badge(p_user_id, 'three_sports');
  end if;

  if distinct_sports_count >= 5 then
    perform public.grant_user_badge(p_user_id, 'five_sports');
  end if;

  select count(*), coalesce(array_agg(badge_code order by badge_code), '{}')
  into badge_count, badge_codes
  from public.user_badges
  where user_id = p_user_id;

  return jsonb_build_object(
    'status', 'ok',
    'user_id', p_user_id,
    'badge_count', badge_count,
    'badges', badge_codes
  );
end;
$$;

grant execute on function public.grant_user_badge(uuid, text) to authenticated;
grant execute on function public.refresh_user_badges(uuid) to authenticated;

create or replace function public.add_user_xp(
  p_user_id uuid,
  p_source text,
  p_xp integer,
  p_target_id text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_source = 'challenge_joined' and p_xp = 10 then
    perform public.award_xp_internal(p_user_id, p_source, p_target_id);
  elsif p_source = 'challenge_created' and p_xp = 20 then
    perform public.award_xp_internal(p_user_id, p_source, p_target_id);
  elsif p_source = 'activity_added' and p_xp = 25 then
    perform public.award_xp_internal(p_user_id, p_source, p_target_id);
  elsif p_source = 'like_received' and p_xp = 1 then
    perform public.award_xp_internal(p_user_id, p_source, p_target_id);
  elsif p_source = 'boost_received' and p_xp = 3 then
    perform public.award_xp_internal(p_user_id, p_source, p_target_id);
  elsif p_source = 'challenge_completed' and p_xp = 50 then
    perform public.award_xp_internal(p_user_id, p_source, p_target_id);
  end if;
end;
$$;

create or replace function public.award_xp(
  p_user_id uuid,
  p_source text,
  p_target_id text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or p_user_id is null then
    return;
  end if;

  perform public.award_xp_internal(p_user_id, p_source, p_target_id);
end;
$$;

grant execute on function public.award_xp(uuid, text, text) to authenticated;

create or replace function public.resolve_profile_id(p_user_email text)
returns uuid
language sql
security definer
set search_path = public
as $$
  select id
  from public.profiles
  where lower(email) = lower(p_user_email)
  limit 1;
$$;

create or replace function public.get_challenge_progress(
  p_challenge_id uuid,
  p_goal_type text
)
returns numeric
language sql
security definer
set search_path = public
as $$
  select coalesce(sum(
    case
      when p_goal_type = 'distance' then coalesce(unit_value, distance_km, 0)
      when p_goal_type = 'duration' then coalesce(unit_value, duration_minutes, 0)
      when p_goal_type = 'reps' then coalesce(unit_value, 0)
      else 0
    end
  ), 0)
  from public.activities
  where challenge_id = p_challenge_id;
$$;

create or replace function public.award_xp_after_challenge_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.award_xp_internal(NEW.created_by, 'challenge_created', NEW.id::text);
  perform public.refresh_user_badges(NEW.created_by);
  return NEW;
end;
$$;

drop trigger if exists trg_award_xp_after_challenge_insert on public.challenges;
create trigger trg_award_xp_after_challenge_insert
after insert on public.challenges
for each row
execute function public.award_xp_after_challenge_insert();

create or replace function public.award_xp_after_activity_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_id uuid;
  participant_badge_user_id uuid;
  challenge_goal_type text;
  challenge_goal_value numeric;
  previous_progress numeric := 0;
  next_progress numeric := 0;
  new_activity_value numeric := 0;
begin
  actor_id := coalesce(NEW.user_id, public.resolve_profile_id(NEW.user_email));
  perform public.award_xp_internal(actor_id, 'activity_added', NEW.id::text);

  select
    coalesce(goal_type, case when goal_km is not null then 'distance' else null end),
    coalesce(goal_value, goal_km)
  into challenge_goal_type, challenge_goal_value
  from public.challenges
  where id = NEW.challenge_id;

  if actor_id is not null and challenge_goal_type is not null and challenge_goal_value > 0 then
    next_progress := public.get_challenge_progress(NEW.challenge_id, challenge_goal_type);
    new_activity_value := case
      when challenge_goal_type = 'distance' then coalesce(NEW.unit_value, NEW.distance_km, 0)
      when challenge_goal_type = 'duration' then coalesce(NEW.unit_value, NEW.duration_minutes, 0)
      when challenge_goal_type = 'reps' then coalesce(NEW.unit_value, 0)
      else 0
    end;
    previous_progress := next_progress - new_activity_value;

    if previous_progress < challenge_goal_value and next_progress >= challenge_goal_value then
      perform public.award_xp_internal(actor_id, 'challenge_completed', NEW.challenge_id::text);

      for participant_badge_user_id in (
        select created_by
        from public.challenges
        where id = NEW.challenge_id

        union

        select user_id
        from public.challenge_participants
        where challenge_id = NEW.challenge_id

        union

        select public.resolve_profile_id(user_email)
        from public.challenge_members
        where challenge_id = NEW.challenge_id
      )
      loop
        perform public.refresh_user_badges(participant_badge_user_id);
      end loop;
    end if;
  end if;

  perform public.refresh_user_badges(actor_id);

  return NEW;
end;
$$;

drop trigger if exists trg_award_xp_after_activity_insert on public.activities;
create trigger trg_award_xp_after_activity_insert
after insert on public.activities
for each row
execute function public.award_xp_after_activity_insert();

create or replace function public.award_xp_after_interaction_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  activity_owner_id uuid;
  activity_owner_email text;
begin
  select user_id, user_email
  into activity_owner_id, activity_owner_email
  from public.activities
  where id = NEW.activity_id;

  activity_owner_id := coalesce(activity_owner_id, public.resolve_profile_id(activity_owner_email));

  if activity_owner_id is null or activity_owner_id = NEW.user_id then
    if NEW.type in ('like', 'boost') and NEW.user_id is not null then
      perform public.refresh_user_badges(NEW.user_id);
    end if;
    return NEW;
  end if;

  if NEW.type = 'like' then
    perform public.award_xp_internal(activity_owner_id, 'like_received', NEW.id::text);
    perform public.refresh_user_badges(NEW.user_id);
  elsif NEW.type = 'boost' then
    perform public.award_xp_internal(activity_owner_id, 'boost_received', NEW.id::text);
    perform public.refresh_user_badges(NEW.user_id);
  end if;

  perform public.refresh_user_badges(activity_owner_id);

  return NEW;
end;
$$;

drop trigger if exists trg_award_xp_after_interaction_insert on public.activity_interactions;
create trigger trg_award_xp_after_interaction_insert
after insert on public.activity_interactions
for each row
execute function public.award_xp_after_interaction_insert();

create or replace function public.award_xp_after_participant_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.award_xp_internal(NEW.user_id, 'challenge_joined', NEW.challenge_id::text);
  perform public.refresh_user_badges(NEW.user_id);
  return NEW;
end;
$$;

drop trigger if exists trg_award_xp_after_participant_insert on public.challenge_participants;
create trigger trg_award_xp_after_participant_insert
after insert on public.challenge_participants
for each row
execute function public.award_xp_after_participant_insert();

create or replace function public.award_xp_after_member_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  member_user_id uuid;
begin
  if coalesce(NEW.role, 'member') <> 'member' then
    return NEW;
  end if;

  member_user_id := public.resolve_profile_id(NEW.user_email);
  perform public.award_xp_internal(member_user_id, 'challenge_joined', NEW.challenge_id::text);
  perform public.refresh_user_badges(member_user_id);
  return NEW;
end;
$$;

drop trigger if exists trg_award_xp_after_member_insert on public.challenge_members;
create trigger trg_award_xp_after_member_insert
after insert on public.challenge_members
for each row
execute function public.award_xp_after_member_insert();

alter table if exists public.challenge_participants enable row level security;

alter table if exists public.challenges enable row level security;

drop policy if exists "Users can read visible challenges" on public.challenges;
create policy "Users can read visible challenges"
  on public.challenges for select
  using (
    visibility = 'public'
    or created_by = auth.uid()
    or exists (
      select 1
      from public.challenge_participants
      where challenge_participants.challenge_id = challenges.id
        and challenge_participants.user_id = auth.uid()
    )
  );

drop policy if exists "Users can create own challenges" on public.challenges;
create policy "Users can create own challenges"
  on public.challenges for insert
  with check (created_by = auth.uid());

drop policy if exists "Users can read own challenge participants" on public.challenge_participants;
create policy "Users can read own challenge participants"
  on public.challenge_participants for select
  using (auth.uid() = user_id);

drop policy if exists "Users can join challenge as participant" on public.challenge_participants;
create policy "Users can join challenge as participant"
  on public.challenge_participants for insert
  with check (auth.uid() = user_id);

drop policy if exists "Challenge creators can read participants" on public.challenge_participants;
create policy "Challenge creators can read participants"
  on public.challenge_participants for select
  using (
    exists (
      select 1
      from public.challenges
      where challenges.id = challenge_participants.challenge_id
        and challenges.created_by = auth.uid()
    )
  );

create or replace function public.join_challenge_by_invite_code(p_invite_code text)
returns table (
  id uuid,
  name text,
  sport text,
  description text,
  already_joined boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  found_challenge record;
  was_already_joined boolean := false;
  inserted_participant boolean := false;
begin
  if auth.uid() is null then
    raise exception 'auth_required';
  end if;

  if p_invite_code is null or length(trim(p_invite_code)) = 0 then
    raise exception 'invalid_invite';
  end if;

  select
    challenges.id,
    challenges.name,
    challenges.sport,
    challenges.description,
    challenges.created_by
  into found_challenge
  from public.challenges
  where challenges.invite_code = p_invite_code
    and coalesce(challenges.is_deleted, false) = false
  limit 1;

  if found_challenge.id is null then
    raise exception 'invalid_invite';
  end if;

  was_already_joined :=
    found_challenge.created_by = auth.uid()
    or exists (
      select 1
      from public.challenge_participants
      where challenge_id = found_challenge.id
        and user_id = auth.uid()
    );

  if not was_already_joined then
    insert into public.challenge_participants (challenge_id, user_id, role)
    values (found_challenge.id, auth.uid(), 'participant')
    on conflict (challenge_id, user_id) do nothing;

    inserted_participant := found;

    if inserted_participant then
      perform public.add_user_xp(auth.uid(), 'challenge_joined', 10, found_challenge.id::text);
      perform public.refresh_user_badges(auth.uid());
    else
      was_already_joined := true;
    end if;
  end if;

  return query
  select
    found_challenge.id::uuid,
    found_challenge.name::text,
    found_challenge.sport::text,
    found_challenge.description::text,
    was_already_joined;
end;
$$;

grant execute on function public.join_challenge_by_invite_code(text) to authenticated;

create or replace function public.join_challenge_by_invite(p_invite_code text)
returns table (
  id uuid,
  name text,
  sport text,
  description text,
  already_joined boolean
)
language sql
security definer
set search_path = public
as $$
  select *
  from public.join_challenge_by_invite_code(p_invite_code);
$$;

grant execute on function public.join_challenge_by_invite(text) to authenticated;

create table if not exists public.training_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  sport text,
  difficulty text,
  description text,
  visibility text not null default 'private' check (visibility in ('private', 'public')),
  copied_from_session_id uuid references public.training_sessions(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table if exists public.training_sessions
  add column if not exists visibility text not null default 'private';

alter table if exists public.training_sessions
  add column if not exists copied_from_session_id uuid references public.training_sessions(id) on delete set null;

alter table if exists public.training_sessions
  add column if not exists difficulty text;

alter table if exists public.training_sessions
  alter column visibility set default 'private';

alter table if exists public.training_sessions
  drop constraint if exists training_sessions_visibility_check;

alter table if exists public.training_sessions
  add constraint training_sessions_visibility_check
  check (visibility in ('private', 'public'));

create table if not exists public.training_session_blocks (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.training_sessions(id) on delete cascade,
  position integer not null default 0,
  name text not null,
  block_type text not null,
  sets_count integer not null default 1,
  target_value numeric,
  charge_kg numeric,
  rest_seconds integer not null default 60,
  created_at timestamptz not null default now()
);

alter table if exists public.training_session_blocks
  add column if not exists sets_count integer not null default 1,
  add column if not exists charge_kg numeric,
  add column if not exists rest_seconds integer not null default 60;

create table if not exists public.workout_sessions_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  workout_id uuid references public.training_sessions(id) on delete set null,
  workout_name text not null,
  completed_at timestamptz not null default now(),
  duration_seconds integer,
  estimated_calories integer,
  total_volume numeric,
  completed_exercises integer,
  metadata jsonb not null default '{}'::jsonb,
  run_key text unique,
  created_at timestamptz not null default now()
);

create table if not exists public.workout_session_history_exercises (
  id uuid primary key default gen_random_uuid(),
  history_id uuid not null references public.workout_sessions_history(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  workout_id uuid references public.training_sessions(id) on delete set null,
  exercise_name text not null,
  block_type text,
  sets_count integer,
  target_value numeric,
  charge_kg numeric,
  total_volume numeric,
  created_at timestamptz not null default now()
);

create table if not exists public.workout_exercise_history (
  id uuid primary key default gen_random_uuid(),
  history_id uuid references public.workout_sessions_history(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  workout_id uuid not null references public.training_sessions(id) on delete cascade,
  exercise_name text not null,
  block_type text,
  sets_count integer not null default 1,
  reps numeric not null default 0,
  duration_seconds integer not null default 0,
  distance numeric not null default 0,
  charge_kg numeric not null default 0,
  volume numeric not null default 0,
  completed_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

alter table if exists public.workout_sessions_history
  add column if not exists estimated_calories integer;

create index if not exists training_sessions_user_created_idx
  on public.training_sessions (user_id, created_at desc);

create index if not exists training_session_blocks_session_position_idx
  on public.training_session_blocks (session_id, position asc);

create index if not exists workout_sessions_history_user_completed_idx
  on public.workout_sessions_history (user_id, completed_at desc);

create index if not exists workout_session_history_exercises_user_workout_idx
  on public.workout_session_history_exercises (user_id, workout_id, created_at desc);

create index if not exists workout_session_history_exercises_history_idx
  on public.workout_session_history_exercises (history_id);

create index if not exists workout_exercise_history_user_workout_completed_idx
  on public.workout_exercise_history (user_id, workout_id, completed_at desc);

create index if not exists workout_exercise_history_history_idx
  on public.workout_exercise_history (history_id);

alter table if exists public.training_sessions enable row level security;
alter table if exists public.training_session_blocks enable row level security;
alter table if exists public.workout_sessions_history enable row level security;
alter table if exists public.workout_session_history_exercises enable row level security;
alter table if exists public.workout_exercise_history enable row level security;

drop policy if exists "Users can read own training sessions" on public.training_sessions;
create policy "Users can read own training sessions"
  on public.training_sessions for select
  using (auth.uid() = user_id or visibility = 'public');

drop policy if exists "Users can insert own training sessions" on public.training_sessions;
create policy "Users can insert own training sessions"
  on public.training_sessions for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can update own training sessions" on public.training_sessions;
create policy "Users can update own training sessions"
  on public.training_sessions for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users can delete own training sessions" on public.training_sessions;
create policy "Users can delete own training sessions"
  on public.training_sessions for delete
  using (auth.uid() = user_id);

drop policy if exists "Users can read own training session blocks" on public.training_session_blocks;
create policy "Users can read own training session blocks"
  on public.training_session_blocks for select
  using (
    exists (
      select 1
      from public.training_sessions
      where training_sessions.id = training_session_blocks.session_id
        and (
          training_sessions.user_id = auth.uid()
          or training_sessions.visibility = 'public'
        )
    )
  );

drop policy if exists "Users can insert own training session blocks" on public.training_session_blocks;
create policy "Users can insert own training session blocks"
  on public.training_session_blocks for insert
  with check (
    exists (
      select 1
      from public.training_sessions
      where training_sessions.id = training_session_blocks.session_id
        and training_sessions.user_id = auth.uid()
    )
  );

drop policy if exists "Users can update own training session blocks" on public.training_session_blocks;
create policy "Users can update own training session blocks"
  on public.training_session_blocks for update
  using (
    exists (
      select 1
      from public.training_sessions
      where training_sessions.id = training_session_blocks.session_id
        and training_sessions.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.training_sessions
      where training_sessions.id = training_session_blocks.session_id
        and training_sessions.user_id = auth.uid()
    )
  );

drop policy if exists "Users can delete own training session blocks" on public.training_session_blocks;
create policy "Users can delete own training session blocks"
  on public.training_session_blocks for delete
  using (
    exists (
      select 1
      from public.training_sessions
      where training_sessions.id = training_session_blocks.session_id
        and training_sessions.user_id = auth.uid()
    )
  );

drop policy if exists "Users can read own workout history" on public.workout_sessions_history;
create policy "Users can read own workout history"
  on public.workout_sessions_history for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert own workout history" on public.workout_sessions_history;
create policy "Users can insert own workout history"
  on public.workout_sessions_history for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can read own workout history exercises" on public.workout_session_history_exercises;
create policy "Users can read own workout history exercises"
  on public.workout_session_history_exercises for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert own workout history exercises" on public.workout_session_history_exercises;
create policy "Users can insert own workout history exercises"
  on public.workout_session_history_exercises for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can read own workout exercise history" on public.workout_exercise_history;
create policy "Users can read own workout exercise history"
  on public.workout_exercise_history for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert own workout exercise history" on public.workout_exercise_history;
create policy "Users can insert own workout exercise history"
  on public.workout_exercise_history for insert
  with check (auth.uid() = user_id);

grant select, insert, update, delete on public.training_sessions to authenticated;
grant select, insert, update, delete on public.training_session_blocks to authenticated;
grant select, insert on public.workout_sessions_history to authenticated;
grant select, insert on public.workout_session_history_exercises to authenticated;
grant select, insert on public.workout_exercise_history to authenticated;
grant select on public.training_sessions to anon;
grant select on public.training_session_blocks to anon;

create table if not exists public.training_programs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  description text,
  sport text,
  difficulty text,
  duration_weeks integer not null default 4 check (duration_weeks > 0),
  visibility text not null default 'private' check (visibility in ('private', 'shared', 'public')),
  invite_code text,
  copied_from_program_id uuid references public.training_programs(id) on delete set null,
  start_date date not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table if exists public.training_programs
  add column if not exists visibility text not null default 'private';

alter table if exists public.training_programs
  add column if not exists invite_code text;

alter table if exists public.training_programs
  add column if not exists copied_from_program_id uuid references public.training_programs(id) on delete set null;

alter table if exists public.training_programs
  add column if not exists difficulty text;

alter table if exists public.training_programs
  alter column visibility set default 'private';

alter table if exists public.training_programs
  drop constraint if exists training_programs_visibility_check;

alter table if exists public.training_programs
  add constraint training_programs_visibility_check
  check (visibility in ('private', 'shared', 'public'));

alter table if exists public.training_programs
  drop constraint if exists training_programs_copies_not_shared;

alter table if exists public.training_programs
  add constraint training_programs_copies_not_shared
  check (copied_from_program_id is null or visibility <> 'shared');

create table if not exists public.training_program_sessions (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.training_programs(id) on delete cascade,
  session_id uuid references public.training_sessions(id) on delete set null,
  session_name text not null,
  sport text,
  week_number integer not null check (week_number > 0),
  day_of_week integer not null check (day_of_week between 1 and 7),
  order_index integer not null default 1,
  created_at timestamptz not null default now()
);

create table if not exists public.training_program_completions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  program_id uuid not null references public.training_programs(id) on delete cascade,
  program_session_id uuid not null references public.training_program_sessions(id) on delete cascade,
  session_id uuid references public.training_sessions(id) on delete set null,
  workout_history_id uuid references public.workout_sessions_history(id) on delete set null,
  completed_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists training_programs_user_created_idx
  on public.training_programs (user_id, created_at desc);

create unique index if not exists training_programs_invite_code_uidx
  on public.training_programs (invite_code)
  where invite_code is not null;

create index if not exists training_program_sessions_program_schedule_idx
  on public.training_program_sessions (program_id, week_number, day_of_week, order_index);

create index if not exists training_program_completions_user_program_idx
  on public.training_program_completions (user_id, program_id, completed_at desc);

create unique index if not exists training_program_completions_program_session_uidx
  on public.training_program_completions (program_session_id);

alter table if exists public.training_programs enable row level security;
alter table if exists public.training_program_sessions enable row level security;
alter table if exists public.training_program_completions enable row level security;

drop policy if exists "Users can read own training programs" on public.training_programs;
create policy "Users can read own training programs"
  on public.training_programs for select
  using (
    auth.uid() = user_id
    or visibility = 'public'
    or (visibility = 'shared' and invite_code is not null)
  );

drop policy if exists "Users can insert own training programs" on public.training_programs;
create policy "Users can insert own training programs"
  on public.training_programs for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can update own training programs" on public.training_programs;
create policy "Users can update own training programs"
  on public.training_programs for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users can delete own training programs" on public.training_programs;
create policy "Users can delete own training programs"
  on public.training_programs for delete
  using (auth.uid() = user_id);

drop policy if exists "Users can read own training program sessions" on public.training_program_sessions;
create policy "Users can read own training program sessions"
  on public.training_program_sessions for select
  using (
    exists (
      select 1
      from public.training_programs
      where training_programs.id = training_program_sessions.program_id
        and (
          training_programs.user_id = auth.uid()
          or training_programs.visibility = 'public'
          or (training_programs.visibility = 'shared' and training_programs.invite_code is not null)
        )
    )
  );

drop policy if exists "Users can insert own training program sessions" on public.training_program_sessions;
create policy "Users can insert own training program sessions"
  on public.training_program_sessions for insert
  with check (
    exists (
      select 1
      from public.training_programs
      where training_programs.id = training_program_sessions.program_id
        and training_programs.user_id = auth.uid()
    )
  );

drop policy if exists "Users can update own training program sessions" on public.training_program_sessions;
create policy "Users can update own training program sessions"
  on public.training_program_sessions for update
  using (
    exists (
      select 1
      from public.training_programs
      where training_programs.id = training_program_sessions.program_id
        and training_programs.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.training_programs
      where training_programs.id = training_program_sessions.program_id
        and training_programs.user_id = auth.uid()
    )
  );

drop policy if exists "Users can delete own training program sessions" on public.training_program_sessions;
create policy "Users can delete own training program sessions"
  on public.training_program_sessions for delete
  using (
    exists (
      select 1
      from public.training_programs
      where training_programs.id = training_program_sessions.program_id
        and training_programs.user_id = auth.uid()
    )
  );

drop policy if exists "Users can read own training program completions" on public.training_program_completions;
create policy "Users can read own training program completions"
  on public.training_program_completions for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert own training program completions" on public.training_program_completions;
create policy "Users can insert own training program completions"
  on public.training_program_completions for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can update own training program completions" on public.training_program_completions;
create policy "Users can update own training program completions"
  on public.training_program_completions for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users can delete own training program completions" on public.training_program_completions;
create policy "Users can delete own training program completions"
  on public.training_program_completions for delete
  using (auth.uid() = user_id);

grant select, insert, update, delete on public.training_programs to authenticated;
grant select, insert, update, delete on public.training_program_sessions to authenticated;
grant select, insert, update, delete on public.training_program_completions to authenticated;
grant select on public.training_programs to anon;
grant select on public.training_program_sessions to anon;

create table if not exists public.daily_sessions (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.training_sessions(id) on delete cascade,
  scheduled_for date not null,
  bonus_xp integer not null default 25 check (bonus_xp >= 0),
  created_at timestamptz not null default now()
);

create unique index if not exists daily_sessions_scheduled_for_uidx
  on public.daily_sessions (scheduled_for);

create table if not exists public.daily_session_completions (
  id uuid primary key default gen_random_uuid(),
  daily_session_id uuid not null references public.daily_sessions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  session_id uuid references public.training_sessions(id) on delete set null,
  workout_history_id uuid references public.workout_sessions_history(id) on delete set null,
  scheduled_for date not null,
  completed_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create unique index if not exists daily_session_completions_user_daily_uidx
  on public.daily_session_completions (user_id, daily_session_id);

create unique index if not exists daily_session_completions_user_day_uidx
  on public.daily_session_completions (user_id, scheduled_for);

create index if not exists daily_session_completions_user_created_idx
  on public.daily_session_completions (user_id, completed_at desc);

alter table if exists public.daily_sessions enable row level security;
alter table if exists public.daily_session_completions enable row level security;

drop policy if exists "Anyone can read daily sessions" on public.daily_sessions;
create policy "Anyone can read daily sessions"
  on public.daily_sessions for select
  using (
    exists (
      select 1
      from public.training_sessions
      where training_sessions.id = daily_sessions.session_id
        and training_sessions.visibility = 'public'
    )
  );

drop policy if exists "Users can read own daily session completions" on public.daily_session_completions;
create policy "Users can read own daily session completions"
  on public.daily_session_completions for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Users can insert own daily session completions" on public.daily_session_completions;
create policy "Users can insert own daily session completions"
  on public.daily_session_completions for insert
  to authenticated
  with check (
    auth.uid() = user_id
    and exists (
      select 1
      from public.daily_sessions
      join public.training_sessions
        on training_sessions.id = daily_sessions.session_id
      where daily_sessions.id = daily_session_completions.daily_session_id
        and training_sessions.visibility = 'public'
    )
  );

drop policy if exists "Users can update own daily session completions" on public.daily_session_completions;
create policy "Users can update own daily session completions"
  on public.daily_session_completions for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users can delete own daily session completions" on public.daily_session_completions;
create policy "Users can delete own daily session completions"
  on public.daily_session_completions for delete
  to authenticated
  using (auth.uid() = user_id);

grant select on public.daily_sessions to anon;
grant select on public.daily_sessions to authenticated;
grant select, insert, update, delete on public.daily_session_completions to authenticated;

create table if not exists public.daily_steps (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  step_date date not null,
  steps_count integer not null default 0 check (steps_count >= 0),
  source text not null default 'manual',
  synced_at timestamptz,
  distance_meters double precision,
  walk_run_distance_meters double precision,
  bike_distance_meters double precision,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists daily_steps_user_date_uidx
  on public.daily_steps (user_id, step_date);

create index if not exists daily_steps_user_date_idx
  on public.daily_steps (user_id, step_date desc);

alter table if exists public.daily_steps enable row level security;

drop policy if exists "Users can read own daily steps" on public.daily_steps;
create policy "Users can read own daily steps"
  on public.daily_steps for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Users can insert own daily steps" on public.daily_steps;
create policy "Users can insert own daily steps"
  on public.daily_steps for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "Users can update own daily steps" on public.daily_steps;
create policy "Users can update own daily steps"
  on public.daily_steps for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

grant select, insert, update on public.daily_steps to authenticated;
