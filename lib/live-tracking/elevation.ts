import { LIVE_ELEVATION_CONFIG } from './config';
import type { LiveElevationState, LiveGpsPoint } from './types';

export function createInitialElevationState(): LiveElevationState {
  return {
    recentAltitudesM: [],
    lastSmoothedAltitudeM: null,
    pendingGainM: 0,
    pendingLossM: 0,
    totalGainM: 0,
    totalLossM: 0,
    lastAltitudeAccuracyM: null,
  };
}

function median(values: number[]) {
  if (values.length === 0) {
    return null;
  }

  const sortedValues = [...values].sort((a, b) => a - b);
  const middleIndex = Math.floor(sortedValues.length / 2);

  if (sortedValues.length % 2 === 0) {
    return (sortedValues[middleIndex - 1] + sortedValues[middleIndex]) / 2;
  }

  return sortedValues[middleIndex];
}

export function normalizeElevationState(
  previousState: LiveElevationState | null | undefined
): LiveElevationState {
  if (!previousState) {
    return createInitialElevationState();
  }

  return {
    recentAltitudesM: Array.isArray(previousState.recentAltitudesM)
      ? previousState.recentAltitudesM.filter((value) => Number.isFinite(value))
      : [],
    lastSmoothedAltitudeM:
      typeof previousState.lastSmoothedAltitudeM === 'number' &&
      Number.isFinite(previousState.lastSmoothedAltitudeM)
        ? previousState.lastSmoothedAltitudeM
        : null,
    pendingGainM:
      typeof previousState.pendingGainM === 'number' && Number.isFinite(previousState.pendingGainM)
        ? previousState.pendingGainM
        : 0,
    pendingLossM:
      typeof previousState.pendingLossM === 'number' && Number.isFinite(previousState.pendingLossM)
        ? previousState.pendingLossM
        : 0,
    totalGainM:
      typeof previousState.totalGainM === 'number' && Number.isFinite(previousState.totalGainM)
        ? previousState.totalGainM
        : 0,
    totalLossM:
      typeof previousState.totalLossM === 'number' && Number.isFinite(previousState.totalLossM)
        ? previousState.totalLossM
        : 0,
    lastAltitudeAccuracyM:
      typeof previousState.lastAltitudeAccuracyM === 'number' &&
      Number.isFinite(previousState.lastAltitudeAccuracyM)
        ? previousState.lastAltitudeAccuracyM
        : null,
  };
}

export function updateElevation(
  previousState: LiveElevationState,
  nextPoint: LiveGpsPoint
): LiveElevationState {
  const normalizedState = normalizeElevationState(previousState);

  if (nextPoint.altitude === null || !Number.isFinite(nextPoint.altitude)) {
    return normalizedState;
  }

  if (
    nextPoint.altitudeAccuracy !== null &&
    nextPoint.altitudeAccuracy !== undefined &&
    Number.isFinite(nextPoint.altitudeAccuracy) &&
    nextPoint.altitudeAccuracy > LIVE_ELEVATION_CONFIG.maxAcceptedAltitudeAccuracyM
  ) {
    return {
      ...normalizedState,
      lastAltitudeAccuracyM: nextPoint.altitudeAccuracy,
    };
  }

  const recentAltitudesM = [...normalizedState.recentAltitudesM, nextPoint.altitude].slice(
    -LIVE_ELEVATION_CONFIG.smoothingWindowSize
  );
  const nextSmoothedAltitude = median(recentAltitudesM);

  if (nextSmoothedAltitude === null) {
    return normalizedState;
  }

  if (normalizedState.lastSmoothedAltitudeM === null) {
    return {
      ...normalizedState,
      recentAltitudesM,
      lastSmoothedAltitudeM: nextSmoothedAltitude,
      lastAltitudeAccuracyM:
        typeof nextPoint.altitudeAccuracy === 'number' ? nextPoint.altitudeAccuracy : null,
    };
  }

  const deltaM = nextSmoothedAltitude - normalizedState.lastSmoothedAltitudeM;
  if (Math.abs(deltaM) < LIVE_ELEVATION_CONFIG.minimumStepDeltaM) {
    return {
      ...normalizedState,
      recentAltitudesM,
      lastAltitudeAccuracyM:
        typeof nextPoint.altitudeAccuracy === 'number' ? nextPoint.altitudeAccuracy : null,
    };
  }

  let pendingGainM = normalizedState.pendingGainM;
  let pendingLossM = normalizedState.pendingLossM;
  let totalGainM = normalizedState.totalGainM;
  let totalLossM = normalizedState.totalLossM;

  if (deltaM > 0) {
    pendingGainM += deltaM;
    pendingLossM = 0;

    if (pendingGainM >= LIVE_ELEVATION_CONFIG.minimumAccumulatedDeltaM) {
      totalGainM += pendingGainM;
      pendingGainM = 0;
    }
  } else if (deltaM < 0) {
    pendingLossM += Math.abs(deltaM);
    pendingGainM = 0;

    if (pendingLossM >= LIVE_ELEVATION_CONFIG.minimumAccumulatedDeltaM) {
      totalLossM += pendingLossM;
      pendingLossM = 0;
    }
  }

  return {
    recentAltitudesM,
    lastSmoothedAltitudeM: nextSmoothedAltitude,
    pendingGainM,
    pendingLossM,
    totalGainM,
    totalLossM,
    lastAltitudeAccuracyM:
      typeof nextPoint.altitudeAccuracy === 'number' ? nextPoint.altitudeAccuracy : null,
  };
}
