import type { Route } from 'next';
import { supabase } from '@/lib/supabase';

export type HistoryEventType = 'activity' | 'session' | 'mastery';
export type HistoryEventAccent = 'sport' | 'workout' | 'mastery';

export type HistoryEvent = {
  id: string;
  type: HistoryEventType;
  timestamp: string;
  title: string;
  subtitle: string;
  metaLabel: string;
  accent: HistoryEventAccent;
  badgeLabel: string;
  href?: Route | null;
  sport?: string | null;
  searchText: string;
  distanceKm?: number | null;
};

export type ActivityHistoryRow = {
  id: string;
  sport: string | null;
  activity_name: string | null;
  distance_km: number | null;
  duration_minutes: number | null;
  elevation_gain_m: number | null;
  occurred_at: string | null;
  created_at: string | null;
};

export type WorkoutHistoryRow = {
  id: string;
  workout_id: string | null;
  workout_name: string | null;
  duration_seconds: number | null;
  total_volume: number | null;
  completed_exercises: number | null;
  completed_at: string | null;
};

export type MasteryUnlockHistoryRow = {
  id: string;
  mastery_id: string;
  level: number;
  xp_awarded: number | null;
  unlocked_at: string | null;
};

export type MasteryLookupRow = {
  id: string;
  slug: string;
  name: string;
};

export type TrainingSessionSportRow = {
  id: string;
  sport: string | null;
};

export type HistoryWindowResult = {
  events: HistoryEvent[];
  hasMore: boolean;
};

type LoadHistoryWindowInput = {
  userId: string;
  userEmail: string | null;
  startInclusiveIso: string;
  endExclusiveIso: string;
};

