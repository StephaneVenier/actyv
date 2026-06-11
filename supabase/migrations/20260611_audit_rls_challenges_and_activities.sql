alter table if exists public.challenges enable row level security;
alter table if exists public.challenge_participants enable row level security;
alter table if exists public.challenge_members enable row level security;
alter table if exists public.activities enable row level security;
alter table if exists public.activity_interactions enable row level security;

drop policy if exists "Users can read visible challenges" on public.challenges;
create policy "Users can read visible challenges"
  on public.challenges for select
  to anon, authenticated
  using (
    coalesce(is_deleted, false) = false
    and (
      visibility = 'public'
      or created_by = auth.uid()
      or exists (
        select 1
        from public.challenge_participants
        where challenge_participants.challenge_id = challenges.id
          and challenge_participants.user_id = auth.uid()
      )
      or exists (
        select 1
        from public.challenge_members
        where challenge_members.challenge_id = challenges.id
          and lower(coalesce(challenge_members.user_email, '')) = lower(coalesce(auth.jwt() ->> 'email', ''))
      )
    )
  );

drop policy if exists "Users can create own challenges" on public.challenges;
create policy "Users can create own challenges"
  on public.challenges for insert
  to authenticated
  with check (created_by = auth.uid());

drop policy if exists "Users can update own challenges" on public.challenges;
create policy "Users can update own challenges"
  on public.challenges for update
  to authenticated
  using (created_by = auth.uid())
  with check (created_by = auth.uid());

drop policy if exists "Users can delete own challenges" on public.challenges;
create policy "Users can delete own challenges"
  on public.challenges for delete
  to authenticated
  using (created_by = auth.uid());

drop policy if exists "Users can read own challenge participants" on public.challenge_participants;
create policy "Users can read own challenge participants"
  on public.challenge_participants for select
  to anon, authenticated
  using (
    user_id = auth.uid()
    or exists (
      select 1
      from public.challenges
      where challenges.id = challenge_participants.challenge_id
        and coalesce(challenges.is_deleted, false) = false
        and (
          challenges.visibility = 'public'
          or challenges.created_by = auth.uid()
        )
    )
  );

drop policy if exists "Users can join challenge as participant" on public.challenge_participants;
create policy "Users can join challenge as participant"
  on public.challenge_participants for insert
  to authenticated
  with check (
    auth.uid() = user_id
    and exists (
      select 1
      from public.challenges
      where challenges.id = challenge_participants.challenge_id
        and coalesce(challenges.is_deleted, false) = false
        and (
          challenges.visibility = 'public'
          or challenges.created_by = auth.uid()
          or exists (
            select 1
            from public.challenge_members
            where challenge_members.challenge_id = challenge_participants.challenge_id
              and lower(coalesce(challenge_members.user_email, '')) = lower(coalesce(auth.jwt() ->> 'email', ''))
          )
        )
    )
  );

drop policy if exists "Challenge creators can read participants" on public.challenge_participants;
create policy "Challenge creators can read participants"
  on public.challenge_participants for select
  to authenticated
  using (
    exists (
      select 1
      from public.challenges
      where challenges.id = challenge_participants.challenge_id
        and challenges.created_by = auth.uid()
    )
  );

drop policy if exists "Users can leave own challenge participation" on public.challenge_participants;
create policy "Users can leave own challenge participation"
  on public.challenge_participants for delete
  to authenticated
  using (
    user_id = auth.uid()
    or exists (
      select 1
      from public.challenges
      where challenges.id = challenge_participants.challenge_id
        and challenges.created_by = auth.uid()
    )
  );

drop policy if exists "Users can read visible challenge members" on public.challenge_members;
create policy "Users can read visible challenge members"
  on public.challenge_members for select
  to anon, authenticated
  using (
    exists (
      select 1
      from public.challenges
      where challenges.id = challenge_members.challenge_id
        and coalesce(challenges.is_deleted, false) = false
        and (
          challenges.visibility = 'public'
          or challenges.created_by = auth.uid()
          or lower(coalesce(challenge_members.user_email, '')) = lower(coalesce(auth.jwt() ->> 'email', ''))
        )
    )
  );

drop policy if exists "Challenge creators can manage members" on public.challenge_members;
create policy "Challenge creators can manage members"
  on public.challenge_members for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.challenges
      where challenges.id = challenge_members.challenge_id
        and challenges.created_by = auth.uid()
    )
  );

