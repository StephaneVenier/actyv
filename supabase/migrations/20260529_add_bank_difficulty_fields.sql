alter table public.training_sessions
add column if not exists difficulty text;

alter table public.training_programs
add column if not exists difficulty text;

update public.training_sessions
set difficulty = 'Débutant'
where visibility = 'public'
  and name = 'Mobilité récupération — 15 min';

update public.training_sessions
set difficulty = 'Intermédiaire'
where visibility = 'public'
  and name in (
    'HIIT express — 20 min',
    'Renfo coureur — 35 min',
    'Gainage & stabilité — 25 min',
    'Full body salle — 45 min',
    'Renforcement trail jambes & tronc'
  );

update public.training_programs
set difficulty = 'Débutant'
where visibility = 'public'
  and name in (
    'Reprise sport — 4 semaines',
    'Objectif régularité — 3 semaines'
  );

update public.training_programs
set difficulty = 'Intermédiaire'
where visibility = 'public'
  and name = 'Renfo coureur — 6 semaines';

notify pgrst, 'reload schema';
