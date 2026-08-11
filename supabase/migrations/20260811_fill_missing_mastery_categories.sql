begin;

with category_seed(slug, name, sort_order) as (
  values
    ('fitness', 'Fitness', 1),
    ('musculation', 'Musculation', 2),
    ('course-a-pied', 'Course à pied', 3),
    ('trail', 'Trail', 4),
    ('marche', 'Marche', 5),
    ('velo', 'Vélo', 6),
    ('vtt', 'VTT', 7),
    ('natation', 'Natation', 8),
    ('cardio-indoor', 'Cardio indoor', 9),
    ('mobilite-souplesse', 'Mobilité & souplesse', 10),
    ('ski-alpin', 'Ski alpin', 11),
    ('ski-randonnee', 'Ski de randonnée', 12),
    ('ski-de-fond', 'Ski de fond', 13),
    ('raquettes', 'Raquettes', 14),
    ('escalade', 'Escalade', 15),
    ('via-ferrata', 'Via ferrata', 16),
    ('alpinisme', 'Alpinisme', 17),
    ('course-orientation', 'Course d’orientation', 18),
    ('gravel', 'Gravel', 19),
    ('home-trainer', 'Home trainer / vélo indoor', 20),
    ('football', 'Football', 21),
    ('rugby', 'Rugby', 22),
    ('basketball', 'Basketball', 23),
    ('handball', 'Handball', 24),
    ('volleyball', 'Volleyball', 25),
    ('tennis', 'Tennis', 26),
    ('padel', 'Padel', 27),
    ('badminton', 'Badminton', 28),
    ('tennis-de-table', 'Tennis de table', 29),
    ('boxe', 'Boxe', 30),
    ('sports-de-combat', 'Sports de combat', 31),
    ('danse', 'Danse', 32),
    ('kayak-canoe', 'Kayak / Canoë', 33),
    ('aviron', 'Aviron', 34),
    ('paddle', 'Paddle', 35),
    ('surf', 'Surf', 36),
    ('roller-patinage', 'Roller / Patinage', 37),
    ('triathlon', 'Triathlon', 38),
    ('hyrox-cross-training', 'HYROX / Cross-training', 39)
)
insert into public.mastery_categories (slug, name, sort_order, active)
select slug, name, sort_order, true
from category_seed
on conflict (slug) do update
set
  name = excluded.name,
  sort_order = excluded.sort_order,
  active = true;

