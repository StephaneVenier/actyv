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
    when 'workout_completed' then 10
    when 'program_session_completed' then 15
    when 'program_completed' then 100
    when 'program_created' then 5
    when 'program_shared' then 5
    else 0
  end;

  if reward_xp <= 0 then
    return;
  end if;

  if p_source in ('challenge_created', 'activity_added') then
    select count(*) into daily_count
    from public.xp_events
    where user_id = p_user_id
      and source = p_source
      and created_at >= date_trunc('day', now());

    if (p_source = 'challenge_created' and daily_count >= 2)
      or (p_source = 'activity_added' and daily_count >= 4) then
      return;
    end if;
  end if;

  if p_source in ('like_received', 'boost_received') then
    select coalesce(sum(xp), 0) into daily_xp
    from public.xp_events
    where user_id = p_user_id
      and source = p_source
      and created_at >= date_trunc('day', now());

    if (p_source = 'like_received' and daily_xp + reward_xp > 20)
      or (p_source = 'boost_received' and daily_xp + reward_xp > 30) then
      return;
    end if;
  end if;

  insert into public.xp_events (user_id, source, xp, metadata)
  values (
    p_user_id,
    p_source,
    reward_xp,
    case
      when p_target_id is null then '{}'::jsonb
      else jsonb_build_object('target_id', p_target_id)
    end
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

create or replace function public.refresh_user_badges(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  badge_count integer := 0;
  badge_codes text[];
begin
  if p_user_id is null then
    return jsonb_build_object(
      'status', 'error',
      'reason', 'missing_user_id'
    );
  end if;

  if exists (
    select 1
    from public.activities
    where coalesce(user_id, public.resolve_profile_id(user_email)) = p_user_id
  ) then
    perform public.grant_user_badge(p_user_id, 'premier_pas');
  end if;

  if (
    select count(*)
    from public.activities
    where coalesce(user_id, public.resolve_profile_id(user_email)) = p_user_id
  ) >= 5 then
    perform public.grant_user_badge(p_user_id, 'actyv_regulier');
  end if;

  if (
    select count(*)
    from public.activities
    where coalesce(user_id, public.resolve_profile_id(user_email)) = p_user_id
  ) >= 10 then
    perform public.grant_user_badge(p_user_id, 'actyv_motive');
  end if;

  if exists (
    select 1
    from public.challenges
    where created_by = p_user_id
      and coalesce(is_deleted, false) = false
  ) then
    perform public.grant_user_badge(p_user_id, 'challenger');
  end if;

  if exists (
    select 1
    from public.challenge_participants
    where user_id = p_user_id
  ) or exists (
    select 1
    from public.challenge_members
    where public.resolve_profile_id(user_email) = p_user_id
      and coalesce(role, 'member') = 'member'
  ) then
    perform public.grant_user_badge(p_user_id, 'collectif');
  end if;

  if (
    select coalesce(sum(
      case
        when coalesce(unit_type, case when distance_km is not null then 'distance' else null end) = 'distance'
          then coalesce(unit_value, distance_km, 0)
        else 0
      end
    ), 0)
    from public.activities
    where coalesce(user_id, public.resolve_profile_id(user_email)) = p_user_id
  ) >= 10 then
    perform public.grant_user_badge(p_user_id, 'distance_10_km');
  end if;

  if (
    select coalesce(sum(
      case
        when coalesce(unit_type, case when distance_km is not null then 'distance' else null end) = 'distance'
          then coalesce(unit_value, distance_km, 0)
        else 0
      end
    ), 0)
    from public.activities
    where coalesce(user_id, public.resolve_profile_id(user_email)) = p_user_id
  ) >= 50 then
    perform public.grant_user_badge(p_user_id, 'distance_50_km');
  end if;

  if exists (
    select 1
    from public.activity_interactions
    where user_id = p_user_id
      and type in ('like', 'boost')
  ) then
    perform public.grant_user_badge(p_user_id, 'boosteur');
  end if;

  if exists (
    select 1
    from public.workout_sessions_history
    where user_id = p_user_id
  ) then
    perform public.grant_user_badge(p_user_id, 'premiere_seance_terminee');
  end if;

  if (
    select count(*)
    from public.workout_sessions_history
    where user_id = p_user_id
  ) >= 5 then
    perform public.grant_user_badge(p_user_id, 'cinq_seances_terminees');
  end if;

  if (
    select count(*)
    from public.workout_sessions_history
    where user_id = p_user_id
  ) >= 10 then
    perform public.grant_user_badge(p_user_id, 'dix_seances_terminees');
  end if;

  if exists (
    select 1
    from public.training_programs
    where user_id = p_user_id
      and copied_from_program_id is null
  ) then
    perform public.grant_user_badge(p_user_id, 'premier_programme_cree');
  end if;

  if exists (
    select 1
    from public.training_programs
    where user_id = p_user_id
      and visibility = 'shared'
      and copied_from_program_id is null
  ) then
    perform public.grant_user_badge(p_user_id, 'programme_partage');
  end if;

  if exists (
    select 1
    from public.training_programs programs
    where programs.user_id = p_user_id
      and not exists (
        select 1
        from public.training_program_sessions sessions
        where sessions.program_id = programs.id
      ) = false
      and not exists (
        select 1
        from public.training_program_sessions sessions
        where sessions.program_id = programs.id
          and not exists (
            select 1
            from public.training_program_completions completions
            where completions.program_session_id = sessions.id
              and completions.user_id = p_user_id
          )
      )
  ) then
    perform public.grant_user_badge(p_user_id, 'premier_programme_termine');
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

grant execute on function public.refresh_user_badges(uuid) to authenticated;
