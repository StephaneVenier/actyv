'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { AppShell } from '@/components/AppShell';
import { formatSportLabel } from '@/components/challenge-data';
import { supabase } from '@/lib/supabase';

type GoalType = 'distance' | 'duration' | 'reps';
type StatusFilter = 'all' | 'active' | 'completed';

type Challenge = {
  id: string;
  name: string;
  sport: string | null;
  description: string | null;
  created_at: string | null;
  goal_km: number | null;
  goal_type: GoalType | null;
  goal_value: number | null;
  visibility: string | null;
  created_by: string | null;
};

type Activity = {
  challenge_id: string;
  distance_km: number | null;
  duration_minutes: number | null;
  unit_type: GoalType | null;
  unit_value: number | null;
};

type ChallengeMember = {
  challenge_id: string;
  user_email?: string | null;
};

type ChallengeParticipant = {
  challenge_id: string;
  user_id?: string | null;
};

function formatDistance(value: number) {
  return `${value.toFixed(1)} km`;
}

function formatDuration(value: number) {
  return `${value} min`;
}

function formatReps(value: number) {
  return `${value} répétition${value > 1 ? 's' : ''}`;
}

function getGoalLabel(goalType: GoalType) {
  if (goalType === 'distance') return 'Distance';
  if (goalType === 'duration') return 'Durée';
  return 'Répétitions';
}

function getGoalType(challenge: Challenge): GoalType | null {
  return challenge.goal_type || (challenge.goal_km ? 'distance' : null);
}

function getGoalValue(challenge: Challenge) {
  return challenge.goal_value ?? challenge.goal_km ?? null;
}

function formatGoal(value: number | null, goalType: GoalType | null) {
  if (value === null || value === undefined) return 'Objectif non défini';
  if (goalType === 'distance') return formatDistance(value);
  if (goalType === 'duration') return formatDuration(value);
  if (goalType === 'reps') return formatReps(value);
  return `${value}`;
}

function getActivityValue(activity: Activity, goalType: GoalType | null) {
  const activityGoalType =
    activity.unit_type ||
    (activity.distance_km !== null && activity.distance_km !== undefined
      ? 'distance'
      : activity.duration_minutes !== null && activity.duration_minutes !== undefined
        ? 'duration'
        : null);

  if (!goalType || activityGoalType !== goalType) return 0;

  return (
    activity.unit_value ??
    (activityGoalType === 'distance'
      ? activity.distance_km
      : activityGoalType === 'duration'
        ? activity.duration_minutes
        : null) ??
    0
  );
}