with mastery_seed(slug, name, category_slug, measurement_type, unit, level_family, sort_order) as (
  values
    ('distance-vtt', 'Distance VTT', 'vtt', 'distance', 'km', 'distance-trail', 1),
    ('dplus-vtt', 'D+ VTT', 'vtt', 'elevation', 'm', 'elevation-trail', 2),
    ('duree-vtt', 'Durée VTT', 'vtt', 'duration', 'minutes', 'duration-activity', 3),
    ('sorties-vtt', 'Sorties VTT', 'vtt', 'count', 'sorties', 'count-sessions', 4),
    ('rameur', 'Rameur', 'cardio-indoor', 'distance', 'km', 'distance-outdoor-medium', 1),
    ('air-bike', 'Air bike', 'cardio-indoor', 'duration', 'minutes', 'duration-activity', 2),
    ('course-tapis', 'Course tapis', 'cardio-indoor', 'distance', 'km', 'distance-run', 3),
    ('velo-elliptique', 'Vélo elliptique', 'cardio-indoor', 'duration', 'minutes', 'duration-activity', 4),
    ('ski-erg', 'Ski erg', 'cardio-indoor', 'distance', 'km', 'distance-outdoor-medium', 5),
    ('mobilite-dynamique', 'Mobilité dynamique', 'mobilite-souplesse', 'duration', 'minutes', 'duration-activity', 1),
    ('cercles-epaules', 'Cercles d’épaules', 'mobilite-souplesse', 'duration', 'minutes', 'duration-activity', 2),
    ('rotation-buste', 'Rotation du buste', 'mobilite-souplesse', 'duration', 'minutes', 'duration-activity', 3),
    ('rotation-thoracique', 'Rotation thoracique', 'mobilite-souplesse', 'duration', 'minutes', 'duration-activity', 4),
    ('etirement-ischios', 'Étirement ischios', 'mobilite-souplesse', 'duration', 'minutes', 'duration-activity', 5),
    ('ouverture-hanches', 'Ouverture de hanches', 'mobilite-souplesse', 'duration', 'minutes', 'duration-activity', 6),
    ('respiration-calme', 'Respiration calme', 'mobilite-souplesse', 'duration', 'minutes', 'duration-activity', 7),
    ('respiration-diaphragmatique', 'Respiration diaphragmatique', 'mobilite-souplesse', 'duration', 'minutes', 'duration-activity', 8),
    ('ouverture-thoracique', 'Ouverture thoracique', 'mobilite-souplesse', 'duration', 'minutes', 'duration-activity', 9),
    ('etirement-chaine-posterieure', 'Étirement chaîne postérieure', 'mobilite-souplesse', 'duration', 'minutes', 'duration-activity', 10),
    ('etirements-doux', 'Étirements doux', 'mobilite-souplesse', 'duration', 'minutes', 'duration-activity', 11),
    ('retour-calme-assis', 'Retour calme assis', 'mobilite-souplesse', 'duration', 'minutes', 'duration-activity', 12),
    ('duree-ski-alpin', 'Durée Ski alpin', 'ski-alpin', 'duration', 'minutes', 'duration-activity', 1),
    ('sorties-ski-alpin', 'Sorties Ski alpin', 'ski-alpin', 'count', 'sorties', 'count-sessions', 2),
    ('distance-ski-randonnee', 'Distance Ski de randonnée', 'ski-randonnee', 'distance', 'km', 'distance-trail', 1),
    ('dplus-ski-randonnee', 'D+ Ski de randonnée', 'ski-randonnee', 'elevation', 'm', 'elevation-trail', 2),
    ('duree-ski-randonnee', 'Durée Ski de randonnée', 'ski-randonnee', 'duration', 'minutes', 'duration-activity', 3),
    ('sorties-ski-randonnee', 'Sorties Ski de randonnée', 'ski-randonnee', 'count', 'sorties', 'count-sessions', 4),
    ('sorties-ski-randonnee-1000dplus', 'Sorties Ski de randonnée 1000 m D+', 'ski-randonnee', 'count', 'sorties', 'count-events', 5),
    ('distance-ski-fond', 'Distance Ski de fond', 'ski-de-fond', 'distance', 'km', 'distance-trail', 1),
    ('duree-ski-fond', 'Durée Ski de fond', 'ski-de-fond', 'duration', 'minutes', 'duration-activity', 2),
    ('sorties-ski-fond', 'Sorties Ski de fond', 'ski-de-fond', 'count', 'sorties', 'count-sessions', 3),
    ('distance-raquettes', 'Distance Raquettes', 'raquettes', 'distance', 'km', 'distance-walk', 1),
    ('dplus-raquettes', 'D+ Raquettes', 'raquettes', 'elevation', 'm', 'elevation-walk', 2),
    ('sorties-raquettes', 'Sorties Raquettes', 'raquettes', 'count', 'sorties', 'count-sessions', 3),
    ('duree-escalade', 'Durée Escalade', 'escalade', 'duration', 'minutes', 'duration-activity', 1),
    ('seances-escalade', 'Séances Escalade', 'escalade', 'count', 'seances', 'count-sessions', 2),
    ('voies-realisees', 'Voies réalisées', 'escalade', 'count', 'voies', 'count-events', 3),
    ('blocs-realises', 'Blocs réalisés', 'escalade', 'count', 'blocs', 'count-events', 4),
    ('duree-via-ferrata', 'Durée Via ferrata', 'via-ferrata', 'duration', 'minutes', 'duration-activity', 1),
    ('sorties-via-ferrata', 'Sorties Via ferrata', 'via-ferrata', 'count', 'sorties', 'count-sessions', 2),
    ('dplus-via-ferrata', 'D+ Via ferrata', 'via-ferrata', 'elevation', 'm', 'elevation-walk', 3),
    ('dplus-alpinisme', 'D+ Alpinisme', 'alpinisme', 'elevation', 'm', 'elevation-trail', 1),
    ('duree-alpinisme', 'Durée Alpinisme', 'alpinisme', 'duration', 'minutes', 'duration-activity', 2),
    ('sorties-alpinisme', 'Sorties Alpinisme', 'alpinisme', 'count', 'sorties', 'count-sessions', 3),
    ('distance-course-orientation', 'Distance Course d’orientation', 'course-orientation', 'distance', 'km', 'distance-run', 1),
    ('duree-course-orientation', 'Durée Course d’orientation', 'course-orientation', 'duration', 'minutes', 'duration-activity', 2),
    ('sorties-course-orientation', 'Sorties Course d’orientation', 'course-orientation', 'count', 'sorties', 'count-sessions', 3),
    ('distance-gravel', 'Distance Gravel', 'gravel', 'distance', 'km', 'distance-cycle', 1),
    ('dplus-gravel', 'D+ Gravel', 'gravel', 'elevation', 'm', 'elevation-cycle', 2),
    ('sorties-gravel', 'Sorties Gravel', 'gravel', 'count', 'sorties', 'count-sessions', 3),
    ('duree-home-trainer', 'Durée Home trainer', 'home-trainer', 'duration', 'minutes', 'duration-activity', 1),
    ('distance-home-trainer', 'Distance Home trainer', 'home-trainer', 'distance', 'km', 'distance-cycle', 2),
    ('seances-home-trainer', 'Séances Home trainer', 'home-trainer', 'count', 'seances', 'count-sessions', 3),
    ('duree-football', 'Durée Football', 'football', 'duration', 'minutes', 'duration-activity', 1),
    ('matchs-football', 'Matchs Football', 'football', 'count', 'matchs', 'count-events', 2),
    ('seances-football', 'Séances Football', 'football', 'count', 'seances', 'count-sessions', 3),
    ('duree-rugby', 'Durée Rugby', 'rugby', 'duration', 'minutes', 'duration-activity', 1),
    ('matchs-rugby', 'Matchs Rugby', 'rugby', 'count', 'matchs', 'count-events', 2),
    ('seances-rugby', 'Séances Rugby', 'rugby', 'count', 'seances', 'count-sessions', 3),
    ('duree-basketball', 'Durée Basketball', 'basketball', 'duration', 'minutes', 'duration-activity', 1),
    ('matchs-basketball', 'Matchs Basketball', 'basketball', 'count', 'matchs', 'count-events', 2),
    ('seances-basketball', 'Séances Basketball', 'basketball', 'count', 'seances', 'count-sessions', 3),
    ('duree-handball', 'Durée Handball', 'handball', 'duration', 'minutes', 'duration-activity', 1),
    ('matchs-handball', 'Matchs Handball', 'handball', 'count', 'matchs', 'count-events', 2),
    ('seances-handball', 'Séances Handball', 'handball', 'count', 'seances', 'count-sessions', 3),
    ('duree-volleyball', 'Durée Volleyball', 'volleyball', 'duration', 'minutes', 'duration-activity', 1),
    ('matchs-volleyball', 'Matchs Volleyball', 'volleyball', 'count', 'matchs', 'count-events', 2),
    ('seances-volleyball', 'Séances Volleyball', 'volleyball', 'count', 'seances', 'count-sessions', 3),
    ('duree-tennis', 'Durée Tennis', 'tennis', 'duration', 'minutes', 'duration-activity', 1),
    ('matchs-tennis', 'Matchs Tennis', 'tennis', 'count', 'matchs', 'count-events', 2),
    ('seances-tennis', 'Séances Tennis', 'tennis', 'count', 'seances', 'count-sessions', 3),
    ('duree-padel', 'Durée Padel', 'padel', 'duration', 'minutes', 'duration-activity', 1),
    ('matchs-padel', 'Matchs Padel', 'padel', 'count', 'matchs', 'count-events', 2),
    ('seances-padel', 'Séances Padel', 'padel', 'count', 'seances', 'count-sessions', 3),
    ('duree-badminton', 'Durée Badminton', 'badminton', 'duration', 'minutes', 'duration-activity', 1),
    ('matchs-badminton', 'Matchs Badminton', 'badminton', 'count', 'matchs', 'count-events', 2),
    ('seances-badminton', 'Séances Badminton', 'badminton', 'count', 'seances', 'count-sessions', 3),
    ('duree-tennis-de-table', 'Durée Tennis de table', 'tennis-de-table', 'duration', 'minutes', 'duration-activity', 1),
    ('matchs-tennis-de-table', 'Matchs Tennis de table', 'tennis-de-table', 'count', 'matchs', 'count-events', 2),
    ('seances-tennis-de-table', 'Séances Tennis de table', 'tennis-de-table', 'count', 'seances', 'count-sessions', 3),
    ('duree-boxe', 'Durée Boxe', 'boxe', 'duration', 'minutes', 'duration-activity', 1),
    ('seances-boxe', 'Séances Boxe', 'boxe', 'count', 'seances', 'count-sessions', 2),
    ('rounds-boxe', 'Rounds Boxe', 'boxe', 'count', 'rounds', 'count-events', 3),
    ('combats-boxe', 'Combats Boxe', 'boxe', 'count', 'combats', 'count-events', 4),
    ('duree-sports-de-combat', 'Durée Sports de combat', 'sports-de-combat', 'duration', 'minutes', 'duration-activity', 1),
    ('seances-sports-de-combat', 'Séances Sports de combat', 'sports-de-combat', 'count', 'seances', 'count-sessions', 2),
    ('sparrings', 'Sparrings', 'sports-de-combat', 'count', 'sparrings', 'count-events', 3),
    ('combats', 'Combats', 'sports-de-combat', 'count', 'combats', 'count-events', 4),
    ('duree-danse', 'Durée Danse', 'danse', 'duration', 'minutes', 'duration-activity', 1),
    ('seances-danse', 'Séances Danse', 'danse', 'count', 'seances', 'count-sessions', 2),
    ('cours-danse', 'Cours Danse', 'danse', 'count', 'cours', 'count-events', 3),
    ('distance-kayak-canoe', 'Distance Kayak / Canoë', 'kayak-canoe', 'distance', 'km', 'distance-outdoor-medium', 1),
    ('duree-kayak-canoe', 'Durée Kayak / Canoë', 'kayak-canoe', 'duration', 'minutes', 'duration-activity', 2),
    ('sorties-kayak-canoe', 'Sorties Kayak / Canoë', 'kayak-canoe', 'count', 'sorties', 'count-sessions', 3),
    ('distance-aviron', 'Distance Aviron', 'aviron', 'distance', 'km', 'distance-outdoor-medium', 1),
    ('duree-aviron', 'Durée Aviron', 'aviron', 'duration', 'minutes', 'duration-activity', 2),
    ('sorties-aviron', 'Sorties Aviron', 'aviron', 'count', 'sorties', 'count-sessions', 3),
    ('distance-paddle', 'Distance Paddle', 'paddle', 'distance', 'km', 'distance-outdoor-medium', 1),
    ('duree-paddle', 'Durée Paddle', 'paddle', 'duration', 'minutes', 'duration-activity', 2),
    ('sorties-paddle', 'Sorties Paddle', 'paddle', 'count', 'sorties', 'count-sessions', 3),
    ('duree-surf', 'Durée Surf', 'surf', 'duration', 'minutes', 'duration-activity', 1),
    ('sorties-surf', 'Sorties Surf', 'surf', 'count', 'sorties', 'count-sessions', 2),
    ('distance-roller-patinage', 'Distance Roller / Patinage', 'roller-patinage', 'distance', 'km', 'distance-outdoor-medium', 1),
    ('duree-roller-patinage', 'Durée Roller / Patinage', 'roller-patinage', 'duration', 'minutes', 'duration-activity', 2),
    ('sorties-roller-patinage', 'Sorties Roller / Patinage', 'roller-patinage', 'count', 'sorties', 'count-sessions', 3),
    ('distance-triathlon', 'Distance Triathlon', 'triathlon', 'distance', 'km', 'distance-cycle', 1),
    ('duree-triathlon', 'Durée Triathlon', 'triathlon', 'duration', 'minutes', 'duration-activity', 2),
    ('epreuves-triathlon', 'Épreuves Triathlon', 'triathlon', 'count', 'epreuves', 'count-events', 3),
    ('thrusters', 'Thrusters', 'hyrox-cross-training', 'reps', 'repetitions', 'reps-medium', 1),
    ('kettlebell-swings', 'Kettlebell swings', 'hyrox-cross-training', 'reps', 'repetitions', 'reps-medium', 2),
    ('clean-and-press', 'Clean and press', 'hyrox-cross-training', 'reps', 'repetitions', 'reps-medium', 3),
    ('wall-balls', 'Wall balls', 'hyrox-cross-training', 'reps', 'repetitions', 'reps-medium', 4),
    ('seances-hyrox', 'Séances HYROX / Cross-training', 'hyrox-cross-training', 'count', 'seances', 'count-sessions', 5)
)
insert into public.masteries (
  slug,
  name,
  category_id,
  measurement_type,
  unit,
  description,
  active,
  sort_order
)
select
  ms.slug,
  ms.name,
  mc.id,
  ms.measurement_type,
  ms.unit,
  case ms.measurement_type
    when 'reps' then 'Répétitions cumulées sur ' || ms.name || '.'
    when 'duration' then 'Temps cumulé sur ' || ms.name || '.'
    when 'distance' then 'Distance cumulée sur ' || ms.name || '.'
    when 'elevation' then 'Dénivelé positif cumulé sur ' || ms.name || '.'
    when 'volume' then 'Volume cumulé sur ' || ms.name || ' en kg.'
    when 'count' then 'Occurrences cumulées sur ' || ms.name || '.'
    else 'Progression cumulée sur ' || ms.name || '.'
  end,
  true,
  ms.sort_order
