create or replace function public.ensure_daily_session_for_date(p_scheduled_for date default current_date)
returns public.daily_sessions
language plpgsql
security definer
set search_path = public
as $$
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
$$;

grant execute on function public.ensure_daily_session_for_date(date) to anon, authenticated;

notify pgrst, 'reload schema';
