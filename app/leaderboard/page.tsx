'use client';

import { useEffect, useMemo, useState } from 'react';
import { AppShell } from '@/components/AppShell';
import { UserLevelBadge } from '@/components/user-level-badge';
import { supabase } from '@/lib/supabase';

type Profile = {
  id: string;
  username: string | null;
  total_xp: number | null;
  level: number | null;
};

type Activity = {
  challenge_id: string;
  user_id: string | null;
  user_email: string | null;
  distance_km: number | null;
  unit_type: 'distance' | 'duration' | 'reps' | null;
  unit_value: number | null;
  created_at: string | null;
};

type Challenge = {
  id: string;
  visibility: string | null;
  created_by: string | null;
};

type ChallengeMember = {
  challenge_id: string;
  user_email: string | null;
};

type ChallengeParticipant = {
  challenge_id: string;
  user_id: string | null;
};

type Identity = {
  key: string;
  label: string;
  level: number | null;
};

type RankedEntry = {
  key: string;
  label: string;
  level: number | null;
  value: number;
  meta: string;
};

const COMMUNITY_VISIBILITIES = ['public', 'community'];

function getActivityActorKey(activity: Activity) {
  if (activity.user_id) return `user:${activity.user_id}`;
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
  return `${value} activite${value > 1 ? 's' : ''}`;
}

