import type { LiveActivitySport, LivePrimaryMetric } from '@/lib/live-tracking/types';

export type LiveSportConfig = {
  slug: LiveActivitySport;
  label: string;
  primaryMetric: LivePrimaryMetric;
  maxAcceptedSpeedKmh: number;
  smoothingWindowMs: number;
  smoothingMaxPoints: number;
  minSegmentMeters: number;
};

export const LIVE_GPS_ACCURACY_THRESHOLDS = {
  excellent: 10,
  good: 20,
  maxAccepted: 35,
} as const;

export const LIVE_ELEVATION_CONFIG = {
  smoothingWindowSize: 5,
  minimumAccumulatedDeltaM: 3,
} as const;

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
    minSegmentMeters: 1.2,
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

