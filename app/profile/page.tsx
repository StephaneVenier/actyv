'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { AppShell } from '@/components/AppShell';
import { BadgeArtwork } from '@/components/badge-artwork';
import { CompactAccordion } from '@/components/CompactAccordion';
import { queuePendingToast } from '@/components/ToastProvider';
import { formatSportBadgeLabel, getSportBadgeClassName } from '@/components/sport-badge';
import { UserLevelBadge } from '@/components/user-level-badge';
import { BADGES, getBadgeByCode, getUnlockedBadgeCodes } from '@/lib/badges';
import type { UserBadge } from '@/lib/badges';
import {
  getBestDailySessionStreakDays,
  getDailySessionStreakDays,
  getTodayIsoDate,
} from '@/lib/daily-sessions';
import type { DailySessionCompletion } from '@/lib/daily-sessions';
import { getUserTotalXp, refreshUserBadges } from '@/lib/gamification';
import { getActyvLevel } from '@/lib/levels';
import { formatPercent } from '@/lib/display-format';
import { getMonthlySteps, getTodaySteps, getWeeklySteps, upsertTodaySteps } from '@/lib/steps';
import { supabase } from '@/lib/supabase';
import { parseWorkoutCompletionMetadata } from '@/lib/workout-history';

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
  metadata?: unknown;
};

type WorkoutExerciseHistoryEntry = {
  exercise_name: string;
  volume: number | null;
  charge_kg: number | null;
  completed_at: string;
};

type TrainingProgramEntry = {
  id: string;
  visibility: string | null;
  copied_from_program_id: string | null;
};

type XpEventEntry = {
  id: string;
  event_type: string | null;
  xp_amount: number | null;
  created_at: string;
  target_id: string | null;
};

type DashboardEvent = {
  id: string;
  kind: 'xp' | 'badge' | 'session' | 'activity';
  title: string;
  subtitle: string;
  created_at: string;
};

type WorkoutGlobalStrengthStats = {
  totalCompletedWorkouts: number;
  totalDurationSeconds: number;
  totalValidatedSets: number;
  totalVolumeKg: number;
  distinctExercisesCount: number;
  lastWorkout: WorkoutHistoryEntry | null;
  weekSessions: number;
  weekVolumeKg: number;
  monthSessions: number;
  monthVolumeKg: number;
  topExercises: Array<{
    exerciseName: string;
    workoutCount: number;
  }>;
  favoriteExercise: {
    exerciseName: string;
    workoutCount: number;
  } | null;
};

type DailyStepsCardState = {
  todaySteps: number;
  weeklySteps: number;
  monthlySteps: number;
  hasTodayEntry: boolean;
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

function formatProfileAbsoluteDate(dateString: string | null) {
  if (!dateString) return '-';

  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return '-';

  return date.toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: 'short',
  });
}

