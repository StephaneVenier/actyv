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

notify pgrst, 'reload schema';
