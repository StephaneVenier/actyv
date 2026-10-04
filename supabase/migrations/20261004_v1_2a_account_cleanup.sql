begin;

do $$
declare item record;
begin
  if to_regclass('public.users') is not null then raise exception 'V12_UNEXPECTED_LEGACY_USERS'; end if;
  for item in select * from jsonb_each_text('{"public.activities.user_id":"uuid","public.activities.user_email":"text","public.activities.challenge_id":"uuid","public.activities.comment":"text","public.activities.activity_name":"text","public.activities.metadata":"jsonb","public.challenges.created_by":"uuid","public.challenge_members.user_email":"text","public.challenge_participants.user_id":"uuid","public.activity_interactions.user_id":"uuid","public.daily_session_completions.user_id":"uuid","public.training_program_completions.user_id":"uuid","public.workout_sessions_history.user_id":"uuid","public.workout_exercise_history.user_id":"uuid","public.mastery_entries.user_id":"uuid","public.mastery_level_unlocks.user_id":"uuid","public.xp_events.user_id":"uuid","public.user_xp_events.user_id":"uuid","public.user_badges.user_id":"uuid","public.daily_steps.user_id":"uuid","public.training_programs.user_id":"uuid","public.training_sessions.user_id":"uuid","public.profiles.id":"uuid"}'::jsonb) loop
    if not exists(select 1 from information_schema.columns c where
      c.table_schema=split_part(item.key,'.',1) and c.table_name=split_part(item.key,'.',2)
      and c.column_name=split_part(item.key,'.',3) and c.data_type=item.value) then
      raise exception 'V12_TYPE_MISMATCH %',item.key;
    end if;
  end loop;
  for item in select * from (values
    ('activities','user_id'),('activities','user_email'),('activities','metadata'),
    ('activities','challenge_id'),('challenges','created_by'),('challenge_members','user_email'),
    ('training_sessions','user_id'),('training_programs','user_id'),
    ('workout_sessions_history','user_id'),('profiles','id'),
    ('training_sessions','id'),('daily_sessions','id'),('daily_sessions','session_id'),
    ('daily_session_completions','daily_session_id')) required(table_name,column_name)
  loop
    if not exists(select 1 from information_schema.columns c where c.table_schema='public'
      and c.table_name=item.table_name and c.column_name=item.column_name) then
      raise exception 'V12_SCHEMA_MISMATCH %.%',item.table_name,item.column_name;
    end if;
  end loop;
  if not exists(select 1 from information_schema.columns where table_schema='auth'
    and table_name='users' and column_name='id' and data_type='uuid')
    or not exists(select 1 from information_schema.columns where table_schema='auth'
    and table_name='users' and column_name='email') then raise exception 'V12_AUTH_SCHEMA_MISMATCH'; end if;
end $$;

-- Preserve the daily record and other users' completions when its source disappears.
alter table public.daily_sessions alter column session_id drop not null;
alter table public.daily_sessions drop constraint if exists daily_sessions_session_id_fkey;
alter table public.daily_sessions add constraint daily_sessions_session_id_fkey
  foreign key (session_id) references public.training_sessions(id) on delete set null;

-- Legacy completions can reference another owner's program. Keep the completion,
-- never the deleted owner's program or schedule, just as for daily sessions.
alter table public.training_program_completions alter column program_id drop not null;
alter table public.training_program_completions drop constraint if exists training_program_completions_program_id_fkey;
alter table public.training_program_completions add constraint training_program_completions_program_id_fkey
  foreign key (program_id) references public.training_programs(id) on delete set null;
alter table public.training_program_completions drop constraint if exists training_program_completions_program_session_id_fkey;
alter table public.training_program_completions add constraint training_program_completions_program_session_id_fkey
  foreign key (program_session_id) references public.training_program_sessions(id) on delete set null;

-- Auth remains usable for retry; only normal business writes are frozen.
create table if not exists public.account_deletion_state (
  user_id uuid primary key references auth.users(id) on delete cascade,
  cleanup_completed_at timestamptz not null default now()
);
alter table public.account_deletion_state enable row level security;
revoke all on public.account_deletion_state from public,anon,authenticated;
grant select,insert,update,delete on public.account_deletion_state to service_role;

-- Read-only lost-response acknowledgements: random proof hash, no email/token/GPS.
-- SET NULL is the durable acknowledgement that Auth deletion succeeded.
create table if not exists public.account_deletion_confirmations (
  proof_hash text primary key,
  user_id uuid references auth.users(id) on delete set null
);
alter table public.account_deletion_confirmations enable row level security;
revoke all on public.account_deletion_confirmations from public,anon,authenticated;
grant select,insert,delete on public.account_deletion_confirmations to service_role;

