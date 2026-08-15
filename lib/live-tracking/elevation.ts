import { LIVE_ELEVATION_CONFIG } from '@/lib/live-tracking/config';
import type { LiveElevationState, LiveGpsPoint } from '@/lib/live-tracking/types';

export function createInitialElevationState(): LiveElevationState {
  return {
    recentAltitudesM: [],
    lastSmoothedAltitudeM: null,
    pendingGainM: 0,
    pendingLossM: 0,
    totalGainM: 0,
    totalLossM: 0,
  };
}

function average(values: number[]) {
  if (values.length === 0) {
    return null;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function updateElevation(
  previousState: LiveElevationState,
  nextPoint: LiveGpsPoint
): LiveElevationState {
  if (nextPoint.altitude === null || !Number.isFinite(nextPoint.altitude)) {
    return previousState;
  }

  const recentAltitudesM = [...previousState.recentAltitudesM, nextPoint.altitude].slice(
    -LIVE_ELEVATION_CONFIG.smoothingWindowSize
  );
  const nextSmoothedAltitude = average(recentAltitudesM);

  if (nextSmoothedAltitude === null) {
    return previousState;
  }

  if (previousState.lastSmoothedAltitudeM === null) {
    return {
      ...previousState,
      recentAltitudesM,
      lastSmoothedAltitudeM: nextSmoothedAltitude,
    };
  }

  const deltaM = nextSmoothedAltitude - previousState.lastSmoothedAltitudeM;
  let pendingGainM = previousState.pendingGainM;
  let pendingLossM = previousState.pendingLossM;
  let totalGainM = previousState.totalGainM;
  let totalLossM = previousState.totalLossM;

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
  };
}

