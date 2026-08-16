import { supabase } from '@/lib/supabase';
import {
  EXERCISE_LIBRARY,
  ExerciseLibraryItem,
  findExerciseById,
  findExerciseBySlug,
  getExerciseImageUrl,
  searchExercises as searchExerciseLibrary,
} from '@/lib/exercise-library';

const EXERCISE_LIBRARY_SELECT = `
  id,
  slug,
  name,
  sport,
  category,
  movement_type,
  tracking_type,
  supports_load,
  primary_muscles,
  secondary_muscles,
  equipment,
  difficulty,
  description,
  instructions,
  image_path,
  active,
  metadata
`;

function mapExerciseLibraryRow(row: any): ExerciseLibraryItem {
  return {
    id: typeof row.id === 'string' ? row.id : null,
    slug: typeof row.slug === 'string' ? row.slug : '',
    name: typeof row.name === 'string' ? row.name : '',
    sport: typeof row.sport === 'string' ? row.sport : null,
    category: typeof row.category === 'string' ? row.category : null,
    movementType: typeof row.movement_type === 'string' ? row.movement_type : null,
    trackingType:
      row.tracking_type === 'reps' ||
      row.tracking_type === 'duration' ||
      row.tracking_type === 'distance' ||
      row.tracking_type === 'free'
        ? row.tracking_type
        : 'reps',
    supportsLoad: Boolean(row.supports_load),
    primaryMuscles: Array.isArray(row.primary_muscles) ? row.primary_muscles.filter(Boolean) : [],
    secondaryMuscles: Array.isArray(row.secondary_muscles) ? row.secondary_muscles.filter(Boolean) : [],
    equipment: Array.isArray(row.equipment) ? row.equipment.filter(Boolean) : [],
    difficulty: typeof row.difficulty === 'string' ? row.difficulty : null,
    description: typeof row.description === 'string' ? row.description : null,
    instructions: typeof row.instructions === 'string' ? row.instructions : null,
    imagePath: typeof row.image_path === 'string' ? row.image_path : null,
    imageUrl: getExerciseImageUrl(typeof row.image_path === 'string' ? row.image_path : null),
    active: row.active !== false,
    metadata: row.metadata && typeof row.metadata === 'object' && !Array.isArray(row.metadata) ? row.metadata : {},
    source: 'supabase',
  };
}

function isMissingExerciseLibrarySchema(error: { code?: string; message?: string } | null) {
  if (!error) return false;

  return (
    error.code === 'PGRST204' ||
    error.code === '42P01' ||
    error.code === '42703' ||
    (error.message || '').toLowerCase().includes('exercise_library')
  );
}

export async function getExercises() {
  if (!supabase || typeof (supabase as any).from !== 'function') {
    return { data: EXERCISE_LIBRARY, error: null, source: 'fallback' as const };
  }

  const response = await supabase
    .from('exercise_library')
    .select(EXERCISE_LIBRARY_SELECT)
    .eq('active', true)
    .order('name', { ascending: true });

  if (response.error) {
    if (!isMissingExerciseLibrarySchema(response.error)) {
      console.error('EXERCISE LIBRARY SELECT ERROR:', JSON.stringify(response.error, null, 2));
    }

    return { data: EXERCISE_LIBRARY, error: response.error, source: 'fallback' as const };
  }

  return {
    data: ((response.data as any[]) || []).map(mapExerciseLibraryRow),
    error: null,
    source: 'supabase' as const,
  };
}

export async function getExerciseById(exerciseId: string) {
  const { data, error, source } = await getExercises();
  return {
    data: findExerciseById(data, exerciseId),
    error,
    source,
  };
}

export async function getExerciseBySlug(slug: string) {
  const { data, error, source } = await getExercises();
  return {
    data: findExerciseBySlug(data, slug),
    error,
    source,
  };
}

export async function searchExercises(query: string) {
  const { data, error, source } = await getExercises();
  return {
    data: searchExerciseLibrary(data, query),
    error,
    source,
  };
}
