begin;

alter table public.workout_sessions_history
  add column if not exists run_key text;

-- Legacy histories without a run key remain valid.
create unique index if not exists workout_sessions_history_user_run_key_uidx
  on public.workout_sessions_history (user_id, run_key)
  where run_key is not null;

notify pgrst, 'reload schema';

commit;
