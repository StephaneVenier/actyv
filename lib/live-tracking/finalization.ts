import { liveTrackingReducer } from '@/lib/live-tracking/reducer';
import { getActiveDurationMs } from '@/lib/live-tracking/timer';
import type { FinishedLiveActivity, LiveGpsPoint, LiveTrackingState } from '@/lib/live-tracking/types';

export function isLiveUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

export function replayLivePoints(state: LiveTrackingState, points: LiveGpsPoint[]) {
  return [...points].sort((a, b) => (a.sequence ?? a.timestamp) - (b.sequence ?? b.timestamp))
    .reduce((current, point) => {
      if (point.sessionId && point.sessionId !== current.sessionId) return current;
      if (point.sequence != null && point.sequence > current.lastSequence + 1) {
        throw new Error('Des points manquent dans la trace native. Finalisation interrompue sans effacer les donnees.');
      }
      return liveTrackingReducer(current, { type: 'GPS_POINT_RECEIVED', point });
    }, state);
}

export function buildFinishedLiveActivity(state: LiveTrackingState, finishedAtMs: number): FinishedLiveActivity {
  finishedAtMs = state.collectionStoppedAtMs ?? finishedAtMs;
  if (!state.sessionId || !isLiveUuid(state.sessionId) || state.startedAtMs == null) {
    throw new Error('Identifiant Live invalide : cette ancienne session ne peut pas etre synchronisee.');
  }
  const finished = liveTrackingReducer(state, { type: 'FINISH', nowMs: finishedAtMs });
  if (finished.status !== 'finished') throw new Error('Le Live ne peut pas etre termine.');
  const elapsedDurationMs = Math.max(0, finishedAtMs - state.startedAtMs);
  const activeDurationMs = getActiveDurationMs(finished, finishedAtMs);
  return {
    version: 1, sessionId: state.sessionId, ownerUserId: state.ownerUserId ?? null,
    sport: state.sport, startedAtMs: state.startedAtMs, finishedAtMs,
    distanceM: finished.distanceM, activeDurationMs, elapsedDurationMs,
    pausedDurationMs: Math.max(0, elapsedDurationMs - activeDurationMs),
    elevationGainM: finished.elevationGainM, elevationLossM: finished.elevationLossM,
    state: finished, syncStatus: 'pending', syncError: null,
  };
}

// The native stop promise must acknowledge stopped collection, retaining its trace.
export async function finalizeLiveActivity(options: {
  getState: () => LiveTrackingState;
  stopCollection: () => Promise<void>;
  drainPoints: () => Promise<void>;
  persist: (snapshot: FinishedLiveActivity) => void;
  cleanup: () => Promise<void>;
  now: () => number;
}) {
  await options.stopCollection();
  await options.drainPoints();
  const snapshot = buildFinishedLiveActivity(options.getState(), options.now());
  options.persist(snapshot); // Throws on quota/storage failure: do NOT delete native data.
  try { await options.cleanup(); } catch { /* Durable snapshot permits cleanup on retry. */ }
  return snapshot;
}
