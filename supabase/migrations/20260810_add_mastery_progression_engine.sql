create table if not exists public.mastery_categories (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  sort_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.masteries (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  category_id uuid not null references public.mastery_categories(id) on delete restrict,
  measurement_type text not null
    check (measurement_type in ('reps', 'duration', 'distance', 'elevation', 'volume', 'count')),
  unit text not null,
  description text,
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.mastery_levels (
  id uuid primary key default gen_random_uuid(),
  mastery_id uuid not null references public.masteries(id) on delete cascade,
  level integer not null check (level > 0),
  threshold numeric not null check (threshold > 0),
  xp_reward integer not null default 0 check (xp_reward >= 0),
  created_at timestamptz not null default now(),
  unique (mastery_id, level)
);

create table if not exists public.mastery_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  mastery_id uuid not null references public.masteries(id) on delete cascade,
  value numeric not null check (value > 0),
  source text not null
    check (source in ('manual', 'session', 'activity', 'import')),
  source_ref_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  performed_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists public.mastery_muscles (
  id uuid primary key default gen_random_uuid(),
  mastery_id uuid not null references public.masteries(id) on delete cascade,
  muscle_key text not null,
  weight numeric not null default 1 check (weight > 0),
  created_at timestamptz not null default now(),
  unique (mastery_id, muscle_key)
);

create table if not exists public.mastery_level_unlocks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  mastery_id uuid not null references public.masteries(id) on delete cascade,
  level integer not null check (level > 0),
  xp_awarded integer not null default 0 check (xp_awarded >= 0),
  unlocked_at timestamptz not null default now(),
  unique (user_id, mastery_id, level)
);

create index if not exists mastery_categories_sort_idx
  on public.mastery_categories (sort_order, slug);

create index if not exists masteries_category_sort_idx
  on public.masteries (category_id, sort_order, slug);

create index if not exists mastery_levels_mastery_level_idx
  on public.mastery_levels (mastery_id, level);

create index if not exists mastery_entries_user_mastery_idx
  on public.mastery_entries (user_id, mastery_id);

create index if not exists mastery_entries_user_mastery_performed_idx
  on public.mastery_entries (user_id, mastery_id, performed_at desc);

create index if not exists mastery_level_unlocks_user_mastery_idx
  on public.mastery_level_unlocks (user_id, mastery_id, unlocked_at desc);

alter table if exists public.mastery_categories enable row level security;
alter table if exists public.masteries enable row level security;
alter table if exists public.mastery_levels enable row level security;
alter table if exists public.mastery_entries enable row level security;
alter table if exists public.mastery_muscles enable row level security;
alter table if exists public.mastery_level_unlocks enable row level security;

drop policy if exists "Authenticated users can read mastery categories" on public.mastery_categories;
create policy "Authenticated users can read mastery categories"
  on public.mastery_categories for select
  to authenticated
  using (true);

drop policy if exists "Authenticated users can read masteries" on public.masteries;
create policy "Authenticated users can read masteries"
  on public.masteries for select
  to authenticated
  using (true);

drop policy if exists "Authenticated users can read mastery levels" on public.mastery_levels;
create policy "Authenticated users can read mastery levels"
  on public.mastery_levels for select
  to authenticated
  using (true);

drop policy if exists "Authenticated users can read mastery muscles" on public.mastery_muscles;
create policy "Authenticated users can read mastery muscles"
  on public.mastery_muscles for select
  to authenticated
  using (true);

drop policy if exists "Users can read own mastery entries" on public.mastery_entries;
create policy "Users can read own mastery entries"
  on public.mastery_entries for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Users can insert own mastery entries" on public.mastery_entries;
create policy "Users can insert own mastery entries"
  on public.mastery_entries for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "Users can read own mastery unlocks" on public.mastery_level_unlocks;
create policy "Users can read own mastery unlocks"
  on public.mastery_level_unlocks for select
  to authenticated
  using (auth.uid() = user_id);

grant select on public.mastery_categories to authenticated;
grant select on public.masteries to authenticated;
grant select on public.mastery_levels to authenticated;
grant select, insert on public.mastery_entries to authenticated;
grant select on public.mastery_muscles to authenticated;
grant select on public.mastery_level_unlocks to authenticated;

create or replace function public.compute_mastery_progress(
  p_user_id uuid,
  p_mastery_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_total_value numeric := 0;
  v_current_level integer := 0;
  v_current_threshold numeric := 0;
  v_next_level integer := 0;
  v_next_threshold numeric := 0;
  v_remaining_value numeric := 0;
  v_progress_percent numeric := 0;
  v_xp_reward_next_level integer := 0;
  v_is_max_level boolean := false;
begin
  if p_user_id is null or p_mastery_id is null then
    return jsonb_build_object(
      'total_value', 0,
      'current_level', 0,
      'current_threshold', 0,
      'next_level', 0,
      'next_threshold', 0,
      'remaining_value', 0,
      'progress_percent', 0,
      'xp_reward_next_level', 0,
      'is_max_level', false
    );
  end if;

  select coalesce(sum(value), 0)
  into v_total_value
  from public.mastery_entries
  where user_id = p_user_id
    and mastery_id = p_mastery_id;

  select coalesce(max(level), 0)
  into v_current_level
  from public.mastery_levels
  where mastery_id = p_mastery_id
    and threshold <= v_total_value;

  if v_current_level > 0 then
    select threshold
    into v_current_threshold
    from public.mastery_levels
    where mastery_id = p_mastery_id
      and level = v_current_level;
  end if;

  select level, threshold, xp_reward
  into v_next_level, v_next_threshold, v_xp_reward_next_level
  from public.mastery_levels
  where mastery_id = p_mastery_id
    and level = v_current_level + 1;

  if not found then
    v_next_level := v_current_level;
    v_next_threshold := v_current_threshold;
    v_remaining_value := 0;
    v_progress_percent := case when v_total_value > 0 then 100 else 0 end;
    v_xp_reward_next_level := 0;
    v_is_max_level := true;
  else
    v_remaining_value := greatest(v_next_threshold - v_total_value, 0);
    v_progress_percent := least(
      greatest(
        case
          when v_next_threshold > v_current_threshold then
            ((v_total_value - v_current_threshold) / (v_next_threshold - v_current_threshold)) * 100
          else 0
        end,
        0
      ),
      100
    );
  end if;

  return jsonb_build_object(
    'total_value', v_total_value,
    'current_level', v_current_level,
    'current_threshold', v_current_threshold,
    'next_level', v_next_level,
    'next_threshold', v_next_threshold,
    'remaining_value', v_remaining_value,
    'progress_percent', coalesce(v_progress_percent, 0),
    'xp_reward_next_level', coalesce(v_xp_reward_next_level, 0),
    'is_max_level', v_is_max_level
  );
end;
$$;

create or replace function public.process_mastery_unlocks(
  p_user_id uuid,
  p_mastery_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_total_value numeric := 0;
  v_total_xp_awarded integer := 0;
  v_unlocked_levels jsonb := '[]'::jsonb;
  v_progress jsonb := '{}'::jsonb;
  v_level_row record;
begin
  if p_user_id is null or p_mastery_id is null then
    return jsonb_build_object(
      'xp_awarded', 0,
      'unlocked_levels', '[]'::jsonb
    );
  end if;

  select coalesce(sum(value), 0)
  into v_total_value
  from public.mastery_entries
  where user_id = p_user_id
    and mastery_id = p_mastery_id;

  for v_level_row in
    select level, xp_reward
    from public.mastery_levels
    where mastery_id = p_mastery_id
      and threshold <= v_total_value
      and not exists (
        select 1
        from public.mastery_level_unlocks
        where user_id = p_user_id
          and mastery_id = p_mastery_id
          and level = mastery_levels.level
      )
    order by level asc
  loop
    insert into public.mastery_level_unlocks (user_id, mastery_id, level, xp_awarded)
    values (p_user_id, p_mastery_id, v_level_row.level, v_level_row.xp_reward)
    on conflict (user_id, mastery_id, level) do nothing;

    if found then
      insert into public.xp_events (user_id, event_type, xp_amount, target_id)
      values (
        p_user_id,
        'mastery_level_up',
        v_level_row.xp_reward,
        p_mastery_id::text || ':level:' || v_level_row.level::text
      )
      on conflict do nothing;

      if found then
        v_total_xp_awarded := v_total_xp_awarded + v_level_row.xp_reward;
      end if;

      v_unlocked_levels := v_unlocked_levels || jsonb_build_array(
        jsonb_build_object(
          'level', v_level_row.level,
          'xp_reward', v_level_row.xp_reward
        )
      );
    end if;
  end loop;

  if v_total_xp_awarded > 0 then
    insert into public.profiles (id, total_xp, level)
    values (
      p_user_id,
      v_total_xp_awarded,
      public.calculate_level(v_total_xp_awarded)
    )
    on conflict (id) do update
    set
      total_xp = coalesce(public.profiles.total_xp, 0) + v_total_xp_awarded,
      level = public.calculate_level(coalesce(public.profiles.total_xp, 0) + v_total_xp_awarded);
  end if;

  v_progress := public.compute_mastery_progress(p_user_id, p_mastery_id);

  return v_progress || jsonb_build_object(
    'xp_awarded', v_total_xp_awarded,
    'unlocked_levels', v_unlocked_levels
  );
end;
$$;

create or replace function public.handle_mastery_entry_after_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.process_mastery_unlocks(new.user_id, new.mastery_id);
  return new;
end;
$$;

drop trigger if exists mastery_entries_after_insert on public.mastery_entries;
create trigger mastery_entries_after_insert
after insert on public.mastery_entries
for each row
execute function public.handle_mastery_entry_after_insert();

create or replace function public.add_mastery_entry(
  p_mastery_id uuid,
  p_value numeric,
  p_source text default 'manual',
  p_source_ref_id uuid default null,
  p_metadata jsonb default '{}'::jsonb,
  p_performed_at timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_entry_id uuid;
  v_before_levels integer[] := '{}'::integer[];
  v_unlocked_levels jsonb := '[]'::jsonb;
  v_xp_awarded integer := 0;
  v_progress jsonb := '{}'::jsonb;
begin
  if v_user_id is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  if p_mastery_id is null then
    raise exception 'MASTERY_REQUIRED';
  end if;

  if p_value is null or p_value <= 0 then
    raise exception 'VALUE_MUST_BE_POSITIVE';
  end if;

  if p_source not in ('manual', 'session', 'activity', 'import') then
    raise exception 'INVALID_MASTERY_SOURCE';
  end if;

  if not exists (
    select 1
    from public.masteries
    where id = p_mastery_id
      and active = true
  ) then
    raise exception 'MASTERY_NOT_FOUND';
  end if;

  select coalesce(array_agg(level order by level), '{}'::integer[])
  into v_before_levels
  from public.mastery_level_unlocks
  where user_id = v_user_id
    and mastery_id = p_mastery_id;

  insert into public.mastery_entries (
    user_id,
    mastery_id,
    value,
    source,
    source_ref_id,
    metadata,
    performed_at
  )
  values (
    v_user_id,
    p_mastery_id,
    p_value,
    p_source,
    p_source_ref_id,
    coalesce(p_metadata, '{}'::jsonb),
    coalesce(p_performed_at, now())
  )
  returning id into v_entry_id;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'level', level,
        'xp_reward', xp_awarded
      )
      order by level
    ),
    '[]'::jsonb
  ),
  coalesce(sum(xp_awarded), 0)
  into v_unlocked_levels, v_xp_awarded
  from public.mastery_level_unlocks
  where user_id = v_user_id
    and mastery_id = p_mastery_id
    and not (level = any(v_before_levels));

  v_progress := public.compute_mastery_progress(v_user_id, p_mastery_id);

  return v_progress || jsonb_build_object(
    'entry_id', v_entry_id,
    'mastery_id', p_mastery_id,
    'xp_awarded', v_xp_awarded,
    'unlocked_levels', v_unlocked_levels,
    'inserted_value', p_value
  );
end;
$$;

grant execute on function public.compute_mastery_progress(uuid, uuid) to authenticated;
grant execute on function public.add_mastery_entry(uuid, numeric, text, uuid, jsonb, timestamptz) to authenticated;

with category_seed(slug, name, sort_order) as (
  values
    ('fitness', 'Fitness', 1),
    ('musculation', 'Musculation', 2),
    ('course-a-pied', 'Course a pied', 3),
    ('trail', 'Trail', 4),
    ('marche', 'Marche', 5),
    ('velo', 'Velo', 6),
    ('natation', 'Natation', 7)
)
insert into public.mastery_categories (slug, name, sort_order, active)
select slug, name, sort_order, true
from category_seed
on conflict (slug) do update
set
  name = excluded.name,
  sort_order = excluded.sort_order,
  active = true;

with mastery_seed(slug, name, category_slug, measurement_type, unit, description, sort_order) as (
  values
    ('pompes', 'Pompes', 'fitness', 'reps', 'repetitions', 'Volume cumule de pompes validees.', 1),
    ('burpees', 'Burpees', 'fitness', 'reps', 'repetitions', 'Volume cumule de burpees valides.', 2),
    ('planche', 'Planche', 'fitness', 'duration', 'secondes', 'Temps cumule de gainage planche.', 3),
    ('tractions', 'Tractions', 'musculation', 'reps', 'repetitions', 'Volume cumule de tractions validees.', 1),
    ('squat', 'Squat', 'musculation', 'reps', 'repetitions', 'Volume cumule de squats valides.', 2),
    ('developpe-couche', 'Developpe couche', 'musculation', 'volume', 'kg', 'Volume cumule de developpe couche en kg.', 3),
    ('distance-cap', 'Distance CAP', 'course-a-pied', 'distance', 'km', 'Distance cumulee en course a pied.', 1),
    ('dplus-cap', 'D+ CAP', 'course-a-pied', 'elevation', 'm', 'Denivele positif cumule en course a pied.', 2),
    ('distance-velo', 'Distance Velo', 'velo', 'distance', 'km', 'Distance cumulee a velo.', 1),
    ('dplus-velo', 'D+ Velo', 'velo', 'elevation', 'm', 'Denivele positif cumule a velo.', 2),
    ('marche', 'Marche', 'marche', 'distance', 'km', 'Distance cumulee a pied.', 1),
    ('dplus-marche', 'D+ Marche', 'marche', 'elevation', 'm', 'Denivele positif cumule en marche.', 2)
)
insert into public.masteries (
  slug,
  name,
  category_id,
  measurement_type,
  unit,
  description,
  sort_order,
  active
)
select
  mastery_seed.slug,
  mastery_seed.name,
  mastery_categories.id,
  mastery_seed.measurement_type,
  mastery_seed.unit,
  mastery_seed.description,
  mastery_seed.sort_order,
  true
from mastery_seed
join public.mastery_categories
  on mastery_categories.slug = mastery_seed.category_slug
on conflict (slug) do update
set
  name = excluded.name,
  category_id = excluded.category_id,
  measurement_type = excluded.measurement_type,
  unit = excluded.unit,
  description = excluded.description,
  sort_order = excluded.sort_order,
  active = true;

with level_seed(mastery_slug, level, threshold) as (
  values
    ('pompes', 1, 10), ('pompes', 2, 25), ('pompes', 3, 50), ('pompes', 4, 100), ('pompes', 5, 200),
    ('pompes', 6, 350), ('pompes', 7, 600), ('pompes', 8, 1000), ('pompes', 9, 1500), ('pompes', 10, 2500),
    ('pompes', 11, 4000), ('pompes', 12, 6000), ('pompes', 13, 9000), ('pompes', 14, 13000), ('pompes', 15, 18000),
    ('pompes', 16, 25000), ('pompes', 17, 35000), ('pompes', 18, 50000), ('pompes', 19, 70000), ('pompes', 20, 100000),

    ('tractions', 1, 3), ('tractions', 2, 10), ('tractions', 3, 20), ('tractions', 4, 40), ('tractions', 5, 75),
    ('tractions', 6, 125), ('tractions', 7, 200), ('tractions', 8, 350), ('tractions', 9, 550), ('tractions', 10, 800),
    ('tractions', 11, 1200), ('tractions', 12, 1800), ('tractions', 13, 2500), ('tractions', 14, 3500), ('tractions', 15, 5000),
    ('tractions', 16, 7000), ('tractions', 17, 10000), ('tractions', 18, 14000), ('tractions', 19, 20000), ('tractions', 20, 30000),

    ('squat', 1, 20), ('squat', 2, 50), ('squat', 3, 100), ('squat', 4, 200), ('squat', 5, 350),
    ('squat', 6, 600), ('squat', 7, 1000), ('squat', 8, 1500), ('squat', 9, 2500), ('squat', 10, 4000),
    ('squat', 11, 6000), ('squat', 12, 9000), ('squat', 13, 13000), ('squat', 14, 18000), ('squat', 15, 25000),
    ('squat', 16, 35000), ('squat', 17, 50000), ('squat', 18, 70000), ('squat', 19, 100000), ('squat', 20, 150000),

    ('burpees', 1, 10), ('burpees', 2, 25), ('burpees', 3, 50), ('burpees', 4, 100), ('burpees', 5, 175),
    ('burpees', 6, 300), ('burpees', 7, 500), ('burpees', 8, 800), ('burpees', 9, 1250), ('burpees', 10, 2000),
    ('burpees', 11, 3000), ('burpees', 12, 4500), ('burpees', 13, 6500), ('burpees', 14, 9000), ('burpees', 15, 12000),
    ('burpees', 16, 17000), ('burpees', 17, 23000), ('burpees', 18, 32000), ('burpees', 19, 45000), ('burpees', 20, 60000),

    ('planche', 1, 60), ('planche', 2, 180), ('planche', 3, 300), ('planche', 4, 600), ('planche', 5, 1200),
    ('planche', 6, 2100), ('planche', 7, 3600), ('planche', 8, 5400), ('planche', 9, 9000), ('planche', 10, 14400),
    ('planche', 11, 21600), ('planche', 12, 32400), ('planche', 13, 46800), ('planche', 14, 64800), ('planche', 15, 90000),
    ('planche', 16, 126000), ('planche', 17, 180000), ('planche', 18, 252000), ('planche', 19, 360000), ('planche', 20, 540000),

    ('developpe-couche', 1, 500), ('developpe-couche', 2, 1000), ('developpe-couche', 3, 2000), ('developpe-couche', 4, 4000), ('developpe-couche', 5, 7500),
    ('developpe-couche', 6, 12000), ('developpe-couche', 7, 20000), ('developpe-couche', 8, 35000), ('developpe-couche', 9, 55000), ('developpe-couche', 10, 80000),
    ('developpe-couche', 11, 120000), ('developpe-couche', 12, 180000), ('developpe-couche', 13, 250000), ('developpe-couche', 14, 350000), ('developpe-couche', 15, 500000),
    ('developpe-couche', 16, 700000), ('developpe-couche', 17, 1000000), ('developpe-couche', 18, 1400000), ('developpe-couche', 19, 2000000), ('developpe-couche', 20, 3000000),

    ('distance-cap', 1, 1), ('distance-cap', 2, 5), ('distance-cap', 3, 10), ('distance-cap', 4, 25), ('distance-cap', 5, 50),
    ('distance-cap', 6, 100), ('distance-cap', 7, 175), ('distance-cap', 8, 300), ('distance-cap', 9, 500), ('distance-cap', 10, 750),
    ('distance-cap', 11, 1000), ('distance-cap', 12, 1500), ('distance-cap', 13, 2000), ('distance-cap', 14, 2750), ('distance-cap', 15, 3500),
    ('distance-cap', 16, 4500), ('distance-cap', 17, 6000), ('distance-cap', 18, 8000), ('distance-cap', 19, 10000), ('distance-cap', 20, 15000),

    ('dplus-cap', 1, 50), ('dplus-cap', 2, 150), ('dplus-cap', 3, 300), ('dplus-cap', 4, 600), ('dplus-cap', 5, 1000),
    ('dplus-cap', 6, 2000), ('dplus-cap', 7, 3500), ('dplus-cap', 8, 6000), ('dplus-cap', 9, 10000), ('dplus-cap', 10, 15000),
    ('dplus-cap', 11, 25000), ('dplus-cap', 12, 40000), ('dplus-cap', 13, 60000), ('dplus-cap', 14, 90000), ('dplus-cap', 15, 130000),
    ('dplus-cap', 16, 180000), ('dplus-cap', 17, 250000), ('dplus-cap', 18, 350000), ('dplus-cap', 19, 500000), ('dplus-cap', 20, 750000),

    ('distance-velo', 1, 5), ('distance-velo', 2, 15), ('distance-velo', 3, 30), ('distance-velo', 4, 60), ('distance-velo', 5, 100),
    ('distance-velo', 6, 200), ('distance-velo', 7, 350), ('distance-velo', 8, 600), ('distance-velo', 9, 1000), ('distance-velo', 10, 1500),
    ('distance-velo', 11, 2000), ('distance-velo', 12, 3000), ('distance-velo', 13, 4000), ('distance-velo', 14, 5500), ('distance-velo', 15, 7500),
    ('distance-velo', 16, 10000), ('distance-velo', 17, 13000), ('distance-velo', 18, 17000), ('distance-velo', 19, 22000), ('distance-velo', 20, 30000),

    ('dplus-velo', 1, 50), ('dplus-velo', 2, 200), ('dplus-velo', 3, 500), ('dplus-velo', 4, 1000), ('dplus-velo', 5, 2000),
    ('dplus-velo', 6, 4000), ('dplus-velo', 7, 7000), ('dplus-velo', 8, 12000), ('dplus-velo', 9, 20000), ('dplus-velo', 10, 30000),
    ('dplus-velo', 11, 45000), ('dplus-velo', 12, 65000), ('dplus-velo', 13, 90000), ('dplus-velo', 14, 125000), ('dplus-velo', 15, 170000),
    ('dplus-velo', 16, 230000), ('dplus-velo', 17, 310000), ('dplus-velo', 18, 420000), ('dplus-velo', 19, 560000), ('dplus-velo', 20, 750000),

    ('marche', 1, 1), ('marche', 2, 5), ('marche', 3, 10), ('marche', 4, 25), ('marche', 5, 50),
    ('marche', 6, 100), ('marche', 7, 200), ('marche', 8, 350), ('marche', 9, 600), ('marche', 10, 1000),
    ('marche', 11, 1500), ('marche', 12, 2250), ('marche', 13, 3000), ('marche', 14, 4000), ('marche', 15, 5000),
    ('marche', 16, 6500), ('marche', 17, 8500), ('marche', 18, 11000), ('marche', 19, 15000), ('marche', 20, 20000),

    ('dplus-marche', 1, 50), ('dplus-marche', 2, 150), ('dplus-marche', 3, 300), ('dplus-marche', 4, 600), ('dplus-marche', 5, 1000),
    ('dplus-marche', 6, 2000), ('dplus-marche', 7, 4000), ('dplus-marche', 8, 7000), ('dplus-marche', 9, 12000), ('dplus-marche', 10, 20000),
    ('dplus-marche', 11, 30000), ('dplus-marche', 12, 45000), ('dplus-marche', 13, 65000), ('dplus-marche', 14, 90000), ('dplus-marche', 15, 125000),
    ('dplus-marche', 16, 170000), ('dplus-marche', 17, 230000), ('dplus-marche', 18, 310000), ('dplus-marche', 19, 420000), ('dplus-marche', 20, 560000)
)
insert into public.mastery_levels (mastery_id, level, threshold, xp_reward)
select
  public.masteries.id,
  level_seed.level,
  level_seed.threshold,
  case when level_seed.level <= 10 then 5 else 10 end
from level_seed
join public.masteries
  on public.masteries.slug = level_seed.mastery_slug
on conflict (mastery_id, level) do update
set
  threshold = excluded.threshold,
  xp_reward = excluded.xp_reward;

with muscle_seed(mastery_slug, muscle_key, weight) as (
  values
    ('pompes', 'pectoraux', 1),
    ('pompes', 'triceps', 0.6),
    ('pompes', 'epaules', 0.3),

    ('tractions', 'dos', 1),
    ('tractions', 'biceps', 0.6),
    ('tractions', 'avant-bras', 0.3),

    ('squat', 'quadriceps', 1),
    ('squat', 'fessiers', 1),
    ('squat', 'ischios', 0.6),

    ('planche', 'abdominaux', 1),
    ('planche', 'lombaires', 0.6),
    ('planche', 'epaules', 0.3),

    ('burpees', 'quadriceps', 0.6),
    ('burpees', 'pectoraux', 0.6),
    ('burpees', 'epaules', 0.3),
    ('burpees', 'abdominaux', 0.3),

    ('developpe-couche', 'pectoraux', 1),
    ('developpe-couche', 'triceps', 0.6),
    ('developpe-couche', 'epaules', 0.3)
)
insert into public.mastery_muscles (mastery_id, muscle_key, weight)
select
  public.masteries.id,
  muscle_seed.muscle_key,
  muscle_seed.weight
from muscle_seed
join public.masteries
  on public.masteries.slug = muscle_seed.mastery_slug
on conflict (mastery_id, muscle_key) do update
set
  weight = excluded.weight;

notify pgrst, 'reload schema';