from mastery_seed ms
join public.mastery_categories mc
  on mc.slug = ms.category_slug
on conflict (slug) do nothing;

with
mastery_seed(slug, level_family) as (
  values
    ('distance-vtt', 'distance-trail'),
    ('dplus-vtt', 'elevation-trail'),
    ('duree-vtt', 'duration-activity'),
    ('sorties-vtt', 'count-sessions'),
    ('rameur', 'distance-outdoor-medium'),
    ('air-bike', 'duration-activity'),
    ('course-tapis', 'distance-run'),
    ('velo-elliptique', 'duration-activity'),
    ('ski-erg', 'distance-outdoor-medium'),
    ('mobilite-dynamique', 'duration-activity'),
    ('cercles-epaules', 'duration-activity'),
    ('rotation-buste', 'duration-activity'),
    ('rotation-thoracique', 'duration-activity'),
    ('etirement-ischios', 'duration-activity'),
    ('ouverture-hanches', 'duration-activity'),
    ('respiration-calme', 'duration-activity'),
    ('respiration-diaphragmatique', 'duration-activity'),
    ('ouverture-thoracique', 'duration-activity'),
    ('etirement-chaine-posterieure', 'duration-activity'),
    ('etirements-doux', 'duration-activity'),
    ('retour-calme-assis', 'duration-activity'),
    ('duree-ski-alpin', 'duration-activity'),
    ('sorties-ski-alpin', 'count-sessions'),
    ('distance-ski-randonnee', 'distance-trail'),
    ('dplus-ski-randonnee', 'elevation-trail'),
    ('duree-ski-randonnee', 'duration-activity'),
    ('sorties-ski-randonnee', 'count-sessions'),
    ('sorties-ski-randonnee-1000dplus', 'count-events'),
    ('distance-ski-fond', 'distance-trail'),
    ('duree-ski-fond', 'duration-activity'),
    ('sorties-ski-fond', 'count-sessions'),
    ('distance-raquettes', 'distance-walk'),
    ('dplus-raquettes', 'elevation-walk'),
    ('sorties-raquettes', 'count-sessions'),
    ('duree-escalade', 'duration-activity'),
    ('seances-escalade', 'count-sessions'),
    ('voies-realisees', 'count-events'),
    ('blocs-realises', 'count-events'),
    ('duree-via-ferrata', 'duration-activity'),
    ('sorties-via-ferrata', 'count-sessions'),
    ('dplus-via-ferrata', 'elevation-walk'),
    ('dplus-alpinisme', 'elevation-trail'),
    ('duree-alpinisme', 'duration-activity'),
    ('sorties-alpinisme', 'count-sessions'),
    ('distance-course-orientation', 'distance-run'),
    ('duree-course-orientation', 'duration-activity'),
    ('sorties-course-orientation', 'count-sessions'),
    ('distance-gravel', 'distance-cycle'),
    ('dplus-gravel', 'elevation-cycle'),
    ('sorties-gravel', 'count-sessions'),
    ('duree-home-trainer', 'duration-activity'),
    ('distance-home-trainer', 'distance-cycle'),
    ('seances-home-trainer', 'count-sessions'),
    ('duree-football', 'duration-activity'),
    ('matchs-football', 'count-events'),
    ('seances-football', 'count-sessions'),
    ('duree-rugby', 'duration-activity'),
    ('matchs-rugby', 'count-events'),
    ('seances-rugby', 'count-sessions'),
    ('duree-basketball', 'duration-activity'),
    ('matchs-basketball', 'count-events'),
    ('seances-basketball', 'count-sessions'),
    ('duree-handball', 'duration-activity'),
    ('matchs-handball', 'count-events'),
    ('seances-handball', 'count-sessions'),
    ('duree-volleyball', 'duration-activity'),
    ('matchs-volleyball', 'count-events'),
    ('seances-volleyball', 'count-sessions'),
    ('duree-tennis', 'duration-activity'),
    ('matchs-tennis', 'count-events'),
    ('seances-tennis', 'count-sessions'),
    ('duree-padel', 'duration-activity'),
    ('matchs-padel', 'count-events'),
    ('seances-padel', 'count-sessions'),
    ('duree-badminton', 'duration-activity'),
    ('matchs-badminton', 'count-events'),
    ('seances-badminton', 'count-sessions'),
    ('duree-tennis-de-table', 'duration-activity'),
    ('matchs-tennis-de-table', 'count-events'),
    ('seances-tennis-de-table', 'count-sessions'),
    ('duree-boxe', 'duration-activity'),
    ('seances-boxe', 'count-sessions'),
    ('rounds-boxe', 'count-events'),
    ('combats-boxe', 'count-events'),
    ('duree-sports-de-combat', 'duration-activity'),
    ('seances-sports-de-combat', 'count-sessions'),
    ('sparrings', 'count-events'),
    ('combats', 'count-events'),
    ('duree-danse', 'duration-activity'),
    ('seances-danse', 'count-sessions'),
    ('cours-danse', 'count-events'),
    ('distance-kayak-canoe', 'distance-outdoor-medium'),
    ('duree-kayak-canoe', 'duration-activity'),
    ('sorties-kayak-canoe', 'count-sessions'),
    ('distance-aviron', 'distance-outdoor-medium'),
    ('duree-aviron', 'duration-activity'),
    ('sorties-aviron', 'count-sessions'),
    ('distance-paddle', 'distance-outdoor-medium'),
    ('duree-paddle', 'duration-activity'),
    ('sorties-paddle', 'count-sessions'),
    ('duree-surf', 'duration-activity'),
    ('sorties-surf', 'count-sessions'),
    ('distance-roller-patinage', 'distance-outdoor-medium'),
    ('duree-roller-patinage', 'duration-activity'),
    ('sorties-roller-patinage', 'count-sessions'),
    ('distance-triathlon', 'distance-cycle'),
    ('duree-triathlon', 'duration-activity'),
    ('epreuves-triathlon', 'count-events'),
    ('thrusters', 'reps-medium'),
    ('kettlebell-swings', 'reps-medium'),
    ('clean-and-press', 'reps-medium'),
    ('wall-balls', 'reps-medium'),
    ('seances-hyrox', 'count-sessions')
),
level_family_seed(family, thresholds) as (
  values
    ('duration-activity', array[30,90,180,360,600,900,1300,1800,2500,3400,4500,6000,7800,9800,12200,15000,18500,22500,27000,32000]::numeric[]),
    ('distance-cycle', array[5,15,30,60,100,200,350,600,1000,1500,2000,3000,4000,5500,7500,10000,13000,17000,22000,30000]::numeric[]),
    ('distance-trail', array[5,15,30,60,100,160,250,400,600,900,1300,1800,2400,3200,4200,5500,7000,9000,11500,15000]::numeric[]),
    ('distance-walk', array[1,5,10,25,50,100,200,350,600,1000,1500,2250,3000,4000,5000,6500,8500,11000,15000,20000]::numeric[]),
    ('distance-run', array[1,5,10,25,50,100,175,300,500,750,1000,1500,2000,2750,3500,4500,6000,8000,10000,15000]::numeric[]),
    ('distance-outdoor-medium', array[2,5,10,20,35,60,100,160,250,400,600,850,1150,1500,1900,2400,3000,3800,4700,6000]::numeric[]),
    ('elevation-cycle', array[50,200,500,1000,2000,4000,7000,12000,20000,30000,45000,65000,90000,125000,170000,230000,310000,420000,560000,750000]::numeric[]),
    ('elevation-trail', array[100,300,600,1200,2000,3500,6000,10000,15000,22000,32000,45000,65000,90000,125000,170000,230000,310000,420000,560000]::numeric[]),
    ('elevation-walk', array[50,150,300,600,1000,2000,4000,7000,12000,20000,30000,45000,65000,90000,125000,170000,230000,310000,420000,560000]::numeric[]),
    ('count-sessions', array[1,3,5,10,15,25,40,60,85,120,160,210,270,340,420,520,650,800,1000,1250]::numeric[]),
    ('count-events', array[1,2,3,5,8,12,18,25,35,50,70,95,125,160,210,270,340,420,520,650]::numeric[]),
    ('reps-medium', array[8,20,40,80,140,230,360,550,800,1200,1700,2400,3300,4500,6000,8000,10500,13500,17000,22000]::numeric[])
),
target_masteries as (
  select m.id, ms.slug, ms.level_family
  from mastery_seed ms
  join public.masteries m
    on m.slug = ms.slug
),
level_rows as (
  select
    tm.id as mastery_id,
    gs.idx as level,
    lfs.thresholds[gs.idx] as threshold
  from target_masteries tm
  join level_family_seed lfs
    on lfs.family = tm.level_family
  cross join lateral generate_subscripts(lfs.thresholds, 1) as gs(idx)
)
insert into public.mastery_levels (mastery_id, level, threshold, xp_reward)
select
  lr.mastery_id,
  lr.level,
  lr.threshold,
  case when lr.level <= 10 then 5 else 10 end
