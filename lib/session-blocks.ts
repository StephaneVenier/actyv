export type SessionBlockType = 'reps' | 'duration' | 'distance' | 'free';

export type SessionBlockDisplayLike = {
  name: string;
  block_type: SessionBlockType;
  target_value: number | null | undefined;
  sets_count: number | null | undefined;
  charge_kg: number | null | undefined;
  rest_seconds?: number | null | undefined;
};

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

export function formatBlockTypeLabel(
  block: Pick<SessionBlockDisplayLike, 'block_type'>
) {
  return getSessionBlockTypeLabel(block.block_type);
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
  setsCount: number | null | undefined,
  chargeKg?: number | null | undefined
) {
  const normalizedSets = setsCount && setsCount > 0 ? setsCount : 1;
  const targetLabel = formatSessionBlockTarget(blockType, targetValue);
  const normalizedCharge =
    chargeKg === null || chargeKg === undefined || Number.isNaN(Number(chargeKg))
      ? null
      : Number(chargeKg);
  const chargeLabel = normalizedCharge && normalizedCharge > 0 ? ` • ${normalizedCharge} kg` : '';

  if (blockType === 'free') {
    return `${normalizedSets} serie${normalizedSets > 1 ? 's' : ''} · ${targetLabel}${chargeLabel}`;
  }

  return `${normalizedSets} serie${normalizedSets > 1 ? 's' : ''} x ${targetLabel}${chargeLabel}`;
}

function formatCompactDurationValue(seconds: number) {
  const normalizedSeconds = Math.max(0, Math.trunc(seconds));

  if (normalizedSeconds >= 60) {
    const minutes = Math.floor(normalizedSeconds / 60);
    const remainingSeconds = normalizedSeconds % 60;
    return remainingSeconds > 0 ? `${minutes} min ${remainingSeconds} s` : `${minutes} min`;
  }

  return `${normalizedSeconds} s`;
}

function formatCompactDistanceValue(distanceMeters: number) {
  if (distanceMeters >= 1000) {
    const km = distanceMeters / 1000;
    const hasDecimals = Math.abs(km % 1) > 0.001;
    return `${km.toLocaleString('fr-FR', {
      minimumFractionDigits: hasDecimals ? 1 : 0,
      maximumFractionDigits: hasDecimals ? 1 : 1,
    })} km`;
  }

  return `${distanceMeters.toLocaleString('fr-FR')} m`;
}

export function formatBlockMainValue(block: SessionBlockDisplayLike) {
  const normalizedSets = normalizeSessionSetsCount(block.sets_count);
  const normalizedTarget =
    Number.isFinite(Number(block.target_value)) && Number(block.target_value) > 0
      ? Number(block.target_value)
      : null;

  if (block.block_type === 'free') {
    return normalizedSets > 1 ? `${normalizedSets} series libres` : 'Bloc libre';
  }

  if (normalizedTarget === null) {
    return normalizedSets > 1 ? `${normalizedSets} series` : 'Sans cible';
  }

  if (block.block_type === 'reps') {
    return `${normalizedSets} x ${normalizedTarget} reps`;
  }

  if (block.block_type === 'duration') {
    return normalizedSets > 1
      ? `${normalizedSets} x ${formatCompactDurationValue(normalizedTarget)}`
      : formatCompactDurationValue(normalizedTarget);
  }

  if (block.block_type === 'distance') {
    return normalizedSets > 1
      ? `${normalizedSets} x ${formatCompactDistanceValue(normalizedTarget)}`
      : formatCompactDistanceValue(normalizedTarget);
  }

  return formatSessionBlockSummary(
    block.block_type,
    block.target_value,
    block.sets_count,
    block.charge_kg
  );
}

