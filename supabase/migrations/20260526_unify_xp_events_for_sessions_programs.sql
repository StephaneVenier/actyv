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

notify pgrst, 'reload schema';
