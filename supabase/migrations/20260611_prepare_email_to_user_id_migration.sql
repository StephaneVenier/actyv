alter table if exists public.activities
  add column if not exists user_id uuid references auth.users(id) on delete set null;

alter table if exists public.challenge_members
  add column if not exists user_id uuid references auth.users(id) on delete set null;

create index if not exists activities_user_id_idx
  on public.activities(user_id);

create index if not exists challenge_members_user_id_idx
  on public.challenge_members(user_id);

update public.activities as activities
set user_id = profiles.id
from public.profiles as profiles
where activities.user_id is null
  and activities.user_email is not null
  and lower(profiles.email) = lower(activities.user_email);

update public.challenge_members as challenge_members
set user_id = profiles.id
from public.profiles as profiles
where challenge_members.user_id is null
  and challenge_members.user_email is not null
  and lower(profiles.email) = lower(challenge_members.user_email);

notify pgrst, 'reload schema';
