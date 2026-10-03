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
