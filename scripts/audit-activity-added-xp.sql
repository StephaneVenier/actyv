-- READ ONLY: run in the Supabase SQL editor to confirm the deployed XP wiring.
select t.tgname, t.tgenabled, pg_catalog.pg_get_triggerdef(t.oid) as definition,
       pg_catalog.pg_get_functiondef(t.tgfoid) as function_definition
from pg_catalog.pg_trigger t
where t.tgrelid in ('public.activities'::regclass, 'public.xp_events'::regclass)
  and not t.tgisinternal
order by t.tgrelid, t.tgname;

select indexname, indexdef
from pg_catalog.pg_indexes
where schemaname = 'public' and tablename = 'xp_events';