export function formatBlockSecondaryValues(block: SessionBlockDisplayLike) {
  const values: string[] = [];
  const normalizedSets = normalizeSessionSetsCount(block.sets_count);
  const normalizedTarget =
    Number.isFinite(Number(block.target_value)) && Number(block.target_value) > 0
      ? Number(block.target_value)
      : null;
  const normalizedCharge =
    Number.isFinite(Number(block.charge_kg)) && Number(block.charge_kg) > 0
      ? Number(block.charge_kg)
      : null;
  const normalizedRest = formatSessionRestSeconds(block.rest_seconds);

  values.push(`Type : ${formatBlockTypeLabel(block)}`);

  if (block.block_type === 'reps' && normalizedTarget !== null) {
    values.push(`Series x reps : ${normalizedSets} x ${normalizedTarget}`);
  } else if (block.block_type === 'duration' && normalizedTarget !== null) {
    values.push(`Duree : ${formatCompactDurationValue(normalizedTarget)}`);
  } else if (block.block_type === 'distance' && normalizedTarget !== null) {
    values.push(`Distance : ${formatCompactDistanceValue(normalizedTarget)}`);
  } else if (block.block_type === 'free') {
    values.push('Bloc libre');
  }

  if (normalizedCharge !== null) {
    values.push(`Charge : ${normalizedCharge} kg`);
  }

  if (normalizedRest) {
    values.push(`Repos : ${normalizedRest}`);
  }

  return values;
}

export function getBlockAccentColor(block: Pick<SessionBlockDisplayLike, 'block_type' | 'charge_kg'>) {
  if (block.block_type === 'reps') {
    return Number(block.charge_kg || 0) > 0 ? 'emerald' : 'teal';
  }

  if (block.block_type === 'duration') {
    return 'cyan';
  }

  if (block.block_type === 'distance') {
    return 'blue';
  }

  return 'slate';
}

export function getBlockProgress(
  block: Pick<SessionBlockDisplayLike, 'sets_count'>,
  completedSets = 0,
  isCompleted = false
) {
  const total = normalizeSessionSetsCount(block.sets_count);
  const current = isCompleted ? total : Math.min(Math.max(Math.trunc(completedSets), 0), total);

  return {
    current,
    total,
    label: `${current} / ${total}`,
  };
}

export function getBlockStatus({
  isCompleted,
  isCurrent,
}: {
  isCompleted: boolean;
  isCurrent?: boolean;
}) {
  if (isCompleted) {
    return 'done' as const;
  }

  if (isCurrent) {
    return 'current' as const;
  }

  return 'todo' as const;
}

export function formatSessionRestSeconds(restSeconds: number | null | undefined) {
  const normalizedRest = Number(restSeconds);

  if (!Number.isFinite(normalizedRest) || normalizedRest < 0) {
    return null;
  }

  if (normalizedRest === 0) {
    return 'Sans repos';
  }

  return `${Math.trunc(normalizedRest)} sec repos`;
}

export function getSessionBlockVolumeKg(
  blockType: SessionBlockType,
  targetValue: number | null | undefined,
  setsCount: number | null | undefined,
  chargeKg: number | null | undefined
) {
  if (blockType !== 'reps') {
    return null;
  }

  const reps = Number(targetValue);
  const charge = Number(chargeKg);
  const normalizedSets = normalizeSessionSetsCount(setsCount);

  if (!Number.isFinite(reps) || reps <= 0 || !Number.isFinite(charge) || charge <= 0) {
    return null;
  }

  const volume = normalizedSets * reps * charge;
  return Number.isFinite(volume) && volume > 0 ? volume : null;
}

export function formatSessionVolumeKg(volumeKg: number | null | undefined) {
  if (volumeKg === null || volumeKg === undefined || !Number.isFinite(Number(volumeKg)) || Number(volumeKg) <= 0) {
    return null;
  }

  const normalizedVolume = Number(volumeKg);
  const hasDecimals = Math.abs(normalizedVolume % 1) > 0.001;

  return `${normalizedVolume.toLocaleString('fr-FR', {
    minimumFractionDigits: hasDecimals ? 1 : 0,
    maximumFractionDigits: hasDecimals ? 1 : 0,
  })} kg`;
}

