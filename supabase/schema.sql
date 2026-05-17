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
  title text not null,
  description text,
  sport_type text not null,
  start_date date not null,
  target_date date,
  invitation_code text unique not null,
  created_by uuid,
  created_at timestamptz default now()
);

create table if not exists public.challenge_members (
  id uuid primary key default gen_random_uuid(),
  challenge_id uuid not null references public.challenges(id) on delete cascade,
  user_id uuid not null,
  role text not null default 'member',
  status text not null default 'active',
  joined_at timestamptz default now(),
  unique (challenge_id, user_id)
);

create table if not exists public.activities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  challenge_id uuid references public.challenges(id) on delete set null,
  sport_type text not null,
  distance_km numeric(6,2),
  duration_minutes integer,
  activity_date date not null,
  effort_level text,
  comment text,
  source text not null default 'manual',
  external_id text,
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
  source text not null,
  xp integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists xp_events_user_source_created_idx
  on public.xp_events (user_id, source, created_at);

create unique index if not exists xp_events_once_per_target_idx
  on public.xp_events (
    user_id,
    source,
    ((metadata ->> 'target_id'))
  )
  where metadata ? 'target_id';

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
  using (auth.uid() = user_id);

drop policy if exists "Users can insert own xp events" on public.xp_events;
create policy "Users can insert own xp events"
  on public.xp_events for insert
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

create or replace function public.grant_user_badge(
  p_user_id uuid,
  p_badge_code text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_user_id is null or p_badge_code is null or length(trim(p_badge_code)) = 0 then
    return;
  end if;

  insert into public.user_badges (user_id, badge_code)
  values (p_user_id, p_badge_code)
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
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.training_session_blocks (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.training_sessions(id) on delete cascade,
  position integer not null default 0,
  name text not null,
  block_type text not null,
  sets_count integer not null default 1,
  target_value numeric,
  charge_kg numeric,
  created_at timestamptz not null default now()
);

alter table if exists public.training_session_blocks
  add column if not exists sets_count integer not null default 1,
  add column if not exists charge_kg numeric;

create index if not exists training_sessions_user_created_idx
  on public.training_sessions (user_id, created_at desc);

create index if not exists training_session_blocks_session_position_idx
  on public.training_session_blocks (session_id, position asc);

alter table if exists public.training_sessions enable row level security;
alter table if exists public.training_session_blocks enable row level security;

drop policy if exists "Users can read own training sessions" on public.training_sessions;
create policy "Users can read own training sessions"
  on public.training_sessions for select
  using (auth.uid() = user_id);

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
        and training_sessions.user_id = auth.uid()
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

grant select, insert, update, delete on public.training_sessions to authenticated;
grant select, insert, update, delete on public.training_session_blocks to authenticated;
