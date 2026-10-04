begin;

-- Production catalog 2026-10-04: fail closed before replacing any protection.
do $$
declare item record; col text; actual_type text;
begin
  for item in select * from jsonb_each('{"public.activities":["id","challenge_id","user_email","sport","distance_km","duration_minutes","comment","created_at","unit_type","unit_value","exercise_type","user_id","likes_count","boosts_count","activity_name","source","occurred_at","elevation_gain_m","elevation_loss_m","metadata"],"public.activity_interactions":["id","activity_id","user_id","type","created_at"],"public.challenge_members":["id","challenge_id","user_email","role","joined_at"],"public.challenge_participants":["id","challenge_id","user_id","role","joined_at"],"public.challenges":["id","name","sport","start_date","end_date","created_at","description","goal_km","created_by","visibility","invite_code","goal_type","goal_value","status","is_deleted","is_public"],"public.daily_session_completions":["id","daily_session_id","user_id","session_id","workout_history_id","scheduled_for","completed_at","created_at"],"public.daily_sessions":["id","session_id","scheduled_for","bonus_xp","created_at"],"public.daily_steps":["id","user_id","step_date","steps_count","source","created_at","updated_at","synced_at","distance_meters","walk_run_distance_meters","bike_distance_meters"],"public.exercise_library":["id","slug","name","sport","category","movement_type","tracking_type","supports_load","primary_muscles","secondary_muscles","equipment","difficulty","description","instructions","image_path","active","metadata","created_at","updated_at"],"public.masteries":["id","slug","name","category_id","measurement_type","unit","description","active","sort_order","created_at"],"public.mastery_categories":["id","slug","name","sort_order","active","created_at"],"public.mastery_entries":["id","user_id","mastery_id","value","source","source_ref_id","metadata","performed_at","created_at"],"public.mastery_exercise_links":["id","mastery_id","exercise_key","exercise_name","exercise_id","source_type","created_at"],"public.mastery_level_unlocks":["id","user_id","mastery_id","level","xp_awarded","unlocked_at"],"public.mastery_levels":["id","mastery_id","level","threshold","xp_reward","created_at"],"public.mastery_muscles":["id","mastery_id","muscle_key","weight","created_at"],"public.profiles":["id","email","username","created_at","total_xp","level"],"public.program_sessions":["id","challenge_id","week_number","title","description","target_duration","target_distance"],"public.training_program_completions":["id","user_id","program_id","program_session_id","completed_at","session_id","workout_history_id","created_at"],"public.training_program_sessions":["id","program_id","workout_id","week_number","day_number","position","created_at","session_id","day_of_week","session_name","order_index","sport"],"public.training_programs":["id","user_id","name","description","sport","duration_weeks","start_date","visibility","created_at","invite_code","updated_at","copied_from_program_id","difficulty"],"public.training_session_blocks":["id","session_id","position","name","block_type","target_value","created_at","charge_kg","sets_count","rest_seconds","exercise_id"],"public.training_sessions":["id","user_id","name","sport","description","created_at","updated_at","visibility","copied_from_session_id","difficulty"],"public.user_badges":["id","user_id","badge_code","unlocked_at"],"public.user_xp_events":["id","user_id","event_type","source_type","source_id","xp_amount","created_at"],"public.workout_exercise_history":["id","history_id","user_id","workout_id","exercise_name","block_type","sets_count","reps","duration_seconds","distance","charge_kg","volume","completed_at","created_at","actual_sets"],"public.workout_sessions_history":["id","user_id","workout_id","workout_name","completed_at","duration_seconds","estimated_calories","total_volume","completed_exercises","created_at","metadata","run_key"],"public.xp_events":["id","user_id","event_type","xp_amount","target_id","created_at"]}'::jsonb) loop
    if to_regclass(item.key) is null then raise exception 'V1B_SCHEMA_MISSING: %', item.key; end if;
    for col in select jsonb_array_elements_text(item.value) loop
      if not exists (select 1 from pg_catalog.pg_attribute where attrelid=to_regclass(item.key) and attname=col and attnum>0 and not attisdropped)
        then raise exception 'V1B_COLUMN_MISSING: %.%', item.key, col; end if;
    end loop;
  end loop;
  for item in select * from jsonb_each_text('{"public.activities.id":"uuid","public.activities.challenge_id":"uuid","public.activities.user_email":"text","public.activities.sport":"text","public.activities.distance_km":"numeric","public.activities.duration_minutes":"numeric","public.activities.comment":"text","public.activities.created_at":"timestamp without time zone","public.activities.unit_type":"text","public.activities.unit_value":"numeric","public.activities.exercise_type":"text","public.activities.user_id":"uuid","public.activities.likes_count":"integer","public.activities.boosts_count":"integer","public.activities.activity_name":"text","public.activities.source":"text","public.activities.occurred_at":"timestamp with time zone","public.activities.elevation_gain_m":"numeric","public.activities.elevation_loss_m":"numeric","public.activities.metadata":"jsonb","public.activity_interactions.id":"uuid","public.activity_interactions.activity_id":"uuid","public.activity_interactions.user_id":"uuid","public.activity_interactions.type":"text","public.activity_interactions.created_at":"timestamp with time zone","public.challenge_members.id":"uuid","public.challenge_members.challenge_id":"uuid","public.challenge_members.user_email":"text","public.challenge_members.role":"text","public.challenge_members.joined_at":"timestamp without time zone","public.challenge_participants.id":"uuid","public.challenge_participants.challenge_id":"uuid","public.challenge_participants.user_id":"uuid","public.challenge_participants.role":"text","public.challenge_participants.joined_at":"timestamp with time zone","public.challenges.id":"uuid","public.challenges.name":"text","public.challenges.sport":"text","public.challenges.start_date":"date","public.challenges.end_date":"date","public.challenges.created_at":"timestamp without time zone","public.challenges.description":"text","public.challenges.goal_km":"numeric","public.challenges.created_by":"uuid","public.challenges.visibility":"text","public.challenges.invite_code":"text","public.challenges.goal_type":"text","public.challenges.goal_value":"numeric","public.challenges.status":"text","public.challenges.is_deleted":"boolean","public.challenges.is_public":"boolean","public.daily_session_completions.id":"uuid","public.daily_session_completions.daily_session_id":"uuid","public.daily_session_completions.user_id":"uuid","public.daily_session_completions.session_id":"uuid","public.daily_session_completions.workout_history_id":"uuid","public.daily_session_completions.scheduled_for":"date","public.daily_session_completions.completed_at":"timestamp with time zone","public.daily_session_completions.created_at":"timestamp with time zone","public.daily_sessions.id":"uuid","public.daily_sessions.session_id":"uuid","public.daily_sessions.scheduled_for":"date","public.daily_sessions.bonus_xp":"integer","public.daily_sessions.created_at":"timestamp with time zone","public.daily_steps.id":"uuid","public.daily_steps.user_id":"uuid","public.daily_steps.step_date":"date","public.daily_steps.steps_count":"integer","public.daily_steps.source":"text","public.daily_steps.created_at":"timestamp with time zone","public.daily_steps.updated_at":"timestamp with time zone","public.daily_steps.synced_at":"timestamp with time zone","public.daily_steps.distance_meters":"double precision","public.daily_steps.walk_run_distance_meters":"double precision","public.daily_steps.bike_distance_meters":"double precision","public.exercise_library.id":"uuid","public.exercise_library.slug":"text","public.exercise_library.name":"text","public.exercise_library.sport":"text","public.exercise_library.category":"text","public.exercise_library.movement_type":"text","public.exercise_library.tracking_type":"text","public.exercise_library.supports_load":"boolean","public.exercise_library.primary_muscles":"text[]","public.exercise_library.secondary_muscles":"text[]","public.exercise_library.equipment":"text[]","public.exercise_library.difficulty":"text","public.exercise_library.description":"text","public.exercise_library.instructions":"text","public.exercise_library.image_path":"text","public.exercise_library.active":"boolean","public.exercise_library.metadata":"jsonb","public.exercise_library.created_at":"timestamp with time zone","public.exercise_library.updated_at":"timestamp with time zone","public.masteries.id":"uuid","public.masteries.slug":"text","public.masteries.name":"text","public.masteries.category_id":"uuid","public.masteries.measurement_type":"text","public.masteries.unit":"text","public.masteries.description":"text","public.masteries.active":"boolean","public.masteries.sort_order":"integer","public.masteries.created_at":"timestamp with time zone","public.mastery_categories.id":"uuid","public.mastery_categories.slug":"text","public.mastery_categories.name":"text","public.mastery_categories.sort_order":"integer","public.mastery_categories.active":"boolean","public.mastery_categories.created_at":"timestamp with time zone","public.mastery_entries.id":"uuid","public.mastery_entries.user_id":"uuid","public.mastery_entries.mastery_id":"uuid","public.mastery_entries.value":"numeric","public.mastery_entries.source":"text","public.mastery_entries.source_ref_id":"uuid","public.mastery_entries.metadata":"jsonb","public.mastery_entries.performed_at":"timestamp with time zone","public.mastery_entries.created_at":"timestamp with time zone","public.mastery_exercise_links.id":"uuid","public.mastery_exercise_links.mastery_id":"uuid","public.mastery_exercise_links.exercise_key":"text","public.mastery_exercise_links.exercise_name":"text","public.mastery_exercise_links.exercise_id":"uuid","public.mastery_exercise_links.source_type":"text","public.mastery_exercise_links.created_at":"timestamp with time zone","public.mastery_level_unlocks.id":"uuid","public.mastery_level_unlocks.user_id":"uuid","public.mastery_level_unlocks.mastery_id":"uuid","public.mastery_level_unlocks.level":"integer","public.mastery_level_unlocks.xp_awarded":"integer","public.mastery_level_unlocks.unlocked_at":"timestamp with time zone","public.mastery_levels.id":"uuid","public.mastery_levels.mastery_id":"uuid","public.mastery_levels.level":"integer","public.mastery_levels.threshold":"numeric","public.mastery_levels.xp_reward":"integer","public.mastery_levels.created_at":"timestamp with time zone","public.mastery_muscles.id":"uuid","public.mastery_muscles.mastery_id":"uuid","public.mastery_muscles.muscle_key":"text","public.mastery_muscles.weight":"numeric","public.mastery_muscles.created_at":"timestamp with time zone","public.profiles.id":"uuid","public.profiles.email":"text","public.profiles.username":"text","public.profiles.created_at":"timestamp with time zone","public.profiles.total_xp":"integer","public.profiles.level":"integer","public.program_sessions.id":"uuid","public.program_sessions.challenge_id":"uuid","public.program_sessions.week_number":"integer","public.program_sessions.title":"text","public.program_sessions.description":"text","public.program_sessions.target_duration":"integer","public.program_sessions.target_distance":"numeric","public.training_program_completions.id":"uuid","public.training_program_completions.user_id":"uuid","public.training_program_completions.program_id":"uuid","public.training_program_completions.program_session_id":"uuid","public.training_program_completions.completed_at":"timestamp with time zone","public.training_program_completions.session_id":"uuid","public.training_program_completions.workout_history_id":"uuid","public.training_program_completions.created_at":"timestamp with time zone","public.training_program_sessions.id":"uuid","public.training_program_sessions.program_id":"uuid","public.training_program_sessions.workout_id":"uuid","public.training_program_sessions.week_number":"integer","public.training_program_sessions.day_number":"integer","public.training_program_sessions.position":"integer","public.training_program_sessions.created_at":"timestamp with time zone","public.training_program_sessions.session_id":"uuid","public.training_program_sessions.day_of_week":"integer","public.training_program_sessions.session_name":"text","public.training_program_sessions.order_index":"integer","public.training_program_sessions.sport":"text","public.training_programs.id":"uuid","public.training_programs.user_id":"uuid","public.training_programs.name":"text","public.training_programs.description":"text","public.training_programs.sport":"text","public.training_programs.duration_weeks":"integer","public.training_programs.start_date":"date","public.training_programs.visibility":"text","public.training_programs.created_at":"timestamp with time zone","public.training_programs.invite_code":"text","public.training_programs.updated_at":"timestamp with time zone","public.training_programs.copied_from_program_id":"uuid","public.training_programs.difficulty":"text","public.training_session_blocks.id":"uuid","public.training_session_blocks.session_id":"uuid","public.training_session_blocks.position":"integer","public.training_session_blocks.name":"text","public.training_session_blocks.block_type":"text","public.training_session_blocks.target_value":"numeric","public.training_session_blocks.created_at":"timestamp with time zone","public.training_session_blocks.charge_kg":"numeric","public.training_session_blocks.sets_count":"integer","public.training_session_blocks.rest_seconds":"integer","public.training_session_blocks.exercise_id":"uuid","public.training_sessions.id":"uuid","public.training_sessions.user_id":"uuid","public.training_sessions.name":"text","public.training_sessions.sport":"text","public.training_sessions.description":"text","public.training_sessions.created_at":"timestamp with time zone","public.training_sessions.updated_at":"timestamp with time zone","public.training_sessions.visibility":"text","public.training_sessions.copied_from_session_id":"uuid","public.training_sessions.difficulty":"text","public.user_badges.id":"uuid","public.user_badges.user_id":"uuid","public.user_badges.badge_code":"text","public.user_badges.unlocked_at":"timestamp with time zone","public.user_xp_events.id":"uuid","public.user_xp_events.user_id":"uuid","public.user_xp_events.event_type":"text","public.user_xp_events.source_type":"text","public.user_xp_events.source_id":"uuid","public.user_xp_events.xp_amount":"integer","public.user_xp_events.created_at":"timestamp with time zone","public.workout_exercise_history.id":"uuid","public.workout_exercise_history.history_id":"uuid","public.workout_exercise_history.user_id":"uuid","public.workout_exercise_history.workout_id":"uuid","public.workout_exercise_history.exercise_name":"text","public.workout_exercise_history.block_type":"text","public.workout_exercise_history.sets_count":"integer","public.workout_exercise_history.reps":"numeric","public.workout_exercise_history.duration_seconds":"integer","public.workout_exercise_history.distance":"numeric","public.workout_exercise_history.charge_kg":"numeric","public.workout_exercise_history.volume":"numeric","public.workout_exercise_history.completed_at":"timestamp with time zone","public.workout_exercise_history.created_at":"timestamp with time zone","public.workout_exercise_history.actual_sets":"jsonb","public.workout_sessions_history.id":"uuid","public.workout_sessions_history.user_id":"uuid","public.workout_sessions_history.workout_id":"uuid","public.workout_sessions_history.workout_name":"text","public.workout_sessions_history.completed_at":"timestamp with time zone","public.workout_sessions_history.duration_seconds":"integer","public.workout_sessions_history.estimated_calories":"numeric","public.workout_sessions_history.total_volume":"numeric","public.workout_sessions_history.completed_exercises":"integer","public.workout_sessions_history.created_at":"timestamp with time zone","public.workout_sessions_history.metadata":"jsonb","public.workout_sessions_history.run_key":"text","public.xp_events.id":"uuid","public.xp_events.user_id":"uuid","public.xp_events.event_type":"text","public.xp_events.xp_amount":"integer","public.xp_events.target_id":"text","public.xp_events.created_at":"timestamp with time zone"}'::jsonb) loop
    select format_type(a.atttypid,a.atttypmod) into actual_type from pg_catalog.pg_attribute a
      where a.attrelid=to_regclass(split_part(item.key,'.',1)||'.'||split_part(item.key,'.',2))
        and a.attname=split_part(item.key,'.',3) and a.attnum>0 and not a.attisdropped;
    if actual_type is distinct from item.value then raise exception 'V1B_TYPE_MISMATCH: %',item.key; end if;
  end loop;
  if not exists (select 1 from pg_catalog.pg_trigger where tgrelid='public.activities'::regclass
    and tgname='trg_award_xp_on_activity_created' and tgenabled='O'
    and tgfoid=to_regprocedure('public.award_xp_on_activity_created()'))
    or not exists (select 1 from pg_catalog.pg_trigger where tgrelid='public.activity_interactions'::regclass
      and tgname='trg_award_xp_on_activity_interaction_created' and tgenabled='O'
      and tgfoid=to_regprocedure('public.award_xp_on_activity_interaction_created()'))
    or not exists (select 1 from pg_catalog.pg_trigger where tgrelid='public.challenges'::regclass
      and tgname='trg_award_xp_on_challenge_created' and tgenabled='O'
      and tgfoid=to_regprocedure('public.award_xp_on_challenge_created()'))
    then raise exception 'V1B_REWARD_TRIGGER_MISSING'; end if;
  if not exists (select 1 from pg_catalog.pg_index where indrelid='public.xp_events'::regclass and indisunique
    and pg_get_indexdef(indexrelid) like '%(user_id, event_type, target_id)%')
    then raise exception 'V1B_XP_UNIQUE_MISSING'; end if;