from level_rows lr
on conflict (mastery_id, level) do update
set
  threshold = excluded.threshold,
  xp_reward = excluded.xp_reward;

with muscle_seed(mastery_slug, muscle_key, weight) as (
  values
    ('thrusters', 'quadriceps', 1),
    ('thrusters', 'fessiers', 0.6),
    ('thrusters', 'epaules', 1),
    ('thrusters', 'triceps', 0.6),
    ('kettlebell-swings', 'fessiers', 1),
    ('kettlebell-swings', 'ischios', 1),
    ('kettlebell-swings', 'lombaires', 0.6),
    ('kettlebell-swings', 'epaules', 0.3),
    ('clean-and-press', 'epaules', 1),
    ('clean-and-press', 'triceps', 0.6),
    ('clean-and-press', 'fessiers', 0.6),
    ('clean-and-press', 'quadriceps', 0.3),
    ('wall-balls', 'quadriceps', 1),
    ('wall-balls', 'fessiers', 0.6),
    ('wall-balls', 'epaules', 0.6),
    ('wall-balls', 'triceps', 0.3)
)
insert into public.mastery_muscles (mastery_id, muscle_key, weight)
select
  m.id,
  ms.muscle_key,
  ms.weight
from muscle_seed ms
join public.masteries m
  on m.slug = ms.mastery_slug
