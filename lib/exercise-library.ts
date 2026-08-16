import type { SessionBlockType } from '@/lib/session-blocks';

export const EXERCISE_IMAGE_BUCKET = 'exercise-images';
export const EXERCISE_VISUAL_CATEGORIES = ['RUNNING', 'WALKING', 'MOBILITY', 'RECOVERY'] as const;

export const EXERCISE_MUSCLE_GROUPS = [
  'pectoraux',
  'dos',
  'epaules',
  'biceps',
  'triceps',
  'avant-bras',
  'abdominaux',
  'lombaires',
  'fessiers',
  'quadriceps',
  'ischio-jambiers',
  'mollets',
  'corps-entier',
  'cardio',
] as const;

export const EXERCISE_EQUIPMENT_OPTIONS = [
  'poids-du-corps',
  'barre',
  'halteres',
  'kettlebell',
  'machine',
  'poulie',
  'elastique',
  'banc',
  'tapis',
  'medecine-ball',
  'box',
  'corde',
  'velo',
  'rameur',
  'assault-bike',
  'autre',
] as const;

export type ExerciseMuscleGroup = (typeof EXERCISE_MUSCLE_GROUPS)[number];
export type ExerciseEquipment = (typeof EXERCISE_EQUIPMENT_OPTIONS)[number];
export type ExerciseCategory = string;
export type ExerciseVisualCategory = (typeof EXERCISE_VISUAL_CATEGORIES)[number];

export type ExerciseLibraryItem = {
  id: string | null;
  slug: string;
  name: string;
  sport: string | null;
  category: ExerciseCategory | null;
  movementType: string | null;
  trackingType: SessionBlockType;
  supportsLoad: boolean;
  primaryMuscles: ExerciseMuscleGroup[];
  secondaryMuscles: ExerciseMuscleGroup[];
  equipment: ExerciseEquipment[];
  difficulty: string | null;
  description: string | null;
  instructions: string | null;
  imagePath: string | null;
  imageUrl: string | null;
  visualCategory: ExerciseVisualCategory | null;
  active: boolean;
  metadata: Record<string, unknown>;
  source: 'fallback' | 'supabase';
};

type FallbackExerciseSeed = Omit<ExerciseLibraryItem, 'id' | 'imageUrl' | 'visualCategory' | 'source'>;

function createFallbackExercise(seed: FallbackExerciseSeed): ExerciseLibraryItem {
  return {
    ...seed,
    id: null,
    imageUrl: getExerciseImageUrl(seed.imagePath),
    visualCategory: getExerciseVisualCategory(seed.metadata),
    source: 'fallback',
  };
}

export function normalizeExerciseLibrarySlug(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
}

function encodeStoragePath(path: string) {
  return path
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');
}

export function getExerciseImageUrl(imagePath: string | null | undefined) {
  const trimmedPath = imagePath?.trim();
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;

  if (!trimmedPath || !supabaseUrl) {
    return null;
  }

  const normalizedPath = trimmedPath
    .replace(/^\/+/, '')
    .replace(new RegExp(`^${EXERCISE_IMAGE_BUCKET}/`, 'i'), '');

  if (!normalizedPath) {
    return null;
  }

  return `${supabaseUrl}/storage/v1/object/public/${EXERCISE_IMAGE_BUCKET}/${encodeStoragePath(normalizedPath)}`;
}

export function getExerciseVisualCategory(
  metadata: Record<string, unknown> | null | undefined
): ExerciseVisualCategory | null {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return null;
  }

  const visualSourceType =
    typeof metadata.visual_source_type === 'string'
      ? metadata.visual_source_type.trim().toLowerCase()
      : null;
  const visualCategory =
    typeof metadata.visual_category === 'string' ? metadata.visual_category.trim().toUpperCase() : null;

  if (visualSourceType !== 'actyv_category_icon' || !visualCategory) {
    return null;
  }

  return EXERCISE_VISUAL_CATEGORIES.includes(visualCategory as ExerciseVisualCategory)
    ? (visualCategory as ExerciseVisualCategory)
    : null;
}

