import { supabase } from '@/lib/supabase';
import { formatActivityDurationMs } from '@/lib/activity-detail';

export type ActivityContribution = {
  masteryId: string; slug: string; name: string; unit: string; value: number;
  progress: { level: number; total: number; nextThreshold: number; percent: number; isMax: boolean } | null;
};
type Entry = { id: string; mastery_id: string; value: number | string };
type MasteryInfo = { id: string; slug: string; name: string; unit: string };
type Progress = { mastery_id: string; current_level: number | string; total_value: number | string;
  next_threshold: number | string; progress_percent: number | string; is_max_level: boolean };
const numeric = (value: unknown) => Number.isFinite(Number(value)) ? Number(value) : 0;

export function normalizeActivityContributions(entries: Entry[], masteries: MasteryInfo[], progress: Progress[]) {
  const sums = new Map<string, number>(), seen = new Set<string>();
  for (const entry of entries) {
    if (seen.has(entry.id)) continue;
    seen.add(entry.id);
    const value = numeric(entry.value);
    if (value > 0) sums.set(entry.mastery_id, (sums.get(entry.mastery_id) || 0) + value);
  }
  return masteries.filter(m => sums.has(m.id)).map(m => {
    const p = progress.find(row => row.mastery_id === m.id);
    return { masteryId: m.id, slug: m.slug, name: m.name, unit: m.unit, value: sums.get(m.id)!,
      progress: p ? { level: numeric(p.current_level), total: numeric(p.total_value), nextThreshold: numeric(p.next_threshold),
        percent: Math.max(0, Math.min(100, numeric(p.progress_percent))), isMax: Boolean(p.is_max_level) } : null };
  }).sort((a, b) => a.name.localeCompare(b.name, 'fr'));
}

export function formatActivityContribution(value: number, unit: string, name = '') {
  if (unit === 'minutes') return formatActivityDurationMs(value * 60000) || '0 min';
  if (unit === 'seconds' || unit === 'sec') return formatActivityDurationMs(value * 1000) || '0 min';
  const number = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: value > 0 && value < 0.001 ? 6 : 3 }).format(value);
  if (unit === 'count') {
    const label = /sortie/i.test(name) ? 'sortie' : /seance/i.test(name) ? 'seance' : 'occurrence';
    return `${number} ${label}${value > 1 ? 's' : ''}`;
  }
  return `${number}${unit ? ` ${unit}` : ''}`;
}

export async function loadActivityContributions(activityId: string, userId: string) {
  const entriesResponse = await supabase.from('mastery_entries').select('id,mastery_id,value')
    .eq('user_id', userId).eq('source', 'activity').eq('source_ref_id', activityId);
  if (entriesResponse.error) throw new Error('Impossible de charger les contributions Maitrises.');
  const entries = (entriesResponse.data || []) as Entry[];
  if (!entries.length) return { contributions: [], warning: null };
  const ids = [...new Set(entries.map(e => e.mastery_id))];
  const [masteriesResponse, progressResponse] = await Promise.all([
    supabase.from('masteries').select('id,slug,name,unit').in('id', ids),
    supabase.rpc('get_my_masteries_progress'),
  ]);
  if (masteriesResponse.error) throw new Error('Impossible de charger les Maitrises concernees.');
  return { contributions: normalizeActivityContributions(entries, (masteriesResponse.data || []) as MasteryInfo[],
    progressResponse.error ? [] : (progressResponse.data || []) as Progress[]),
    warning: progressResponse.error ? 'Progression actuelle indisponible. Les contributions restent affichees.' : null };
}