export function getWorkoutCaloriesPerMinute(sport: string | null | undefined) {
  const normalizedSport = (sport || '').trim().toLowerCase();

  if (
    normalizedSport.includes('musculation') ||
    normalizedSport.includes('renfo') ||
    normalizedSport.includes('fitness') ||
    normalizedSport.includes('strength')
  ) {
    return 6.5;
  }

  if (
    normalizedSport.includes('cardio') ||
    normalizedSport.includes('course') ||
    normalizedSport.includes('running') ||
    normalizedSport.includes('velo') ||
    normalizedSport.includes('cycl') ||
    normalizedSport.includes('natation') ||
    normalizedSport.includes('swim') ||
    normalizedSport.includes('hiit')
  ) {
    return 10;
  }

  if (
    normalizedSport.includes('marche') ||
    normalizedSport.includes('walk') ||
    normalizedSport.includes('rando') ||
    normalizedSport.includes('hike')
  ) {
    return 5;
  }

  return 7;
}

export function getSessionEstimatedDuration(blocks: SessionBlockDisplayLike[]) {
  const totals = blocks.reduce(
    (accumulator, block) => {
      const sets = normalizeSessionSetsCount(block.sets_count);
      const target =
        Number.isFinite(Number(block.target_value)) && Number(block.target_value) > 0
          ? Number(block.target_value)
          : 0;
      const rest =
        Number.isFinite(Number(block.rest_seconds)) && Number(block.rest_seconds) >= 0
          ? Number(block.rest_seconds)
          : 0;

      if (block.block_type === 'duration' && target > 0) {
        accumulator.known = true;
        accumulator.seconds += target * sets;
      } else if (block.block_type === 'reps' && target > 0) {
        accumulator.seconds += sets * Math.max(target * 2.5, 20);
      } else if (block.block_type === 'distance' && target > 0) {
        accumulator.seconds += Math.max(target / 3, 60);
      } else if (block.block_type === 'free') {
        accumulator.seconds += sets * 45;
      }

      if (sets > 1 && rest > 0) {
        accumulator.seconds += rest * (sets - 1);
      }

      return accumulator;
    },
    { seconds: 0, known: false }
  );

  if (!totals.known && totals.seconds <= 0) {
    return null;
  }

  return Math.max(0, Math.round(totals.seconds));
}

export function getSessionEstimatedVolume(blocks: SessionBlockDisplayLike[]) {
  const totalVolume = blocks.reduce((total, block) => {
    const volume = getSessionBlockVolumeKg(
      block.block_type,
      block.target_value,
      block.sets_count,
      block.charge_kg
    );

    return total + (volume ?? 0);
  }, 0);

  return totalVolume > 0 ? totalVolume : null;
}

export function getEstimatedWorkoutCalories(
  elapsedSeconds: number | null | undefined,
  sport: string | null | undefined
) {
  const normalizedSeconds = Number(elapsedSeconds);

  if (!Number.isFinite(normalizedSeconds) || normalizedSeconds <= 0) {
    return null;
  }

  const minutes = normalizedSeconds / 60;
  const calories = minutes * getWorkoutCaloriesPerMinute(sport);

  if (!Number.isFinite(calories) || calories <= 0) {
    return null;
  }

  return Math.round(calories);
}

export function formatEstimatedWorkoutCalories(calories: number | null | undefined) {
  if (calories === null || calories === undefined || !Number.isFinite(Number(calories)) || Number(calories) <= 0) {
    return null;
  }

  return `~${Math.round(Number(calories))} kcal`;
}

export function normalizeSessionSetsCount(
  value: number | string | null | undefined
) {
  const parsedValue =
    typeof value === 'string' ? Number.parseInt(value, 10) : Number(value);

  if (!Number.isFinite(parsedValue) || parsedValue <= 0) {
    return 1;
  }

  return Math.trunc(parsedValue);
}
