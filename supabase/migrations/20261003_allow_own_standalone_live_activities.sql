begin;

-- Additional permissive policy; existing challenge policies are unchanged.
drop policy if exists "Users can create own standalone live activities" on public.activities;
create policy "Users can create own standalone live activities"
  on public.activities for insert
  to authenticated
  with check (
    auth.uid() = user_id
    and challenge_id is null
    and source = 'live'
  );

commit;
