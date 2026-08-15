import type { LiveTrackingState } from '@/lib/live-tracking/types';

export function getActiveDurationMs(state: Pick<LiveTrackingState, 'status' | 'startedAtMs' | 'pausedAtMs' | 'finishedAtMs' | 'accumulatedPausedMs'>, nowMs: number) {
  if (!state.startedAtMs) {
    return 0;
  }

  if (state.status === 'paused' && state.pausedAtMs) {
    return Math.max(0, state.pausedAtMs - state.startedAtMs - state.accumulatedPausedMs);
  }

  if (state.status === 'finished' && state.finishedAtMs) {
    return Math.max(0, state.finishedAtMs - state.startedAtMs - state.accumulatedPausedMs);
  }

  return Math.max(0, nowMs - state.startedAtMs - state.accumulatedPausedMs);
}

