alter table if exists public.training_sessions
  add column if not exists visibility text not null default 'private';

alter table if exists public.training_sessions
  add column if not exists copied_from_session_id uuid references public.training_sessions(id) on delete set null;

alter table if exists public.training_sessions
  alter column visibility set default 'private';

alter table if exists public.training_sessions
  drop constraint if exists training_sessions_visibility_check;

alter table if exists public.training_sessions
  add constraint training_sessions_visibility_check
  check (visibility in ('private', 'public'));

drop policy if exists "Users can read own training sessions" on public.training_sessions;
create policy "Users can read own training sessions"
  on public.training_sessions for select
  using (auth.uid() = user_id or visibility = 'public');

drop policy if exists "Users can read own training session blocks" on public.training_session_blocks;
create policy "Users can read own training session blocks"
  on public.training_session_blocks for select
  using (
    exists (
      select 1
      from public.training_sessions
      where training_sessions.id = training_session_blocks.session_id
        and (
          training_sessions.user_id = auth.uid()
          or training_sessions.visibility = 'public'
        )
    )
  );

grant select on public.training_sessions to anon;
grant select on public.training_session_blocks to anon;

alter table if exists public.training_programs
  drop constraint if exists training_programs_visibility_check;

alter table if exists public.training_programs
  add constraint training_programs_visibility_check
  check (visibility in ('private', 'shared', 'public'));

drop policy if exists "Users can read own training programs" on public.training_programs;
create policy "Users can read own training programs"
  on public.training_programs for select
  using (
    auth.uid() = user_id
    or visibility = 'public'
    or (visibility = 'shared' and invite_code is not null)
  );

drop policy if exists "Users can read own training program sessions" on public.training_program_sessions;
create policy "Users can read own training program sessions"
  on public.training_program_sessions for select
  using (
    exists (
      select 1
      from public.training_programs
      where training_programs.id = training_program_sessions.program_id
        and (
          training_programs.user_id = auth.uid()
          or training_programs.visibility = 'public'
          or (training_programs.visibility = 'shared' and training_programs.invite_code is not null)
        )
    )
  );

grant select on public.training_programs to anon;
grant select on public.training_program_sessions to anon;

notify pgrst, 'reload schema';
