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
          and (
            challenge_members.user_id = auth.uid()
            or lower(coalesce(challenge_members.user_email, '')) = lower(coalesce(auth.jwt() ->> 'email', ''))
          )
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
              and (
                challenge_members.user_id = auth.uid()
                or lower(coalesce(challenge_members.user_email, '')) = lower(coalesce(auth.jwt() ->> 'email', ''))
              )
          )
        )
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
          or challenge_members.user_id = auth.uid()
          or lower(coalesce(challenge_members.user_email, '')) = lower(coalesce(auth.jwt() ->> 'email', ''))
        )
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
              and (
                challenge_members.user_id = auth.uid()
                or lower(coalesce(challenge_members.user_email, '')) = lower(coalesce(auth.jwt() ->> 'email', ''))
              )
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
              and (
                challenge_members.user_id = auth.uid()
                or lower(coalesce(challenge_members.user_email, '')) = lower(coalesce(auth.jwt() ->> 'email', ''))
              )
          )
        )
    )
  );

notify pgrst, 'reload schema';
