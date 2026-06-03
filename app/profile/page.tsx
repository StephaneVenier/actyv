'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { AppShell } from '@/components/AppShell';
import { BadgeArtwork } from '@/components/badge-artwork';
import { formatSportBadgeLabel, getSportBadgeClassName } from '@/components/sport-badge';
import { UserLevelBadge } from '@/components/user-level-badge';
import { BADGES, getUnlockedBadgeCodes } from '@/lib/badges';
import type { UserBadge } from '@/lib/badges';
import { getUserTotalXp } from '@/lib/gamification';
import { getActyvLevel } from '@/lib/levels';
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

type WorkoutHistoryEntry = {
  id: string;
  workout_id: string | null;
  workout_name: string;
  completed_at: string;
  duration_seconds: number | null;
  total_volume: number | null;
  completed_exercises: number | null;
};

type WorkoutExerciseHistoryEntry = {
  exercise_name: string;
  volume: number | null;
  charge_kg: number | null;
  completed_at: string;
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

function formatWorkoutDuration(durationSeconds: number | null | undefined) {
  const normalizedSeconds = Number(durationSeconds);

  if (!Number.isFinite(normalizedSeconds) || normalizedSeconds <= 0) {
    return '-';
  }

  const totalSeconds = Math.floor(normalizedSeconds);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  if (minutes <= 0) {
    return `${seconds} sec`;
  }

  return `${minutes} min${seconds > 0 ? ` ${seconds.toString().padStart(2, '0')}` : ''}`;
}

function formatSessionVolumeLabel(volumeKg: number | null | undefined) {
  if (!volumeKg || volumeKg <= 0) return '-';
  return `${Number(volumeKg).toLocaleString('fr-FR')} kg`;
}

function formatProfileRelativeDate(dateString: string | null) {
  if (!dateString) return 'recentement';

  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return 'recentement';

  const diffHours = Math.round((date.getTime() - Date.now()) / (1000 * 60 * 60));
  const formatter = new Intl.RelativeTimeFormat('fr', { numeric: 'auto' });

  if (Math.abs(diffHours) < 24) {
    return formatter.format(diffHours, 'hour');
  }

  return formatter.format(Math.round(diffHours / 24), 'day');
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

export default function ProfilePage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [xpTotalFromEvents, setXpTotalFromEvents] = useState(0);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [challenges, setChallenges] = useState<Challenge[]>([]);
  const [joinedChallengeIds, setJoinedChallengeIds] = useState<string[]>([]);
  const [interactions, setInteractions] = useState<ActivityInteraction[]>([]);
  const [badges, setBadges] = useState<UserBadge[]>([]);
  const [recentWorkoutHistory, setRecentWorkoutHistory] = useState<WorkoutHistoryEntry[]>([]);
  const [allWorkoutHistory, setAllWorkoutHistory] = useState<WorkoutHistoryEntry[]>([]);
  const [workoutExerciseHistory, setWorkoutExerciseHistory] = useState<WorkoutExerciseHistoryEntry[]>([]);
  const [workoutSportsById, setWorkoutSportsById] = useState<Record<string, string | null>>({});
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

      const xpTotalResult = await getUserTotalXp(user.id, nextProfile.total_xp || 0);

      setXpTotalFromEvents(xpTotalResult.totalXp);
      setProfile(nextProfile);
      setUsernameInput(nextProfile.username || '');

      const [
        activitiesResponse,
        membersResponse,
        participantsResponse,
        badgesResponse,
        workoutHistoryResponse,
        recentWorkoutHistoryResponse,
        workoutExerciseHistoryResponse,
      ] =
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
          supabase
            .from('workout_sessions_history')
            .select(
              'id, workout_id, workout_name, completed_at, duration_seconds, total_volume, completed_exercises'
            )
            .eq('user_id', user.id)
            .order('completed_at', { ascending: false }),
          supabase
            .from('workout_sessions_history')
            .select(
              'id, workout_id, workout_name, completed_at, duration_seconds, total_volume, completed_exercises'
            )
            .eq('user_id', user.id)
            .order('completed_at', { ascending: false })
            .limit(5),
          supabase
            .from('workout_exercise_history')
            .select('exercise_name, volume, charge_kg, completed_at')
            .eq('user_id', user.id)
            .order('completed_at', { ascending: false }),
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

      if (workoutHistoryResponse.error) {
        console.error('Erreur chargement historique seances profil :', workoutHistoryResponse.error);
        setAllWorkoutHistory([]);
      } else {
        setAllWorkoutHistory((workoutHistoryResponse.data as WorkoutHistoryEntry[] | null) || []);
      }

      if (recentWorkoutHistoryResponse.error) {
        console.error('Erreur chargement historique recent profil :', recentWorkoutHistoryResponse.error);
        setRecentWorkoutHistory([]);
      } else {
        setRecentWorkoutHistory((recentWorkoutHistoryResponse.data as WorkoutHistoryEntry[] | null) || []);
      }

      if (workoutExerciseHistoryResponse.error) {
        console.error('Erreur chargement historique exercices profil :', workoutExerciseHistoryResponse.error);
        setWorkoutExerciseHistory([]);
      } else {
        setWorkoutExerciseHistory(
          (workoutExerciseHistoryResponse.data as WorkoutExerciseHistoryEntry[] | null) || []
        );
      }

      const workoutIds = Array.from(
        new Set(
          (((workoutHistoryResponse.data as WorkoutHistoryEntry[] | null) || []) ?? [])
            .map((entry) => entry.workout_id)
            .filter((workoutId): workoutId is string => Boolean(workoutId))
        )
      );

      if (workoutIds.length > 0) {
        const { data: workoutSportsRows, error: workoutSportsError } = await supabase
          .from('training_sessions')
          .select('id, sport')
          .in('id', workoutIds);

        if (workoutSportsError) {
          console.error('Erreur chargement sports seances profil :', workoutSportsError);
          setWorkoutSportsById({});
        } else {
          const nextSportsById = Object.fromEntries(
            (((workoutSportsRows as Array<{ id: string; sport: string | null }> | null) || [])).map((row) => [
              row.id,
              row.sport,
            ])
          );
          setWorkoutSportsById(nextSportsById);
        }
      } else {
        setWorkoutSportsById({});
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

  const workoutProfileSummary = useMemo(() => {
    const totalCompletedWorkouts = allWorkoutHistory.length;
    const totalDurationSeconds = allWorkoutHistory.reduce((total, entry) => {
      const durationSeconds =
        Number.isFinite(Number(entry.duration_seconds)) && Number(entry.duration_seconds) > 0
          ? Number(entry.duration_seconds)
          : 0;
      return total + durationSeconds;
    }, 0);
    const totalVolumeKg = allWorkoutHistory.reduce((total, entry) => {
      const volumeKg =
        Number.isFinite(Number(entry.total_volume)) && Number(entry.total_volume) > 0
          ? Number(entry.total_volume)
          : 0;
      return total + volumeKg;
    }, 0);
    const lastWorkout = allWorkoutHistory[0] || null;

    const sportCounts = allWorkoutHistory.reduce<Record<string, number>>((accumulator, entry) => {
      const sport = (entry.workout_id ? workoutSportsById[entry.workout_id] : null) || null;
      if (!sport) return accumulator;
      accumulator[sport] = (accumulator[sport] || 0) + 1;
      return accumulator;
    }, {});

    const mostPracticedSport =
      Object.entries(sportCounts).sort((left, right) => right[1] - left[1])[0]?.[0] || null;

    const bestWorkoutVolumeKg = allWorkoutHistory.reduce((best, entry) => {
      const volumeKg =
        Number.isFinite(Number(entry.total_volume)) && Number(entry.total_volume) > 0
          ? Number(entry.total_volume)
          : 0;
      return Math.max(best, volumeKg);
    }, 0);

    const longestWorkoutSeconds = allWorkoutHistory.reduce((best, entry) => {
      const durationSeconds =
        Number.isFinite(Number(entry.duration_seconds)) && Number(entry.duration_seconds) > 0
          ? Number(entry.duration_seconds)
          : 0;
      return Math.max(best, durationSeconds);
    }, 0);

    const topExerciseRecord =
      workoutExerciseHistory.length > 0
        ? [...workoutExerciseHistory]
            .sort((left, right) => {
              const rightVolume =
                Number.isFinite(Number(right.volume)) && Number(right.volume) > 0 ? Number(right.volume) : 0;
              const leftVolume =
                Number.isFinite(Number(left.volume)) && Number(left.volume) > 0 ? Number(left.volume) : 0;

              if (rightVolume !== leftVolume) return rightVolume - leftVolume;

              const rightCharge =
                Number.isFinite(Number(right.charge_kg)) && Number(right.charge_kg) > 0
                  ? Number(right.charge_kg)
                  : 0;
              const leftCharge =
                Number.isFinite(Number(left.charge_kg)) && Number(left.charge_kg) > 0
                  ? Number(left.charge_kg)
                  : 0;

              return rightCharge - leftCharge;
            })[0] || null
        : null;

    return {
      totalCompletedWorkouts,
      totalDurationSeconds,
      totalVolumeKg,
      lastWorkout,
      mostPracticedSport,
      bestWorkoutVolumeKg: bestWorkoutVolumeKg > 0 ? bestWorkoutVolumeKg : null,
      longestWorkoutSeconds: longestWorkoutSeconds > 0 ? longestWorkoutSeconds : null,
      topExerciseRecord,
    };
  }, [allWorkoutHistory, workoutExerciseHistory, workoutSportsById]);

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
  const totalXp = xpTotalFromEvents;
  const levelProgress = getActyvLevel(totalXp);
  const unlockedBadgeCodes = getUnlockedBadgeCodes(badges);
  const unlockedBadges = BADGES.filter((badge) => unlockedBadgeCodes.has(badge.code));
  const badgeCount = unlockedBadges.length;
  const totalBadgeCount = BADGES.length;
  const featuredBadges = unlockedBadges.slice(0, 4);

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
      level: getActyvLevel(totalXp).level,
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
                <UserLevelBadge level={levelProgress.level} />
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
                  <UserLevelBadge level={levelProgress.level} />
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
                  <>
                    <button type="button" className="button ghost" onClick={() => setEditMode(true)}>
                      Modifier mon pseudo
                    </button>
                    <Link href="/stats" className="button primary">
                      Voir mes statistiques
                    </Link>
                  </>
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
            <article className="profile-summary-card profile-summary-card--level">
              <div className="profile-summary-card__top">
                <div>
                  <span className="stat-card-label">Niveau Actyv</span>
                  <strong className="stat-card-value">Niveau {levelProgress.level}</strong>
                </div>
                <UserLevelBadge level={levelProgress.level} />
              </div>

              <div className="profile-level-card__xp-row">
                <strong>{totalXp} XP</strong>
                <span>
                  {levelProgress.nextLevelXp === null
                    ? 'Niveau max actuel'
                    : `${levelProgress.currentLevelXp} / ${levelProgress.nextLevelXp} XP`}
                </span>
              </div>

              <div className="progress-track profile-level-card__track">
                <div
                  className="progress-fill profile-level-card__fill"
                  style={{ width: `${levelProgress.progressPercent}%` }}
                />
              </div>

              <div className="profile-level-card__meta">
                <span>
                  {levelProgress.nextLevelXp === null
                    ? 'Tu as atteint le dernier palier V1.'
                    : `${levelProgress.xpIntoLevel} XP gagnes dans ce niveau`}
                </span>
                <strong>
                  {levelProgress.nextLevelXp === null
                    ? '100%'
                    : `${levelProgress.xpToNextLevel} XP avant le niveau suivant`}
                </strong>
              </div>
            </article>

            <article className="profile-summary-card">
              <span className="stat-card-label">XP total</span>
              <strong className="stat-card-value">{totalXp} XP</strong>
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
                <span className="section-kicker">Profil sportif</span>
                <h2>Resume sportif</h2>
              </div>
            </div>

            {workoutProfileSummary.totalCompletedWorkouts === 0 ? (
              <div className="profile-history-item">
                <span>Lance ta premiere seance pour construire ton profil sportif.</span>
              </div>
            ) : (
              <div className="profile-history-list">
                <div className="profile-history-item">
                  <div className="profile-history-item__top">
                    <strong>Seances realisees</strong>
                  </div>
                  <span>{workoutProfileSummary.totalCompletedWorkouts}</span>
                </div>

                <div className="profile-history-item">
                  <div className="profile-history-item__top">
                    <strong>Duree totale d&apos;entrainement</strong>
                  </div>
                  <span>{formatWorkoutDuration(workoutProfileSummary.totalDurationSeconds)}</span>
                </div>

                <div className="profile-history-item">
                  <div className="profile-history-item__top">
                    <strong>Volume total souleve</strong>
                  </div>
                  <span>{formatSessionVolumeLabel(workoutProfileSummary.totalVolumeKg)}</span>
                </div>

                <div className="profile-history-item">
                  <div className="profile-history-item__top">
                    <strong>Derniere seance</strong>
                  </div>
                  <span>
                    {workoutProfileSummary.lastWorkout
                      ? `${workoutProfileSummary.lastWorkout.workout_name} - ${formatProfileRelativeDate(
                          workoutProfileSummary.lastWorkout.completed_at
                        )}`
                      : '-'}
                  </span>
                </div>

                <div className="profile-history-item">
                  <div className="profile-history-item__top">
                    <strong>Sport le plus pratique</strong>
                  </div>
                  <span>
                    {workoutProfileSummary.mostPracticedSport
                      ? formatSportBadgeLabel(workoutProfileSummary.mostPracticedSport, 'Sport')
                      : '-'}
                  </span>
                </div>
              </div>
            )}
          </article>
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
                <span>Retrouve tes templates, ton live et l&apos;historique de tes seances.</span>
              </Link>

              <Link href="/stats" className="profile-history-item">
                <div className="profile-history-item__top">
                  <strong>Voir toutes mes statistiques</strong>
                </div>
                <span>Volume, calories, progression, records et stats par exercice.</span>
              </Link>
            </div>
          </article>

          <article className="card profile-history-card">
            <div className="profile-section-heading">
              <div>
                <span className="section-kicker">Records</span>
                <h2>Records recents</h2>
              </div>
            </div>

            {workoutProfileSummary.totalCompletedWorkouts === 0 ? (
              <div className="profile-history-item">
                <span>Lance ta premiere seance pour construire ton profil sportif.</span>
              </div>
            ) : (
              <div className="profile-history-list">
                <div className="profile-history-item">
                  <div className="profile-history-item__top">
                    <strong>Meilleur volume</strong>
                  </div>
                  <span>{formatSessionVolumeLabel(workoutProfileSummary.bestWorkoutVolumeKg)}</span>
                </div>

                <div className="profile-history-item">
                  <div className="profile-history-item__top">
                    <strong>Seance la plus longue</strong>
                  </div>
                  <span>{formatWorkoutDuration(workoutProfileSummary.longestWorkoutSeconds)}</span>
                </div>

                <div className="profile-history-item">
                  <div className="profile-history-item__top">
                    <strong>Exercice record</strong>
                  </div>
                  <span>
                    {workoutProfileSummary.topExerciseRecord
                      ? `${workoutProfileSummary.topExerciseRecord.exercise_name} - ${
                          formatSessionVolumeLabel(workoutProfileSummary.topExerciseRecord.volume) !== '-'
                            ? formatSessionVolumeLabel(workoutProfileSummary.topExerciseRecord.volume)
                            : workoutProfileSummary.topExerciseRecord.charge_kg
                              ? `${workoutProfileSummary.topExerciseRecord.charge_kg} kg`
                              : '-'
                        }`
                      : '-'}
                  </span>
                </div>
              </div>
            )}
          </article>

          <article className="card profile-history-card">
            <div className="profile-section-heading">
              <div>
                <span className="section-kicker">Seances</span>
                <h2>Dernieres seances realisees</h2>
              </div>
            </div>

            <div className="profile-history-list">
              {recentWorkoutHistory.length === 0 ? (
                <div className="profile-history-item">
                  <span>Lance ta premiere seance pour construire ton profil sportif.</span>
                </div>
              ) : (
                recentWorkoutHistory.map((entry) => (
                  <div key={entry.id} className="profile-history-item">
                    <div className="profile-history-item__top">
                      <strong>{entry.workout_name}</strong>
                      <span className="profile-history-item__date">{formatProfileRelativeDate(entry.completed_at)}</span>
                    </div>
                    <span>
                      {formatWorkoutDuration(entry.duration_seconds)} - {formatSessionVolumeLabel(entry.total_volume)}
                    </span>
                    {entry.workout_id ? (
                      <Link href={`/sessions/${entry.workout_id}`} className="session-link-button">
                        Voir la seance
                      </Link>
                    ) : null}
                  </div>
                ))
              )}
            </div>
          </article>
        </section>

        <section className="card gamification-card profile-badges-summary-card">
          <div className="profile-section-heading">
            <div>
              <span className="section-kicker">Badges</span>
              <h2>Collection badges</h2>
            </div>
            <span className="badge">
              {badgeCount} / {totalBadgeCount}
            </span>
          </div>

          <div className="profile-badges-summary-card__content">
            <div className="profile-badges-summary-card__body">
              <div className="profile-badges-summary-card__stats">
                <strong>
                  {badgeCount} / {totalBadgeCount} debloques
                </strong>
                <p>
                  {badgeCount === 0
                    ? 'Aucun badge debloque pour le moment.'
                    : `${totalBadgeCount - badgeCount} badge${totalBadgeCount - badgeCount > 1 ? 's' : ''} restent a aller chercher.`}
                </p>
              </div>

              <div className="profile-badges-summary-card__artwork-row" aria-label="Apercu des badges">
                {featuredBadges.length > 0 ? (
                  featuredBadges.map((badge) => (
                    <BadgeArtwork
                      key={badge.code}
                      badgeCode={badge.code}
                      badgeName={badge.name}
                      unlocked
                      className="profile-badge-preview"
                      fallback={badge.name.slice(0, 1).toUpperCase()}
                    />
                  ))
                ) : (
                  <span className="profile-badges-summary-card__empty">Tes prochains badges apparaitront ici.</span>
                )}
              </div>
            </div>

            <Link href="/badges" className="button primary">
              Voir tous les badges
            </Link>
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
      </div>
    </AppShell>
  );
}



