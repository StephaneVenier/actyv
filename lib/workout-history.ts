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
  estimated_calories?: number;
  earned_xp?: number;
  awarded_badges?: string[];
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
    estimated_calories: toPositiveNumber(candidate.estimated_calories),
    earned_xp: toPositiveNumber(candidate.earned_xp),
    completion_type:
      candidate.completion_type === 'full' || candidate.completion_type === 'partial'
        ? candidate.completion_type
        : undefined,
    awarded_badges: Array.isArray(candidate.awarded_badges)
      ? candidate.awarded_badges.filter((value): value is string => typeof value === 'string' && value.length > 0)
      : undefined,
  };
}
