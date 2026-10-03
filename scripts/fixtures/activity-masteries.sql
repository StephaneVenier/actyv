-- Disposable LOCAL test database only. Production unlock/XP functions are loaded by the runner.
create schema auth;
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;
create table public.activities (
  id uuid primary key, user_id uuid, user_email text, sport text,
  distance_km numeric, duration_minutes numeric, unit_type text, unit_value numeric,
  exercise_type text, comment text, created_at timestamptz default now(),
  activity_name text, source text default 'manual', occurred_at timestamptz default now(),
  elevation_gain_m numeric, elevation_loss_m numeric, metadata jsonb default '{}'
);
create table public.masteries (
  id uuid primary key default gen_random_uuid(), slug text unique, name text,
  measurement_type text, unit text, active boolean default true
);
create table public.mastery_levels (
  mastery_id uuid, level integer, threshold numeric, xp_reward integer,
  unique (mastery_id, level)
);
create table public.mastery_entries (
  id uuid primary key default gen_random_uuid(), user_id uuid, mastery_id uuid,
  value numeric, source text, source_ref_id uuid, metadata jsonb,
  performed_at timestamptz, created_at timestamptz default now()
);
create unique index entries_once on public.mastery_entries
  (user_id, mastery_id, source, source_ref_id) where source_ref_id is not null;
create table public.mastery_level_unlocks (
  id uuid primary key default gen_random_uuid(), user_id uuid, mastery_id uuid,
  level integer, xp_awarded integer, unlocked_at timestamptz default now(),
  unique (user_id, mastery_id, level)
);
create table public.xp_events (
  id uuid primary key default gen_random_uuid(), user_id uuid, event_type text,
  xp_amount integer, target_id text, created_at timestamptz default now()
);
create unique index xp_once on public.xp_events (user_id, event_type, target_id)
  where target_id is not null;
create table public.profiles (id uuid primary key, total_xp integer default 0, level integer default 1);
insert into public.profiles (id) values
  ('00000000-0000-0000-0000-000000000001'), ('00000000-0000-0000-0000-000000000002');
create function public.calculate_level(integer) returns integer language sql as $$ select 1; $$;
create function public.normalize_mastery_exercise_key(text) returns text language sql immutable as $$
  select lower(regexp_replace(trim($1), '\s+', '-', 'g'));
$$;
create function public.compute_mastery_progress_internal(uuid, uuid) returns jsonb language sql as $$
  select jsonb_build_object('total_value', coalesce(sum(value), 0), 'current_level',
    (select coalesce(max(level), 0) from public.mastery_level_unlocks where user_id=$1 and mastery_id=$2),
    'progress_percent', 0)
  from public.mastery_entries where user_id=$1 and mastery_id=$2;
$$;
insert into public.masteries (slug, name, measurement_type, unit) values
  ('distance-cap', 'Distance CAP', 'distance', 'km'),
  ('duree-cap', 'Duree CAP', 'duration', 'minutes'),
  ('sorties-cap', 'Sorties CAP', 'count', 'sorties'),
  ('cap-5km-termines', '5 km', 'count', 'sorties'),
  ('distance-trail', 'Distance Trail', 'distance', 'km'),
  ('duree-trail', 'Duree Trail', 'duration', 'minutes'),
  ('sorties-trail', 'Sorties Trail', 'count', 'sorties'),
  ('dplus-cap', 'D+ CAP', 'elevation', 'm'),
  ('dplus-trail', 'D+ Trail', 'elevation', 'm');
insert into public.mastery_levels (mastery_id, level, threshold, xp_reward)
select id, 1, 1, 5 from public.masteries
where slug in ('distance-cap', 'duree-cap', 'sorties-cap', 'distance-trail', 'duree-trail', 'sorties-trail');
insert into public.activities (id, user_id, sport, distance_km, duration_minutes, elevation_gain_m) values
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'course-a-pied', 5, 60, 180),
  ('10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', 'trail', 12, 90, 650),
  ('10000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000001', 'unknown', 5, 60, 0),
  ('10000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000001', 'course-a-pied', null, null, null);
-- Widen overlap so the concurrent callers exercise the transaction lock.
create function public.delay_test_entry() returns trigger language plpgsql as $$
begin perform pg_sleep(0.1); return new; end;
$$;
create trigger delay_test_entry before insert on public.mastery_entries
for each row execute function public.delay_test_entry();