end $$;

-- Canonical identity includes existing aliases: no historical rewrites.
create or replace function public.v1b_xp_type(p_type text) returns text
language sql immutable set search_path='' as $$
  select case p_type when 'activity_created' then 'activity_added'
    when 'activity_like_received' then 'like_received'
    when 'activity_boost_received' then 'boost_received'
    when 'workout_completed' then 'session_completed' else p_type end;
$$;

create or replace function public.v1b_completed_workout(p_id uuid,p_user uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select p_user=auth.uid() and exists(select 1 from public.workout_sessions_history h
    where h.id=p_id and h.user_id=p_user and h.completed_at<=now()
      and exists(select 1 from jsonb_array_elements(case when jsonb_typeof(h.metadata->'actual_sets')='array'
        then h.metadata->'actual_sets' else '[]'::jsonb end) s where s->>'status'='completed'
          and case when s->>'block_type'='free' then nullif(btrim(s->>'actual_text'),'') is not null
            when s->>'block_type'='reps' then case when s->>'actual_reps' ~ '^[0-9]+([.][0-9]+)?$'
              then (s->>'actual_reps')::numeric>0 else false end
            when s->>'block_type' in ('duration','distance') then case when s->>'actual_value' ~ '^[0-9]+([.][0-9]+)?$'
              then (s->>'actual_value')::numeric>0 else false end else false end));
$$;

-- Only trusted definer functions/triggers may call this primitive.
create or replace function public.add_user_xp(p_user_id uuid, p_event_type text, p_xp integer, p_target_id text default null)
returns void language plpgsql security definer set search_path='' as $$
declare kind text := public.v1b_xp_type(p_event_type); expected integer; count_today bigint; xp_today bigint;
begin
  if p_user_id is null or nullif(p_target_id,'') is null then raise exception 'XP_TARGET_REQUIRED'; end if;
  expected := case kind when 'activity_added' then 25 when 'challenge_created' then 20
    when 'challenge_joined' then 10 when 'session_created' then 5 when 'session_completed' then 10
    when 'program_created' then 10 when 'program_shared' then 15 when 'program_completed' then 50
    when 'like_received' then 1 when 'boost_received' then 3 else null end;
  if kind='daily_session_completed' then
    select bonus_xp into expected from public.daily_sessions where id::text=p_target_id;
  end if;
  if expected is null or p_xp is distinct from expected or p_xp<=0 then raise exception 'XP_REWARD_NOT_ALLOWED'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('actyv:xp:'||p_user_id::text,0));
  if exists(select 1 from public.xp_events where user_id=p_user_id
    and public.v1b_xp_type(event_type)=kind and target_id=p_target_id) then return; end if;
  select count(*),coalesce(sum(xp_amount),0) into count_today,xp_today from public.xp_events
    where user_id=p_user_id and public.v1b_xp_type(event_type)=kind and created_at>=date_trunc('day',now());
  if (kind='activity_added' and count_today>=4) or (kind='challenge_created' and count_today>=2)
    or (kind='like_received' and xp_today+p_xp>20) or (kind='boost_received' and xp_today+p_xp>30) then return; end if;
  insert into public.xp_events(user_id,event_type,xp_amount,target_id)
    values(p_user_id,kind,p_xp,p_target_id) on conflict(user_id,event_type,target_id) do nothing;
  if not found then return; end if;
  update public.profiles set total_xp=coalesce(total_xp,0)+p_xp,
    level=public.calculate_level(coalesce(total_xp,0)+p_xp) where id=p_user_id;
  if not found then raise exception 'XP_PROFILE_MISSING'; end if;
