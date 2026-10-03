import { buildPersistedSession } from '@/lib/live-tracking/session';
import type { FinishedLiveActivity, LiveTrackingState, PersistedLiveSession } from '@/lib/live-tracking/types';

export const LIVE_TRACKING_STORAGE_KEY = 'actyv-live-tracking-v1';
export const LIVE_ACTIVITY_OUTBOX_KEY = 'actyv-live-activity-outbox-v1';

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

export function loadFinishedLiveActivities(): FinishedLiveActivity[] {
  const raw = getStorage()?.getItem(LIVE_ACTIVITY_OUTBOX_KEY);
  if (!raw) return [];
  const rows: unknown = JSON.parse(raw);
  if (!Array.isArray(rows)) throw new Error('Sauvegarde locale des activites illisible.');
  return rows.filter((row): row is FinishedLiveActivity => row?.version === 1 &&
    typeof row.sessionId === 'string' && row.state?.status === 'finished');
}

export function saveFinishedLiveActivity(snapshot: FinishedLiveActivity) {
  const storage = getStorage();
  if (!storage) throw new Error('Le stockage local est indisponible.');
  const rows = loadFinishedLiveActivities().filter((row) => row.sessionId !== snapshot.sessionId &&
    row.syncStatus !== 'synced');
  storage.setItem(LIVE_ACTIVITY_OUTBOX_KEY, JSON.stringify([...rows, snapshot]));
}

