'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { resumeAccountPurges } from '@/lib/account-deletion';
import { finalizeLiveActivity, replayLivePoints } from '@/lib/live-tracking/finalization';
import { syncFinishedLiveActivity } from '@/lib/live-tracking/activity-api';
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
  loadFinishedLiveActivities,
  saveFinishedLiveActivity,
} from '@/lib/live-tracking/storage';
import {
  liveTrackingPlatform,
  type LiveTrackingPlatformStatus,
} from '@/lib/live-tracking/platform';
import { getActiveDurationMs } from '@/lib/live-tracking/timer';
import { reconstructNativeSession, recoverCheckpointOnly, recoveryTimeline } from '@/lib/live-tracking/recovery';
import type { FinishedLiveActivity, LiveActivitySport, LiveGpsPoint, LiveTrackingAction, PersistedLiveSession } from '@/lib/live-tracking/types';

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
  return error && typeof error === 'object' && 'message' in error && typeof error.message === 'string'
    ? error.message : fallback;
}

export function useLiveTracking() {
  const [state, setState] = useState(createInitialLiveTrackingState);
  const [restorableSession, setRestorableSession] = useState<PersistedLiveSession | null>(null);
  const [platformStatus, setPlatformStatus] = useState<LiveTrackingPlatformStatus>(WEB_STATUS);
  const [platformError, setPlatformError] = useState<string | null>(null);
  const [nativeActionPending, setNativeActionPending] = useState(false);
  const [ownerUserId, setOwnerUserId] = useState<string | null>(null);
  const [recoveryPending, setRecoveryPending] = useState(liveTrackingPlatform.isAvailable());
  const [recoveryBlocked, setRecoveryBlocked] = useState(false);
  const persistTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loadedInitialSessionRef = useRef(false);
  const stateRef = useRef(state);
  const userIdRef = useRef<string | null>(null);
  const actionLockRef = useRef(false);
  const syncLockRef = useRef(false);
  const drainChainRef = useRef<Promise<void>>(Promise.resolve());
  const drainRequestedRef = useRef(false);
  const [finishedActivity, setFinishedActivity] = useState<FinishedLiveActivity | null>(null);
  const [syncPending, setSyncPending] = useState(false);
  const [pendingActivities, setPendingActivities] = useState<FinishedLiveActivity[]>([]);
  const [restorePendingOnLoad, setRestorePendingOnLoad] = useState(true);
  const [nowMs, setNowMs] = useState(() => Date.now());

  const dispatch = useCallback((action: LiveTrackingAction) => {
    const next = liveTrackingReducer(stateRef.current, action);
    stateRef.current = next;
    setState(next);
  }, []);

  const replaceState = useCallback((next: typeof state) => {
    stateRef.current = next;
    setState(next);
  }, []);

  const refreshOutbox = useCallback(() => {
    const pending = loadFinishedLiveActivities().filter((row) => row.syncStatus !== 'synced' &&
      row.ownerUserId === userIdRef.current);
    setPendingActivities(pending);
    return pending;
  }, []);

  const persistCurrentState = useCallback(() => {
    try { saveLiveTrackingSession(stateRef.current); }
    catch { setPlatformError('Impossible de sauvegarder le Live sur ce telephone.'); }
  }, []);

  const showFinishedActivity = useCallback((snapshot: FinishedLiveActivity) => {
    replaceState(snapshot.state);
    setFinishedActivity(snapshot);
    setRestorableSession(null);
  }, [replaceState]);

  useEffect(() => {
    let cancelled = false;
    void supabase.auth.getSession().then(({ data }: { data: { session: { user: { id: string } } | null } }) => {
      if (!cancelled) { userIdRef.current = data.session?.user.id ?? null;
        setOwnerUserId(userIdRef.current); liveTrackingPlatform.setOwner(userIdRef.current); refreshOutbox(); }
    }).catch(() => undefined);
    const { data } = supabase.auth.onAuthStateChange((_event: string, session: { user: { id: string } } | null) => {
      userIdRef.current = session?.user.id ?? null;
      setOwnerUserId(userIdRef.current);
      liveTrackingPlatform.setOwner(userIdRef.current);
      try { refreshOutbox(); } catch { setPlatformError('Impossible de lire les activites locales.'); }
    });
    return () => { cancelled = true; data.subscription.unsubscribe(); };
  }, [refreshOutbox]);

  useEffect(() => {
    if (loadedInitialSessionRef.current) {
      return;
    }

    loadedInitialSessionRef.current = true;
    if (liveTrackingPlatform.isAvailable()) return;
    const persistedSession = loadLiveTrackingSession();
    try {
      const finalized = loadFinishedLiveActivities().some((row) => row.sessionId === persistedSession?.state.sessionId);
      if (!finalized && isRestorableSession(persistedSession)) setRestorableSession(persistedSession);
    } catch { setPlatformError('Impossible de lire les activites locales.'); }
  }, []);

  useEffect(() => {
    let cancelled = false;
    setRestorableSession(null);
    setFinishedActivity(null);
    if (stateRef.current.ownerUserId && stateRef.current.ownerUserId !== ownerUserId)
      replaceState(createInitialLiveTrackingState());
    if (!ownerUserId) { setRecoveryPending(false); return; }
    setRecoveryPending(true);
    void (async () => {
      try {
        await resumeAccountPurges();
        if (cancelled) return;
        const deletionStatus = await supabase.rpc('get_own_account_deletion_status');
        if (deletionStatus.error || deletionStatus.data === true) throw new Error('Verification du compte requise avant recuperation du Live.');
        await liveTrackingPlatform.transitionOwner(ownerUserId);
        const checkpoint = loadLiveTrackingSession();
        const result = await liveTrackingPlatform.getRecoverySession(ownerUserId);
        if (cancelled) return;
        setRecoveryBlocked(Boolean(result.blocked));
        if (result.blocked) {
          setRestorableSession(null);
          setPlatformError('Une activite conservee appartient a un autre compte ou son proprietaire ne peut pas etre verifie.');
          return;
        }
        const finalized = loadFinishedLiveActivities().find(row => row.ownerUserId === ownerUserId &&
          row.sessionId === (result.session?.sessionId || checkpoint?.state.sessionId));
        if (finalized) {
          if (result.session) await liveTrackingPlatform.clearSession(result.session.sessionId);
          if (!cancelled && stateRef.current.status === 'idle') showFinishedActivity(finalized);
          return;
        }
        if (result.session && stateRef.current.status === 'idle') {
          setRestorableSession(reconstructNativeSession(result.session, ownerUserId));
        } else if (isRestorableSession(checkpoint) && stateRef.current.status === 'idle') {
          if (checkpoint!.state.ownerUserId !== ownerUserId) {
            setRecoveryBlocked(true);
            setPlatformError('Connecte-toi avec le compte de cette activite pour la recuperer.');
          } else setRestorableSession(liveTrackingPlatform.isAvailable()
            ? recoverCheckpointOnly(checkpoint!, ownerUserId) : checkpoint);
        }
      } catch (error) {
        if (!cancelled) { setRecoveryBlocked(true); setPlatformError(getErrorMessage(error, 'Recuperation impossible. Les donnees sont conservees.')); }
      } finally { if (!cancelled) setRecoveryPending(false); }
    })();
    return () => { cancelled = true; };
  // Discovery is tied to the account, not to every GPS state change.
  }, [ownerUserId, replaceState, showFinishedActivity]);

  const reconcilePendingPoints = useCallback(
    (sessionId: string, _afterSequence: number = 0) => {
      if (!liveTrackingPlatform.isAvailable()) {
        return Promise.resolve();
      }
      const next = drainChainRef.current.catch(() => undefined).then(async () => {
        if (stateRef.current.sessionId !== sessionId) return;
        const pendingResult = await liveTrackingPlatform.getPendingPoints(sessionId, stateRef.current.lastSequence);
        if (stateRef.current.sessionId !== sessionId) return;
        if (pendingResult.recovery) {
          if (pendingResult.recovery.ownerUserId !== userIdRef.current) throw new Error('Cette activite appartient a un autre compte.');
          replaceState({ ...stateRef.current, ...recoveryTimeline(pendingResult.recovery) });
        }
        replaceState(replayLivePoints(stateRef.current, pendingResult.points));
        if (stateRef.current.lastSequence < pendingResult.lastSequence) {
          throw new Error('La trace GPS native est incomplete. Les donnees sont conservees pour reessayer.');
        }
      });
      drainChainRef.current = next;
      return next;
    },
    [replaceState]
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
      currentState.sessionId &&
      nativeStatus.sessionId === currentState.sessionId &&
      (currentState.status === 'running' || currentState.status === 'paused')
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
      return;
    }

    persistTimeoutRef.current = setTimeout(() => {
      try { saveLiveTrackingSession(state); }
      catch { setPlatformError('Impossible de sauvegarder le Live sur ce telephone.'); }
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
        if (cancelled) return;
        const currentSessionId = stateRef.current.sessionId;
        if (currentSessionId && point.sessionId && point.sessionId !== currentSessionId) {
          return;
        }

        // Direct events are wake-up hints only. Read the authoritative file in sequence order.
        if (currentSessionId && !drainRequestedRef.current && !actionLockRef.current) {
          drainRequestedRef.current = true;
          void reconcilePendingPoints(currentSessionId).catch(() => {
            setPlatformError('Impossible de recuperer les points GPS.');
          }).finally(() => { drainRequestedRef.current = false; });
        }
      });

      if (locationHandle) {
        if (cancelled) { await locationHandle.remove(); return; }
        removeHandles.push(() => locationHandle.remove());
      }
      const statusHandle = await liveTrackingPlatform.addStatusListener((status) => {
        if (cancelled) {
          return;
        }
        setPlatformStatus(status);
      });

      if (statusHandle) {
        if (cancelled) { await statusHandle.remove(); return; }
        removeHandles.push(() => statusHandle.remove());
      }
      const errorHandle = await liveTrackingPlatform.addErrorListener((message) => {
        if (cancelled) {
          return;
        }
        setPlatformError(message);
      });

      if (errorHandle) {
        if (cancelled) { await errorHandle.remove(); return; }
        removeHandles.push(() => errorHandle.remove());
      }

      if (cancelled) {
        removeHandles.forEach((remove) => { void remove(); });
        return;
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

    void attachListeners().catch(() => {
      removeHandles.splice(0).forEach(remove => { void Promise.resolve(remove()).catch(() => undefined); });
      if (!cancelled) setPlatformError('Impossible de connecter le suivi GPS natif.');
    });

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
  }, [syncNativeStatus, reconcilePendingPoints]);

  useEffect(() => {
    if (restorePendingOnLoad && !recoveryPending && !recoveryBlocked && state.status === 'idle' && !restorableSession && pendingActivities.length > 0) {
      showFinishedActivity(pendingActivities[0]);
    }
  }, [restorePendingOnLoad, state.status, restorableSession, pendingActivities, showFinishedActivity, recoveryPending, recoveryBlocked]);

  const start = useCallback(
    async (sport: LiveActivitySport) => {
      if (actionLockRef.current || stateRef.current.status !== 'idle' || restorableSession || recoveryPending || recoveryBlocked) return false;
      if (!userIdRef.current) {
        setPlatformError('Connecte-toi avant de demarrer une activite Live.');
        return false;
      }
      setPlatformError(null);

      if (!liveTrackingPlatform.isAvailable()) {
        setRestorableSession(null);
        dispatch({
          type: 'START',
          sport,
          nowMs: Date.now(),
          sessionId: createLiveSessionId(),
        });
        replaceState({ ...stateRef.current, ownerUserId: userIdRef.current });
        persistCurrentState();
        return true;
      }

      setNativeActionPending(true);
      actionLockRef.current = true;

      try {
        let nativeStatus = await liveTrackingPlatform.checkPermissions();
        setPlatformStatus(nativeStatus);

        if (nativeStatus.finalizationVersion !== 1 || nativeStatus.recoveryVersion !== 1) {
          setPlatformError('Mets a jour l’application Android pour enregistrer les activites Live.');
          return false;
        }

        if (nativeStatus.sessionId) {
          setPlatformError('Recupere ou abandonne l’activite conservee avant de demarrer un nouveau Live.');
          return false;
        }

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
        replaceState({ ...stateRef.current, ownerUserId: userIdRef.current });
        persistCurrentState();

        try {
          const startedStatus = await liveTrackingPlatform.startTracking({
            sessionId,
            sport,
            startedAtMs: now,
            accumulatedPausedMs: 0,
            ownerUserId: userIdRef.current ?? undefined,
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
      } catch (error) {
        setPlatformError(getErrorMessage(error, 'Impossible de demarrer le Live.'));
        return false;
      } finally {
        actionLockRef.current = false;
        setNativeActionPending(false);
      }
    },
    [dispatch, persistCurrentState, replaceState, restorableSession, recoveryPending, recoveryBlocked]
  );

  const pause = useCallback(async () => {
    if (actionLockRef.current || stateRef.current.status !== 'running') return;
    const now = Date.now();
    const sessionId = stateRef.current.sessionId;
    const accumulatedPausedMs = stateRef.current.accumulatedPausedMs;

    dispatch({ type: 'PAUSE', nowMs: now });
    persistCurrentState();

    if (!liveTrackingPlatform.isAvailable() || !sessionId) {
      return;
    }

    actionLockRef.current = true;
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
      actionLockRef.current = false;
      setNativeActionPending(false);
    }
  }, [dispatch, persistCurrentState]);

  const resume = useCallback(async () => {
    if (actionLockRef.current || stateRef.current.status !== 'paused') return;
    const now = Date.now();
    const currentState = stateRef.current;
    const sessionId = currentState.sessionId;
    const accumulatedPausedMs =
      currentState.pausedAtMs != null
        ? currentState.accumulatedPausedMs +
          Math.max(0, now - currentState.pausedAtMs)
        : currentState.accumulatedPausedMs;

    dispatch({ type: 'RESUME', nowMs: now });
    persistCurrentState();

    if (!liveTrackingPlatform.isAvailable() || !sessionId) {
      return;
    }

    actionLockRef.current = true;
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
      actionLockRef.current = false;
      setNativeActionPending(false);
    }
  }, [dispatch, persistCurrentState, reconcilePendingPoints]);

  const retrySync = useCallback(async (snapshot = finishedActivity) => {
    if (!snapshot || syncLockRef.current || snapshot.syncStatus === 'synced') return;
    syncLockRef.current = true;
    setSyncPending(true);
    try {
      const synced = await syncFinishedLiveActivity(snapshot);
      if (stateRef.current.sessionId === snapshot.sessionId) setFinishedActivity(synced);
      refreshOutbox();
      if (liveTrackingPlatform.isAvailable()) {
        await liveTrackingPlatform.clearSession(snapshot.sessionId).catch(() => undefined);
      }
    } catch (error) {
      const stored = loadFinishedLiveActivities().find((row) => row.sessionId === snapshot.sessionId) || snapshot;
      const failed = { ...stored, syncError: getErrorMessage(error, 'Synchronisation impossible. Reessaie avec une connexion.') };
      try { saveFinishedLiveActivity(failed); } catch { /* Existing durable snapshot retained. */ }
      if (stateRef.current.sessionId === snapshot.sessionId) setFinishedActivity(failed);
      refreshOutbox();
    } finally {
      syncLockRef.current = false;
      setSyncPending(false);
    }
  }, [finishedActivity, refreshOutbox]);

  const finish = useCallback(async () => {
    if (actionLockRef.current || !['running', 'paused'].includes(stateRef.current.status)) return;
    const sessionId = stateRef.current.sessionId;
    if (!sessionId) return;
    actionLockRef.current = true;
    setNativeActionPending(true);
    try {
      const snapshot = await finalizeLiveActivity({
        getState: () => stateRef.current,
        async stopCollection() {
          let stoppedAtMs = stateRef.current.collectionStoppedAtMs ?? Date.now();
          if (liveTrackingPlatform.isAvailable() && !stateRef.current.checkpointOnly) {
            const stopped = await liveTrackingPlatform.stopTracking({ sessionId });
            setPlatformStatus(stopped);
            stoppedAtMs = stopped.stoppedAtMs ?? stoppedAtMs;
          }
          replaceState({ ...stateRef.current, collectionStoppedAtMs: stoppedAtMs });
          persistCurrentState();
        },
        drainPoints: () => stateRef.current.checkpointOnly ? Promise.resolve() : reconcilePendingPoints(sessionId),
        persist: saveFinishedLiveActivity,
        cleanup: () => liveTrackingPlatform.clearSession(sessionId),
        now: Date.now,
      });
      showFinishedActivity(snapshot);
      persistCurrentState();
      refreshOutbox();
      void retrySync(snapshot);
    } catch (error) {
      setPlatformError(
        getErrorMessage(error, 'Impossible d’arrêter proprement le suivi GPS.')
      );
    } finally {
      actionLockRef.current = false;
      setNativeActionPending(false);
    }
  }, [persistCurrentState, reconcilePendingPoints, showFinishedActivity, refreshOutbox, retrySync, replaceState]);

  const reset = useCallback(
    async (sport?: LiveActivitySport) => {
      if (actionLockRef.current) return;
      const sessionId = stateRef.current.sessionId;

      if (liveTrackingPlatform.isAvailable() && sessionId && stateRef.current.status !== 'finished') {
        try {
          await liveTrackingPlatform.stopTracking({ sessionId });
        } catch {
          // noop
        }
      }

      clearLiveTrackingSession();
      setRestorableSession(null);
      setPlatformError(null);
      setFinishedActivity(null);
      setRestorePendingOnLoad(false);
      dispatch({ type: 'RESET', sport });
      await syncNativeStatus().catch(() => undefined);
    },
    [dispatch, syncNativeStatus]
  );

  const ingestGpsPoint = useCallback((point: LiveGpsPoint) => {
    dispatch({ type: 'GPS_POINT_RECEIVED', point });
  }, [dispatch]);

  const restoreSession = useCallback(async () => {
    const persistedSession = restorableSession || loadLiveTrackingSession();
    if (!persistedSession || actionLockRef.current) {
      return;
    }

    if (!userIdRef.current || persistedSession.state.ownerUserId !== userIdRef.current) {
      setPlatformError('Connecte-toi avec le compte de cette activite pour la reprendre.');
      return;
    }

    if (persistedSession.state.checkpointOnly || persistedSession.state.collectionStoppedAtMs) {
      setPlatformError('Cette activite ne peut plus reprendre. Tu peux la terminer avec les donnees conservees.'); return;
    }
    actionLockRef.current = true;
    setNativeActionPending(true);
    try {
      let restored = persistedSession;
      if (liveTrackingPlatform.isAvailable() && persistedSession.state.sessionId) {
        await liveTrackingPlatform.recoverTracking(persistedSession.state.sessionId);
        const result = await liveTrackingPlatform.getRecoverySession(userIdRef.current);
        if (!result.session || result.blocked) throw new Error('Recuperation indisponible. Les donnees sont conservees.');
        restored = reconstructNativeSession(result.session, userIdRef.current);
      }
      dispatch({ type: 'RESTORE_SESSION', session: restored });
      persistCurrentState(); setRestorableSession(null);
      await syncNativeStatus();
    } catch (error) { setPlatformError(getErrorMessage(error, 'Impossible de reprendre cette activite.')); }
    finally { actionLockRef.current = false; setNativeActionPending(false); }
  }, [dispatch, persistCurrentState, restorableSession, syncNativeStatus]);

  const discardSession = useCallback(
    async (sport?: LiveActivitySport) => {
      if (actionLockRef.current) return;
      const persistedSession = restorableSession || loadLiveTrackingSession();
      const sessionId = persistedSession?.state.sessionId || stateRef.current.sessionId;
      if (!userIdRef.current || persistedSession?.state.ownerUserId !== userIdRef.current) {
        setPlatformError('Connecte-toi avec le compte de cette activite pour l’abandonner.'); return;
      }
      if (!window.confirm('Abandonner cette activite ? Les donnees locales seront supprimees.')) return;
      actionLockRef.current = true;
      setNativeActionPending(true);
      try {
      if (liveTrackingPlatform.isAvailable() && sessionId && !persistedSession?.state.checkpointOnly) {
        try {
          await liveTrackingPlatform.stopTracking({ sessionId });
          await liveTrackingPlatform.clearSession(sessionId);
        } catch {
          setPlatformError('Impossible d’arreter cette activite. Reessaie avant de l’abandonner.');
          return;
        }
      }

      clearLiveTrackingSession();
      setRestorableSession(null);
      setRecoveryBlocked(false);
      setPlatformError(null);
      dispatch({ type: 'RESET', sport });
      await syncNativeStatus().catch(() => undefined);
      } finally {
        actionLockRef.current = false;
        setNativeActionPending(false);
      }
    },
    [dispatch, restorableSession, syncNativeStatus]
  );

  const activeDurationMs = useMemo(() => getActiveDurationMs(state, nowMs), [state, nowMs]);
  const finishRestoredSession = useCallback(async () => {
    if (actionLockRef.current || !restorableSession || restorableSession.state.ownerUserId !== userIdRef.current) return;
    actionLockRef.current = true;
    setNativeActionPending(true);
    try {
      let recovered = restorableSession;
      if (liveTrackingPlatform.isAvailable() && !recovered.state.checkpointOnly && userIdRef.current) {
        const result = await liveTrackingPlatform.getRecoverySession(userIdRef.current);
        if (!result.session || result.blocked) throw new Error('Recuperation indisponible. Les donnees sont conservees.');
        recovered = reconstructNativeSession(result.session, userIdRef.current);
      }
      replaceState(recovered.state); setRestorableSession(null); persistCurrentState();
      actionLockRef.current = false;
      await finish();
    } catch (error) { setPlatformError(getErrorMessage(error, 'Impossible de terminer cette activite.')); }
    finally { actionLockRef.current = false; setNativeActionPending(false); }
  }, [restorableSession, replaceState, persistCurrentState, finish]);
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
    recoveryPending,
    recoveryBlocked,
    finishRestoredSession,
    finishedActivity,
    syncPending,
    retrySync,
    pendingActivities,
    showPendingActivity: () => {
      if (stateRef.current.status === 'idle' && pendingActivities[0]) showFinishedActivity(pendingActivities[0]);
    },
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

