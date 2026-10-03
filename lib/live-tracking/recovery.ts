import { createInitialLiveTrackingState } from '@/lib/live-tracking/session';
import { replayLivePoints } from '@/lib/live-tracking/finalization';
import type { LiveActivitySport, LiveGpsPoint, LiveTrackingState, PersistedLiveSession } from '@/lib/live-tracking/types';

export type RecoveryEvent = {
  type: 'START' | 'PAUSE' | 'RESUME' | 'INTERRUPTION' | 'COLLECTION_RESUME' | 'STOP';
  atMs: number;
  estimated: boolean;
};
export type NativeRecoverySession = {
  sessionId: string;
  ownerUserId: string;
  sport: LiveActivitySport;
  startedAtMs: number;
  trackingStatus: 'running' | 'paused' | 'stopped';
  serviceRunning: boolean;
  lastSequence: number;
  stoppedAtMs: number;
  events: RecoveryEvent[];
  points: LiveGpsPoint[];
  truncatedTail: boolean;
};

export function recoveryTimeline(native: NativeRecoverySession) {
  const pauses: NonNullable<LiveTrackingState['pausePeriods']> = [];
  const gaps: NonNullable<LiveTrackingState['collectionGaps']> = [];
  let stoppedAtMs: number | null = null;
  for (const event of native.events) {
    if (!Number.isFinite(event.atMs) || event.atMs < native.startedAtMs) throw new Error('Journal Live invalide.');
    if (event.type === 'PAUSE' && !pauses.some(p => p.endedAtMs == null))
      pauses.push({ startedAtMs: event.atMs, endedAtMs: null });
    if (event.type === 'RESUME') {
      const pause = pauses.find(p => p.endedAtMs == null);
      if (pause) pause.endedAtMs = Math.max(pause.startedAtMs, event.atMs);
    }
    if (event.type === 'INTERRUPTION' && !gaps.some(g => g.endedAtMs == null))
      gaps.push({ startedAtMs: event.atMs, endedAtMs: null, estimated: event.estimated });
    if (event.type === 'COLLECTION_RESUME' || event.type === 'STOP') {
      const gap = gaps.find(g => g.endedAtMs == null);
      if (gap) gap.endedAtMs = Math.max(gap.startedAtMs, event.atMs);
    }
    if (event.type === 'STOP') stoppedAtMs = event.atMs;
  }
  if (!native.serviceRunning && !stoppedAtMs && !gaps.some(g => g.endedAtMs == null)) {
    const last = Math.max(native.startedAtMs, ...native.points.map(p => p.timestamp));
    gaps.push({ startedAtMs: last, endedAtMs: null, estimated: true });
  }
  const openPause = pauses.find(p => p.endedAtMs == null);
  return {
    pausePeriods: pauses, collectionGaps: gaps,
    pausedAtMs: openPause?.startedAtMs ?? null,
    accumulatedPausedMs: pauses.reduce((total, p) => total + (p.endedAtMs == null ? 0 : p.endedAtMs - p.startedAtMs), 0),
    collectionStoppedAtMs: stoppedAtMs ?? (native.stoppedAtMs || null),
    recoveryWarning: gaps.length || native.truncatedTail
      ? 'Une partie de cette activite peut ne pas avoir ete enregistree. Les interruptions sont exclues du temps actif.' : null,
  };
}

export function reconstructNativeSession(native: NativeRecoverySession, ownerUserId: string): PersistedLiveSession {
  if (!ownerUserId || native.ownerUserId !== ownerUserId) throw new Error('Cette activite appartient a un autre compte.');
  if (!['course-a-pied', 'trail', 'marche', 'velo', 'vtt'].includes(native.sport)) throw new Error('Sport Live invalide.');
  const timeline = recoveryTimeline(native);
  const initial: LiveTrackingState = { ...createInitialLiveTrackingState(native.sport),
    sessionId: native.sessionId, ownerUserId, startedAtMs: native.startedAtMs,
    status: timeline.pausedAtMs != null ? 'paused' : 'running', ...timeline };
  const state = replayLivePoints(initial, native.points);
  if (state.lastSequence !== native.lastSequence) throw new Error('Trace native incomplete. Aucune donnee effacee.');
  return { version: 1, state, updatedAtMs: Date.now() };
}

export function recoverCheckpointOnly(checkpoint: PersistedLiveSession, ownerUserId: string): PersistedLiveSession {
  if (!ownerUserId || checkpoint.state.ownerUserId !== ownerUserId) throw new Error('Cette activite appartient a un autre compte.');
  const state = checkpoint.state;
  // No native trace: preserve the known aggregates, never invent movement/time after this checkpoint.
  const lastAtMs = state.collectionStoppedAtMs ?? Math.max(state.startedAtMs ?? 0, checkpoint.updatedAtMs);
  return { ...checkpoint, state: { ...state, checkpointOnly: true,
    collectionGaps: [...(state.collectionGaps || []), { startedAtMs: lastAtMs, endedAtMs: null, estimated: true }],
    recoveryWarning: 'Seule la sauvegarde locale est disponible. Termine cette activite avec les donnees conservees.' } };
}
