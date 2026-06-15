import { supabase } from '@/lib/supabase';

export type DailyStepsEntry = {
  id: string;
  user_id: string;
  step_date: string;
  steps_count: number;
  source: string | null;
  synced_at: string | null;
  distance_meters: number | null;
  walk_run_distance_meters: number | null;
  bike_distance_meters: number | null;
  created_at: string | null;
  updated_at: string | null;
};

export type StepsPeriodSummary = {
  totalSteps: number;
  entries: DailyStepsEntry[];
};

export type StepsRecordSummary = {
  stepsCount: number;
  stepDate: string | null;
  syncedAt: string | null;
  source: string | null;
};

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

function normalizeStepsCount(steps: number) {
  if (!Number.isFinite(Number(steps))) return 0;
  return Math.max(0, Math.trunc(Number(steps)));
}

function getLocalDateKey(date: Date) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function addLocalDays(date: Date, days: number) {
  const nextDate = new Date(date);
  nextDate.setDate(nextDate.getDate() + days);
  return nextDate;
}

export async function getTodaySteps(userId: string) {
  const today = getLocalIsoDate();
  const { data, error } = await supabase
    .from('daily_steps')
    .select(
      'id, user_id, step_date, steps_count, source, synced_at, distance_meters, walk_run_distance_meters, bike_distance_meters, created_at, updated_at'
    )
    .eq('user_id', userId)
    .eq('step_date', today)
    .maybeSingle();

  if (error) throw error;
  return (data as DailyStepsEntry | null) || null;
}

export async function upsertTodaySteps(userId: string, steps: number) {
  return upsertDailyStepsEntry(userId, {
    stepsCount: steps,
    source: 'manual',
    syncedAt: null,
    distanceMeters: null,
    walkRunDistanceMeters: null,
    bikeDistanceMeters: null,
  });
}

export type UpsertDailyStepsInput = {
  stepsCount: number;
  source: 'manual' | 'health_connect';
  syncedAt: string | null;
  distanceMeters: number | null;
  walkRunDistanceMeters: number | null;
  bikeDistanceMeters: number | null;
};

export async function upsertDailyStepsEntry(userId: string, input: UpsertDailyStepsInput) {
  const today = getLocalIsoDate();
  const normalizedSteps = normalizeStepsCount(input.stepsCount);
  const { data, error } = await supabase
    .from('daily_steps')
    .upsert(
      {
        user_id: userId,
        step_date: today,
        steps_count: normalizedSteps,
        source: input.source,
        synced_at: input.syncedAt,
        distance_meters: input.distanceMeters,
        walk_run_distance_meters: input.walkRunDistanceMeters,
        bike_distance_meters: input.bikeDistanceMeters,
        updated_at: new Date().toISOString(),
      },
      {
        onConflict: 'user_id,step_date',
      }
    )
    .select(
      'id, user_id, step_date, steps_count, source, synced_at, distance_meters, walk_run_distance_meters, bike_distance_meters, created_at, updated_at'
    )
    .single();

  if (error) throw error;
  return data as DailyStepsEntry;
}

export async function getWeeklySteps(userId: string): Promise<StepsPeriodSummary> {
  const fromDate = getWeekStartIsoDate();
  const { data, error } = await supabase
    .from('daily_steps')
    .select(
      'id, user_id, step_date, steps_count, source, synced_at, distance_meters, walk_run_distance_meters, bike_distance_meters, created_at, updated_at'
    )
    .eq('user_id', userId)
    .gte('step_date', fromDate)
    .order('step_date', { ascending: false });

  if (error) throw error;

  const entries = (data as DailyStepsEntry[] | null) || [];
  return {
    totalSteps: entries.reduce((total, entry) => total + normalizeStepsCount(entry.steps_count), 0),
    entries,
  };
}

export async function getMonthlySteps(userId: string): Promise<StepsPeriodSummary> {
  const fromDate = getMonthStartIsoDate();
  const { data, error } = await supabase
    .from('daily_steps')
    .select(
      'id, user_id, step_date, steps_count, source, synced_at, distance_meters, walk_run_distance_meters, bike_distance_meters, created_at, updated_at'
    )
    .eq('user_id', userId)
    .gte('step_date', fromDate)
    .order('step_date', { ascending: false });

  if (error) throw error;

  const entries = (data as DailyStepsEntry[] | null) || [];
  return {
    totalSteps: entries.reduce((total, entry) => total + normalizeStepsCount(entry.steps_count), 0),
    entries,
  };
}

export async function getBestDailySteps(userId: string): Promise<StepsRecordSummary> {
  const { data, error } = await supabase
    .from('daily_steps')
    .select('step_date, steps_count, synced_at, source')
    .eq('user_id', userId)
    .order('steps_count', { ascending: false })
    .order('step_date', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;

  return {
    stepsCount: normalizeStepsCount((data as DailyStepsEntry | null)?.steps_count ?? 0),
    stepDate: (data as DailyStepsEntry | null)?.step_date || null,
    syncedAt: (data as DailyStepsEntry | null)?.synced_at || null,
    source: (data as DailyStepsEntry | null)?.source || null,
  };
}

export function getActiveStepStreak(entries: DailyStepsEntry[], minimumSteps = 5000) {
  const stepsByDate = new Map<string, number>();

  for (const entry of entries) {
    stepsByDate.set(entry.step_date, normalizeStepsCount(entry.steps_count));
  }

  let streakDays = 0;
  let cursor = new Date();

  while (true) {
    const dateKey = getLocalDateKey(cursor);
    const stepsCount = stepsByDate.get(dateKey) || 0;

    if (stepsCount < minimumSteps) {
      break;
    }

    streakDays += 1;
    cursor = addLocalDays(cursor, -1);
  }

  return streakDays;
}

export const FUTURE_STEP_BADGE_CODES = [
  'first_health_connect_sync',
  'steps_5000_day',
  'steps_10000_day',
  'steps_20000_day',
  'steps_10000_total',
  'steps_50000_total',
  'steps_100000_total',
] as const;
