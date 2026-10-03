import { DEFAULT_LIVE_SPORT } from '@/lib/live-tracking/config';
import { createInitialElevationState } from '@/lib/live-tracking/elevation';
import { calculateAveragePaceSecondsPerKm, calculateAverageSpeedKmh } from '@/lib/live-tracking/pace';
import { getActiveDurationMs } from '@/lib/live-tracking/timer';
import type {
  LiveActivitySport,
  LiveTrackingState,
  LiveTrackingSummary,
  PersistedLiveSession,
} from '@/lib/live-tracking/types';

export function createInitialLiveTrackingState(
  sport: LiveActivitySport = DEFAULT_LIVE_SPORT
): LiveTrackingState {
  return {
    sessionId: null,
    ownerUserId: null,
    pausePeriods: [],
    status: 'idle',
    sport,
    startedAtMs: null,
    pausedAtMs: null,
    finishedAtMs: null,
    accumulatedPausedMs: 0,
    distanceM: 0,
    elevationGainM: 0,
    elevationLossM: 0,
    lastPoint: null,
    referencePoint: null,
    acceptedPoints: [],
    speedWindowPoints: [],
    elevationState: createInitialElevationState(),
    gpsStatus: 'searching',
    lastSequence: 0,
    currentPaceSecondsPerKm: null,
    averagePaceSecondsPerKm: null,
    currentSpeedKmh: null,
    averageSpeedKmh: null,
    awaitingResumeRebase: false,
  };
}

export function createLiveSessionId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  if (typeof crypto === 'undefined' || typeof crypto.getRandomValues !== 'function') {
    throw new Error('Impossible de generer un identifiant Live securise.');
  }
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function buildPersistedSession(state: LiveTrackingState): PersistedLiveSession {
  return {
    version: 1,
    state,
    updatedAtMs: Date.now(),
  };
}

export function isRestorableSession(session: PersistedLiveSession | null) {
  if (!session || session.version !== 1) {
    return false;
  }

  return session.state.status === 'running' || session.state.status === 'paused';
}

export function buildLiveTrackingSummary(
  state: LiveTrackingState,
  nowMs: number = Date.now()
): LiveTrackingSummary {
  const activeDurationMs = getActiveDurationMs(state, nowMs);
  const averageSpeedKmh =
    state.averageSpeedKmh ?? calculateAverageSpeedKmh(state.distanceM, activeDurationMs);
  const averagePaceSecondsPerKm =
    state.averagePaceSecondsPerKm ??
    calculateAveragePaceSecondsPerKm(state.distanceM, activeDurationMs);

  return {
    sport: state.sport,
    distanceM: state.distanceM,
    activeDurationMs,
    elevationGainM: state.elevationGainM,
    elevationLossM: state.elevationLossM,
    pointCount: state.acceptedPoints.length,
    averagePaceSecondsPerKm,
    averageSpeedKmh,
  };
}
