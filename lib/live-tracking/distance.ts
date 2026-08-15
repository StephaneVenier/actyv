import type { LiveGpsPoint } from '@/lib/live-tracking/types';

const EARTH_RADIUS_M = 6371000;

function toRadians(value: number) {
  return (value * Math.PI) / 180;
}

export function distanceBetweenPointsMeters(a: LiveGpsPoint, b: LiveGpsPoint) {
  const latitudeDelta = toRadians(b.latitude - a.latitude);
  const longitudeDelta = toRadians(b.longitude - a.longitude);

  const aLatRadians = toRadians(a.latitude);
  const bLatRadians = toRadians(b.latitude);

  const haversineValue =
    Math.sin(latitudeDelta / 2) * Math.sin(latitudeDelta / 2) +
    Math.cos(aLatRadians) *
      Math.cos(bLatRadians) *
      Math.sin(longitudeDelta / 2) *
      Math.sin(longitudeDelta / 2);

  const angularDistance =
    2 * Math.atan2(Math.sqrt(haversineValue), Math.sqrt(1 - haversineValue));

  return EARTH_RADIUS_M * angularDistance;
}

export function metersToKilometers(distanceM: number) {
  return distanceM / 1000;
}