export const EXERCISE_LIBRARY: ExerciseLibraryItem[] = [
  createFallbackExercise({
    slug: 'developpe-couche',
    name: 'Developpe couche',
    sport: 'musculation',
    category: 'Pectoraux',
    movementType: 'push',
    trackingType: 'reps',
    supportsLoad: true,
    primaryMuscles: ['pectoraux'],
    secondaryMuscles: ['triceps', 'epaules'],
    equipment: ['barre', 'banc'],
    difficulty: 'intermediaire',
    description: null,
    instructions: null,
    imagePath: null,
    active: true,
    metadata: {},
  }),
  createFallbackExercise({
    slug: 'developpe-incline',
    name: 'Developpe incline',
    sport: 'musculation',
    category: 'Pectoraux',
    movementType: 'push',
    trackingType: 'reps',
    supportsLoad: true,
    primaryMuscles: ['pectoraux'],
    secondaryMuscles: ['triceps', 'epaules'],
    equipment: ['barre', 'banc'],
    difficulty: 'intermediaire',
    description: null,
    instructions: null,
    imagePath: null,
    active: true,
    metadata: {},
  }),
  createFallbackExercise({
    slug: 'pompes',
    name: 'Pompes',
    sport: 'fitness',
    category: 'Pectoraux',
    movementType: 'push',
    trackingType: 'reps',
    supportsLoad: false,
    primaryMuscles: ['pectoraux'],
    secondaryMuscles: ['triceps', 'abdominaux'],
    equipment: ['poids-du-corps'],
    difficulty: 'debutant',
    description: null,
    instructions: null,
    imagePath: null,
    active: true,
    metadata: {},
  }),
  createFallbackExercise({
    slug: 'dips',
    name: 'Dips',
    sport: 'musculation',
    category: 'Pectoraux',
    movementType: 'push',
    trackingType: 'reps',
    supportsLoad: false,
    primaryMuscles: ['triceps'],
    secondaryMuscles: ['pectoraux', 'epaules'],
    equipment: ['poids-du-corps'],
    difficulty: 'intermediaire',
    description: null,
    instructions: null,
    imagePath: null,
    active: true,
    metadata: {},
  }),
  createFallbackExercise({
    slug: 'tirage-vertical',
    name: 'Tirage vertical',
    sport: 'musculation',
    category: 'Dos',
    movementType: 'pull',
    trackingType: 'reps',
    supportsLoad: true,
    primaryMuscles: ['dos'],
    secondaryMuscles: ['biceps'],
    equipment: ['machine', 'poulie'],
    difficulty: 'debutant',
    description: null,
    instructions: null,
    imagePath: null,
    active: true,
    metadata: {},
  }),
  createFallbackExercise({
    slug: 'rowing-barre',
    name: 'Rowing barre',
    sport: 'musculation',
    category: 'Dos',
    movementType: 'pull',
    trackingType: 'reps',
    supportsLoad: true,
    primaryMuscles: ['dos'],
    secondaryMuscles: ['biceps', 'lombaires'],
    equipment: ['barre'],
    difficulty: 'intermediaire',
    description: null,
    instructions: null,
    imagePath: null,
    active: true,
    metadata: {},
  }),
  createFallbackExercise({
    slug: 'rowing-haltere',
    name: 'Rowing haltere',
    sport: 'musculation',
    category: 'Dos',
    movementType: 'pull',
    trackingType: 'reps',
    supportsLoad: true,
    primaryMuscles: ['dos'],
    secondaryMuscles: ['biceps', 'lombaires'],
    equipment: ['halteres', 'banc'],
    difficulty: 'intermediaire',
    description: null,
    instructions: null,
    imagePath: null,
    active: true,
    metadata: {},
  }),
  createFallbackExercise({
    slug: 'souleve-de-terre',
    name: 'Souleve de terre',
    sport: 'musculation',
    category: 'Dos',
    movementType: 'hinge',
    trackingType: 'reps',
    supportsLoad: true,
    primaryMuscles: ['dos', 'fessiers', 'ischio-jambiers'],
    secondaryMuscles: ['lombaires'],
    equipment: ['barre'],
    difficulty: 'avance',
    description: null,
    instructions: null,
    imagePath: null,
    active: true,
    metadata: {},
  }),
  createFallbackExercise({
    slug: 'squat',
    name: 'Squat',
    sport: 'musculation',
    category: 'Jambes',
    movementType: 'squat',
    trackingType: 'reps',
    supportsLoad: true,
    primaryMuscles: ['quadriceps', 'fessiers'],
    secondaryMuscles: ['ischio-jambiers', 'abdominaux'],
    equipment: ['barre'],
    difficulty: 'intermediaire',
    description: null,
    instructions: null,
    imagePath: null,
    active: true,
    metadata: {},
  }),
  createFallbackExercise({
    slug: 'presse-inclinee',
    name: 'Presse inclinee',
    sport: 'musculation',
    category: 'Jambes',
    movementType: 'squat',
    trackingType: 'reps',
    supportsLoad: true,
    primaryMuscles: ['quadriceps', 'fessiers'],
    secondaryMuscles: ['ischio-jambiers'],
    equipment: ['machine'],
    difficulty: 'debutant',
    description: null,
    instructions: null,
    imagePath: null,
    active: true,
    metadata: {},
  }),
  createFallbackExercise({
    slug: 'fentes-bulgares',
    name: 'Fentes bulgares',
    sport: 'musculation',
    category: 'Jambes',
    movementType: 'split-squat',
    trackingType: 'reps',
    supportsLoad: true,
    primaryMuscles: ['quadriceps', 'fessiers'],
    secondaryMuscles: ['ischio-jambiers'],
    equipment: ['halteres', 'banc'],
    difficulty: 'intermediaire',
    description: null,
    instructions: null,
    imagePath: null,
    active: true,
    metadata: {},
  }),
  createFallbackExercise({
    slug: 'mollets-debout',
    name: 'Mollets debout',
    sport: 'musculation',
    category: 'Jambes',
    movementType: 'calves',
    trackingType: 'reps',
    supportsLoad: true,
    primaryMuscles: ['mollets'],
    secondaryMuscles: [],
    equipment: ['poids-du-corps'],
    difficulty: 'debutant',
    description: null,
    instructions: null,
    imagePath: null,
    active: true,
    metadata: {},
  }),
  createFallbackExercise({
    slug: 'developpe-militaire',
    name: 'Developpe militaire',
    sport: 'musculation',
    category: 'Epaules',
    movementType: 'push',
    trackingType: 'reps',
    supportsLoad: true,
    primaryMuscles: ['epaules'],
    secondaryMuscles: ['triceps'],
    equipment: ['barre', 'halteres'],
    difficulty: 'intermediaire',
    description: null,
    instructions: null,
    imagePath: null,
    active: true,
    metadata: {},
  }),
  createFallbackExercise({
    slug: 'elevations-laterales',
    name: 'Elevations laterales',
    sport: 'musculation',
    category: 'Epaules',
    movementType: 'raise',
    trackingType: 'reps',
    supportsLoad: true,
    primaryMuscles: ['epaules'],
    secondaryMuscles: [],
    equipment: ['halteres'],
    difficulty: 'debutant',
    description: null,
    instructions: null,
    imagePath: null,
    active: true,
    metadata: {},
  }),
  createFallbackExercise({
    slug: 'oiseau',
    name: 'Oiseau',
    sport: 'musculation',
    category: 'Epaules',
    movementType: 'raise',
    trackingType: 'reps',
    supportsLoad: true,
    primaryMuscles: ['epaules'],
    secondaryMuscles: ['dos'],
    equipment: ['halteres'],
    difficulty: 'debutant',
    description: null,
    instructions: null,
    imagePath: null,
    active: true,
    metadata: {},
  }),
  createFallbackExercise({
    slug: 'curl-barre',
    name: 'Curl barre',
    sport: 'musculation',
    category: 'Bras',
    movementType: 'curl',
    trackingType: 'reps',
    supportsLoad: true,
    primaryMuscles: ['biceps'],
    secondaryMuscles: ['avant-bras'],
    equipment: ['barre'],
    difficulty: 'debutant',
    description: null,
    instructions: null,
    imagePath: null,
    active: true,
    metadata: {},
  }),
  createFallbackExercise({
    slug: 'curl-halteres',
    name: 'Curl halteres',
    sport: 'musculation',
    category: 'Bras',
    movementType: 'curl',
    trackingType: 'reps',
    supportsLoad: true,
    primaryMuscles: ['biceps'],
    secondaryMuscles: ['avant-bras'],
    equipment: ['halteres'],
    difficulty: 'debutant',
    description: null,
    instructions: null,
    imagePath: null,
    active: true,
    metadata: {},
  }),
  createFallbackExercise({
    slug: 'extension-triceps-poulie',
    name: 'Extension triceps poulie',
    sport: 'musculation',
    category: 'Bras',
    movementType: 'extension',
    trackingType: 'reps',
    supportsLoad: true,
    primaryMuscles: ['triceps'],
    secondaryMuscles: [],
    equipment: ['poulie'],
    difficulty: 'debutant',
    description: null,
    instructions: null,
    imagePath: null,
    active: true,
    metadata: {},
  }),
  createFallbackExercise({
    slug: 'barre-au-front',
    name: 'Barre au front',
    sport: 'musculation',
    category: 'Bras',
    movementType: 'extension',
    trackingType: 'reps',
    supportsLoad: true,
    primaryMuscles: ['triceps'],
    secondaryMuscles: [],
    equipment: ['barre'],
    difficulty: 'intermediaire',
    description: null,
    instructions: null,
    imagePath: null,
    active: true,
    metadata: {},
  }),
  createFallbackExercise({
    slug: 'gainage',
    name: 'Gainage',
    sport: 'fitness',
    category: 'Abdos',
    movementType: 'core',
    trackingType: 'duration',
    supportsLoad: false,
    primaryMuscles: ['abdominaux'],
    secondaryMuscles: ['lombaires'],
    equipment: ['tapis'],
    difficulty: 'debutant',
    description: null,
    instructions: null,
    imagePath: null,
    active: true,
    metadata: {},
  }),
  createFallbackExercise({
    slug: 'crunch',
    name: 'Crunch',
    sport: 'fitness',
    category: 'Abdos',
    movementType: 'core',
    trackingType: 'reps',
    supportsLoad: false,
    primaryMuscles: ['abdominaux'],
    secondaryMuscles: [],
    equipment: ['tapis'],
    difficulty: 'debutant',
    description: null,
    instructions: null,
    imagePath: null,
    active: true,
    metadata: {},
  }),
  createFallbackExercise({
    slug: 'releve-de-jambes',
    name: 'Releve de jambes',
    sport: 'fitness',
    category: 'Abdos',
    movementType: 'core',
    trackingType: 'reps',
    supportsLoad: false,
    primaryMuscles: ['abdominaux'],
    secondaryMuscles: ['lombaires'],
    equipment: ['tapis'],
    difficulty: 'intermediaire',
    description: null,
    instructions: null,
    imagePath: null,
    active: true,
    metadata: {},
  }),
  createFallbackExercise({
    slug: 'burpees',
    name: 'Burpees',
    sport: 'fitness',
    category: 'Cardio',
    movementType: 'conditioning',
    trackingType: 'reps',
    supportsLoad: false,
    primaryMuscles: ['corps-entier', 'cardio'],
    secondaryMuscles: [],
    equipment: ['poids-du-corps'],
    difficulty: 'intermediaire',
    description: null,
    instructions: null,
    imagePath: null,
    active: true,
    metadata: {},
  }),
  createFallbackExercise({
    slug: 'rameur',
    name: 'Rameur',
    sport: 'cardio',
    category: 'Cardio',
    movementType: 'conditioning',
    trackingType: 'distance',
    supportsLoad: false,
    primaryMuscles: ['corps-entier', 'cardio'],
    secondaryMuscles: [],
    equipment: ['rameur'],
    difficulty: 'debutant',
    description: null,
    instructions: null,
    imagePath: null,
    active: true,
    metadata: {},
  }),
  createFallbackExercise({
    slug: 'air-bike',
    name: 'Air bike',
    sport: 'cardio',
    category: 'Cardio',
    movementType: 'conditioning',
    trackingType: 'distance',
    supportsLoad: false,
    primaryMuscles: ['corps-entier', 'cardio'],
    secondaryMuscles: [],
    equipment: ['assault-bike'],
    difficulty: 'intermediaire',
    description: null,
    instructions: null,
    imagePath: null,
    active: true,
    metadata: {},
  }),
  createFallbackExercise({
    slug: 'course-tapis',
    name: 'Course tapis',
    sport: 'fitness',
    category: 'Cardio',
    movementType: 'conditioning',
    trackingType: 'distance',
    supportsLoad: false,
    primaryMuscles: ['cardio'],
    secondaryMuscles: ['quadriceps', 'mollets'],
    equipment: ['tapis'],
    difficulty: 'debutant',
    description: null,
    instructions: null,
    imagePath: null,
    active: true,
    metadata: {},
  }),
  createFallbackExercise({
    slug: 'thrusters',
    name: 'Thrusters',
    sport: 'fitness',
    category: 'Full body',
    movementType: 'conditioning',
    trackingType: 'reps',
    supportsLoad: true,
    primaryMuscles: ['corps-entier'],
    secondaryMuscles: ['cardio'],
    equipment: ['halteres', 'barre'],
    difficulty: 'avance',
    description: null,
    instructions: null,
    imagePath: null,
    active: true,
    metadata: {},
  }),
  createFallbackExercise({
    slug: 'kettlebell-swing',
    name: 'Kettlebell swing',
    sport: 'fitness',
    category: 'Full body',
    movementType: 'hinge',
    trackingType: 'reps',
    supportsLoad: true,
    primaryMuscles: ['fessiers', 'ischio-jambiers'],
    secondaryMuscles: ['epaules', 'cardio'],
    equipment: ['kettlebell'],
    difficulty: 'intermediaire',
    description: null,
    instructions: null,
    imagePath: null,
    active: true,
    metadata: {},
  }),
  createFallbackExercise({
    slug: 'clean-and-press',
    name: 'Clean and press',
    sport: 'musculation',
    category: 'Full body',
    movementType: 'olympic',
    trackingType: 'reps',
    supportsLoad: true,
    primaryMuscles: ['corps-entier'],
    secondaryMuscles: ['cardio'],
    equipment: ['barre'],
    difficulty: 'avance',
    description: null,
    instructions: null,
    imagePath: null,
    active: true,
    metadata: {},
  }),
  createFallbackExercise({
    slug: 'mountain-climbers',
    name: 'Mountain climbers',
    sport: 'fitness',
    category: 'Full body',
    movementType: 'conditioning',
    trackingType: 'reps',
    supportsLoad: false,
    primaryMuscles: ['corps-entier', 'cardio'],
    secondaryMuscles: ['abdominaux'],
    equipment: ['poids-du-corps'],
    difficulty: 'debutant',
    description: null,
    instructions: null,
    imagePath: null,
    active: true,
    metadata: {},
  }),
];