end $$;

-- Existing clients store a local calendar day but no timezone. Validate the
-- legal UTC-12..UTC+14 window rather than falsely assuming a UTC day.
create or replace function public.v1b_on_local_day(p_time timestamptz,p_day date) returns boolean
language sql immutable set search_path='' as $$
  select p_time >= ((p_day::timestamp - interval '14 hours') at time zone 'UTC')
    and p_time < ((p_day::timestamp + interval '36 hours') at time zone 'UTC');
$$;

create or replace function public.request_xp_reward(p_event_type text,p_target_id text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid(); target uuid; amount integer; before_xp bigint; after_xp bigint; kind text:=public.v1b_xp_type(p_event_type);
begin
  if u is null then raise exception 'AUTH_REQUIRED'; end if;
  if kind in ('activity_added','challenge_created','like_received','boost_received') then
    raise exception 'XP_TRIGGER_ONLY';
  end if;
  if kind='challenge_completed' then
    return jsonb_build_object('awarded',false,'reason','reward_disabled_for_v1');
  end if;
  if kind not in ('challenge_joined','session_created','session_completed','program_created','program_shared','program_completed','daily_session_completed')
    or kind is null then raise exception 'XP_EVENT_NOT_ALLOWED'; end if;
  if nullif(p_target_id,'') is null then raise exception 'XP_TARGET_REQUIRED'; end if;
  begin target:=p_target_id::uuid; exception when invalid_text_representation then raise exception 'XP_TARGET_INVALID'; end;
  p_target_id:=target::text;
  if kind='challenge_joined' then
    if not exists(select 1 from public.challenge_participants p join public.challenges c on c.id=p.challenge_id
      where c.id=target and p.user_id=u and c.created_by<>u and not coalesce(c.is_deleted,false)
        and public.v1a_can_read_challenge(c.id)) then raise exception 'XP_PROOF_REQUIRED'; end if;
    amount:=10;
  elsif kind='session_created' then
    if not exists(select 1 from public.training_sessions where id=target and user_id=u and copied_from_session_id is null)
      then raise exception 'XP_PROOF_REQUIRED'; end if; amount:=5;
  elsif kind='session_completed' then
    if not public.v1b_completed_workout(target,u) then raise exception 'XP_PROOF_REQUIRED'; end if;
    amount:=10;
  elsif kind in ('program_created','program_shared','program_completed') then
    if not exists(select 1 from public.training_programs where id=target and user_id=u
      and (kind='program_completed' or copied_from_program_id is null)
      and (kind<>'program_shared' or visibility='shared')) then raise exception 'XP_PROOF_REQUIRED'; end if;
    if kind='program_completed' then
      if not exists(select 1 from public.training_program_sessions where program_id=target)
        or exists(select 1 from public.training_program_sessions ps where ps.program_id=target and not exists(
          select 1 from public.training_program_completions pc join public.workout_sessions_history h on h.id=pc.workout_history_id
          where pc.program_session_id=ps.id and pc.program_id=ps.program_id and pc.user_id=u and h.user_id=u
            and pc.session_id=coalesce(ps.session_id,ps.workout_id) and h.workout_id=pc.session_id
            and public.v1b_completed_workout(h.id,u))) then raise exception 'XP_PROOF_REQUIRED'; end if;
    end if;
    amount:=case kind when 'program_created' then 10 when 'program_shared' then 15 else 50 end;
  else
    select ds.bonus_xp into amount from public.daily_sessions ds
      join public.daily_session_completions dc on dc.daily_session_id=ds.id
      join public.workout_sessions_history h on h.id=dc.workout_history_id
      where ds.id=target and dc.user_id=u and h.user_id=u and dc.session_id=ds.session_id
        and h.workout_id=ds.session_id and dc.scheduled_for=ds.scheduled_for
        and ds.scheduled_for<=current_date+1 and dc.completed_at<=now()
        and public.v1b_on_local_day(dc.completed_at,ds.scheduled_for)
        and public.v1b_on_local_day(h.completed_at,ds.scheduled_for) and public.v1b_completed_workout(h.id,u);
    if amount is null then raise exception 'XP_PROOF_REQUIRED'; end if;
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('actyv:xp:'||u::text,0));
  select coalesce(sum(xp_amount),0) into before_xp from public.xp_events where user_id=u;
  if amount>0 then perform public.add_user_xp(u,kind,amount,p_target_id); end if;
  select coalesce(sum(xp_amount),0) into after_xp from public.xp_events where user_id=u;
  return jsonb_build_object('awarded',after_xp>before_xp,'xp_awarded',after_xp-before_xp,'total_xp',after_xp,
    'reason',case when after_xp=before_xp then 'already_awarded_or_capped' else null end);