on conflict (mastery_id, muscle_key) do update
set
  weight = excluded.weight;

with link_seed(source_type, exercise_key, exercise_name, mastery_slug) as (
  values
    ('exercise_library', 'rameur', 'Rameur', 'rameur'),
    ('exercise_library', 'air-bike', 'Air bike', 'air-bike'),
    ('exercise_library', 'course-tapis', 'Course tapis', 'course-tapis'),
    ('exercise_library', 'thrusters', 'Thrusters', 'thrusters'),
    ('exercise_library', 'kettlebell-swing', 'Kettlebell swing', 'kettlebell-swings'),
    ('exercise_library', 'clean-and-press', 'Clean and press', 'clean-and-press'),
    ('training_block', 'rameur', 'Rameur', 'rameur'),
    ('training_block', 'air-bike', 'Air bike', 'air-bike'),
    ('training_block', 'course-tapis', 'Course tapis', 'course-tapis'),
    ('training_block', 'ski-erg', 'Ski erg', 'ski-erg'),
    ('training_block', 'mobilite-dynamique', 'Mobilite dynamique', 'mobilite-dynamique'),
    ('training_block', 'cercles-epaules', 'Cercles d’épaules', 'cercles-epaules'),
    ('training_block', 'rotation-du-buste', 'Rotation du buste', 'rotation-buste'),
    ('training_block', 'rotation-thoracique', 'Rotation thoracique', 'rotation-thoracique'),
    ('training_block', 'etirement-ischios', 'Étirement ischios', 'etirement-ischios'),
    ('training_block', 'ouverture-thoracique', 'Ouverture thoracique', 'ouverture-thoracique'),
    ('training_block', 'respiration-calme', 'Respiration calme', 'respiration-calme'),
    ('training_block', 'respiration-diaphragmatique', 'Respiration diaphragmatique', 'respiration-diaphragmatique'),
    ('training_block', 'etirement-chaine-posterieure', 'Etirement chaine posterieure', 'etirement-chaine-posterieure'),
    ('training_block', 'etirements-doux', 'Étirements doux', 'etirements-doux'),
    ('training_block', 'retour-calme-assis', 'Retour calme assis', 'retour-calme-assis'),
    ('training_block', 'thrusters', 'Thrusters', 'thrusters'),
    ('training_block', 'kettlebell-swing', 'Kettlebell swing', 'kettlebell-swings'),
    ('training_block', 'clean-and-press', 'Clean and press', 'clean-and-press')
)
insert into public.mastery_exercise_links (
  mastery_id,
  exercise_key,
  exercise_name,
  source_type
)
select
  m.id,
  ls.exercise_key,
  ls.exercise_name,
  ls.source_type
