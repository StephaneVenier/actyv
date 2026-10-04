begin;

-- Fail before replacing policies if the deployment schema drifts again.
-- Every business column referenced below is checked against the live catalog.
do $$
declare requirement record; column_name text; missing_columns text[] := array[]::text[];
begin
  for requirement in select * from jsonb_each('{
    "auth.users": ["id","email","raw_user_meta_data"],
    "public.activities": ["user_id","challenge_id","source"],
    "public.profiles": ["id","email","username","total_xp","level"],
    "public.challenges": ["id","created_by","is_deleted","visibility"],
    "public.challenge_members": ["challenge_id","user_email"],
    "public.challenge_participants": ["challenge_id","user_id","role"],
    "public.training_programs": ["id","user_id","name","description","sport","duration_weeks","visibility","start_date","created_at","invite_code"],
    "public.training_program_sessions": ["id","program_id","session_id","session_name","sport","week_number","day_of_week","order_index","created_at"],
    "public.program_sessions": [],
    "public.training_program_completions": []
  }'::jsonb)
  loop
    if to_regclass(requirement.key) is null then
      missing_columns := array_append(missing_columns, requirement.key);
    else
      for column_name in select jsonb_array_elements_text(requirement.value)
      loop
        if not exists (select 1 from pg_catalog.pg_attribute a
          where a.attrelid = to_regclass(requirement.key) and a.attname = column_name
            and a.attnum > 0 and not a.attisdropped) then
          missing_columns := array_append(missing_columns, requirement.key || '.' || column_name);
        end if;
      end loop;
    end if;
  end loop;
  if cardinality(missing_columns) > 0 then
    raise exception 'V1A_SCHEMA_MISMATCH: %', array_to_string(missing_columns, ', ');
  end if;
end;
$$;

-- Replace the complete policy set on these tables: permissive policies combine
-- with OR, so retaining an old ALL/true policy would defeat the new restrictions.
do $$
declare p record;
begin
  for p in select tablename, policyname from pg_catalog.pg_policies
    where schemaname = 'public' and tablename in
      ('activities', 'profiles', 'challenges', 'challenge_members',
       'challenge_participants', 'program_sessions', 'training_programs',
       'training_program_sessions')
  loop
    execute format('drop policy if exists %I on public.%I', p.policyname, p.tablename);
  end loop;
end;
$$;

alter table public.activities enable row level security;
alter table public.profiles enable row level security;
alter table public.challenges enable row level security;
alter table public.challenge_members enable row level security;
alter table public.challenge_participants enable row level security;
alter table public.program_sessions enable row level security;
alter table public.training_programs enable row level security;
alter table public.training_program_sessions enable row level security;