drop policy if exists "Challenge creators can update members" on public.challenge_members;
create policy "Challenge creators can update members"
  on public.challenge_members for update
  to authenticated
  using (
    exists (
      select 1
      from public.challenges
      where challenges.id = challenge_members.challenge_id
        and challenges.created_by = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.challenges
      where challenges.id = challenge_members.challenge_id
        and challenges.created_by = auth.uid()
    )
  );

drop policy if exists "Challenge creators can delete members" on public.challenge_members;
create policy "Challenge creators can delete members"
  on public.challenge_members for delete
  to authenticated
  using (
    exists (
      select 1
      from public.challenges
      where challenges.id = challenge_members.challenge_id
        and challenges.created_by = auth.uid()
    )
  );

drop policy if exists "Users can read visible activities" on public.activities;
create policy "Users can read visible activities"
  on public.activities for select
  to anon, authenticated
  using (
    user_id = auth.uid()
    or lower(coalesce(user_email, '')) = lower(coalesce(auth.jwt() ->> 'email', ''))
    or exists (
      select 1
      from public.challenges
      where challenges.id = activities.challenge_id
        and coalesce(challenges.is_deleted, false) = false
        and (
          challenges.visibility = 'public'
          or challenges.created_by = auth.uid()
          or exists (
            select 1
            from public.challenge_participants
            where challenge_participants.challenge_id = challenges.id
              and challenge_participants.user_id = auth.uid()
          )
          or exists (
            select 1
            from public.challenge_members
            where challenge_members.challenge_id = challenges.id
              and lower(coalesce(challenge_members.user_email, '')) = lower(coalesce(auth.jwt() ->> 'email', ''))
          )
        )
    )
  );

drop policy if exists "Users can create own activities" on public.activities;
create policy "Users can create own activities"
  on public.activities for insert
  to authenticated
  with check (
    (
      user_id = auth.uid()
      or lower(coalesce(user_email, '')) = lower(coalesce(auth.jwt() ->> 'email', ''))
    )
    and exists (
      select 1
      from public.challenges
      where challenges.id = activities.challenge_id
        and coalesce(challenges.is_deleted, false) = false
        and (
          challenges.visibility = 'public'
          or challenges.created_by = auth.uid()
          or exists (
            select 1
            from public.challenge_participants
            where challenge_participants.challenge_id = challenges.id
              and challenge_participants.user_id = auth.uid()
          )
          or exists (
            select 1
            from public.challenge_members
            where challenge_members.challenge_id = challenges.id
              and lower(coalesce(challenge_members.user_email, '')) = lower(coalesce(auth.jwt() ->> 'email', ''))
          )
        )
    )
  );

drop policy if exists "Users can update own activities" on public.activities;
create policy "Users can update own activities"
  on public.activities for update
  to authenticated
  using (
    user_id = auth.uid()
    or lower(coalesce(user_email, '')) = lower(coalesce(auth.jwt() ->> 'email', ''))
  )
  with check (
    user_id = auth.uid()
    or lower(coalesce(user_email, '')) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );

drop policy if exists "Users can delete own activities" on public.activities;
create policy "Users can delete own activities"
  on public.activities for delete
  to authenticated
  using (
    user_id = auth.uid()
    or lower(coalesce(user_email, '')) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );

drop policy if exists "Users can read visible activity interactions" on public.activity_interactions;
create policy "Users can read visible activity interactions"
  on public.activity_interactions for select
  to anon, authenticated
  using (
    exists (
      select 1
      from public.activities
      where activities.id = activity_interactions.activity_id
    )
  );

drop policy if exists "Users can create own activity interactions" on public.activity_interactions;
create policy "Users can create own activity interactions"
  on public.activity_interactions for insert
  to authenticated
  with check (
    auth.uid() = user_id
    and exists (
      select 1
      from public.activities
      where activities.id = activity_interactions.activity_id
    )
  );

drop policy if exists "Users can delete own activity interactions" on public.activity_interactions;
create policy "Users can delete own activity interactions"
  on public.activity_interactions for delete
  to authenticated
  using (auth.uid() = user_id);

grant select on public.challenges to anon;
grant select on public.challenge_participants to anon;
grant select on public.challenge_members to anon;
grant select on public.activities to anon;
grant select on public.activity_interactions to anon;

grant select, insert, update, delete on public.challenges to authenticated;
grant select, insert, delete on public.challenge_participants to authenticated;
grant select, insert, update, delete on public.challenge_members to authenticated;
grant select, insert, update, delete on public.activities to authenticated;
grant select, insert, delete on public.activity_interactions to authenticated;

notify pgrst, 'reload schema';
