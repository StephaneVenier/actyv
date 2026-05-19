'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { AppShell } from '@/components/AppShell';
import { formatSportBadgeLabel, getSportBadgeClassName } from '@/components/sport-badge';
import { UserLevelBadge } from '@/components/user-level-badge';
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
  sport: string | null;
  distance_km: number | null;
  duration_minutes: number | null;
  unit_type: GoalType | null;
  unit_value: number | null;
  comment: string | null;
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
  created_at: string | null;
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
  return `${value} repetition${value > 1 ? 's' : ''}`;
}

function formatRelativeDate(dateString: string | null) {
  if (!dateString) return 'Date inconnue';

  const now = Date.now();
  const target = new Date(dateString).getTime();
  const diffMs = target - now;
  const rtf = new Intl.RelativeTimeFormat('fr', { numeric: 'auto' });
  const minutes = Math.round(diffMs / (1000 * 60));
  const hours = Math.round(diffMs / (1000 * 60 * 60));
  const days = Math.round(diffMs / (1000 * 60 * 60 * 24));

  if (Math.abs(minutes) < 60) return rtf.format(minutes, 'minute');
  if (Math.abs(hours) < 24) return rtf.format(hours, 'hour');
  return rtf.format(days, 'day');
}

function getGoalType(challenge: Challenge): GoalType | null {
  return challenge.goal_type || (challenge.goal_km ? 'distance' : null);
}

function getGoalValue(challenge: Challenge) {
  return challenge.goal_value ?? challenge.goal_km ?? null;
}

