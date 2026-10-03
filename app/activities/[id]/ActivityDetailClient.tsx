'use client';

import Link from 'next/link';
import dynamic from 'next/dynamic';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { buildActivityDetailMetrics, buildActivityTimeDetails, formatActivityDurationMs, type ActivityDetail } from '@/lib/activity-detail';
import { readActivityRoute } from '@/lib/activity-route';
import { loadActivityContributions, formatActivityContribution, type ActivityContribution } from '@/lib/activity-contributions';

const ActivityRouteMap = dynamic(() => import('@/components/ActivityRouteMap'), { ssr: false,
  loading: () => <div className="activity-route-map" role="status">Chargement du parcours...</div> });

export function ActivityDetailClient({ activityId }: { activityId: string }) {
  const [activity, setActivity] = useState<ActivityDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [contributions, setContributions] = useState<ActivityContribution[]>([]);
  const [masteryWarning, setMasteryWarning] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setActivity(null);
    setError('');
    setContributions([]); setMasteryWarning(null);
    void (async () => {
      try {
        const { data: auth, error: authError } = await supabase.auth.getUser();
        if (authError || !auth.user) throw new Error('Connecte-toi pour consulter cette activite.');
        const { data, error: queryError } = await supabase.from('activities')
          .select('id,sport,activity_name,source,challenge_id,distance_km,duration_minutes,elevation_gain_m,elevation_loss_m,occurred_at,created_at,unit_type,unit_value,metadata')
          .eq('id', activityId).eq('user_id', auth.user.id).maybeSingle();
        if (queryError) throw new Error('Impossible de charger cette activite. Reessaie plus tard.');
        if (!data) throw new Error('Activite introuvable ou inaccessible.');
        if (!cancelled) setActivity(data as ActivityDetail);
        try {
          const result = await loadActivityContributions(activityId, auth.user.id);
          if (!cancelled) { setContributions(result.contributions); setMasteryWarning(result.warning); }
        } catch (cause) {
          if (!cancelled) setMasteryWarning(cause instanceof Error ? cause.message : 'Contributions indisponibles.');
        }
      } catch (cause) {
        if (!cancelled) setError(cause instanceof Error ? cause.message : 'Impossible de charger cette activite.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [activityId]);

  const timestamp = activity?.occurred_at || activity?.created_at;
  const date = timestamp ? new Date(timestamp) : null;
  const dateLabel = date && Number.isFinite(date.getTime())
    ? new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeStyle: 'short' }).format(date) : null;
  const trace = activity ? readActivityRoute(activity.source, activity.challenge_id, activity.metadata?.route_trace) : null;
  const metrics = activity ? buildActivityDetailMetrics(activity) : [];
  const primary = metrics.filter(m => ['Distance', 'Temps actif', 'Allure moyenne', 'Vitesse moyenne'].includes(m.label));
  const exactActive = formatActivityDurationMs(activity?.metadata?.active_duration_ms);
  const exactDistance = activity?.distance_km != null && Number.isFinite(activity.distance_km)
    ? formatActivityContribution(activity.distance_km, 'km') : null;
  const details = activity ? [...metrics.filter(m => !primary.includes(m)), ...buildActivityTimeDetails(activity)] : [];

  return (
    <div className="page-shell history-page-shell">
      <section className="activity-detail" aria-busy={loading}>
        <Link href="/historique" className="detail-back-link">Retour a l&apos;historique</Link>
        <header>
          <h1>{activity?.activity_name?.trim() || activity?.sport?.trim() || 'Activite'}</h1>
          {activity ? <p>{dateLabel || activity.sport}</p> : null}
          {activity?.source === 'live' ? <small>Live Actyv</small> : null}
        </header>
        {loading ? <p role="status">Chargement...</p> : null}
        {error ? <p role="alert">{error}</p> : null}
        {activity ? (
          <>
            <dl className="activity-detail__summary">
              {primary.map(metric => <div key={metric.label}><dt>{metric.label}</dt>
                <dd>{metric.label === 'Temps actif' && exactActive ? exactActive :
                  metric.label === 'Distance' && exactDistance ? exactDistance : metric.value}</dd></div>)}
            </dl>
            {trace ? <section className="activity-detail__section"><h2>Parcours</h2><ActivityRouteMap trace={trace} /></section> : null}
            {details.length ? <section className="activity-detail__section"><h2>Détails de la sortie</h2>
              <dl className="activity-detail__metrics">{details.map(metric =>
                <div key={metric.label}><dt>{metric.label}</dt><dd>{metric.value}</dd></div>)}</dl></section> : null}
            {contributions.length ? <section className="activity-detail__section">
              <h2>Cette activité a fait progresser</h2>
              <div className="activity-contributions">{contributions.map(c =>
                <Link key={c.masteryId} href={`/maitrises/${c.slug}`} className="activity-contribution">
                  <div><strong>{c.name}</strong><span className="activity-contribution__gain">+{formatActivityContribution(c.value, c.unit, c.name)}</span></div>
                  {c.progress ? <><small>Niveau {c.progress.level} · Progression actuelle : {formatActivityContribution(c.progress.total, c.unit, c.name)}
                    {c.progress.isMax ? ' · Niveau maximum' : ` / ${formatActivityContribution(c.progress.nextThreshold, c.unit, c.name)}`}</small>
                    <progress value={c.progress.percent} max={100} aria-label={`Progression actuelle ${c.name}`} /></> : null}
                </Link>)}</div>
            </section> : null}
            {masteryWarning ? <p className="activity-detail__warning" role="status">{masteryWarning}</p> : null}
          </>
        ) : null}
      </section>
    </div>
  );
}
