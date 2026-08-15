import type { LiveActivitySport, LiveGpsPoint } from '@/lib/live-tracking/types';

const DEBUG_SPORT_STEP_METERS: Record<LiveActivitySport, number> = {
  'course-a-pied': 12,
  trail: 11,
  marche: 7,
  velo: 35,
  vtt: 24,
};

const DEBUG_SPORT_ALTITUDE_STEP: Record<LiveActivitySport, number> = {
  'course-a-pied': 0.9,
  trail: 1.8,
  marche: 0.6,
  velo: 1.1,
  vtt: 1.6,
};

const DEBUG_SPORT_DELTA_MS: Record<LiveActivitySport, number> = {
  'course-a-pied': 5000,
  trail: 5500,
  marche: 5000,
  velo: 5000,
  vtt: 5000,
};

const DEFAULT_DEBUG_START_POINT: LiveGpsPoint = {
  latitude: 48.8566,
  longitude: 2.3522,
  altitude: 42,
  accuracy: 6,
  altitudeAccuracy: 4,
  speed: null,
  heading: 25,
  timestamp: Date.now(),
};

function movePoint(point: LiveGpsPoint, distanceM: number) {
  const headingRadians = (((point.heading ?? 25) + 7) * Math.PI) / 180;
  const northDistance = Math.cos(headingRadians) * distanceM;
  const eastDistance = Math.sin(headingRadians) * distanceM;

  const latitudeDelta = northDistance / 111320;
  const longitudeDelta =
    eastDistance / (111320 * Math.max(Math.cos((point.latitude * Math.PI) / 180), 0.1));

  return {
    latitude: point.latitude + latitudeDelta,
    longitude: point.longitude + longitudeDelta,
  };
}

export function createDebugStartPoint(overrides?: Partial<LiveGpsPoint>): LiveGpsPoint {
  return {
    ...DEFAULT_DEBUG_START_POINT,
    timestamp: Date.now(),
    ...overrides,
  };
}

export function generateDebugGpsPoint(
  previousPoint: LiveGpsPoint | null,
  sport: LiveActivitySport,
  options?: {
    accuracy?: number;
    altitudeDeltaMultiplier?: number;
    stationary?: boolean;
    timestamp?: number;
  }
): LiveGpsPoint {
  const seedPoint = previousPoint || createDebugStartPoint();
  const distanceM = options?.stationary ? 0.4 : DEBUG_SPORT_STEP_METERS[sport];
  const nextCoordinates = movePoint(seedPoint, distanceM);
  const deltaMs = DEBUG_SPORT_DELTA_MS[sport];
  const nextTimestamp = options?.timestamp ?? seedPoint.timestamp + deltaMs;
  const altitudeStep = options?.stationary
    ? 0
    : DEBUG_SPORT_ALTITUDE_STEP[sport] * (options?.altitudeDeltaMultiplier ?? 1);

  return {
    latitude: nextCoordinates.latitude,
    longitude: nextCoordinates.longitude,
    altitude: seedPoint.altitude === null ? 40 : seedPoint.altitude + altitudeStep,
    accuracy: options?.accuracy ?? 8,
    altitudeAccuracy: 4,
    speed: null,
    heading: (seedPoint.heading ?? 25) + 3,
    timestamp: nextTimestamp,
  };
}

export function generateDebugTrace(
  startPoint: LiveGpsPoint | null,
  sport: LiveActivitySport,
  stepsCount: number,
  options?: {
    accuracy?: number;
    altitudeDeltaMultiplier?: number;
    stationary?: boolean;
  }
) {
  const points: LiveGpsPoint[] = [];
  let cursor = startPoint;

  for (let stepIndex = 0; stepIndex < stepsCount; stepIndex += 1) {
    cursor = generateDebugGpsPoint(cursor, sport, options);
    points.push(cursor);
  }

  return points;
}

