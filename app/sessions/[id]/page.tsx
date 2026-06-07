'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { AppShell } from '@/components/AppShell';
import { CompactExerciseCard, SessionSummaryHeader } from '@/components/session-compact-ui';
import { SessionExerciseIcon } from '@/components/session-exercise-icon';
import { queuePendingToast } from '@/components/ToastProvider';
import { formatSportBadgeLabel, getSportBadgeClassName } from '@/components/sport-badge';
import {
  formatBlockMainValue,
  formatEstimatedWorkoutCalories,
  formatSessionBlockSummary,
  formatSessionRestSeconds,
  formatSessionVolumeKg,
  getEstimatedWorkoutCalories,
  getSessionBlockTypeLabel,
  getSessionBlockVolumeKg,
} from '@/lib/session-blocks';
import { XP_RULES } from '@/lib/gamification';
import { supabase } from '@/lib/supabase';
import { fetchTrainingSessionBlocks, TrainingSessionBlockRecord } from '@/lib/training-session-blocks-db';
import { parseWorkoutCompletionMetadata } from '@/lib/workout-history';

type TrainingSession = {
  id: string;
  user_id: string;
  name: string;
  sport: string | null;
  description: string | null;
  visibility: 'private' | 'public' | null;
  created_at: string | null;
};

type WorkoutHistoryEntry = {
  id: string;
  workout_id: string | null;
  workout_name: string;
  completed_at: string;
  duration_seconds: number | null;
  total_volume: number | null;
  completed_exercises: number | null;
  estimated_calories?: number | null;
  metadata?: unknown;
};

type WorkoutHistoryExerciseEntry = {
  id: string;
  history_id: string | null;
  workout_id: string;
  exercise_name: string;
  block_type: TrainingSessionBlockRecord['block_type'] | null;
  sets_count: number | null;
  reps: number | null;
  duration_seconds: number | null;
  distance: number | null;
  charge_kg: number | null;
  volume: number | null;
  completed_at: string;
  created_at: string;
};

type ExercisePersonalRecord = {
  exerciseName: string;
  maxChargeKg: number | null;
  bestVolumeKg: number | null;
  maxReps: number | null;
  bestDurationSeconds: number | null;
};

type ExerciseStatsCard = ExercisePersonalRecord & {
  completedCount: number;
  lastCompletedAt: string | null;
  totalReps: number;
  cumulativeVolumeKg: number;
  latestMetricValue: number | null;
  previousMetricValue: number | null;
  trendDirection: 'up' | 'down' | 'flat' | null;
  trendLabel: string | null;
  progressionEntries: Array<{
    id: string;
    label: string;
    rawValue: number;
    formattedValue: string | null;
  }>;
  progressionMetricLabel: string | null;
};

type SessionRecordSummary = {
  bestVolumeKg: number | null;
  longestDurationSeconds: number | null;
  bestCompletionRate: number | null;
  bestCompletionLabel: string | null;
  maxCompletedBlocks: number | null;
};

type WorkoutHistoryDetailSummary = {
  totalBlocks: number;
  completedBlocks: number;
  skippedBlocks: number;
  totalSets: number;
  validatedSets: number;
  skippedSets: number;
  totalRepetitions: number;
  totalVolumeKg: number;
  completionRate: number;
  completionType: 'full' | 'partial';
  estimatedCaloriesValue: number | null;
  earnedXp: number;
};

type ActualSetHistoryEntry = {
  block_id: string;
  block_name: string;
  set_number: number;
  planned_reps: number | null;
  actual_reps: number | null;
  planned_charge_kg: number | null;
  actual_charge_kg: number | null;
  status: 'completed' | 'skipped';
};

type WorkoutPerformanceHistoryEntry = {
  id: string;
  completedAt: string;
  durationSeconds: number | null;
  validatedSets: number;
  skippedSets: number;
  actualVolumeKg: number;
  actualSets: ActualSetHistoryEntry[];
};

type ExercisePerformanceSnapshot = {
  historyId: string;
  completedAt: string;
  blockName: string;
  summary: string;
};

type ActualPerformanceRecord = {
  blockId: string;
  exerciseName: string;
  maxChargeKg: number | null;
  bestSetReps: number | null;
  bestWorkoutVolumeKg: number | null;
  lastPerformedAt: string | null;
  lastPerformedSummary: string | null;
};

function formatRelativeDate(dateString: string | null) {
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

function formatDurationLabel(durationSeconds: number | null | undefined) {
  const normalizedSeconds = Number(durationSeconds);

  if (!Number.isFinite(normalizedSeconds) || normalizedSeconds <= 0) {
    return null;
  }

  const totalSeconds = Math.floor(normalizedSeconds);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  if (minutes <= 0) {
    return `${seconds} sec`;
  }

  return `${minutes} min ${seconds.toString().padStart(2, '0')} sec`;
}

function formatChartDayLabel(dateString: string) {
  const date = new Date(dateString);

  if (Number.isNaN(date.getTime())) {
    return '-';
  }

  return date.toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
  });
}

