alter table if exists public.profiles enable row level security;

drop policy if exists "Users can read own profile" on public.profiles;
create policy "Users can read own profile"
  on public.profiles for select
  to authenticated
  using (id = auth.uid());

drop policy if exists "Users can insert own profile" on public.profiles;
create policy "Users can insert own profile"
  on public.profiles for insert
  to authenticated
  with check (id = auth.uid());

drop policy if exists "Users can update own profile" on public.profiles;
create policy "Users can update own profile"
  on public.profiles for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

drop policy if exists "Users can delete own profile" on public.profiles;
create policy "Users can delete own profile"
  on public.profiles for delete
  to authenticated
  using (id = auth.uid());

create or replace view public.public_profiles as
select
  id,
  nullif(trim(username), '') as username,
  level,
  total_xp
from public.profiles;

grant select, insert, update, delete on public.profiles to authenticated;
grant select on public.public_profiles to anon;
grant select on public.public_profiles to authenticated;

notify pgrst, 'reload schema';
