alter table if exists public.xp_events enable row level security;

drop policy if exists "Users can read own xp events" on public.xp_events;
create policy "Users can read own xp events"
on public.xp_events
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "Users can insert own xp events" on public.xp_events;
create policy "Users can insert own xp events"
on public.xp_events
for insert
to authenticated
with check (auth.uid() = user_id);

notify pgrst, 'reload schema';