end $$;

-- Keep the old signature fail-safe during deployment; it cannot select another owner.
create or replace function public.award_xp(p_user_id uuid,p_source text,p_target_id text default null)
returns void language plpgsql security definer set search_path='' as $$
begin
  if auth.uid() is null or p_user_id is distinct from auth.uid() then raise exception 'XP_FORBIDDEN'; end if;
  perform public.request_xp_reward(p_source,p_target_id);
end $$;

create or replace function public.award_xp_on_activity_created() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if new.user_id is not null then
    perform public.add_user_xp(new.user_id,'activity_added',25,new.id::text);
  end if;
  return new;
end $$;

create or replace function public.award_xp_on_challenge_created() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if new.created_by is not null then
    perform public.add_user_xp(new.created_by,'challenge_created',20,new.id::text);
  end if;
  return new;
end $$;

create or replace function public.award_xp_on_activity_interaction_created() returns trigger
language plpgsql security definer set search_path='' as $$
declare recipient uuid; target text; kind text; amount integer;
begin
  if auth.uid() is null or new.user_id is distinct from auth.uid() then raise exception 'INTERACTION_FORBIDDEN'; end if;
  select a.user_id into recipient from public.activities a where a.id=new.activity_id
    and (a.user_id=auth.uid() or (a.challenge_id is not null and public.v1a_can_read_challenge(a.challenge_id)));
  if not found then raise exception 'INTERACTION_FORBIDDEN'; end if;
  if recipient=new.user_id or new.type not in ('like','boost') then return new; end if;
  kind:=new.type||'_received'; amount:=case new.type when 'like' then 1 else 3 end;
  target:=new.user_id::text||':'||new.activity_id::text||':'||new.type;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('actyv:xp:'||recipient::text,0));
  -- Existing non-deleted legacy interactions also count as the same logical reward.
  if exists(select 1 from public.xp_events e join public.activity_interactions i on i.id::text=e.target_id
    where e.user_id=recipient and public.v1b_xp_type(e.event_type)=kind
      and i.user_id=new.user_id and i.activity_id=new.activity_id and i.type=new.type) then return new; end if;
  perform public.add_user_xp(recipient,kind,amount,target);
  return new;
