alter table if exists public.daily_steps
  add column if not exists xp_awarded integer not null default 0 check (xp_awarded >= 0);

update public.daily_steps
set xp_awarded = 0
where xp_awarded is null;

notify pgrst, 'reload schema';
