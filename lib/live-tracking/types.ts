export type LiveActivitySport =
  | 'course-a-pied'
  | 'trail'
  | 'marche'
  | 'velo'
  | 'vtt';

export type LiveTrackingStatus = 'idle' | 'running' | 'paused' | 'finished';

export type LivePrimaryMetric = 'pace' | 'speed';

export type LiveGpsQuality = 'searching' | 'poor' | 'good' | 'excellent';

export type LiveGpsPoint = {
  sessionId?: string | null;
  sequence?: number | null;
  trackingPaused?: boolean;
  latitude: number;
  longitude: number;
  altitude: number | null;
  accuracy: number | null;
  altitudeAccuracy?: number | null;
  speed: number | null;
  heading: number | null;
  timestamp: number;
};

export type AcceptedGpsPoint = LiveGpsPoint & {
  segmentDistanceM: number;
};

export type LiveElevationState = {
  recentAltitudesM: number[];
  lastSmoothedAltitudeM: number | null;
  pendingGainM: number;
  pendingLossM: number;
  totalGainM: number;
  totalLossM: number;
  lastAltitudeAccuracyM?: number | null;
};

export type LiveTrackingState = {
  sessionId: string | null;
  ownerUserId?: string | null;
  pausePeriods?: Array<{ startedAtMs: number; endedAtMs: number | null }>;
  status: LiveTrackingStatus;
  sport: LiveActivitySport;
  startedAtMs: number | null;
  pausedAtMs: number | null;
  finishedAtMs: number | null;
  collectionStoppedAtMs?: number | null;
  collectionGaps?: Array<{ startedAtMs: number; endedAtMs: number | null; estimated: boolean }>;
  recoveryWarning?: string | null;
  checkpointOnly?: boolean;
  accumulatedPausedMs: number;
  distanceM: number;
  elevationGainM: number;
  elevationLossM: number;
  lastPoint: LiveGpsPoint | null;
  referencePoint: LiveGpsPoint | null;
  acceptedPoints: AcceptedGpsPoint[];
  speedWindowPoints: AcceptedGpsPoint[];
  elevationState: LiveElevationState;
  gpsStatus: LiveGpsQuality;
  lastSequence: number;
  currentPaceSecondsPerKm: number | null;
  averagePaceSecondsPerKm: number | null;
  currentSpeedKmh: number | null;
  averageSpeedKmh: number | null;
  awaitingResumeRebase: boolean;
};

export type LiveTrackingSummary = {
  sport: LiveActivitySport;
  distanceM: number;
  activeDurationMs: number;
  elevationGainM: number;
  elevationLossM: number;
  pointCount: number;
  averagePaceSecondsPerKm: number | null;
  averageSpeedKmh: number | null;
};

export type PersistedLiveSession = {
  version: 1;
  state: LiveTrackingState;
  updatedAtMs: number;
};

export type FinishedLiveActivity = {
  version: 1;
  sessionId: string;
  ownerUserId: string | null;
  sport: LiveActivitySport;
  startedAtMs: number;
  finishedAtMs: number;
  distanceM: number;
  activeDurationMs: number;
  pausedDurationMs: number;
  elapsedDurationMs: number;
  elevationGainM: number;
  elevationLossM: number;
  state: LiveTrackingState;
  syncStatus: 'pending' | 'activity_saved' | 'synced';
  syncError: string | null;
};

export type LiveTrackingAction =
  | { type: 'START'; sport: LiveActivitySport; nowMs: number; sessionId: string }
  | { type: 'GPS_POINT_RECEIVED'; point: LiveGpsPoint }
  | { type: 'PAUSE'; nowMs: number }
  | { type: 'RESUME'; nowMs: number }
  | { type: 'FINISH'; nowMs: number }
  | { type: 'RESTORE_SESSION'; session: PersistedLiveSession }
  | { type: 'RESET'; sport?: LiveActivitySport };
