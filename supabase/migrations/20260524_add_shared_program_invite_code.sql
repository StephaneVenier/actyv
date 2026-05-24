alter table public.training_programs
add column if not exists visibility text not null default 'private';

alter table public.training_programs
add column if not exists invite_code text;

alter table public.training_programs
alter column visibility set default 'private';

alter table public.training_programs
drop constraint if exists training_programs_visibility_check;

alter table public.training_programs
add constraint training_programs_visibility_check
check (visibility in ('private', 'shared'));

create unique index if not exists training_programs_invite_code_uidx
on public.training_programs (invite_code)
where invite_code is not null;

alter table if exists public.training_programs enable row level security;
alter table if exists public.training_program_sessions enable row level security;

drop policy if exists "Users can read own training programs" on public.training_programs;
create policy "Users can read own training programs"
  on public.training_programs for select
  using (
    auth.uid() = user_id
    or (visibility = 'shared' and invite_code is not null)
  );

drop policy if exists "Users can insert own training programs" on public.training_programs;
create policy "Users can insert own training programs"
  on public.training_programs for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can update own training programs" on public.training_programs;
create policy "Users can update own training programs"
  on public.training_programs for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users can delete own training programs" on public.training_programs;
create policy "Users can delete own training programs"
  on public.training_programs for delete
  using (auth.uid() = user_id);

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
          or (training_programs.visibility = 'shared' and training_programs.invite_code is not null)
        )
    )
  );

drop policy if exists "Users can insert own training program sessions" on public.training_program_sessions;
create policy "Users can insert own training program sessions"
  on public.training_program_sessions for insert
  with check (
    exists (
      select 1
      from public.training_programs
      where training_programs.id = training_program_sessions.program_id
        and training_programs.user_id = auth.uid()
    )
  );

drop policy if exists "Users can update own training program sessions" on public.training_program_sessions;
create policy "Users can update own training program sessions"
  on public.training_program_sessions for update
  using (
    exists (
      select 1
      from public.training_programs
      where training_programs.id = training_program_sessions.program_id
        and training_programs.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.training_programs
      where training_programs.id = training_program_sessions.program_id
        and training_programs.user_id = auth.uid()
    )
  );

drop policy if exists "Users can delete own training program sessions" on public.training_program_sessions;
create policy "Users can delete own training program sessions"
  on public.training_program_sessions for delete
  using (
    exists (
      select 1
      from public.training_programs
      where training_programs.id = training_program_sessions.program_id
        and training_programs.user_id = auth.uid()
    )
  );

grant select, insert, update, delete on public.training_programs to authenticated;
grant select, insert, update, delete on public.training_program_sessions to authenticated;
grant select on public.training_programs to anon;
grant select on public.training_program_sessions to anon;
