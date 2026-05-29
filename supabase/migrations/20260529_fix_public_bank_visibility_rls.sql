alter table if exists public.training_sessions enable row level security;
alter table if exists public.training_session_blocks enable row level security;
alter table if exists public.training_programs enable row level security;
alter table if exists public.training_program_sessions enable row level security;

drop policy if exists "Users can read own training sessions" on public.training_sessions;
create policy "Users can read own training sessions"
  on public.training_sessions for select
  to authenticated
  using (
    auth.uid() = user_id
    or visibility = 'public'
  );

drop policy if exists "Users can read own training session blocks" on public.training_session_blocks;
create policy "Users can read own training session blocks"
  on public.training_session_blocks for select
  to authenticated
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

drop policy if exists "Users can read own training programs" on public.training_programs;
create policy "Users can read own training programs"
  on public.training_programs for select
  to authenticated
  using (
    auth.uid() = user_id
    or visibility = 'public'
    or (visibility = 'shared' and invite_code is not null)
  );

drop policy if exists "Users can read own training program sessions" on public.training_program_sessions;
create policy "Users can read own training program sessions"
  on public.training_program_sessions for select
  to authenticated
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

notify pgrst, 'reload schema';
