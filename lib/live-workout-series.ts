import type { WorkoutSetPerformance } from './workout-history';

type SeriesLine = { id: string };

// Old snapshots use positions; once adopted, a row follows its stable line ID.
export function reconcileLiveSeries(
  rows: WorkoutSetPerformance[], blockId: string, lines: SeriesLine[]
): WorkoutSetPerformance[] {
  return rows.flatMap(row => {
    if (row.block_id !== blockId) return [row];
    const index = row.live_line_id
      ? lines.findIndex(line => line.id === row.live_line_id)
      : row.set_number - 1;
    if (index < 0 || index >= lines.length) return [];
    return [{ ...row, live_line_id: lines[index].id, set_number: index + 1, line_number: index + 1 }];
  });
}

export function isLiveSeriesCompleted(rows: WorkoutSetPerformance[], blockId: string, line: SeriesLine, index: number) {
  return rows.some(row => row.block_id === blockId && row.status === 'completed' &&
    (row.live_line_id ? row.live_line_id === line.id : row.set_number === index + 1));
}

export function removeLiveSeries<T extends SeriesLine>(rows: WorkoutSetPerformance[], blockId: string, lines: T[], index: number) {
  if (!lines[index] || lines.length <= 1 || isLiveSeriesCompleted(rows, blockId, lines[index], index)) return null;
  const ownedRows = reconcileLiveSeries(rows, blockId, lines);
  const nextLines = lines.filter((_, i) => i !== index);
  return { lines: nextLines, rows: reconcileLiveSeries(ownedRows, blockId, nextLines) };
}

export function uncheckLiveSeries(rows: WorkoutSetPerformance[], blockId: string, lines: SeriesLine[], index: number) {
  return reconcileLiveSeries(rows, blockId, lines).filter(row =>
    row.block_id !== blockId || row.live_line_id !== lines[index]?.id);
}