export default function LeaderboardPage() {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadLeaderboard = async () => {
      setLoading(true);

      const {
        data: { user },
      } = await supabase.auth.getUser();

      const userEmail = user?.email?.toLowerCase() || null;
      const userId = user?.id || null;
      let joinedChallengeIds: string[] = [];

      if (userEmail) {
        const [membersResponse, participantsResponse] = await Promise.all([
          supabase
            .from('challenge_members')
            .select('challenge_id')
            .eq('user_email', userEmail),
          userId
            ? supabase
                .from('challenge_participants')
                .select('challenge_id')
                .eq('user_id', userId)
            : Promise.resolve({ data: [], error: null }),
        ]);

        if (membersResponse.error) {
          console.error('Erreur chargement challenge_members leaderboard :', membersResponse.error);
        }

        if (participantsResponse.error) {
          console.error(
            'Erreur chargement challenge_participants leaderboard :',
            participantsResponse.error
          );
        }

        joinedChallengeIds = [
          ...(((membersResponse.data as { challenge_id: string }[] | null) || []).map(
            (row) => row.challenge_id
          )),
          ...(((participantsResponse.data as { challenge_id: string }[] | null) || []).map(
            (row) => row.challenge_id
          )),
        ];
      }

      joinedChallengeIds = Array.from(new Set(joinedChallengeIds));

      let challengesQuery = supabase
        .from('challenges')
        .select('id, visibility, created_by')
        .eq('is_deleted', false);

      if (userEmail) {
        const visibilityFilters = COMMUNITY_VISIBILITIES.map(
          (visibility) => `visibility.eq.${visibility}`
        );

        if (userId) {
          visibilityFilters.push(`created_by.eq.${userId}`);
        }

        if (joinedChallengeIds.length > 0) {
          visibilityFilters.push(`id.in.(${joinedChallengeIds.join(',')})`);
        }

        challengesQuery = challengesQuery.or(visibilityFilters.join(','));
      } else {
        challengesQuery = challengesQuery.in('visibility', COMMUNITY_VISIBILITIES);
      }

      const { data: challengesData, error: challengesError } = await challengesQuery;

      if (challengesError) {
        console.error('Erreur chargement challenges leaderboard :', challengesError);
        setProfiles([]);
        setActivities([]);
        setLoading(false);
        return;
      }

      const visibleChallenges = (challengesData as Challenge[]) || [];
      const visibleChallengeIds = visibleChallenges.map((challenge) => challenge.id);

      if (visibleChallengeIds.length === 0) {
        setProfiles([]);
        setActivities([]);
        setLoading(false);
        return;
      }

      const [membersResponse, participantsResponse, activitiesResponse] = await Promise.all([
        supabase
          .from('challenge_members')
          .select('challenge_id, user_email')
          .in('challenge_id', visibleChallengeIds),
        supabase
          .from('challenge_participants')
          .select('challenge_id, user_id')
          .in('challenge_id', visibleChallengeIds),
        supabase
          .from('activities')
          .select('challenge_id, user_id, user_email, distance_km, unit_type, unit_value, created_at')
          .in('challenge_id', visibleChallengeIds),
      ]);

      if (membersResponse.error) {
        console.error('Erreur chargement membres leaderboard :', membersResponse.error);
      }

      if (participantsResponse.error) {
        console.error('Erreur chargement participants leaderboard :', participantsResponse.error);
      }

      if (activitiesResponse.error) {
        console.error('Erreur chargement activites leaderboard :', activitiesResponse.error);
        setActivities([]);
      } else {
        setActivities((activitiesResponse.data as Activity[]) || []);
      }

      const allowedUserIds = new Set<string>();
      visibleChallenges.forEach((challenge) => {
        if (challenge.created_by) {
          allowedUserIds.add(challenge.created_by);
        }
      });

      ((participantsResponse.data as ChallengeParticipant[] | null) || []).forEach((participant) => {
        if (participant.user_id) {
          allowedUserIds.add(participant.user_id);
        }
      });

      (((activitiesResponse.data as Activity[]) || [])).forEach((activity) => {
        if (activity.user_id) {
          allowedUserIds.add(activity.user_id);
        }
      });

      let loadedProfiles: Profile[] = [];

      if (allowedUserIds.size > 0) {
        const { data, error } = await supabase
          .from('public_profiles')
          .select('id, username, total_xp, level')
          .in('id', Array.from(allowedUserIds));

        if (error) {
          console.error('Erreur chargement profils leaderboard par id :', error);
        } else {
          loadedProfiles = [...loadedProfiles, ...((data as Profile[]) || [])];
        }
      }

      const uniqueProfiles = new Map<string, Profile>();
      loadedProfiles.forEach((profile) => {
        uniqueProfiles.set(profile.id, profile);
      });

      setProfiles(Array.from(uniqueProfiles.values()));
      setLoading(false);
    };

    loadLeaderboard();
  }, []);

  const identities = useMemo(() => {
    const byKey = new Map<string, Identity>();

    profiles.forEach((profile) => {
      const label = profile.username || 'Utilisateur';
      const identity = {
        key: `user:${profile.id}`,
        label,
        level: profile.level,
      };

      byKey.set(identity.key, identity);
    });

    return byKey;
  }, [profiles]);

  const topXp = useMemo<RankedEntry[]>(() => {
    return profiles
      .map((profile) => ({
        key: `user:${profile.id}`,
        label: profile.username || 'Utilisateur',
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
        label: identity?.label || 'Utilisateur',
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
        label: identity?.label || 'Utilisateur',
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
        label: identity?.label || 'Utilisateur',
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
      description: 'Les utilisateurs visibles les plus avances en XP.',
      entries: topXp,
    },
    {
      title: 'Top distance',
      kicker: 'Endurance',
      description: 'Distance cumulee sur les activites visibles de type distance.',
      entries: topDistance,
    },
    {
      title: 'Top activites',
      kicker: 'Volume',
      description: "Les membres visibles les plus actifs sur l'ensemble de leurs activites.",
      entries: topActivities,
    },
    {
      title: 'Top semaine',
      kicker: '7 jours',
      description: 'Le nombre d activites visibles ajoutees sur les 7 derniers jours.',
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
              Retrouve les meilleurs profils Actyv visibles selon tes challenges partages et les
              challenges publics.
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
                    <p>Pas encore assez de donnees visibles pour ce classement.</p>
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
