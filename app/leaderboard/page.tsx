'use client';

import { useEffect, useMemo, useState } from 'react';
import { AppShell } from '@/components/AppShell';
import { UserLevelBadge } from '@/components/user-level-badge';
import { supabase } from '@/lib/supabase';

type Profile = {
  id: string;
  email: string | null;
  username: string | null;
  total_xp: number | null;
  level: number | null;
};

type Activity = {
  user_id: string | null;
  user_email: string | null;
  distance_km: number | null;
  unit_type: 'distance' | 'duration' | 'reps' | null;
  unit_value: number | null;
  created_at: string | null;
};

type Identity = {
  key: string;
  label: string;
  level: number | null;
  email: string | null;
};

type RankedEntry = {
  key: string;
  label: string;
  level: number | null;
  value: number;
  meta: string;
};

function getActivityActorKey(activity: Activity) {
  if (activity.user_id) return `user:${activity.user_id}`;
  if (activity.user_email) return `email:${activity.user_email.toLowerCase()}`;
  return null;
}

function isDistanceActivity(activity: Activity) {
  return (
    activity.unit_type === 'distance' ||
    (!activity.unit_type &&
      activity.distance_km !== null &&
      activity.distance_km !== undefined)
  );
}

function getDistanceValue(activity: Activity) {
  if (!isDistanceActivity(activity)) return 0;
  return Number(activity.unit_value ?? activity.distance_km ?? 0);
}

function formatDistance(value: number) {
  return `${value.toFixed(1)} km`;
}

function pluralizeActivities(value: number) {
  return `${value} activité${value > 1 ? 's' : ''}`;
}