function formatFullDateTimeLabel(dateString: string | null) {
  if (!dateString) return '-';

  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return '-';

  return date.toLocaleString('fr-FR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatPerformanceSetSummary(sets: ActualSetHistoryEntry[]) {
  if (sets.length === 0) return null;

  const completedSets = sets.filter((entry) => entry.status === 'completed');
  if (completedSets.length === 0) return null;

  const first = completedSets[0];
  const sameReps = completedSets.every((entry) => entry.actual_reps === first.actual_reps);
  const sameCharge = completedSets.every((entry) => entry.actual_charge_kg === first.actual_charge_kg);

  const repsLabel =
    sameReps && first.actual_reps != null
      ? `${completedSets.length}x${first.actual_reps}`
      : `${completedSets.length} series`;
  const chargeLabel =
    sameCharge && first.actual_charge_kg != null && first.actual_charge_kg > 0
      ? ` @ ${first.actual_charge_kg}kg`
      : '';

  return `${repsLabel}${chargeLabel}`;
}

function buildChartPath(points: Array<{ x: number; y: number }>) {
  if (points.length === 0) return '';

  return points
    .map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`)
    .join(' ');
}

function normalizePositiveInteger(value: number | null | undefined, fallback = 0) {
  const normalizedValue = Number(value);

  if (!Number.isFinite(normalizedValue) || normalizedValue <= 0) {
    return fallback;
  }

  return Math.trunc(normalizedValue);
}

export default function SessionDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params?.id as string;

  const [session, setSession] = useState<TrainingSession | null>(null);
  const [blocks, setBlocks] = useState<TrainingSessionBlockRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [completedBlockIds, setCompletedBlockIds] = useState<string[]>([]);
  const [lastLiveElapsedSeconds, setLastLiveElapsedSeconds] = useState(0);
  const [lastLiveCompletedCount, setLastLiveCompletedCount] = useState(0);
  const [historyEntries, setHistoryEntries] = useState<WorkoutHistoryEntry[]>([]);
  const [historyExerciseEntries, setHistoryExerciseEntries] = useState<WorkoutHistoryExerciseEntry[]>([]);
  const [selectedExerciseName, setSelectedExerciseName] = useState<string | null>(null);
  const [expandedHistoryEntryId, setExpandedHistoryEntryId] = useState<string | null>(null);
  const [showAllPerformanceHistory, setShowAllPerformanceHistory] = useState(false);

  const completionStorageKey = `actyv.session.completed.${id}`;
  const liveStorageKey = `actyv.session.live.${id}`;

  useEffect(() => {
    const loadSession = async () => {
      setLoading(true);
      setMessage(null);

      try {
        const {
          data: { user },
          error: userError,
        } = await supabase.auth.getUser();

        if (userError || !user) {
          if (userError) {
            console.error('Erreur chargement user seance :', userError);
          }
          setMessage('Connecte-toi pour consulter cette seance.');
          setSession(null);
          setBlocks([]);
          setHistoryEntries([]);
          setHistoryExerciseEntries([]);
          return;
        }

        const { data: sessionRow, error: sessionError } = await supabase
          .from('training_sessions')
          .select('id, user_id, name, sport, description, visibility, created_at')
          .eq('id', id)
          .or(`user_id.eq.${user.id},visibility.eq.public`)
          .maybeSingle();

        if (sessionError) {
          console.error('Erreur chargement detail seance :', sessionError);
          setMessage('Impossible de charger cette seance.');
          setSession(null);
          setBlocks([]);
          setHistoryEntries([]);
          setHistoryExerciseEntries([]);
          return;
        }

        if (!sessionRow) {
          setSession(null);
          setBlocks([]);
          setHistoryEntries([]);
          setHistoryExerciseEntries([]);
          return;
        }

        const currentSession = sessionRow as TrainingSession;
        setSession(currentSession);

        const { data: blockRows, error: blocksError } = await fetchTrainingSessionBlocks([id]);

        if (blocksError) {
          console.error('Erreur chargement blocs detail seance :', blocksError);
          setBlocks([]);
        } else {
          setBlocks(blockRows || []);
        }

        let historyResponse = await supabase
          .from('workout_sessions_history')
          .select(
            'id, workout_id, workout_name, completed_at, duration_seconds, total_volume, completed_exercises, estimated_calories, metadata'
          )
          .eq('user_id', user.id)
          .eq('workout_id', currentSession.id)
          .order('completed_at', { ascending: true });

        const missingMetadataColumn =
          historyResponse.error?.code === 'PGRST204' ||
          historyResponse.error?.code === '42703' ||
          (historyResponse.error?.message || '').toLowerCase().includes('metadata');

        if (missingMetadataColumn) {
          historyResponse = await supabase
            .from('workout_sessions_history')
            .select(
              'id, workout_id, workout_name, completed_at, duration_seconds, total_volume, completed_exercises, estimated_calories'
            )
            .eq('user_id', user.id)
            .eq('workout_id', currentSession.id)
            .order('completed_at', { ascending: true });
        }

        const { data: historyRows, error: historyError } = historyResponse;

        if (historyError) {
          console.error('Erreur chargement historique detail seance :', historyError);
          setHistoryEntries([]);
          setHistoryExerciseEntries([]);
        } else {
          const exactHistoryRows = (historyRows as WorkoutHistoryEntry[]) || [];
          let resolvedHistoryEntries = exactHistoryRows;
          let matchedByWorkoutNameWithNullId: WorkoutHistoryEntry[] = [];

          if (exactHistoryRows.length === 0) {
            let fallbackResponse = await supabase
              .from('workout_sessions_history')
              .select(
                'id, workout_id, workout_name, completed_at, duration_seconds, total_volume, completed_exercises, estimated_calories, metadata'
              )
              .eq('user_id', user.id)
              .is('workout_id', null)
              .eq('workout_name', currentSession.name)
              .order('completed_at', { ascending: true });

            const fallbackMissingMetadataColumn =
              fallbackResponse.error?.code === 'PGRST204' ||
              fallbackResponse.error?.code === '42703' ||
              (fallbackResponse.error?.message || '').toLowerCase().includes('metadata');

            if (fallbackMissingMetadataColumn) {
              fallbackResponse = await supabase
                .from('workout_sessions_history')
                .select(
                  'id, workout_id, workout_name, completed_at, duration_seconds, total_volume, completed_exercises, estimated_calories'
                )
                .eq('user_id', user.id)
                .is('workout_id', null)
                .eq('workout_name', currentSession.name)
                .order('completed_at', { ascending: true });
            }

            const { data: fallbackRows, error: fallbackError } = fallbackResponse;

            if (fallbackError) {
              console.error('Erreur chargement historique fallback detail seance :', fallbackError);
            } else {
              matchedByWorkoutNameWithNullId = (fallbackRows as WorkoutHistoryEntry[]) || [];
              if (matchedByWorkoutNameWithNullId.length > 0) {
                resolvedHistoryEntries = matchedByWorkoutNameWithNullId;
              }
            }
          }

          setHistoryEntries(resolvedHistoryEntries);

          const { data: historyExerciseRows, error: historyExerciseError } = await supabase
            .from('workout_exercise_history')
            .select(
              'id, history_id, workout_id, exercise_name, block_type, sets_count, reps, duration_seconds, distance, charge_kg, volume, completed_at, created_at'
            )
            .eq('user_id', user.id)
            .eq('workout_id', currentSession.id)
            .order('completed_at', { ascending: true });

          if (historyExerciseError) {
            console.error('Erreur chargement records exercices detail seance :', historyExerciseError);
            setHistoryExerciseEntries([]);
          } else {
            setHistoryExerciseEntries((historyExerciseRows as WorkoutHistoryExerciseEntry[]) || []);
          }
        }
      } finally {
        setLoading(false);
      }
    };

    loadSession();
  }, [id]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    try {
      const savedValue = window.localStorage.getItem(completionStorageKey);
      if (!savedValue) {
        setCompletedBlockIds([]);
        return;
      }

      const parsedValue = JSON.parse(savedValue);
      setCompletedBlockIds(Array.isArray(parsedValue) ? parsedValue.filter(Boolean) : []);
    } catch (error) {
      console.error('Erreur lecture progression seance :', error);
      setCompletedBlockIds([]);
    }
  }, [completionStorageKey]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    try {
      const savedValue = window.localStorage.getItem(liveStorageKey);
      if (!savedValue) {
        setLastLiveElapsedSeconds(0);
        setLastLiveCompletedCount(0);
        return;
      }

      const parsedValue = JSON.parse(savedValue) as {
        elapsedSeconds?: number;
        completedBlockIds?: string[];
      };

      setLastLiveElapsedSeconds(
        typeof parsedValue.elapsedSeconds === 'number' && Number.isFinite(parsedValue.elapsedSeconds)
          ? Math.max(0, Math.floor(parsedValue.elapsedSeconds))
          : 0
      );
      setLastLiveCompletedCount(
        Array.isArray(parsedValue.completedBlockIds) ? parsedValue.completedBlockIds.filter(Boolean).length : 0
      );
    } catch (error) {
      console.error('Erreur lecture progression live seance :', error);
      setLastLiveElapsedSeconds(0);
      setLastLiveCompletedCount(0);
    }
  }, [liveStorageKey]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const validBlockIds = new Set(blocks.map((block) => block.id));
    const sanitizedIds = completedBlockIds.filter((blockId) => validBlockIds.has(blockId));

    if (sanitizedIds.length !== completedBlockIds.length) {
      setCompletedBlockIds(sanitizedIds);
      return;
    }

    try {
      if (sanitizedIds.length === 0) {
        window.localStorage.removeItem(completionStorageKey);
      } else {
        window.localStorage.setItem(completionStorageKey, JSON.stringify(sanitizedIds));
      }
    } catch (error) {
      console.error('Erreur sauvegarde progression seance :', error);
    }
  }, [blocks, completedBlockIds, completionStorageKey]);

  const totalStructuredBlocks = useMemo(
    () => blocks.filter((block) => block.block_type !== 'free').length,
    [blocks]
  );

  const completedBlocksCount = useMemo(
    () => blocks.filter((block) => completedBlockIds.includes(block.id)).length,
    [blocks, completedBlockIds]
  );

  const allBlocksCompleted = blocks.length > 0 && completedBlocksCount === blocks.length;
  const lastLiveWasCompleted = blocks.length > 0 && lastLiveCompletedCount === blocks.length;
  const estimatedCalories = useMemo(
    () =>
      lastLiveWasCompleted
        ? getEstimatedWorkoutCalories(lastLiveElapsedSeconds, session?.sport)
        : null,
    [lastLiveElapsedSeconds, lastLiveWasCompleted, session?.sport]
  );
  const sessionTotalVolume = useMemo(
    () =>
      blocks.reduce((total, block) => {
        const volume = getSessionBlockVolumeKg(
          block.block_type,
          block.target_value,
          block.sets_count,
          block.charge_kg
        );
        return total + (volume ?? 0);
      }, 0),
    [blocks]
  );
  const personalExerciseRecords = useMemo<ExercisePersonalRecord[]>(() => {
    if (historyExerciseEntries.length === 0) {
      return [];
    }

    const groupedRecords = new Map<string, ExercisePersonalRecord>();
    const sessionExerciseOrder = new Map(
      blocks.map((block, index) => [block.name.trim().toLowerCase(), index] as const)
    );

    historyExerciseEntries.forEach((entry) => {
      const exerciseName = entry.exercise_name.trim();
      if (!exerciseName) return;

      const recordKey = exerciseName.toLowerCase();
      const nextCharge =
        Number.isFinite(Number(entry.charge_kg)) && Number(entry.charge_kg) > 0
          ? Number(entry.charge_kg)
          : null;
      const nextVolume =
        Number.isFinite(Number(entry.volume)) && Number(entry.volume) > 0
          ? Number(entry.volume)
          : null;
      const nextReps =
        Number.isFinite(Number(entry.reps)) && Number(entry.reps) > 0 ? Number(entry.reps) : null;
      const nextDurationSeconds =
        Number.isFinite(Number(entry.duration_seconds)) && Number(entry.duration_seconds) > 0
          ? Number(entry.duration_seconds)
          : null;

      const existingRecord = groupedRecords.get(recordKey) || {
        exerciseName,
        maxChargeKg: null,
        bestVolumeKg: null,
        maxReps: null,
        bestDurationSeconds: null,
      };

      groupedRecords.set(recordKey, {
        exerciseName: existingRecord.exerciseName,
        maxChargeKg:
          nextCharge === null
            ? existingRecord.maxChargeKg
            : Math.max(existingRecord.maxChargeKg || 0, nextCharge),
        bestVolumeKg:
          nextVolume === null
            ? existingRecord.bestVolumeKg
            : Math.max(existingRecord.bestVolumeKg || 0, nextVolume),
        maxReps:
          entry.block_type !== 'reps' || nextReps === null
            ? existingRecord.maxReps
            : Math.max(existingRecord.maxReps || 0, nextReps),
        bestDurationSeconds:
          entry.block_type !== 'duration' || nextDurationSeconds === null
            ? existingRecord.bestDurationSeconds
            : Math.max(existingRecord.bestDurationSeconds || 0, nextDurationSeconds),
      });
    });

    return [...groupedRecords.values()].sort((left, right) => {
      const leftOrder = sessionExerciseOrder.get(left.exerciseName.trim().toLowerCase()) ?? Number.MAX_SAFE_INTEGER;
      const rightOrder = sessionExerciseOrder.get(right.exerciseName.trim().toLowerCase()) ?? Number.MAX_SAFE_INTEGER;

      if (leftOrder !== rightOrder) {
        return leftOrder - rightOrder;
      }

      return left.exerciseName.localeCompare(right.exerciseName, 'fr');
    });
  }, [blocks, historyExerciseEntries]);
  const exerciseStatsCards = useMemo<ExerciseStatsCard[]>(() => {
    if (historyExerciseEntries.length === 0) {
      return [];
    }

    const groupedEntries = new Map<string, WorkoutHistoryExerciseEntry[]>();
    const sessionExerciseOrder = new Map(
      blocks.map((block, index) => [block.name.trim().toLowerCase(), index] as const)
    );

    historyExerciseEntries.forEach((entry) => {
      const exerciseName = entry.exercise_name.trim();
      if (!exerciseName) return;

      const key = exerciseName.toLowerCase();
      const currentEntries = groupedEntries.get(key) || [];
      currentEntries.push(entry);
      groupedEntries.set(key, currentEntries);
    });

    return [...groupedEntries.entries()]
      .map(([, entries]) => {
        const sortedEntries = [...entries].sort(
          (left, right) => new Date(left.completed_at).getTime() - new Date(right.completed_at).getTime()
        );
        const latestEntry = sortedEntries[sortedEntries.length - 1] || null;
        const exerciseName = latestEntry?.exercise_name || entries[0]?.exercise_name || 'Exercice';
        const maxChargeKg = sortedEntries.reduce((best, entry) => {
          const value =
            Number.isFinite(Number(entry.charge_kg)) && Number(entry.charge_kg) > 0 ? Number(entry.charge_kg) : 0;
          return Math.max(best, value);
        }, 0);
        const bestVolumeKg = sortedEntries.reduce((best, entry) => {
          const value =
            Number.isFinite(Number(entry.volume)) && Number(entry.volume) > 0
              ? Number(entry.volume)
              : 0;
          return Math.max(best, value);
        }, 0);
        const maxReps = sortedEntries.reduce((best, entry) => {
          const value =
            entry.block_type === 'reps' && Number.isFinite(Number(entry.reps)) && Number(entry.reps) > 0
              ? Number(entry.reps)
              : 0;
          return Math.max(best, value);
        }, 0);
        const totalReps = sortedEntries.reduce((total, entry) => {
          const repsValue =
            entry.block_type === 'reps' && Number.isFinite(Number(entry.reps)) && Number(entry.reps) > 0
              ? Number(entry.reps)
              : 0;
          const setsValue =
            Number.isFinite(Number(entry.sets_count)) && Number(entry.sets_count) > 0
              ? Number(entry.sets_count)
              : 1;

          return total + repsValue * setsValue;
        }, 0);
        const bestDurationSeconds = sortedEntries.reduce((best, entry) => {
          const value =
            entry.block_type === 'duration' &&
            Number.isFinite(Number(entry.duration_seconds)) &&
            Number(entry.duration_seconds) > 0
              ? Number(entry.duration_seconds)
              : 0;
          return Math.max(best, value);
        }, 0);
        const cumulativeVolumeKg = sortedEntries.reduce((total, entry) => {
          const value =
            Number.isFinite(Number(entry.volume)) && Number(entry.volume) > 0 ? Number(entry.volume) : 0;
          return total + value;
        }, 0);

        const progressionCandidates = sortedEntries.slice(-10).map((entry) => ({
          id: entry.id,
          label: formatChartDayLabel(entry.completed_at),
          volume: Number.isFinite(Number(entry.volume)) ? Number(entry.volume) : 0,
          charge: Number.isFinite(Number(entry.charge_kg)) ? Number(entry.charge_kg) : 0,
          reps: entry.block_type === 'reps' && Number.isFinite(Number(entry.reps)) ? Number(entry.reps) : 0,
          duration:
            entry.block_type === 'duration' && Number.isFinite(Number(entry.duration_seconds))
              ? Number(entry.duration_seconds)
              : 0,
        }));

        const metricKey = progressionCandidates.some((entry) => entry.volume > 0)
          ? 'volume'
          : progressionCandidates.some((entry) => entry.charge > 0)
            ? 'charge'
            : progressionCandidates.some((entry) => entry.reps > 0)
              ? 'reps'
              : progressionCandidates.some((entry) => entry.duration > 0)
                ? 'duration'
                : null;

        const progressionEntries =
          metricKey === null
            ? []
            : progressionCandidates.map((entry) => {
                const rawValue =
                  metricKey === 'volume'
                    ? entry.volume
                    : metricKey === 'charge'
                      ? entry.charge
                      : metricKey === 'reps'
                        ? entry.reps
                        : entry.duration;

                return {
                  id: entry.id,
                  label: entry.label,
                  rawValue,
                  formattedValue:
                    metricKey === 'volume'
                      ? formatSessionVolumeKg(rawValue)
                      : metricKey === 'charge'
                        ? `${rawValue} kg`
                        : metricKey === 'reps'
                          ? `${rawValue} reps`
                          : formatDurationLabel(rawValue),
                };
              });

        const latestProgressionEntry =
          progressionEntries.length > 0 ? progressionEntries[progressionEntries.length - 1] : null;
        const previousProgressionEntry =
          progressionEntries.length > 1 ? progressionEntries[progressionEntries.length - 2] : null;
        const trendDirection =
          latestProgressionEntry && previousProgressionEntry
            ? latestProgressionEntry.rawValue > previousProgressionEntry.rawValue
              ? 'up'
              : latestProgressionEntry.rawValue < previousProgressionEntry.rawValue
                ? 'down'
                : 'flat'
            : null;
        const trendLabel =
          trendDirection === 'up'
            ? '↗ progression'
            : trendDirection === 'down'
              ? '↘ baisse'
              : trendDirection === 'flat'
                ? '→ stable'
                : null;

        return {
          exerciseName,
          completedCount: sortedEntries.length,
          lastCompletedAt: latestEntry?.completed_at || null,
          maxChargeKg: maxChargeKg > 0 ? maxChargeKg : null,
          bestVolumeKg: bestVolumeKg > 0 ? bestVolumeKg : null,
          maxReps: maxReps > 0 ? maxReps : null,
          bestDurationSeconds: bestDurationSeconds > 0 ? bestDurationSeconds : null,
          totalReps,
          cumulativeVolumeKg,
          latestMetricValue: latestProgressionEntry?.rawValue ?? null,
          previousMetricValue: previousProgressionEntry?.rawValue ?? null,
          trendDirection,
          trendLabel,
          progressionEntries,
          progressionMetricLabel:
            metricKey === 'volume'
              ? 'Volume'
              : metricKey === 'charge'
                ? 'Charge'
                : metricKey === 'reps'
                  ? 'Reps'
                  : metricKey === 'duration'
                    ? 'Duree'
                    : null,
        };
      })
      .sort((left, right) => {
        const leftOrder = sessionExerciseOrder.get(left.exerciseName.trim().toLowerCase()) ?? Number.MAX_SAFE_INTEGER;
        const rightOrder = sessionExerciseOrder.get(right.exerciseName.trim().toLowerCase()) ?? Number.MAX_SAFE_INTEGER;
        if (leftOrder !== rightOrder) return leftOrder - rightOrder;
        return left.exerciseName.localeCompare(right.exerciseName, 'fr');
      });
  }, [blocks, historyExerciseEntries]);
  useEffect(() => {
    if (exerciseStatsCards.length === 0) {
      setSelectedExerciseName(null);
      return;
    }

    if (!selectedExerciseName || !exerciseStatsCards.some((entry) => entry.exerciseName === selectedExerciseName)) {
      setSelectedExerciseName(exerciseStatsCards[0].exerciseName);
    }
  }, [exerciseStatsCards, selectedExerciseName]);
  const selectedExerciseStats =
    exerciseStatsCards.find((entry) => entry.exerciseName === selectedExerciseName) || exerciseStatsCards[0] || null;
  const totalSets = useMemo(
    () =>
      blocks.reduce((total, block) => total + Math.max(Number(block.sets_count || 1), 1), 0),
    [blocks]
  );
  const totalRealizations = historyEntries.length;
  const historyDetailsByEntryId = useMemo(() => {
    const groupedEntries = new Map<string, WorkoutHistoryExerciseEntry[]>();

    historyExerciseEntries.forEach((entry) => {
      if (!entry.history_id) {
        return;
      }

      const currentEntries = groupedEntries.get(entry.history_id) || [];
      currentEntries.push(entry);
      groupedEntries.set(entry.history_id, currentEntries);
    });

    return new Map<string, WorkoutHistoryDetailSummary>(
      historyEntries.map((entry) => {
        const metadata = parseWorkoutCompletionMetadata(entry.metadata);
        const entries = groupedEntries.get(entry.id) || [];
        const validatedSetsFromExercises = entries.reduce(
          (total, historyEntry) => total + normalizePositiveInteger(historyEntry.sets_count, 1),
          0
        );
        const totalRepetitionsFromExercises = entries.reduce((total, historyEntry) => {
          if (historyEntry.block_type !== 'reps') {
            return total;
          }

          const repsValue = normalizePositiveInteger(historyEntry.reps, 0);
          const setsValue = normalizePositiveInteger(historyEntry.sets_count, 1);
          return total + repsValue * setsValue;
        }, 0);
        const totalVolumeFromExercises = entries.reduce((total, historyEntry) => {
          const volumeValue = Number(historyEntry.volume);
          return total + (Number.isFinite(volumeValue) && volumeValue > 0 ? volumeValue : 0);
        }, 0);

        const completedBlocks =
          metadata.completed_blocks ?? normalizePositiveInteger(entry.completed_exercises, 0);
        const totalBlocks = Math.max(
          metadata.total_blocks ?? 0,
          blocks.length,
          completedBlocks
        );
        const skippedBlocks = metadata.skipped_blocks ?? Math.max(totalBlocks - completedBlocks, 0);
        const validatedSets = metadata.completed_sets ?? validatedSetsFromExercises;
        const totalSets = Math.max(metadata.total_sets ?? 0, validatedSets);
        const skippedSets = metadata.skipped_sets ?? Math.max(totalSets - validatedSets, 0);
        const totalRepetitions = metadata.total_repetitions ?? totalRepetitionsFromExercises;
        const totalVolumeKg =
          metadata.total_volume ??
          (totalVolumeFromExercises > 0
            ? totalVolumeFromExercises
            : Number.isFinite(Number(entry.total_volume))
              ? Number(entry.total_volume)
              : 0);
        const completionRate =
          metadata.completion_rate ??
          (totalBlocks > 0 ? Math.min(100, Math.max(0, Math.round((completedBlocks / totalBlocks) * 100))) : 0);
        const estimatedCaloriesValue =
          metadata.estimated_calories ??
          (Number.isFinite(Number(entry.estimated_calories)) && Number(entry.estimated_calories) > 0
            ? Number(entry.estimated_calories)
            : null);

        return [
          entry.id,
          {
            totalBlocks,
            completedBlocks,
            skippedBlocks,
            totalSets,
            validatedSets,
            skippedSets,
            totalRepetitions,
            totalVolumeKg,
            completionRate,
            completionType: metadata.completion_type || (skippedBlocks > 0 || skippedSets > 0 ? 'partial' : 'full'),
            estimatedCaloriesValue,
            earnedXp: metadata.earned_xp ?? XP_RULES.session_completed.xp,
          },
        ];
      })
    );
  }, [blocks.length, historyEntries, historyExerciseEntries]);
  const normalizedHistoryEntries = useMemo(
    () =>
      historyEntries.map((entry) => {
        const historyDetail = historyDetailsByEntryId.get(entry.id) || {
          totalBlocks: Math.max(blocks.length, 0),
          completedBlocks:
            Number.isFinite(Number(entry.completed_exercises)) && Number(entry.completed_exercises) > 0
              ? Number(entry.completed_exercises)
              : 0,
          skippedBlocks: 0,
          totalSets: 0,
          validatedSets: 0,
          skippedSets: 0,
          totalRepetitions: 0,
          totalVolumeKg: Number.isFinite(Number(entry.total_volume)) ? Number(entry.total_volume) : 0,
          completionRate: 0,
          completionType: 'full' as const,
          estimatedCaloriesValue:
            Number.isFinite(Number(entry.estimated_calories)) && Number(entry.estimated_calories) > 0
              ? Number(entry.estimated_calories)
              : null,
          earnedXp: XP_RULES.session_completed.xp,
        };

        return {
          ...entry,
          completedExercises: historyDetail.completedBlocks,
          skippedBlocks: historyDetail.skippedBlocks,
          totalBlocks: historyDetail.totalBlocks,
          completionRate: historyDetail.completionRate,
          completionType: historyDetail.completionType,
          totalSets: historyDetail.totalSets,
          validatedSets: historyDetail.validatedSets,
          skippedSets: historyDetail.skippedSets,
          totalRepetitions: historyDetail.totalRepetitions,
          totalVolumeKg: historyDetail.totalVolumeKg,
          estimatedCaloriesValue: historyDetail.estimatedCaloriesValue,
          earnedXp: historyDetail.earnedXp,
        };
      }),
    [blocks.length, historyDetailsByEntryId, historyEntries]
  );
  const completedDurationEntries = historyEntries.filter(
    (entry) => Number.isFinite(Number(entry.duration_seconds)) && Number(entry.duration_seconds) > 0
  );
  const averageDurationSeconds =
    completedDurationEntries.length > 0
      ? Math.round(
          completedDurationEntries.reduce((total, entry) => total + Number(entry.duration_seconds || 0), 0) /
            completedDurationEntries.length
        )
      : null;
  const bestVolume =
    normalizedHistoryEntries.length > 0
      ? normalizedHistoryEntries.reduce((best, entry) => Math.max(best, Number(entry.totalVolumeKg || 0)), 0)
      : 0;
  const lastCompletedAt = historyEntries[historyEntries.length - 1]?.completed_at || null;
  const totalCumulativeVolume = useMemo(
    () =>
      normalizedHistoryEntries.reduce(
        (total, entry) => total + (Number.isFinite(Number(entry.totalVolumeKg)) ? Number(entry.totalVolumeKg) : 0),
        0
      ),
    [normalizedHistoryEntries]
  );
  const sessionRecordSummary = useMemo<SessionRecordSummary>(() => {
    const longestDurationSeconds =
      normalizedHistoryEntries.length > 0
        ? normalizedHistoryEntries.reduce(
            (best, entry) =>
              Math.max(
                best,
                Number.isFinite(Number(entry.duration_seconds)) ? Number(entry.duration_seconds) : 0
              ),
            0
          )
        : 0;

    const bestCompletionEntry =
      normalizedHistoryEntries.length > 0
        ? normalizedHistoryEntries.reduce((best, entry) =>
            entry.completionRate > best.completionRate ? entry : best
          )
        : null;

    return {
      bestVolumeKg: bestVolume > 0 ? bestVolume : null,
      longestDurationSeconds: longestDurationSeconds > 0 ? longestDurationSeconds : null,
      bestCompletionRate: bestCompletionEntry ? bestCompletionEntry.completionRate : null,
      bestCompletionLabel: bestCompletionEntry
        ? `${bestCompletionEntry.completedExercises} / ${bestCompletionEntry.totalBlocks}`
        : null,
      maxCompletedBlocks:
        normalizedHistoryEntries.length > 0
          ? normalizedHistoryEntries.reduce(
              (best, entry) => Math.max(best, entry.completedExercises),
              0
            )
          : null,
    };
  }, [bestVolume, normalizedHistoryEntries]);
  const progressionData = useMemo(() => {
    const sortedEntries = [...normalizedHistoryEntries]
      .sort(
        (left, right) =>
          new Date(left.completed_at).getTime() - new Date(right.completed_at).getTime()
      )
      .slice(-10);

    const metricCandidates = sortedEntries.map((entry) => ({
      id: entry.id,
      label: formatChartDayLabel(entry.completed_at),
      completedAt: entry.completed_at,
      volume: Number.isFinite(Number(entry.totalVolumeKg)) ? Number(entry.totalVolumeKg) : 0,
      duration: Number.isFinite(Number(entry.duration_seconds)) ? Number(entry.duration_seconds) : 0,
      completionRate: entry.completionRate,
    }));

    const hasVolume = metricCandidates.some((entry) => entry.volume > 0);
    const hasDuration = metricCandidates.some((entry) => entry.duration > 0);
    const hasCompletionRate = metricCandidates.some((entry) => entry.completionRate > 0);

    const metricKey = hasVolume ? 'volume' : hasDuration ? 'duration' : hasCompletionRate ? 'completion' : null;

    if (!metricKey) {
      return {
        entries: [] as Array<{
          id: string;
          label: string;
          rawValue: number;
          formattedValue: string | null;
        }>,
        metricLabel: null as string | null,
      };
    }

    const entries = metricCandidates.map((entry) => {
      const rawValue =
        metricKey === 'volume'
          ? entry.volume
          : metricKey === 'duration'
            ? entry.duration
            : entry.completionRate;
      return {
        id: entry.id,
        label: entry.label,
        rawValue,
        formattedValue:
          metricKey === 'volume'
            ? formatSessionVolumeKg(rawValue)
            : metricKey === 'duration'
              ? formatDurationLabel(rawValue)
              : `${rawValue}%`,
      };
    });

    return {
      entries,
      metricLabel:
        metricKey === 'volume'
          ? 'Volume total'
          : metricKey === 'duration'
            ? 'Duree totale'
            : 'Taux de completion',
    };
  }, [normalizedHistoryEntries]);
  const chartMetricEntries = progressionData.entries;
  const chartMetricLabel = progressionData.metricLabel;
  const chartMaxValue = useMemo(
    () => Math.max(...chartMetricEntries.map((entry) => entry.rawValue), 0),
    [chartMetricEntries]
  );
  const chartPoints = useMemo(() => {
    if (chartMetricEntries.length < 2 || chartMaxValue <= 0) {
      return [] as Array<{ x: number; y: number; label: string; formattedValue: string | null }>;
    }

    const chartWidth = 100;
    const chartHeight = 100;
    const stepX = chartMetricEntries.length === 1 ? chartWidth / 2 : chartWidth / (chartMetricEntries.length - 1);

    return chartMetricEntries.map((entry, index) => {
      const ratio = chartMaxValue > 0 ? entry.rawValue / chartMaxValue : 0;
      return {
        x: Number((index * stepX).toFixed(2)),
        y: Number((chartHeight - ratio * chartHeight).toFixed(2)),
        label: entry.label,
        formattedValue: entry.formattedValue,
      };
    });
  }, [chartMaxValue, chartMetricEntries]);
  const chartPath = useMemo(() => buildChartPath(chartPoints), [chartPoints]);
  const firstPendingBlockIndex = useMemo(
    () => blocks.findIndex((block) => !completedBlockIds.includes(block.id)),
    [blocks, completedBlockIds]
  );
  const globalProgressPercent =
    blocks.length > 0 ? Math.round((completedBlocksCount / blocks.length) * 100) : 0;
  const selectedExerciseChartEntries = selectedExerciseStats?.progressionEntries || [];
  const selectedExerciseSingleEntry =
    selectedExerciseChartEntries.length === 1 ? selectedExerciseChartEntries[0] : null;
  const selectedExerciseChartMaxValue = useMemo(
    () => Math.max(...selectedExerciseChartEntries.map((entry) => entry.rawValue), 0),
    [selectedExerciseChartEntries]
  );
  const selectedExerciseChartPoints = useMemo(() => {
    if (selectedExerciseChartEntries.length < 2 || selectedExerciseChartMaxValue <= 0) {
      return [] as Array<{ x: number; y: number; label: string; formattedValue: string | null }>;
    }

    const chartWidth = 100;
    const chartHeight = 100;
    const stepX =
      selectedExerciseChartEntries.length === 1
        ? chartWidth / 2
        : chartWidth / (selectedExerciseChartEntries.length - 1);

    return selectedExerciseChartEntries.map((entry, index) => {
      const ratio = selectedExerciseChartMaxValue > 0 ? entry.rawValue / selectedExerciseChartMaxValue : 0;
      return {
        x: Number((index * stepX).toFixed(2)),
        y: Number((chartHeight - ratio * chartHeight).toFixed(2)),
        label: entry.label,
        formattedValue: entry.formattedValue,
      };
    });
  }, [selectedExerciseChartEntries, selectedExerciseChartMaxValue]);
  const selectedExerciseChartPath = useMemo(
    () => buildChartPath(selectedExerciseChartPoints),
    [selectedExerciseChartPoints]
  );
  const recentSessionHistoryEntries = useMemo(
    () => normalizedHistoryEntries.slice(-5).reverse(),
    [normalizedHistoryEntries]
  );
  const remainingSessionHistoryCount = Math.max(normalizedHistoryEntries.length - recentSessionHistoryEntries.length, 0);
  const workoutPerformanceHistoryEntries = useMemo<WorkoutPerformanceHistoryEntry[]>(
    () =>
      historyEntries
        .map((entry) => {
          const metadata = parseWorkoutCompletionMetadata(entry.metadata);
          const actualSets = (metadata.actual_sets || metadata.set_performances || []).map((setEntry) => ({
            ...setEntry,
          }));

          const validatedSets = actualSets.filter((setEntry) => setEntry.status === 'completed').length;
          const skippedSets = actualSets.filter((setEntry) => setEntry.status === 'skipped').length;
          const actualVolumeKg = actualSets
            .filter((setEntry) => setEntry.status === 'completed')
            .reduce((total, setEntry) => {
              const reps = normalizePositiveInteger(setEntry.actual_reps, 0);
              const charge = Number.isFinite(Number(setEntry.actual_charge_kg))
                ? Math.max(Number(setEntry.actual_charge_kg), 0)
                : 0;
              return total + reps * charge;
            }, 0);

          return {
            id: entry.id,
            completedAt: entry.completed_at,
            durationSeconds:
              Number.isFinite(Number(entry.duration_seconds)) && Number(entry.duration_seconds) > 0
                ? Number(entry.duration_seconds)
                : null,
            validatedSets,
            skippedSets,
            actualVolumeKg,
            actualSets,
          };
        })
        .filter((entry) => entry.actualSets.length > 0)
        .sort((left, right) => new Date(right.completedAt).getTime() - new Date(left.completedAt).getTime()),
    [historyEntries]
  );
  const displayedWorkoutPerformanceHistoryEntries = useMemo(
    () =>
      showAllPerformanceHistory
        ? workoutPerformanceHistoryEntries
        : workoutPerformanceHistoryEntries.slice(0, 5),
    [showAllPerformanceHistory, workoutPerformanceHistoryEntries]
  );
  const remainingWorkoutPerformanceHistoryCount = Math.max(
    workoutPerformanceHistoryEntries.length - displayedWorkoutPerformanceHistoryEntries.length,
    0
  );
  const repsBlocks = useMemo(
    () => blocks.filter((block) => block.block_type === 'reps' && block.name.trim().length > 0),
    [blocks]
  );
  const exercisePerformanceSnapshotsByName = useMemo(
    () =>
      new Map<string, ExercisePerformanceSnapshot[]>(
        repsBlocks.map((block) => {
          const normalizedBlockName = block.name.trim().toLowerCase();
          const snapshots = workoutPerformanceHistoryEntries
            .map((historyEntry) => {
              const matchingSets = historyEntry.actualSets.filter(
                (setEntry) =>
                  setEntry.status === 'completed' &&
                  setEntry.block_name.trim().toLowerCase() === normalizedBlockName
              );

              if (matchingSets.length === 0) return null;

              const summary = formatPerformanceSetSummary(matchingSets);
              if (!summary) return null;

              return {
                historyId: historyEntry.id,
                completedAt: historyEntry.completedAt,
                blockName: block.name.trim(),
                summary,
              } satisfies ExercisePerformanceSnapshot;
            })
            .filter((entry): entry is ExercisePerformanceSnapshot => Boolean(entry))
            .slice(0, 2);

          return [normalizedBlockName, snapshots];
        })
      ),
    [repsBlocks, workoutPerformanceHistoryEntries]
  );
  const actualPerformanceRecords = useMemo<ActualPerformanceRecord[]>(() => {
    if (repsBlocks.length === 0 || workoutPerformanceHistoryEntries.length === 0) {
      return [];
    }

    return repsBlocks
      .map((block) => {
        const normalizedBlockName = block.name.trim().toLowerCase();
        const matchingHistoryEntries = workoutPerformanceHistoryEntries
          .map((historyEntry) => {
            const matchingSets = historyEntry.actualSets.filter(
              (setEntry) =>
                setEntry.status === 'completed' &&
                setEntry.block_name.trim().toLowerCase() === normalizedBlockName
            );

            if (matchingSets.length === 0) return null;

            const workoutVolumeKg = matchingSets.reduce((total, setEntry) => {
              const reps = normalizePositiveInteger(setEntry.actual_reps, 0);
              const charge =
                Number.isFinite(Number(setEntry.actual_charge_kg)) && Number(setEntry.actual_charge_kg) > 0
                  ? Number(setEntry.actual_charge_kg)
                  : 0;
              return total + reps * charge;
            }, 0);

            return {
              completedAt: historyEntry.completedAt,
              matchingSets,
              workoutVolumeKg,
              summary: formatPerformanceSetSummary(matchingSets),
            };
          })
          .filter(
            (
              entry
            ): entry is {
              completedAt: string;
              matchingSets: ActualSetHistoryEntry[];
              workoutVolumeKg: number;
              summary: string | null;
            } => Boolean(entry)
          );

        if (matchingHistoryEntries.length === 0) {
          return null;
        }

        const maxChargeKg = matchingHistoryEntries.reduce((bestCharge, historyEntry) => {
          const entryBest = historyEntry.matchingSets.reduce((setBest, setEntry) => {
            const charge =
              Number.isFinite(Number(setEntry.actual_charge_kg)) && Number(setEntry.actual_charge_kg) > 0
                ? Number(setEntry.actual_charge_kg)
                : 0;
            return Math.max(setBest, charge);
          }, 0);

          return Math.max(bestCharge, entryBest);
        }, 0);

        const bestSetReps = matchingHistoryEntries.reduce((bestReps, historyEntry) => {
          const entryBest = historyEntry.matchingSets.reduce((setBest, setEntry) => {
            const reps = normalizePositiveInteger(setEntry.actual_reps, 0);
            return Math.max(setBest, reps);
          }, 0);

          return Math.max(bestReps, entryBest);
        }, 0);

        const bestWorkoutVolumeKg = matchingHistoryEntries.reduce(
          (bestVolume, historyEntry) => Math.max(bestVolume, historyEntry.workoutVolumeKg),
          0
        );
        const latestEntry = matchingHistoryEntries[0] || null;

        return {
          blockId: block.id,
          exerciseName: block.name.trim(),
          maxChargeKg: maxChargeKg > 0 ? maxChargeKg : null,
          bestSetReps: bestSetReps > 0 ? bestSetReps : null,
          bestWorkoutVolumeKg: bestWorkoutVolumeKg > 0 ? bestWorkoutVolumeKg : null,
          lastPerformedAt: latestEntry?.completedAt || null,
          lastPerformedSummary: latestEntry?.summary || null,
        } satisfies ActualPerformanceRecord;
      })
      .filter((entry): entry is ActualPerformanceRecord => Boolean(entry));
  }, [repsBlocks, workoutPerformanceHistoryEntries]);

  const toggleBlockCompleted = (blockId: string) => {
    setCompletedBlockIds((current) =>
      current.includes(blockId)
        ? current.filter((value) => value !== blockId)
        : [...current, blockId]
    );
  };

  const handleDeleteSession = async () => {
    if (!session || deleting) return;

    const confirmed = window.confirm(
      'Supprimer cette seance ? Tous les blocs lies seront supprimes aussi.'
    );

    if (!confirmed) return;

    setDeleting(true);
    setMessage(null);

    try {
      const { error } = await supabase.from('training_sessions').delete().eq('id', session.id);

      if (error) {
        console.error('Erreur suppression seance :', error);
        setMessage("Impossible de supprimer la seance pour le moment.");
        return;
      }

      queuePendingToast({ message: 'Seance supprimee', tone: 'info' });
      router.push('/sessions');
    } catch (error) {
      console.error('Erreur inattendue suppression seance :', error);
      setMessage("Une erreur inattendue s'est produite.");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <AppShell>
      <section className="sessions-page sessions-page--dark">
        <Link href="/sessions" className="detail-back-link">
          &larr; Retour aux seances
        </Link>

        {loading ? (
          <div className="challenge-state">
            <p>Chargement de la seance...</p>
          </div>
        ) : !session ? (
          <div className="challenge-state">
            <p>{message || 'Cette seance est introuvable.'}</p>
            <div className="session-empty-actions">
              <Link href="/sessions" className="button primary">
                Revenir a mes seances
              </Link>
            </div>
          </div>
        ) : (
          <>
            <SessionSummaryHeader
              sportBadge={
                <div className={getSportBadgeClassName(session.sport, 'badge', 'Sport')}>
                  {formatSportBadgeLabel(session.sport, 'Sport')}
                </div>
              }
              title={session.name}
              description={session.description || 'Aucune description pour le moment.'}
              progressLabel={`${completedBlocksCount} / ${blocks.length || 0} blocs - ${globalProgressPercent}%`}
              actions={
                <>
                  <Link href={`/sessions/${session.id}/live`} className="button primary">
                    Demarrer la seance
                  </Link>
                  <Link href={`/sessions/${session.id}/edit`} className="button ghost">
                    Modifier
                  </Link>
                  <Link href="/sessions/new" className="button ghost">
                    Nouvelle seance
                  </Link>
                  <button
                    type="button"
                    className="button ghost session-delete-button"
                    onClick={handleDeleteSession}
                    disabled={deleting}
                    aria-busy={deleting}
                  >
                    {deleting ? 'Suppression...' : 'Supprimer'}
                  </button>
                </>
              }
              stats={[
                { label: 'Sport', value: formatSportBadgeLabel(session.sport, 'Sport') },
                {
                  label: 'Duree estimee',
                  value: formatDurationLabel(averageDurationSeconds) || '-',
                },
                { label: 'Blocs', value: blocks.length },
                { label: 'Struct.', value: totalStructuredBlocks },
                { label: 'Volume total', value: formatSessionVolumeKg(sessionTotalVolume) || '-' },
                { label: 'Creee', value: formatRelativeDate(session.created_at) },
              ]}
            />

            <article className="card session-form-card stack">
              <div className="session-blocks-header">
                <div>
                  <span className="section-kicker">Blocs</span>
                  <h2>Plan de la seance</h2>
                </div>
                {blocks.length > 0 && (
                  <span className="session-progress-pill">
                    {completedBlocksCount} / {blocks.length} blocs realises
                  </span>
                )}
              </div>

              {message && <p className="form-feedback form-feedback--error">{message}</p>}

              {allBlocksCompleted && (
                <p className="form-feedback form-feedback--success">Seance terminee</p>
              )}

              {blocks.length === 0 ? (
                <div className="challenge-state challenge-state--compact">
                  <p>Aucun bloc ajoute pour le moment.</p>
                </div>
              ) : (
                <div className="session-block-list session-block-list--compact">
                  {blocks.map((block, index) => {
                    const isCompleted = completedBlockIds.includes(block.id);
                    const isCurrent = !isCompleted && index === (firstPendingBlockIndex === -1 ? 0 : firstPendingBlockIndex);
                    const blockVolume = getSessionBlockVolumeKg(
                      block.block_type,
                      block.target_value,
                      block.sets_count,
                      block.charge_kg
                    );

                    return (
                      <CompactExerciseCard
                        key={block.id}
                        index={index}
                        block={block}
                        isCompleted={isCompleted}
                        isCurrent={isCurrent}
                        completedSets={isCompleted ? Number(block.sets_count || 1) : 0}
                        actionLabel={isCompleted ? 'Termine' : isCurrent ? 'Continuer' : 'Demarrer'}
                        onAction={isCompleted ? undefined : () => toggleBlockCompleted(block.id)}
                        actionDisabled={isCompleted}
                        subtitle={`Bloc ${index + 1} - ${getSessionBlockTypeLabel(block.block_type)}`}
                        details={
                          <div className="compact-exercise-card__details-grid">
                            <div>
                              <span>Objectif</span>
                              <strong>{formatBlockMainValue(block)}</strong>
                            </div>
                            <div>
                              <span>Repos</span>
                              <strong>{formatSessionRestSeconds(block.rest_seconds) || 'Sans repos'}</strong>
                            </div>
                            <div>
                              <span>Etat</span>
                              <strong>{isCompleted ? 'Termine' : isCurrent ? 'En cours' : 'A faire'}</strong>
                            </div>
                            <div>
                              <span>Volume</span>
                              <strong>{formatSessionVolumeKg(blockVolume) || '-'}</strong>
                            </div>
                          </div>
                        }
                      />
                    );
                  })}
                </div>
              )}
            </article>

            <article className="card session-form-card stack">
              <div className="session-blocks-header">
                <div>
                  <span className="section-kicker">Stats</span>
                  <h2>Stats de la seance</h2>
                </div>
              </div>

              <div className="session-detail-meta">
                <div className="session-meta-card">
                  <span>Seances realisees</span>
                  <strong>{totalRealizations}</strong>
                </div>
                <div className="session-meta-card">
                  <span>Derniere realisation</span>
                  <strong>{lastCompletedAt ? formatRelativeDate(lastCompletedAt) : '-'}</strong>
                </div>
                <div className="session-meta-card">
                  <span>Meilleure duree</span>
                  <strong>{formatDurationLabel(sessionRecordSummary.longestDurationSeconds) || '-'}</strong>
                </div>
                <div className="session-meta-card">
                  <span>Volume total cumule</span>
                  <strong>{formatSessionVolumeKg(totalCumulativeVolume) || '-'}</strong>
                </div>
                <div className="session-meta-card">
                  <span>Meilleure seance en volume</span>
                  <strong>{formatSessionVolumeKg(sessionRecordSummary.bestVolumeKg) || '-'}</strong>
                </div>
              </div>

              {historyEntries.length === 0 && (
                <div className="challenge-state challenge-state--compact">
                  <p>Pas encore de seance realisee.</p>
                </div>
              )}
            </article>

            <article className="card session-form-card stack">
              <div className="session-blocks-header">
                <div>
                  <span className="section-kicker">Progression</span>
                  <h2>Progression</h2>
                </div>
              </div>

              {chartMetricEntries.length < 2 || chartMaxValue <= 0 ? (
                <div className="challenge-state challenge-state--compact">
                  <p>Termine plusieurs fois cette seance pour suivre ta progression.</p>
                </div>
              ) : (
                <div className="session-progress-chart">
                  <div className="session-progress-chart__header">
                    <span>{chartMetricLabel || 'Progression'}</span>
                    <strong>{chartMetricEntries.length} derniere(s) seance(s)</strong>
                  </div>

                  <div className="session-progress-chart__svg-wrap">
                    <svg viewBox="0 0 100 100" className="session-progress-chart__svg" preserveAspectRatio="none">
                      <path d="M 0 100 L 100 100" className="session-progress-chart__axis" />
                      <path d={chartPath} className="session-progress-chart__line" />
                      {chartPoints.map((point) => (
                        <circle
                          key={point.label + point.x}
                          cx={point.x}
                          cy={point.y}
                          r="2.8"
                          className="session-progress-chart__point"
                        />
                      ))}
                    </svg>

                    <div className="session-progress-chart__labels">
                      {chartMetricEntries.map((entry) => (
                        <div key={entry.id} className="session-progress-chart__label-item">
                          <strong>{entry.formattedValue || '-'}</strong>
                          <span>{entry.label}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </article>

            <article className="card session-form-card stack">
              <div className="session-blocks-header">
                <div>
                  <span className="section-kicker">Records</span>
                  <h2>🏆 Records personnels</h2>
                </div>
              </div>

              {actualPerformanceRecords.length === 0 ? (
                <div className="challenge-state challenge-state--compact">
                  <p>Aucun record disponible pour le moment.</p>
                </div>
              ) : (
                <div className="session-block-list session-records-list">
                  {actualPerformanceRecords.map((record) => (
                    <article key={record.blockId} className="session-block-card session-record-card">
                      <div className="session-block-card__top">
                        <div className="session-record-card__header">
                          <SessionExerciseIcon
                            exerciseName={record.exerciseName}
                            sport={session.sport}
                            blockType="reps"
                            size="md"
                          />
                          <div className="session-block-check__label">
                            <strong>{record.exerciseName}</strong>
                            <small>{record.lastPerformedAt ? formatRelativeDate(record.lastPerformedAt) : 'Pas encore realise'}</small>
                          </div>
                        </div>
                      </div>

                      <div className="session-record-lines">
                        <p>
                          Charge max : <strong>{record.maxChargeKg ? `${record.maxChargeKg} kg` : '-'}</strong>
                        </p>
                        <p>
                          Meilleure serie : <strong>{record.bestSetReps ? `${record.bestSetReps} reps` : '-'}</strong>
                        </p>
                        <p>
                          Volume record : <strong>{formatSessionVolumeKg(record.bestWorkoutVolumeKg) || '-'}</strong>
                        </p>
                        <p>
                          Derniere realisation : <strong>{record.lastPerformedSummary || '-'}</strong>
                        </p>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </article>

            <article className="card session-form-card stack">
              <div className="session-blocks-header">
                <div>
                  <span className="section-kicker">Exercices</span>
                  <h2>Progression par exercice</h2>
                </div>
              </div>

              {exerciseStatsCards.length === 0 ? (
                <div className="challenge-state challenge-state--compact">
                  <p>Realise cet exercice pour debloquer les statistiques.</p>
                </div>
              ) : (
                <div className="stack">
                  <div className="session-records-list">
                    {exerciseStatsCards.map((entry) => (
                      <button
                        key={entry.exerciseName}
                        type="button"
                        className={`session-block-card session-record-card session-exercise-stat-card${
                          selectedExerciseStats?.exerciseName === entry.exerciseName ? ' is-active' : ''
                        }`}
                        onClick={() => setSelectedExerciseName(entry.exerciseName)}
                      >
                        <div className="session-block-card__top">
                          <div className="session-record-card__header">
                            <SessionExerciseIcon
                              exerciseName={entry.exerciseName}
                              sport={session.sport}
                              size="md"
                            />
                            <div className="session-block-check__label">
                              <strong>{entry.exerciseName}</strong>
                              <small>{entry.completedCount} fois realise</small>
                            </div>
                          </div>
                        </div>

                        <div className="session-record-lines">
                          <p>
                            Realisations : <strong>{entry.completedCount}</strong>
                          </p>
                          <p>
                            Derniere fois : <strong>{entry.lastCompletedAt ? formatRelativeDate(entry.lastCompletedAt) : '-'}</strong>
                          </p>
                          {entry.maxChargeKg ? (
                            <p>
                              Max : <strong>{entry.maxChargeKg} kg</strong>
                            </p>
                          ) : entry.bestVolumeKg ? (
                            <p>
                              Volume max : <strong>{formatSessionVolumeKg(entry.bestVolumeKg)}</strong>
                            </p>
                          ) : entry.maxReps ? (
                            <p>
                              Reps max : <strong>{entry.maxReps} reps</strong>
                            </p>
                          ) : entry.bestDurationSeconds ? (
                            <p>
                              Duree max : <strong>{formatDurationLabel(entry.bestDurationSeconds)}</strong>
                            </p>
                          ) : (
                            <p>
                              Progression : <strong>Aucune valeur chiffree</strong>
                            </p>
                          )}
                          <p>
                            Volume total : <strong>{formatSessionVolumeKg(entry.cumulativeVolumeKg) || '-'}</strong>
                          </p>
                          {entry.trendLabel ? (
                            <p>
                              Tendance : <strong>{entry.trendLabel}</strong>
                            </p>
                          ) : null}
                        </div>
                      </button>
                    ))}
                  </div>

                  {selectedExerciseStats ? (
                    <article className="session-block-card session-exercise-stat-detail">
                      <div className="session-block-card__top">
                        <div className="session-record-card__header">
                          <SessionExerciseIcon
                            exerciseName={selectedExerciseStats.exerciseName}
                            sport={session.sport}
                            size="md"
                          />
                          <div className="session-block-check__label">
                            <strong>{selectedExerciseStats.exerciseName}</strong>
                            <small>Detail et progression</small>
                          </div>
                        </div>
                        <span className="session-block-chip">
                          {selectedExerciseStats.progressionMetricLabel || 'Stats'}
                        </span>
                      </div>

                      <div className="session-detail-meta">
                        <div className="session-meta-card">
                          <span>Realisations</span>
                          <strong>{selectedExerciseStats.completedCount}</strong>
                        </div>
                        <div className="session-meta-card">
                          <span>Derniere fois</span>
                          <strong>{selectedExerciseStats.lastCompletedAt ? formatRelativeDate(selectedExerciseStats.lastCompletedAt) : '-'}</strong>
                        </div>
                        <div className="session-meta-card">
                          <span>Volume total</span>
                          <strong>{formatSessionVolumeKg(selectedExerciseStats.cumulativeVolumeKg) || '-'}</strong>
                        </div>
                        <div className="session-meta-card">
                          <span>Reps totales</span>
                          <strong>{selectedExerciseStats.totalReps > 0 ? `${selectedExerciseStats.totalReps} reps` : '-'}</strong>
                        </div>
                        <div className="session-meta-card">
                          <span>Charge max</span>
                          <strong>{selectedExerciseStats.maxChargeKg ? `${selectedExerciseStats.maxChargeKg} kg` : '-'}</strong>
                        </div>
                        <div className="session-meta-card">
                          <span>Volume max</span>
                          <strong>{selectedExerciseStats.bestVolumeKg ? formatSessionVolumeKg(selectedExerciseStats.bestVolumeKg) : '-'}</strong>
                        </div>
                        <div className="session-meta-card">
                          <span>Reps max</span>
                          <strong>{selectedExerciseStats.maxReps ? `${selectedExerciseStats.maxReps} reps` : '-'}</strong>
                        </div>
                        <div className="session-meta-card">
                          <span>Duree max</span>
                          <strong>{selectedExerciseStats.bestDurationSeconds ? formatDurationLabel(selectedExerciseStats.bestDurationSeconds) : '-'}</strong>
                        </div>
                        <div className="session-meta-card">
                          <span>Tendance</span>
                          <strong>{selectedExerciseStats.trendLabel || '-'}</strong>
                        </div>
                      </div>

                      {selectedExerciseChartEntries.length === 0 ? (
                        <div className="challenge-state challenge-state--compact">
                          <p>Pas encore de progression chiffree pour cet exercice.</p>
                        </div>
                      ) : selectedExerciseSingleEntry ? (
                        <div className="session-progress-chart session-progress-chart--single">
                          <div className="session-progress-chart__header">
                            <span>{selectedExerciseStats.progressionMetricLabel}</span>
                            <strong>1 seance</strong>
                          </div>
                          <article className="session-block-card">
                            <div className="session-block-card__top">
                              <div className="session-block-check__label">
                                <strong>{selectedExerciseSingleEntry.formattedValue || '-'}</strong>
                                <small>{selectedExerciseSingleEntry.label}</small>
                              </div>
                            </div>
                          </article>
                        </div>
                      ) : (
                        <div className="session-progress-chart">
                          <div className="session-progress-chart__header">
                            <span>{selectedExerciseStats.progressionMetricLabel || 'Progression'}</span>
                            <strong>{selectedExerciseChartEntries.length} derniere(s) seance(s)</strong>
                          </div>

                          <div className="session-progress-chart__svg-wrap">
                            <svg viewBox="0 0 100 100" className="session-progress-chart__svg" preserveAspectRatio="none">
                              <path d="M 0 100 L 100 100" className="session-progress-chart__axis" />
                              <path d={selectedExerciseChartPath} className="session-progress-chart__line" />
                              {selectedExerciseChartPoints.map((point) => (
                                <circle
                                  key={point.label + point.x}
                                  cx={point.x}
                                  cy={point.y}
                                  r="2.8"
                                  className="session-progress-chart__point"
                                />
                              ))}
                            </svg>

                            <div className="session-progress-chart__labels">
                              {selectedExerciseChartEntries.map((entry) => (
                                <div key={entry.id} className="session-progress-chart__label-item">
                                  <strong>{entry.formattedValue || '-'}</strong>
                                  <span>{entry.label}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                      )}
                    </article>
                  ) : null}
                </div>
              )}
            </article>

            <article className="card session-form-card stack">
              <div className="session-blocks-header">
                <div>
                  <span className="section-kicker">Performances</span>
                  <h2>Historique des performances</h2>
                </div>
                {remainingWorkoutPerformanceHistoryCount > 0 ? (
                  <button
                    type="button"
                    className="session-link-button"
                    onClick={() => setShowAllPerformanceHistory((current) => !current)}
                  >
                    {showAllPerformanceHistory ? 'Voir moins' : `Voir plus (${remainingWorkoutPerformanceHistoryCount})`}
                  </button>
                ) : null}
              </div>

              {workoutPerformanceHistoryEntries.length === 0 ? (
                <div className="challenge-state challenge-state--compact">
                  <p>Aucune donnee detaillee disponible.</p>
                </div>
              ) : (
                <div className="session-block-list">
                  {displayedWorkoutPerformanceHistoryEntries.map((entry) => (
                    <article key={entry.id} className="session-block-card session-record-card">
                      <div className="session-block-card__top">
                        <div className="session-block-check__label">
                          <strong>{formatFullDateTimeLabel(entry.completedAt)}</strong>
                          <small>{formatRelativeDate(entry.completedAt)}</small>
                        </div>
                        <span className="session-block-chip">
                          {entry.validatedSets} serie{entry.validatedSets > 1 ? 's' : ''}
                        </span>
                      </div>

                      <div className="session-record-lines">
                        <p>
                          Duree : <strong>{formatDurationLabel(entry.durationSeconds) || '-'}</strong>
                        </p>
                        <p>
                          Series validees : <strong>{entry.validatedSets}</strong>
                        </p>
                        <p>
                          Series passees : <strong>{entry.skippedSets > 0 ? entry.skippedSets : '-'}</strong>
                        </p>
                        <p>
                          Volume total : <strong>{formatSessionVolumeKg(entry.actualVolumeKg) || '-'}</strong>
                        </p>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </article>

            <article className="card session-form-card stack">
              <div className="session-blocks-header">
                <div>
                  <span className="section-kicker">Exercices</span>
                  <h2>Dernieres performances par bloc</h2>
                </div>
              </div>

              {repsBlocks.length === 0 ? (
                <div className="challenge-state challenge-state--compact">
                  <p>Aucun bloc reps sur cette seance.</p>
                </div>
              ) : workoutPerformanceHistoryEntries.length === 0 ? (
                <div className="challenge-state challenge-state--compact">
                  <p>Aucune donnee detaillee disponible.</p>
                </div>
              ) : (
                <div className="session-block-list">
                  {repsBlocks.map((block) => {
                    const snapshots = exercisePerformanceSnapshotsByName.get(block.name.trim().toLowerCase()) || [];
                    const latestSnapshot = snapshots[0] || null;
                    const previousSnapshot = snapshots[1] || null;

                    return (
                      <article key={block.id} className="session-block-card session-record-card">
                        <div className="session-block-card__top">
                          <div className="session-block-check__label">
                            <strong>{block.name.trim()}</strong>
                            <small>{formatSessionBlockSummary(block)}</small>
                          </div>
                        </div>

                        {latestSnapshot ? (
                          <div className="session-record-lines">
                            <p>
                              Derniere realisation : <strong>{latestSnapshot.summary}</strong>
                            </p>
                            <p>
                              {formatRelativeDate(latestSnapshot.completedAt)}
                            </p>
                            <p>
                              Seance precedente : <strong>{previousSnapshot?.summary || '-'}</strong>
                            </p>
                          </div>
                        ) : (
                          <div className="challenge-state challenge-state--compact">
                            <p>Aucune donnee detaillee disponible.</p>
                          </div>
                        )}
                      </article>
                    );
                  })}
                </div>
              )}
            </article>

            <article className="card session-form-card stack">
              <div className="session-blocks-header">
                <div>
                  <span className="section-kicker">Historique</span>
                  <h2>Historique des realisations</h2>
                </div>
                {remainingSessionHistoryCount > 0 ? (
                  <span className="session-progress-pill">+ {remainingSessionHistoryCount} autres realisations</span>
                ) : null}
              </div>

              {historyEntries.length === 0 ? (
                <div className="challenge-state challenge-state--compact">
                  <p>Aucune seance realisee pour le moment.</p>
                </div>
              ) : (
                <div className="session-block-list">
                  {recentSessionHistoryEntries.map((entry) => {
                    const isExpanded = expandedHistoryEntryId === entry.id;

                    return (
                      <article key={entry.id} className="session-block-card session-record-card">
                        <div className="session-block-card__top">
                          <div className="session-record-card__header">
                            <SessionExerciseIcon
                              exerciseName={entry.workout_name}
                              sport={session.sport}
                              size="md"
                            />
                            <div className="session-block-check__label">
                              <strong>{new Date(entry.completed_at).toLocaleDateString('fr-FR')}</strong>
                              <small>{formatRelativeDate(entry.completed_at)}</small>
                            </div>
                          </div>
                          <button
                            type="button"
                            className="session-link-button"
                            onClick={() =>
                              setExpandedHistoryEntryId((currentId) => (currentId === entry.id ? null : entry.id))
                            }
                          >
                            {isExpanded ? 'Masquer le detail' : 'Voir le detail'}
                          </button>
                        </div>

                        <div className="session-record-lines">
                          <p>
                            Duree : <strong>{formatDurationLabel(entry.duration_seconds) || '-'}</strong>
                          </p>
                          <p>
                            Blocs : <strong>{entry.completedExercises} / {entry.totalBlocks}</strong>
                          </p>
                          <p>
                            Calories : <strong>{formatEstimatedWorkoutCalories(entry.estimatedCaloriesValue) || '-'}</strong>
                          </p>
                          <p>
                            Volume : <strong>{formatSessionVolumeKg(entry.totalVolumeKg) || '-'}</strong>
                          </p>
                          <p>
                            Taux de completion : <strong>{entry.completionRate}%</strong>
                          </p>
                        </div>

                        {isExpanded ? (
                          <div className="stack">
                            <div className="session-detail-meta">
                              <div className="session-meta-card">
                                <span>Date complete</span>
                                <strong>{formatFullDateTimeLabel(entry.completed_at)}</strong>
                              </div>
                              <div className="session-meta-card">
                                <span>Duree reelle</span>
                                <strong>{formatDurationLabel(entry.duration_seconds) || '-'}</strong>
                              </div>
                              <div className="session-meta-card">
                                <span>Volume total</span>
                                <strong>{formatSessionVolumeKg(entry.totalVolumeKg) || '-'}</strong>
                              </div>
                              <div className="session-meta-card">
                                <span>Blocs completes</span>
                                <strong>{entry.completedExercises} / {entry.totalBlocks}</strong>
                              </div>
                              <div className="session-meta-card">
                                <span>Blocs passes</span>
                                <strong>{entry.skippedBlocks > 0 ? entry.skippedBlocks : '-'}</strong>
                              </div>
                              <div className="session-meta-card">
                                <span>Series validees</span>
                                <strong>{entry.validatedSets > 0 ? entry.validatedSets : '-'}</strong>
                              </div>
                              <div className="session-meta-card">
                                <span>Series passees</span>
                                <strong>{entry.skippedSets > 0 ? entry.skippedSets : '-'}</strong>
                              </div>
                              <div className="session-meta-card">
                                <span>Repetitions</span>
                                <strong>{entry.totalRepetitions > 0 ? `${entry.totalRepetitions} reps` : '-'}</strong>
                              </div>
                              <div className="session-meta-card">
                                <span>Calories estimees</span>
                                <strong>{formatEstimatedWorkoutCalories(entry.estimatedCaloriesValue) || '-'}</strong>
                              </div>
                              <div className="session-meta-card">
                                <span>XP gagnee</span>
                                <strong>{`${entry.earnedXp} XP`}</strong>
                              </div>
                              <div className="session-meta-card">
                                <span>Seance associee</span>
                                <strong>{entry.workout_name || session.name}</strong>
                              </div>
                              <div className="session-meta-card">
                                <span>Statut</span>
                                <strong>{entry.completionType === 'partial' ? 'Partielle' : 'Terminee'}</strong>
                              </div>
                            </div>

                            <div className="challenge-state challenge-state--compact">
                              <p>
                                Resume : {entry.completedExercises} bloc{entry.completedExercises > 1 ? 's' : ''}{' '}
                                valide{entry.completedExercises > 1 ? 's' : ''}, {entry.validatedSets}{' '}
                                serie{entry.validatedSets > 1 ? 's' : ''}, {entry.skippedSets}{' '}
                                serie{entry.skippedSets > 1 ? 's' : ''} passe{entry.skippedSets > 1 ? 'es' : 'e'} et{' '}
                                {entry.totalRepetitions > 0 ? `${entry.totalRepetitions} repetitions` : 'aucune repetition comptabilisee'}.
                              </p>
                            </div>
                          </div>
                        ) : null}
                      </article>
                    );
                  })}
                </div>
              )}
            </article>

          </>
        )}
      </section>
    </AppShell>
  );
}
