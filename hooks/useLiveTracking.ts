'use client';

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { liveTrackingReducer } from '@/lib/live-tracking/reducer';
import { buildLiveTrackingSummary, createInitialLiveTrackingState, isRestorableSession } from '@/lib/live-tracking/session';
import { clearLiveTrackingSession, loadLiveTrackingSession, saveLiveTrackingSession } from '@/lib/live-tracking/storage';
import { getActiveDurationMs } from '@/lib/live-tracking/timer';
import type { LiveActivitySport, LiveGpsPoint, PersistedLiveSession } from '@/lib/live-tracking/types';

export function useLiveTracking() {
  const [state, dispatch] = useReducer(liveTrackingReducer, createInitialLiveTrackingState());
  const [restorableSession, setRestorableSession] = useState<PersistedLiveSession | null>(null);
  const persistTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loadedInitialSessionRef = useRef(false);
  const [nowMs, setNowMs] = useState(() => Date.now());

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

  const start = useCallback((sport: LiveActivitySport) => {
    setRestorableSession(null);
    dispatch({ type: 'START', sport, nowMs: Date.now() });
  }, []);

  const pause = useCallback(() => {
    dispatch({ type: 'PAUSE', nowMs: Date.now() });
  }, []);

  const resume = useCallback(() => {
    dispatch({ type: 'RESUME', nowMs: Date.now() });
  }, []);

  const finish = useCallback(() => {
    dispatch({ type: 'FINISH', nowMs: Date.now() });
  }, []);

  const reset = useCallback((sport?: LiveActivitySport) => {
    clearLiveTrackingSession();
    setRestorableSession(null);
    dispatch({ type: 'RESET', sport });
  }, []);

  const ingestGpsPoint = useCallback((point: LiveGpsPoint) => {
    dispatch({ type: 'GPS_POINT_RECEIVED', point });
  }, []);

  const restoreSession = useCallback(() => {
    const persistedSession = restorableSession || loadLiveTrackingSession();
    if (!persistedSession) {
      return;
    }

    dispatch({ type: 'RESTORE_SESSION', session: persistedSession });
    setRestorableSession(null);
  }, [restorableSession]);

  const discardSession = useCallback((sport?: LiveActivitySport) => {
    clearLiveTrackingSession();
    setRestorableSession(null);
    dispatch({ type: 'RESET', sport });
  }, []);

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
    start,
    pause,
    resume,
    finish,
    reset,
    ingestGpsPoint,
    restoreSession,
    discardSession,
  };
}
