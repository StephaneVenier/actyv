begin;

create or replace function public.process_activity_masteries(
  p_activity_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_auth_user_id uuid := auth.uid();
  v_activity record;
  v_owner_user_id uuid;
  v_normalized_sport text;
  v_distance_km numeric := 0;
  v_duration_minutes numeric := 0;
  v_elevation_gain_m numeric := 0;
  v_entry_candidates jsonb := '[]'::jsonb;
  v_before_unlocks jsonb := '[]'::jsonb;
  v_inserted_entries jsonb := '[]'::jsonb;
  v_new_unlocks jsonb := '[]'::jsonb;
  v_processed_masteries jsonb := '[]'::jsonb;
  v_inserted_entries_count integer := 0;
  v_xp_awarded_total integer := 0;
  v_result jsonb := '{}'::jsonb;
begin
  if v_auth_user_id is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  if p_activity_id is null then
    raise exception 'ACTIVITY_REQUIRED';
  end if;

  select
    activities.id,
    activities.user_id,
    activities.user_email,
    activities.sport,
    activities.distance_km,
    activities.duration_minutes,
    activities.unit_type,
    activities.unit_value,
    activities.exercise_type,
    activities.comment,
    activities.created_at,
    activities.activity_name,
    activities.source,
    activities.occurred_at,
    activities.elevation_gain_m,
    activities.elevation_loss_m,
    activities.metadata
  into v_activity
  from public.activities
  where activities.id = p_activity_id;

  if not found then
    raise exception 'ACTIVITY_NOT_FOUND';
  end if;

  v_owner_user_id := coalesce(v_activity.user_id, public.resolve_profile_id(v_activity.user_email));

  if v_owner_user_id is distinct from v_auth_user_id then
    raise exception 'ACTIVITY_FORBIDDEN';
  end if;

  v_normalized_sport := public.resolve_activity_mastery_sport(v_activity.sport);

  if v_activity.distance_km is not null then
    v_distance_km := greatest(v_activity.distance_km, 0);
  elsif v_activity.unit_type = 'distance' and v_activity.unit_value is not null then
    v_distance_km := greatest(v_activity.unit_value, 0);
  end if;

  if v_activity.duration_minutes is not null then
    v_duration_minutes := greatest(v_activity.duration_minutes, 0);
  elsif v_activity.unit_type = 'duration' and v_activity.unit_value is not null then
    v_duration_minutes := greatest(v_activity.unit_value, 0);
  end if;

  if v_activity.elevation_gain_m is not null then
    v_elevation_gain_m := greatest(v_activity.elevation_gain_m, 0);
  end if;

  if v_normalized_sport is null then
    return jsonb_build_object(
      'activity_id', v_activity.id,
      'activity_sport', coalesce(v_activity.sport, ''),
      'normalized_sport', null,
      'candidate_masteries_count', 0,
      'inserted_entries_count', 0,
      'xp_awarded_total', 0,
      'unsupported_sport', true,
      'ignored_reason', 'unsupported_sport',
      'processed_masteries', '[]'::jsonb
    );
  end if;

  with raw_candidates as (
    select 'distance-cap'::text as mastery_slug, v_distance_km as value
    where v_normalized_sport = 'course-a-pied' and v_distance_km > 0

    union all
    select 'dplus-cap', v_elevation_gain_m
    where v_normalized_sport = 'course-a-pied' and v_elevation_gain_m > 0

    union all
    select 'duree-cap', v_duration_minutes
    where v_normalized_sport = 'course-a-pied' and v_duration_minutes > 0

    union all
    select 'sorties-cap', 1::numeric
    where v_normalized_sport = 'course-a-pied'

    union all
    select 'cap-5km-termines', 1::numeric
    where v_normalized_sport = 'course-a-pied' and v_distance_km >= 5

    union all
    select 'cap-10km-termines', 1::numeric
    where v_normalized_sport = 'course-a-pied' and v_distance_km >= 10

    union all
    select 'semi-marathons-termines', 1::numeric
    where v_normalized_sport = 'course-a-pied' and v_distance_km >= 21.0975

    union all
    select 'marathons-termines', 1::numeric
    where v_normalized_sport = 'course-a-pied' and v_distance_km >= 42.195

    union all
    select 'distance-trail', v_distance_km
    where v_normalized_sport = 'trail' and v_distance_km > 0

    union all
    select 'dplus-trail', v_elevation_gain_m
    where v_normalized_sport = 'trail' and v_elevation_gain_m > 0

    union all
    select 'duree-trail', v_duration_minutes
    where v_normalized_sport = 'trail' and v_duration_minutes > 0

    union all
    select 'sorties-trail', 1::numeric
    where v_normalized_sport = 'trail'

    union all
    select 'trails-20km', 1::numeric
    where v_normalized_sport = 'trail' and v_distance_km >= 20

    union all
    select 'trails-40km', 1::numeric
    where v_normalized_sport = 'trail' and v_distance_km >= 40

    union all
    select 'trails-60km', 1::numeric
    where v_normalized_sport = 'trail' and v_distance_km >= 60

    union all
    select 'trails-80km', 1::numeric
    where v_normalized_sport = 'trail' and v_distance_km >= 80

    union all
    select 'marche', v_distance_km
    where v_normalized_sport = 'marche' and v_distance_km > 0

    union all
    select 'dplus-marche', v_elevation_gain_m
    where v_normalized_sport = 'marche' and v_elevation_gain_m > 0

    union all
    select 'duree-marche', v_duration_minutes
    where v_normalized_sport = 'marche' and v_duration_minutes > 0

    union all
    select 'sorties-marche', 1::numeric
    where v_normalized_sport = 'marche'

    union all
    select 'marches-10km', 1::numeric
    where v_normalized_sport = 'marche' and v_distance_km >= 10

    union all
    select 'marches-20km', 1::numeric
    where v_normalized_sport = 'marche' and v_distance_km >= 20

    union all
    select 'randonnees-30km', 1::numeric
    where v_normalized_sport = 'marche' and v_distance_km >= 30

    union all
    select 'distance-velo', v_distance_km
    where v_normalized_sport = 'velo' and v_distance_km > 0

    union all
    select 'dplus-velo', v_elevation_gain_m
    where v_normalized_sport = 'velo' and v_elevation_gain_m > 0

    union all
    select 'duree-velo', v_duration_minutes
    where v_normalized_sport = 'velo' and v_duration_minutes > 0

    union all
    select 'sorties-velo', 1::numeric
    where v_normalized_sport = 'velo'

    union all
    select 'sorties-velo-50km', 1::numeric
    where v_normalized_sport = 'velo' and v_distance_km >= 50

    union all
    select 'sorties-velo-100km', 1::numeric
    where v_normalized_sport = 'velo' and v_distance_km >= 100

    union all
    select 'distance-vtt', v_distance_km
    where v_normalized_sport = 'vtt' and v_distance_km > 0

    union all
    select 'dplus-vtt', v_elevation_gain_m
    where v_normalized_sport = 'vtt' and v_elevation_gain_m > 0

    union all
    select 'duree-vtt', v_duration_minutes
    where v_normalized_sport = 'vtt' and v_duration_minutes > 0

    union all
    select 'sorties-vtt', 1::numeric
    where v_normalized_sport = 'vtt'

    union all
    select 'distance-natation', v_distance_km
    where v_normalized_sport = 'natation' and v_distance_km > 0

    union all
    select 'duree-natation', v_duration_minutes
    where v_normalized_sport = 'natation' and v_duration_minutes > 0

    union all
    select 'seances-natation', 1::numeric
    where v_normalized_sport = 'natation'
  ),
  entry_candidates as (
    select
      masteries.id as mastery_id,
      masteries.slug as mastery_slug,
      masteries.name as mastery_name,
      raw_candidates.value as inserted_value
    from raw_candidates
    join public.masteries
      on masteries.slug = raw_candidates.mastery_slug
     and masteries.active = true
    where raw_candidates.value is not null
      and raw_candidates.value > 0
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'mastery_id', entry_candidates.mastery_id,
        'mastery_slug', entry_candidates.mastery_slug,
        'mastery_name', entry_candidates.mastery_name,
        'inserted_value', entry_candidates.inserted_value
      )
      order by entry_candidates.mastery_name asc
    ),
    '[]'::jsonb
  )
  into v_entry_candidates
  from entry_candidates;

  if jsonb_array_length(v_entry_candidates) = 0 then
    return jsonb_build_object(
      'activity_id', v_activity.id,
      'activity_sport', coalesce(v_activity.sport, ''),
      'normalized_sport', v_normalized_sport,
      'candidate_masteries_count', 0,
      'inserted_entries_count', 0,
      'xp_awarded_total', 0,
      'unsupported_sport', false,
      'ignored_reason', null,
      'processed_masteries', '[]'::jsonb
    );
  end if;

  with entry_candidates as (
    select
      candidate.mastery_id,
      candidate.mastery_slug,
      candidate.mastery_name,
      candidate.inserted_value
    from jsonb_to_recordset(v_entry_candidates) as candidate(
      mastery_id uuid,
      mastery_slug text,
      mastery_name text,
      inserted_value numeric
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
      candidate.inserted_value
    from jsonb_to_recordset(v_entry_candidates) as candidate(
      mastery_id uuid,
      mastery_slug text,
      mastery_name text,
      inserted_value numeric
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
      'activity',
      v_activity.id,
      jsonb_strip_nulls(
        jsonb_build_object(
          'source_label', 'Activite Actyv',
          'activity_id', v_activity.id,
          'activity_sport', v_activity.sport,
          'activity_type', v_normalized_sport,
          'activity_name', v_activity.activity_name,
          'distance_km', case when v_distance_km > 0 then v_distance_km else null end,
          'duration_minutes', case when v_duration_minutes > 0 then v_duration_minutes else null end,
          'elevation_gain_m', case when v_elevation_gain_m > 0 then v_elevation_gain_m else null end,
          'activity_source', v_activity.source
        )
      ),
      coalesce(v_activity.occurred_at, v_activity.created_at, now())
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
      candidate.inserted_value
    from jsonb_to_recordset(v_entry_candidates) as candidate(
      mastery_id uuid,
      mastery_slug text,
      mastery_name text,
      inserted_value numeric
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
      candidate.inserted_value
    from jsonb_to_recordset(v_entry_candidates) as candidate(
      mastery_id uuid,
      mastery_slug text,
      mastery_name text,
      inserted_value numeric
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
        'progress_percent', coalesce((processed_masteries.progress ->> 'progress_percent')::numeric, 0)
      )
      order by processed_masteries.mastery_name asc
    ),
    '[]'::jsonb
  )
  into v_processed_masteries
  from processed_masteries;

  v_result := jsonb_build_object(
    'activity_id', v_activity.id,
    'activity_sport', coalesce(v_activity.sport, ''),
    'normalized_sport', v_normalized_sport,
    'candidate_masteries_count', jsonb_array_length(v_entry_candidates),
    'inserted_entries_count', v_inserted_entries_count,
    'xp_awarded_total', v_xp_awarded_total,
    'unsupported_sport', false,
    'ignored_reason', null,
    'processed_masteries', v_processed_masteries
  );

  return coalesce(
    v_result,
    jsonb_build_object(
      'activity_id', v_activity.id,
      'activity_sport', coalesce(v_activity.sport, ''),
      'normalized_sport', v_normalized_sport,
      'candidate_masteries_count', 0,
      'inserted_entries_count', 0,
      'xp_awarded_total', 0,
      'unsupported_sport', false,
      'ignored_reason', null,
      'processed_masteries', '[]'::jsonb
    )
  );
end;
$$;

revoke all on function public.process_activity_masteries(uuid) from public;
revoke all on function public.process_activity_masteries(uuid) from anon;
revoke all on function public.process_activity_masteries(uuid) from authenticated;
grant execute on function public.process_activity_masteries(uuid) to authenticated;

notify pgrst, 'reload schema';

commit;