end $$;

drop policy if exists "Users can interact as themselves" on public.activity_interactions;
drop policy if exists v1b_interactions_insert on public.activity_interactions;
create policy v1b_interactions_insert on public.activity_interactions for insert to authenticated with check(
  user_id=auth.uid() and exists(select 1 from public.activities a where a.id=activity_id
    and (a.user_id=auth.uid() or (a.challenge_id is not null and public.v1a_can_read_challenge(a.challenge_id)))));

-- Complete relation checks, not just foreign-key existence.
drop policy if exists "Users can manage their own training program completions" on public.training_program_completions;
drop policy if exists v1b_program_completions_read on public.training_program_completions;
drop policy if exists v1b_program_completions_insert on public.training_program_completions;
drop policy if exists v1b_program_completions_delete on public.training_program_completions;
create policy v1b_program_completions_read on public.training_program_completions for select to authenticated using(user_id=auth.uid());
create policy v1b_program_completions_delete on public.training_program_completions for delete to authenticated using(user_id=auth.uid());
create policy v1b_program_completions_insert on public.training_program_completions for insert to authenticated with check(
  user_id=auth.uid() and exists(select 1 from public.training_programs p
    join public.training_program_sessions ps on ps.program_id=p.id
    join public.workout_sessions_history h on h.id=workout_history_id
    where p.id=training_program_completions.program_id and p.user_id=auth.uid()
      and ps.id=training_program_completions.program_session_id
      and coalesce(ps.session_id,ps.workout_id)=training_program_completions.session_id
      and h.user_id=auth.uid() and h.workout_id=training_program_completions.session_id
      and public.v1b_completed_workout(h.id,auth.uid())));
drop policy if exists "Users can insert own daily session completions" on public.daily_session_completions;
drop policy if exists "Users can update own daily session completions" on public.daily_session_completions;
drop policy if exists v1b_daily_completions_insert on public.daily_session_completions;
create policy v1b_daily_completions_insert on public.daily_session_completions for insert to authenticated with check(
  user_id=auth.uid() and exists(select 1 from public.daily_sessions ds
    join public.training_sessions s on s.id=ds.session_id
    join public.workout_sessions_history h on h.id=workout_history_id
    where ds.id=daily_session_id and s.visibility='public' and h.user_id=auth.uid()
      and h.workout_id=ds.session_id and daily_session_completions.session_id=ds.session_id
      and daily_session_completions.scheduled_for=ds.scheduled_for and ds.scheduled_for<=current_date+1
      and daily_session_completions.completed_at<=now()
      and public.v1b_on_local_day(h.completed_at,ds.scheduled_for)
      and public.v1b_on_local_day(daily_session_completions.completed_at,ds.scheduled_for)
      and public.v1b_completed_workout(h.id,auth.uid())));