export function normalizeHistoryText(value: string | null | undefined) {
  return (value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

export function formatHistoryNumber(value: number) {
  return new Intl.NumberFormat('fr-FR').format(Math.max(0, Math.round(value)));
}

export function formatHistoryDistanceValue(value: number) {
  return new Intl.NumberFormat('fr-FR', {
    minimumFractionDigits: value >= 100 ? 0 : 1,
    maximumFractionDigits: 1,
  }).format(Math.max(0, value));
}

export function formatHistoryDistanceKm(value: number | null) {
  if (!Number.isFinite(Number(value)) || Number(value) <= 0) return null;
  return `${formatHistoryDistanceValue(Number(value))} km`;
}

export function formatHistoryDurationMinutes(value: number | null) {
  if (!Number.isFinite(Number(value)) || Number(value) <= 0) return null;

  const totalMinutes = Math.round(Number(value));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours <= 0) {
    return `${minutes} min`;
  }

  return `${hours}h${minutes.toString().padStart(2, '0')}`;
}

export function formatHistoryDurationSeconds(value: number | null) {
  if (!Number.isFinite(Number(value)) || Number(value) <= 0) return null;
  return formatHistoryDurationMinutes(Math.round(Number(value) / 60));
}

export function formatHistoryElevation(value: number | null) {
  if (!Number.isFinite(Number(value)) || Number(value) <= 0) return null;
  return `+${formatHistoryNumber(Number(value))} m D+`;
}

function formatHistoryPace(distanceKm: number | null, durationMinutes: number | null) {
  const distance = Number(distanceKm || 0);
  const minutes = Number(durationMinutes || 0);

  if (!Number.isFinite(distance) || !Number.isFinite(minutes) || distance <= 0 || minutes <= 0) {
    return null;
  }

  const totalSecondsPerKm = Math.round((minutes * 60) / distance);
  const paceMinutes = Math.floor(totalSecondsPerKm / 60);
  const paceSeconds = totalSecondsPerKm % 60;
  return `${paceMinutes}'${paceSeconds.toString().padStart(2, '0')}" /km`;
}

function formatHistorySpeed(distanceKm: number | null, durationMinutes: number | null) {
  const distance = Number(distanceKm || 0);
  const minutes = Number(durationMinutes || 0);

  if (!Number.isFinite(distance) || !Number.isFinite(minutes) || distance <= 0 || minutes <= 0) {
    return null;
  }

  const speed = distance / (minutes / 60);
  return `${new Intl.NumberFormat('fr-FR', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(speed)} km/h`;
}

export function getActivityMetricLabel(sport: string | null, distanceKm: number | null, durationMinutes: number | null) {
  const normalizedSport = normalizeHistoryText(sport);
  const usesPace =
    normalizedSport.includes('course') ||
    normalizedSport.includes('trail') ||
    normalizedSport.includes('marche') ||
    normalizedSport.includes('walk') ||
    normalizedSport.includes('randon');

  return usesPace ? formatHistoryPace(distanceKm, durationMinutes) : formatHistorySpeed(distanceKm, durationMinutes);
}

export function formatHistoryRelativeDay(timestamp: string) {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return '';

  const now = new Date();
  const todayKey = `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}`;
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const yesterdayKey = `${yesterday.getFullYear()}-${yesterday.getMonth()}-${yesterday.getDate()}`;
  const currentKey = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;

  if (currentKey === todayKey) return "Aujourd'hui";
  if (currentKey === yesterdayKey) return 'Hier';

  return new Intl.DateTimeFormat('fr-FR', {
    day: '2-digit',
    month: 'short',
  }).format(date);
}

export function formatHistoryTime(timestamp: string) {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return '';

  return new Intl.DateTimeFormat('fr-FR', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

export function formatHistoryMetaLabel(timestamp: string) {
  return `${formatHistoryRelativeDay(timestamp)} · ${formatHistoryTime(timestamp)}`;
}

export function getHistoryMonthKey(timestamp: string) {
  const date = new Date(timestamp);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

export function formatHistoryMonthLabel(monthKey: string) {
  const [year, month] = monthKey.split('-').map(Number);
  const date = new Date(year, Math.max(0, month - 1), 1);
  return new Intl.DateTimeFormat('fr-FR', {
    month: 'long',
    year: 'numeric',
  })
    .format(date)
    .toUpperCase();
}

function getEventSearchText(parts: Array<string | null | undefined>) {
  return normalizeHistoryText(parts.filter(Boolean).join(' '));
}

export function buildActivityHistoryEvent(row: ActivityHistoryRow): HistoryEvent | null {
  const timestamp = row.occurred_at || row.created_at;
  if (!timestamp) return null;

  const details = [
    formatHistoryDistanceKm(row.distance_km),
    formatHistoryDurationMinutes(row.duration_minutes),
    getActivityMetricLabel(row.sport, row.distance_km, row.duration_minutes),
    formatHistoryElevation(row.elevation_gain_m),
  ].filter((entry): entry is string => Boolean(entry));

  const sportLabel = row.sport?.trim() || 'Activite';
  const title = row.activity_name?.trim() || sportLabel;
  const subtitle = details.join(' • ') || 'Activite enregistree';

  return {
    id: `activity-${row.id}`,
    type: 'activity',
    timestamp,
    title,
    subtitle,
    metaLabel: formatHistoryMetaLabel(timestamp),
    accent: 'sport',
    badgeLabel: sportLabel,
    href: null,
    sport: row.sport?.trim() || null,
    searchText: getEventSearchText([title, subtitle, sportLabel]),
    distanceKm: Number.isFinite(Number(row.distance_km)) ? Number(row.distance_km) : null,
  };
}

export function buildWorkoutHistoryEvent(
  row: WorkoutHistoryRow,
  workoutSportsById: Record<string, string | null>
): HistoryEvent | null {
  const timestamp = row.completed_at;
  if (!timestamp) return null;

  const sport = (row.workout_id ? workoutSportsById[row.workout_id] : null) || null;
  const exerciseCount = Number(row.completed_exercises || 0);
  const details = [
    sport ? `Seance ${sport}` : null,
    Number(row.total_volume || 0) > 0 ? `+${formatHistoryNumber(Number(row.total_volume || 0))} kg de volume` : null,
    exerciseCount > 0 ? `${formatHistoryNumber(exerciseCount)} exercice${exerciseCount > 1 ? 's' : ''}` : null,
    formatHistoryDurationSeconds(row.duration_seconds),
  ].filter((entry): entry is string => Boolean(entry));

  const title = row.workout_name?.trim() || (sport ? `Seance ${sport}` : 'Seance terminee');
  const subtitle = details.join(' • ') || 'Seance enregistree';

  return {
    id: `session-${row.id}`,
    type: 'session',
    timestamp,
    title,
    subtitle,
    metaLabel: formatHistoryMetaLabel(timestamp),
    accent: 'workout',
    badgeLabel: sport?.trim() || 'Seance',
    href: (row.workout_id ? `/sessions/${row.workout_id}` : null) as Route | null,
    sport,
    searchText: getEventSearchText([title, subtitle, sport]),
  };
}

export function buildMasteryHistoryEvent(
  row: MasteryUnlockHistoryRow,
  masteriesById: Map<string, MasteryLookupRow>
): HistoryEvent | null {
  const timestamp = row.unlocked_at;
  if (!timestamp) return null;

  const mastery = masteriesById.get(row.mastery_id);
  const masteryName = mastery?.name || 'Maitrise';
  const title = `Maitrise ${masteryName}`;
  const subtitle = `Niveau ${row.level} atteint${Number(row.xp_awarded || 0) > 0 ? ` • +${formatHistoryNumber(Number(row.xp_awarded || 0))} XP` : ''}`;

  return {
    id: `mastery-${row.id}`,
    type: 'mastery',
    timestamp,
    title,
    subtitle,
    metaLabel: formatHistoryMetaLabel(timestamp),
    accent: 'mastery',
    badgeLabel: 'Maitrise',
    href: (mastery?.slug ? `/maitrises/${mastery.slug}` : null) as Route | null,
    sport: null,
    searchText: getEventSearchText([title, subtitle, mastery?.name]),
  };
}

async function hasOlderActivityEvents(userId: string, userEmail: string | null, startInclusiveIso: string) {
  const query = supabase
    .from('activities')
    .select('id')
    .lt('occurred_at', startInclusiveIso)
    .limit(1);

  const response = userEmail ? query.or(`user_id.eq.${userId},user_email.eq.${userEmail}`) : query.eq('user_id', userId);
  const { data, error } = await response;

  if (error) {
    console.error('Erreur verification older activities history :', error);
    return false;
  }

  return ((data as Array<{ id: string }> | null) || []).length > 0;
}

export async function loadHistoryWindow({
  userId,
  userEmail,
  startInclusiveIso,
  endExclusiveIso,
}: LoadHistoryWindowInput): Promise<HistoryWindowResult> {
  const [activitiesResponse, workoutsResponse, unlocksResponse] = await Promise.all([
    (userEmail
      ? supabase
          .from('activities')
          .select('id, sport, activity_name, distance_km, duration_minutes, elevation_gain_m, occurred_at, created_at')
          .or(`user_id.eq.${userId},user_email.eq.${userEmail}`)
      : supabase
          .from('activities')
          .select('id, sport, activity_name, distance_km, duration_minutes, elevation_gain_m, occurred_at, created_at')
          .eq('user_id', userId))
      .gte('occurred_at', startInclusiveIso)
      .lt('occurred_at', endExclusiveIso)
      .order('occurred_at', { ascending: false }),
    supabase
      .from('workout_sessions_history')
      .select('id, workout_id, workout_name, duration_seconds, total_volume, completed_exercises, completed_at')
      .eq('user_id', userId)
      .gte('completed_at', startInclusiveIso)
      .lt('completed_at', endExclusiveIso)
      .order('completed_at', { ascending: false }),
    supabase
      .from('mastery_level_unlocks')
      .select('id, mastery_id, level, xp_awarded, unlocked_at')
      .eq('user_id', userId)
      .gte('unlocked_at', startInclusiveIso)
      .lt('unlocked_at', endExclusiveIso)
      .order('unlocked_at', { ascending: false }),
  ]);

  if (activitiesResponse.error) {
    console.error('Erreur historique activites :', activitiesResponse.error);
  }
  if (workoutsResponse.error) {
    console.error('Erreur historique seances :', workoutsResponse.error);
  }
  if (unlocksResponse.error) {
    console.error('Erreur historique maitrises :', unlocksResponse.error);
  }

  const activities = ((activitiesResponse.data as ActivityHistoryRow[] | null) || [])
    .map(buildActivityHistoryEvent)
    .filter((item): item is HistoryEvent => Boolean(item));

  const workoutRows = (workoutsResponse.data as WorkoutHistoryRow[] | null) || [];
  const workoutIds = Array.from(
    new Set(workoutRows.map((entry) => entry.workout_id).filter((workoutId): workoutId is string => Boolean(workoutId)))
  );

  let workoutSportsById: Record<string, string | null> = {};

  if (workoutIds.length > 0) {
    const { data: workoutSportsRows, error: workoutSportsError } = await supabase
      .from('training_sessions')
      .select('id, sport')
      .in('id', workoutIds);

    if (workoutSportsError) {
      console.error('Erreur historique sports seances :', workoutSportsError);
    } else {
      workoutSportsById = Object.fromEntries(
        (((workoutSportsRows as TrainingSessionSportRow[] | null) || [])).map((row) => [row.id, row.sport])
      );
    }
  }

  const workouts = workoutRows
    .map((row) => buildWorkoutHistoryEvent(row, workoutSportsById))
    .filter((item): item is HistoryEvent => Boolean(item));

  const unlockRows = (unlocksResponse.data as MasteryUnlockHistoryRow[] | null) || [];
  const masteryIds = Array.from(new Set(unlockRows.map((entry) => entry.mastery_id).filter(Boolean)));
  let masteriesById = new Map<string, MasteryLookupRow>();

  if (masteryIds.length > 0) {
    const { data: masteriesRows, error: masteriesError } = await supabase
      .from('masteries')
      .select('id, slug, name')
      .in('id', masteryIds);

    if (masteriesError) {
      console.error('Erreur historique lookup maitrises :', masteriesError);
    } else {
      masteriesById = new Map(
        (((masteriesRows as MasteryLookupRow[] | null) || []).map((entry) => [entry.id, entry]))
      );
    }
  }

  const unlocks = unlockRows
    .map((row) => buildMasteryHistoryEvent(row, masteriesById))
    .filter((item): item is HistoryEvent => Boolean(item));

  const [olderActivities, olderWorkouts, olderUnlocks] = await Promise.all([
    hasOlderActivityEvents(userId, userEmail, startInclusiveIso),
    supabase
      .from('workout_sessions_history')
      .select('id')
      .eq('user_id', userId)
      .lt('completed_at', startInclusiveIso)
      .limit(1),
    supabase
      .from('mastery_level_unlocks')
      .select('id')
      .eq('user_id', userId)
      .lt('unlocked_at', startInclusiveIso)
      .limit(1),
  ]);

  if (olderWorkouts.error) {
    console.error('Erreur verification older workouts history :', olderWorkouts.error);
  }
  if (olderUnlocks.error) {
    console.error('Erreur verification older mastery history :', olderUnlocks.error);
  }

  return {
    events: [...activities, ...workouts, ...unlocks].sort(
      (left, right) => new Date(right.timestamp).getTime() - new Date(left.timestamp).getTime()
    ),
    hasMore:
      olderActivities ||
      (((olderWorkouts.data as Array<{ id: string }> | null) || []).length > 0) ||
      (((olderUnlocks.data as Array<{ id: string }> | null) || []).length > 0),
  };
}
