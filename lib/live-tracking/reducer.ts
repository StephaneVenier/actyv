import { getLiveSportConfig } from '@/lib/live-tracking/config';
import { normalizeElevationState, updateElevation } from '@/lib/live-tracking/elevation';
import { evaluateGpsPointSegment, getGpsQuality } from '@/lib/live-tracking/filters';
import { calculateAveragePaceSecondsPerKm, calculateAverageSpeedKmh, calculateSmoothedPaceSecondsPerKm, calculateSmoothedSpeedKmh, trimSpeedWindowPoints } from '@/lib/live-tracking/pace';
import { createInitialLiveTrackingState } from '@/lib/live-tracking/session';
import { getActiveDurationMs } from '@/lib/live-tracking/timer';
import type { AcceptedGpsPoint, LiveGpsPoint, LiveTrackingAction, LiveTrackingState } from '@/lib/live-tracking/types';

function withUpdatedDerivedMetrics(
  state: LiveTrackingState,
  effectiveTimestamp: number
): LiveTrackingState {
  const activeDurationMs = getActiveDurationMs(state, effectiveTimestamp);
  const averageSpeedKmh = calculateAverageSpeedKmh(state.distanceM, activeDurationMs);
  const averagePaceSecondsPerKm = calculateAveragePaceSecondsPerKm(state.distanceM, activeDurationMs);
  const currentSpeedKmh =
    state.status === 'running' ? calculateSmoothedSpeedKmh(state.speedWindowPoints) : null;
  const currentPaceSecondsPerKm =
    state.status === 'running' ? calculateSmoothedPaceSecondsPerKm(state.speedWindowPoints) : null;

  return {
    ...state,
    averageSpeedKmh,
    averagePaceSecondsPerKm,
    currentSpeedKmh,
    currentPaceSecondsPerKm,
    elevationGainM: state.elevationState.totalGainM,
    elevationLossM: state.elevationState.totalLossM,
  };
}

function handleGpsPointReceived(
  state: LiveTrackingState,
  point: LiveGpsPoint
): LiveTrackingState {
  const nextSequence =
    typeof point.sequence === 'number' && Number.isFinite(point.sequence)
      ? Math.max(state.lastSequence, Math.trunc(point.sequence))
      : state.lastSequence;

  if (typeof point.sequence === 'number' && point.sequence <= state.lastSequence) {
    return state;
  }

  const gpsStatus = getGpsQuality(point);

  if (state.status === 'idle' || state.status === 'finished') {
    return state;
  }

  if (state.startedAtMs != null && point.timestamp < state.startedAtMs) return { ...state, lastSequence: nextSequence };
  const pointPaused = state.pausePeriods
    ? state.pausePeriods.some((period) => point.timestamp >= period.startedAtMs &&
        (period.endedAtMs == null || point.timestamp < period.endedAtMs))
    : point.trackingPaused ?? state.status === 'paused';
  point = { ...point, trackingPaused: pointPaused };
  const needsRebase = state.referencePoint?.trackingPaused === true ||
    (state.referencePoint != null && state.pausePeriods?.some((period) =>
      state.referencePoint!.timestamp < period.startedAtMs && point.timestamp >= period.startedAtMs)) ||
    (!state.pausePeriods && state.awaitingResumeRebase);

  const reference = needsRebase && point.timestamp > (state.referencePoint?.timestamp ?? 0)
    ? null : state.referencePoint;
  const evaluation = evaluateGpsPointSegment(reference, point, state.sport);
  const nextStateBase: LiveTrackingState = {
    ...state,
    lastPoint: point,
    lastSequence: nextSequence,
    gpsStatus,
  };

  if (!evaluation.accepted) {
    return nextStateBase;
  }

  const acceptedPoint: AcceptedGpsPoint = {
    ...point,
    segmentDistanceM:
      !pointPaused && !needsRebase ? evaluation.segmentDistanceM : 0,
  };

  if (pointPaused) {
    return {
      ...nextStateBase,
      referencePoint: point,
      speedWindowPoints: [],
      elevationState: { ...state.elevationState, recentAltitudesM: [], lastSmoothedAltitudeM: null,
        pendingGainM: 0, pendingLossM: 0 },
    };
  }

  if (needsRebase || !state.referencePoint || evaluation.reason === 'first-point') {
    const elevationBase = needsRebase ? { ...state.elevationState, recentAltitudesM: [],
      lastSmoothedAltitudeM: null, pendingGainM: 0, pendingLossM: 0 } : state.elevationState;
    const nextElevationState = updateElevation(elevationBase, point);
    return withUpdatedDerivedMetrics(
      {
        ...nextStateBase,
        referencePoint: point,
        acceptedPoints: [...state.acceptedPoints, acceptedPoint],
        speedWindowPoints: [acceptedPoint],
        elevationState: nextElevationState,
        awaitingResumeRebase: false,
      },
      point.timestamp
    );
  }

  const nextDistanceM = state.distanceM + evaluation.segmentDistanceM;
  const nextAcceptedPoints = [...state.acceptedPoints, acceptedPoint];
  const windowConfig = getLiveSportConfig(state.sport);
  const nextSpeedWindowPoints = trimSpeedWindowPoints(
    [...state.speedWindowPoints, acceptedPoint],
    point.timestamp,
    windowConfig.smoothingWindowMs,
    windowConfig.smoothingMaxPoints
  );
  const nextElevationState = updateElevation(state.elevationState, point);

  return withUpdatedDerivedMetrics(
    {
      ...nextStateBase,
      referencePoint: point,
      distanceM: nextDistanceM,
      acceptedPoints: nextAcceptedPoints,
      speedWindowPoints: nextSpeedWindowPoints,
      elevationState: nextElevationState,
      awaitingResumeRebase: false,
    },
    point.timestamp
  );
}