function formatGoal(value: number | null, goalType: GoalType | null) {
  if (value === null || value === undefined) return 'Objectif non defini';
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

function formatActivitySummary(activity: Activity) {
  if (activity.unit_type === 'duration') {
    return formatDuration(activity.unit_value ?? activity.duration_minutes ?? 0);
  }

  if (activity.unit_type === 'reps') {
    return formatReps(activity.unit_value ?? 0);
  }

  return formatDistance(activity.unit_value ?? activity.distance_km ?? 0);
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

      const [activitiesResponse, membersResponse, participantsResponse, badgesResponse] =
        await Promise.all([
          supabase
            .from('activities')
            .select(
              'id, challenge_id, user_email, sport, distance_km, duration_minutes, unit_type, unit_value, comment, created_at'
            )
            .eq('user_email', user.email)
            .order('created_at', { ascending: false }),
          user.email
            ? supabase.from('challenge_members').select('challenge_id').eq('user_email', user.email)
            : Promise.resolve({ data: [], error: null }),
          supabase.from('challenge_participants').select('challenge_id').eq('user_id', user.id),
          supabase.from('user_badges').select('badge_code').eq('user_id', user.id),
        ]);

      const loadedActivities = (activitiesResponse.data as Activity[] | null) || [];

      if (activitiesResponse.error) {
        console.error('Erreur chargement activites profil :', activitiesResponse.error);
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
        console.error('Erreur chargement badges profil :', badgesResponse.error);
        setBadges([]);
      } else {
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
        .select(
          'id, name, sport, description, goal_km, goal_type, goal_value, created_by, created_at'
        )
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
  const challengeMap = useMemo(() => {
    return Object.fromEntries(challenges.map((challenge) => [challenge.id, challenge]));
  }, [challenges]);
  const recentActivities = activities.slice(0, 3);
  const recentChallenges = challenges.slice(0, 3);
  const badgeCount = unlockedBadges.length;

  const handleSaveUsername = async () => {
    if (!profile) return;

    setSavingUsername(true);
    setMessage('');

    const trimmed = usernameInput.trim();

    if (!trimmed) {
      setMessage('Le pseudo ne peut pas etre vide.');
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
      console.error('Erreur mise a jour pseudo :', error);
      setMessage("Impossible d'enregistrer le pseudo.");
      setSavingUsername(false);
      return;
    }

    setProfile((prev) => (prev ? { ...prev, username: trimmed } : prev));
    setMessage('Pseudo mis a jour.');
    setEditMode(false);
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
          <p>Vous devez etre connecte pour voir cette page.</p>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="profile-page">
        <section className="card profile-hero-card">
          <div className="profile-hero-main">
            <div className="profile-hero-copy">
              <span className="section-kicker">Profil Actyv</span>
              <div className="profile-hero-heading">
                <h1>{profile.username || 'Mon profil'}</h1>
                <UserLevelBadge level={profile.level} />
              </div>
              <p className="muted">{profile.email}</p>
              <p className="muted">
                Ton hub personnel pour suivre ta progression, tes badges et tes derniers mouvements.
              </p>
            </div>

            <div className="profile-identity">
              <div>
                <span>Pseudo</span>
                <div className="profile-name-row">
                  {editMode ? (
                    <input
                      value={usernameInput}
                      onChange={(event) => setUsernameInput(event.target.value)}
                      placeholder="Choisir un pseudo"
                    />
                  ) : (
                    <strong>{profile.username || 'Aucun pseudo defini'}</strong>
                  )}
                  <UserLevelBadge level={profile.level} />
                </div>
              </div>

              <div>
                <span>XP totale</span>
                <strong>{totalXp} XP</strong>
              </div>

              <div>
                <span>Badges debloques</span>
                <strong>{badgeCount}</strong>
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

              {message && (
                <p className={`form-feedback ${message.includes('Impossible') ? 'form-feedback--error' : 'form-feedback--success'}`}>
                  {message}
                </p>
              )}
            </div>
          </div>

          <div className="profile-summary-grid">
            <article className="profile-summary-card">
              <span className="stat-card-label">Niveau actuel</span>
              <strong className="stat-card-value">Nv.{levelProgress.level}</strong>
            </article>

            <article className="profile-summary-card profile-summary-card--wide">
              <div className="profile-summary-card__top">
                <span className="stat-card-label">Progression XP</span>
                <strong>{levelProgress.progressPercent.toFixed(0)}%</strong>
              </div>
              <div className="progress-track">
                <div
                  className="progress-fill"
                  style={{ width: `${levelProgress.progressPercent}%` }}
                />
              </div>
              <p className="muted profile-summary-card__meta">
                {levelProgress.xpToNextLevel} XP avant le niveau suivant
              </p>
            </article>

            <article className="profile-summary-card">
              <span className="stat-card-label">Badges</span>
              <strong className="stat-card-value">{badgeCount}</strong>
            </article>
          </div>
        </section>

        <section className="profile-stats-grid">
          <article className="card stat-card">
            <span className="stat-card-label">Challenges crees</span>
            <strong className="stat-card-value">{stats.createdChallenges}</strong>
          </article>
          <article className="card stat-card">
            <span className="stat-card-label">Challenges rejoints</span>
            <strong className="stat-card-value">{stats.joinedChallenges}</strong>
          </article>
          <article className="card stat-card">
            <span className="stat-card-label">Activites ajoutees</span>
            <strong className="stat-card-value">{stats.totalActivities}</strong>
          </article>
        </section>

        <section className="profile-history-grid">
          <article className="card profile-history-card">
            <div className="profile-section-heading">
              <div>
                <span className="section-kicker">Raccourcis</span>
                <h2>Mon espace training</h2>
              </div>
            </div>

            <div className="profile-history-list">
              <Link href="/sessions" className="profile-history-item">
                <div className="profile-history-item__top">
                  <strong>Mes seances</strong>
                </div>
                <span>Retrouve tes templates, ton live et ton historique recent.</span>
              </Link>

              <Link href="/stats" className="profile-history-item">
                <div className="profile-history-item__top">
                  <strong>Mes statistiques</strong>
                </div>
                <span>Volume, calories, progression, records et stats par exercice.</span>
              </Link>
            </div>
          </article>

          <article className="card profile-history-card">
            <div className="profile-section-heading">
              <div>
                <span className="section-kicker">Resume</span>
                <h2>Vue rapide</h2>
              </div>
            </div>

            <div className="profile-history-list">
              <div className="profile-history-item">
                <div className="profile-history-item__top">
                  <strong>Distance totale</strong>
                </div>
                <span>{formatDistance(stats.totalDistance)}</span>
              </div>

              <div className="profile-history-item">
                <div className="profile-history-item__top">
                  <strong>Duree totale</strong>
                </div>
                <span>{formatDuration(stats.totalDuration)}</span>
              </div>

              <div className="profile-history-item">
                <div className="profile-history-item__top">
                  <strong>Repetitions</strong>
                </div>
                <span>{stats.totalReps}</span>
              </div>
            </div>
          </article>
        </section>

        <section className="card gamification-card">
          <div className="profile-section-heading">
            <div>
              <span className="section-kicker">Badges</span>
              <h2>Badges debloques</h2>
            </div>
            <span className="badge">{badgeCount} badge{badgeCount > 1 ? 's' : ''}</span>
          </div>

          <div className="badge-grid">
            {unlockedBadges.length === 0 ? (
              <span className="badge-list-empty">Aucun badge debloque pour le moment.</span>
            ) : (
              unlockedBadges.map((badge) => (
                <article
                  key={badge.code}
                  className="achievement-badge-card"
                  title={badge.description}
                >
                  <span className="achievement-badge">{badge.label}</span>
                  <p>{badge.description}</p>
                </article>
              ))
            )}
          </div>
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
              {activeChallenges.map(
                ({ challenge, goalType, goalValue, progress, progressPercent, myActivities }) => (
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
                        : 'Continue a contribuer a ce challenge.'}
                    </p>

                    <div className="challenge-overview-meta">
                      <span>Progression</span>
                      <strong>
                        {formatGoal(progress, goalType)} / {formatGoal(goalValue, goalType)}
                      </strong>
                    </div>

                    <div className="progress-meta">
                      <span className="progress-target">
                        {myActivities} activite{myActivities > 1 ? 's' : ''}
                      </span>
                      <span className="progress-percent">{progressPercent.toFixed(1)}%</span>
                    </div>
                    <div className="progress-track">
                      <div className="progress-fill" style={{ width: `${progressPercent}%` }} />
                    </div>

                    <Link href={`/challenges/${challenge.id}`} className="button ghost">
                      Voir le detail
                    </Link>
                  </article>
                )
              )}
            </div>
          )}
        </section>

        <section className="home-challenges profile-section">
          <div className="home-challenges__header">
            <div>
              <span className="section-kicker">Historique</span>
              <h2>Challenges termines</h2>
            </div>
          </div>

          {completedChallenges.length === 0 ? (
            <div className="challenge-state">
              <p>Aucun challenge termine pour le moment.</p>
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
                      <span className="badge badge-completed">Termine</span>
                      <span
                        className={getSportBadgeClassName(
                          challenge.sport,
                          'challenge-item__pill',
                          'Sport'
                        )}
                      >
                        {formatSportBadgeLabel(challenge.sport, 'Sport')}
                      </span>
                    </div>
                    <strong>{challenge.name}</strong>
                    <span>Objectif atteint : {formatGoal(goalValue, goalType)}</span>
                  </div>

                  <div className="completed-challenge-side">
                    <span>{formatGoal(progress, goalType)}</span>
                    <strong>Voir le detail</strong>
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
