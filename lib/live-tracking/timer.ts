import type { LiveTrackingState } from '@/lib/live-tracking/types';

export function getActiveDurationMs(state: Pick<LiveTrackingState, 'status' | 'startedAtMs' | 'pausedAtMs' | 'finishedAtMs' | 'accumulatedPausedMs' | 'collectionStoppedAtMs' | 'collectionGaps' | 'pausePeriods'>, nowMs: number) {
  if (!state.startedAtMs) {
    return 0;
  }

  if (state.collectionGaps?.length) {
    const end = state.collectionStoppedAtMs ?? state.finishedAtMs ?? nowMs;
    const intervals = [...(state.pausePeriods || []), ...state.collectionGaps]
      .map(p => [Math.max(state.startedAtMs!, p.startedAtMs), Math.min(end, p.endedAtMs ?? end)])
      .filter(([start, stop]) => stop > start).sort((a, b) => a[0] - b[0]);
    let excluded = 0, lastEnd = state.startedAtMs;
    for (const [start, stop] of intervals) {
      excluded += Math.max(0, stop - Math.max(start, lastEnd));
      lastEnd = Math.max(lastEnd, stop);
    }
    return Math.max(0, end - state.startedAtMs - excluded);
  }

  if (state.status === 'paused' && state.pausedAtMs) {
    return Math.max(0, state.pausedAtMs - state.startedAtMs - state.accumulatedPausedMs);
  }

  if (state.status === 'finished' && state.finishedAtMs) {
    return Math.max(0, state.finishedAtMs - state.startedAtMs - state.accumulatedPausedMs);
  }

  return Math.max(0, (state.collectionStoppedAtMs ?? nowMs) - state.startedAtMs - state.accumulatedPausedMs);
}

