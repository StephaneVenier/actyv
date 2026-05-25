alter table public.training_programs
add column if not exists copied_from_program_id uuid references public.training_programs(id) on delete set null;

alter table public.training_programs
drop constraint if exists training_programs_copies_not_shared;

alter table public.training_programs
add constraint training_programs_copies_not_shared
check (copied_from_program_id is null or visibility <> 'shared');
