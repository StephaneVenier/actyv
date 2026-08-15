'use client';

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { liveTrackingReducer } from '@/lib/live-tracking/reducer';
import {
  buildLiveTrackingSummary,
  createInitialLiveTrackingState,
  createLiveSessionId,
  isRestorableSession,
} from '@/lib/live-tracking/session';
import {
  clearLiveTrackingSession,
  loadLiveTrackingSession,
  saveLiveTrackingSession,
} from '@/lib/live-tracking/storage';
import {
  liveTrackingPlatform,
  type LiveTrackingPlatformStatus,
} from '@/lib/live-tracking/platform';
import { getActiveDurationMs } from '@/lib/live-tracking/timer';
import type { LiveActivitySport, LiveGpsPoint, PersistedLiveSession } from '@/lib/live-tracking/types';

const WEB_STATUS: LiveTrackingPlatformStatus = {
  available: false,
  platform: 'web',
  trackingStatus: 'unavailable',
  permissionStatus: 'unknown',
  notificationPermissionStatus: 'unknown',
  gpsEnabled: false,
  serviceRunning: false,
  sessionId: null,
  sport: null,
  startedAtMs: null,
  pausedAtMs: null,
  accumulatedPausedMs: 0,
  lastSequence: 0,
  pointsRecorded: 0,
  message: 'Suivi GPS natif disponible dans l’application Android.',
};

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

