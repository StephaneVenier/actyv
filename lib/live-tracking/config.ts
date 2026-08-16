import type { LiveActivitySport, LivePrimaryMetric } from './types';

export type LiveSportConfig = {
  slug: LiveActivitySport;
  label: string;
  primaryMetric: LivePrimaryMetric;
  maxAcceptedSpeedKmh: number;
  smoothingWindowMs: number;
  smoothingMaxPoints: number;
  minSegmentMeters: number;
};

export type LiveTrackingAndroidConfig = {
  updateIntervalMs: number;
  fastestIntervalMs: number;
  minDistanceMeters: number;
  priority: 'high-accuracy';
};

export type LiveGpsFilterConfig = {
  accuracySegmentFactor: number;
  maxDynamicSegmentMeters: number;
};

export const LIVE_GPS_ACCURACY_THRESHOLDS = {
  excellent: 10,
  good: 20,
  maxAccepted: 35,
} as const;

export const LIVE_GPS_FILTER_CONFIG: LiveGpsFilterConfig = {
  accuracySegmentFactor: 0.2,
  maxDynamicSegmentMeters: 6,
} as const;

export const LIVE_ELEVATION_CONFIG = {
  smoothingWindowSize: 3,
  minimumStepDeltaM: 1.5,
  minimumAccumulatedDeltaM: 4,
  maxAcceptedAltitudeAccuracyM: 16,
} as const;

export const LIVE_TRACKING_ANDROID_CONFIG: LiveTrackingAndroidConfig = {
  updateIntervalMs: 2000,
  fastestIntervalMs: 1000,
  minDistanceMeters: 3,
  priority: 'high-accuracy',
};

export const DEFAULT_LIVE_SPORT: LiveActivitySport = 'course-a-pied';

export const LIVE_SPORT_CONFIG: Record<LiveActivitySport, LiveSportConfig> = {
  'course-a-pied': {
    slug: 'course-a-pied',
    label: 'Course à pied',
    primaryMetric: 'pace',
    maxAcceptedSpeedKmh: 35,
    smoothingWindowMs: 15000,
    smoothingMaxPoints: 6,
    minSegmentMeters: 1.5,
  },
  trail: {
    slug: 'trail',
    label: 'Trail',
    primaryMetric: 'pace',
    maxAcceptedSpeedKmh: 35,
    smoothingWindowMs: 18000,
    smoothingMaxPoints: 6,
    minSegmentMeters: 1.5,
  },
  marche: {
    slug: 'marche',
    label: 'Marche',
    primaryMetric: 'pace',
    maxAcceptedSpeedKmh: 18,
    smoothingWindowMs: 18000,
    smoothingMaxPoints: 6,
    minSegmentMeters: 1.8,
  },
  velo: {
    slug: 'velo',
    label: 'Vélo',
    primaryMetric: 'speed',
    maxAcceptedSpeedKmh: 100,
    smoothingWindowMs: 12000,
    smoothingMaxPoints: 6,
    minSegmentMeters: 2,
  },
  vtt: {
    slug: 'vtt',
    label: 'VTT',
    primaryMetric: 'speed',
    maxAcceptedSpeedKmh: 80,
    smoothingWindowMs: 12000,
    smoothingMaxPoints: 6,
    minSegmentMeters: 2,
  },
};

export function getLiveSportConfig(sport: LiveActivitySport) {
  return LIVE_SPORT_CONFIG[sport];
}