-- Caller-scoped helpers avoid challenges <-> memberships policy recursion.
-- Never accept a client-supplied user UUID. Ownership, not legacy role text,
-- determines who can change a challenge.
-- Production visibility permits private/community only. Community discovery
-- remains authenticated; is_public is not used to invent anonymous sharing.
create or replace function public.v1a_owns_challenge(p_challenge_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select auth.uid() is not null and exists (
    select 1 from public.challenges c
    where c.id = p_challenge_id and c.created_by = auth.uid()
  );
$$;

create or replace function public.v1a_can_read_challenge(p_challenge_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.challenges c
    where c.id = p_challenge_id and not coalesce(c.is_deleted, false)
      and (auth.uid() is not null and (
        c.visibility = 'community' or c.created_by = auth.uid()
        or exists (select 1 from public.challenge_participants p
          where p.challenge_id = c.id and p.user_id = auth.uid())
        or exists (select 1 from public.challenge_members m
          where m.challenge_id = c.id
            and nullif(m.user_email, '') is not null
            and nullif(auth.jwt() ->> 'email', '') is not null
            and lower(m.user_email) = lower(auth.jwt() ->> 'email'))
      ))
  );
$$;
revoke all on function public.v1a_owns_challenge(uuid),
  public.v1a_can_read_challenge(uuid) from public, anon, authenticated;
grant execute on function public.v1a_owns_challenge(uuid) to authenticated;
grant execute on function public.v1a_can_read_challenge(uuid) to anon, authenticated;

create policy v1a_challenges_read on public.challenges for select to anon, authenticated
  using (public.v1a_can_read_challenge(id));
create policy v1a_challenges_insert on public.challenges for insert to authenticated
  with check (created_by = auth.uid());
create policy v1a_challenges_update on public.challenges for update to authenticated
  using (created_by = auth.uid()) with check (created_by = auth.uid());
create policy v1a_challenges_delete on public.challenges for delete to authenticated
  using (created_by = auth.uid());

create policy v1a_members_read on public.challenge_members for select to authenticated
  using (public.v1a_can_read_challenge(challenge_id));
-- The current app joins through participants / the existing invitation RPC.
-- No client INSERT/UPDATE into legacy members is required.
-- Production members have only user_email, not user_id; NULL/empty must never match.
create policy v1a_members_delete on public.challenge_members for delete to authenticated
  using (auth.uid() is not null and (public.v1a_owns_challenge(challenge_id)
    or (nullif(user_email, '') is not null
      and nullif(auth.jwt() ->> 'email', '') is not null
      and lower(user_email) = lower(auth.jwt() ->> 'email'))));

create policy v1a_participants_read on public.challenge_participants for select to authenticated
  using (public.v1a_can_read_challenge(challenge_id));
create policy v1a_participants_insert on public.challenge_participants for insert to authenticated
  with check (user_id = auth.uid() and public.v1a_can_read_challenge(challenge_id)
    and (role = 'participant' or (role = 'admin' and public.v1a_owns_challenge(challenge_id))));
create policy v1a_participants_delete on public.challenge_participants for delete to authenticated
  using (user_id = auth.uid() or public.v1a_owns_challenge(challenge_id));

create policy v1a_activities_read on public.activities for select to authenticated
  using (user_id = auth.uid() or
    (challenge_id is not null and public.v1a_can_read_challenge(challenge_id)));
create policy v1a_activities_insert on public.activities for insert to authenticated
  with check (user_id = auth.uid() and (
    (challenge_id is null and source = 'live')
    or (challenge_id is not null and public.v1a_can_read_challenge(challenge_id))
  ));
create policy v1a_activities_delete on public.activities for delete to authenticated
  using (user_id = auth.uid());
-- No client activity UPDATE is used by 5B: retries INSERT then read the same ID.

create policy v1a_profiles_read on public.profiles for select to authenticated
  using (id = auth.uid());
create policy v1a_profiles_update on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- A separate explicit projection avoids depending on the deployed legacy view
-- column layout. No email or other private profile fields are exposed.
create or replace view public.v1a_public_profiles as
  select id, nullif(trim(username), '') as username, level, total_xp
  from public.profiles;
-- This legacy view is absent in the production export. Revoke only if present.
do $$
begin
  if to_regclass('public.public_profiles') is not null then
    execute 'revoke all on public.public_profiles from public, anon, authenticated';
  end if;
end;
$$;
revoke all on public.v1a_public_profiles from public, anon, authenticated;
grant select on public.v1a_public_profiles to anon, authenticated;

-- Email-confirmed signups can have no browser session at signup time. Provision
-- only on authenticated first use; never trust a user_id/email/XP from the client.
-- Drop permits replacing the earlier local void signature; no policies depend on it.
drop function if exists public.ensure_own_profile();
create function public.ensure_own_profile()
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  owner_id uuid := auth.uid();
  owner_email text;
  chosen_username text;
  violated_constraint text;
  result public.profiles%rowtype;
begin
  if owner_id is null then raise exception 'AUTH_REQUIRED'; end if;
  -- Serialize provisioning of this account, including concurrent retries.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(owner_id::text, 0));
  select * into result from public.profiles where id = owner_id;
  if not found then
    select u.email, nullif(trim(u.raw_user_meta_data ->> 'username'), '')
      into owner_email, chosen_username from auth.users u where u.id = owner_id;
    if not found then raise exception 'AUTH_USER_MISSING'; end if;
    loop
      if chosen_username is null then
        chosen_username := 'Utilisateur_' || substr(replace(pg_catalog.gen_random_uuid()::text, '-', ''), 1, 12);
      end if;
      begin
        insert into public.profiles (id, email, username, total_xp, level)
          values (owner_id, owner_email, chosen_username, 0, 1)
          on conflict (id) do nothing;
        exit;
      exception when unique_violation then
        get stacked diagnostics violated_constraint = constraint_name;
        -- Never swallow an email or other unrelated integrity violation.
        if violated_constraint <> 'profiles_username_key' then raise; end if;
        chosen_username := null;
      end;
    end loop;
    select * into strict result from public.profiles where id = owner_id;
  end if;
  return jsonb_build_object('id', result.id, 'email', result.email,
    'username', result.username, 'total_xp', result.total_xp, 'level', result.level);
