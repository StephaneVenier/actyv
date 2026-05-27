update public.training_sessions
set name = 'Renfo coureur — 35 min'
where visibility = 'public'
  and name = 'Renfo coureur - 35 min';

update public.training_sessions
set name = 'HIIT express — 20 min'
where visibility = 'public'
  and name = 'HIIT express - 20 min';

update public.training_sessions
set name = 'Mobilité récupération — 15 min'
where visibility = 'public'
  and name = 'Mobilite recuperation - 15 min';

update public.training_sessions
set name = 'Full body salle — 45 min'
where visibility = 'public'
  and name = 'Full body salle - 45 min';

update public.training_sessions
set name = 'Gainage & stabilité — 25 min'
where visibility = 'public'
  and name = 'Gainage & stabilite - 25 min';

update public.training_program_sessions
set session_name = 'Renfo coureur — 35 min'
where session_name = 'Renfo coureur - 35 min';

update public.training_program_sessions
set session_name = 'HIIT express — 20 min'
where session_name = 'HIIT express - 20 min';

update public.training_program_sessions
set session_name = 'Mobilité récupération — 15 min'
where session_name = 'Mobilite recuperation - 15 min';

update public.training_program_sessions
set session_name = 'Full body salle — 45 min'
where session_name = 'Full body salle - 45 min';

update public.training_program_sessions
set session_name = 'Gainage & stabilité — 25 min'
where session_name = 'Gainage & stabilite - 25 min';

notify pgrst, 'reload schema';
