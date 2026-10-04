-- Schema-only production snapshot 2026-10-04. Disposable tests, never Supabase.
create role anon;
create role authenticated;
create role service_role bypassrls;
create schema auth;
create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb);
create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb $$;
create function auth.uid() returns uuid language sql stable as $$ select nullif(auth.jwt()->>'sub','')::uuid $$;
grant usage on schema auth,public to anon,authenticated,service_role;
create table public.activities (
  "id" uuid default gen_random_uuid() not null,
  "challenge_id" uuid,
  "user_email" text,
  "sport" text,
  "distance_km" numeric,
  "duration_minutes" numeric,
  "comment" text,
  "created_at" timestamp without time zone default now(),
  "unit_type" text,
  "unit_value" numeric,
  "exercise_type" text,
  "user_id" uuid,
  "likes_count" integer default 0,
  "boosts_count" integer default 0,
  "activity_name" text,
  "source" text default 'manual'::text not null,
  "occurred_at" timestamp with time zone default now() not null,
  "elevation_gain_m" numeric,
  "elevation_loss_m" numeric,
  "metadata" jsonb default '{}'::jsonb not null
);
create table public.activity_interactions (
  "id" uuid default gen_random_uuid() not null,
  "activity_id" uuid not null,
  "user_id" uuid not null,
  "type" text not null,
  "created_at" timestamp with time zone default now() not null
);
create table public.challenge_members (
  "id" uuid default gen_random_uuid() not null,
  "challenge_id" uuid,
  "user_email" text,
  "role" text default 'member'::text,
  "joined_at" timestamp without time zone default now()
);
create table public.challenge_participants (
  "id" uuid default gen_random_uuid() not null,
  "challenge_id" uuid not null,
  "user_id" uuid not null,
  "role" text default 'participant'::text not null,
  "joined_at" timestamp with time zone default now() not null
);
create table public.challenges (
  "id" uuid default gen_random_uuid() not null,
  "name" text not null,
  "sport" text,
  "start_date" date,
  "end_date" date,
  "created_at" timestamp without time zone default now(),
  "description" text,
  "goal_km" numeric,
  "created_by" uuid,
  "visibility" text default 'private'::text not null,
  "invite_code" text not null,
  "goal_type" text,
  "goal_value" numeric,
  "status" text default 'active'::text,
  "is_deleted" boolean default false not null,
  "is_public" boolean default false
);
create table public.daily_session_completions (
  "id" uuid default gen_random_uuid() not null,
  "daily_session_id" uuid not null,
  "user_id" uuid not null,
  "session_id" uuid,
  "workout_history_id" uuid,
  "scheduled_for" date not null,
  "completed_at" timestamp with time zone default now() not null,
  "created_at" timestamp with time zone default now() not null
);
create table public.daily_sessions (
  "id" uuid default gen_random_uuid() not null,
  "session_id" uuid not null,
  "scheduled_for" date not null,
  "bonus_xp" integer default 25 not null,
  "created_at" timestamp with time zone default now() not null
);
create table public.daily_steps (
  "id" uuid default gen_random_uuid() not null,
  "user_id" uuid not null,
  "step_date" date not null,
  "steps_count" integer default 0 not null,
  "source" text default 'manual'::text not null,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null,
  "synced_at" timestamp with time zone,
  "distance_meters" double precision,
  "walk_run_distance_meters" double precision,
  "bike_distance_meters" double precision
);
create table public.exercise_library (
  "id" uuid default gen_random_uuid() not null,
  "slug" text not null,
  "name" text not null,
  "sport" text,
  "category" text,
  "movement_type" text,
  "tracking_type" text not null,
  "supports_load" boolean default false not null,
  "primary_muscles" text[] default '{}'::text[] not null,
  "secondary_muscles" text[] default '{}'::text[] not null,
  "equipment" text[] default '{}'::text[] not null,
  "difficulty" text,
  "description" text,
  "instructions" text,
  "image_path" text,
  "active" boolean default true not null,
  "metadata" jsonb default '{}'::jsonb not null,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null
);
create table public.masteries (
  "id" uuid default gen_random_uuid() not null,
  "slug" text not null,
  "name" text not null,
  "category_id" uuid not null,
  "measurement_type" text not null,
  "unit" text not null,
  "description" text,
  "active" boolean default true not null,
  "sort_order" integer default 0 not null,
  "created_at" timestamp with time zone default now() not null
);
create table public.mastery_categories (
  "id" uuid default gen_random_uuid() not null,
  "slug" text not null,
  "name" text not null,
  "sort_order" integer default 0 not null,
  "active" boolean default true not null,
  "created_at" timestamp with time zone default now() not null
);
create table public.mastery_entries (
  "id" uuid default gen_random_uuid() not null,
  "user_id" uuid not null,
  "mastery_id" uuid not null,
  "value" numeric not null,
  "source" text not null,
  "source_ref_id" uuid,
  "metadata" jsonb default '{}'::jsonb not null,
  "performed_at" timestamp with time zone default now() not null,
  "created_at" timestamp with time zone default now() not null
);
create table public.mastery_exercise_links (
  "id" uuid default gen_random_uuid() not null,
  "mastery_id" uuid not null,
  "exercise_key" text not null,
  "exercise_name" text not null,
  "exercise_id" uuid,
  "source_type" text not null,
  "created_at" timestamp with time zone default now() not null
);
create table public.mastery_level_unlocks (
  "id" uuid default gen_random_uuid() not null,
  "user_id" uuid not null,
  "mastery_id" uuid not null,
  "level" integer not null,
  "xp_awarded" integer default 0 not null,
  "unlocked_at" timestamp with time zone default now() not null
);
create table public.mastery_levels (
  "id" uuid default gen_random_uuid() not null,
  "mastery_id" uuid not null,
  "level" integer not null,
  "threshold" numeric not null,
  "xp_reward" integer default 0 not null,
  "created_at" timestamp with time zone default now() not null
);
create table public.mastery_muscles (
  "id" uuid default gen_random_uuid() not null,
  "mastery_id" uuid not null,
  "muscle_key" text not null,
  "weight" numeric default 1 not null,
  "created_at" timestamp with time zone default now() not null
);
create table public.profiles (
  "id" uuid not null,
  "email" text,
  "username" text,
  "created_at" timestamp with time zone default now(),
  "total_xp" integer default 0,
  "level" integer default 1
);
create table public.program_sessions (
  "id" uuid default gen_random_uuid() not null,
  "challenge_id" uuid,
  "week_number" integer,
  "title" text,
  "description" text,
  "target_duration" integer,
  "target_distance" numeric
);
create table public.training_program_completions (
  "id" uuid default gen_random_uuid() not null,
  "user_id" uuid not null,
  "program_id" uuid not null,
  "program_session_id" uuid,
  "completed_at" timestamp with time zone default now() not null,
  "session_id" uuid,
  "workout_history_id" uuid,
  "created_at" timestamp with time zone default now() not null
);
create table public.training_program_sessions (
  "id" uuid default gen_random_uuid() not null,
  "program_id" uuid not null,
  "workout_id" uuid,
  "week_number" integer default 1 not null,
  "day_number" integer default 1 not null,
  "position" integer default 0 not null,
  "created_at" timestamp with time zone default now() not null,
  "session_id" uuid,
  "day_of_week" integer,
  "session_name" text,
  "order_index" integer default 0 not null,
  "sport" text
);
create table public.training_programs (
  "id" uuid default gen_random_uuid() not null,
  "user_id" uuid not null,
  "name" text not null,
  "description" text,
  "sport" text,
  "duration_weeks" integer default 1 not null,
  "start_date" date,
  "visibility" text default 'private'::text not null,
  "created_at" timestamp with time zone default now() not null,
  "invite_code" text,
  "updated_at" timestamp with time zone default now(),
  "copied_from_program_id" uuid,
  "difficulty" text
);
create table public.training_session_blocks (
  "id" uuid default gen_random_uuid() not null,
  "session_id" uuid not null,
  "position" integer default 0 not null,
  "name" text not null,
  "block_type" text not null,
  "target_value" numeric,
  "created_at" timestamp with time zone default now() not null,
  "charge_kg" numeric,
  "sets_count" integer default 1 not null,
  "rest_seconds" integer default 60 not null,
  "exercise_id" uuid
);
create table public.training_sessions (
  "id" uuid default gen_random_uuid() not null,
  "user_id" uuid not null,
  "name" text not null,
  "sport" text,
  "description" text,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null,
  "visibility" text default 'private'::text not null,
  "copied_from_session_id" uuid,
  "difficulty" text
);
create table public.user_badges (
  "id" uuid default gen_random_uuid() not null,
  "user_id" uuid not null,
  "badge_code" text not null,
  "unlocked_at" timestamp with time zone default now() not null
);
create table public.user_xp_events (
  "id" uuid default gen_random_uuid() not null,
  "user_id" uuid not null,
  "event_type" text not null,
  "source_type" text,
  "source_id" uuid,
  "xp_amount" integer default 0 not null,
  "created_at" timestamp with time zone default now() not null
);
create table public.workout_exercise_history (
  "id" uuid default gen_random_uuid() not null,
  "history_id" uuid,
  "user_id" uuid not null,
  "workout_id" uuid not null,
  "exercise_name" text not null,
  "block_type" text,
  "sets_count" integer default 1 not null,
  "reps" numeric default 0 not null,
  "duration_seconds" integer default 0 not null,
  "distance" numeric default 0 not null,
  "charge_kg" numeric default 0 not null,
  "volume" numeric default 0 not null,
  "completed_at" timestamp with time zone default now() not null,
  "created_at" timestamp with time zone default now() not null,
  "actual_sets" jsonb
);
create table public.workout_sessions_history (
  "id" uuid default gen_random_uuid() not null,
  "user_id" uuid not null,
  "workout_id" uuid not null,
  "workout_name" text,
  "completed_at" timestamp with time zone default now() not null,
  "duration_seconds" integer default 0 not null,
  "estimated_calories" numeric default 0 not null,
  "total_volume" numeric default 0 not null,
  "completed_exercises" integer default 0 not null,
  "created_at" timestamp with time zone default now() not null,
  "metadata" jsonb default '{}'::jsonb not null,
  "run_key" text
);
create table public.xp_events (
  "id" uuid default gen_random_uuid() not null,
  "user_id" uuid not null,
  "event_type" text not null,
  "xp_amount" integer default 0 not null,
  "target_id" text,
  "created_at" timestamp with time zone default now()
);
alter table public.activities add constraint "activities_pkey" PRIMARY KEY (id);
alter table public.activities add constraint "activities_unit_type_check" CHECK (unit_type = ANY (ARRAY['distance'::text, 'duration'::text, 'reps'::text]));
alter table public.activity_interactions add constraint "activity_interactions_activity_id_user_id_type_key" UNIQUE (activity_id, user_id, type);
alter table public.activity_interactions add constraint "activity_interactions_pkey" PRIMARY KEY (id);
alter table public.activity_interactions add constraint "activity_interactions_type_check" CHECK (type = ANY (ARRAY['like'::text, 'boost'::text, 'fire'::text]));
alter table public.challenge_members add constraint "challenge_members_pkey" PRIMARY KEY (id);
alter table public.challenge_members add constraint "challenge_members_role_check" CHECK (role = ANY (ARRAY['owner'::text, 'member'::text]));
alter table public.challenge_participants add constraint "challenge_participants_challenge_id_user_id_key" UNIQUE (challenge_id, user_id);
alter table public.challenge_participants add constraint "challenge_participants_pkey" PRIMARY KEY (id);
alter table public.challenge_participants add constraint "challenge_participants_role_check" CHECK (role = ANY (ARRAY['admin'::text, 'participant'::text]));
alter table public.challenges add constraint "challenges_goal_type_check" CHECK (goal_type = ANY (ARRAY['distance'::text, 'duration'::text, 'reps'::text]));
alter table public.challenges add constraint "challenges_invite_code_key" UNIQUE (invite_code);
alter table public.challenges add constraint "challenges_pkey" PRIMARY KEY (id);
alter table public.challenges add constraint "challenges_status_check" CHECK (status = ANY (ARRAY['active'::text, 'completed'::text, 'archived'::text, 'deleted'::text]));
alter table public.challenges add constraint "challenges_visibility_check" CHECK (visibility = ANY (ARRAY['private'::text, 'community'::text]));
alter table public.daily_session_completions add constraint "daily_session_completions_pkey" PRIMARY KEY (id);
alter table public.daily_sessions add constraint "daily_sessions_bonus_xp_check" CHECK (bonus_xp >= 0);
alter table public.daily_sessions add constraint "daily_sessions_pkey" PRIMARY KEY (id);
alter table public.daily_steps add constraint "daily_steps_pkey" PRIMARY KEY (id);
alter table public.daily_steps add constraint "daily_steps_user_id_step_date_key" UNIQUE (user_id, step_date);
alter table public.exercise_library add constraint "exercise_library_pkey" PRIMARY KEY (id);
alter table public.exercise_library add constraint "exercise_library_slug_key" UNIQUE (slug);
alter table public.exercise_library add constraint "exercise_library_tracking_type_check" CHECK (tracking_type = ANY (ARRAY['reps'::text, 'duration'::text, 'distance'::text, 'free'::text]));
alter table public.masteries add constraint "masteries_measurement_type_check" CHECK (measurement_type = ANY (ARRAY['reps'::text, 'duration'::text, 'distance'::text, 'elevation'::text, 'volume'::text, 'count'::text]));
alter table public.masteries add constraint "masteries_pkey" PRIMARY KEY (id);
alter table public.masteries add constraint "masteries_slug_key" UNIQUE (slug);
alter table public.mastery_categories add constraint "mastery_categories_pkey" PRIMARY KEY (id);
alter table public.mastery_categories add constraint "mastery_categories_slug_key" UNIQUE (slug);
alter table public.mastery_entries add constraint "mastery_entries_pkey" PRIMARY KEY (id);
alter table public.mastery_entries add constraint "mastery_entries_source_check" CHECK (source = ANY (ARRAY['manual'::text, 'session'::text, 'activity'::text, 'import'::text]));
alter table public.mastery_entries add constraint "mastery_entries_value_check" CHECK (value > 0::numeric);
alter table public.mastery_exercise_links add constraint "mastery_exercise_links_pkey" PRIMARY KEY (id);
alter table public.mastery_exercise_links add constraint "mastery_exercise_links_source_type_check" CHECK (source_type = ANY (ARRAY['exercise_library'::text, 'training_block'::text, 'alias'::text]));
alter table public.mastery_exercise_links add constraint "mastery_exercise_links_source_type_exercise_name_key" UNIQUE (source_type, exercise_name);
alter table public.mastery_level_unlocks add constraint "mastery_level_unlocks_level_check" CHECK (level > 0);
alter table public.mastery_level_unlocks add constraint "mastery_level_unlocks_pkey" PRIMARY KEY (id);
alter table public.mastery_level_unlocks add constraint "mastery_level_unlocks_user_id_mastery_id_level_key" UNIQUE (user_id, mastery_id, level);
alter table public.mastery_level_unlocks add constraint "mastery_level_unlocks_xp_awarded_check" CHECK (xp_awarded >= 0);
alter table public.mastery_levels add constraint "mastery_levels_level_check" CHECK (level > 0);
alter table public.mastery_levels add constraint "mastery_levels_mastery_id_level_key" UNIQUE (mastery_id, level);
alter table public.mastery_levels add constraint "mastery_levels_pkey" PRIMARY KEY (id);
alter table public.mastery_levels add constraint "mastery_levels_threshold_check" CHECK (threshold > 0::numeric);
alter table public.mastery_levels add constraint "mastery_levels_xp_reward_check" CHECK (xp_reward >= 0);
alter table public.mastery_muscles add constraint "mastery_muscles_mastery_id_muscle_key_key" UNIQUE (mastery_id, muscle_key);
alter table public.mastery_muscles add constraint "mastery_muscles_pkey" PRIMARY KEY (id);
alter table public.mastery_muscles add constraint "mastery_muscles_weight_check" CHECK (weight > 0::numeric);
alter table public.profiles add constraint "profiles_email_key" UNIQUE (email);
alter table public.profiles add constraint "profiles_pkey" PRIMARY KEY (id);
alter table public.profiles add constraint "profiles_username_key" UNIQUE (username);
alter table public.program_sessions add constraint "program_sessions_pkey" PRIMARY KEY (id);
alter table public.training_program_completions add constraint "training_program_completions_pkey" PRIMARY KEY (id);
alter table public.training_program_completions add constraint "training_program_completions_user_program_session_key" UNIQUE (user_id, program_id, program_session_id);
alter table public.training_program_sessions add constraint "training_program_sessions_pkey" PRIMARY KEY (id);
alter table public.training_programs add constraint "training_programs_copies_not_shared" CHECK (copied_from_program_id IS NULL OR visibility <> 'shared'::text);
alter table public.training_programs add constraint "training_programs_pkey" PRIMARY KEY (id);
alter table public.training_programs add constraint "training_programs_visibility_check" CHECK (visibility = ANY (ARRAY['private'::text, 'shared'::text, 'public'::text]));
alter table public.training_session_blocks add constraint "training_session_blocks_block_type_check" CHECK (block_type = ANY (ARRAY['reps'::text, 'duration'::text, 'distance'::text, 'free'::text]));
alter table public.training_session_blocks add constraint "training_session_blocks_pkey" PRIMARY KEY (id);
alter table public.training_sessions add constraint "training_sessions_pkey" PRIMARY KEY (id);
alter table public.user_badges add constraint "user_badges_pkey" PRIMARY KEY (id);
alter table public.user_xp_events add constraint "user_xp_events_pkey" PRIMARY KEY (id);
alter table public.workout_exercise_history add constraint "workout_exercise_history_pkey" PRIMARY KEY (id);
alter table public.workout_sessions_history add constraint "workout_sessions_history_pkey" PRIMARY KEY (id);
alter table public.xp_events add constraint "xp_events_pkey" PRIMARY KEY (id);
alter table public.activities add constraint "activities_challenge_id_fkey" FOREIGN KEY (challenge_id) REFERENCES challenges(id);
alter table public.activities add constraint "activities_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table public.activity_interactions add constraint "activity_interactions_activity_id_fkey" FOREIGN KEY (activity_id) REFERENCES activities(id) ON DELETE CASCADE;
alter table public.activity_interactions add constraint "activity_interactions_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.challenge_members add constraint "challenge_members_challenge_id_fkey" FOREIGN KEY (challenge_id) REFERENCES challenges(id);
alter table public.challenge_participants add constraint "challenge_participants_challenge_id_fkey" FOREIGN KEY (challenge_id) REFERENCES challenges(id) ON DELETE CASCADE;
alter table public.challenge_participants add constraint "challenge_participants_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.challenges add constraint "challenges_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table public.daily_session_completions add constraint "daily_session_completions_daily_session_id_fkey" FOREIGN KEY (daily_session_id) REFERENCES daily_sessions(id) ON DELETE CASCADE;
alter table public.daily_session_completions add constraint "daily_session_completions_session_id_fkey" FOREIGN KEY (session_id) REFERENCES training_sessions(id) ON DELETE SET NULL;
alter table public.daily_session_completions add constraint "daily_session_completions_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.daily_session_completions add constraint "daily_session_completions_workout_history_id_fkey" FOREIGN KEY (workout_history_id) REFERENCES workout_sessions_history(id) ON DELETE SET NULL;
alter table public.daily_sessions add constraint "daily_sessions_session_id_fkey" FOREIGN KEY (session_id) REFERENCES training_sessions(id) ON DELETE CASCADE;
alter table public.daily_steps add constraint "daily_steps_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.masteries add constraint "masteries_category_id_fkey" FOREIGN KEY (category_id) REFERENCES mastery_categories(id) ON DELETE RESTRICT;
alter table public.mastery_entries add constraint "mastery_entries_mastery_id_fkey" FOREIGN KEY (mastery_id) REFERENCES masteries(id) ON DELETE CASCADE;
alter table public.mastery_entries add constraint "mastery_entries_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.mastery_exercise_links add constraint "mastery_exercise_links_mastery_id_fkey" FOREIGN KEY (mastery_id) REFERENCES masteries(id) ON DELETE CASCADE;
alter table public.mastery_level_unlocks add constraint "mastery_level_unlocks_mastery_id_fkey" FOREIGN KEY (mastery_id) REFERENCES masteries(id) ON DELETE CASCADE;
alter table public.mastery_level_unlocks add constraint "mastery_level_unlocks_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.mastery_levels add constraint "mastery_levels_mastery_id_fkey" FOREIGN KEY (mastery_id) REFERENCES masteries(id) ON DELETE CASCADE;
alter table public.mastery_muscles add constraint "mastery_muscles_mastery_id_fkey" FOREIGN KEY (mastery_id) REFERENCES masteries(id) ON DELETE CASCADE;
alter table public.profiles add constraint "profiles_id_fkey" FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.program_sessions add constraint "program_sessions_challenge_id_fkey" FOREIGN KEY (challenge_id) REFERENCES challenges(id);
alter table public.training_program_completions add constraint "training_program_completions_program_id_fkey" FOREIGN KEY (program_id) REFERENCES training_programs(id) ON DELETE CASCADE;
alter table public.training_program_completions add constraint "training_program_completions_program_session_id_fkey" FOREIGN KEY (program_session_id) REFERENCES training_program_sessions(id) ON DELETE CASCADE;
alter table public.training_program_completions add constraint "training_program_completions_session_id_fkey" FOREIGN KEY (session_id) REFERENCES training_sessions(id) ON DELETE SET NULL;
alter table public.training_program_completions add constraint "training_program_completions_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.training_program_completions add constraint "training_program_completions_workout_history_id_fkey" FOREIGN KEY (workout_history_id) REFERENCES workout_sessions_history(id) ON DELETE SET NULL;
alter table public.training_program_sessions add constraint "training_program_sessions_program_id_fkey" FOREIGN KEY (program_id) REFERENCES training_programs(id) ON DELETE CASCADE;
alter table public.training_program_sessions add constraint "training_program_sessions_session_id_fkey" FOREIGN KEY (session_id) REFERENCES training_sessions(id) ON DELETE SET NULL;
alter table public.training_program_sessions add constraint "training_program_sessions_workout_id_fkey" FOREIGN KEY (workout_id) REFERENCES training_sessions(id) ON DELETE SET NULL;
alter table public.training_programs add constraint "training_programs_copied_from_program_id_fkey" FOREIGN KEY (copied_from_program_id) REFERENCES training_programs(id) ON DELETE SET NULL;
alter table public.training_programs add constraint "training_programs_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.training_session_blocks add constraint "training_session_blocks_exercise_id_fkey" FOREIGN KEY (exercise_id) REFERENCES exercise_library(id) ON DELETE SET NULL;
alter table public.training_session_blocks add constraint "training_session_blocks_session_id_fkey" FOREIGN KEY (session_id) REFERENCES training_sessions(id) ON DELETE CASCADE;
alter table public.training_sessions add constraint "training_sessions_copied_from_session_id_fkey" FOREIGN KEY (copied_from_session_id) REFERENCES training_sessions(id) ON DELETE SET NULL;
alter table public.training_sessions add constraint "training_sessions_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.user_badges add constraint "user_badges_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.user_xp_events add constraint "user_xp_events_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.workout_exercise_history add constraint "workout_exercise_history_history_id_fkey" FOREIGN KEY (history_id) REFERENCES workout_sessions_history(id) ON DELETE CASCADE;
alter table public.workout_exercise_history add constraint "workout_exercise_history_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.workout_sessions_history add constraint "workout_sessions_history_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.xp_events add constraint "xp_events_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
CREATE UNIQUE INDEX IF NOT EXISTS activities_pkey ON public.activities USING btree (id);
CREATE INDEX IF NOT EXISTS idx_activities_challenge_id ON public.activities USING btree (challenge_id);
CREATE INDEX IF NOT EXISTS idx_activities_user_email ON public.activities USING btree (user_email);
CREATE INDEX IF NOT EXISTS idx_activities_user_id ON public.activities USING btree (user_id);
CREATE UNIQUE INDEX IF NOT EXISTS activity_interactions_pkey ON public.activity_interactions USING btree (id);
CREATE UNIQUE INDEX IF NOT EXISTS activity_interactions_activity_id_user_id_type_key ON public.activity_interactions USING btree (activity_id, user_id, type);
CREATE INDEX IF NOT EXISTS idx_activity_interactions_activity_id ON public.activity_interactions USING btree (activity_id);
CREATE INDEX IF NOT EXISTS idx_activity_interactions_user_id ON public.activity_interactions USING btree (user_id);
CREATE UNIQUE INDEX IF NOT EXISTS activity_interactions_unique_user_activity_type ON public.activity_interactions USING btree (activity_id, user_id, type);
CREATE UNIQUE INDEX IF NOT EXISTS challenge_members_pkey ON public.challenge_members USING btree (id);
CREATE INDEX IF NOT EXISTS idx_challenge_members_challenge_id ON public.challenge_members USING btree (challenge_id);
CREATE INDEX IF NOT EXISTS idx_challenge_members_user_email ON public.challenge_members USING btree (user_email);
CREATE UNIQUE INDEX IF NOT EXISTS challenge_participants_pkey ON public.challenge_participants USING btree (id);
CREATE UNIQUE INDEX IF NOT EXISTS challenge_participants_challenge_id_user_id_key ON public.challenge_participants USING btree (challenge_id, user_id);
CREATE INDEX IF NOT EXISTS idx_challenge_participants_challenge_id ON public.challenge_participants USING btree (challenge_id);
CREATE INDEX IF NOT EXISTS idx_challenge_participants_user_id ON public.challenge_participants USING btree (user_id);
CREATE UNIQUE INDEX IF NOT EXISTS challenges_pkey ON public.challenges USING btree (id);
CREATE UNIQUE INDEX IF NOT EXISTS challenges_invite_code_key ON public.challenges USING btree (invite_code);
CREATE INDEX IF NOT EXISTS idx_challenges_created_by ON public.challenges USING btree (created_by);
CREATE INDEX IF NOT EXISTS idx_challenges_visibility ON public.challenges USING btree (visibility);
CREATE INDEX IF NOT EXISTS idx_challenges_is_deleted ON public.challenges USING btree (is_deleted);
CREATE UNIQUE INDEX IF NOT EXISTS daily_session_completions_pkey ON public.daily_session_completions USING btree (id);
CREATE UNIQUE INDEX IF NOT EXISTS daily_session_completions_user_daily_uidx ON public.daily_session_completions USING btree (user_id, daily_session_id);
CREATE UNIQUE INDEX IF NOT EXISTS daily_session_completions_user_day_uidx ON public.daily_session_completions USING btree (user_id, scheduled_for);
CREATE INDEX IF NOT EXISTS daily_session_completions_user_created_idx ON public.daily_session_completions USING btree (user_id, completed_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS daily_sessions_pkey ON public.daily_sessions USING btree (id);
CREATE UNIQUE INDEX IF NOT EXISTS daily_sessions_scheduled_for_uidx ON public.daily_sessions USING btree (scheduled_for);
CREATE UNIQUE INDEX IF NOT EXISTS daily_steps_pkey ON public.daily_steps USING btree (id);
CREATE UNIQUE INDEX IF NOT EXISTS daily_steps_user_id_step_date_key ON public.daily_steps USING btree (user_id, step_date);
CREATE INDEX IF NOT EXISTS daily_steps_user_synced_idx ON public.daily_steps USING btree (user_id, synced_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS exercise_library_pkey ON public.exercise_library USING btree (id);
CREATE UNIQUE INDEX IF NOT EXISTS exercise_library_slug_key ON public.exercise_library USING btree (slug);
CREATE INDEX IF NOT EXISTS exercise_library_active_idx ON public.exercise_library USING btree (active);
CREATE INDEX IF NOT EXISTS exercise_library_tracking_type_idx ON public.exercise_library USING btree (tracking_type);
CREATE UNIQUE INDEX IF NOT EXISTS masteries_pkey ON public.masteries USING btree (id);
CREATE UNIQUE INDEX IF NOT EXISTS masteries_slug_key ON public.masteries USING btree (slug);
CREATE INDEX IF NOT EXISTS masteries_category_sort_idx ON public.masteries USING btree (category_id, sort_order, slug);
CREATE UNIQUE INDEX IF NOT EXISTS mastery_categories_pkey ON public.mastery_categories USING btree (id);
CREATE UNIQUE INDEX IF NOT EXISTS mastery_categories_slug_key ON public.mastery_categories USING btree (slug);
CREATE INDEX IF NOT EXISTS mastery_categories_sort_idx ON public.mastery_categories USING btree (sort_order, slug);
CREATE UNIQUE INDEX IF NOT EXISTS mastery_entries_pkey ON public.mastery_entries USING btree (id);
CREATE INDEX IF NOT EXISTS mastery_entries_user_mastery_idx ON public.mastery_entries USING btree (user_id, mastery_id);
CREATE INDEX IF NOT EXISTS mastery_entries_user_mastery_performed_idx ON public.mastery_entries USING btree (user_id, mastery_id, performed_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS mastery_entries_user_mastery_source_ref_idx ON public.mastery_entries USING btree (user_id, mastery_id, source, source_ref_id) WHERE (source_ref_id IS NOT NULL);
CREATE UNIQUE INDEX IF NOT EXISTS mastery_exercise_links_pkey ON public.mastery_exercise_links USING btree (id);
CREATE UNIQUE INDEX IF NOT EXISTS mastery_exercise_links_source_type_exercise_name_key ON public.mastery_exercise_links USING btree (source_type, exercise_name);
CREATE INDEX IF NOT EXISTS mastery_exercise_links_mastery_idx ON public.mastery_exercise_links USING btree (mastery_id, source_type);
CREATE INDEX IF NOT EXISTS mastery_exercise_links_key_idx ON public.mastery_exercise_links USING btree (source_type, exercise_key);
CREATE UNIQUE INDEX IF NOT EXISTS mastery_level_unlocks_pkey ON public.mastery_level_unlocks USING btree (id);
CREATE UNIQUE INDEX IF NOT EXISTS mastery_level_unlocks_user_id_mastery_id_level_key ON public.mastery_level_unlocks USING btree (user_id, mastery_id, level);
CREATE INDEX IF NOT EXISTS mastery_level_unlocks_user_mastery_idx ON public.mastery_level_unlocks USING btree (user_id, mastery_id, unlocked_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS mastery_levels_pkey ON public.mastery_levels USING btree (id);
CREATE UNIQUE INDEX IF NOT EXISTS mastery_levels_mastery_id_level_key ON public.mastery_levels USING btree (mastery_id, level);
CREATE INDEX IF NOT EXISTS mastery_levels_mastery_level_idx ON public.mastery_levels USING btree (mastery_id, level);
CREATE UNIQUE INDEX IF NOT EXISTS mastery_muscles_pkey ON public.mastery_muscles USING btree (id);
CREATE UNIQUE INDEX IF NOT EXISTS mastery_muscles_mastery_id_muscle_key_key ON public.mastery_muscles USING btree (mastery_id, muscle_key);
CREATE UNIQUE INDEX IF NOT EXISTS profiles_pkey ON public.profiles USING btree (id);
CREATE UNIQUE INDEX IF NOT EXISTS profiles_email_key ON public.profiles USING btree (email);
CREATE UNIQUE INDEX IF NOT EXISTS profiles_username_key ON public.profiles USING btree (username);
CREATE UNIQUE INDEX IF NOT EXISTS program_sessions_pkey ON public.program_sessions USING btree (id);
CREATE UNIQUE INDEX IF NOT EXISTS training_program_completions_unique_user_program_session ON public.training_program_completions USING btree (user_id, program_id, program_session_id);
CREATE UNIQUE INDEX IF NOT EXISTS training_program_completions_pkey ON public.training_program_completions USING btree (id);
CREATE UNIQUE INDEX IF NOT EXISTS training_program_completions_user_program_session_key ON public.training_program_completions USING btree (user_id, program_id, program_session_id);
CREATE UNIQUE INDEX IF NOT EXISTS training_program_sessions_pkey ON public.training_program_sessions USING btree (id);
CREATE UNIQUE INDEX IF NOT EXISTS training_programs_pkey ON public.training_programs USING btree (id);
CREATE UNIQUE INDEX IF NOT EXISTS training_programs_invite_code_key ON public.training_programs USING btree (invite_code) WHERE (invite_code IS NOT NULL);
CREATE UNIQUE INDEX IF NOT EXISTS training_session_blocks_pkey ON public.training_session_blocks USING btree (id);
CREATE INDEX IF NOT EXISTS training_session_blocks_session_position_idx ON public.training_session_blocks USING btree (session_id, "position");
CREATE INDEX IF NOT EXISTS training_session_blocks_exercise_id_idx ON public.training_session_blocks USING btree (exercise_id);
CREATE UNIQUE INDEX IF NOT EXISTS training_sessions_pkey ON public.training_sessions USING btree (id);
CREATE INDEX IF NOT EXISTS training_sessions_user_created_idx ON public.training_sessions USING btree (user_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS user_badges_pkey ON public.user_badges USING btree (id);
CREATE UNIQUE INDEX IF NOT EXISTS user_badges_unique ON public.user_badges USING btree (user_id, badge_code);
CREATE UNIQUE INDEX IF NOT EXISTS user_badges_user_id_badge_code_idx ON public.user_badges USING btree (user_id, badge_code);
CREATE INDEX IF NOT EXISTS user_badges_user_id_idx ON public.user_badges USING btree (user_id);
CREATE UNIQUE INDEX IF NOT EXISTS user_xp_events_pkey ON public.user_xp_events USING btree (id);
CREATE INDEX IF NOT EXISTS user_xp_events_user_id_idx ON public.user_xp_events USING btree (user_id);
CREATE INDEX IF NOT EXISTS user_xp_events_created_at_idx ON public.user_xp_events USING btree (created_at);
CREATE UNIQUE INDEX IF NOT EXISTS workout_exercise_history_pkey ON public.workout_exercise_history USING btree (id);
CREATE UNIQUE INDEX IF NOT EXISTS workout_sessions_history_pkey ON public.workout_sessions_history USING btree (id);
CREATE UNIQUE INDEX IF NOT EXISTS workout_sessions_history_user_run_key_uidx ON public.workout_sessions_history USING btree (user_id, run_key) WHERE (run_key IS NOT NULL);
CREATE UNIQUE INDEX IF NOT EXISTS xp_events_pkey ON public.xp_events USING btree (id);
CREATE UNIQUE INDEX IF NOT EXISTS xp_events_unique_target ON public.xp_events USING btree (user_id, event_type, target_id);
grant all on all tables in schema public to anon,authenticated,service_role;
CREATE OR REPLACE FUNCTION public.add_user_xp(p_user_id uuid, p_event_type text, p_xp integer, p_target_id text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
declare
  current_xp integer;
begin

  -- éviter doublons
  if exists (
    select 1
    from public.xp_events
    where user_id = p_user_id
      and event_type = p_event_type
      and target_id = p_target_id
  ) then
    return;
  end if;

  -- enregistrer event XP
  insert into public.xp_events (
    user_id,
    event_type,
    xp_amount,
    target_id
  )
  values (
    p_user_id,
    p_event_type,
    p_xp,
    p_target_id
  );

  -- ajouter XP
  update public.profiles
  set total_xp = coalesce(total_xp, 0) + p_xp
  where id = p_user_id;

  -- recalcul niveau
  select total_xp
  into current_xp
  from public.profiles
  where id = p_user_id;

  update public.profiles
  set level = public.calculate_level(current_xp)
  where id = p_user_id;

end;
$function$
;
CREATE OR REPLACE FUNCTION public.award_xp(p_user_id uuid, p_source text, p_target_id text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  reward_xp integer := 0;
  daily_xp integer := 0;
  daily_count integer := 0;
begin
  if auth.uid() is null or p_user_id is null then
    return;
  end if;

  reward_xp := case p_source
    when 'challenge_created' then 20
    when 'challenge_joined' then 10
    when 'activity_added' then 25
    when 'like_received' then 1
    when 'boost_received' then 3
    when 'challenge_completed' then 50
    else 0
  end;

  if reward_xp <= 0 then
    return;
  end if;

  if p_source in ('challenge_created', 'activity_added') then
    select count(*) into daily_count
    from public.xp_events
    where user_id = p_user_id
      and event_type = p_source
      and created_at >= date_trunc('day', now());

    if (p_source = 'challenge_created' and daily_count >= 2)
      or (p_source = 'activity_added' and daily_count >= 4) then
      return;
    end if;
  end if;

  if p_source in ('like_received', 'boost_received') then
    select coalesce(sum(xp_amount), 0) into daily_xp
    from public.xp_events
    where user_id = p_user_id
      and event_type = p_source
      and created_at >= date_trunc('day', now());

    if (p_source = 'like_received' and daily_xp + reward_xp > 20)
      or (p_source = 'boost_received' and daily_xp + reward_xp > 30) then
      return;
    end if;
  end if;

  if p_target_id is not null and exists (
    select 1
    from public.xp_events
    where user_id = p_user_id
      and event_type = p_source
      and target_id = p_target_id
  ) then
    return;
  end if;

  insert into public.xp_events (user_id, event_type, xp_amount, target_id)
  values (p_user_id, p_source, reward_xp, p_target_id);

  update public.profiles
  set
    total_xp = coalesce(total_xp, 0) + reward_xp,
    level = public.calculate_level(coalesce(total_xp, 0) + reward_xp)
  where id = p_user_id;

  insert into public.user_badges (user_id, badge_code)
  select p_user_id, badge_code
  from (
    values
      ('premier_pas', p_source = 'activity_added'),
      ('challenger', p_source = 'challenge_created'),
      ('collectif', p_source = 'challenge_joined'),
      ('boosteur', p_source in ('like_received', 'boost_received')),
      (
        'actyv_motive',
        (select count(*) from public.activities where user_id = p_user_id) >= 10
      ),
      (
        'actyv_regulier',
        (select count(*) from public.activities where user_id = p_user_id) >= 5
      )
  ) as badge_rules(badge_code, should_unlock)
  where should_unlock
  on conflict (user_id, badge_code) do nothing;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.award_xp_on_activity_created()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
begin
  if new.user_id is not null then
    perform public.add_user_xp(
      new.user_id,
      'activity_created',
      25,
      new.id::text
    );
  end if;

  return new;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.award_xp_on_activity_interaction_created()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
declare
  activity_owner uuid;
  xp_to_award integer;
begin
  select user_id
  into activity_owner
  from public.activities
  where id = new.activity_id;

  -- pas d'XP si activité introuvable
  if activity_owner is null then
    return new;
  end if;

  -- pas d'XP si l'utilisateur interagit avec sa propre activité
  if activity_owner = new.user_id then
    return new;
  end if;

  if new.type = 'like' then
    xp_to_award := 1;
  elsif new.type = 'boost' then
    xp_to_award := 3;
  else
    return new;
  end if;

  perform public.add_user_xp(
    activity_owner,
    'activity_' || new.type || '_received',
    xp_to_award,
    new.id::text
  );

  return new;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.award_xp_on_challenge_created()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
begin
  if new.created_by is not null then
    perform public.add_user_xp(
      new.created_by,
      'challenge_created',
      20,
      new.id::text
    );
  end if;

  return new;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.calculate_level(xp integer)
 RETURNS integer
 LANGUAGE plpgsql
AS $function$
begin
  if xp >= 17500 then return 20;
  elsif xp >= 14500 then return 19;
  elsif xp >= 12000 then return 18;
  elsif xp >= 10000 then return 17;
  elsif xp >= 8300 then return 16;
  elsif xp >= 6900 then return 15;
  elsif xp >= 5850 then return 14;
  elsif xp >= 4900 then return 13;
  elsif xp >= 4050 then return 12;
  elsif xp >= 3300 then return 11;
  elsif xp >= 2650 then return 10;
  elsif xp >= 2075 then return 9;
  elsif xp >= 1575 then return 8;
  elsif xp >= 1150 then return 7;
  elsif xp >= 800 then return 6;
  elsif xp >= 525 then return 5;
  elsif xp >= 325 then return 4;
  elsif xp >= 175 then return 3;
  elsif xp >= 75 then return 2;
  else return 1;
  end if;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.grant_user_badge(p_user_id uuid, p_badge_code text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if p_user_id is null or p_badge_code is null or length(trim(p_badge_code)) = 0 then
    return;
  end if;

  insert into public.user_badges (user_id, badge_code)
  values (p_user_id, p_badge_code)
  on conflict (user_id, badge_code) do nothing;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.handle_new_challenge_participant()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
begin
  insert into public.challenge_participants (challenge_id, user_id, role)
  values (new.id, new.created_by, 'admin')
  on conflict (challenge_id, user_id) do nothing;

  return new;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.join_challenge_by_invite_code(p_invite_code text)
 RETURNS TABLE(id uuid, name text, sport text, description text, already_joined boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  found_challenge record;
  was_already_joined boolean := false;
  inserted_participant boolean := false;
begin
  if auth.uid() is null then
    raise exception 'auth_required';
  end if;

  if p_invite_code is null or length(trim(p_invite_code)) = 0 then
    raise exception 'invalid_invite';
  end if;

  select
    challenges.id,
    challenges.name,
    challenges.sport,
    challenges.description,
    challenges.created_by
  into found_challenge
  from public.challenges
  where challenges.invite_code = p_invite_code
    and coalesce(challenges.is_deleted, false) = false
  limit 1;

  if found_challenge.id is null then
    raise exception 'invalid_invite';
  end if;

  was_already_joined :=
    found_challenge.created_by = auth.uid()
    or exists (
      select 1
      from public.challenge_participants
      where challenge_id = found_challenge.id
        and user_id = auth.uid()
    );

  if not was_already_joined then
    insert into public.challenge_participants (challenge_id, user_id, role)
    values (found_challenge.id, auth.uid(), 'participant')
    on conflict (challenge_id, user_id) do nothing;

    inserted_participant := found;

    if inserted_participant then
      perform public.add_user_xp(auth.uid(), 'challenge_joined', 10, found_challenge.id::text);
    else
      was_already_joined := true;
    end if;
  end if;

  return query
  select
    found_challenge.id::uuid,
    found_challenge.name::text,
    found_challenge.sport::text,
    found_challenge.description::text,
    was_already_joined;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.refresh_user_badges(p_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  badge_count integer := 0;
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
  if p_user_id is null then
    return jsonb_build_object(
      'status', 'error',
      'reason', 'missing_user_id'
    );
  end if;

  select count(*)
  into activity_count
  from public.activities
  where coalesce(user_id, public.resolve_profile_id(user_email)) = p_user_id;

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
      where public.resolve_profile_id(user_email) = p_user_id
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
  where coalesce(user_id, public.resolve_profile_id(user_email)) = p_user_id;

  select count(*)
  into reactions_given_count
  from public.activity_interactions
  where user_id = p_user_id
    and type in ('like', 'boost');

  select count(*)
  into reactions_received_count
  from public.activity_interactions interactions
  join public.activities activities on activities.id = interactions.activity_id
  where coalesce(activities.user_id, public.resolve_profile_id(activities.user_email)) = p_user_id
    and interactions.user_id <> p_user_id;

  select count(*)
  into completed_sessions_count
  from public.workout_sessions_history
  where user_id = p_user_id;

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
  where coalesce(user_id, public.resolve_profile_id(user_email)) = p_user_id
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
    where user_id = p_user_id
    order by step_date desc
    limit 7
  ) recent_steps;

  select coalesce(array_agg(scheduled_for order by scheduled_for desc), '{}')
  into ordered_daily_dates
  from (
    select distinct scheduled_for
    from public.daily_session_completions
    where user_id = p_user_id
    order by scheduled_for desc
    limit 120
  ) daily_dates;

  if coalesce(array_length(ordered_daily_dates, 1), 0) > 0
     and ordered_daily_dates[1] >= current_date - 1 then
    daily_session_streak := 0;

    foreach streak_date in array ordered_daily_dates
    loop
      if streak_date = current_date - daily_session_streak then
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

  return jsonb_build_object(
    'status', 'ok',
    'user_id', p_user_id,
    'badge_count', badge_count,
    'badges', badge_codes
  );
end;
$function$
;
CREATE OR REPLACE FUNCTION public.add_mastery_entry(p_mastery_id uuid, p_value numeric, p_source text DEFAULT 'manual'::text, p_source_ref_id uuid DEFAULT NULL::uuid, p_metadata jsonb DEFAULT '{}'::jsonb, p_performed_at timestamp with time zone DEFAULT now())
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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

  if p_source <> 'manual' then
    raise exception 'SOURCE_NOT_ALLOWED';
  end if;

  if p_source_ref_id is not null then
    raise exception 'SOURCE_REF_NOT_ALLOWED_FOR_MANUAL_ENTRY';
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

  v_progress := public.compute_mastery_progress_internal(v_user_id, p_mastery_id);

  return v_progress || jsonb_build_object(
    'entry_id', v_entry_id,
    'mastery_id', p_mastery_id,
    'xp_awarded', v_xp_awarded,
    'unlocked_levels', v_unlocked_levels,
    'inserted_value', p_value
  );
end;
$function$
;
CREATE OR REPLACE FUNCTION public.compute_mastery_progress(p_mastery_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  return public.compute_mastery_progress_internal(v_user_id, p_mastery_id);
end;
$function$
;
CREATE OR REPLACE FUNCTION public.compute_mastery_progress_internal(p_user_id uuid, p_mastery_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$
;
CREATE OR REPLACE FUNCTION public.compute_session_mastery_value(p_mastery_measurement_type text, p_mastery_unit text, p_block_type text, p_completed_sets integer, p_total_reps numeric, p_total_duration_seconds numeric, p_total_distance_km numeric, p_total_volume_kg numeric)
 RETURNS numeric
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO ''
AS $function$
begin
  if p_mastery_measurement_type = 'reps' then
    if p_block_type = 'reps' and coalesce(p_total_reps, 0) > 0 then
      return p_total_reps;
    end if;

    return null;
  end if;

  if p_mastery_measurement_type = 'duration' then
    if p_block_type <> 'duration' or coalesce(p_total_duration_seconds, 0) <= 0 then
      return null;
    end if;

    if p_mastery_unit = 'secondes' then
      return p_total_duration_seconds;
    end if;

    if p_mastery_unit = 'minutes' then
      return p_total_duration_seconds / 60.0;
    end if;

    return null;
  end if;

  if p_mastery_measurement_type = 'distance' then
    if p_block_type <> 'distance' or coalesce(p_total_distance_km, 0) <= 0 then
      return null;
    end if;

    if p_mastery_unit = 'km' then
      return p_total_distance_km;
    end if;

    if p_mastery_unit = 'm' then
      return p_total_distance_km * 1000.0;
    end if;

    return null;
  end if;

  if p_mastery_measurement_type = 'elevation' then
    return null;
  end if;

  if p_mastery_measurement_type = 'volume' then
    if p_block_type = 'reps' and coalesce(p_total_volume_kg, 0) > 0 then
      return p_total_volume_kg;
    end if;

    return null;
  end if;

  if p_mastery_measurement_type = 'count' then
    if coalesce(p_completed_sets, 0) > 0 then
      return 1;
    end if;

    return null;
  end if;

  return null;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.handle_mastery_entry_after_insert()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  perform public.process_mastery_unlocks(new.user_id, new.mastery_id);
  return new;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.normalize_mastery_exercise_key(p_value text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
  select trim(
    both '-'
    from regexp_replace(
      regexp_replace(
        translate(
          replace(
            replace(lower(coalesce(p_value, '')), 'œ', 'oe'),
            'æ',
            'ae'
          ),
          'àáâäãåçèéêëìíîïñòóôöõùúûüýÿšž',
          'aaaaaaceeeeiiiinooooouuuuyysz'
        ),
        '[^a-z0-9]+',
        '-',
        'g'
      ),
      '-{2,}',
      '-',
      'g'
    )
  );
$function$
;
CREATE OR REPLACE FUNCTION public.process_mastery_unlocks(p_user_id uuid, p_mastery_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
    select ml.level, ml.xp_reward
    from public.mastery_levels ml
    where ml.mastery_id = p_mastery_id
      and threshold <= v_total_value
      and not exists (
        select 1
        from public.mastery_level_unlocks
        where user_id = p_user_id
          and mastery_id = p_mastery_id
          and level = ml.level
      )
    order by ml.level asc
  loop
    begin
      insert into public.mastery_level_unlocks (user_id, mastery_id, level, xp_awarded)
      values (p_user_id, p_mastery_id, v_level_row.level, v_level_row.xp_reward);
    exception
      when unique_violation then
        continue;
    end;

    insert into public.xp_events (user_id, event_type, xp_amount, target_id)
    values (
      p_user_id,
      'mastery_level_up',
      v_level_row.xp_reward,
      p_mastery_id::text || ':level:' || v_level_row.level::text
    );

    update public.profiles
    set
      total_xp = coalesce(total_xp, 0) + v_level_row.xp_reward,
      level = public.calculate_level(coalesce(total_xp, 0) + v_level_row.xp_reward)
    where id = p_user_id;

    if not found then
      raise exception 'PROFILE_NOT_FOUND_FOR_MASTERY_XP';
    end if;

    v_total_xp_awarded := v_total_xp_awarded + v_level_row.xp_reward;

    v_unlocked_levels := v_unlocked_levels || jsonb_build_array(
      jsonb_build_object(
        'level', v_level_row.level,
        'xp_reward', v_level_row.xp_reward
      )
    );
  end loop;

  v_progress := public.compute_mastery_progress_internal(p_user_id, p_mastery_id);

  return v_progress || jsonb_build_object(
    'xp_awarded', v_total_xp_awarded,
    'unlocked_levels', v_unlocked_levels
  );
end;
$function$
;
CREATE OR REPLACE FUNCTION public.ensure_daily_session_for_date(p_scheduled_for date DEFAULT CURRENT_DATE)
 RETURNS daily_sessions
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_daily_session public.daily_sessions;
  v_session_id uuid;
begin
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
CREATE OR REPLACE FUNCTION public.process_activity_masteries(p_activity_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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

  v_owner_user_id := v_activity.user_id;

  if v_owner_user_id is null then
    raise exception 'ACTIVITY_OWNER_MISSING';
  end if;

  if v_owner_user_id is distinct from v_auth_user_id then
    raise exception 'ACTIVITY_FORBIDDEN';
  end if;

  -- Shared by all activity mastery calls for this user, not just this activity.
  -- Acquire before the unlock snapshot; PostgreSQL releases it at transaction end.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('actyv:activity-masteries:' || v_auth_user_id::text, 0)
  );

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

  -- A pure retry cannot report XP from unrelated unlocks.
  if v_inserted_entries_count > 0 then
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
$function$
;
CREATE OR REPLACE FUNCTION public.process_workout_masteries(p_workout_history_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
      greatest(coalesce(raw_rows.actual_reps, 0), 0) as reps_value,
      case
        when raw_rows.actual_charge_kg is null then null
        else greatest(raw_rows.actual_charge_kg, 0)
      end as charge_value,
      greatest(coalesce(raw_rows.actual_value, 0), 0) as numeric_value,
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
      -- Live block distances are meters; the existing value helper expects kilometers.
      sum(case when completed_rows.block_type = 'distance' then completed_rows.numeric_value / 1000.0 else 0 end) as total_distance_km,
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
$function$
;
CREATE OR REPLACE FUNCTION public.resolve_activity_mastery_sport(p_sport text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
  select case
    when public.normalize_mastery_exercise_key(p_sport) in (
      'course-a-pied',
      'course',
      'running',
      'run',
      'jog',
      'jogging',
      'footing'
    ) then 'course-a-pied'
    when public.normalize_mastery_exercise_key(p_sport) in (
      'trail',
      'trail-running',
      'trail-run'
    ) then 'trail'
    when public.normalize_mastery_exercise_key(p_sport) in (
      'marche',
      'walking',
      'walk',
      'randonnee',
      'hiking',
      'hike'
    ) then 'marche'
    when public.normalize_mastery_exercise_key(p_sport) in (
      'velo',
      'bike',
      'cycling',
      'cyclisme'
    ) then 'velo'
    when public.normalize_mastery_exercise_key(p_sport) in (
      'vtt',
      'mtb',
      'mountain-bike',
      'mountain-biking'
    ) then 'vtt'
    when public.normalize_mastery_exercise_key(p_sport) in (
      'natation',
      'swimming',
      'swim'
    ) then 'natation'
    else null
  end;
$function$
;
CREATE OR REPLACE FUNCTION public.sync_workout_exercise_history(p_history_id uuid)
 RETURNS SETOF workout_exercise_history
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_history public.workout_sessions_history%rowtype;
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  -- Serialize all repairs of this history, including concurrent retries.
  select * into v_history from public.workout_sessions_history
  where id = p_history_id and user_id = auth.uid()
  for update;
  if not found then
    raise exception 'WORKOUT_HISTORY_NOT_FOUND';
  end if;
  if jsonb_typeof(v_history.metadata -> 'actual_sets') is distinct from 'array' then
    raise exception 'ACTUAL_SETS_MISSING';
  end if;

  -- Atomic replacement is scoped to this owned history only. No backfill.
  delete from public.workout_exercise_history
  where history_id = v_history.id and user_id = auth.uid();

  return query
  with completed as (
    select item
    from jsonb_array_elements(v_history.metadata -> 'actual_sets') item
    where item ->> 'status' = 'completed'
      and nullif(item ->> 'block_id', '') is not null
      and nullif(btrim(item ->> 'block_name'), '') is not null
  ), distinct_sets as (
    select distinct on (item ->> 'block_id', item ->> 'set_number') item
    from completed
    order by item ->> 'block_id', item ->> 'set_number'
  ), values_by_set as (
    select item,
      item ->> 'block_id' as block_id,
      item ->> 'block_type' as block_type,
      greatest(coalesce((item ->> 'actual_reps')::numeric, 0), 0) as reps,
      greatest(coalesce((item ->> 'actual_charge_kg')::numeric, 0), 0) as charge,
      greatest(coalesce((item ->> 'actual_value')::numeric, 0), 0) as value
    from distinct_sets
  )
  insert into public.workout_exercise_history (
    history_id, user_id, workout_id, exercise_name, block_type,
    sets_count, reps, duration_seconds, distance, charge_kg, volume,
    completed_at, actual_sets
  )
  select v_history.id, v_history.user_id, v_history.workout_id,
    min(btrim(item ->> 'block_name')), block_type, count(*)::integer,
    -- Existing consumers interpret reps/charge/duration as best set values.
    max(case when block_type = 'reps' then reps else 0 end),
    trunc(max(case when block_type = 'duration' then value else 0 end))::integer,
    max(case when block_type = 'distance' then value else 0 end),
    max(case when block_type = 'reps' then charge else 0 end),
    sum(case when block_type = 'reps' then reps * charge else 0 end),
    v_history.completed_at,
    jsonb_agg(item order by (item ->> 'set_number')::integer)
  from values_by_set
  group by block_id, block_type
  returning *;
end;
$function$
;
create trigger trg_award_xp_on_activity_created after insert on public.activities for each row execute function public.award_xp_on_activity_created();
create trigger trg_award_xp_on_challenge_created after insert on public.challenges for each row execute function public.award_xp_on_challenge_created();
create trigger on_challenge_created_add_participant after insert on public.challenges for each row execute function public.handle_new_challenge_participant();
create trigger trg_award_xp_on_activity_interaction_created after insert on public.activity_interactions for each row execute function public.award_xp_on_activity_interaction_created();
create trigger mastery_entries_after_insert after insert on public.mastery_entries for each row execute function public.handle_mastery_entry_after_insert();
alter table public.activities enable row level security;
alter table public.activity_interactions enable row level security;
create policy "Interactions are viewable by authenticated users" on public.activity_interactions as PERMISSIVE for SELECT to authenticated using (true);
create policy "Users can interact as themselves" on public.activity_interactions as PERMISSIVE for INSERT to authenticated with check ((auth.uid() = user_id));
create policy "Users can delete their own interactions" on public.activity_interactions as PERMISSIVE for DELETE to authenticated using ((auth.uid() = user_id));
alter table public.challenge_members enable row level security;
alter table public.challenge_participants enable row level security;
alter table public.challenges enable row level security;
alter table public.daily_session_completions enable row level security;
create policy "Users can read own daily session completions" on public.daily_session_completions as PERMISSIVE for SELECT to authenticated using ((auth.uid() = user_id));
create policy "Users can insert own daily session completions" on public.daily_session_completions as PERMISSIVE for INSERT to authenticated with check (((auth.uid() = user_id) AND (EXISTS ( SELECT 1
   FROM (daily_sessions
     JOIN training_sessions ON ((training_sessions.id = daily_sessions.session_id)))
  WHERE ((daily_sessions.id = daily_session_completions.daily_session_id) AND (training_sessions.visibility = 'public'::text))))));
create policy "Users can update own daily session completions" on public.daily_session_completions as PERMISSIVE for UPDATE to authenticated using ((auth.uid() = user_id)) with check ((auth.uid() = user_id));
create policy "Users can delete own daily session completions" on public.daily_session_completions as PERMISSIVE for DELETE to authenticated using ((auth.uid() = user_id));
alter table public.daily_sessions enable row level security;
create policy "Anyone can read daily sessions" on public.daily_sessions as PERMISSIVE for SELECT to public using ((EXISTS ( SELECT 1
   FROM training_sessions
  WHERE ((training_sessions.id = daily_sessions.session_id) AND (training_sessions.visibility = 'public'::text)))));
alter table public.daily_steps enable row level security;
create policy "Users can update own daily steps" on public.daily_steps as PERMISSIVE for UPDATE to authenticated using ((auth.uid() = user_id)) with check ((auth.uid() = user_id));
create policy "Users can read own daily steps" on public.daily_steps as PERMISSIVE for SELECT to authenticated using ((auth.uid() = user_id));
create policy "Users can insert own daily steps" on public.daily_steps as PERMISSIVE for INSERT to authenticated with check ((auth.uid() = user_id));
alter table public.exercise_library enable row level security;
create policy "Authenticated users can read exercise library" on public.exercise_library as PERMISSIVE for SELECT to authenticated using (true);
alter table public.masteries enable row level security;
create policy "Authenticated users can read masteries" on public.masteries as PERMISSIVE for SELECT to authenticated using (true);
alter table public.mastery_categories enable row level security;
create policy "Authenticated users can read mastery categories" on public.mastery_categories as PERMISSIVE for SELECT to authenticated using (true);
alter table public.mastery_entries enable row level security;
create policy "Users can read own mastery entries" on public.mastery_entries as PERMISSIVE for SELECT to authenticated using ((auth.uid() = user_id));
alter table public.mastery_exercise_links enable row level security;
create policy "Authenticated users can read mastery exercise links" on public.mastery_exercise_links as PERMISSIVE for SELECT to authenticated using (true);
alter table public.mastery_level_unlocks enable row level security;
create policy "Users can read own mastery unlocks" on public.mastery_level_unlocks as PERMISSIVE for SELECT to authenticated using ((auth.uid() = user_id));
alter table public.mastery_levels enable row level security;
create policy "Authenticated users can read mastery levels" on public.mastery_levels as PERMISSIVE for SELECT to authenticated using (true);
alter table public.mastery_muscles enable row level security;
create policy "Authenticated users can read mastery muscles" on public.mastery_muscles as PERMISSIVE for SELECT to authenticated using (true);
alter table public.profiles enable row level security;
alter table public.program_sessions enable row level security;
alter table public.training_program_completions enable row level security;
create policy "Users can manage their own training program completions" on public.training_program_completions as PERMISSIVE for ALL to authenticated using ((auth.uid() = user_id)) with check ((auth.uid() = user_id));
alter table public.training_program_sessions enable row level security;
alter table public.training_programs enable row level security;
alter table public.training_session_blocks enable row level security;
create policy "Users can read own training session blocks" on public.training_session_blocks as PERMISSIVE for SELECT to public using ((EXISTS ( SELECT 1
   FROM training_sessions
  WHERE ((training_sessions.id = training_session_blocks.session_id) AND (training_sessions.user_id = auth.uid())))));
create policy "Users can insert own training session blocks" on public.training_session_blocks as PERMISSIVE for INSERT to public with check ((EXISTS ( SELECT 1
   FROM training_sessions
  WHERE ((training_sessions.id = training_session_blocks.session_id) AND (training_sessions.user_id = auth.uid())))));
create policy "Users can update own training session blocks" on public.training_session_blocks as PERMISSIVE for UPDATE to public using ((EXISTS ( SELECT 1
   FROM training_sessions
  WHERE ((training_sessions.id = training_session_blocks.session_id) AND (training_sessions.user_id = auth.uid()))))) with check ((EXISTS ( SELECT 1
   FROM training_sessions
  WHERE ((training_sessions.id = training_session_blocks.session_id) AND (training_sessions.user_id = auth.uid())))));
create policy "Users can delete own training session blocks" on public.training_session_blocks as PERMISSIVE for DELETE to public using ((EXISTS ( SELECT 1
   FROM training_sessions
  WHERE ((training_sessions.id = training_session_blocks.session_id) AND (training_sessions.user_id = auth.uid())))));
create policy "Users can read public session blocks" on public.training_session_blocks as PERMISSIVE for SELECT to authenticated using ((EXISTS ( SELECT 1
   FROM training_sessions s
  WHERE ((s.id = training_session_blocks.session_id) AND (s.visibility = 'public'::text)))));
alter table public.training_sessions enable row level security;
create policy "Users can read accessible training sessions" on public.training_sessions as PERMISSIVE for SELECT to authenticated using (((auth.uid() = user_id) OR (visibility = 'public'::text)));
create policy "Users can update own training sessions" on public.training_sessions as PERMISSIVE for UPDATE to public using ((auth.uid() = user_id)) with check ((auth.uid() = user_id));
create policy "Users can delete own training sessions" on public.training_sessions as PERMISSIVE for DELETE to public using ((auth.uid() = user_id));
create policy "Users can insert own training sessions" on public.training_sessions as PERMISSIVE for INSERT to public with check ((auth.uid() = user_id));
alter table public.user_badges enable row level security;
create policy "Users can insert own badges" on public.user_badges as PERMISSIVE for INSERT to public with check ((auth.uid() = user_id));
create policy "Users can read own badges" on public.user_badges as PERMISSIVE for SELECT to public using ((auth.uid() = user_id));
create policy "Users can read their own badges" on public.user_badges as PERMISSIVE for SELECT to public using ((auth.uid() = user_id));
create policy "Users can insert their own badges" on public.user_badges as PERMISSIVE for INSERT to public with check ((auth.uid() = user_id));
alter table public.user_xp_events enable row level security;
create policy "Users can read their own XP events" on public.user_xp_events as PERMISSIVE for SELECT to public using ((auth.uid() = user_id));
create policy "Users can insert their own XP events" on public.user_xp_events as PERMISSIVE for INSERT to public with check ((auth.uid() = user_id));
alter table public.workout_exercise_history enable row level security;
create policy "Users can insert their own exercise history" on public.workout_exercise_history as PERMISSIVE for INSERT to authenticated with check ((auth.uid() = user_id));
create policy "Users can view their own exercise history" on public.workout_exercise_history as PERMISSIVE for SELECT to authenticated using ((auth.uid() = user_id));
alter table public.workout_sessions_history enable row level security;
create policy "Users can insert their own workout history" on public.workout_sessions_history as PERMISSIVE for INSERT to authenticated with check ((auth.uid() = user_id));
create policy "Users can view their own workout history" on public.workout_sessions_history as PERMISSIVE for SELECT to authenticated using ((auth.uid() = user_id));
create policy "Users can delete their own workout history" on public.workout_sessions_history as PERMISSIVE for DELETE to authenticated using ((auth.uid() = user_id));
create policy "Users can insert own workout history" on public.workout_sessions_history as PERMISSIVE for INSERT to public with check ((auth.uid() = user_id));
create policy "Users can read own workout history" on public.workout_sessions_history as PERMISSIVE for SELECT to public using ((auth.uid() = user_id));
alter table public.xp_events enable row level security;
create policy "Users can read own xp events" on public.xp_events as PERMISSIVE for SELECT to authenticated using ((auth.uid() = user_id));
create policy "Users can insert own xp events" on public.xp_events as PERMISSIVE for INSERT to authenticated with check ((auth.uid() = user_id));
-- Restore production mastery ACLs (default EXECUTE must not hide mistakes).
revoke all on function public.add_user_xp(uuid,text,integer,text) from public,anon,authenticated;
grant execute on function public.add_user_xp(uuid,text,integer,text) to anon;
grant execute on function public.add_user_xp(uuid,text,integer,text) to authenticated;
grant execute on function public.add_user_xp(uuid,text,integer,text) to service_role;
revoke all on function public.award_xp(uuid,text,text) from public,anon,authenticated;
grant execute on function public.award_xp(uuid,text,text) to anon;
grant execute on function public.award_xp(uuid,text,text) to authenticated;
grant execute on function public.award_xp(uuid,text,text) to service_role;
revoke all on function public.award_xp_on_activity_created() from public,anon,authenticated;
grant execute on function public.award_xp_on_activity_created() to anon;
grant execute on function public.award_xp_on_activity_created() to authenticated;
grant execute on function public.award_xp_on_activity_created() to service_role;
revoke all on function public.award_xp_on_activity_interaction_created() from public,anon,authenticated;
grant execute on function public.award_xp_on_activity_interaction_created() to anon;
grant execute on function public.award_xp_on_activity_interaction_created() to authenticated;
grant execute on function public.award_xp_on_activity_interaction_created() to service_role;
revoke all on function public.award_xp_on_challenge_created() from public,anon,authenticated;
grant execute on function public.award_xp_on_challenge_created() to anon;
grant execute on function public.award_xp_on_challenge_created() to authenticated;
grant execute on function public.award_xp_on_challenge_created() to service_role;
revoke all on function public.calculate_level(integer) from public,anon,authenticated;
grant execute on function public.calculate_level(integer) to anon;
grant execute on function public.calculate_level(integer) to authenticated;
grant execute on function public.calculate_level(integer) to service_role;
revoke all on function public.grant_user_badge(uuid,text) from public,anon,authenticated;
grant execute on function public.grant_user_badge(uuid,text) to anon;
grant execute on function public.grant_user_badge(uuid,text) to authenticated;
grant execute on function public.grant_user_badge(uuid,text) to service_role;
revoke all on function public.handle_new_challenge_participant() from public,anon,authenticated;
grant execute on function public.handle_new_challenge_participant() to anon;
grant execute on function public.handle_new_challenge_participant() to authenticated;
grant execute on function public.handle_new_challenge_participant() to service_role;
revoke all on function public.join_challenge_by_invite_code(text) from public,anon,authenticated;
grant execute on function public.join_challenge_by_invite_code(text) to anon;
grant execute on function public.join_challenge_by_invite_code(text) to authenticated;
grant execute on function public.join_challenge_by_invite_code(text) to service_role;
revoke all on function public.refresh_user_badges(uuid) from public,anon,authenticated;
grant execute on function public.refresh_user_badges(uuid) to anon;
grant execute on function public.refresh_user_badges(uuid) to authenticated;
grant execute on function public.refresh_user_badges(uuid) to service_role;
revoke all on function public.add_mastery_entry(uuid,numeric,text,uuid,jsonb,timestamp with time zone) from public,anon,authenticated;
grant execute on function public.add_mastery_entry(uuid,numeric,text,uuid,jsonb,timestamp with time zone) to authenticated;
grant execute on function public.add_mastery_entry(uuid,numeric,text,uuid,jsonb,timestamp with time zone) to service_role;
revoke all on function public.compute_mastery_progress(uuid) from public,anon,authenticated;
grant execute on function public.compute_mastery_progress(uuid) to authenticated;
grant execute on function public.compute_mastery_progress(uuid) to service_role;
revoke all on function public.compute_mastery_progress_internal(uuid,uuid) from public,anon,authenticated;
grant execute on function public.compute_mastery_progress_internal(uuid,uuid) to service_role;
revoke all on function public.compute_session_mastery_value(text,text,text,integer,numeric,numeric,numeric,numeric) from public,anon,authenticated;
grant execute on function public.compute_session_mastery_value(text,text,text,integer,numeric,numeric,numeric,numeric) to service_role;
revoke all on function public.handle_mastery_entry_after_insert() from public,anon,authenticated;
grant execute on function public.handle_mastery_entry_after_insert() to service_role;
revoke all on function public.normalize_mastery_exercise_key(text) from public,anon,authenticated;
grant execute on function public.normalize_mastery_exercise_key(text) to service_role;
revoke all on function public.process_mastery_unlocks(uuid,uuid) from public,anon,authenticated;
grant execute on function public.process_mastery_unlocks(uuid,uuid) to service_role;
revoke all on function public.ensure_daily_session_for_date(date) from public,anon,authenticated;
grant execute on function public.ensure_daily_session_for_date(date) to anon;
grant execute on function public.ensure_daily_session_for_date(date) to authenticated;
grant execute on function public.ensure_daily_session_for_date(date) to service_role;
CREATE OR REPLACE FUNCTION public.join_challenge_by_invite(p_invite_code text)
 RETURNS TABLE(id uuid, name text, sport text, description text, already_joined boolean)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select *
  from public.join_challenge_by_invite_code(p_invite_code);
$function$
;
revoke all on function public.join_challenge_by_invite(text) from public;
grant execute on function public.join_challenge_by_invite(text) to anon,authenticated,service_role;
revoke all on function public.process_activity_masteries(uuid) from public,anon,authenticated;
grant execute on function public.process_activity_masteries(uuid) to authenticated;
grant execute on function public.process_activity_masteries(uuid) to service_role;
revoke all on function public.process_workout_masteries(uuid) from public,anon,authenticated;
grant execute on function public.process_workout_masteries(uuid) to authenticated;
grant execute on function public.process_workout_masteries(uuid) to service_role;
revoke all on function public.resolve_activity_mastery_sport(text) from public,anon,authenticated;
grant execute on function public.resolve_activity_mastery_sport(text) to service_role;
revoke all on function public.sync_workout_exercise_history(uuid) from public,anon,authenticated;
grant execute on function public.sync_workout_exercise_history(uuid) to authenticated;
grant execute on function public.sync_workout_exercise_history(uuid) to service_role;
