import { getLevelProgress, getUserTotalXp } from '@/lib/gamification';
import { supabase } from '@/lib/supabase';

type ProfileRow = {
  id: string;
  email: string | null;
  username: string | null;
  level: number | null;
  total_xp: number | null;
};

type ActivityRow = {
  id: string;
  sport: string | null;
  distance_km: number | null;
  duration_minutes: number | null;
  unit_type: string | null;
  unit_value: number | null;
  created_at: string | null;
};

type ActivityInteractionRow = {
  id: string;
  type: string;
  created_at: string | null;
};

type XpEventRow = {
  event_type: string | null;
  created_at: string | null;
};

type ChallengeRow = {
  id: string;
  created_by: string | null;
  is_deleted: boolean | null;
};

type ChallengeParticipantRow = {
  challenge_id: string;
  joined_at: string | null;
};

type ChallengeMemberRow = {
  challenge_id: string;
  user_id: string | null;
  user_email: string | null;
  joined_at: string | null;
};

type WorkoutHistoryRow = {
  id: string;
  workout_name: string;
  completed_at: string;
  duration_seconds: number | null;
  estimated_calories: number | null;
  total_volume: number | null;
  completed_exercises: number | null;
};

type TrainingProgramRow = {
  id: string;
  copied_from_program_id: string | null;
  visibility: string | null;
  created_at: string | null;
};

type TrainingProgramCompletionRow = {
  id: string;
  program_id: string;
  program_session_id: string;
  session_id: string | null;
  completed_at: string;
};

type DailyStepsRow = {
  step_date: string;
  steps_count: number | null;
  source: string | null;
  synced_at: string | null;
};

export type UserStatisticsSportRow = {
  sport: string;
  count: number;
  distanceKm: number;
  durationMinutes: number;
};

export type UserStatisticsWorkoutRow = {
  id: string;
  workoutName: string;
  completedAt: string;
  durationSeconds: number;
  estimatedCalories: number;
  totalVolume: number;
  completedExercises: number;
};

export type UserStatisticsSummary = {
  profile: {
    id: string;
    email: string | null;
    username: string | null;
    level: number;
    totalXp: number;
    nextLevelXp: number;
  };
  overview: {
    totalActivities: number;
    totalDistanceKm: number;
    totalDurationMinutes: number;
    totalReps: number;
    activeDays: number;
    activitiesBySport: UserStatisticsSportRow[];
  };
  movement: {
    todaySteps: number;
    totalSteps: number;
    weeklySteps: number;
    monthlySteps: number;
    bestDailySteps: number;
    averageDailySteps: number;
    activeStepDays: number;
    healthConnectSyncs: number;
    totalStepsForBadges: number;
    maxDailyStepsForBadges: number;
  };
  sessions: {
    createdSessions: number;
    completedWorkouts: number;
    totalWorkoutDurationMinutes: number;
    totalCalories: number;
    totalVolumeKg: number;
    totalExercisesCompleted: number;
    recentWorkouts: UserStatisticsWorkoutRow[];
  };
  programs: {
    createdPrograms: number;
    joinedPrograms: number;
    completedPrograms: number;
    completedProgramSessions: number;
    totalProgramSessions: number;
  };
  challenges: {
    createdChallenges: number;
    joinedChallenges: number;
    completedChallenges: number;
  };
  social: {
    likesGiven: number;
    likesReceived: number;
    boostsGiven: number;
    boostsReceived: number;
  };
};

function normalizeDateKey(date: Date | string | null | undefined) {
  if (!date) return null;
  const parsed = typeof date === 'string' ? new Date(date) : date;
  if (Number.isNaN(parsed.getTime())) return null;
  return `${parsed.getFullYear()}-${`${parsed.getMonth() + 1}`.padStart(2, '0')}-${`${parsed.getDate()}`.padStart(2, '0')}`;
}

function normalizeNumber(value: number | string | null | undefined) {
  const normalized = Number(value || 0);
  return Number.isFinite(normalized) ? normalized : 0;
}

function countDistinct(values: Array<string | null | undefined>) {
  return new Set(values.filter((value): value is string => Boolean(value))).size;
}