export function liveTrackingReducer(state: LiveTrackingState, action: LiveTrackingAction): LiveTrackingState {
  switch (action.type) {
    case 'START':
      return {
        ...createInitialLiveTrackingState(action.sport),
        sessionId: action.sessionId,
        status: 'running',
        sport: action.sport,
        startedAtMs: action.nowMs,
        gpsStatus: 'searching',
      };

    case 'GPS_POINT_RECEIVED':
      return handleGpsPointReceived(state, action.point);

    case 'PAUSE':
      if (state.status !== 'running' || !state.startedAtMs) {
        return state;
      }

      return withUpdatedDerivedMetrics(
        {
          ...state,
          status: 'paused',
          pausedAtMs: action.nowMs,
          pausePeriods: [...(state.pausePeriods || []), { startedAtMs: action.nowMs, endedAtMs: null }],
          currentSpeedKmh: null,
          currentPaceSecondsPerKm: null,
          speedWindowPoints: [],
          awaitingResumeRebase: true,
        },
        action.nowMs
      );

    case 'RESUME':
      if (state.status !== 'paused' || !state.startedAtMs || !state.pausedAtMs) {
        return state;
      }

      return withUpdatedDerivedMetrics(
        {
          ...state,
          status: 'running',
          accumulatedPausedMs:
            state.accumulatedPausedMs + Math.max(0, action.nowMs - state.pausedAtMs),
          pausedAtMs: null,
          pausePeriods: (state.pausePeriods || [{ startedAtMs: state.pausedAtMs, endedAtMs: null }])
            .map((period) => period.endedAtMs == null ? { ...period, endedAtMs: action.nowMs } : period),
          currentSpeedKmh: null,
          currentPaceSecondsPerKm: null,
          speedWindowPoints: [],
          awaitingResumeRebase: true,
        },
        action.nowMs
      );

    case 'FINISH': {
      if ((state.status !== 'running' && state.status !== 'paused') || !state.startedAtMs) {
        return state;
      }

      const accumulatedPausedMs =
        state.status === 'paused' && state.pausedAtMs
          ? state.accumulatedPausedMs + Math.max(0, action.nowMs - state.pausedAtMs)
          : state.accumulatedPausedMs;

      return withUpdatedDerivedMetrics(
        {
          ...state,
          status: 'finished',
          finishedAtMs: action.nowMs,
          accumulatedPausedMs,
          pausedAtMs: null,
          currentSpeedKmh: null,
          currentPaceSecondsPerKm: null,
          speedWindowPoints: [],
          awaitingResumeRebase: false,
        },
        action.nowMs
      );
    }

    case 'RESTORE_SESSION':
      return withUpdatedDerivedMetrics(
        {
          ...action.session.state,
          elevationState: normalizeElevationState(action.session.state.elevationState),
        },
        Date.now()
      );

    case 'RESET':
      return createInitialLiveTrackingState(action.sport ?? state.sport);

    default:
      return state;
  }
}
