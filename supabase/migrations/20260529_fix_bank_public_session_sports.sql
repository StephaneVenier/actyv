update public.training_sessions
set sport = 'Renforcement'
where visibility = 'public'
  and name = 'Renfo coureur — 35 min';

update public.training_sessions
set sport = 'HIIT'
where visibility = 'public'
  and name = 'HIIT express — 20 min';

update public.training_sessions
set sport = 'Mobilité'
where visibility = 'public'
  and name = 'Mobilité récupération — 15 min';

update public.training_sessions
set sport = 'Fitness'
where visibility = 'public'
  and name = 'Full body salle — 45 min';

update public.training_sessions
set sport = 'Renforcement'
where visibility = 'public'
  and name = 'Gainage & stabilité — 25 min';

update public.training_sessions
set sport = 'Renforcement'
where visibility = 'public'
  and name = 'Renforcement trail jambes & tronc';

notify pgrst, 'reload schema';