create or replace function public.v1b_badge_code(p_code text) returns text
language sql immutable set search_path='' as $$
  select case when normalized=any(array['first_health_connect_sync','steps_10000_total','steps_50000_total','steps_100000_total','steps_first','steps_5000_day','steps_10000_day','steps_20000_day','weekly_steps_50000','first_activity','five_activities','ten_activities','fifty_activities','hundred_activities','first_challenge','five_challenges','first_joined_challenge','challenge_completed','distance_10','distance_50','distance_100','distance_500','first_like','ten_likes_received','fifty_likes_received','first_session_completed','five_sessions_completed','ten_sessions_completed','fifty_sessions_completed','first_program_created','program_shared','program_completed','first_daily_session','daily_streak_3','daily_streak_7','daily_streak_30','three_sports','five_sports']) then normalized else null end
  from (select coalesce('{"first-step":"first_activity","actyv-regular":"five_activities","actyv-motivated":"ten_activities","challenger":"first_challenge","collective":"first_joined_challenge","distance-10":"distance_10","distance-50":"distance_50","premier_pas":"first_activity","actyv_regulier":"five_activities","actyv_motive":"ten_activities","boosteur":"first_like","collectif":"first_joined_challenge","distance_10_km":"distance_10","distance_50_km":"distance_50","premiere_seance_terminee":"first_session_completed","cinq_seances_terminees":"five_sessions_completed","dix_seances_terminees":"ten_sessions_completed","premier_programme_cree":"first_program_created","premier_programme_termine":"program_completed","programme_partage":"program_shared","premiere_seance_du_jour":"first_daily_session","serie_quotidienne_3":"daily_streak_3","serie_quotidienne_7":"daily_streak_7","serie_quotidienne_30":"daily_streak_30","steps_5000":"steps_5000_day","steps_10000":"steps_10000_day","steps_20000":"steps_20000_day"}'::jsonb->>p_code,p_code) normalized) c;
$$;

create or replace function public.grant_user_badge(p_user_id uuid,p_badge_code text) returns void
language plpgsql security definer set search_path='' as $$
declare code text:=public.v1b_badge_code(p_badge_code);
begin
  if p_user_id is null or code is null then raise exception 'BADGE_NOT_ALLOWED'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('actyv:badges:'||p_user_id::text,0));
  if exists(select 1 from public.user_badges where user_id=p_user_id and public.v1b_badge_code(badge_code)=code) then return; end if;
  insert into public.user_badges(user_id,badge_code) values(p_user_id,code)
    on conflict(user_id,badge_code) do nothing;
end $$;