export default function ChallengesPage() {
  const [challenges, setChallenges] = useState<Challenge[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [participantsCountMap, setParticipantsCountMap] = useState<Record<string, number>>({});
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [sportFilter, setSportFilter] = useState('all');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchChallenges = async () => {
      setLoading(true);

      const {
        data: { user },
      } = await supabase.auth.getUser();

      const userEmail = user?.email || null;
      const userId = user?.id || null;
      let visibleChallengeIds: string[] = [];

      if (userEmail) {
        const { data: memberRows, error: membersError } = await supabase
          .from('challenge_members')
          .select('challenge_id')
          .eq('user_email', userEmail);

        if (membersError) {
          console.error('Erreur chargement challenge_members :', membersError);
        } else {
          visibleChallengeIds = ((memberRows as ChallengeMember[] | null) || []).map(
            (row) => row.challenge_id
          );
        }
      }

      if (userId) {
        const { data: participantRows, error: participantsError } = await supabase
          .from('challenge_participants')
          .select('challenge_id')
          .eq('user_id', userId);

        if (participantsError) {
          console.error('Erreur chargement challenge_participants :', participantsError);
        } else {
          visibleChallengeIds = [
            ...visibleChallengeIds,
            ...(((participantRows as ChallengeParticipant[] | null) || []).map(
              (row) => row.challenge_id
            )),
          ];
        }
      }

      visibleChallengeIds = Array.from(new Set(visibleChallengeIds));

      let challengesQuery = supabase
        .from('challenges')
        .select(
          'id, name, sport, description, created_at, goal_km, goal_type, goal_value, visibility, created_by'
        )
        .eq('is_deleted', false)
        .order('created_at', { ascending: false });

      if (userEmail) {
        const visibilityFilters = ['visibility.eq.public'];

        if (userId) {
          visibilityFilters.push(`created_by.eq.${userId}`);
        }

        if (visibleChallengeIds.length > 0) {
          visibilityFilters.push(`id.in.(${visibleChallengeIds.join(',')})`);
        }

        challengesQuery = challengesQuery.or(visibilityFilters.join(','));
      } else {
        challengesQuery = challengesQuery.eq('visibility', 'public');
      }

      const { data: challengesData, error: challengesError } = await challengesQuery;

      if (challengesError) {
        console.error('Erreur chargement challenges :', challengesError);
        setChallenges([]);
        setActivities([]);
        setLoading(false);
        return;
      }

      const loadedChallenges = (challengesData as Challenge[]) || [];
      setChallenges(loadedChallenges);

      const challengeIds = loadedChallenges.map((challenge) => challenge.id);

      if (challengeIds.length === 0) {
        setActivities([]);
        setParticipantsCountMap({});
        setLoading(false);
        return;
      }

      const [activitiesResponse, membersCountResponse, participantsCountResponse] =
        await Promise.all([
          supabase
            .from('activities')
            .select('challenge_id, distance_km, duration_minutes, unit_type, unit_value')
            .in('challenge_id', challengeIds),
          supabase
            .from('challenge_members')
            .select('challenge_id, user_email')
            .in('challenge_id', challengeIds),
          supabase
            .from('challenge_participants')
            .select('challenge_id, user_id')
            .in('challenge_id', challengeIds),
        ]);

      const { data: activitiesData, error: activitiesError } = activitiesResponse;

      if (activitiesError) {
        console.error('Erreur chargement activites challenges :', activitiesError);
        setActivities([]);
      } else {
        setActivities((activitiesData as Activity[]) || []);
      }

      if (membersCountResponse.error) {
        console.error('Erreur compteur challenge_members :', membersCountResponse.error);
      }

      if (participantsCountResponse.error) {
        console.error('Erreur compteur challenge_participants :', participantsCountResponse.error);
      }

      const nextParticipantsCountMap: Record<string, number> = {};

      loadedChallenges.forEach((challenge) => {
        const keys = new Set<string>();

        if (challenge.created_by) {
          keys.add(`user:${challenge.created_by}`);
        }

        ((membersCountResponse.data as ChallengeMember[] | null) || []).forEach((member) => {
          if (member.challenge_id === challenge.id && member.user_email) {
            keys.add(`email:${member.user_email.toLowerCase()}`);
          }
        });

        ((participantsCountResponse.data as ChallengeParticipant[] | null) || []).forEach(
          (participant) => {
            if (participant.challenge_id === challenge.id && participant.user_id) {
              keys.add(`user:${participant.user_id}`);
            }
          }
        );

        nextParticipantsCountMap[challenge.id] = Math.max(keys.size, 1);
      });

      setParticipantsCountMap(nextParticipantsCountMap);

      setLoading(false);
    };

    fetchChallenges();
  }, []);

  const challengeSummaries = useMemo(() => {
    return challenges.map((challenge) => {
      const goalType = getGoalType(challenge);
      const goalValue = getGoalValue(challenge);
      const challengeActivities = activities.filter(
        (activity) => activity.challenge_id === challenge.id
      );
      const progress = challengeActivities.reduce(
        (sum, activity) => sum + getActivityValue(activity, goalType),
        0
      );
      const progressPercent =
        goalValue && goalValue > 0 ? Math.min((progress / goalValue) * 100, 100) : 0;
      const completed = Boolean(goalValue && goalValue > 0) && progress >= (goalValue || 0);

      return {
        challenge,
        goalType,
        goalValue,
        progress,
        progressPercent,
        completed,
        participantsCount: participantsCountMap[challenge.id] || 1,
      };
    });
  }, [activities, challenges, participantsCountMap]);

  const sportOptions = useMemo(() => {
    return Array.from(
      new Set(
        challenges
          .map((challenge) => challenge.sport)
          .filter((sport): sport is string => Boolean(sport))
      )
    ).sort((a, b) => a.localeCompare(b, 'fr'));
  }, [challenges]);

  const filteredChallengeSummaries = challengeSummaries.filter((summary) => {
    if (statusFilter === 'active' && summary.completed) return false;
    if (statusFilter === 'completed' && !summary.completed) return false;
    if (sportFilter !== 'all' && summary.challenge.sport !== sportFilter) return false;
    return true;
  });

  const activeChallenges = filteredChallengeSummaries.filter((summary) => !summary.completed);
  const completedChallenges = filteredChallengeSummaries.filter((summary) => summary.completed);

  return (
    <AppShell>
      <div className="challenges-page">
        <section className="home-challenges challenges-filter-panel">
          <div className="challenge-filter-group">
            {[
              { value: 'all', label: 'Tous' },
              { value: 'active', label: 'En cours' },
              { value: 'completed', label: 'Terminés' },
            ].map((filter) => (
              <button
                key={filter.value}
                type="button"
                className={`challenge-filter-button ${
                  statusFilter === filter.value ? 'active' : ''
                }`}
                onClick={() => setStatusFilter(filter.value as StatusFilter)}
              >
                {filter.label}
              </button>
            ))}
          </div>

          {sportOptions.length > 0 && (
            <div className="challenge-filter-group">
              <button
                type="button"
                className={`challenge-filter-button ${sportFilter === 'all' ? 'active' : ''}`}
                onClick={() => setSportFilter('all')}
              >
                Tous les sports
              </button>

              {sportOptions.map((sport) => (
                <button
                  key={sport}
                  type="button"
                  className={`challenge-filter-button ${sportFilter === sport ? 'active' : ''}`}
                  onClick={() => setSportFilter(sport)}
                >
                  {formatSportLabel(sport)}
                </button>
              ))}
            </div>
          )}
        </section>

        <section className="home-challenges challenges-page-section">
          <div className="home-challenges__header">
            <div>
              <span className="section-kicker">Tous les challenges</span>
              <h2>Challenges en cours</h2>
            </div>

            <Link href="/challenges/new" className="home-challenges__link">
              Créer un challenge
            </Link>
          </div>

          {loading ? (
            <div className="challenge-state">
              <p>Chargement des challenges...</p>
            </div>
          ) : activeChallenges.length === 0 ? (
            <div className="challenge-state">
              <p>Aucun challenge en cours pour le moment.</p>
            </div>
          ) : (
            <div className="challenges-grid">
              {activeChallenges.map(({ challenge, goalType, goalValue, progress, progressPercent, participantsCount }) => (
                <article key={challenge.id} className="card challenge-overview-card">
                  <div className="challenge-overview-top">
                    <span className="badge sport-badge">{formatSportLabel(challenge.sport)}</span>
                    <span className="badge">En cours</span>
                    {goalType && <span className="badge">{getGoalLabel(goalType)}</span>}
                    <span className="badge">
                      {participantsCount} participant{participantsCount > 1 ? 's' : ''}
                    </span>
                  </div>

                  <h3>{challenge.name}</h3>
                  <p>
                    {challenge.description?.trim()
                      ? challenge.description
                      : 'Rejoins ce challenge et fais progresser ton équipe.'}
                  </p>

                  <div className="challenge-overview-meta">
                    <span>Objectif</span>
                    <strong>{formatGoal(goalValue, goalType)}</strong>
                  </div>

                  <div className="progress-meta">
                    <span className="progress-target">
                      {formatGoal(progress, goalType)}
                    </span>
                    <span className="progress-percent">{progressPercent.toFixed(1)}%</span>
                  </div>
                  <div className="progress-track">
                    <div className="progress-fill" style={{ width: `${progressPercent}%` }} />
                  </div>

                  <Link href={`/challenges/${challenge.id}`} className="button ghost">
                    Voir le détail
                  </Link>
                </article>
              ))}
            </div>
          )}
        </section>

        <section className="home-challenges challenges-page-section">
          <div className="home-challenges__header">
            <div>
              <span className="section-kicker">Historique</span>
              <h2>Challenges terminés</h2>
            </div>
          </div>

          {loading ? (
            <div className="challenge-state">
              <p>Chargement des challenges...</p>
            </div>
          ) : completedChallenges.length === 0 ? (
            <div className="challenge-state">
              <p>Aucun challenge terminé pour le moment.</p>
            </div>
          ) : (
            <div className="completed-challenge-list">
              {completedChallenges.map(({ challenge, goalType, goalValue, progress, participantsCount }) => (
                <Link
                  key={challenge.id}
                  href={`/challenges/${challenge.id}`}
                  className="completed-challenge-item"
                >
                  <div className="completed-challenge-main">
                    <div className="completed-challenge-tags">
                      <span className="badge badge-completed">Terminé</span>
                      <span className="challenge-item__pill sport-badge">{formatSportLabel(challenge.sport)}</span>
                      {goalType && <span className="challenge-item__pill">{getGoalLabel(goalType)}</span>}
                      <span className="challenge-item__pill">
                        {participantsCount} participant{participantsCount > 1 ? 's' : ''}
                      </span>
                    </div>
                    <strong>{challenge.name}</strong>
                    <span>Objectif atteint : {formatGoal(goalValue, goalType)}</span>
                  </div>

                  <div className="completed-challenge-side">
                    <span>{formatGoal(progress, goalType)}</span>
                    <strong>Voir le détail</strong>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>
      </div>
    </AppShell>
  );
}