create or replace function public.get_own_account_deletion_status()
returns boolean language plpgsql security definer set search_path='' as $$
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  return exists(select 1 from public.account_deletion_state where user_id=auth.uid());
end $$;
revoke all on function public.get_own_account_deletion_status() from public,anon;
grant execute on function public.get_own_account_deletion_status() to authenticated,service_role;

-- Deny client mutations even with an already-issued JWT during pending deletion.
-- throughout deletion, including calls made through SECURITY DEFINER rewards.
create or replace function public.guard_account_deletion_write()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_role text; v_actor uuid;
begin
  v_role := coalesce(nullif(current_setting('request.jwt.claim.role',true),''),
    nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'role',
    current_setting('role',true));
  if v_role in ('anon','authenticated') then
    v_actor := auth.uid();
    if v_actor is not null then
      perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('actyv:delete:'||v_actor::text,0));
    end if;
    if v_actor is not null and (
      not exists(select 1 from auth.users where id=v_actor)
      or exists(select 1 from public.account_deletion_state where user_id=v_actor)
    ) then raise exception 'ACCOUNT_DELETION_IN_PROGRESS' using errcode='42501'; end if;
  end if;
  if TG_OP='DELETE' then return OLD; end if;
  return NEW;
end $$;
revoke all on function public.guard_account_deletion_write() from public,anon,authenticated;

do $$
declare v_table text;
begin
  foreach v_table in array array[
    'activities','activity_interactions','profiles','challenges','challenge_members',
    'challenge_participants','daily_session_completions','training_program_completions',
    'workout_sessions_history','workout_exercise_history','mastery_entries','mastery_level_unlocks',
    'xp_events','user_xp_events','user_badges','daily_steps','training_programs',
    'training_program_sessions','training_sessions','training_session_blocks'
  ] loop
    execute format('drop trigger if exists v12_account_deletion_write on public.%I',v_table);
    execute format('create trigger v12_account_deletion_write before insert or update or delete on public.%I for each row execute function public.guard_account_deletion_write()',v_table);
  end loop;
end $$;

-- Only the verified server endpoint can call this transactional cleanup.
-- Auth Admin hard deletion follows separately; failures remain authenticated/retryable.
create or replace function public.cleanup_account_data(p_user_id uuid)
returns void language plpgsql security definer set search_path='' as $$
declare v_email text;
begin
  if p_user_id is null then raise exception 'ACCOUNT_REQUIRED'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('actyv:delete:'||p_user_id::text,0));
  if exists(select 1 from public.account_deletion_state where user_id=p_user_id) then return; end if;
  select email into v_email from auth.users where id=p_user_id for update;
  if not found then return; end if;
  -- Personal activities (including route_trace) must not become orphan GPS rows.
  delete from public.activities where challenge_id is null and
    (user_id=p_user_id or (user_id is null and nullif(v_email,'') is not null and lower(user_email)=lower(v_email)));
  -- Collective contributions survive, but no identifying metadata/GPS is kept.
  update public.activities set user_id=null,user_email=null,comment=null,
    activity_name=null,exercise_type=null,metadata='{}'::jsonb
  where user_id=p_user_id or (user_id is null and nullif(v_email,'') is not null and lower(user_email)=lower(v_email));
  update public.challenges set created_by=null where created_by=p_user_id;
  delete from public.challenge_members where nullif(v_email,'') is not null and lower(user_email)=lower(v_email);
  delete from public.challenge_participants where user_id=p_user_id;
  delete from public.activity_interactions where user_id=p_user_id;
  delete from public.daily_session_completions where user_id=p_user_id;
  delete from public.training_program_completions where user_id=p_user_id;
  delete from public.workout_sessions_history where user_id=p_user_id;
  delete from public.workout_exercise_history where user_id=p_user_id;
  delete from public.mastery_entries where user_id=p_user_id;
  delete from public.mastery_level_unlocks where user_id=p_user_id;
  delete from public.xp_events where user_id=p_user_id;
  delete from public.user_xp_events where user_id=p_user_id;
  delete from public.user_badges where user_id=p_user_id;
  delete from public.daily_steps where user_id=p_user_id;
  delete from public.training_programs where user_id=p_user_id;
  delete from public.training_sessions where user_id=p_user_id;
  delete from public.profiles where id=p_user_id;
  -- This row commits with cleanup, never before or independently of it.
  insert into public.account_deletion_state(user_id) values(p_user_id);
end $$;
revoke all on function public.cleanup_account_data(uuid) from public,anon,authenticated;
grant execute on function public.cleanup_account_data(uuid) to service_role;

commit;
