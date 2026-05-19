export const EXERCISE_CATEGORIES = [
  'Pectoraux',
  'Dos',
  'Jambes',
  'Epaules',
  'Bras',
  'Abdos',
  'Cardio',
  'Full body',
] as const;

export type ExerciseCategory = (typeof EXERCISE_CATEGORIES)[number];

export type ExerciseLibraryItem = {
  name: string;
  category: ExerciseCategory;
};

export const EXERCISE_LIBRARY: ExerciseLibraryItem[] = [
  { name: 'Developpe couche', category: 'Pectoraux' },
  { name: 'Developpe incline', category: 'Pectoraux' },
  { name: 'Pompes', category: 'Pectoraux' },
  { name: 'Dips', category: 'Pectoraux' },
  { name: 'Tirage vertical', category: 'Dos' },
  { name: 'Rowing barre', category: 'Dos' },
  { name: 'Rowing haltere', category: 'Dos' },
  { name: 'Souleve de terre', category: 'Dos' },
  { name: 'Squat', category: 'Jambes' },
  { name: 'Presse inclinee', category: 'Jambes' },
  { name: 'Fentes bulgares', category: 'Jambes' },
  { name: 'Mollets debout', category: 'Jambes' },
  { name: 'Developpe militaire', category: 'Epaules' },
  { name: 'Elevations laterales', category: 'Epaules' },
  { name: 'Oiseau', category: 'Epaules' },
  { name: 'Curl barre', category: 'Bras' },
  { name: 'Curl halteres', category: 'Bras' },
  { name: 'Extension triceps poulie', category: 'Bras' },
  { name: 'Barre au front', category: 'Bras' },
  { name: 'Gainage', category: 'Abdos' },
  { name: 'Crunch', category: 'Abdos' },
  { name: 'Releve de jambes', category: 'Abdos' },
  { name: 'Burpees', category: 'Cardio' },
  { name: 'Rameur', category: 'Cardio' },
  { name: 'Air bike', category: 'Cardio' },
  { name: 'Course tapis', category: 'Cardio' },
  { name: 'Thrusters', category: 'Full body' },
  { name: 'Kettlebell swing', category: 'Full body' },
  { name: 'Clean and press', category: 'Full body' },
  { name: 'Mountain climbers', category: 'Full body' },
];

export const RECENT_EXERCISES_STORAGE_KEY = 'actyv.exercise-library.recent';
export const FAVORITE_EXERCISES_STORAGE_KEY = 'actyv.exercise-library.favorites';
