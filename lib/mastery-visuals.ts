import type { Mastery } from '@/lib/masteries';

export type MasteryVisualSportKey =
  | 'RUNNING'
  | 'TRAIL'
  | 'WALKING'
  | 'CYCLING'
  | 'SWIMMING'
  | 'SNOW'
  | 'CLIMBING'
  | 'ORIENTEERING'
  | 'BALL'
  | 'RACKET'
  | 'COMBAT'
  | 'WATER'
  | 'TRIATHLON'
  | 'FITNESS';

export type MasteryVisualMetricKey =
  | 'DISTANCE'
  | 'DURATION'
  | 'ELEVATION'
  | 'OUTING'
  | 'STEPS'
  | 'MATCH'
  | 'FREQUENCY'
  | 'ROUNDS'
  | 'COUNT'
  | 'EVENT'
  | 'MILESTONE';

export type MasterySportMetricVisual = {
  type: 'sport_metric';
  sport: MasteryVisualSportKey;
  metric: MasteryVisualMetricKey;
  label: string | null;
};

export type MasteryExerciseVisual = {
  type: 'exercise';
  exerciseName: string;
  imageUrl: string | null;
  visualCategory: Mastery['linkedExerciseVisualCategory'] | null;
};

export type MasteryFallbackVisual = {
  type: 'category';
  categoryId: string;
};

export type MasteryVisual =
  | MasteryExerciseVisual
  | MasterySportMetricVisual
  | MasteryFallbackVisual;

const SPORT_BY_CATEGORY: Record<string, MasteryVisualSportKey> = {
  'course-a-pied': 'RUNNING',
  trail: 'TRAIL',
  marche: 'WALKING',
  velo: 'CYCLING',
  vtt: 'CYCLING',
  gravel: 'CYCLING',
  'home-trainer': 'CYCLING',
  natation: 'SWIMMING',
  'ski-alpin': 'SNOW',
  'ski-randonnee': 'SNOW',
  'ski-de-fond': 'SNOW',
  raquettes: 'SNOW',
  escalade: 'CLIMBING',
  'via-ferrata': 'CLIMBING',
  alpinisme: 'CLIMBING',
  'course-orientation': 'ORIENTEERING',
  football: 'BALL',
  rugby: 'BALL',
  basketball: 'BALL',
  handball: 'BALL',
  volleyball: 'BALL',
  tennis: 'RACKET',
  padel: 'RACKET',
  badminton: 'RACKET',
  'tennis-de-table': 'RACKET',
  boxe: 'COMBAT',
  'sports-de-combat': 'COMBAT',
  danse: 'FITNESS',
  'kayak-canoe': 'WATER',
  aviron: 'WATER',
  paddle: 'WATER',
  surf: 'WATER',
  'roller-patinage': 'FITNESS',
  triathlon: 'TRIATHLON',
  'hyrox-cross-training': 'FITNESS',
};

const REVIEW_SLUGS = new Set(['crawl', 'brasse', 'dos', 'papillon']);

const MILESTONE_BY_SLUG: Record<string, string> = {
  'cap-5km-termines': '5K',
  'cap-10km-termines': '10K',
  'semi-marathons-termines': '21K',
  'marathons-termines': '42K',
  'trails-20km': '20K',
  'trails-40km': '40K',
  'trails-60km': '60K',
  'trails-80km': '80K',
  'marches-10km': '10K',
  'marches-20km': '20K',
  'randonnees-30km': '30K',
  'sorties-velo-50km': '50K',
  'sorties-velo-100km': '100K',
  'sorties-ski-randonnee-1000dplus': '1000+',
};

const COUNT_LABEL_BY_SLUG: Record<string, string> = {
  'blocs-realises': 'BLOC',
  'voies-realisees': 'VOIE',
};

function resolveSportMetricVisual(mastery: Mastery): MasterySportMetricVisual | null {
  const sport = SPORT_BY_CATEGORY[mastery.categoryId];
  if (!sport) return null;

  if (REVIEW_SLUGS.has(mastery.id)) {
    return null;
  }

  if (MILESTONE_BY_SLUG[mastery.id]) {
    return {
      type: 'sport_metric',
      sport,
      metric: 'MILESTONE',
      label: MILESTONE_BY_SLUG[mastery.id],
    };
  }

  if (mastery.id === 'pas') {
    return {
      type: 'sport_metric',
      sport: 'WALKING',
      metric: 'STEPS',
      label: null,
    };
  }

  if (COUNT_LABEL_BY_SLUG[mastery.id]) {
    return {
      type: 'sport_metric',
      sport,
      metric: 'COUNT',
      label: COUNT_LABEL_BY_SLUG[mastery.id],
    };
  }

  if (
    mastery.id === 'sparrings' ||
    mastery.id === 'combats' ||
    mastery.id.startsWith('combats-') ||
    mastery.id.startsWith('matchs-')
  ) {
    return {
      type: 'sport_metric',
      sport,
      metric: 'MATCH',
      label: null,
    };
  }

  if (mastery.id.startsWith('rounds-')) {
    return {
      type: 'sport_metric',
      sport,
      metric: 'ROUNDS',
      label: null,
    };
  }

  if (mastery.id.startsWith('seances-') || mastery.id.startsWith('cours-')) {
    return {
      type: 'sport_metric',
      sport,
      metric: 'FREQUENCY',
      label: null,
    };
  }

  if (mastery.id === 'epreuves-triathlon') {
    return {
      type: 'sport_metric',
      sport,
      metric: 'EVENT',
      label: null,
    };
  }

  if (mastery.id.startsWith('sorties-')) {
    return {
      type: 'sport_metric',
      sport,
      metric: 'OUTING',
      label: null,
    };
  }

  if (mastery.id.startsWith('distance-') || mastery.id === 'marche') {
    return {
      type: 'sport_metric',
      sport,
      metric: 'DISTANCE',
      label: null,
    };
  }

  if (mastery.id.startsWith('duree-')) {
    return {
      type: 'sport_metric',
      sport,
      metric: 'DURATION',
      label: null,
    };
  }

  if (mastery.id.startsWith('dplus-')) {
    return {
      type: 'sport_metric',
      sport,
      metric: 'ELEVATION',
      label: null,
    };
  }

  return null;
}

export function resolveMasteryVisual(mastery: Mastery): MasteryVisual {
  if (mastery.linkedExerciseImageUrl || mastery.linkedExerciseVisualCategory) {
    return {
      type: 'exercise',
      exerciseName: mastery.linkedExerciseName || mastery.name,
      imageUrl: mastery.linkedExerciseImageUrl || null,
      visualCategory: mastery.linkedExerciseVisualCategory || null,
    };
  }

  const sportMetricVisual = resolveSportMetricVisual(mastery);
  if (sportMetricVisual) {
    return sportMetricVisual;
  }

  return {
    type: 'category',
    categoryId: mastery.categoryId,
  };
}
