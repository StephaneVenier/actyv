-- Production schema snapshot (2026-10-04), schema only: no user data.
-- In-memory tests only; never execute this fixture against Supabase.
create role anon;
create role authenticated;
create role service_role bypassrls;
create schema auth;
create function auth.jwt() returns jsonb language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb;
$$;
create function auth.uid() returns uuid language sql stable as $$
  select nullif(auth.jwt() ->> 'sub', '')::uuid;
$$;
grant usage on schema public, auth to anon, authenticated, service_role;
-- FK targets outside the inspected V1A schema; deliberately minimal stubs.
create table public.training_sessions (id uuid primary key);
create table public.workout_sessions_history (id uuid primary key);
create table "auth"."users" (
  "instance_id" uuid,
  "id" uuid not null,
  "aud" character varying(255),
  "role" character varying(255),
  "email" character varying(255),
  "encrypted_password" character varying(255),
  "email_confirmed_at" timestamp with time zone,
  "invited_at" timestamp with time zone,
  "confirmation_token" character varying(255),
  "confirmation_sent_at" timestamp with time zone,
  "recovery_token" character varying(255),
  "recovery_sent_at" timestamp with time zone,
  "email_change_token_new" character varying(255),
  "email_change" character varying(255),
  "email_change_sent_at" timestamp with time zone,
  "last_sign_in_at" timestamp with time zone,
  "raw_app_meta_data" jsonb,
  "raw_user_meta_data" jsonb,
  "is_super_admin" boolean,
  "created_at" timestamp with time zone,
  "updated_at" timestamp with time zone,
  "phone" text default NULL::character varying,
  "phone_confirmed_at" timestamp with time zone,
  "phone_change" text default ''::character varying,
  "phone_change_token" character varying(255) default ''::character varying,
  "phone_change_sent_at" timestamp with time zone,
  "confirmed_at" timestamp with time zone generated always as (LEAST(email_confirmed_at, phone_confirmed_at)) stored,
  "email_change_token_current" character varying(255) default ''::character varying,
  "email_change_confirm_status" smallint default 0,
  "banned_until" timestamp with time zone,
  "reauthentication_token" character varying(255) default ''::character varying,
  "reauthentication_sent_at" timestamp with time zone,
  "is_sso_user" boolean default false not null,
  "deleted_at" timestamp with time zone,
  "is_anonymous" boolean default false not null
);
create table "public"."activities" (
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
create table "public"."challenge_members" (
  "id" uuid default gen_random_uuid() not null,
  "challenge_id" uuid,
  "user_email" text,
  "role" text default 'member'::text,
  "joined_at" timestamp without time zone default now()
);
create table "public"."challenge_participants" (
  "id" uuid default gen_random_uuid() not null,
  "challenge_id" uuid not null,
  "user_id" uuid not null,
  "role" text default 'participant'::text not null,
  "joined_at" timestamp with time zone default now() not null
);
create table "public"."challenges" (
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
create table "public"."profiles" (
  "id" uuid not null,
  "email" text,
  "username" text,
  "created_at" timestamp with time zone default now(),
  "total_xp" integer default 0,
  "level" integer default 1
);
create table "public"."program_sessions" (
  "id" uuid default gen_random_uuid() not null,
  "challenge_id" uuid,
  "week_number" integer,
  "title" text,
  "description" text,
  "target_duration" integer,
  "target_distance" numeric
);
create table "public"."training_program_completions" (
  "id" uuid default gen_random_uuid() not null,
  "user_id" uuid not null,
  "program_id" uuid not null,
  "program_session_id" uuid,
  "completed_at" timestamp with time zone default now() not null,
  "session_id" uuid,
  "workout_history_id" uuid,
  "created_at" timestamp with time zone default now() not null
);
create table "public"."training_program_sessions" (
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
create table "public"."training_programs" (
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
alter table "auth"."users" add constraint "users_email_change_confirm_status_check" CHECK (email_change_confirm_status >= 0 AND email_change_confirm_status <= 2);
alter table "auth"."users" add constraint "users_phone_key" UNIQUE (phone);
alter table "auth"."users" add constraint "users_pkey" PRIMARY KEY (id);
CREATE UNIQUE INDEX confirmation_token_idx ON auth.users USING btree (confirmation_token) WHERE ((confirmation_token)::text !~ '^[0-9 ]*$'::text);
CREATE UNIQUE INDEX email_change_token_current_idx ON auth.users USING btree (email_change_token_current) WHERE ((email_change_token_current)::text !~ '^[0-9 ]*$'::text);
CREATE UNIQUE INDEX email_change_token_new_idx ON auth.users USING btree (email_change_token_new) WHERE ((email_change_token_new)::text !~ '^[0-9 ]*$'::text);
CREATE UNIQUE INDEX reauthentication_token_idx ON auth.users USING btree (reauthentication_token) WHERE ((reauthentication_token)::text !~ '^[0-9 ]*$'::text);
CREATE UNIQUE INDEX recovery_token_idx ON auth.users USING btree (recovery_token) WHERE ((recovery_token)::text !~ '^[0-9 ]*$'::text);
CREATE UNIQUE INDEX users_email_partial_key ON auth.users USING btree (email) WHERE (is_sso_user = false);
CREATE INDEX users_instance_id_email_idx ON auth.users USING btree (instance_id, lower((email)::text));
CREATE INDEX users_instance_id_idx ON auth.users USING btree (instance_id);
CREATE INDEX users_is_anonymous_idx ON auth.users USING btree (is_anonymous);
alter table "auth"."users" enable row level security;
alter table "public"."activities" add constraint "activities_pkey" PRIMARY KEY (id);
alter table "public"."activities" add constraint "activities_unit_type_check" CHECK (unit_type = ANY (ARRAY['distance'::text, 'duration'::text, 'reps'::text]));
CREATE INDEX idx_activities_challenge_id ON public.activities USING btree (challenge_id);
CREATE INDEX idx_activities_user_email ON public.activities USING btree (user_email);
CREATE INDEX idx_activities_user_id ON public.activities USING btree (user_id);
alter table "public"."activities" enable row level security;
alter table "public"."challenge_members" add constraint "challenge_members_pkey" PRIMARY KEY (id);
alter table "public"."challenge_members" add constraint "challenge_members_role_check" CHECK (role = ANY (ARRAY['owner'::text, 'member'::text]));
CREATE INDEX idx_challenge_members_challenge_id ON public.challenge_members USING btree (challenge_id);
CREATE INDEX idx_challenge_members_user_email ON public.challenge_members USING btree (user_email);
alter table "public"."challenge_members" enable row level security;
alter table "public"."challenge_participants" add constraint "challenge_participants_challenge_id_user_id_key" UNIQUE (challenge_id, user_id);
alter table "public"."challenge_participants" add constraint "challenge_participants_pkey" PRIMARY KEY (id);
alter table "public"."challenge_participants" add constraint "challenge_participants_role_check" CHECK (role = ANY (ARRAY['admin'::text, 'participant'::text]));
CREATE INDEX idx_challenge_participants_challenge_id ON public.challenge_participants USING btree (challenge_id);
CREATE INDEX idx_challenge_participants_user_id ON public.challenge_participants USING btree (user_id);
alter table "public"."challenge_participants" enable row level security;
alter table "public"."challenges" add constraint "challenges_goal_type_check" CHECK (goal_type = ANY (ARRAY['distance'::text, 'duration'::text, 'reps'::text]));
alter table "public"."challenges" add constraint "challenges_invite_code_key" UNIQUE (invite_code);
alter table "public"."challenges" add constraint "challenges_pkey" PRIMARY KEY (id);
alter table "public"."challenges" add constraint "challenges_status_check" CHECK (status = ANY (ARRAY['active'::text, 'completed'::text, 'archived'::text, 'deleted'::text]));
alter table "public"."challenges" add constraint "challenges_visibility_check" CHECK (visibility = ANY (ARRAY['private'::text, 'community'::text]));
CREATE INDEX idx_challenges_created_by ON public.challenges USING btree (created_by);
CREATE INDEX idx_challenges_is_deleted ON public.challenges USING btree (is_deleted);
CREATE INDEX idx_challenges_visibility ON public.challenges USING btree (visibility);
alter table "public"."challenges" enable row level security;
alter table "public"."profiles" add constraint "profiles_email_key" UNIQUE (email);
alter table "public"."profiles" add constraint "profiles_pkey" PRIMARY KEY (id);
alter table "public"."profiles" add constraint "profiles_username_key" UNIQUE (username);
alter table "public"."program_sessions" add constraint "program_sessions_pkey" PRIMARY KEY (id);
alter table "public"."training_program_completions" add constraint "training_program_completions_pkey" PRIMARY KEY (id);
alter table "public"."training_program_completions" add constraint "training_program_completions_user_program_session_key" UNIQUE (user_id, program_id, program_session_id);
CREATE UNIQUE INDEX training_program_completions_unique_user_program_session ON public.training_program_completions USING btree (user_id, program_id, program_session_id);
alter table "public"."training_program_completions" enable row level security;
alter table "public"."training_program_sessions" add constraint "training_program_sessions_pkey" PRIMARY KEY (id);
alter table "public"."training_program_sessions" enable row level security;
alter table "public"."training_programs" add constraint "training_programs_copies_not_shared" CHECK (copied_from_program_id IS NULL OR visibility <> 'shared'::text);
alter table "public"."training_programs" add constraint "training_programs_pkey" PRIMARY KEY (id);
alter table "public"."training_programs" add constraint "training_programs_visibility_check" CHECK (visibility = ANY (ARRAY['private'::text, 'shared'::text, 'public'::text]));
CREATE UNIQUE INDEX training_programs_invite_code_key ON public.training_programs USING btree (invite_code) WHERE (invite_code IS NOT NULL);
alter table "public"."training_programs" enable row level security;
alter table "public"."activities" add constraint "activities_challenge_id_fkey" FOREIGN KEY (challenge_id) REFERENCES public.challenges(id);
alter table "public"."activities" add constraint "activities_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table "public"."challenge_members" add constraint "challenge_members_challenge_id_fkey" FOREIGN KEY (challenge_id) REFERENCES public.challenges(id);
alter table "public"."challenge_participants" add constraint "challenge_participants_challenge_id_fkey" FOREIGN KEY (challenge_id) REFERENCES public.challenges(id) ON DELETE CASCADE;
alter table "public"."challenge_participants" add constraint "challenge_participants_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table "public"."challenges" add constraint "challenges_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table "public"."profiles" add constraint "profiles_id_fkey" FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table "public"."program_sessions" add constraint "program_sessions_challenge_id_fkey" FOREIGN KEY (challenge_id) REFERENCES public.challenges(id);
alter table "public"."training_program_completions" add constraint "training_program_completions_program_id_fkey" FOREIGN KEY (program_id) REFERENCES public.training_programs(id) ON DELETE CASCADE;
alter table "public"."training_program_completions" add constraint "training_program_completions_program_session_id_fkey" FOREIGN KEY (program_session_id) REFERENCES public.training_program_sessions(id) ON DELETE CASCADE;
alter table "public"."training_program_completions" add constraint "training_program_completions_session_id_fkey" FOREIGN KEY (session_id) REFERENCES public.training_sessions(id) ON DELETE SET NULL;
alter table "public"."training_program_completions" add constraint "training_program_completions_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table "public"."training_program_completions" add constraint "training_program_completions_workout_history_id_fkey" FOREIGN KEY (workout_history_id) REFERENCES public.workout_sessions_history(id) ON DELETE SET NULL;
alter table "public"."training_program_sessions" add constraint "training_program_sessions_program_id_fkey" FOREIGN KEY (program_id) REFERENCES public.training_programs(id) ON DELETE CASCADE;
alter table "public"."training_program_sessions" add constraint "training_program_sessions_session_id_fkey" FOREIGN KEY (session_id) REFERENCES public.training_sessions(id) ON DELETE SET NULL;
alter table "public"."training_program_sessions" add constraint "training_program_sessions_workout_id_fkey" FOREIGN KEY (workout_id) REFERENCES public.training_sessions(id) ON DELETE SET NULL;
alter table "public"."training_programs" add constraint "training_programs_copied_from_program_id_fkey" FOREIGN KEY (copied_from_program_id) REFERENCES public.training_programs(id) ON DELETE SET NULL;
alter table "public"."training_programs" add constraint "training_programs_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
grant all on all tables in schema public to anon, authenticated, service_role;
grant update (total_xp, level), insert (total_xp, level) on public.profiles to anon, authenticated;
create policy "allow all activities" on public.activities for all to authenticated using (true) with check (true);
create policy "Activities are viewable by authenticated users" on public.activities for select to authenticated using (true);
create policy "allow all challenges" on public.challenges for all to authenticated using (true) with check (true);
create policy "secure update challenge" on public.challenges for update to authenticated using (created_by = auth.uid());
create policy "allow all members" on public.challenge_members for all to authenticated using (true) with check (true);
create policy "Participants are viewable by authenticated users" on public.challenge_participants for select to authenticated using (true);
create policy "shared programs are readable" on public.training_programs for select to public using (visibility = 'shared');
create policy "shared program sessions are readable" on public.training_program_sessions for select to public using (true);
