import type { SessionBlockType } from './session-blocks';
import type { WorkoutSetPerformance } from './workout-history';

type SnapshotBlock = { id: string; block_type: SessionBlockType };

function nonNegative(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
}

export function normalizeLiveSetPerformances(value: unknown, blocks: SnapshotBlock[]): WorkoutSetPerformance[] {
  if (!Array.isArray(value)) return [];
  const bySet = new Map<string, WorkoutSetPerformance>();
  for (const raw of value) {
    if (!raw || typeof raw !== 'object') continue;
    const entry = raw as WorkoutSetPerformance;
    const block = blocks.find((candidate) => candidate.id === entry.block_id);
    if (!block || typeof entry.block_name !== 'string' ||
        !Number.isInteger(entry.set_number) || entry.set_number < 1 ||
        (entry.status !== 'completed' && entry.status !== 'skipped')) continue;
    const completed = entry.status === 'completed';
    const normalized: WorkoutSetPerformance = {
      ...entry,
      exercise_id: typeof entry.exercise_id === 'string' ? entry.exercise_id : null,
      block_type: entry.block_type === 'reps' || entry.block_type === 'duration' ||
        entry.block_type === 'distance' || entry.block_type === 'free' ? entry.block_type : block.block_type,
      line_number: Number.isInteger(entry.line_number) && Number(entry.line_number) > 0 ? entry.line_number : null,
      planned_reps: nonNegative(entry.planned_reps),
      actual_reps: completed ? nonNegative(entry.actual_reps) : null,
      planned_charge_kg: nonNegative(entry.planned_charge_kg),
      actual_charge_kg: completed ? nonNegative(entry.actual_charge_kg) : null,
      planned_value: nonNegative(entry.planned_value),
      actual_value: completed ? nonNegative(entry.actual_value) : null,
      actual_text: completed && typeof entry.actual_text === 'string' ? entry.actual_text : null,
    };
    const key = `${entry.block_id}:${entry.set_number}`;
    // An already validated snapshot wins over a stale skipped copy.
    if (bySet.get(key)?.status !== 'completed') bySet.set(key, normalized);
  }
  return [...bySet.values()];
}
