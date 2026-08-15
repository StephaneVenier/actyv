import { buildPersistedSession } from '@/lib/live-tracking/session';
import type { LiveTrackingState, PersistedLiveSession } from '@/lib/live-tracking/types';

export const LIVE_TRACKING_STORAGE_KEY = 'actyv-live-tracking-v1';

export type LiveTrackingStorage = {
  saveSession: (state: LiveTrackingState) => void;
  loadSession: () => PersistedLiveSession | null;
  clearSession: () => void;
};

function getStorage() {
  if (typeof window === 'undefined') {
    return null;
  }

  return window.localStorage;
}

export function saveLiveTrackingSession(state: LiveTrackingState) {
  const storage = getStorage();
  if (!storage) {
    return;
  }

  storage.setItem(LIVE_TRACKING_STORAGE_KEY, JSON.stringify(buildPersistedSession(state)));
}

export function loadLiveTrackingSession() {
  const storage = getStorage();
  if (!storage) {
    return null;
  }

  const rawValue = storage.getItem(LIVE_TRACKING_STORAGE_KEY);
  if (!rawValue) {
    return null;
  }

  try {
    const parsedValue = JSON.parse(rawValue) as PersistedLiveSession;
    if (!parsedValue || parsedValue.version !== 1 || !parsedValue.state) {
      return null;
    }

    return parsedValue;
  } catch {
    return null;
  }
}

export function clearLiveTrackingSession() {
  const storage = getStorage();
  if (!storage) {
    return;
  }

  storage.removeItem(LIVE_TRACKING_STORAGE_KEY);
}

export const liveTrackingStorage: LiveTrackingStorage = {
  saveSession: saveLiveTrackingSession,
  loadSession: loadLiveTrackingSession,
  clearSession: clearLiveTrackingSession,
};