CREATE OR REPLACE FUNCTION public.refresh_user_badges(p_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  badge_count integer := 0;
  before_codes text[] := '{}';
  awarded_codes text[] := '{}';
  badge_codes text[];
  activity_count integer := 0;
  created_challenges_count integer := 0;
  joined_challenges_count integer := 0;
  total_distance numeric := 0;
  reactions_given_count integer := 0;
  reactions_received_count integer := 0;
  completed_sessions_count integer := 0;
  created_programs_count integer := 0;
  shared_programs_count integer := 0;
  completed_challenges_count integer := 0;
  completed_programs_count integer := 0;
  distinct_sports_count integer := 0;
  daily_session_count integer := 0;
  daily_session_streak integer := 0;
  total_steps_count bigint := 0;
  best_daily_steps integer := 0;
  rolling_weekly_steps integer := 0;
  first_health_connect_sync_count integer := 0;
  ordered_daily_dates date[];
  streak_date date;
begin
  if auth.uid() is null or p_user_id is distinct from auth.uid() then raise exception 'BADGES_FORBIDDEN'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('actyv:badges:'||p_user_id::text,0));
  select coalesce(array_agg(public.v1b_badge_code(badge_code)), '{}') into before_codes
    from public.user_badges where user_id=p_user_id and public.v1b_badge_code(badge_code) is not null;
  if p_user_id is null then
    return jsonb_build_object(
      'status', 'error',
      'reason', 'missing_user_id'
    );
  end if;

  select count(*)
  into activity_count
  from public.activities
  where coalesce(user_id, (select email_owner.id from public.profiles email_owner where email_owner.email=user_email)) = p_user_id;

  select count(*)
  into created_challenges_count
  from public.challenges
  where created_by = p_user_id
    and coalesce(is_deleted, false) = false;

  select
    coalesce((
      select count(*)
      from public.challenge_participants
      where user_id = p_user_id
    ), 0)
    +
    coalesce((
      select count(*)
      from public.challenge_members
      where (select email_owner.id from public.profiles email_owner where email_owner.email=user_email) = p_user_id
        and coalesce(role, 'member') = 'member'
    ), 0)
  into joined_challenges_count;

  select coalesce(sum(
    case
      when coalesce(unit_type, case when distance_km is not null then 'distance' else null end) = 'distance'
        then coalesce(unit_value, distance_km, 0)
      else 0
    end
  ), 0)
  into total_distance
  from public.activities
  where coalesce(user_id, (select email_owner.id from public.profiles email_owner where email_owner.email=user_email)) = p_user_id;

  select count(*)
  into reactions_given_count
  from public.activity_interactions
  where user_id = p_user_id
    and type in ('like', 'boost');

  select count(*)
  into reactions_received_count
  from public.activity_interactions interactions
  join public.activities activities on activities.id = interactions.activity_id
  where coalesce(activities.user_id, (select email_owner.id from public.profiles email_owner where email_owner.email=activities.user_email)) = p_user_id
    and interactions.user_id <> p_user_id;

  select count(*)
  into completed_sessions_count
  from public.workout_sessions_history
  where user_id = p_user_id and public.v1b_completed_workout(id,p_user_id);

  select count(*)
  into created_programs_count
  from public.training_programs
  where user_id = p_user_id
    and copied_from_program_id is null;

  select count(*)
  into shared_programs_count
  from public.training_programs
  where user_id = p_user_id
    and copied_from_program_id is null
    and visibility = 'shared';

  select count(*)
  into completed_challenges_count
  from public.xp_events
  where user_id = p_user_id
    and event_type = 'challenge_completed';

  select count(*)
  into completed_programs_count
  from public.xp_events
  where user_id = p_user_id
    and event_type = 'program_completed';

  select count(distinct lower(trim(sport)))
  into distinct_sports_count
  from public.activities
  where coalesce(user_id, (select email_owner.id from public.profiles email_owner where email_owner.email=user_email)) = p_user_id
    and sport is not null
    and length(trim(sport)) > 0;

  select count(*)
  into daily_session_count
  from public.daily_session_completions
  where user_id = p_user_id;

  select
    coalesce(sum(steps_count), 0),
    coalesce(max(steps_count), 0),
    coalesce(count(*) filter (where source = 'health_connect'), 0)
  into total_steps_count,
    best_daily_steps,
    first_health_connect_sync_count
  from public.daily_steps
  where user_id = p_user_id;

  select coalesce(sum(steps_count), 0)
  into rolling_weekly_steps
  from (
    select step_date, steps_count
    from public.daily_steps
    where user_id = p_user_id and step_date >= date_trunc('week',current_date)::date and step_date <= current_date
    order by step_date desc
    limit 7
  ) recent_steps;

  select coalesce(array_agg(scheduled_for order by scheduled_for desc), '{}')
  into ordered_daily_dates
  from (
    select distinct scheduled_for
    from public.daily_session_completions
    where user_id = p_user_id and scheduled_for<=current_date
    order by scheduled_for desc
    limit 120
  ) daily_dates;

  if coalesce(array_length(ordered_daily_dates, 1), 0) > 0
     and ordered_daily_dates[1] >= current_date - 1 then
    daily_session_streak := 0;

    foreach streak_date in array ordered_daily_dates
    loop
      if streak_date = ordered_daily_dates[1] - daily_session_streak then
        daily_session_streak := daily_session_streak + 1;
      else
        exit;
      end if;
    end loop;
  end if;

  if activity_count >= 1 then
    perform public.grant_user_badge(p_user_id, 'first_activity');
  end if;

  if activity_count >= 5 then
    perform public.grant_user_badge(p_user_id, 'five_activities');
  end if;

  if activity_count >= 10 then
    perform public.grant_user_badge(p_user_id, 'ten_activities');
  end if;

  if activity_count >= 50 then
    perform public.grant_user_badge(p_user_id, 'fifty_activities');
  end if;

  if activity_count >= 100 then
    perform public.grant_user_badge(p_user_id, 'hundred_activities');
  end if;

  if created_challenges_count >= 1 then
    perform public.grant_user_badge(p_user_id, 'first_challenge');
  end if;

  if created_challenges_count >= 5 then
    perform public.grant_user_badge(p_user_id, 'five_challenges');
  end if;

  if joined_challenges_count >= 1 then
    perform public.grant_user_badge(p_user_id, 'first_joined_challenge');
  end if;

  if completed_challenges_count >= 1 then
    perform public.grant_user_badge(p_user_id, 'challenge_completed');
  end if;

  if total_distance >= 10 then
    perform public.grant_user_badge(p_user_id, 'distance_10');
  end if;

  if total_distance >= 50 then
    perform public.grant_user_badge(p_user_id, 'distance_50');
  end if;

  if total_distance >= 100 then
    perform public.grant_user_badge(p_user_id, 'distance_100');
  end if;

  if total_distance >= 500 then
    perform public.grant_user_badge(p_user_id, 'distance_500');
  end if;

  if reactions_given_count >= 1 then
    perform public.grant_user_badge(p_user_id, 'first_like');
  end if;

  if reactions_received_count >= 10 then
    perform public.grant_user_badge(p_user_id, 'ten_likes_received');
  end if;

  if reactions_received_count >= 50 then
    perform public.grant_user_badge(p_user_id, 'fifty_likes_received');
  end if;

  if completed_sessions_count >= 1 then
    perform public.grant_user_badge(p_user_id, 'first_session_completed');
  end if;

  if completed_sessions_count >= 5 then
    perform public.grant_user_badge(p_user_id, 'five_sessions_completed');
  end if;

  if completed_sessions_count >= 10 then
    perform public.grant_user_badge(p_user_id, 'ten_sessions_completed');
  end if;

  if completed_sessions_count >= 50 then
    perform public.grant_user_badge(p_user_id, 'fifty_sessions_completed');
  end if;

  if created_programs_count >= 1 then
    perform public.grant_user_badge(p_user_id, 'first_program_created');
  end if;

  if shared_programs_count >= 1 then
    perform public.grant_user_badge(p_user_id, 'program_shared');
  end if;

  if completed_programs_count >= 1 then
    perform public.grant_user_badge(p_user_id, 'program_completed');
  end if;

  if daily_session_count >= 1 then
    perform public.grant_user_badge(p_user_id, 'first_daily_session');
  end if;

  if daily_session_streak >= 3 then
    perform public.grant_user_badge(p_user_id, 'daily_streak_3');
  end if;

  if daily_session_streak >= 7 then
    perform public.grant_user_badge(p_user_id, 'daily_streak_7');
  end if;

  if daily_session_streak >= 30 then
    perform public.grant_user_badge(p_user_id, 'daily_streak_30');
  end if;

  if first_health_connect_sync_count >= 1 then
    perform public.grant_user_badge(p_user_id, 'first_health_connect_sync');
  end if;

  if best_daily_steps >= 5000 then
    perform public.grant_user_badge(p_user_id, 'steps_5000_day');
  end if;

  if best_daily_steps >= 10000 then
    perform public.grant_user_badge(p_user_id, 'steps_10000_day');
  end if;

  if best_daily_steps >= 20000 then
    perform public.grant_user_badge(p_user_id, 'steps_20000_day');
  end if;

  if total_steps_count >= 10000 then
    perform public.grant_user_badge(p_user_id, 'steps_10000_total');
  end if;

  if total_steps_count >= 50000 then
    perform public.grant_user_badge(p_user_id, 'steps_50000_total');
  end if;

  if total_steps_count >= 100000 then
    perform public.grant_user_badge(p_user_id, 'steps_100000_total');
  end if;

  if best_daily_steps > 0 then
    perform public.grant_user_badge(p_user_id, 'steps_first');
  end if;

  if rolling_weekly_steps >= 50000 then
    perform public.grant_user_badge(p_user_id, 'weekly_steps_50000');
  end if;

  if distinct_sports_count >= 3 then
    perform public.grant_user_badge(p_user_id, 'three_sports');
  end if;

  if distinct_sports_count >= 5 then
    perform public.grant_user_badge(p_user_id, 'five_sports');
  end if;

  select count(*), coalesce(array_agg(badge_code order by badge_code), '{}')
  into badge_count, badge_codes
  from public.user_badges
  where user_id = p_user_id;

  select coalesce(array_agg(public.v1b_badge_code(badge_code)), '{}') into awarded_codes
    from public.user_badges where user_id=p_user_id and public.v1b_badge_code(badge_code) is not null
      and not (public.v1b_badge_code(badge_code)=any(before_codes));
  return jsonb_build_object(
    'awarded', awarded_codes,
    'status', 'ok',
    'user_id', p_user_id,
    'badge_count', badge_count,
    'badges', badge_codes
  );
