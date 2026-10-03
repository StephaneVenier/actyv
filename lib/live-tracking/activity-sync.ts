import { LIVE_SPORT_CONFIG } from '@/lib/live-tracking/config';
import { isLiveUuid } from '@/lib/live-tracking/finalization';
import type { FinishedLiveActivity } from '@/lib/live-tracking/types';
import { buildActivityRoute, intervalDurationMs } from '@/lib/activity-route';

export function buildLiveActivityPayload(snapshot: FinishedLiveActivity, user: { id: string; email?: string | null }) {
  if (!isLiveUuid(snapshot.sessionId) || snapshot.ownerUserId !== user.id) {
    throw new Error('Cette activite ne correspond pas a ton compte.');
  }
  return {
    id: snapshot.sessionId, user_id: user.id, user_email: user.email ?? null,
    challenge_id: null, sport: snapshot.sport,
    activity_name: LIVE_SPORT_CONFIG[snapshot.sport].label, source: 'live',
    occurred_at: new Date(snapshot.startedAtMs).toISOString(),
    distance_km: snapshot.distanceM / 1000, duration_minutes: snapshot.activeDurationMs / 60000,
    elevation_gain_m: snapshot.elevationGainM, elevation_loss_m: snapshot.elevationLossM,
    // Multi-metric activity: personal statistics independently fall back to each typed column.
    unit_type: null, unit_value: null,
    metadata: { live_session_id: snapshot.sessionId, live_snapshot_version: 1,
      started_at: new Date(snapshot.startedAtMs).toISOString(),
      finished_at: new Date(snapshot.finishedAtMs).toISOString(),
      active_duration_ms: snapshot.activeDurationMs, paused_duration_ms: snapshot.pausedDurationMs,
      elapsed_duration_ms: snapshot.elapsedDurationMs, gps_point_count: snapshot.state.acceptedPoints.length,
      manual_pause_duration_ms: intervalDurationMs(snapshot.state.pausePeriods, snapshot.startedAtMs, snapshot.finishedAtMs),
      collection_gap_duration_ms: intervalDurationMs(snapshot.state.collectionGaps, snapshot.startedAtMs, snapshot.finishedAtMs),
      route_trace: buildActivityRoute(snapshot),
      duration_method: 'timestamps_minus_pause_gap_union' },
  };
}

export type ExistingLiveActivity = {
  id: string; user_id: string | null; source: string | null; challenge_id: string | null;
  metadata: { live_session_id?: string } | null;
};

export async function synchronizeLiveActivity(snapshot: FinishedLiveActivity, dependencies: {
  getUser: () => Promise<{ id: string; email?: string | null }>;
  insert: (payload: ReturnType<typeof buildLiveActivityPayload>) => Promise<void>;
  find: (id: string) => Promise<ExistingLiveActivity | null>;
  processMasteries: (id: string) => Promise<unknown>;
  persist: (snapshot: FinishedLiveActivity) => void;
}): Promise<FinishedLiveActivity> {
  const user = await dependencies.getUser();
  const payload = buildLiveActivityPayload(snapshot, user);
  try {
    await dependencies.insert(payload);
  } catch (error) {
    if ((error as { code?: string })?.code !== '23505') throw error;
    const existing = await dependencies.find(snapshot.sessionId);
    if (!existing || existing.user_id !== user.id || existing.source !== 'live' ||
      existing.challenge_id != null || existing.metadata?.live_session_id !== snapshot.sessionId) {
      throw new Error('Identifiant deja utilise par une autre activite. Aucune donnee remplacee.');
    }
  }
  const saved: FinishedLiveActivity = { ...snapshot, syncStatus: 'activity_saved', syncError: null };
  dependencies.persist(saved);
  await dependencies.processMasteries(snapshot.sessionId);
  const synced: FinishedLiveActivity = { ...saved, syncStatus: 'synced' };
  dependencies.persist(synced);
  return synced;
}
