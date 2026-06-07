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
  best_daily_steps integer := 0;
  rolling_weekly_steps integer := 0;
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

  select coalesce(max(steps_count), 0)
  into best_daily_steps
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

  if best_daily_steps > 0 then
    perform public.grant_user_badge(p_user_id, 'steps_first');
  end if;

  if best_daily_steps >= 5000 then
    perform public.grant_user_badge(p_user_id, 'steps_5000');
  end if;

  if best_daily_steps >= 10000 then
    perform public.grant_user_badge(p_user_id, 'steps_10000');
  end if;

  if best_daily_steps >= 20000 then
    perform public.grant_user_badge(p_user_id, 'steps_20000');
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

notify pgrst, 'reload schema';
