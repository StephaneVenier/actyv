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

export const FUTURE_STEP_BADGE_CODES = [
  'steps_5000',
  'steps_10000',
  'steps_20000',
  'weekly_steps_50000',
] as const;
