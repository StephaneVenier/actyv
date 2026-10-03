'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { buildActivityDetailMetrics, type ActivityDetail } from '@/lib/activity-detail';

export function ActivityDetailClient({ activityId }: { activityId: string }) {
  const [activity, setActivity] = useState<ActivityDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setActivity(null);
    setError('');
    void (async () => {
      try {
        const { data: auth, error: authError } = await supabase.auth.getUser();
        if (authError || !auth.user) throw new Error('Connecte-toi pour consulter cette activite.');
        const { data, error: queryError } = await supabase.from('activities')
          .select('id,sport,activity_name,source,challenge_id,distance_km,duration_minutes,elevation_gain_m,elevation_loss_m,occurred_at,created_at,unit_type,unit_value')
          .eq('id', activityId).eq('user_id', auth.user.id).maybeSingle();
        if (queryError) throw new Error('Impossible de charger cette activite. Reessaie plus tard.');
        if (!data) throw new Error('Activite introuvable ou inaccessible.');
        if (!cancelled) setActivity(data as ActivityDetail);
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

  return (
    <div className="page-shell history-page-shell">
      <section className="activity-detail" aria-busy={loading}>
        <Link href="/historique" className="detail-back-link">Retour a l&apos;historique</Link>
        <header>
          <h1>{activity?.activity_name?.trim() || activity?.sport?.trim() || 'Activite'}</h1>
          {activity ? <p>{activity.sport}{dateLabel ? ` · ${dateLabel}` : ''}</p> : null}
          {activity?.source === 'live' ? <small>Live Actyv</small> : null}
        </header>
        {loading ? <p role="status">Chargement...</p> : null}
        {error ? <p role="alert">{error}</p> : null}
        {activity ? (
          <dl className="activity-detail__metrics">
            {buildActivityDetailMetrics(activity).map(metric => (
              <div key={metric.label}><dt>{metric.label}</dt><dd>{metric.value}</dd></div>
            ))}
          </dl>
        ) : null}
      </section>
    </div>
  );
}
