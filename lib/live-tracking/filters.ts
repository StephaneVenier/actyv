import {
  LIVE_GPS_ACCURACY_THRESHOLDS,
  LIVE_GPS_FILTER_CONFIG,
  getLiveSportConfig,
} from './config';
import { distanceBetweenPointsMeters } from './distance';
import type { LiveActivitySport, LiveGpsPoint, LiveGpsQuality } from './types';

export type GpsPointAcceptanceResult = {
  accepted: boolean;
  reason:
    | 'first-point'
    | 'accuracy-too-low'
    | 'timestamp-invalid'
    | 'segment-too-small'
    | 'speed-too-high'
    | 'accepted';
  segmentDistanceM: number;
  deltaTimeMs: number;
  computedSpeedKmh: number | null;
};

export function getGpsQuality(point: LiveGpsPoint | null): LiveGpsQuality {
  if (!point) {
    return 'searching';
  }

  if (point.accuracy === null || !Number.isFinite(point.accuracy)) {
    return 'good';
  }

  if (point.accuracy > LIVE_GPS_ACCURACY_THRESHOLDS.maxAccepted) {
    return 'poor';
  }

  if (point.accuracy > LIVE_GPS_ACCURACY_THRESHOLDS.good) {
    return 'good';
  }

  return 'excellent';
}

function getPointAccuracyMeters(point: LiveGpsPoint | null) {
  if (!point || point.accuracy === null || !Number.isFinite(point.accuracy)) {
    return null;
  }

  return point.accuracy;
}

function getMinimumAcceptedSegmentMeters(
  previousPoint: LiveGpsPoint | null,
  nextPoint: LiveGpsPoint,
  sport: LiveActivitySport
) {
  const baseThreshold = getLiveSportConfig(sport).minSegmentMeters;
  const previousAccuracy = getPointAccuracyMeters(previousPoint);
  const nextAccuracy = getPointAccuracyMeters(nextPoint);
  const effectiveAccuracy = Math.max(previousAccuracy ?? 0, nextAccuracy ?? 0);

  if (effectiveAccuracy <= 0) {
    return baseThreshold;
  }

  const accuracyThreshold = Math.min(
    effectiveAccuracy * LIVE_GPS_FILTER_CONFIG.accuracySegmentFactor,
    LIVE_GPS_FILTER_CONFIG.maxDynamicSegmentMeters
  );

  return Math.max(baseThreshold, accuracyThreshold);
}

export function evaluateGpsPointSegment(
  previousPoint: LiveGpsPoint | null,
  nextPoint: LiveGpsPoint,
  sport: LiveActivitySport
): GpsPointAcceptanceResult {
  if (nextPoint.accuracy !== null && nextPoint.accuracy > LIVE_GPS_ACCURACY_THRESHOLDS.maxAccepted) {
    return {
      accepted: false,
      reason: 'accuracy-too-low',
      segmentDistanceM: 0,
      deltaTimeMs: 0,
      computedSpeedKmh: null,
    };
  }

  if (!previousPoint) {
    return {
      accepted: true,
      reason: 'first-point',
      segmentDistanceM: 0,
      deltaTimeMs: 0,
      computedSpeedKmh: null,
    };
  }

  const deltaTimeMs = nextPoint.timestamp - previousPoint.timestamp;
  if (deltaTimeMs <= 0) {
    return {
      accepted: false,
      reason: 'timestamp-invalid',
      segmentDistanceM: 0,
      deltaTimeMs,
      computedSpeedKmh: null,
    };
  }

  const segmentDistanceM = distanceBetweenPointsMeters(previousPoint, nextPoint);
  const minimumSegmentMeters = getMinimumAcceptedSegmentMeters(previousPoint, nextPoint, sport);

  if (segmentDistanceM < minimumSegmentMeters) {
    return {
      accepted: false,
      reason: 'segment-too-small',
      segmentDistanceM,
      deltaTimeMs,
      computedSpeedKmh: null,
    };
  }

  const computedSpeedKmh = (segmentDistanceM / 1000) / (deltaTimeMs / 3600000);
  if (computedSpeedKmh > getLiveSportConfig(sport).maxAcceptedSpeedKmh) {
    return {
      accepted: false,
      reason: 'speed-too-high',
      segmentDistanceM,
      deltaTimeMs,
      computedSpeedKmh,
    };
  }

  return {
    accepted: true,
    reason: 'accepted',
    segmentDistanceM,
    deltaTimeMs,
    computedSpeedKmh,
  };
}

export function shouldAcceptGpsPoint(
  previousPoint: LiveGpsPoint | null,
  nextPoint: LiveGpsPoint,
  sport: LiveActivitySport
) {
  return evaluateGpsPointSegment(previousPoint, nextPoint, sport).accepted;
}