from link_seed ls
join public.masteries m
  on m.slug = ls.mastery_slug
on conflict (source_type, exercise_name) do update
set
  mastery_id = excluded.mastery_id,
  exercise_key = excluded.exercise_key;

do $$
declare
  missing_categories text;
begin
  select string_agg(t.slug, ', ' order by t.sort_order)
    into missing_categories
  from (
    select c.slug, c.sort_order
    from public.mastery_categories c
    join (
      values
        ('fitness'), ('musculation'), ('course-a-pied'), ('trail'), ('marche'), ('velo'),
        ('vtt'), ('natation'), ('cardio-indoor'), ('mobilite-souplesse'), ('ski-alpin'),
        ('ski-randonnee'), ('ski-de-fond'), ('raquettes'), ('escalade'), ('via-ferrata'),
        ('alpinisme'), ('course-orientation'), ('gravel'), ('home-trainer'), ('football'),
        ('rugby'), ('basketball'), ('handball'), ('volleyball'), ('tennis'), ('padel'),
        ('badminton'), ('tennis-de-table'), ('boxe'), ('sports-de-combat'), ('danse'),
        ('kayak-canoe'), ('aviron'), ('paddle'), ('surf'), ('roller-patinage'),
        ('triathlon'), ('hyrox-cross-training')
    ) as expected(slug)
      on expected.slug = c.slug
    left join public.masteries m
      on m.category_id = c.id
     and m.active = true
    group by c.slug, c.sort_order
    having count(m.id) = 0
  ) as t;

  if missing_categories is not null then
    raise exception 'Mastery categories still empty after corrective migration: %', missing_categories;
  end if;
