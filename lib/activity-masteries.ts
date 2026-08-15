export const ACTIVITY_MASTERY_SPORTS = [
  'course-a-pied',
  'trail',
  'marche',
  'velo',
  'vtt',
  'natation',
] as const;

export type ActivityMasterySport = (typeof ACTIVITY_MASTERY_SPORTS)[number];

function normalizeSportValue(value: string | null | undefined) {
  return (value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

export function resolveActivityMasterySport(
  sport: string | null | undefined
): ActivityMasterySport | null {
  const normalized = normalizeSportValue(sport);

  if (
    [
      'course-a-pied',
      'course',
      'running',
      'run',
      'jog',
      'jogging',
      'footing',
    ].includes(normalized)
  ) {
    return 'course-a-pied';
  }

  if (['trail', 'trail-running', 'trail-run'].includes(normalized)) {
    return 'trail';
  }

  if (['marche', 'walking', 'walk', 'randonnee', 'hiking', 'hike'].includes(normalized)) {
    return 'marche';
  }

  if (['velo', 'bike', 'cycling', 'cyclisme'].includes(normalized)) {
    return 'velo';
  }

  if (['vtt', 'mtb', 'mountain-bike', 'mountain-biking'].includes(normalized)) {
    return 'vtt';
  }

  if (['natation', 'swimming', 'swim'].includes(normalized)) {
    return 'natation';
  }

  return null;
}

export function supportsActivityDistanceMetric(
  sport: ActivityMasterySport | null
): sport is ActivityMasterySport {
  return Boolean(sport);
}

export function supportsActivityDurationMetric(
  sport: ActivityMasterySport | null
): sport is ActivityMasterySport {
  return Boolean(sport);
}

export function supportsActivityElevationMetric(sport: ActivityMasterySport | null) {
  return (
    sport === 'course-a-pied' ||
    sport === 'trail' ||
    sport === 'marche' ||
    sport === 'velo' ||
    sport === 'vtt'
  );
}
