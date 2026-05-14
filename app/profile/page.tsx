'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { AppShell } from '@/components/AppShell';
import { formatSportBadgeLabel, getSportBadgeClassName } from '@/components/sport-badge';
import { BADGES, getLevelProgress, normalizeBadgeCode } from '@/lib/gamification';
import { supabase } from '@/lib/supabase';

type GoalType = 'distance' | 'duration' | 'reps';

type Profile = {
  id: string;
  email: string | null;
  username: string | null;
  total_xp: number | null;
  level: number | null;
};

type Activity = {
  id: string;
  challenge_id: string;
  user_email: string | null;
  distance_km: number | null;
  duration_minutes: number | null;
  unit_type: GoalType | null;
  unit_value: number | null;
  created_at: string | null;
};

type Challenge = {
  id: string;
  name: string;
  sport: string | null;
  description: string | null;
  goal_km: number | null;
  goal_type: GoalType | null;
  goal_value: number | null;
  created_by: string | null;
};

type ChallengeMember = {
  challenge_id: string;
};

type ActivityInteraction = {
  activity_id: string;
  type: 'like' | 'boost';
};

type UserBadge = {
  badge_code: string;
  unlocked_at?: string | null;
  earned_at?: string | null;
  created_at?: string | null;
};

type UserChallengeSummary = {
  challenge: Challenge;
  goalType: GoalType | null;
  goalValue: number | null;
  progress: number;
  progressPercent: number;
  completed: boolean;
  myActivities: number;
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

export default function ProfilePage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [challenges, setChallenges] = useState<Challenge[]>([]);
  const [joinedChallengeIds, setJoinedChallengeIds] = useState<string[]>([]);
  const [interactions, setInteractions] = useState<ActivityInteraction[]>([]);
  const [badges, setBadges] = useState<UserBadge[]>([]);
  const [loading, setLoading] = useState(true);
  const [editMode, setEditMode] = useState(false);
  const [usernameInput, setUsernameInput] = useState('');
  const [savingUsername, setSavingUsername] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    const loadProfilePage = async () => {
      setLoading(true);
      setMessage('');

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setLoading(false);
        return;
      }

      console.log('PROFILE USER:', user.id);

      const { data: profileData } = await supabase
        .from('profiles')
        .select('id, email, username, total_xp, level')
        .eq('id', user.id)
        .single();

      const nextProfile = profileData || {
        id: user.id,
        email: user.email || null,
        username: null,
        total_xp: 0,
        level: 1,
      };

      setProfile(nextProfile);
      setUsernameInput(nextProfile.username || '');

      const [
        activitiesResponse,
        membersResponse,
        participantsResponse,
        badgesResponse,
      ] = await Promise.all([
        supabase
          .from('activities')
          .select('id, challenge_id, user_email, distance_km, duration_minutes, unit_type, unit_value, created_at')
          .eq('user_email', user.email)
          .order('created_at', { ascending: false }),
        user.email
          ? supabase
              .from('challenge_members')
              .select('challenge_id')
              .eq('user_email', user.email)
          : Promise.resolve({ data: [], error: null }),
        supabase
          .from('challenge_participants')
          .select('challenge_id')
          .eq('user_id', user.id),
        supabase
          .from('user_badges')
          .select('badge_code')
          .eq('user_id', user.id),
      ]);

      const loadedActivities = (activitiesResponse.data as Activity[] | null) || [];

      if (activitiesResponse.error) {
        console.error('Erreur chargement activités profil :', activitiesResponse.error);
        setActivities([]);
      } else {
        setActivities(loadedActivities);
      }

      if (membersResponse.error) {
        console.error('Erreur chargement challenge_members profil :', membersResponse.error);
      }

      if (participantsResponse.error) {
        console.error('Erreur chargement challenge_participants profil :', participantsResponse.error);
      }

      if (badgesResponse.error) {
        console.error('USER BADGES ERROR:', badgesResponse.error);
        setBadges([]);
      } else {
        console.log('USER BADGES:', badgesResponse.data || []);
        setBadges((badgesResponse.data as UserBadge[] | null) || []);
      }

      const memberIds = ((membersResponse.data as ChallengeMember[] | null) || []).map(
        (row) => row.challenge_id
      );
      const participantIds = ((participantsResponse.data as ChallengeMember[] | null) || []).map(
        (row) => row.challenge_id
      );
      const activityChallengeIds = loadedActivities.map((activity) => activity.challenge_id);
      const allJoinedChallengeIds = Array.from(
        new Set([...memberIds, ...participantIds, ...activityChallengeIds])
      );

      setJoinedChallengeIds(allJoinedChallengeIds);

      const visibilityFilters = [`created_by.eq.${user.id}`];

      if (allJoinedChallengeIds.length > 0) {
        visibilityFilters.push(`id.in.(${allJoinedChallengeIds.join(',')})`);
      }

      const { data: challengesData, error: challengesError } = await supabase
        .from('challenges')
        .select('id, name, sport, description, goal_km, goal_type, goal_value, created_by')
        .eq('is_deleted', false)
        .or(visibilityFilters.join(','))
        .order('created_at', { ascending: false });

      if (challengesError) {
        console.error('Erreur chargement challenges profil :', challengesError);
        setChallenges([]);
      } else {
        setChallenges((challengesData as Challenge[]) || []);
      }

      const activityIds = loadedActivities.map((activity) => activity.id);

      if (activityIds.length > 0) {
        const { data: interactionsData, error: interactionsError } = await supabase
          .from('activity_interactions')
          .select('activity_id, type')
          .in('activity_id', activityIds);

        if (interactionsError) {
          console.error('Erreur chargement interactions profil :', interactionsError);
          setInteractions([]);
        } else {
          setInteractions((interactionsData as ActivityInteraction[]) || []);
        }
      } else {
        setInteractions([]);
      }

      setLoading(false);
    };

    loadProfilePage();
  }, []);

  const stats = useMemo(() => {
    const totalActivities = activities.length;
    const totalDistance = activities.reduce((sum, item) => {
      if (item.unit_type && item.unit_type !== 'distance') return sum;
      return sum + (item.unit_value ?? item.distance_km ?? 0);
    }, 0);
    const totalDuration = activities.reduce((sum, item) => {
      if (item.unit_type && item.unit_type !== 'duration') return sum;
      return sum + (item.unit_value ?? item.duration_minutes ?? 0);
    }, 0);
    const totalReps = activities.reduce((sum, item) => {
      if (item.unit_type !== 'reps') return sum;
      return sum + (item.unit_value || 0);
    }, 0);
    const totalLikes = interactions.filter((interaction) => interaction.type === 'like').length;
    const totalBoosts = interactions.filter((interaction) => interaction.type === 'boost').length;
    const createdChallengeIds = challenges
      .filter((challenge) => challenge.created_by === profile?.id)
      .map((challenge) => challenge.id);
    const joinedOnlyChallengeIds = joinedChallengeIds.filter(
      (challengeId) => !createdChallengeIds.includes(challengeId)
    );

    return {
      createdChallenges: createdChallengeIds.length,
      joinedChallenges: new Set(joinedOnlyChallengeIds).size,
      totalActivities,
      totalDistance,
      totalDuration,
      totalReps,
      totalLikes,
      totalBoosts,
    };
  }, [activities, challenges, interactions, joinedChallengeIds, profile?.id]);

  const groupedChallenges = useMemo<UserChallengeSummary[]>(() => {
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
        myActivities: challengeActivities.length,
      };
    });
  }, [activities, challenges]);

  const activeChallenges = groupedChallenges.filter((challenge) => !challenge.completed);
  const completedChallenges = groupedChallenges.filter((challenge) => challenge.completed);
  const totalXp = profile?.total_xp || 0;
  const levelProgress = getLevelProgress(totalXp);
  const unlockedBadgeCodes = new Set(
    badges
      .map((badge) => normalizeBadgeCode(badge.badge_code))
      .filter((badgeCode): badgeCode is NonNullable<typeof badgeCode> => Boolean(badgeCode))
  );
  const unlockedBadges = BADGES.filter((badge) => unlockedBadgeCodes.has(badge.code));

  const handleSaveUsername = async () => {
    if (!profile) return;

    setSavingUsername(true);
    setMessage('');

    const trimmed = usernameInput.trim();

    if (!trimmed) {
      setMessage('Le pseudo ne peut pas être vide.');
      setSavingUsername(false);
      return;
    }

    const { error } = await supabase.from('profiles').upsert({
      id: profile.id,
      email: profile.email,
      username: trimmed,
      total_xp: profile.total_xp || 0,
      level: profile.level || 1,
    });

    if (error) {
      console.error('Erreur mise à jour pseudo :', error);
      setMessage("Impossible d'enregistrer le pseudo.");
      setSavingUsername(false);
      return;
    }

    setProfile((prev) => (prev ? { ...prev, username: trimmed } : prev));
    setEditMode(false);
    setMessage('Pseudo mis à jour.');
    setSavingUsername(false);
  };

  if (loading) {
    return (
      <AppShell>
        <div className="card">
          <h1>Mon profil</h1>
          <p>Chargement...</p>
        </div>
      </AppShell>
    );
  }

  if (!profile) {
    return (
      <AppShell>
        <div className="card">
          <h1>Mon profil</h1>
          <p>Vous devez être connecté pour voir cette page.</p>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="profile-page">
        <section className="card profile-hero-card">
          <div className="profile-hero-main">
            <div>
              <span className="section-kicker">Profil Actyv</span>
              <h1>Mon profil</h1>
              <p className="muted">Ton identité, tes challenges et tes contributions.</p>
            </div>

            <div className="profile-identity">
              <div>
                <span>Pseudo</span>
                {editMode ? (
                  <input
                    value={usernameInput}
                    onChange={(event) => setUsernameInput(event.target.value)}
                    placeholder="Choisir un pseudo"
                  />
                ) : (
                  <strong>{profile.username || 'Aucun pseudo défini'}</strong>
                )}
              </div>

              <div>
                <span>Email</span>
                <strong>{profile.email}</strong>
              </div>

              <div className="profile-actions">
                {!editMode ? (
                  <button type="button" className="button ghost" onClick={() => setEditMode(true)}>
                    Modifier mon pseudo
                  </button>
                ) : (
                  <>
                    <button
                      type="button"
                      className="button primary"
                      onClick={handleSaveUsername}
                      disabled={savingUsername}
                    >
                      {savingUsername ? 'Enregistrement...' : 'Enregistrer'}
                    </button>
                    <button
                      type="button"
                      className="button ghost"
                      onClick={() => {
                        setEditMode(false);
                        setUsernameInput(profile.username || '');
                      }}
                    >
                      Annuler
                    </button>
                  </>
                )}
              </div>

              {message && <p className="muted">{message}</p>}
            </div>
          </div>
        </section>

        <section className="card gamification-card">
          <div className="gamification-main">
            <div>
              <span className="section-kicker">Progression</span>
              <h2>Niveau {levelProgress.level}</h2>
              <p className="muted">{totalXp} XP au total</p>
            </div>

            <div className="gamification-progress">
              <div className="progress-meta">
                <span>{levelProgress.xpToNextLevel} XP avant le niveau suivant</span>
                <span>{levelProgress.progressPercent.toFixed(0)}%</span>
              </div>
              <div className="progress-track">
                <div
                  className="progress-fill"
                  style={{ width: `${levelProgress.progressPercent}%` }}
                />
              </div>
            </div>
          </div>

          <div className="badge-list">
            {unlockedBadges.length === 0 ? (
              <span className="badge-list-empty">Aucun badge débloqué pour le moment.</span>
            ) : (
              unlockedBadges.map((badge) => (
                <span key={badge.code} className="achievement-badge" title={badge.description}>
                  {badge.label}
                </span>
              ))
            )}
          </div>
        </section>

        <section className="profile-stats-grid">
          <article className="card stat-card">
            <span className="stat-card-label">Challenges créés</span>
            <strong className="stat-card-value">{stats.createdChallenges}</strong>
          </article>
          <article className="card stat-card">
            <span className="stat-card-label">Challenges rejoints</span>
            <strong className="stat-card-value">{stats.joinedChallenges}</strong>
          </article>
          <article className="card stat-card">
            <span className="stat-card-label">Activités</span>
            <strong className="stat-card-value">{stats.totalActivities}</strong>
          </article>
          <article className="card stat-card">
            <span className="stat-card-label">Distance</span>
            <strong className="stat-card-value">{formatDistance(stats.totalDistance)}</strong>
          </article>
          <article className="card stat-card">
            <span className="stat-card-label">Durée</span>
            <strong className="stat-card-value">{formatDuration(stats.totalDuration)}</strong>
          </article>
          <article className="card stat-card">
            <span className="stat-card-label">Répétitions</span>
            <strong className="stat-card-value">{stats.totalReps}</strong>
          </article>
          <article className="card stat-card">
            <span className="stat-card-label">Likes reçus</span>
            <strong className="stat-card-value">{stats.totalLikes}</strong>
          </article>
          <article className="card stat-card">
            <span className="stat-card-label">Boosts reçus</span>
            <strong className="stat-card-value">{stats.totalBoosts}</strong>
          </article>
        </section>

        <section className="home-challenges profile-section">
          <div className="home-challenges__header">
            <div>
              <span className="section-kicker">En cours</span>
              <h2>Challenges en cours</h2>
            </div>
          </div>

          {activeChallenges.length === 0 ? (
            <div className="challenge-state">
              <p>Aucun challenge en cours pour le moment.</p>
            </div>
          ) : (
            <div className="challenges-grid">
              {activeChallenges.map(({ challenge, goalType, goalValue, progress, progressPercent, myActivities }) => (
                <article key={challenge.id} className="card challenge-overview-card">
                  <div className="challenge-overview-top">
                    <span className={getSportBadgeClassName(challenge.sport, 'badge', 'Sport')}>
                      {formatSportBadgeLabel(challenge.sport, 'Sport')}
                    </span>
                  </div>

                  <h3>{challenge.name}</h3>
                  <p>
                    {challenge.description?.trim()
                      ? challenge.description
                      : 'Continue à contribuer à ce challenge.'}
                  </p>

                  <div className="challenge-overview-meta">
                    <span>Progression</span>
                    <strong>
                      {formatGoal(progress, goalType)} / {formatGoal(goalValue, goalType)}
                    </strong>
                  </div>

                  <div className="progress-meta">
                    <span className="progress-target">{myActivities} activité{myActivities > 1 ? 's' : ''}</span>
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

        <section className="home-challenges profile-section">
          <div className="home-challenges__header">
            <div>
              <span className="section-kicker">Historique</span>
              <h2>Challenges terminés</h2>
            </div>
          </div>

          {completedChallenges.length === 0 ? (
            <div className="challenge-state">
              <p>Aucun challenge terminé pour le moment.</p>
            </div>
          ) : (
            <div className="completed-challenge-list">
              {completedChallenges.map(({ challenge, goalType, goalValue, progress }) => (
                <Link
                  key={challenge.id}
                  href={`/challenges/${challenge.id}`}
                  className="completed-challenge-item"
                >
                  <div className="completed-challenge-main">
                    <div className="completed-challenge-tags">
                      <span className="badge badge-completed">Terminé</span>
                      <span className={getSportBadgeClassName(challenge.sport, 'challenge-item__pill', 'Sport')}>
                        {formatSportBadgeLabel(challenge.sport, 'Sport')}
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
