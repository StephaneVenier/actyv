export type WorkoutSetPerformance = {
  block_id: string;
  block_name: string;
  set_number: number;
  planned_reps: number | null;
  actual_reps: number | null;
  planned_charge_kg: number | null;
  actual_charge_kg: number | null;
  status: 'completed' | 'skipped';
};

export type WorkoutCompletionMetadata = {
  stats_version?: number;
  total_blocks?: number;
  completed_blocks?: number;
  skipped_blocks?: number;
  total_sets?: number;
  completed_sets?: number;
  skipped_sets?: number;
  completion_rate?: number;
  completion_type?: 'full' | 'partial';
  total_repetitions?: number;
  total_volume?: number;
  planned_total_volume?: number;
  actual_total_volume?: number;
  estimated_calories?: number;
  earned_xp?: number;
  awarded_badges?: string[];
  actual_sets?: WorkoutSetPerformance[];
  set_performances?: WorkoutSetPerformance[];
};

function toPositiveNumber(value: unknown) {
  const normalizedValue = Number(value);
  return Number.isFinite(normalizedValue) && normalizedValue >= 0 ? normalizedValue : undefined;
}

export function parseWorkoutCompletionMetadata(raw: unknown): WorkoutCompletionMetadata {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return {};
  }

  const candidate = raw as Record<string, unknown>;

  const parseSetPerformances = (value: unknown) =>
    Array.isArray(value)
      ? value.flatMap((entry) => {
          if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return [];
          const candidateEntry = entry as Record<string, unknown>;
          const blockId = typeof candidateEntry.block_id === 'string' ? candidateEntry.block_id : '';
          const blockName = typeof candidateEntry.block_name === 'string' ? candidateEntry.block_name : '';
          const setNumber = toPositiveNumber(candidateEntry.set_number);
          const status =
            candidateEntry.status === 'completed' || candidateEntry.status === 'skipped'
              ? candidateEntry.status
              : undefined;

          if (!blockId || !blockName || !setNumber || !status) {
            return [];
          }

          return [
            {
              block_id: blockId,
              block_name: blockName,
              set_number: setNumber,
              planned_reps: toPositiveNumber(candidateEntry.planned_reps) ?? null,
              actual_reps: toPositiveNumber(candidateEntry.actual_reps) ?? null,
              planned_charge_kg: toPositiveNumber(candidateEntry.planned_charge_kg) ?? null,
              actual_charge_kg: toPositiveNumber(candidateEntry.actual_charge_kg) ?? null,
              status,
            } satisfies WorkoutSetPerformance,
          ];
        })
      : undefined;

  const actualSets = parseSetPerformances(candidate.actual_sets);
  const legacySetPerformances = parseSetPerformances(candidate.set_performances);

  return {
    stats_version: toPositiveNumber(candidate.stats_version),
    total_blocks: toPositiveNumber(candidate.total_blocks),
    completed_blocks: toPositiveNumber(candidate.completed_blocks),
    skipped_blocks: toPositiveNumber(candidate.skipped_blocks),
    total_sets: toPositiveNumber(candidate.total_sets),
    completed_sets: toPositiveNumber(candidate.completed_sets),
    skipped_sets: toPositiveNumber(candidate.skipped_sets),
    completion_rate: toPositiveNumber(candidate.completion_rate),
    total_repetitions: toPositiveNumber(candidate.total_repetitions),
    total_volume: toPositiveNumber(candidate.total_volume),
    planned_total_volume: toPositiveNumber(candidate.planned_total_volume),
    actual_total_volume: toPositiveNumber(candidate.actual_total_volume),
    estimated_calories: toPositiveNumber(candidate.estimated_calories),
    earned_xp: toPositiveNumber(candidate.earned_xp),
    completion_type:
      candidate.completion_type === 'full' || candidate.completion_type === 'partial'
        ? candidate.completion_type
        : undefined,
    awarded_badges: Array.isArray(candidate.awarded_badges)
      ? candidate.awarded_badges.filter((value): value is string => typeof value === 'string' && value.length > 0)
      : undefined,
    actual_sets: actualSets ?? legacySetPerformances,
    set_performances: legacySetPerformances ?? actualSets,
  };
}