export const EXERCISE_CATEGORIES = Array.from(
  new Set(
    EXERCISE_LIBRARY.map((exercise) => exercise.category).filter(
      (category): category is ExerciseCategory => Boolean(category)
    )
  )
).sort((left, right) => left.localeCompare(right, 'fr'));

export const RECENT_EXERCISES_STORAGE_KEY = 'actyv.exercise-library.recent';
export const FAVORITE_EXERCISES_STORAGE_KEY = 'actyv.exercise-library.favorites';

export function getExerciseCategories(exercises: ExerciseLibraryItem[]) {
  return Array.from(
    new Set(
      exercises
        .map((exercise) => exercise.category)
        .filter((category): category is ExerciseCategory => Boolean(category))
    )
  ).sort((left, right) => left.localeCompare(right, 'fr'));
}

export function findExerciseById(
  exercises: ExerciseLibraryItem[],
  exerciseId: string | null | undefined
) {
  if (!exerciseId) return null;
  return exercises.find((exercise) => exercise.id === exerciseId) ?? null;
}

export function findExerciseBySlug(
  exercises: ExerciseLibraryItem[],
  slug: string | null | undefined
) {
  if (!slug) return null;
  const normalizedSlug = normalizeExerciseLibrarySlug(slug);
  return (
    exercises.find((exercise) => normalizeExerciseLibrarySlug(exercise.slug) === normalizedSlug) ??
    null
  );
}

export function searchExercises(exercises: ExerciseLibraryItem[], query: string) {
  const normalizedQuery = query.trim().toLowerCase();

  if (!normalizedQuery) {
    return exercises;
  }

  return exercises.filter((exercise) => {
    const searchableParts = [
      exercise.name,
      exercise.slug,
      exercise.category,
      exercise.sport,
      exercise.movementType,
      ...exercise.primaryMuscles,
      ...exercise.secondaryMuscles,
      ...exercise.equipment,
    ]
      .filter(Boolean)
      .map((value) => String(value).toLowerCase());

    return searchableParts.some((value) => value.includes(normalizedQuery));
  });
}
