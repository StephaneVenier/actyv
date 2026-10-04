begin;

-- INSERT ... RETURNING evaluates SELECT RLS before the stable lookup helper
-- can see the new row. Check ownership directly on that row as well.
drop policy if exists v1a_challenges_read on public.challenges;
create policy v1a_challenges_read on public.challenges
  for select to anon, authenticated
  using (
    (auth.uid() is not null and created_by = auth.uid()
      and not coalesce(is_deleted, false))
    or public.v1a_can_read_challenge(id)
  );

commit;