export function useLiveTracking() {
  const [state, dispatch] = useReducer(liveTrackingReducer, createInitialLiveTrackingState());
  const [restorableSession, setRestorableSession] = useState<PersistedLiveSession | null>(null);
  const [platformStatus, setPlatformStatus] = useState<LiveTrackingPlatformStatus>(WEB_STATUS);
  const [platformError, setPlatformError] = useState<string | null>(null);
  const [nativeActionPending, setNativeActionPending] = useState(false);
  const persistTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loadedInitialSessionRef = useRef(false);
  const stateRef = useRef(state);
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    if (loadedInitialSessionRef.current) {
      return;
    }

    loadedInitialSessionRef.current = true;
    const persistedSession = loadLiveTrackingSession();
    if (isRestorableSession(persistedSession)) {
      setRestorableSession(persistedSession);
    }
  }, []);

  const reconcilePendingPoints = useCallback(
    async (sessionId: string, afterSequence: number) => {
      if (!liveTrackingPlatform.isAvailable()) {
        return;
      }

      const pendingResult = await liveTrackingPlatform.getPendingPoints(sessionId, afterSequence);
      pendingResult.points.forEach((point) => {
        dispatch({ type: 'GPS_POINT_RECEIVED', point });
      });
    },
    []
  );

  const syncNativeStatus = useCallback(async () => {
    if (!liveTrackingPlatform.isAvailable()) {
      setPlatformStatus(WEB_STATUS);
      return WEB_STATUS;
    }

    const nativeStatus = await liveTrackingPlatform.getStatus();
    setPlatformStatus(nativeStatus);

    const currentState = stateRef.current;
    if (
      nativeStatus.serviceRunning &&
      currentState.sessionId &&
      nativeStatus.sessionId === currentState.sessionId
    ) {
      await reconcilePendingPoints(currentState.sessionId, currentState.lastSequence);
    }

    return nativeStatus;
  }, [reconcilePendingPoints]);

  useEffect(() => {
    if (state.status !== 'running') {
      setNowMs(Date.now());
      return;
    }

    const intervalId = window.setInterval(() => {
      setNowMs(Date.now());
    }, 1000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [state.status]);

  useEffect(() => {
    if (persistTimeoutRef.current) {
      clearTimeout(persistTimeoutRef.current);
    }

    if (state.status === 'idle') {
      clearLiveTrackingSession();
      return;
    }

    persistTimeoutRef.current = setTimeout(() => {
      saveLiveTrackingSession(state);
    }, 700);

    return () => {
      if (persistTimeoutRef.current) {
        clearTimeout(persistTimeoutRef.current);
      }
    };
  }, [state]);

  useEffect(() => {
    let cancelled = false;
    const removeHandles: Array<() => Promise<void> | void> = [];

    const attachListeners = async () => {
      const locationHandle = await liveTrackingPlatform.addLocationListener((point) => {
        const currentSessionId = stateRef.current.sessionId;
        if (currentSessionId && point.sessionId && point.sessionId !== currentSessionId) {
          return;
        }

        dispatch({ type: 'GPS_POINT_RECEIVED', point });
      });

      const statusHandle = await liveTrackingPlatform.addStatusListener((status) => {
        if (cancelled) {
          return;
        }
        setPlatformStatus(status);
      });

      const errorHandle = await liveTrackingPlatform.addErrorListener((message) => {
        if (cancelled) {
          return;
        }
        setPlatformError(message);
      });

      if (locationHandle) {
        removeHandles.push(() => locationHandle.remove());
      }
      if (statusHandle) {
        removeHandles.push(() => statusHandle.remove());
      }
      if (errorHandle) {
        removeHandles.push(() => errorHandle.remove());
      }

      try {
        await syncNativeStatus();
      } catch (error) {
        if (!cancelled) {
          setPlatformError(
            getErrorMessage(error, 'Impossible de lire l’état du suivi GPS natif.')
          );
        }
      }
    };

    void attachListeners();

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        void syncNativeStatus().catch((error) => {
          setPlatformError(
            getErrorMessage(error, 'Impossible de resynchroniser le suivi GPS natif.')
          );
        });
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      removeHandles.forEach((remove) => {
        try {
          void remove();
        } catch {
          // noop
        }
      });
    };
  }, [syncNativeStatus]);

  const start = useCallback(
    async (sport: LiveActivitySport) => {
      setPlatformError(null);

      if (!liveTrackingPlatform.isAvailable()) {
        setRestorableSession(null);
        dispatch({
          type: 'START',
          sport,
          nowMs: Date.now(),
          sessionId: createLiveSessionId(),
        });
        return true;
      }

      setNativeActionPending(true);

      try {
        let nativeStatus = await liveTrackingPlatform.checkPermissions();
        setPlatformStatus(nativeStatus);

        if (
          nativeStatus.permissionStatus === 'denied' ||
          nativeStatus.permissionStatus === 'unknown'
        ) {
          nativeStatus = await liveTrackingPlatform.requestPermissions();
          setPlatformStatus(nativeStatus);
        }

        if (
          nativeStatus.permissionStatus === 'denied' ||
          nativeStatus.permissionStatus === 'unknown'
        ) {
          setPlatformError('Autorise la localisation pour démarrer le Live.');
          return false;
        }

        if (nativeStatus.permissionStatus === 'limited') {
          setPlatformError(
            'La localisation précise est recommandée pour suivre correctement ton activité.'
          );
        }

        if (!nativeStatus.gpsEnabled) {
          setPlatformError(
            'Active la localisation de ton téléphone pour démarrer le Live.'
          );
          return false;
        }

        const sessionId = createLiveSessionId();
        const now = Date.now();

        setRestorableSession(null);
        dispatch({
          type: 'START',
          sport,
          nowMs: now,
          sessionId,
        });

        try {
          const startedStatus = await liveTrackingPlatform.startTracking({
            sessionId,
            sport,
            startedAtMs: now,
            accumulatedPausedMs: 0,
          });
          setPlatformStatus(startedStatus);
        } catch (error) {
          dispatch({ type: 'RESET', sport });
          setPlatformError(
            getErrorMessage(error, 'Impossible de démarrer le suivi GPS natif.')
          );
          return false;
        }

        return true;
      } finally {
        setNativeActionPending(false);
      }
    },
    []
  );

  const pause = useCallback(async () => {
    const now = Date.now();
    const sessionId = stateRef.current.sessionId;
    const accumulatedPausedMs = stateRef.current.accumulatedPausedMs;

    dispatch({ type: 'PAUSE', nowMs: now });

    if (!liveTrackingPlatform.isAvailable() || !sessionId) {
      return;
    }

    setNativeActionPending(true);
    try {
      const nativeStatus = await liveTrackingPlatform.pauseTracking({
        sessionId,
        pausedAtMs: now,
        accumulatedPausedMs,
      });
      setPlatformStatus(nativeStatus);
    } catch (error) {
      setPlatformError(
        getErrorMessage(error, 'Impossible de mettre le suivi GPS en pause.')
      );
    } finally {
      setNativeActionPending(false);
    }
  }, []);

  const resume = useCallback(async () => {
    const now = Date.now();
    const currentState = stateRef.current;
    const sessionId = currentState.sessionId;
    const accumulatedPausedMs =
      currentState.pausedAtMs != null
        ? currentState.accumulatedPausedMs +
          Math.max(0, now - currentState.pausedAtMs)
        : currentState.accumulatedPausedMs;

    dispatch({ type: 'RESUME', nowMs: now });

    if (!liveTrackingPlatform.isAvailable() || !sessionId) {
      return;
    }

    setNativeActionPending(true);
    try {
      const nativeStatus = await liveTrackingPlatform.resumeTracking({
        sessionId,
        resumedAtMs: now,
        accumulatedPausedMs,
      });
      setPlatformStatus(nativeStatus);
      await reconcilePendingPoints(sessionId, stateRef.current.lastSequence);
    } catch (error) {
      setPlatformError(
        getErrorMessage(error, 'Impossible de reprendre le suivi GPS.')
      );
    } finally {
      setNativeActionPending(false);
    }
  }, [reconcilePendingPoints]);

  const finish = useCallback(async () => {
    const now = Date.now();
    const sessionId = stateRef.current.sessionId;

    dispatch({ type: 'FINISH', nowMs: now });

    if (!liveTrackingPlatform.isAvailable() || !sessionId) {
      return;
    }

    setNativeActionPending(true);
    try {
      const nativeStatus = await liveTrackingPlatform.stopTracking({ sessionId });
      setPlatformStatus(nativeStatus);
    } catch (error) {
      setPlatformError(
        getErrorMessage(error, 'Impossible d’arrêter proprement le suivi GPS.')
      );
    } finally {
      setNativeActionPending(false);
    }
  }, []);

  const reset = useCallback(
    async (sport?: LiveActivitySport) => {
      const sessionId = stateRef.current.sessionId;

      if (liveTrackingPlatform.isAvailable() && sessionId) {
        try {
          await liveTrackingPlatform.stopTracking({ sessionId });
        } catch {
          // noop
        }
      }

      clearLiveTrackingSession();
      setRestorableSession(null);
      setPlatformError(null);
      dispatch({ type: 'RESET', sport });
      await syncNativeStatus().catch(() => undefined);
    },
    [syncNativeStatus]
  );

  const ingestGpsPoint = useCallback((point: LiveGpsPoint) => {
    dispatch({ type: 'GPS_POINT_RECEIVED', point });
  }, []);

  const restoreSession = useCallback(async () => {
    const persistedSession = restorableSession || loadLiveTrackingSession();
    if (!persistedSession) {
      return;
    }

    dispatch({ type: 'RESTORE_SESSION', session: persistedSession });
    setRestorableSession(null);

    if (persistedSession.state.sessionId) {
      await reconcilePendingPoints(
        persistedSession.state.sessionId,
        persistedSession.state.lastSequence
      );
    }

    await syncNativeStatus().catch(() => undefined);
  }, [reconcilePendingPoints, restorableSession, syncNativeStatus]);

  const discardSession = useCallback(
    async (sport?: LiveActivitySport) => {
      const persistedSession = restorableSession || loadLiveTrackingSession();
      const sessionId = persistedSession?.state.sessionId || stateRef.current.sessionId;

      if (liveTrackingPlatform.isAvailable() && sessionId) {
        try {
          await liveTrackingPlatform.stopTracking({ sessionId });
        } catch {
          // noop
        }
      }

      clearLiveTrackingSession();
      setRestorableSession(null);
      setPlatformError(null);
      dispatch({ type: 'RESET', sport });
      await syncNativeStatus().catch(() => undefined);
    },
    [restorableSession, syncNativeStatus]
  );

  const activeDurationMs = useMemo(() => getActiveDurationMs(state, nowMs), [state, nowMs]);
  const summary = useMemo(() => {
    if (state.status !== 'finished') {
      return null;
    }

    return buildLiveTrackingSummary(state, state.finishedAtMs || Date.now());
  }, [state]);

  return {
    state,
    activeDurationMs,
    summary,
    restorableSession,
    platformStatus,
    platformError,
    nativeActionPending,
    start,
    pause,
    resume,
    finish,
    reset,
    ingestGpsPoint,
    restoreSession,
    discardSession,
    refreshNativeStatus: syncNativeStatus,
  };
}