end;
$function$

;
create or replace function public.refresh_own_badges() returns jsonb
language plpgsql security definer set search_path='' as $$
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  return public.refresh_user_badges(auth.uid());
end $$;

-- Remove all inherited/public client table and column writes, including legacy ledger.
do $$
declare tbl text; pol record; cols text;
begin
  foreach tbl in array array['xp_events','user_xp_events','user_badges'] loop
    execute format('alter table public.%I enable row level security',tbl);
    for pol in select policyname from pg_catalog.pg_policies where schemaname='public' and tablename=tbl loop
      execute format('drop policy %I on public.%I',pol.policyname,tbl);
    end loop;
    execute format('revoke all privileges on table public.%I from public,anon,authenticated',tbl);
    select string_agg(quote_ident(attname),',') into cols from pg_catalog.pg_attribute
      where attrelid=format('public.%I',tbl)::regclass and attnum>0 and not attisdropped;
    execute format('revoke select (%s),insert (%s),update (%s),references (%s) on public.%I from public,anon,authenticated',cols,cols,cols,cols,tbl);
    execute format('grant select on public.%I to authenticated',tbl);
    execute format('create policy v1b_own_read on public.%I for select to authenticated using (user_id=auth.uid())',tbl);
  end loop;
end $$;
revoke truncate,trigger,references,maintain on public.activity_interactions,public.daily_session_completions,
  public.daily_sessions,public.daily_steps,public.training_program_completions,
  public.mastery_entries,public.mastery_level_unlocks,public.masteries,public.mastery_levels from public,anon,authenticated;
revoke insert,update,delete on public.mastery_entries,public.mastery_level_unlocks,public.masteries,public.mastery_levels
  from public,anon,authenticated;
revoke update on public.daily_session_completions,public.training_program_completions from public,anon,authenticated;
-- Program/daily update column grants must not bypass the table-level revoke.
do $$
declare tbl text; cols text;
begin
  foreach tbl in array array['daily_session_completions','training_program_completions'] loop
    select string_agg(quote_ident(attname),',') into cols from pg_catalog.pg_attribute
      where attrelid=format('public.%I',tbl)::regclass and attnum>0 and not attisdropped;
    execute format('revoke update (%s) on public.%I from public,anon,authenticated',cols,tbl);
  end loop;
end $$;
revoke all on function public.add_user_xp(uuid,text,integer,text),public.grant_user_badge(uuid,text),
  public.refresh_user_badges(uuid),public.award_xp(uuid,text,text),
  public.v1b_xp_type(text),public.v1b_badge_code(text),public.v1b_completed_workout(uuid,uuid),
  public.v1b_on_local_day(timestamptz,date),
  public.award_xp_on_activity_created(),public.award_xp_on_challenge_created(),
  public.award_xp_on_activity_interaction_created() from public,anon,authenticated;
-- Helpers used inside RLS are scoped to the caller.
revoke all on function public.request_xp_reward(text,text),public.refresh_own_badges() from public,anon,authenticated;
grant execute on function public.request_xp_reward(text,text),public.refresh_own_badges() to authenticated;
grant execute on function public.v1b_completed_workout(uuid,uuid) to authenticated;
grant execute on function public.v1b_on_local_day(timestamptz,date) to authenticated;
-- Optional obsolete primitives must not re-open the ledger if an older deployment has them.
alter function public.join_challenge_by_invite_code(text) set search_path='';
alter function public.join_challenge_by_invite(text) set search_path='';
alter function public.handle_new_challenge_participant() set search_path='';
revoke all on function public.join_challenge_by_invite_code(text),public.join_challenge_by_invite(text)
  from public,anon,authenticated;
grant execute on function public.join_challenge_by_invite_code(text),public.join_challenge_by_invite(text) to authenticated;
revoke all on function public.handle_new_challenge_participant() from public,anon,authenticated;
do $$
declare f record;
begin
  for f in select p.oid::regprocedure as signature from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname='award_xp_internal' loop
    execute format('revoke all on function %s from public,anon,authenticated',f.signature);
  end loop;
end $$;
CREATE OR REPLACE FUNCTION public.ensure_daily_session_for_date(p_scheduled_for date DEFAULT CURRENT_DATE)
 RETURNS daily_sessions
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_daily_session public.daily_sessions;
  v_session_id uuid;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  if p_scheduled_for is null or p_scheduled_for not between current_date-1 and current_date+1
    then raise exception 'DAILY_DATE_NOT_ALLOWED'; end if;
  select *
  into v_daily_session
  from public.daily_sessions
  where scheduled_for = p_scheduled_for
  limit 1;

  if found then
    return v_daily_session;
  end if;

  select ts.id
  into v_session_id
  from public.training_sessions ts
  where ts.visibility = 'public'
    and not exists (
      select 1
      from public.daily_sessions ds
      where ds.session_id = ts.id
        and ds.scheduled_for >= p_scheduled_for - 14
        and ds.scheduled_for < p_scheduled_for
    )
  order by ts.created_at asc nulls last, ts.name asc, ts.id asc
  limit 1;

  if v_session_id is null then
    select ts.id
    into v_session_id
    from public.training_sessions ts
    where ts.visibility = 'public'
    order by ts.created_at asc nulls last, ts.name asc, ts.id asc
    limit 1;
  end if;

  if v_session_id is null then
    return null;
  end if;

  insert into public.daily_sessions (session_id, scheduled_for, bonus_xp)
  values (v_session_id, p_scheduled_for, 25)
  on conflict (scheduled_for) do nothing
  returning * into v_daily_session;

  if not found then
    select *
    into v_daily_session
    from public.daily_sessions
    where scheduled_for = p_scheduled_for
    limit 1;
  end if;

  return v_daily_session;
end;
$function$
;
revoke all on function public.ensure_daily_session_for_date(date) from public,anon,authenticated;
grant execute on function public.ensure_daily_session_for_date(date) to authenticated;
commit;
