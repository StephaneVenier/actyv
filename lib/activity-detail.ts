import { getActivityMetricLabel, formatHistoryDurationMinutes, formatHistoryDistanceKm,
  formatHistoryNumber } from '@/lib/history';

export type ActivityDetail = {
  id: string;
  sport: string | null;
  activity_name: string | null;
  source: string | null;
  challenge_id: string | null;
  distance_km: number | null;
  duration_minutes: number | null;
  elevation_gain_m: number | null;
  elevation_loss_m: number | null;
  occurred_at: string | null;
  created_at: string | null;
  unit_type: string | null;
  unit_value: number | null;
  metadata?: Record<string, unknown> | null;
};

export function buildActivityDetailMetrics(activity: ActivityDetail) {
  // Typed metrics are authoritative; legacy unit values only fill absent fields.
  const distance = activity.distance_km ?? (activity.unit_type === 'distance' ? activity.unit_value : null);
  const duration = activity.duration_minutes ?? (activity.unit_type === 'duration' ? activity.unit_value : null);
  const metrics: Array<{ label: string; value: string }> = [];
  const add = (label: string, value: string | null) => { if (value) metrics.push({ label, value }); };
  add('Distance', formatHistoryDistanceKm(distance));
  add('Temps actif', formatHistoryDurationMinutes(duration));
  const average = getActivityMetricLabel(activity.sport, distance, duration);
  add(average?.includes('/km') ? 'Allure moyenne' : 'Vitesse moyenne', average);
  for (const [label, value] of [['D+', activity.elevation_gain_m], ['D-', activity.elevation_loss_m]] as const) {
    if (value != null && Number.isFinite(value) && value >= 0) add(label, `${formatHistoryNumber(value)} m`);
  }
  if (activity.unit_type && !['distance', 'duration'].includes(activity.unit_type) &&
      activity.unit_value != null && Number.isFinite(activity.unit_value)) {
    add('Performance', `${formatHistoryNumber(activity.unit_value)} ${activity.unit_type === 'reps' ? 'reps' : activity.unit_type}`);
  }
  return metrics;
}

export function formatActivityDurationMs(value: unknown): string | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return null;
  const seconds = Math.round(value / 1000);
  const h = Math.floor(seconds / 3600), m = Math.floor(seconds % 3600 / 60), s = seconds % 60;
  return h ? `${h}h${String(m).padStart(2, '0')}${s ? ` ${s} s` : ''}` : `${m} min${s ? ` ${s} s` : ''}`;
}

export function buildActivityTimeDetails(activity: ActivityDetail) {
  const metadata = activity.metadata || {};
  const result: Array<{ label: string; value: string }> = [];
  for (const [key, label] of [['started_at', 'Depart'], ['finished_at', 'Arrivee']] as const) {
    const value = metadata[key];
    if (typeof value === 'string' && Number.isFinite(new Date(value).getTime())) result.push({ label,
      value: new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(new Date(value)) });
  }
  for (const [key, label] of [['elapsed_duration_ms', 'Temps total'], ['manual_pause_duration_ms', 'Pause manuelle'],
    ['collection_gap_duration_ms', 'Interruption de collecte']] as const) {
    const value = formatActivityDurationMs(metadata[key]);
    if (value) result.push({ label, value });
  }
  if (metadata.manual_pause_duration_ms == null && metadata.collection_gap_duration_ms == null) {
    const value = formatActivityDurationMs(metadata.paused_duration_ms);
    if (value) result.push({ label: 'Temps exclu (pause / interruption)', value });
  }
  return result;
}
