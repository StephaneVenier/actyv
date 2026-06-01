create table if not exists public.daily_sessions (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.training_sessions(id) on delete cascade,
  scheduled_for date not null,
  bonus_xp integer not null default 25 check (bonus_xp >= 0),
  created_at timestamptz not null default now()
);

create unique index if not exists daily_sessions_scheduled_for_uidx
  on public.daily_sessions (scheduled_for);

create table if not exists public.daily_session_completions (
  id uuid primary key default gen_random_uuid(),
  daily_session_id uuid not null references public.daily_sessions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  session_id uuid references public.training_sessions(id) on delete set null,
  workout_history_id uuid references public.workout_sessions_history(id) on delete set null,
  scheduled_for date not null,
  completed_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create unique index if not exists daily_session_completions_user_daily_uidx
  on public.daily_session_completions (user_id, daily_session_id);

create unique index if not exists daily_session_completions_user_day_uidx
  on public.daily_session_completions (user_id, scheduled_for);

create index if not exists daily_session_completions_user_created_idx
  on public.daily_session_completions (user_id, completed_at desc);

alter table if exists public.daily_sessions enable row level security;
alter table if exists public.daily_session_completions enable row level security;

drop policy if exists "Anyone can read daily sessions" on public.daily_sessions;
create policy "Anyone can read daily sessions"
  on public.daily_sessions for select
  using (
    exists (
      select 1
      from public.training_sessions
      where training_sessions.id = daily_sessions.session_id
        and training_sessions.visibility = 'public'
    )
  );

drop policy if exists "Users can read own daily session completions" on public.daily_session_completions;
create policy "Users can read own daily session completions"
  on public.daily_session_completions for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Users can insert own daily session completions" on public.daily_session_completions;
create policy "Users can insert own daily session completions"
  on public.daily_session_completions for insert
  to authenticated
  with check (
    auth.uid() = user_id
    and exists (
      select 1
      from public.daily_sessions
      join public.training_sessions
        on training_sessions.id = daily_sessions.session_id
      where daily_sessions.id = daily_session_completions.daily_session_id
        and training_sessions.visibility = 'public'
    )
  );

drop policy if exists "Users can update own daily session completions" on public.daily_session_completions;
create policy "Users can update own daily session completions"
  on public.daily_session_completions for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users can delete own daily session completions" on public.daily_session_completions;
create policy "Users can delete own daily session completions"
  on public.daily_session_completions for delete
  to authenticated
  using (auth.uid() = user_id);

grant select on public.daily_sessions to anon;
grant select on public.daily_sessions to authenticated;
grant select, insert, update, delete on public.daily_session_completions to authenticated;

do $$
declare
  public_session_ids uuid[];
  sessions_count integer;
  day_offset integer;
begin
  select array_agg(id order by name), count(*)
  into public_session_ids, sessions_count
  from public.training_sessions
  where visibility = 'public';

  if sessions_count is null or sessions_count = 0 then
    raise notice 'Daily sessions seed skipped: no public training sessions available.';
    return;
  end if;

  for day_offset in 0..13 loop
    insert into public.daily_sessions (session_id, scheduled_for, bonus_xp)
    values (
      public_session_ids[(day_offset % sessions_count) + 1],
      current_date + day_offset,
      25
    )
    on conflict (scheduled_for) do nothing;
  end loop;
end $$;

notify pgrst, 'reload schema';
