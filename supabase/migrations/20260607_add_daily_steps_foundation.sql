create table if not exists public.daily_steps (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  step_date date not null,
  steps_count integer not null default 0 check (steps_count >= 0),
  source text not null default 'manual',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists daily_steps_user_date_uidx
  on public.daily_steps (user_id, step_date);

create index if not exists daily_steps_user_date_idx
  on public.daily_steps (user_id, step_date desc);

alter table if exists public.daily_steps enable row level security;

drop policy if exists "Users can read own daily steps" on public.daily_steps;
create policy "Users can read own daily steps"
  on public.daily_steps for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Users can insert own daily steps" on public.daily_steps;
create policy "Users can insert own daily steps"
  on public.daily_steps for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "Users can update own daily steps" on public.daily_steps;
create policy "Users can update own daily steps"
  on public.daily_steps for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

grant select, insert, update on public.daily_steps to authenticated;

notify pgrst, 'reload schema';
