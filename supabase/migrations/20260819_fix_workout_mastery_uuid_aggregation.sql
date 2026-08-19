begin;

create or replace function public.process_workout_masteries(
  p_workout_history_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_auth_user_id uuid := auth.uid();
  v_history record;
  v_actual_sets jsonb := '[]'::jsonb;
  v_entry_candidates jsonb := '[]'::jsonb;
  v_before_unlocks jsonb := '[]'::jsonb;
  v_inserted_entries jsonb := '[]'::jsonb;
  v_new_unlocks jsonb := '[]'::jsonb;
  v_processed_masteries jsonb := '[]'::jsonb;
  v_ignored_blocks jsonb := '[]'::jsonb;
  v_incompatible_mappings jsonb := '[]'::jsonb;
  v_inserted_entries_count integer := 0;
  v_xp_awarded_total integer := 0;
  v_result jsonb := '{}'::jsonb;
begin
  if v_auth_user_id is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  if p_workout_history_id is null then
    raise exception 'WORKOUT_HISTORY_REQUIRED';
  end if;

  select
    wsh.id,
    wsh.user_id,
    wsh.workout_id,
    wsh.workout_name,
    wsh.completed_at,
    wsh.metadata
  into v_history
  from public.workout_sessions_history wsh
  where wsh.id = p_workout_history_id;

  if not found then
    raise exception 'WORKOUT_HISTORY_NOT_FOUND';
  end if;

  if v_history.user_id <> v_auth_user_id then
    raise exception 'WORKOUT_HISTORY_FORBIDDEN';
  end if;

  v_actual_sets := coalesce(v_history.metadata -> 'actual_sets', '[]'::jsonb);

  if jsonb_typeof(v_actual_sets) is distinct from 'array' then
    return jsonb_build_object(
      'workout_history_id', v_history.id,
      'workout_id', v_history.workout_id,
      'workout_name', v_history.workout_name,
      'candidate_masteries_count', 0,
      'inserted_entries_count', 0,
      'xp_awarded_total', 0,
      'processed_masteries', '[]'::jsonb,
      'ignored_blocks', '[]'::jsonb,
      'incompatible_mappings', '[]'::jsonb,
      'missing_actual_sets', true
    );
  end if;

  with raw_rows as (
    select
      raw_entry.block_id,
      raw_entry.block_name,
      raw_entry.exercise_id,
      raw_entry.block_type,
      raw_entry.planned_reps,
      raw_entry.actual_reps,
      raw_entry.planned_charge_kg,
      raw_entry.actual_charge_kg,
      raw_entry.planned_value,
      raw_entry.actual_value,
      raw_entry.actual_text,
      raw_entry.status
    from jsonb_to_recordset(v_actual_sets) as raw_entry(
      block_id text,
      block_name text,
      exercise_id text,
      block_type text,
      planned_reps numeric,
      actual_reps numeric,
      planned_charge_kg numeric,
      actual_charge_kg numeric,
      planned_value numeric,
      actual_value numeric,
      actual_text text,
      status text
    )
  ),
  completed_rows as (
    select
      coalesce(nullif(btrim(raw_rows.block_id), ''), md5(coalesce(raw_rows.block_name, 'bloc'))) as block_id,
      coalesce(nullif(btrim(raw_rows.block_name), ''), 'Bloc libre') as block_name,
      nullif(btrim(raw_rows.exercise_id), '') as exercise_id,
      coalesce(raw_rows.block_type, 'free') as block_type,
      greatest(coalesce(raw_rows.actual_reps, raw_rows.planned_reps, 0), 0) as reps_value,
      case
        when raw_rows.actual_charge_kg is null then null
        else greatest(raw_rows.actual_charge_kg, 0)
      end as charge_value,
      greatest(coalesce(raw_rows.actual_value, raw_rows.planned_value, 0), 0) as numeric_value,
      coalesce(raw_rows.actual_text, '') as actual_text
    from raw_rows
    where raw_rows.status = 'completed'
  ),
  aggregated_blocks as (
    select
      completed_rows.block_id,
      completed_rows.block_name,
      completed_rows.block_type,
      case
        when completed_rows.block_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
          then completed_rows.block_id::uuid
        else null
      end as block_uuid,
      min(
        case
          when completed_rows.exercise_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
            then completed_rows.exercise_id
          else null
        end
      )::uuid as exercise_uuid,
      public.normalize_mastery_exercise_key(completed_rows.block_name) as normalized_block_key,
      count(*)::integer as completed_sets,
      sum(case when completed_rows.block_type = 'reps' then completed_rows.reps_value else 0 end) as total_reps,
      sum(case when completed_rows.block_type = 'duration' then completed_rows.numeric_value else 0 end) as total_duration_seconds,
      sum(case when completed_rows.block_type = 'distance' then completed_rows.numeric_value else 0 end) as total_distance_km,
      sum(
        case
          when completed_rows.block_type = 'reps' and completed_rows.charge_value is not null
            then completed_rows.reps_value * completed_rows.charge_value
          else 0
        end
      ) as total_volume_kg
    from completed_rows
    group by
      completed_rows.block_id,
      completed_rows.block_name,
      completed_rows.block_type
  ),
  candidate_links as (
    select
      aggregated_blocks.block_id,
      aggregated_blocks.block_name,
      aggregated_blocks.block_type,
      aggregated_blocks.block_uuid,
      aggregated_blocks.exercise_uuid,
      tsb.exercise_id as training_block_exercise_id,
      aggregated_blocks.normalized_block_key,
      aggregated_blocks.completed_sets,
      aggregated_blocks.total_reps,
      aggregated_blocks.total_duration_seconds,
      aggregated_blocks.total_distance_km,
      aggregated_blocks.total_volume_kg,
      mel.mastery_id,
      mel.exercise_key,
      mel.exercise_name,
      mel.exercise_id,
      mel.source_type,
      mastery.slug as mastery_slug,
      mastery.name as mastery_name,
      mastery.measurement_type,
      mastery.unit,
      case
        when aggregated_blocks.exercise_uuid is not null and mel.exercise_id = aggregated_blocks.exercise_uuid then 1
        when tsb.exercise_id is not null and mel.exercise_id = tsb.exercise_id then 2
        when aggregated_blocks.block_uuid is not null and mel.exercise_id = aggregated_blocks.block_uuid then 3
        when public.normalize_mastery_exercise_key(mel.exercise_key) = aggregated_blocks.normalized_block_key then 4
        when public.normalize_mastery_exercise_key(mel.exercise_name) = aggregated_blocks.normalized_block_key then 5
        else 99
      end as match_priority,
      case mel.source_type
        when 'training_block' then 1
        when 'exercise_library' then 2
        when 'alias' then 3
        else 9
      end as source_priority
    from aggregated_blocks
    left join public.training_session_blocks tsb
      on aggregated_blocks.block_uuid is not null
     and tsb.id = aggregated_blocks.block_uuid
    join public.mastery_exercise_links mel
      on (
        (aggregated_blocks.exercise_uuid is not null and mel.exercise_id = aggregated_blocks.exercise_uuid)
        or (tsb.exercise_id is not null and mel.exercise_id = tsb.exercise_id)
        or (aggregated_blocks.block_uuid is not null and mel.exercise_id = aggregated_blocks.block_uuid)
        or public.normalize_mastery_exercise_key(mel.exercise_key) = aggregated_blocks.normalized_block_key
        or public.normalize_mastery_exercise_key(mel.exercise_name) = aggregated_blocks.normalized_block_key
      )
    join public.masteries mastery
      on mastery.id = mel.mastery_id
     and mastery.active = true
  ),
  resolved_links as (
    select *
    from (
      select
        candidate_links.*,
        row_number() over (
          partition by candidate_links.block_id, candidate_links.mastery_id
          order by
            candidate_links.match_priority asc,
            candidate_links.source_priority asc,
            candidate_links.mastery_slug asc
        ) as row_rank
      from candidate_links
    ) ranked_links
    where ranked_links.row_rank = 1
  ),
  resolved_blocks as (
    select
      resolved_links.block_id,
      resolved_links.block_name,
      resolved_links.block_type,
      resolved_links.block_uuid,
      resolved_links.exercise_uuid,
      resolved_links.normalized_block_key,
      resolved_links.completed_sets,
      resolved_links.total_reps,
      resolved_links.total_duration_seconds,
      resolved_links.total_distance_km,
      resolved_links.total_volume_kg,
      resolved_links.mastery_id,
      resolved_links.mastery_slug,
      resolved_links.mastery_name,
      resolved_links.measurement_type,
      resolved_links.unit,
      resolved_links.source_type,
      resolved_links.exercise_id as matched_exercise_id,
      resolved_links.exercise_key as matched_exercise_key,
      resolved_links.exercise_name as matched_exercise_name,
      case resolved_links.match_priority
        when 1 then 'exercise_id'
        when 2 then 'training_block.exercise_id'
        when 3 then 'legacy_block_id'
        when 4 then 'exercise_key'
        when 5 then 'exercise_name'
        else null
      end as matched_by,
      public.compute_session_mastery_value(
        resolved_links.measurement_type,
        resolved_links.unit,
        resolved_links.block_type,
        resolved_links.completed_sets,
        resolved_links.total_reps,
        resolved_links.total_duration_seconds,
        resolved_links.total_distance_km,
        resolved_links.total_volume_kg
      ) as computed_value
    from resolved_links
  ),
  ignored_blocks as (
    select
      jsonb_build_object(
        'block_id', aggregated_blocks.block_id,
        'block_name', aggregated_blocks.block_name,
        'exercise_id', aggregated_blocks.exercise_uuid,
        'block_type', aggregated_blocks.block_type,
        'normalized_key', aggregated_blocks.normalized_block_key,
        'reason', 'no_mapping'
      ) as payload
    from aggregated_blocks
    left join resolved_links
      on resolved_links.block_id = aggregated_blocks.block_id
    where resolved_links.mastery_id is null
  ),
  incompatible_blocks as (
    select
      jsonb_build_object(
        'block_id', resolved_blocks.block_id,
        'block_name', resolved_blocks.block_name,
        'exercise_id', resolved_blocks.exercise_uuid,
        'block_type', resolved_blocks.block_type,
        'source_measurement_type', resolved_blocks.block_type,
        'mastery_id', resolved_blocks.mastery_id,
        'mastery_slug', resolved_blocks.mastery_slug,
        'mastery_name', resolved_blocks.mastery_name,
        'mastery_measurement_type', resolved_blocks.measurement_type,
        'mastery_unit', resolved_blocks.unit,
        'matched_by', resolved_blocks.matched_by,
        'matched_exercise_id', resolved_blocks.matched_exercise_id,
        'reason', 'measurement_mismatch_or_missing_value'
      ) as payload
    from resolved_blocks
    where resolved_blocks.mastery_id is not null
      and coalesce(resolved_blocks.computed_value, 0) <= 0
  ),
  entry_candidates as (
    select
      resolved_blocks.mastery_id,
      min(resolved_blocks.mastery_slug) as mastery_slug,
      min(resolved_blocks.mastery_name) as mastery_name,
      sum(resolved_blocks.computed_value) as inserted_value,
      jsonb_agg(
        jsonb_build_object(
          'block_id', resolved_blocks.block_id,
          'block_name', resolved_blocks.block_name,
          'exercise_id', resolved_blocks.exercise_uuid,
          'block_type', resolved_blocks.block_type,
          'matched_by', resolved_blocks.matched_by,
          'matched_exercise_id', resolved_blocks.matched_exercise_id,
          'source_type', resolved_blocks.source_type,
          'matched_exercise_key', resolved_blocks.matched_exercise_key,
          'matched_exercise_name', resolved_blocks.matched_exercise_name,
          'mastery_measurement_type', resolved_blocks.measurement_type,
          'mastery_unit', resolved_blocks.unit,
          'completed_sets', resolved_blocks.completed_sets,
          'total_reps', resolved_blocks.total_reps,
          'total_duration_seconds', resolved_blocks.total_duration_seconds,
          'total_distance_km', resolved_blocks.total_distance_km,
          'total_volume_kg', resolved_blocks.total_volume_kg,
          'contributed_value', resolved_blocks.computed_value
        )
        order by resolved_blocks.block_name asc
      ) as contributing_blocks
    from resolved_blocks
    where resolved_blocks.mastery_id is not null
      and resolved_blocks.computed_value is not null
      and resolved_blocks.computed_value > 0
    group by resolved_blocks.mastery_id
  )
  select
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'mastery_id', entry_candidates.mastery_id,
          'mastery_slug', entry_candidates.mastery_slug,
          'mastery_name', entry_candidates.mastery_name,
          'inserted_value', entry_candidates.inserted_value,
          'contributing_blocks', entry_candidates.contributing_blocks
        )
        order by entry_candidates.mastery_name asc
      ),
      '[]'::jsonb
    ),
    coalesce((select jsonb_agg(ignored_blocks.payload) from ignored_blocks), '[]'::jsonb),
    coalesce((select jsonb_agg(incompatible_blocks.payload) from incompatible_blocks), '[]'::jsonb)
  into v_entry_candidates, v_ignored_blocks, v_incompatible_mappings
  from entry_candidates;

  with entry_candidates as (
    select
      candidate.mastery_id,
      candidate.mastery_slug,
      candidate.mastery_name,
      candidate.inserted_value,
      candidate.contributing_blocks
    from jsonb_to_recordset(v_entry_candidates) as candidate(
      mastery_id uuid,
      mastery_slug text,
      mastery_name text,
      inserted_value numeric,
      contributing_blocks jsonb
    )
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'mastery_id', mastery_level_unlocks.mastery_id,
        'level', mastery_level_unlocks.level
      )
      order by mastery_level_unlocks.mastery_id, mastery_level_unlocks.level
    ),
    '[]'::jsonb
  )
  into v_before_unlocks
  from public.mastery_level_unlocks
  join entry_candidates
    on entry_candidates.mastery_id = mastery_level_unlocks.mastery_id
  where mastery_level_unlocks.user_id = v_auth_user_id;

  with entry_candidates as (
    select
      candidate.mastery_id,
      candidate.mastery_slug,
      candidate.mastery_name,
      candidate.inserted_value,
      candidate.contributing_blocks
    from jsonb_to_recordset(v_entry_candidates) as candidate(
      mastery_id uuid,
      mastery_slug text,
      mastery_name text,
      inserted_value numeric,
      contributing_blocks jsonb
    )
  ),
  inserted_entries as (
    insert into public.mastery_entries (
      user_id,
      mastery_id,
      value,
      source,
      source_ref_id,
      metadata,
      performed_at
    )
    select
      v_auth_user_id,
      entry_candidates.mastery_id,
      entry_candidates.inserted_value,
      'session',
      v_history.id,
      jsonb_build_object(
        'source_label', 'Seance Actyv',
        'workout_history_id', v_history.id,
        'workout_id', v_history.workout_id,
        'workout_name', v_history.workout_name,
        'contributing_blocks', entry_candidates.contributing_blocks
      ),
      v_history.completed_at
    from entry_candidates
    on conflict (user_id, mastery_id, source, source_ref_id)
      where source_ref_id is not null
      do nothing
    returning
      mastery_entries.id,
      mastery_entries.mastery_id,
      mastery_entries.value
  )
  select
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'entry_id', inserted_entries.id,
          'mastery_id', inserted_entries.mastery_id,
          'value', inserted_entries.value
        )
        order by inserted_entries.mastery_id
      ),
      '[]'::jsonb
    ),
    count(*)
  into v_inserted_entries, v_inserted_entries_count
  from inserted_entries;

  with entry_candidates as (
    select
      candidate.mastery_id,
      candidate.mastery_slug,
      candidate.mastery_name,
      candidate.inserted_value,
      candidate.contributing_blocks
    from jsonb_to_recordset(v_entry_candidates) as candidate(
      mastery_id uuid,
      mastery_slug text,
      mastery_name text,
      inserted_value numeric,
      contributing_blocks jsonb
    )
  ),
  before_unlocks as (
    select
      previous_unlock.mastery_id,
      previous_unlock.level
    from jsonb_to_recordset(v_before_unlocks) as previous_unlock(
      mastery_id uuid,
      level integer
    )
  ),
  new_unlocks as (
    select
      mastery_level_unlocks.mastery_id,
      mastery_level_unlocks.level,
      mastery_level_unlocks.xp_awarded
    from public.mastery_level_unlocks
    join entry_candidates
      on entry_candidates.mastery_id = mastery_level_unlocks.mastery_id
    where mastery_level_unlocks.user_id = v_auth_user_id
      and not exists (
        select 1
        from before_unlocks
        where before_unlocks.mastery_id = mastery_level_unlocks.mastery_id
          and before_unlocks.level = mastery_level_unlocks.level
      )
  )
  select
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'mastery_id', new_unlocks.mastery_id,
          'level', new_unlocks.level,
          'xp_awarded', new_unlocks.xp_awarded
        )
        order by new_unlocks.mastery_id, new_unlocks.level
      ),
      '[]'::jsonb
    ),
    coalesce(sum(new_unlocks.xp_awarded), 0)
  into v_new_unlocks, v_xp_awarded_total
  from new_unlocks;

  with entry_candidates as (
    select
      candidate.mastery_id,
      candidate.mastery_slug,
      candidate.mastery_name,
      candidate.inserted_value,
      candidate.contributing_blocks
    from jsonb_to_recordset(v_entry_candidates) as candidate(
      mastery_id uuid,
      mastery_slug text,
      mastery_name text,
      inserted_value numeric,
      contributing_blocks jsonb
    )
  ),
  inserted_entries as (
    select
      inserted_entry.entry_id,
      inserted_entry.mastery_id,
      inserted_entry.value
    from jsonb_to_recordset(v_inserted_entries) as inserted_entry(
      entry_id uuid,
      mastery_id uuid,
      value numeric
    )
  ),
  new_unlocks as (
    select
      unlocked_entry.mastery_id,
      unlocked_entry.level,
      unlocked_entry.xp_awarded
    from jsonb_to_recordset(v_new_unlocks) as unlocked_entry(
      mastery_id uuid,
      level integer,
      xp_awarded integer
    )
  ),
  processed_masteries as (
    select
      entry_candidates.mastery_id,
      entry_candidates.mastery_slug,
      entry_candidates.mastery_name,
      entry_candidates.inserted_value,
      entry_candidates.contributing_blocks,
      inserted_entries.entry_id,
      (inserted_entries.entry_id is not null) as inserted,
      coalesce(
        (
          select sum(new_unlocks.xp_awarded)
          from new_unlocks
          where new_unlocks.mastery_id = entry_candidates.mastery_id
        ),
        0
      ) as xp_awarded,
      coalesce(
        (
          select jsonb_agg(
            jsonb_build_object(
              'level', new_unlocks.level,
              'xp_reward', new_unlocks.xp_awarded
            )
            order by new_unlocks.level asc
          )
          from new_unlocks
          where new_unlocks.mastery_id = entry_candidates.mastery_id
        ),
        '[]'::jsonb
      ) as unlocked_levels,
      public.compute_mastery_progress_internal(v_auth_user_id, entry_candidates.mastery_id) as progress
    from entry_candidates
    left join inserted_entries
      on inserted_entries.mastery_id = entry_candidates.mastery_id
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'entry_id', processed_masteries.entry_id,
        'mastery_id', processed_masteries.mastery_id,
        'mastery_slug', processed_masteries.mastery_slug,
        'mastery_name', processed_masteries.mastery_name,
        'inserted', processed_masteries.inserted,
        'inserted_value', processed_masteries.inserted_value,
        'xp_awarded', processed_masteries.xp_awarded,
        'unlocked_levels', processed_masteries.unlocked_levels,
        'current_level', coalesce((processed_masteries.progress ->> 'current_level')::integer, 0),
        'total_value', coalesce((processed_masteries.progress ->> 'total_value')::numeric, 0),
        'progress_percent', coalesce((processed_masteries.progress ->> 'progress_percent')::numeric, 0),
        'contributing_blocks', processed_masteries.contributing_blocks
      )
      order by processed_masteries.mastery_name asc
    ),
    '[]'::jsonb
  )
  into v_processed_masteries
  from processed_masteries;

  v_result := jsonb_build_object(
    'workout_history_id', v_history.id,
    'workout_id', v_history.workout_id,
    'workout_name', v_history.workout_name,
    'candidate_masteries_count', jsonb_array_length(v_entry_candidates),
    'inserted_entries_count', v_inserted_entries_count,
    'xp_awarded_total', v_xp_awarded_total,
    'processed_masteries', v_processed_masteries,
    'ignored_blocks', v_ignored_blocks,
    'incompatible_mappings', v_incompatible_mappings,
    'missing_actual_sets', false
  );

  return coalesce(v_result, jsonb_build_object(
    'workout_history_id', v_history.id,
    'workout_id', v_history.workout_id,
    'workout_name', v_history.workout_name,
    'candidate_masteries_count', 0,
    'inserted_entries_count', 0,
    'xp_awarded_total', 0,
    'processed_masteries', '[]'::jsonb,
    'ignored_blocks', '[]'::jsonb,
    'incompatible_mappings', '[]'::jsonb,
    'missing_actual_sets', false
  ));
end;
$$;

revoke all on function public.process_workout_masteries(uuid) from public;
revoke all on function public.process_workout_masteries(uuid) from anon;
revoke all on function public.process_workout_masteries(uuid) from authenticated;
grant execute on function public.process_workout_masteries(uuid) to authenticated;

notify pgrst, 'reload schema';

commit;