end
$$;

do $$
declare
  invalid_masteries text;
begin
  select string_agg(t.slug || ' (' || t.level_count || ')', ', ' order by t.slug)
    into invalid_masteries
  from (
    select m.slug, count(ml.id) as level_count
    from public.masteries m
    join (
      values
        ('distance-vtt'), ('dplus-vtt'), ('duree-vtt'), ('sorties-vtt'),
        ('rameur'), ('air-bike'), ('course-tapis'), ('velo-elliptique'), ('ski-erg'),
        ('mobilite-dynamique'), ('cercles-epaules'), ('rotation-buste'), ('rotation-thoracique'),
        ('etirement-ischios'), ('ouverture-hanches'), ('respiration-calme'),
        ('respiration-diaphragmatique'), ('ouverture-thoracique'),
        ('etirement-chaine-posterieure'), ('etirements-doux'), ('retour-calme-assis'),
        ('duree-ski-alpin'), ('sorties-ski-alpin'),
        ('distance-ski-randonnee'), ('dplus-ski-randonnee'), ('duree-ski-randonnee'),
        ('sorties-ski-randonnee'), ('sorties-ski-randonnee-1000dplus'),
        ('distance-ski-fond'), ('duree-ski-fond'), ('sorties-ski-fond'),
        ('distance-raquettes'), ('dplus-raquettes'), ('sorties-raquettes'),
        ('duree-escalade'), ('seances-escalade'), ('voies-realisees'), ('blocs-realises'),
        ('duree-via-ferrata'), ('sorties-via-ferrata'), ('dplus-via-ferrata'),
        ('dplus-alpinisme'), ('duree-alpinisme'), ('sorties-alpinisme'),
        ('distance-course-orientation'), ('duree-course-orientation'), ('sorties-course-orientation'),
        ('distance-gravel'), ('dplus-gravel'), ('sorties-gravel'),
        ('duree-home-trainer'), ('distance-home-trainer'), ('seances-home-trainer'),
        ('duree-football'), ('matchs-football'), ('seances-football'),
        ('duree-rugby'), ('matchs-rugby'), ('seances-rugby'),
        ('duree-basketball'), ('matchs-basketball'), ('seances-basketball'),
        ('duree-handball'), ('matchs-handball'), ('seances-handball'),
        ('duree-volleyball'), ('matchs-volleyball'), ('seances-volleyball'),
        ('duree-tennis'), ('matchs-tennis'), ('seances-tennis'),
        ('duree-padel'), ('matchs-padel'), ('seances-padel'),
        ('duree-badminton'), ('matchs-badminton'), ('seances-badminton'),
        ('duree-tennis-de-table'), ('matchs-tennis-de-table'), ('seances-tennis-de-table'),
        ('duree-boxe'), ('seances-boxe'), ('rounds-boxe'), ('combats-boxe'),
        ('duree-sports-de-combat'), ('seances-sports-de-combat'), ('sparrings'), ('combats'),
        ('duree-danse'), ('seances-danse'), ('cours-danse'),
        ('distance-kayak-canoe'), ('duree-kayak-canoe'), ('sorties-kayak-canoe'),
        ('distance-aviron'), ('duree-aviron'), ('sorties-aviron'),
        ('distance-paddle'), ('duree-paddle'), ('sorties-paddle'),
        ('duree-surf'), ('sorties-surf'),
        ('distance-roller-patinage'), ('duree-roller-patinage'), ('sorties-roller-patinage'),
        ('distance-triathlon'), ('duree-triathlon'), ('epreuves-triathlon'),
        ('thrusters'), ('kettlebell-swings'), ('clean-and-press'), ('wall-balls'),
        ('seances-hyrox')
    ) as expected(slug)
      on expected.slug = m.slug
    left join public.mastery_levels ml
      on ml.mastery_id = m.id
    group by m.slug
    having count(ml.id) <> 20
  ) as t;

  if invalid_masteries is not null then
    raise exception 'New masteries without exactly 20 levels: %', invalid_masteries;
  end if;