export default function LeaderboardPage() {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadLeaderboard = async () => {
      setLoading(true);

      const [profilesResponse, activitiesResponse] = await Promise.all([
        supabase.from('profiles').select('id, email, username, total_xp, level'),
        supabase
          .from('activities')
          .select('user_id, user_email, distance_km, unit_type, unit_value, created_at'),
      ]);

      if (profilesResponse.error) {
        console.error('Erreur chargement profils leaderboard :', profilesResponse.error);
        setProfiles([]);
      } else {
        setProfiles((profilesResponse.data as Profile[]) || []);
      }

      if (activitiesResponse.error) {
        console.error('Erreur chargement activités leaderboard :', activitiesResponse.error);
        setActivities([]);
      } else {
        setActivities((activitiesResponse.data as Activity[]) || []);
      }

      setLoading(false);
    };

    loadLeaderboard();
  }, []);

  const identities = useMemo(() => {
    const byKey = new Map<string, Identity>();

    profiles.forEach((profile) => {
      const label = profile.username || profile.email || 'Utilisateur';
      const identity = {
        key: `user:${profile.id}`,
        label,
        level: profile.level,
        email: profile.email,
      };

      byKey.set(identity.key, identity);

      if (profile.email) {
        byKey.set(`email:${profile.email.toLowerCase()}`, identity);
      }
    });

    return byKey;
  }, [profiles]);

  const topXp = useMemo<RankedEntry[]>(() => {
    return profiles
      .map((profile) => ({
        key: `user:${profile.id}`,
        label: profile.username || profile.email || 'Utilisateur',
        level: profile.level,
        value: Number(profile.total_xp || 0),
        meta: `${Number(profile.total_xp || 0)} XP`,
      }))
      .filter((entry) => entry.value > 0)
      .sort((a, b) => b.value - a.value || a.label.localeCompare(b.label, 'fr'))
      .slice(0, 10);
  }, [profiles]);

  const topDistance = useMemo<RankedEntry[]>(() => {
    const totals = new Map<string, RankedEntry>();

    activities.forEach((activity) => {
      const key = getActivityActorKey(activity);
      if (!key) return;

      const distance = getDistanceValue(activity);
      if (distance <= 0) return;

      const identity = identities.get(key);
      const current = totals.get(key) || {
        key,
        label: identity?.label || activity.user_email || 'Utilisateur',
        level: identity?.level ?? 1,
        value: 0,
        meta: '',
      };

      current.value += distance;
      current.meta = formatDistance(current.value);
      totals.set(key, current);
    });

    return Array.from(totals.values())
      .sort((a, b) => b.value - a.value || a.label.localeCompare(b.label, 'fr'))
      .slice(0, 10);
  }, [activities, identities]);

  const topActivities = useMemo<RankedEntry[]>(() => {
    const totals = new Map<string, RankedEntry>();

    activities.forEach((activity) => {
      const key = getActivityActorKey(activity);
      if (!key) return;

      const identity = identities.get(key);
      const current = totals.get(key) || {
        key,
        label: identity?.label || activity.user_email || 'Utilisateur',
        level: identity?.level ?? 1,
        value: 0,
        meta: '',
      };

      current.value += 1;
      current.meta = pluralizeActivities(current.value);
      totals.set(key, current);
    });

    return Array.from(totals.values())
      .sort((a, b) => b.value - a.value || a.label.localeCompare(b.label, 'fr'))
      .slice(0, 10);
  }, [activities, identities]);

  const topWeek = useMemo<RankedEntry[]>(() => {
    const totals = new Map<string, RankedEntry>();
    const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;

    activities.forEach((activity) => {
      const key = getActivityActorKey(activity);
      if (!key || !activity.created_at) return;

      if (new Date(activity.created_at).getTime() < weekAgo) return;

      const identity = identities.get(key);
      const current = totals.get(key) || {
        key,
        label: identity?.label || activity.user_email || 'Utilisateur',
        level: identity?.level ?? 1,
        value: 0,
        meta: '',
      };

      current.value += 1;
      current.meta = pluralizeActivities(current.value);
      totals.set(key, current);
    });

    return Array.from(totals.values())
      .sort((a, b) => b.value - a.value || a.label.localeCompare(b.label, 'fr'))
      .slice(0, 10);
  }, [activities, identities]);

  const sections = [
    {
      title: 'Top XP',
      kicker: 'Progression',
      description: 'Les utilisateurs les plus avancés en XP.',
      entries: topXp,
    },
    {
      title: 'Top distance',
      kicker: 'Endurance',
      description: 'Distance cumulée sur les activités de type distance.',
      entries: topDistance,
    },
    {
      title: 'Top activités',
      kicker: 'Volume',
      description: "Les membres les plus actifs sur l'ensemble de leurs activités.",
      entries: topActivities,
    },
    {
      title: 'Top semaine',
      kicker: '7 jours',
      description: 'Le nombre d’activités ajoutées sur les 7 derniers jours.',
      entries: topWeek,
    },
  ];

  return (
    <AppShell>
      <div className="leaderboard-page">
        <section className="card leaderboard-hero-card">
          <div>
            <span className="section-kicker">Classements</span>
            <h1>Classements globaux</h1>
            <p className="muted">
              Retrouve les meilleurs profils Actyv par XP, distance et régularité.
            </p>
          </div>
        </section>

        {loading ? (
          <div className="challenge-state">
            <p>Chargement des classements...</p>
          </div>
        ) : (
          <div className="leaderboard-grid">
            {sections.map((section) => (
              <section key={section.title} className="card leaderboard-card">
                <div className="leaderboard-card__header">
                  <div>
                    <span className="section-kicker">{section.kicker}</span>
                    <h2>{section.title}</h2>
                    <p className="muted">{section.description}</p>
                  </div>
                  <span className="badge">Top 10</span>
                </div>

                {section.entries.length === 0 ? (
                  <div className="challenge-state challenge-state--compact">
                    <p>Pas encore assez de données pour ce classement.</p>
                  </div>
                ) : (
                  <div className="leaderboard-list">
                    {section.entries.map((entry, index) => (
                      <article key={`${section.title}-${entry.key}`} className="leaderboard-item">
                        <div className="leaderboard-rank">#{index + 1}</div>

                        <div className="leaderboard-main">
                          <div className="leaderboard-name-row">
                            <strong className="leaderboard-name">{entry.label}</strong>
                            <UserLevelBadge level={entry.level} />
                          </div>

                          <div className="leaderboard-meta">
                            <span>{entry.meta}</span>
                          </div>
                        </div>
                      </article>
                    ))}
                  </div>
                )}
              </section>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