function getXpEventLabel(eventType: string | null) {
  const labels: Record<string, { title: string; subtitle: string }> = {
    activity_added: { title: 'XP gagnee', subtitle: 'Activite ajoutee' },
    session_completed: { title: 'XP gagnee', subtitle: 'Seance terminee' },
    daily_session_completed: { title: 'XP gagnee', subtitle: 'Seance du jour validee' },
    challenge_created: { title: 'XP gagnee', subtitle: 'Challenge cree' },
    challenge_joined: { title: 'XP gagnee', subtitle: 'Challenge rejoint' },
    challenge_completed: { title: 'XP gagnee', subtitle: 'Challenge termine' },
    like_received: { title: 'XP gagnee', subtitle: 'Reaction recue' },
    boost_received: { title: 'XP gagnee', subtitle: 'Boost recu' },
    program_created: { title: 'XP gagnee', subtitle: 'Programme cree' },
    program_shared: { title: 'XP gagnee', subtitle: 'Programme partage' },
    program_completed: { title: 'XP gagnee', subtitle: 'Programme termine' },
  };

  return labels[eventType || ''] || { title: 'XP gagnee', subtitle: 'Evenement Actyv' };
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
  const [dailyCompletions, setDailyCompletions] = useState<DailySessionCompletion[]>([]);
  const [xpEvents, setXpEvents] = useState<XpEventEntry[]>([]);
  const [trainingPrograms, setTrainingPrograms] = useState<TrainingProgramEntry[]>([]);
  const [recentWorkoutHistory, setRecentWorkoutHistory] = useState<WorkoutHistoryEntry[]>([]);
  const [allWorkoutHistory, setAllWorkoutHistory] = useState<WorkoutHistoryEntry[]>([]);
  const [workoutExerciseHistory, setWorkoutExerciseHistory] = useState<WorkoutExerciseHistoryEntry[]>([]);
  const [workoutSportsById, setWorkoutSportsById] = useState<Record<string, string | null>>({});
  const [loading, setLoading] = useState(true);
  const [editMode, setEditMode] = useState(false);
  const [usernameInput, setUsernameInput] = useState('');
  const [savingUsername, setSavingUsername] = useState(false);
  const [dailySteps, setDailySteps] = useState<DailyStepsCardState>({
    todaySteps: 0,
    weeklySteps: 0,
    monthlySteps: 0,
    hasTodayEntry: false,
  });
  const [stepsInput, setStepsInput] = useState('0');
  const [savingSteps, setSavingSteps] = useState(false);
  const [stepsMessage, setStepsMessage] = useState('');
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

      try {
        const [todayStepsEntry, weeklyStepsSummary, monthlyStepsSummary] = await Promise.all([
          getTodaySteps(user.id),
          getWeeklySteps(user.id),
          getMonthlySteps(user.id),
        ]);

        const todayStepsCount = todayStepsEntry?.steps_count || 0;
        setDailySteps({
          todaySteps: todayStepsCount,
          weeklySteps: weeklyStepsSummary.totalSteps,
          monthlySteps: monthlyStepsSummary.totalSteps,
          hasTodayEntry: Boolean(todayStepsEntry),
        });
        setStepsInput(String(todayStepsCount));
      } catch (error) {
        console.error('Erreur chargement daily_steps profil :', error);
        setDailySteps({
          todaySteps: 0,
          weeklySteps: 0,
          monthlySteps: 0,
          hasTodayEntry: false,
        });
        setStepsInput('0');
      }

      const [
        activitiesResponse,
        membersResponse,
        participantsResponse,
        badgesResponse,
        dailyCompletionsResponse,
        xpEventsResponse,
        trainingProgramsResponse,
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
          supabase.from('user_badges').select('badge_code, unlocked_at').eq('user_id', user.id),
          supabase
            .from('daily_session_completions')
            .select('id, daily_session_id, user_id, session_id, workout_history_id, scheduled_for, completed_at, created_at')
            .eq('user_id', user.id)
            .order('scheduled_for', { ascending: false })
            .limit(180),
          supabase
            .from('xp_events')
            .select('id, event_type, xp_amount, created_at, target_id')
            .eq('user_id', user.id)
            .order('created_at', { ascending: false })
            .limit(12),
          supabase
            .from('training_programs')
            .select('id, visibility, copied_from_program_id')
            .eq('user_id', user.id),
          supabase
            .from('workout_sessions_history')
            .select(
              'id, workout_id, workout_name, completed_at, duration_seconds, total_volume, completed_exercises, metadata'
            )
            .eq('user_id', user.id)
            .order('completed_at', { ascending: false }),
          supabase
            .from('workout_sessions_history')
            .select(
              'id, workout_id, workout_name, completed_at, duration_seconds, total_volume, completed_exercises, metadata'
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

      if (dailyCompletionsResponse.error) {
        console.error('Erreur chargement Actyv Quotidien profil :', dailyCompletionsResponse.error);
        setDailyCompletions([]);
      } else {
        setDailyCompletions((dailyCompletionsResponse.data as DailySessionCompletion[] | null) || []);
      }

      if (xpEventsResponse.error) {
        console.error('Erreur chargement xp_events profil :', xpEventsResponse.error);
        setXpEvents([]);
      } else {
        setXpEvents((xpEventsResponse.data as XpEventEntry[] | null) || []);
      }

      if (trainingProgramsResponse.error) {
        console.error('Erreur chargement programmes profil :', trainingProgramsResponse.error);
        setTrainingPrograms([]);
      } else {
        setTrainingPrograms((trainingProgramsResponse.data as TrainingProgramEntry[] | null) || []);
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
    const createdProgramsCount = trainingPrograms.filter((program) => !program.copied_from_program_id).length;
    const completedProgramsCount = xpEvents.filter((event) => event.event_type === 'program_completed').length;

    return {
      createdChallenges: createdChallengeIds.length,
      joinedChallenges: new Set(joinedOnlyChallengeIds).size,
      createdPrograms: createdProgramsCount,
      completedPrograms: completedProgramsCount,
      completedWorkouts: allWorkoutHistory.length,
      totalActivities,
      totalDistance,
      totalDuration,
      totalReps,
      totalLikes,
      totalBoosts,
    };
  }, [activities, allWorkoutHistory.length, challenges, interactions, joinedChallengeIds, profile?.id, trainingPrograms, xpEvents]);

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
  const workoutGlobalStrengthStats = useMemo<WorkoutGlobalStrengthStats>(() => {
    if (allWorkoutHistory.length === 0) {
      return {
        totalCompletedWorkouts: 0,
        totalDurationSeconds: 0,
        totalValidatedSets: 0,
        totalVolumeKg: 0,
        distinctExercisesCount: 0,
        lastWorkout: null,
        weekSessions: 0,
        weekVolumeKg: 0,
        monthSessions: 0,
        monthVolumeKg: 0,
        topExercises: [],
        favoriteExercise: null,
      };
    }

    const now = new Date();
    const currentDay = now.getDay();
    const mondayOffset = currentDay === 0 ? -6 : 1 - currentDay;
    const startOfWeek = new Date(now);
    startOfWeek.setHours(0, 0, 0, 0);
    startOfWeek.setDate(now.getDate() + mondayOffset);

    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    startOfMonth.setHours(0, 0, 0, 0);

    const exerciseCounts = new Map<string, number>();
    const distinctExercises = new Set<string>();

    const aggregated = allWorkoutHistory.reduce(
      (accumulator, entry) => {
        const metadata = parseWorkoutCompletionMetadata(entry.metadata);
        const actualSets = metadata.actual_sets || metadata.set_performances || [];
        const validatedSets =
          metadata.completed_sets ??
          actualSets.filter((setEntry) => setEntry.status === 'completed').length;
        const actualVolumeKg =
          metadata.actual_total_volume ??
          metadata.total_volume ??
          (Number.isFinite(Number(entry.total_volume)) && Number(entry.total_volume) > 0
            ? Number(entry.total_volume)
            : 0);
        const durationSeconds =
          Number.isFinite(Number(entry.duration_seconds)) && Number(entry.duration_seconds) > 0
            ? Number(entry.duration_seconds)
            : 0;
        const completedAt = new Date(entry.completed_at);

        const exerciseNamesForWorkout = new Set<string>();
        actualSets.forEach((setEntry) => {
          if (setEntry.status !== 'completed') return;
          const exerciseName = setEntry.block_name.trim();
          if (!exerciseName) return;
          distinctExercises.add(exerciseName.toLowerCase());
          exerciseNamesForWorkout.add(exerciseName);
        });

        exerciseNamesForWorkout.forEach((exerciseName) => {
          exerciseCounts.set(exerciseName, (exerciseCounts.get(exerciseName) || 0) + 1);
        });

        accumulator.totalDurationSeconds += durationSeconds;
        accumulator.totalValidatedSets += validatedSets;
        accumulator.totalVolumeKg += actualVolumeKg;

        if (!Number.isNaN(completedAt.getTime()) && completedAt >= startOfWeek) {
          accumulator.weekSessions += 1;
          accumulator.weekVolumeKg += actualVolumeKg;
        }

        if (!Number.isNaN(completedAt.getTime()) && completedAt >= startOfMonth) {
          accumulator.monthSessions += 1;
          accumulator.monthVolumeKg += actualVolumeKg;
        }

        return accumulator;
      },
      {
        totalDurationSeconds: 0,
        totalValidatedSets: 0,
        totalVolumeKg: 0,
        weekSessions: 0,
        weekVolumeKg: 0,
        monthSessions: 0,
        monthVolumeKg: 0,
      }
    );

    const topExercises = [...exerciseCounts.entries()]
      .sort((left, right) => {
        if (right[1] !== left[1]) return right[1] - left[1];
        return left[0].localeCompare(right[0], 'fr');
      })
      .slice(0, 5)
      .map(([exerciseName, workoutCount]) => ({
        exerciseName,
        workoutCount,
      }));

    return {
      totalCompletedWorkouts: allWorkoutHistory.length,
      totalDurationSeconds: aggregated.totalDurationSeconds,
      totalValidatedSets: aggregated.totalValidatedSets,
      totalVolumeKg: aggregated.totalVolumeKg,
      distinctExercisesCount: distinctExercises.size,
      lastWorkout: allWorkoutHistory[0] || null,
      weekSessions: aggregated.weekSessions,
      weekVolumeKg: aggregated.weekVolumeKg,
      monthSessions: aggregated.monthSessions,
      monthVolumeKg: aggregated.monthVolumeKg,
      topExercises,
      favoriteExercise: topExercises[0] || null,
    };
  }, [allWorkoutHistory]);
  const stepsGoal = 10000;
  const stepsProgressPercent = Math.min(
    100,
    Math.max(0, Math.round((dailySteps.todaySteps / stepsGoal) * 100))
  );
  const stepsSupportMessage =
    dailySteps.hasTodayEntry || dailySteps.weeklySteps > 0 || dailySteps.monthlySteps > 0
      ? 'Saisie manuelle temporaire active.'
      : 'Synchronisation Android a venir';

  const dailySummary = useMemo(() => {
    const currentStreak = getDailySessionStreakDays(dailyCompletions);
    const bestStreak = getBestDailySessionStreakDays(dailyCompletions);
    const todayIso = getTodayIsoDate();
    const completedToday = dailyCompletions.some((completion) => completion.scheduled_for === todayIso);

    return {
      totalCompletions: dailyCompletions.length,
      currentStreak,
      bestStreak,
      completedToday,
    };
  }, [dailyCompletions]);

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
  const recentUnlockedBadges = useMemo(() => {
    const badgeRows = badges
      .filter((badge) => Boolean(getBadgeByCode(badge.badge_code)))
      .sort((left, right) => {
        const leftTime = left.unlocked_at ? new Date(left.unlocked_at).getTime() : 0;
        const rightTime = right.unlocked_at ? new Date(right.unlocked_at).getTime() : 0;
        return rightTime - leftTime;
      })
      .slice(0, 3);

    return badgeRows
      .map((badge) => {
        const definition = getBadgeByCode(badge.badge_code);
        return definition
          ? {
              ...definition,
              unlockedAt: badge.unlocked_at || null,
            }
          : null;
      })
      .filter((badge): badge is NonNullable<typeof badge> => Boolean(badge));
  }, [badges]);

  const recentEvents = useMemo<DashboardEvent[]>(() => {
    const xpDashboardEvents: DashboardEvent[] = xpEvents.slice(0, 5).map((event) => {
      const label = getXpEventLabel(event.event_type);
      return {
        id: `xp-${event.id}`,
        kind: 'xp',
        title: `${label.title} +${Number(event.xp_amount || 0)} XP`,
        subtitle: label.subtitle,
        created_at: event.created_at,
      };
    });

    const badgeDashboardEvents: DashboardEvent[] = badges
      .filter((badge) => badge.unlocked_at)
      .slice()
      .sort((left, right) => {
        const leftTime = left.unlocked_at ? new Date(left.unlocked_at).getTime() : 0;
        const rightTime = right.unlocked_at ? new Date(right.unlocked_at).getTime() : 0;
        return rightTime - leftTime;
      })
      .slice(0, 5)
      .map((badge) => ({
        id: `badge-${badge.badge_code}-${badge.unlocked_at}`,
        kind: 'badge',
        title: `Badge debloque : ${getBadgeByCode(badge.badge_code)?.label || badge.badge_code}`,
        subtitle: 'Collection badges',
        created_at: badge.unlocked_at || new Date().toISOString(),
      }));

    const sessionDashboardEvents: DashboardEvent[] = recentWorkoutHistory.slice(0, 5).map((entry) => ({
      id: `session-${entry.id}`,
      kind: 'session',
      title: `Seance terminee : ${entry.workout_name}`,
      subtitle: `${formatWorkoutDuration(entry.duration_seconds)} · ${formatSessionVolumeLabel(entry.total_volume)}`,
      created_at: entry.completed_at,
    }));

    const activityDashboardEvents: DashboardEvent[] = activities.slice(0, 5).map((entry) => ({
      id: `activity-${entry.id}`,
      kind: 'activity',
      title: 'Activite ajoutee',
      subtitle: entry.sport ? formatSportBadgeLabel(entry.sport, 'Sport') : 'Activite Actyv',
      created_at: entry.created_at || new Date().toISOString(),
    }));

    return [...xpDashboardEvents, ...badgeDashboardEvents, ...sessionDashboardEvents, ...activityDashboardEvents]
      .sort((left, right) => new Date(right.created_at).getTime() - new Date(left.created_at).getTime())
      .slice(0, 5);
  }, [activities, badges, recentWorkoutHistory, xpEvents]);

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

  const handleSaveTodaySteps = async () => {
    if (!profile || savingSteps) return;

    setSavingSteps(true);
    setStepsMessage('');

    try {
      const normalizedSteps = Math.max(0, Math.trunc(Number(stepsInput) || 0));
      const savedEntry = await upsertTodaySteps(profile.id, normalizedSteps);
      const weeklySummary = await getWeeklySteps(profile.id);
      const monthlySummary = await getMonthlySteps(profile.id);

      setDailySteps({
        todaySteps: savedEntry.steps_count,
        weeklySteps: weeklySummary.totalSteps,
        monthlySteps: monthlySummary.totalSteps,
        hasTodayEntry: true,
      });
      setStepsInput(String(savedEntry.steps_count));

      const badgeResult = await refreshUserBadges(profile.id);
      if (badgeResult.error) {
        console.error('Erreur refresh badges pas :', badgeResult.error);
      } else if (badgeResult.awarded.length > 0) {
        badgeResult.awarded.forEach((badgeCode) => {
          const badge = getBadgeByCode(badgeCode);
          queuePendingToast({
            message: `Badge debloque : ${badge?.label || badgeCode}`,
            tone: 'celebrate',
          });
        });

        const { data: badgeRows, error: badgesError } = await supabase
          .from('user_badges')
          .select('badge_code, unlocked_at')
          .eq('user_id', profile.id);

        if (badgesError) {
          console.error('Erreur rechargement badges profil apres pas :', badgesError);
        } else {
          setBadges((badgeRows as UserBadge[] | null) || []);
        }
      }

      setStepsMessage('Pas du jour mis a jour.');
    } catch (error) {
      console.error('Erreur enregistrement daily_steps profil :', error);
      setStepsMessage("Impossible d'enregistrer les pas du jour.");
    } finally {
      setSavingSteps(false);
    }
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
                <span>Niveau Actyv</span>
                <strong>Niveau {levelProgress.level}</strong>
              </div>

              <div>
                <span>XP totale</span>
                <strong>{totalXp} XP</strong>
              </div>

              <div>
                <span>Progression</span>
                <strong>
                  {levelProgress.nextLevelXp === null
                    ? 'Niveau max actuel'
                    : `${totalXp} / ${levelProgress.nextLevelXp} XP`}
                </strong>
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

            <article className="profile-summary-card profile-summary-card--wide">
              <div className="profile-summary-card__top">
                <span className="stat-card-label">Progression XP</span>
                <strong>{formatPercent(levelProgress.progressPercent, { maximumFractionDigits: 0 })}</strong>
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

            <article className="profile-summary-card profile-summary-card--daily">
              <div className="profile-summary-card__top">
                <span className="stat-card-label">Actyv Quotidien</span>
                <strong>{dailySummary.currentStreak} jour{dailySummary.currentStreak > 1 ? 's' : ''}</strong>
              </div>
              <p className="profile-summary-card__meta">
                {dailySummary.completedToday ? 'Seance du jour deja faite' : 'Seance du jour a lancer'}
              </p>
              <div className="profile-daily-inline-stats">
                <span>Meilleure serie : {dailySummary.bestStreak} j</span>
                <span>{dailySummary.totalCompletions} validations</span>
              </div>
              <Link href="/session-du-jour" className="button ghost">
                Voir Actyv Quotidien
              </Link>
            </article>
          </div>
        </section>

        <CompactAccordion
          className="card gamification-card profile-badges-summary-card compact-accordion--profile"
          kicker="Badges"
          title="Collection badges"
          summary={`${badgeCount} / ${totalBadgeCount} debloques`}
          trailing={<span className="badge">{badgeCount} / {totalBadgeCount}</span>}
        >
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

              <div className="profile-badges-summary-card__artwork-row" aria-label="Derniers badges debloques">
                {recentUnlockedBadges.length > 0 ? (
                  recentUnlockedBadges.map((badge) => (
                    <div key={`${badge.code}-${badge.unlockedAt || 'na'}`} className="profile-badge-preview-card">
                      <BadgeArtwork
                        badgeCode={badge.code}
                        badgeName={badge.name}
                        unlocked
                        className="profile-badge-preview"
                        fallback={badge.name.slice(0, 1).toUpperCase()}
                      />
                      <div className="profile-badge-preview-card__copy">
                        <strong>{badge.label}</strong>
                        <span>{formatProfileAbsoluteDate(badge.unlockedAt)}</span>
                      </div>
                    </div>
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
        </CompactAccordion>

        <section className="profile-stats-grid profile-stats-grid--dashboard">
          <article className="card stat-card">
            <span className="stat-card-label">Activites publiees</span>
            <strong className="stat-card-value">{stats.totalActivities}</strong>
          </article>
          <article className="card stat-card">
            <span className="stat-card-label">Seances realisees</span>
            <strong className="stat-card-value">{stats.completedWorkouts}</strong>
          </article>
          <article className="card stat-card">
            <span className="stat-card-label">Programmes crees</span>
            <strong className="stat-card-value">{stats.createdPrograms}</strong>
          </article>
          <article className="card stat-card">
            <span className="stat-card-label">Programmes termines</span>
            <strong className="stat-card-value">{stats.completedPrograms}</strong>
          </article>
          <article className="card stat-card">
            <span className="stat-card-label">Challenges crees</span>
            <strong className="stat-card-value">{stats.createdChallenges}</strong>
          </article>
          <article className="card stat-card">
            <span className="stat-card-label">Challenges rejoints</span>
            <strong className="stat-card-value">{stats.joinedChallenges}</strong>
          </article>
          <article className="card stat-card">
            <span className="stat-card-label">Distance totale</span>
            <strong className="stat-card-value">{stats.totalDistance > 0 ? formatDistance(stats.totalDistance) : '0 km'}</strong>
          </article>
          <article className="card stat-card">
            <span className="stat-card-label">Actyv Quotidien</span>
            <strong className="stat-card-value">{dailySummary.totalCompletions}</strong>
          </article>
        </section>

        <section className="profile-history-grid profile-dashboard-grid">
          <article className="card profile-history-card profile-history-card--daily">
            <div className="profile-section-heading">
              <div>
                <span className="section-kicker">Actyv Quotidien</span>
                <h2>Serie quotidienne</h2>
              </div>
            </div>

            <div className="profile-history-list">
              <div className="profile-history-item">
                <div className="profile-history-item__top">
                  <strong>Serie actuelle</strong>
                </div>
                <span>🔥 {dailySummary.currentStreak} jour{dailySummary.currentStreak > 1 ? 's' : ''}</span>
              </div>

              <div className="profile-history-item">
                <div className="profile-history-item__top">
                  <strong>Meilleure serie</strong>
                </div>
                <span>{dailySummary.bestStreak} jour{dailySummary.bestStreak > 1 ? 's' : ''}</span>
              </div>

              <div className="profile-history-item">
                <div className="profile-history-item__top">
                  <strong>Statut du jour</strong>
                </div>
                <span>{dailySummary.completedToday ? "Deja realisee aujourd'hui" : "A faire aujourd'hui"}</span>
              </div>

              <div className="profile-history-item">
                <div className="profile-history-item__top">
                  <strong>Total valide</strong>
                </div>
                <span>{dailySummary.totalCompletions} seance{dailySummary.totalCompletions > 1 ? 's' : ''}</span>
              </div>
            </div>
          </article>

          <article className="card profile-history-card profile-history-card--daily">
            <div className="profile-section-heading">
              <div>
                <span className="section-kicker">Pas</span>
                <h2>👣 Pas aujourd&apos;hui</h2>
              </div>
            </div>

            <div className="profile-history-list">
              <div className="profile-history-item">
                <div className="profile-history-item__top">
                  <strong>Pas du jour</strong>
                  <span className="profile-history-item__date">{stepsProgressPercent}%</span>
                </div>
                <span>{dailySteps.todaySteps.toLocaleString('fr-FR')} / {stepsGoal.toLocaleString('fr-FR')} pas</span>
                <div className="progress-track">
                  <div className="progress-fill" style={{ width: `${stepsProgressPercent}%` }} />
                </div>
              </div>

              <div className="profile-history-item">
                <div className="profile-history-item__top">
                  <strong>Cette semaine</strong>
                </div>
                <span>{dailySteps.weeklySteps.toLocaleString('fr-FR')} pas</span>
              </div>

              <div className="profile-history-item">
                <div className="profile-history-item__top">
                  <strong>Ce mois</strong>
                </div>
                <span>{dailySteps.monthlySteps.toLocaleString('fr-FR')} pas</span>
              </div>

              <div className="profile-history-item">
                <div className="profile-history-item__top">
                  <strong>Modifier mes pas du jour</strong>
                </div>
                <div className="profile-steps-input-row">
                  <input
                    type="number"
                    min={0}
                    inputMode="numeric"
                    value={stepsInput}
                    onChange={(event) => setStepsInput(event.target.value)}
                    aria-label="Modifier mes pas du jour"
                  />
                  <button
                    type="button"
                    className="button primary"
                    onClick={handleSaveTodaySteps}
                    disabled={savingSteps}
                  >
                    {savingSteps ? 'Enregistrement...' : 'Enregistrer'}
                  </button>
                </div>
                <span>
                  {stepsSupportMessage}
                </span>
                {stepsMessage && (
                  <p
                    className={`form-feedback ${stepsMessage.includes('Impossible') ? 'form-feedback--error' : 'form-feedback--success'}`}
                  >
                    {stepsMessage}
                  </p>
                )}
              </div>
            </div>
          </article>

          <CompactAccordion
            className="card profile-history-card compact-accordion--profile"
            kicker="Activite recente"
            title="Derniers evenements"
            summary={`${recentEvents.length} evenement${recentEvents.length > 1 ? 's' : ''}`}
          >
            <div className="profile-section-heading">
              <div>
                <span className="section-kicker">Activite recente</span>
                <h2>Derniers evenements</h2>
              </div>
            </div>

            <div className="profile-history-list">
              {recentEvents.length === 0 ? (
                <div className="profile-history-item">
                  <span>Aucun evenement recent pour le moment.</span>
                </div>
              ) : (
                recentEvents.map((event) => (
                  <div key={event.id} className="profile-history-item">
                    <div className="profile-history-item__top">
                      <strong>{event.title}</strong>
                      <span className="profile-history-item__date">{formatProfileRelativeDate(event.created_at)}</span>
                    </div>
                    <span>{event.subtitle}</span>
                  </div>
                ))
              )}
            </div>
          </CompactAccordion>

          <CompactAccordion
            className="card profile-history-card compact-accordion--profile"
            kicker="Musculation"
            title="Mes statistiques"
            summary={`${workoutGlobalStrengthStats.totalCompletedWorkouts} seance${workoutGlobalStrengthStats.totalCompletedWorkouts > 1 ? 's' : ''}`}
          >
            <div className="profile-section-heading">
              <div>
                <span className="section-kicker">Musculation</span>
                <h2>💪 Mes statistiques</h2>
              </div>
            </div>

            {workoutGlobalStrengthStats.totalCompletedWorkouts === 0 ? (
              <div className="profile-history-item">
                <span>Continue tes seances pour debloquer davantage de statistiques.</span>
              </div>
            ) : (
              <div className="profile-history-list">
                <div className="profile-history-item">
                  <div className="profile-history-item__top">
                    <strong>Seances realisees</strong>
                  </div>
                  <span>{workoutGlobalStrengthStats.totalCompletedWorkouts}</span>
                </div>

                <div className="profile-history-item">
                  <div className="profile-history-item__top">
                    <strong>Duree totale d&apos;entrainement</strong>
                  </div>
                  <span>{formatWorkoutDuration(workoutGlobalStrengthStats.totalDurationSeconds)}</span>
                </div>

                <div className="profile-history-item">
                  <div className="profile-history-item__top">
                    <strong>Series validees</strong>
                  </div>
                  <span>{workoutGlobalStrengthStats.totalValidatedSets}</span>
                </div>

                <div className="profile-history-item">
                  <div className="profile-history-item__top">
                    <strong>Volume total souleve</strong>
                  </div>
                  <span>{formatSessionVolumeLabel(workoutGlobalStrengthStats.totalVolumeKg)}</span>
                </div>

                <div className="profile-history-item">
                  <div className="profile-history-item__top">
                    <strong>Exercices differents</strong>
                  </div>
                  <span>{workoutGlobalStrengthStats.distinctExercisesCount}</span>
                </div>

                <div className="profile-history-item">
                  <div className="profile-history-item__top">
                    <strong>Derniere seance</strong>
                  </div>
                  <span>
                    {workoutGlobalStrengthStats.lastWorkout
                      ? `${workoutGlobalStrengthStats.lastWorkout.workout_name} - ${formatProfileRelativeDate(
                          workoutGlobalStrengthStats.lastWorkout.completed_at
                        )}`
                      : '-'}
                  </span>
                </div>

                <div className="profile-history-item">
                  <div className="profile-history-item__top">
                    <strong>Cette semaine</strong>
                  </div>
                  <span>
                    {workoutGlobalStrengthStats.weekSessions} seance{workoutGlobalStrengthStats.weekSessions > 1 ? 's' : ''} - {formatSessionVolumeLabel(workoutGlobalStrengthStats.weekVolumeKg)}
                  </span>
                </div>

                <div className="profile-history-item">
                  <div className="profile-history-item__top">
                    <strong>Ce mois</strong>
                  </div>
                  <span>
                    {workoutGlobalStrengthStats.monthSessions} seance{workoutGlobalStrengthStats.monthSessions > 1 ? 's' : ''} - {formatSessionVolumeLabel(workoutGlobalStrengthStats.monthVolumeKg)}
                  </span>
                </div>
              </div>
            )}
          </CompactAccordion>

          <CompactAccordion
            className="card profile-history-card compact-accordion--profile"
            kicker="Seances"
            title="Dernieres seances realisees"
            summary={`${recentWorkoutHistory.length} seance${recentWorkoutHistory.length > 1 ? 's' : ''}`}
          >
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
          </CompactAccordion>

          <CompactAccordion
            className="card profile-history-card compact-accordion--profile"
            kicker="Exercices"
            title="Top exercices"
            summary={`${workoutGlobalStrengthStats.topExercises.length} exercice${workoutGlobalStrengthStats.topExercises.length > 1 ? 's' : ''}`}
          >
            <div className="profile-section-heading">
              <div>
                <span className="section-kicker">Exercices</span>
                <h2>Top exercices</h2>
              </div>
            </div>

            {workoutGlobalStrengthStats.topExercises.length === 0 ? (
              <div className="profile-history-item">
                <span>Continue tes seances pour debloquer davantage de statistiques.</span>
              </div>
            ) : (
              <div className="profile-history-list">
                <div className="profile-history-item">
                  <div className="profile-history-item__top">
                    <strong>🏆 Exercice le plus pratique</strong>
                  </div>
                  <span>
                    {workoutGlobalStrengthStats.favoriteExercise
                      ? `${workoutGlobalStrengthStats.favoriteExercise.exerciseName} - ${workoutGlobalStrengthStats.favoriteExercise.workoutCount} seance${workoutGlobalStrengthStats.favoriteExercise.workoutCount > 1 ? 's' : ''}`
                      : '-'}
                  </span>
                </div>

                {workoutGlobalStrengthStats.topExercises.map((entry, index) => (
                  <div key={entry.exerciseName} className="profile-history-item">
                    <div className="profile-history-item__top">
                      <strong>{`${index + 1}. ${entry.exerciseName}`}</strong>
                    </div>
                    <span>{entry.workoutCount} seance{entry.workoutCount > 1 ? 's' : ''}</span>
                  </div>
                ))}
              </div>
            )}
          </CompactAccordion>

          <CompactAccordion
            className="card profile-history-card compact-accordion--profile"
            kicker="Profil sportif"
            title="Resume sportif"
            summary={`${workoutProfileSummary.totalCompletedWorkouts} seance${workoutProfileSummary.totalCompletedWorkouts > 1 ? 's' : ''}`}
          >
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
                    <strong>Sport le plus pratique</strong>
                  </div>
                  <span>
                    {workoutProfileSummary.mostPracticedSport
                      ? formatSportBadgeLabel(workoutProfileSummary.mostPracticedSport, 'Sport')
                      : '-'}
                  </span>
                </div>

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
              </div>
            )}
          </CompactAccordion>

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

              <Link href="/programs" className="profile-history-item">
                <div className="profile-history-item__top">
                  <strong>Mes programmes</strong>
                </div>
                <span>Suivi des cycles, calendrier et progression hebdomadaire.</span>
              </Link>

              <Link href="/session-du-jour" className="profile-history-item">
                <div className="profile-history-item__top">
                  <strong>Actyv Quotidien</strong>
                </div>
                <span>Relance la seance du jour et garde ta serie active.</span>
              </Link>

              <Link href="/stats" className="profile-history-item">
                <div className="profile-history-item__top">
                  <strong>Voir toutes mes statistiques</strong>
                </div>
                <span>Volume, calories, progression, records et stats par exercice.</span>
              </Link>
            </div>
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
                      <span className="progress-percent">{formatPercent(progressPercent)}</span>
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



