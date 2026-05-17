export type SessionBlockType = 'reps' | 'duration' | 'distance' | 'free';

export const SESSION_BLOCK_TYPES: SessionBlockType[] = [
  'reps',
  'duration',
  'distance',
  'free',
];

export function getSessionBlockTypeLabel(blockType: SessionBlockType) {
  switch (blockType) {
    case 'reps':
      return 'Repetitions';
    case 'duration':
      return 'Duree';
    case 'distance':
      return 'Distance';
    case 'free':
      return 'Libre';
    default:
      return 'Bloc';
  }
}

export function getSessionBlockInputLabel(blockType: SessionBlockType) {
  switch (blockType) {
    case 'reps':
      return 'Cible (reps)';
    case 'duration':
      return 'Cible (sec)';
    case 'distance':
      return 'Cible (m)';
    case 'free':
      return 'Consigne libre';
    default:
      return 'Cible';
  }
}

export function getSessionBlockPlaceholder(blockType: SessionBlockType) {
  switch (blockType) {
    case 'reps':
      return 'Ex : 15';
    case 'duration':
      return 'Ex : 45';
    case 'distance':
      return 'Ex : 400';
    case 'free':
      return 'Aucun objectif chiffre';
    default:
      return 'Ex : 1';
  }
}

export function formatSessionBlockTarget(
  blockType: SessionBlockType,
  targetValue: number | null | undefined
) {
  if (blockType === 'free') {
    return 'Libre';
  }

  if (targetValue === null || targetValue === undefined || Number.isNaN(Number(targetValue))) {
    return 'Sans cible';
  }

  const value = Number(targetValue);

  switch (blockType) {
    case 'reps':
      return `${value} rep${value > 1 ? 's' : ''}`;
    case 'duration':
      return `${value} sec`;
    case 'distance':
      return `${value} m`;
    default:
      return `${value}`;
  }
}

export function formatSessionBlockSummary(
  blockType: SessionBlockType,
  targetValue: number | null | undefined,
  setsCount: number | null | undefined
) {
  const normalizedSets = setsCount && setsCount > 0 ? setsCount : 1;
  const targetLabel = formatSessionBlockTarget(blockType, targetValue);

  if (blockType === 'free') {
    return `${normalizedSets} serie${normalizedSets > 1 ? 's' : ''} · ${targetLabel}`;
  }

  return `${normalizedSets} serie${normalizedSets > 1 ? 's' : ''} x ${targetLabel}`;
}