end
$$;

do $$
declare
  duplicate_slugs text;
begin
  select string_agg(t.slug, ', ' order by t.slug)
    into duplicate_slugs
  from (
    select m.slug
    from public.masteries m
    join (
      values
        ('distance-vtt'), ('dplus-vtt'), ('duree-vtt'), ('sorties-vtt'),
        ('rameur'), ('air-bike'), ('course-tapis'), ('velo-elliptique'), ('ski-erg'),
        ('mobilite-dynamique'), ('cercles-epaules'), ('rotation-buste'), ('rotation-thoracique'),
        ('etirement-ischios'), ('ouverture-hanches'), ('respiration-calme'),
        ('respiration-diaphragmatique'), ('ouverture-thoracique'),
        ('etirement-chaine-posterieure'), ('etirements-doux'), ('retour-calme-assis'),
        ('duree-ski-alpin'), ('sorties-ski-alpin'),
        ('distance-ski-randonnee'), ('dplus-ski-randonnee'), ('duree-ski-randonnee'),
        ('sorties-ski-randonnee'), ('sorties-ski-randonnee-1000dplus'),
        ('distance-ski-fond'), ('duree-ski-fond'), ('sorties-ski-fond'),
        ('distance-raquettes'), ('dplus-raquettes'), ('sorties-raquettes'),
        ('duree-escalade'), ('seances-escalade'), ('voies-realisees'), ('blocs-realises'),
        ('duree-via-ferrata'), ('sorties-via-ferrata'), ('dplus-via-ferrata'),
        ('dplus-alpinisme'), ('duree-alpinisme'), ('sorties-alpinisme'),
        ('distance-course-orientation'), ('duree-course-orientation'), ('sorties-course-orientation'),
        ('distance-gravel'), ('dplus-gravel'), ('sorties-gravel'),
        ('duree-home-trainer'), ('distance-home-trainer'), ('seances-home-trainer'),
        ('duree-football'), ('matchs-football'), ('seances-football'),
        ('duree-rugby'), ('matchs-rugby'), ('seances-rugby'),
        ('duree-basketball'), ('matchs-basketball'), ('seances-basketball'),
        ('duree-handball'), ('matchs-handball'), ('seances-handball'),
        ('duree-volleyball'), ('matchs-volleyball'), ('seances-volleyball'),
        ('duree-tennis'), ('matchs-tennis'), ('seances-tennis'),
        ('duree-padel'), ('matchs-padel'), ('seances-padel'),
        ('duree-badminton'), ('matchs-badminton'), ('seances-badminton'),
        ('duree-tennis-de-table'), ('matchs-tennis-de-table'), ('seances-tennis-de-table'),
        ('duree-boxe'), ('seances-boxe'), ('rounds-boxe'), ('combats-boxe'),
        ('duree-sports-de-combat'), ('seances-sports-de-combat'), ('sparrings'), ('combats'),
        ('duree-danse'), ('seances-danse'), ('cours-danse'),
        ('distance-kayak-canoe'), ('duree-kayak-canoe'), ('sorties-kayak-canoe'),
        ('distance-aviron'), ('duree-aviron'), ('sorties-aviron'),
        ('distance-paddle'), ('duree-paddle'), ('sorties-paddle'),
        ('duree-surf'), ('sorties-surf'),
        ('distance-roller-patinage'), ('duree-roller-patinage'), ('sorties-roller-patinage'),
        ('distance-triathlon'), ('duree-triathlon'), ('epreuves-triathlon'),
        ('thrusters'), ('kettlebell-swings'), ('clean-and-press'), ('wall-balls'),
        ('seances-hyrox')
    ) as expected(slug)
      on expected.slug = m.slug
    group by m.slug
    having count(*) > 1
  ) as t;

  if duplicate_slugs is not null then
    raise exception 'Duplicate mastery slugs detected after corrective migration: %', duplicate_slugs;
  end if;
end
$$;

notify pgrst, 'reload schema';

commit;
