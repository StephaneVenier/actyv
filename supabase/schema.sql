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
      ('first-step', p_source = 'activity_added'),
      ('creator', p_source = 'challenge_created'),
      ('collective', p_source = 'challenge_joined'),
      ('motivated', p_source = 'like_received'),
      ('booster', p_source = 'boost_received'),
      ('finisher', p_source = 'challenge_completed'),
      ('serious', next_level >= 5),
      (
        'regular',
        (
          select count(*)
          from public.xp_events
          where user_id = p_user_id and source = 'activity_added'
        ) >= 4
      )
  ) as badge_rules(badge_code, should_unlock)
  where should_unlock
  on conflict (user_id, badge_code) do nothing;
end;
$$;

grant execute on function public.award_xp(uuid, text, text) to authenticated;