function getLocalIsoDate(date = new Date()) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getWeekStartIsoDate(date = new Date()) {
  const nextDate = new Date(date);
  const day = nextDate.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  nextDate.setDate(nextDate.getDate() + diff);
  return getLocalIsoDate(nextDate);
}

function getMonthStartIsoDate(date = new Date()) {
  return getLocalIsoDate(new Date(date.getFullYear(), date.getMonth(), 1));
}

/**
 * Centralise les statistiques utilisateur pour servir la page Statistiques
 * et, à terme, les futures règles de badges sans recalcule par écran.
 */
export async function loadUserStatistics(userId: string, userEmail: string | null) {
  const [profileResponse, activitiesResponse, interactionsGivenResponse, challengesResponse, participantsResponse, membersResponse, workoutHistoryResponse, trainingProgramsResponse, trainingProgramCompletionsResponse, trainingSessionsResponse, dailyStepsResponse, xpEventsResponse] =
    await Promise.all([
      supabase.from('profiles').select('id, email, username, level, total_xp').eq('id', userId).maybeSingle(),
      supabase
        .from('activities')
        .select('id, sport, distance_km, duration_minutes, unit_type, unit_value, created_at')
        .or(`user_id.eq.${userId}${userEmail ? `,user_email.eq.${userEmail}` : ''}`),
      supabase
        .from('activity_interactions')
        .select('id, type, created_at')
        .eq('user_id', userId)
        .in('type', ['like', 'boost']),
      supabase.from('challenges').select('id, created_by, is_deleted').eq('created_by', userId),
      supabase.from('challenge_participants').select('challenge_id, joined_at').eq('user_id', userId),
      userEmail
        ? supabase.from('challenge_members').select('challenge_id, user_id, user_email, joined_at').or(`user_id.eq.${userId},user_email.eq.${userEmail}`)
        : supabase.from('challenge_members').select('challenge_id, user_id, user_email, joined_at').eq('user_id', userId),
      supabase
        .from('workout_sessions_history')
        .select('id, workout_name, completed_at, duration_seconds, estimated_calories, total_volume, completed_exercises')
        .eq('user_id', userId)
        .order('completed_at', { ascending: false }),
      supabase
        .from('training_programs')
        .select('id, copied_from_program_id, visibility, created_at')
        .eq('user_id', userId),
      supabase
        .from('training_program_completions')
        .select('id, program_id, program_session_id, session_id, completed_at')
        .eq('user_id', userId),
      supabase.from('training_sessions').select('id, created_at').eq('user_id', userId),
      supabase
        .from('daily_steps')
        .select('step_date, steps_count, source, synced_at')
        .eq('user_id', userId)
        .order('step_date', { ascending: false }),
      supabase
        .from('xp_events')
        .select('event_type, created_at')
        .eq('user_id', userId)
        .in('event_type', ['challenge_completed', 'program_completed']),
    ]);

  const profile = profileResponse.data as ProfileRow | null;
  const activities = (activitiesResponse.data as ActivityRow[] | null) || [];
  const interactionsGiven = (interactionsGivenResponse.data as ActivityInteractionRow[] | null) || [];
  const challenges = (challengesResponse.data as ChallengeRow[] | null) || [];
  const participants = (participantsResponse.data as ChallengeParticipantRow[] | null) || [];
  const members = (membersResponse.data as ChallengeMemberRow[] | null) || [];
  const workoutHistory = (workoutHistoryResponse.data as WorkoutHistoryRow[] | null) || [];
  const trainingPrograms = (trainingProgramsResponse.data as TrainingProgramRow[] | null) || [];
  const trainingProgramCompletions = (trainingProgramCompletionsResponse.data as TrainingProgramCompletionRow[] | null) || [];
  const trainingSessions = (trainingSessionsResponse.data as Array<{ id: string; created_at: string | null }> | null) || [];
  const dailySteps = (dailyStepsResponse.data as DailyStepsRow[] | null) || [];
  const xpEvents = (xpEventsResponse.data as XpEventRow[] | null) || [];

  const activityRows = activities.map((activity) => ({
    ...activity,
    sport: (activity.sport || '').trim(),
  }));

  const totalActivities = activityRows.length;
  const totalDistanceKm = activityRows.reduce((sum, activity) => {
    const isDistance =
      (activity.unit_type || (activity.distance_km !== null ? 'distance' : null)) === 'distance';
    return isDistance ? sum + normalizeNumber(activity.unit_value ?? activity.distance_km ?? 0) : sum;
  }, 0);
  const totalDurationMinutes = activityRows.reduce((sum, activity) => {
    const isDuration = (activity.unit_type || (activity.duration_minutes !== null ? 'duration' : null)) === 'duration';
    return isDuration ? sum + normalizeNumber(activity.unit_value ?? activity.duration_minutes ?? 0) : sum;
  }, 0);
  const totalReps = activityRows.reduce((sum, activity) => {
    return activity.unit_type === 'reps' ? sum + normalizeNumber(activity.unit_value) : sum;
  }, 0);

  const activitiesBySportMap = new Map<string, UserStatisticsSportRow>();
  for (const activity of activityRows) {
    const sport = activity.sport || 'Sport non renseigne';
    const current = activitiesBySportMap.get(sport) || {
      sport,
      count: 0,
      distanceKm: 0,
      durationMinutes: 0,
    };
    current.count += 1;
    if ((activity.unit_type || (activity.distance_km !== null ? 'distance' : null)) === 'distance') {
      current.distanceKm += normalizeNumber(activity.unit_value ?? activity.distance_km ?? 0);
    }
    if ((activity.unit_type || (activity.duration_minutes !== null ? 'duration' : null)) === 'duration') {
      current.durationMinutes += normalizeNumber(activity.unit_value ?? activity.duration_minutes ?? 0);
    }
    activitiesBySportMap.set(sport, current);
  }

  const activitiesBySport = [...activitiesBySportMap.values()].sort((left, right) => {
    if (right.count !== left.count) return right.count - left.count;
    return left.sport.localeCompare(right.sport, 'fr');
  });

  const totalWorkoutDurationSeconds = workoutHistory.reduce(
    (sum, workout) => sum + normalizeNumber(workout.duration_seconds),
    0
  );
  const totalWorkoutCalories = workoutHistory.reduce(
    (sum, workout) => sum + normalizeNumber(workout.estimated_calories),
    0
  );
  const totalWorkoutVolume = workoutHistory.reduce((sum, workout) => sum + normalizeNumber(workout.total_volume), 0);
  const totalExercisesCompleted = workoutHistory.reduce(
    (sum, workout) => sum + normalizeNumber(workout.completed_exercises),
    0
  );
  const recentWorkouts = workoutHistory.slice(0, 4).map((workout) => ({
    id: workout.id,
    workoutName: workout.workout_name,
    completedAt: workout.completed_at,
    durationSeconds: normalizeNumber(workout.duration_seconds),
    estimatedCalories: normalizeNumber(workout.estimated_calories),
    totalVolume: normalizeNumber(workout.total_volume),
    completedExercises: normalizeNumber(workout.completed_exercises),
  }));

  const createdChallenges = challenges.filter((challenge) => challenge.created_by === userId && !challenge.is_deleted).length;
  const joinedChallenges = new Set(
    [
      ...participants.map((entry) => entry.challenge_id),
      ...members.map((entry) => entry.challenge_id),
    ].filter((value): value is string => Boolean(value))
  ).size;
  const completedChallenges = xpEvents.filter((event) => event.event_type === 'challenge_completed').length;

  const createdPrograms = trainingPrograms.filter((program) => !program.copied_from_program_id).length;
  const joinedPrograms = trainingPrograms.filter((program) => Boolean(program.copied_from_program_id)).length;
  const completedPrograms = xpEvents.filter((event) => event.event_type === 'program_completed').length;
  const completedProgramSessions = trainingProgramCompletions.length;
  const totalProgramSessions = trainingSessions.length;

  const likesGiven = interactionsGiven.filter((interaction) => interaction.type === 'like').length;
  const boostsGiven = interactionsGiven.filter((interaction) => interaction.type === 'boost').length;

  const ownedActivityIds = activityRows.map((activity) => activity.id);
  let likesReceived = 0;
  let boostsReceived = 0;

  if (ownedActivityIds.length > 0) {
    const interactionsReceivedResponse = await supabase
      .from('activity_interactions')
      .select('id, type')
      .in('activity_id', ownedActivityIds);

    if (!interactionsReceivedResponse.error) {
      const interactionsReceived = (interactionsReceivedResponse.data as Array<{ id: string; type: string }> | null) || [];
      likesReceived = interactionsReceived.filter((interaction) => interaction.type === 'like').length;
      boostsReceived = interactionsReceived.filter((interaction) => interaction.type === 'boost').length;
    } else {
      console.error('Erreur stats interactions recues :', interactionsReceivedResponse.error);
    }
  }

  const totalXpResult = await getUserTotalXp(userId, profile?.total_xp || 0);
  const totalXp = totalXpResult.totalXp;
  const levelProgress = getLevelProgress(totalXp);
  const level = levelProgress.level;

  const todayIso = getLocalIsoDate();
  const weekStartIso = getWeekStartIsoDate();
  const monthStartIso = getMonthStartIsoDate();

  const todaySteps = dailySteps.find((entry) => entry.step_date === todayIso)?.steps_count || 0;
  const totalSteps = dailySteps.reduce((sum, entry) => sum + normalizeNumber(entry.steps_count), 0);
  const bestDailySteps = dailySteps.reduce((best, entry) => Math.max(best, normalizeNumber(entry.steps_count)), 0);
  const activeStepEntries = dailySteps.filter((entry) => normalizeNumber(entry.steps_count) > 0);
  const averageDailySteps = activeStepEntries.length > 0 ? Math.round(totalSteps / activeStepEntries.length) : 0;
  const activeStepDays = dailySteps.length;
  const healthConnectSyncs = dailySteps.filter((entry) => entry.source === 'health_connect').length;
  const weeklySteps = dailySteps
    .filter((entry) => entry.step_date >= weekStartIso && entry.step_date <= todayIso)
    .reduce((sum, entry) => sum + normalizeNumber(entry.steps_count), 0);
  const monthlySteps = dailySteps
    .filter((entry) => entry.step_date >= monthStartIso && entry.step_date <= todayIso)
    .reduce((sum, entry) => sum + normalizeNumber(entry.steps_count), 0);

  const activeDays = countDistinct([
    ...activityRows.map((entry) => normalizeDateKey(entry.created_at)),
    ...workoutHistory.map((entry) => normalizeDateKey(entry.completed_at)),
    ...dailySteps.map((entry) => entry.step_date),
    ...trainingProgramCompletions.map((entry) => normalizeDateKey(entry.completed_at)),
    ...participants.map((entry) => normalizeDateKey(entry.joined_at)),
    ...members.map((entry) => normalizeDateKey(entry.joined_at)),
  ]);

  return {
    profile: {
      id: profile?.id || userId,
      email: profile?.email ?? userEmail,
      username: profile?.username || null,
      level,
      totalXp,
      nextLevelXp: levelProgress.xpToNextLevel,
    },
    overview: {
      totalActivities,
      totalDistanceKm,
      totalDurationMinutes: totalDurationMinutes + Math.round(totalWorkoutDurationSeconds / 60),
      totalReps,
      activeDays,
      activitiesBySport,
    },
    movement: {
      todaySteps,
      totalSteps,
      weeklySteps,
      monthlySteps,
      bestDailySteps,
      averageDailySteps,
      activeStepDays,
      healthConnectSyncs,
      totalStepsForBadges: totalSteps,
      maxDailyStepsForBadges: bestDailySteps,
    },
    sessions: {
      createdSessions: trainingSessions.length,
      completedWorkouts: workoutHistory.length,
      totalWorkoutDurationMinutes: Math.round(totalWorkoutDurationSeconds / 60),
      totalCalories: totalWorkoutCalories,
      totalVolumeKg: totalWorkoutVolume,
      totalExercisesCompleted,
      recentWorkouts,
    },
    programs: {
      createdPrograms,
      joinedPrograms,
      completedPrograms,
      completedProgramSessions,
      totalProgramSessions,
    },
    challenges: {
      createdChallenges,
      joinedChallenges,
      completedChallenges,
    },
    social: {
      likesGiven,
      likesReceived,
      boostsGiven,
      boostsReceived,
    },
  };
}
