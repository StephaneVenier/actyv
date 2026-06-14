alter table if exists public.daily_steps
  add column if not exists synced_at timestamptz,
  add column if not exists distance_meters double precision,
  add column if not exists walk_run_distance_meters double precision,
  add column if not exists bike_distance_meters double precision;

create index if not exists daily_steps_user_synced_idx
  on public.daily_steps (user_id, synced_at desc);

notify pgrst, 'reload schema';
