import type { AcceptedGpsPoint } from '@/lib/live-tracking/types';

const MINIMUM_DISTANCE_FOR_METRICS_M = 15;
const MINIMUM_WINDOW_DISTANCE_M = 5;

export function calculateAverageSpeedKmh(distanceM: number, activeDurationMs: number) {
  if (distanceM <= 0 || activeDurationMs <= 0) {
    return null;
  }

  const hours = activeDurationMs / 3600000;
  if (hours <= 0) {
    return null;
  }

  return (distanceM / 1000) / hours;
}

export function speedKmhToPaceSecondsPerKm(speedKmh: number | null) {
  if (speedKmh === null || !Number.isFinite(speedKmh) || speedKmh <= 0.25) {
    return null;
  }

  return 3600 / speedKmh;
}

export function calculateAveragePaceSecondsPerKm(distanceM: number, activeDurationMs: number) {
  if (distanceM < MINIMUM_DISTANCE_FOR_METRICS_M || activeDurationMs <= 0) {
    return null;
  }

  const distanceKm = distanceM / 1000;
  if (distanceKm <= 0) {
    return null;
  }

  return activeDurationMs / 1000 / distanceKm;
}

export function trimSpeedWindowPoints(
  points: AcceptedGpsPoint[],
  currentTimestamp: number,
  maxWindowMs: number,
  maxPoints: number
) {
  const windowStart = currentTimestamp - maxWindowMs;
  return points.filter((point, index) => {
    if (point.timestamp < windowStart && index !== points.length - 1) {
      return false;
    }

    return true;
  }).slice(-maxPoints);
}

export function calculateSmoothedSpeedKmh(points: AcceptedGpsPoint[]) {
  if (points.length < 2) {
    return null;
  }

  const firstPoint = points[0];
  const lastPoint = points[points.length - 1];
  const deltaTimeMs = lastPoint.timestamp - firstPoint.timestamp;

  if (deltaTimeMs <= 0) {
    return null;
  }

  const totalDistanceM = points.slice(1).reduce((sum, point) => sum + point.segmentDistanceM, 0);
  if (totalDistanceM < MINIMUM_WINDOW_DISTANCE_M) {
    return null;
  }

  const hours = deltaTimeMs / 3600000;
  return (totalDistanceM / 1000) / hours;
}

export function calculateSmoothedPaceSecondsPerKm(points: AcceptedGpsPoint[]) {
  return speedKmhToPaceSecondsPerKm(calculateSmoothedSpeedKmh(points));
}