end;
$$;
revoke all on function public.ensure_own_profile() from public, anon, authenticated;
grant execute on function public.ensure_own_profile() to authenticated;

-- Keep private/public program editing unchanged; shared is accessible ONLY via
-- an exact invitation code, not via table enumeration.
create policy v1a_programs_manage on public.training_programs for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy v1a_programs_public on public.training_programs for select to authenticated
  using (visibility = 'public');
create policy v1a_program_sessions_manage on public.training_program_sessions for all to authenticated
  using (exists (select 1 from public.training_programs p
    where p.id = program_id and p.user_id = auth.uid()))
  with check (exists (select 1 from public.training_programs p
    where p.id = program_id and p.user_id = auth.uid()));
create policy v1a_program_sessions_public on public.training_program_sessions for select to authenticated
  using (exists (select 1 from public.training_programs p
    where p.id = program_id and p.visibility = 'public'));
-- public.program_sessions is legacy (challenge plans), has no app callers.
-- RLS enabled, no policies and no client grants: retain data, deny client access.

create or replace function public.get_shared_program_preview(p_invite_code text)
returns jsonb language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'program', jsonb_build_object('id', p.id, 'user_id', p.user_id,
      'name', p.name, 'description', p.description, 'sport', p.sport,
      'duration_weeks', p.duration_weeks, 'visibility', p.visibility,
      'start_date', p.start_date, 'created_at', p.created_at),
    'sessions', coalesce((select jsonb_agg(jsonb_build_object(
      'id', s.id, 'program_id', s.program_id, 'session_id', s.session_id,
      'session_name', s.session_name, 'sport', s.sport, 'week_number', s.week_number,
      'day_of_week', s.day_of_week, 'order_index', s.order_index, 'created_at', s.created_at
    ) order by s.week_number, s.day_of_week, s.order_index)
      from public.training_program_sessions s where s.program_id = p.id), '[]'::jsonb)
  ) from public.training_programs p
  where nullif(trim(p_invite_code), '') is not null
    and p.invite_code = p_invite_code and p.visibility = 'shared';
$$;
revoke all on function public.get_shared_program_preview(text) from public, anon, authenticated;
grant execute on function public.get_shared_program_preview(text) to anon, authenticated;

-- Remove table AND column privileges (table REVOKE alone leaves column grants).
do $$
declare t text; columns text;
begin
  foreach t in array array['activities','profiles','challenges','challenge_members',
    'challenge_participants','program_sessions','training_programs','training_program_sessions']
  loop
    execute format('revoke all on table public.%I from public, anon, authenticated', t);
    select string_agg(quote_ident(a.attname), ', ') into columns
      from pg_catalog.pg_attribute a
      where a.attrelid = format('public.%I', t)::regclass and a.attnum > 0 and not a.attisdropped;
    execute format('revoke select (%s), insert (%s), update (%s), references (%s) on public.%I from public, anon, authenticated',
      columns, columns, columns, columns, t);
  end loop;
end;
$$;
grant select, insert, delete on public.activities to authenticated;
grant select on public.profiles to authenticated;
grant update (username) on public.profiles to authenticated;
grant select on public.challenges to anon;
grant select, insert, update, delete on public.challenges to authenticated;
grant select, delete on public.challenge_members to authenticated;
grant select, insert, delete on public.challenge_participants to authenticated;
grant select, insert, update, delete on public.training_programs,
  public.training_program_sessions to authenticated;
revoke truncate, references, trigger on public.training_program_completions
  from public, anon, authenticated;

notify pgrst, 'reload schema';
commit;
