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
