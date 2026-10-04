import type { LiveActivitySport, LiveGpsPoint } from '@/lib/live-tracking/types';
import type { NativeRecoverySession } from '@/lib/live-tracking/recovery';

export type LiveTrackingPermissionStatus = 'unknown' | 'granted' | 'denied' | 'limited';

export type LiveTrackingNotificationPermissionStatus = 'unknown' | 'granted' | 'denied';

export type LiveTrackingNativeStatus = 'unavailable' | 'idle' | 'running' | 'paused' | 'stopped' | 'error';

export type LiveTrackingPlatformStatus = {
  available: boolean;
  platform: 'android' | 'web';
  trackingStatus: LiveTrackingNativeStatus;
  permissionStatus: LiveTrackingPermissionStatus;
  notificationPermissionStatus: LiveTrackingNotificationPermissionStatus;
  gpsEnabled: boolean;
  serviceRunning: boolean;
  sessionId: string | null;
  sport: LiveActivitySport | null;
  startedAtMs: number | null;
  pausedAtMs: number | null;
  accumulatedPausedMs: number;
  lastSequence: number;
  pointsRecorded: number;
  message: string | null;
  finalizationVersion?: number;
  stoppedAtMs?: number | null;
  recoveryVersion?: number;
  ownerUserId?: string | null;
};

export type LiveTrackingStartOptions = {
  sessionId: string;
  sport: LiveActivitySport;
  startedAtMs: number;
  accumulatedPausedMs?: number;
  ownerUserId?: string;
};

export type LiveTrackingPauseOptions = {
  sessionId: string;
  pausedAtMs: number;
  accumulatedPausedMs: number;
};

export type LiveTrackingResumeOptions = {
  sessionId: string;
  resumedAtMs: number;
  accumulatedPausedMs: number;
};

export type LiveTrackingStopOptions = {
  sessionId: string;
};

export type LiveTrackingPendingPointsResult = {
  sessionId: string | null;
  lastSequence: number;
  points: LiveGpsPoint[];
  recovery?: NativeRecoverySession | null;
};

export type LiveTrackingListenerHandle = {
  remove: () => Promise<void> | void;
};

export interface LiveTrackingPlatform {
  setOwner(ownerUserId: string | null): void;
  transitionOwner(ownerUserId: string | null): Promise<void>;
  purgeOwner(ownerUserId: string): Promise<void>;
  getRecoverySession(ownerUserId: string): Promise<{ blocked?: boolean; session?: NativeRecoverySession | null }>;
  recoverTracking(sessionId: string): Promise<LiveTrackingPlatformStatus>;
  isAvailable(): boolean;
  getStatus(): Promise<LiveTrackingPlatformStatus>;
  checkPermissions(): Promise<LiveTrackingPlatformStatus>;
  requestPermissions(): Promise<LiveTrackingPlatformStatus>;
  startTracking(options: LiveTrackingStartOptions): Promise<LiveTrackingPlatformStatus>;
  pauseTracking(options: LiveTrackingPauseOptions): Promise<LiveTrackingPlatformStatus>;
  resumeTracking(options: LiveTrackingResumeOptions): Promise<LiveTrackingPlatformStatus>;
  stopTracking(options: LiveTrackingStopOptions): Promise<LiveTrackingPlatformStatus>;
  clearSession(sessionId: string): Promise<void>;
  getPendingPoints(
    sessionId: string,
    afterSequence?: number
  ): Promise<LiveTrackingPendingPointsResult>;
  addLocationListener(
    listener: (point: LiveGpsPoint) => void
  ): Promise<LiveTrackingListenerHandle | null>;
  addStatusListener(
    listener: (status: LiveTrackingPlatformStatus) => void
  ): Promise<LiveTrackingListenerHandle | null>;
  addErrorListener(listener: (message: string) => void): Promise<LiveTrackingListenerHandle | null>;
}

