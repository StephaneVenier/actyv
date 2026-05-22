'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { AppShell } from '@/components/AppShell';
import {
  LiveBlockCard,
  LiveBlockPreviewRail,
  LiveControls,
  RestTimerOverlay,
  SessionLiveHeader,
} from '@/components/session-live-ui';
import { queuePendingToast } from '@/components/ToastProvider';
import { formatSportBadgeLabel, getSportBadgeClassName } from '@/components/sport-badge';
import {
  formatEstimatedWorkoutCalories,
  formatSessionVolumeKg,
  getEstimatedWorkoutCalories,
  getSessionBlockTypeLabel,
  getSessionBlockVolumeKg,
  getSessionEstimatedDuration,
  normalizeSessionSetsCount,
} from '@/lib/session-blocks';
import { supabase } from '@/lib/supabase';
import { fetchTrainingSessionBlocks, TrainingSessionBlockRecord } from '@/lib/training-session-blocks-db';

type TrainingSession = {
  id: string;
  user_id: string;
  name: string;
  sport: string | null;
  description: string | null;
  created_at: string | null;
};

type LiveState = {
  currentIndex: number;
  completedBlockIds: string[];
  completedSetsByBlockId: Record<string, number>;
  restAfterBlockId: string | null;
  restResumeIndex: number | null;
  restSecondsLeft: number;
  elapsedSeconds: number;
  isTimerPaused: boolean;
  runKey: string;
  historySaved: boolean;
};

type NewPersonalRecord = {
  exerciseName: string;
  metric: 'reps' | 'charge' | 'volume' | 'duration';
  previousValue: number;
  value: number;
};

const DEFAULT_REST_SECONDS = 60;

function formatElapsedDuration(totalSeconds: number) {
  const normalizedSeconds = Math.max(0, Math.trunc(totalSeconds));
  const minutes = Math.floor(normalizedSeconds / 60);
  const seconds = normalizedSeconds % 60;

  return `${minutes} min ${seconds.toString().padStart(2, '0')} sec`;
}

function createLiveRunKey() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function triggerHaptic(pattern: number | number[]) {
  if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
    navigator.vibrate(pattern);
  }
}

function formatPersonalRecordValue(metric: NewPersonalRecord['metric'], value: number) {
  if (!Number.isFinite(value) || value <= 0) {
    return '-';
  }

  if (metric === 'reps') {
    return `${value} reps`;
  }

  if (metric === 'charge') {
    return `${value} kg`;
  }

  if (metric === 'volume') {
    return formatSessionVolumeKg(value) || `${value} kg`;
  }

  return formatElapsedDuration(value);
}

export default function LiveSessionPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const id = Array.isArray(params?.id) ? params.id[0] : (params?.id as string | undefined) || '';
  const programSessionId = searchParams.get('programSessionId');
  const programId = searchParams.get('programId');

  const [session, setSession] = useState<TrainingSession | null>(null);
  const [blocks, setBlocks] = useState<TrainingSessionBlockRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [historyMessage, setHistoryMessage] = useState<string | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [completedBlockIds, setCompletedBlockIds] = useState<string[]>([]);
  const [completedSetsByBlockId, setCompletedSetsByBlockId] = useState<Record<string, number>>({});
  const [restAfterBlockId, setRestAfterBlockId] = useState<string | null>(null);
  const [restResumeIndex, setRestResumeIndex] = useState<number | null>(null);
  const [restSecondsLeft, setRestSecondsLeft] = useState(DEFAULT_REST_SECONDS);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [isTimerPaused, setIsTimerPaused] = useState(false);
  const [runKey, setRunKey] = useState('');
  const [historySaved, setHistorySaved] = useState(false);
  const [newPersonalRecords, setNewPersonalRecords] = useState<NewPersonalRecord[]>([]);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'success' | 'error'>('idle');
  const [validationFeedback, setValidationFeedback] = useState<string | null>(null);

  const liveStorageKey = `actyv.session.live.${id}`;

  const clearPersistedLiveState = useCallback(() => {
    if (typeof window === 'undefined') return;

    try {
      window.localStorage.removeItem(liveStorageKey);
    } catch (error) {
      console.error('Erreur suppression etat live seance :', error);
    }
  }, [liveStorageKey]);

  useEffect(() => {
    if (!id) {
      setLoading(false);
      setSession(null);
      setBlocks([]);
      setMessage('Impossible de charger cette seance.');
      return;
    }

    const loadSession = async () => {
      setLoading(true);
      setMessage(null);
      setHistoryMessage(null);

      try {
        const {
          data: { user },
          error: userError,
        } = await supabase.auth.getUser();

        if (userError || !user) {
          if (userError) {
            console.error('Erreur chargement user seance live :', userError);
          }
          setMessage('Connecte-toi pour lancer cette seance.');
          setSession(null);
          setBlocks([]);
          return;
        }

        const { data: sessionRow, error: sessionError } = await supabase
          .from('training_sessions')
          .select('id, user_id, name, sport, description, created_at')
          .eq('id', id)
          .eq('user_id', user.id)
          .maybeSingle();

        if (sessionError) {
          console.error('Erreur chargement seance live :', sessionError);
          setMessage('Impossible de charger cette seance.');
          setSession(null);
          setBlocks([]);
          return;
        }

        if (!sessionRow) {
          setSession(null);
          setBlocks([]);
          return;
        }

        setSession(sessionRow as TrainingSession);

        const { data: blockRows, error: blocksError } = await fetchTrainingSessionBlocks([id]);

        if (blocksError) {
          console.error('Erreur chargement blocs live :', blocksError);
          setMessage('Impossible de charger les blocs de cette seance.');
          setBlocks([]);
          return;
        }

        setBlocks(blockRows || []);
      } finally {
        setLoading(false);
      }
    };

    loadSession();
  }, [id]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    try {
      const savedValue = window.localStorage.getItem(liveStorageKey);
      if (!savedValue) return;

      const parsedValue = JSON.parse(savedValue) as Partial<LiveState>;
      if (parsedValue.historySaved === true) {
        clearPersistedLiveState();
        setCurrentIndex(0);
        setCompletedBlockIds([]);
        setCompletedSetsByBlockId({});
        setRestAfterBlockId(null);
        setRestResumeIndex(null);
        setRestSecondsLeft(DEFAULT_REST_SECONDS);
        setElapsedSeconds(0);
        setIsTimerPaused(false);
        setHistorySaved(false);
        setHistoryMessage(null);
        setSaveState('idle');
        setNewPersonalRecords([]);
        setRunKey(createLiveRunKey());
        return;
      }

      if (typeof parsedValue.currentIndex === 'number') {
        setCurrentIndex(parsedValue.currentIndex);
      }
      if (Array.isArray(parsedValue.completedBlockIds)) {
        setCompletedBlockIds(parsedValue.completedBlockIds.filter(Boolean));
      }
      if (parsedValue.completedSetsByBlockId && typeof parsedValue.completedSetsByBlockId === 'object') {
        const nextCompletedSets = Object.fromEntries(
          Object.entries(parsedValue.completedSetsByBlockId).filter(
            ([blockId, completedSets]) =>
              Boolean(blockId) && typeof completedSets === 'number' && Number.isFinite(completedSets)
          )
        );
        setCompletedSetsByBlockId(nextCompletedSets);
      }
      if (
        typeof parsedValue.restAfterBlockId === 'string' ||
        parsedValue.restAfterBlockId === null
      ) {
        setRestAfterBlockId(parsedValue.restAfterBlockId ?? null);
      }
      if (
        typeof parsedValue.restResumeIndex === 'number' &&
        Number.isFinite(parsedValue.restResumeIndex)
      ) {
        setRestResumeIndex(Math.max(0, Math.floor(parsedValue.restResumeIndex)));
      }
      if (
        typeof parsedValue.restSecondsLeft === 'number' &&
        Number.isFinite(parsedValue.restSecondsLeft)
      ) {
        setRestSecondsLeft(Math.max(0, Math.floor(parsedValue.restSecondsLeft)));
      }
      if (
        typeof parsedValue.elapsedSeconds === 'number' &&
        Number.isFinite(parsedValue.elapsedSeconds)
      ) {
        setElapsedSeconds(Math.max(0, Math.floor(parsedValue.elapsedSeconds)));
      }
      if (typeof parsedValue.isTimerPaused === 'boolean') {
        setIsTimerPaused(parsedValue.isTimerPaused);
      }
      if (typeof parsedValue.runKey === 'string' && parsedValue.runKey.trim().length > 0) {
        setRunKey(parsedValue.runKey);
      }
      if (typeof parsedValue.historySaved === 'boolean') {
        setHistorySaved(parsedValue.historySaved);
      }
    } catch (error) {
      console.error('Erreur lecture etat live seance :', error);
    }
  }, [clearPersistedLiveState, liveStorageKey]);

  useEffect(() => {
    if (!runKey) {
      setRunKey(createLiveRunKey());
    }
  }, [runKey]);

  useEffect(() => {
    if (!validationFeedback) return;

    const timeoutId = window.setTimeout(() => {
      setValidationFeedback(null);
    }, 900);

    return () => window.clearTimeout(timeoutId);
  }, [validationFeedback]);

  const completedBlocksCount = useMemo(
    () => blocks.filter((block) => completedBlockIds.includes(block.id)).length,
    [blocks, completedBlockIds]
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
  const estimatedDurationSeconds = useMemo(() => getSessionEstimatedDuration(blocks), [blocks]);
  const estimatedCalories = useMemo(
    () => getEstimatedWorkoutCalories(elapsedSeconds, session?.sport),
    [elapsedSeconds, session?.sport]
  );
  const allBlocksCompleted = blocks.length > 0 && completedBlocksCount === blocks.length;
  const globalProgressPercent =
    blocks.length > 0 ? Math.min(100, Math.max(0, Math.round((completedBlocksCount / blocks.length) * 100))) : 0;
  const currentBlock = blocks[currentIndex] || null;
  const restSourceBlock = useMemo(
    () => blocks.find((block) => block.id === restAfterBlockId) || null,
    [blocks, restAfterBlockId]
  );
  const currentBlockSetsTotal = currentBlock ? normalizeSessionSetsCount(currentBlock.sets_count) : 1;
  const currentBlockRestSeconds =
    currentBlock && Number.isFinite(Number(currentBlock.rest_seconds))
      ? Math.max(0, Math.trunc(Number(currentBlock.rest_seconds)))
      : DEFAULT_REST_SECONDS;
  const restSourceBlockRestSeconds =
    restSourceBlock && Number.isFinite(Number(restSourceBlock.rest_seconds))
      ? Math.max(0, Math.trunc(Number(restSourceBlock.rest_seconds)))
      : currentBlockRestSeconds;
  const currentBlockVolume = currentBlock
    ? getSessionBlockVolumeKg(
        currentBlock.block_type,
        currentBlock.target_value,
        currentBlock.sets_count,
        currentBlock.charge_kg
      )
    : null;
  const rawCurrentCompletedSets = currentBlock ? Number(completedSetsByBlockId[currentBlock.id] ?? 0) : 0;
  const currentCompletedSets = currentBlock
    ? Math.min(
        Number.isFinite(rawCurrentCompletedSets) ? Math.max(Math.trunc(rawCurrentCompletedSets), 0) : 0,
        currentBlockSetsTotal
      )
    : 0;
  const usesSetBySetValidation =
    Boolean(currentBlock) &&
    currentBlockSetsTotal > 1 &&
    !completedBlockIds.includes(currentBlock.id);
  const displayedSeriesStep = currentBlock
    ? Math.min(currentCompletedSets + (completedBlockIds.includes(currentBlock.id) ? 0 : 1), currentBlockSetsTotal)
    : 1;
  const isResting = Boolean(restAfterBlockId) && !allBlocksCompleted;
  const currentSeriesLabel = currentBlock
    ? usesSetBySetValidation
      ? `Serie ${Math.max(displayedSeriesStep, 1)} / ${currentBlockSetsTotal}`
      : currentBlockSetsTotal > 1
        ? `${currentBlockSetsTotal} series prevues`
        : 'Bloc unique'
    : '-';
  const currentBlockName = currentBlock?.name?.trim() || (currentBlock ? `Bloc ${currentIndex + 1}` : 'Bloc');
  const restingBlockName =
    restSourceBlock?.name?.trim() ||
    (restSourceBlock ? `Bloc ${restSourceBlock.position + 1}` : currentBlockName);
  const finishStateLabel =
    saveState === 'saving'
      ? 'Enregistrement...'
      : saveState === 'success'
        ? 'Seance enregistree'
        : saveState === 'error'
          ? "Erreur d'enregistrement"
          : 'Clique sur Terminer pour enregistrer ta seance.';

  useEffect(() => {
    if (typeof window === 'undefined' || blocks.length === 0) return;

    const validBlockIds = new Set(blocks.map((block) => block.id));
    const sanitizedIds = completedBlockIds.filter((blockId) => validBlockIds.has(blockId));

    if (sanitizedIds.length !== completedBlockIds.length) {
      setCompletedBlockIds(sanitizedIds);
      return;
    }

    const sanitizedCompletedSetsByBlockId = Object.fromEntries(
      Object.entries(completedSetsByBlockId)
        .filter(([blockId]) => validBlockIds.has(blockId))
        .map(([blockId, completedSets]) => {
          const matchingBlock = blocks.find((block) => block.id === blockId);
          const maxSets = normalizeSessionSetsCount(matchingBlock?.sets_count ?? 1);
          return [blockId, Math.min(Math.max(Math.trunc(completedSets), 0), maxSets)];
        })
    );

    if (
      JSON.stringify(sanitizedCompletedSetsByBlockId) !== JSON.stringify(completedSetsByBlockId)
    ) {
      setCompletedSetsByBlockId(sanitizedCompletedSetsByBlockId);
      return;
    }

    const sanitizedRestAfterBlockId =
      restAfterBlockId && validBlockIds.has(restAfterBlockId) ? restAfterBlockId : null;

    if (sanitizedRestAfterBlockId !== restAfterBlockId) {
      setRestAfterBlockId(sanitizedRestAfterBlockId);
      return;
    }

    const nextResumeIndex =
      typeof restResumeIndex === 'number' && Number.isFinite(restResumeIndex)
        ? Math.min(Math.max(restResumeIndex, 0), Math.max(blocks.length - 1, 0))
        : null;

    if (nextResumeIndex !== restResumeIndex) {
      setRestResumeIndex(nextResumeIndex);
      return;
    }

    const nextIndex = Math.min(Math.max(currentIndex, 0), Math.max(blocks.length - 1, 0));
    if (nextIndex !== currentIndex) {
      setCurrentIndex(nextIndex);
      return;
    }

    try {
      const payload: LiveState = {
        currentIndex: nextIndex,
        completedBlockIds: sanitizedIds,
        completedSetsByBlockId: sanitizedCompletedSetsByBlockId,
        restAfterBlockId: sanitizedRestAfterBlockId,
        restResumeIndex: nextResumeIndex,
        restSecondsLeft,
        elapsedSeconds,
        isTimerPaused,
        runKey,
        historySaved,
      };
      window.localStorage.setItem(liveStorageKey, JSON.stringify(payload));
    } catch (error) {
      console.error('Erreur sauvegarde etat live seance :', error);
    }
  }, [
    blocks,
    completedBlockIds,
    completedSetsByBlockId,
    currentIndex,
    liveStorageKey,
    restAfterBlockId,
    restResumeIndex,
    restSecondsLeft,
    elapsedSeconds,
    isTimerPaused,
    runKey,
    historySaved,
  ]);

  useEffect(() => {
    if (!isResting || restSecondsLeft <= 0) return;

    const timeoutId = window.setTimeout(() => {
      setRestSecondsLeft((current) => Math.max(0, current - 1));
    }, 1000);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [isResting, restSecondsLeft]);

  useEffect(() => {
    if (!isResting || restSecondsLeft > 0) return;

    triggerHaptic([20, 35, 20]);
    const nextIndex =
      typeof restResumeIndex === 'number' && Number.isFinite(restResumeIndex)
        ? Math.min(Math.max(restResumeIndex, 0), Math.max(blocks.length - 1, 0))
        : currentIndex;

    setCurrentIndex(nextIndex);
    setRestAfterBlockId(null);
    setRestResumeIndex(null);
    setRestSecondsLeft(DEFAULT_REST_SECONDS);
  }, [blocks.length, currentIndex, isResting, restResumeIndex, restSecondsLeft]);

  useEffect(() => {
    if (loading || !session || blocks.length === 0 || allBlocksCompleted || isTimerPaused) return;

    const timeoutId = window.setTimeout(() => {
      setElapsedSeconds((current) => current + 1);
    }, 1000);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [allBlocksCompleted, blocks.length, isTimerPaused, loading, session, elapsedSeconds]);

  const clearRestState = () => {
    setRestAfterBlockId(null);
    setRestResumeIndex(null);
    setRestSecondsLeft(DEFAULT_REST_SECONDS);
  };

  const goToPrevious = () => {
    clearRestState();
    setCurrentIndex((value) => Math.max(value - 1, 0));
  };

  const goToNext = () => {
    clearRestState();
    setCurrentIndex((value) => Math.min(value + 1, Math.max(blocks.length - 1, 0)));
  };

  const goToNextExercise = () => {
    clearRestState();
    setCurrentIndex((value) => Math.min(value + 1, Math.max(blocks.length - 1, 0)));
  };

  const goToBlockIndex = (index: number) => {
    clearRestState();
    setCurrentIndex(Math.min(Math.max(index, 0), Math.max(blocks.length - 1, 0)));
  };

  const adjustRestSeconds = (delta: number) => {
    setRestSecondsLeft((current) => Math.max(0, current + delta));
  };

  const beginRest = (sourceBlockId: string, nextIndex: number, restSeconds: number) => {
    const normalizedRest = Number.isFinite(Number(restSeconds)) ? Math.max(0, Math.trunc(Number(restSeconds))) : 0;

    if (normalizedRest <= 0) {
      clearRestState();
      setCurrentIndex(Math.min(Math.max(nextIndex, 0), Math.max(blocks.length - 1, 0)));
      return;
    }

    setRestAfterBlockId(sourceBlockId);
    setRestResumeIndex(Math.min(Math.max(nextIndex, 0), Math.max(blocks.length - 1, 0)));
    setRestSecondsLeft(normalizedRest);
  };

  const resetLiveProgress = () => {
    setCompletedBlockIds([]);
    setCompletedSetsByBlockId({});
    setCurrentIndex(0);
    setElapsedSeconds(0);
    setIsTimerPaused(false);
    setHistorySaved(false);
    setHistoryMessage(null);
    setNewPersonalRecords([]);
    setSaveState('idle');
    setRunKey(createLiveRunKey());
    clearRestState();
    clearPersistedLiveState();
  };

  const completeCurrentExercise = () => {
    if (!currentBlock) return;

    setCompletedBlockIds((current) =>
      current.includes(currentBlock.id) ? current : [...current, currentBlock.id]
    );

    if (currentIndex >= blocks.length - 1) {
      clearRestState();
      return;
    }

    beginRest(currentBlock.id, currentIndex + 1, currentBlockRestSeconds);
  };

  const handleValidateCurrent = () => {
    if (!currentBlock) return;

    triggerHaptic(18);
    setValidationFeedback(usesSetBySetValidation ? 'Serie validee' : 'Bloc valide');

    if (usesSetBySetValidation) {
      const nextCompletedSets = Math.min(currentCompletedSets + 1, currentBlockSetsTotal);

      setCompletedSetsByBlockId((current) => ({
        ...current,
        [currentBlock.id]: nextCompletedSets,
      }));

      if (nextCompletedSets >= currentBlockSetsTotal) {
        completeCurrentExercise();
      } else {
        beginRest(currentBlock.id, currentIndex, currentBlockRestSeconds);
      }

      return;
    }

    setCompletedSetsByBlockId((current) => ({
      ...current,
      [currentBlock.id]: currentBlockSetsTotal,
    }));

    completeCurrentExercise();
  };

  const saveCompletedSession = useCallback(async () => {
    if (!allBlocksCompleted || historySaved || !session || !runKey || saveState === 'saving') {
      return false;
    }

    setSaveState('saving');
    setHistoryMessage(null);

    try {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        console.error('Workout history insert error:', userError || new Error('No authenticated user'));
        setHistoryMessage("Impossible d'enregistrer l'historique de la seance.");
        setSaveState('error');
        return false;
      }

      const normalizedDurationSeconds = Number.isFinite(Number(elapsedSeconds))
        ? Number(elapsedSeconds)
        : 0;
      const normalizedEstimatedCalories = Number.isFinite(Number(estimatedCalories))
        ? Number(estimatedCalories)
        : 0;
      const normalizedTotalVolume = Number.isFinite(Number(sessionTotalVolume))
        ? Number(sessionTotalVolume)
        : 0;
      const normalizedCompletedExercises = Number.isFinite(Number(blocks.length))
        ? Number(blocks.length)
        : 0;

      const payload = {
        user_id: user.id,
        workout_id: session.id,
        workout_name: session.name,
        completed_at: new Date().toISOString(),
        duration_seconds: normalizedDurationSeconds,
        estimated_calories: normalizedEstimatedCalories,
        total_volume: normalizedTotalVolume,
        completed_exercises: normalizedCompletedExercises,
      };

      console.log('Workout history payload:', payload);
      let completionMessage: string | null = null;

      const { data, error } = await supabase
        .from('workout_sessions_history')
        .insert(payload)
        .select(
          'id, workout_id, user_id, workout_name, duration_seconds, estimated_calories, total_volume, completed_exercises, completed_at'
        )
        .single();

      if (error) {
        console.error('Workout history insert error:', error);
        setHistoryMessage("Impossible d'enregistrer l'historique de la seance.");
        setSaveState('error');
        return false;
      }

      let exerciseHistoryMessage: string | null = null;

      const exerciseHistoryPayload = blocks
        .filter((block) => block.name.trim().length > 0)
        .map((block) => {
          const normalizedSetsCount = normalizeSessionSetsCount(block.sets_count);
          const normalizedTargetValue =
            Number.isFinite(Number(block.target_value)) && Number(block.target_value) > 0
              ? Number(block.target_value)
              : 0;
          const normalizedChargeKg =
            Number.isFinite(Number(block.charge_kg)) && Number(block.charge_kg) > 0 ? Number(block.charge_kg) : 0;
          const computedBlockVolume = getSessionBlockVolumeKg(
            block.block_type,
            block.target_value,
            block.sets_count,
            block.charge_kg
          );
          const normalizedBlockVolume =
            Number.isFinite(Number(computedBlockVolume)) && Number(computedBlockVolume) > 0
              ? Number(computedBlockVolume)
              : 0;

          return {
            history_id: data.id,
            user_id: user.id,
            workout_id: session.id,
            exercise_name: block.name.trim(),
            block_type: block.block_type,
            sets_count: normalizedSetsCount,
            reps: block.block_type === 'reps' ? normalizedTargetValue : 0,
            duration_seconds: block.block_type === 'duration' ? Math.trunc(normalizedTargetValue) : 0,
            distance: block.block_type === 'distance' ? normalizedTargetValue : 0,
            charge_kg: normalizedChargeKg,
            volume: normalizedBlockVolume,
            completed_at: payload.completed_at,
          };
        });

      if (exerciseHistoryPayload.length > 0) {
        const exerciseNames = [...new Set(exerciseHistoryPayload.map((entry) => entry.exercise_name))];
        const { data: previousExerciseHistory, error: previousExerciseHistoryError } = await supabase
          .from('workout_exercise_history')
          .select('exercise_name, reps, duration_seconds, charge_kg, volume')
          .eq('user_id', user.id)
          .in('exercise_name', exerciseNames);

        if (previousExerciseHistoryError) {
          console.error('Workout exercise history comparison error:', previousExerciseHistoryError);
        }

        const previousBestByExercise = new Map<
          string,
          { reps: number; duration: number; charge: number; volume: number }
        >();

        (((previousExerciseHistory as Array<{
          exercise_name: string;
          reps: number | null;
          duration_seconds: number | null;
          charge_kg: number | null;
          volume: number | null;
        }>) || [])).forEach((entry) => {
          const key = entry.exercise_name.trim().toLowerCase();
          const current = previousBestByExercise.get(key) || {
            reps: 0,
            duration: 0,
            charge: 0,
            volume: 0,
          };

          previousBestByExercise.set(key, {
            reps: Math.max(current.reps, Number(entry.reps || 0)),
            duration: Math.max(current.duration, Number(entry.duration_seconds || 0)),
            charge: Math.max(current.charge, Number(entry.charge_kg || 0)),
            volume: Math.max(current.volume, Number(entry.volume || 0)),
          });
        });

        const detectedNewRecords: NewPersonalRecord[] = [];

        exerciseHistoryPayload.forEach((entry) => {
          const key = entry.exercise_name.trim().toLowerCase();
          const previousBest = previousBestByExercise.get(key) || {
            reps: 0,
            duration: 0,
            charge: 0,
            volume: 0,
          };

          if (entry.reps > 0 && previousBest.reps > 0 && entry.reps > previousBest.reps) {
            detectedNewRecords.push({
              exerciseName: entry.exercise_name,
              metric: 'reps',
              previousValue: previousBest.reps,
              value: entry.reps,
            });
          }

          if (entry.charge_kg > 0 && previousBest.charge > 0 && entry.charge_kg > previousBest.charge) {
            detectedNewRecords.push({
              exerciseName: entry.exercise_name,
              metric: 'charge',
              previousValue: previousBest.charge,
              value: entry.charge_kg,
            });
          }

          if (entry.volume > 0 && previousBest.volume > 0 && entry.volume > previousBest.volume) {
            detectedNewRecords.push({
              exerciseName: entry.exercise_name,
              metric: 'volume',
              previousValue: previousBest.volume,
              value: entry.volume,
            });
          }

          if (
            entry.duration_seconds > 0 &&
            previousBest.duration > 0 &&
            entry.duration_seconds > previousBest.duration
          ) {
            detectedNewRecords.push({
              exerciseName: entry.exercise_name,
              metric: 'duration',
              previousValue: previousBest.duration,
              value: entry.duration_seconds,
            });
          }
        });

        console.log('Exercise history payload:', exerciseHistoryPayload);

        const { error: exerciseHistoryError } = await supabase
          .from('workout_exercise_history')
          .insert(exerciseHistoryPayload);

        if (exerciseHistoryError) {
          console.error('Workout exercise history insert error:', exerciseHistoryError);
          console.error('Exercise history insert error:', exerciseHistoryError);
          console.error('Exercise history insert error details:', {
            message: exerciseHistoryError.message,
            code: exerciseHistoryError.code,
            details: exerciseHistoryError.details,
            hint: exerciseHistoryError.hint,
          });
          console.error(
            'Exercise history insert error full:',
            JSON.stringify(exerciseHistoryError, null, 2)
          );
          exerciseHistoryMessage = "L'historique a ete enregistre, mais pas les records d'exercices.";
        }

        setNewPersonalRecords(detectedNewRecords);
      }

      if (programSessionId && programId) {
        const programCompletionPayload = {
          user_id: user.id,
          program_id: programId,
          program_session_id: programSessionId,
          session_id: session.id,
          workout_history_id: data.id,
          completed_at: payload.completed_at,
        };

        console.log('Program completion payload:', programCompletionPayload);

        const { data: existingCompletion, error: existingCompletionError } = await supabase
          .from('training_program_completions')
          .select('id')
          .eq('user_id', user.id)
          .eq('program_id', programId)
          .eq('program_session_id', programSessionId)
          .maybeSingle();

        if (existingCompletionError) {
          console.error('Program completion insert error:', existingCompletionError);
          console.error(
            'Program completion insert error full:',
            JSON.stringify(existingCompletionError, null, 2)
          );
          completionMessage = "L'historique a ete enregistre, mais pas la progression du programme.";
        } else if (!existingCompletion) {
          const { error: completionInsertError } = await supabase
            .from('training_program_completions')
            .insert(programCompletionPayload);

          if (completionInsertError) {
            console.error('Program completion insert error:', completionInsertError);
            console.error(
              'Program completion insert error full:',
              JSON.stringify(completionInsertError, null, 2)
            );
            completionMessage = "L'historique a ete enregistre, mais pas la progression du programme.";
          }
        }
      }

      console.log('Workout history saved:', data);
      setHistorySaved(true);
      setHistoryMessage(exerciseHistoryMessage || completionMessage || 'Seance enregistree.');
      setSaveState('success');
      return true;
    } catch (error) {
      console.error('Workout history unexpected save error:', error);
      setHistoryMessage("Une erreur inattendue s'est produite pendant l'enregistrement.");
      setSaveState('error');
      return false;
    }
  }, [
    allBlocksCompleted,
    blocks,
    elapsedSeconds,
    estimatedCalories,
    historySaved,
    programId,
    programSessionId,
    runKey,
    saveState,
    session,
    sessionTotalVolume,
  ]);

  const handleFinishSession = async () => {
    if (historySaved) {
      clearPersistedLiveState();
      queuePendingToast({ message: 'Seance enregistree', tone: 'success' });
      router.push(`/sessions/${id}`);
      return;
    }

    const didSave = await saveCompletedSession();
    if (!didSave) return;

    clearPersistedLiveState();
    queuePendingToast({ message: 'Seance enregistree', tone: 'success' });
    router.push(`/sessions/${id}`);
  };

  return (
    <AppShell>
      <section className="sessions-page sessions-page--dark session-live-page">
        <Link href={`/sessions/${id}`} className="detail-back-link">
          &larr; Retour a la seance
        </Link>

        {loading ? (
          <div className="challenge-state">
            <p>Chargement de la seance live...</p>
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
        ) : blocks.length === 0 ? (
          <div className="challenge-state">
            <p>Cette seance ne contient aucun bloc.</p>
            <div className="session-empty-actions">
              <Link href={`/sessions/${id}`} className="button ghost">
                Revenir au detail
              </Link>
            </div>
          </div>
        ) : !currentBlock && !allBlocksCompleted ? (
          <div className="challenge-state">
            <p>Impossible d'afficher le bloc courant de cette seance.</p>
            <div className="session-empty-actions">
              <button type="button" className="button primary" onClick={resetLiveProgress}>
                Reinitialiser la progression
              </button>
              <Link href={`/sessions/${id}`} className="button ghost">
                Retour a la seance
              </Link>
            </div>
          </div>
        ) : (
          <>
            <SessionLiveHeader
              sportBadge={
                <div className={getSportBadgeClassName(session.sport, 'badge', 'Sport')}>
                  {formatSportBadgeLabel(session.sport, 'Sport')}
                </div>
              }
              title={session.name}
              elapsedLabel={`Temps : ${formatElapsedDuration(elapsedSeconds)}`}
              currentBlockLabel={`Bloc ${Math.min(currentIndex + 1, blocks.length)} / ${blocks.length}`}
              progressLabel={`${completedBlocksCount} / ${blocks.length} blocs termines - ${globalProgressPercent}%`}
              progressMetaLabel={
                allBlocksCompleted
                  ? 'Tous les blocs sont termines.'
                  : usesSetBySetValidation
                    ? `${currentSeriesLabel} - progression de la seance en direct`
                    : 'Un seul bloc a la fois, sans distraction.'
              }
              progressPercent={globalProgressPercent}
              onTogglePause={() => setIsTimerPaused((current) => !current)}
              isPaused={isTimerPaused || allBlocksCompleted}
              quitHref={`/sessions/${id}`}
            />

            {allBlocksCompleted ? (
              <article className="card session-live-finished session-live-finished--v1">
                <div className="session-live-finished__hero">
                  <span className="section-kicker">Fin de seance</span>
                  <strong>Seance terminee</strong>
                </div>

                <div className="session-live-finished__stats">
                  <div className="session-live-fact">
                    <span>Duree</span>
                    <strong>{formatElapsedDuration(elapsedSeconds)}</strong>
                  </div>
                  <div className="session-live-fact">
                    <span>Blocs</span>
                    <strong>{`${completedBlocksCount} / ${blocks.length}`}</strong>
                  </div>
                  <div className="session-live-fact">
                    <span>Calories</span>
                    <strong>{formatEstimatedWorkoutCalories(estimatedCalories) || '-'}</strong>
                  </div>
                  <div className="session-live-fact">
                    <span>Volume</span>
                    <strong>{formatSessionVolumeKg(sessionTotalVolume) || '-'}</strong>
                  </div>
                </div>

                {estimatedDurationSeconds ? (
                  <p className="session-live-total-time">
                    Duree estimee : {formatElapsedDuration(estimatedDurationSeconds)}
                  </p>
                ) : null}

                <div className={`session-live-save-banner session-live-save-banner--${saveState}`}>
                  <strong>{finishStateLabel}</strong>
                  <span>
                    {historySaved || saveState === 'success'
                      ? 'Ta realisation est bien prise en compte.'
                      : "Une fois la seance terminee, pense a confirmer l'enregistrement."}
                  </span>
                </div>

                {historyMessage ? (
                  <p
                    className={`form-feedback ${
                      saveState === 'success' ? 'form-feedback--success' : 'form-feedback--error'
                    }`}
                  >
                    {historyMessage}
                  </p>
                ) : null}

                {newPersonalRecords.length > 0 ? (
                  <div className="session-live-records">
                    <div className="session-live-records__header">
                      <strong>Nouveaux records</strong>
                      <span className="session-block-chip">NEW PR</span>
                    </div>
                    <div className="session-records-list">
                      {newPersonalRecords.map((record, index) => (
                        <article
                          key={`${record.exerciseName}-${record.metric}-${index}`}
                          className="session-block-card session-record-card session-live-record-card"
                        >
                          <div className="session-block-card__top">
                            <div className="session-block-check__label">
                              <strong>{record.exerciseName}</strong>
                              <small>Nouveau record personnel</small>
                            </div>
                            <span className="session-block-chip">NEW PR</span>
                          </div>
                          <div className="session-record-lines">
                            <p>
                              Type :{' '}
                              <strong>
                                {record.metric === 'reps'
                                  ? 'Reps'
                                  : record.metric === 'charge'
                                    ? 'Charge'
                                    : record.metric === 'volume'
                                      ? 'Volume'
                                      : 'Duree'}
                              </strong>
                            </p>
                            <p>
                              Ancien :{' '}
                              <strong>{formatPersonalRecordValue(record.metric, record.previousValue)}</strong>
                            </p>
                            <p>
                              Nouveau :{' '}
                              <strong>{formatPersonalRecordValue(record.metric, record.value)}</strong>
                            </p>
                          </div>
                        </article>
                      ))}
                    </div>
                  </div>
                ) : null}

                <p className="session-live-finished__copy">
                  Tous les blocs ont ete valides. Clique sur Terminer pour enregistrer ta seance.
                </p>

                <div className="session-live-actions session-live-actions--end">
                  <button type="button" className="button primary" onClick={resetLiveProgress}>
                    Refaire
                  </button>
                  <Link href={`/sessions/${id}`} className="button ghost">
                    Retour seance
                  </Link>
                  <button
                    type="button"
                    className="button primary session-live-finish-button"
                    onClick={handleFinishSession}
                    disabled={saveState === 'saving'}
                    aria-busy={saveState === 'saving'}
                  >
                    {saveState === 'saving'
                      ? 'Enregistrement...'
                      : historySaved || saveState === 'success'
                        ? 'Seance enregistree'
                        : 'Terminer'}
                  </button>
                </div>
              </article>
            ) : isResting && currentBlock ? (
              <RestTimerOverlay
                blockLabel={restingBlockName}
                secondsLeft={restSecondsLeft}
                totalSeconds={restSourceBlockRestSeconds}
                onSkip={() => setRestSecondsLeft(0)}
                onAdd15={() => adjustRestSeconds(15)}
                onSubtract15={() => adjustRestSeconds(-15)}
                onNext={() => setRestSecondsLeft(0)}
                onPrevious={goToPrevious}
                canGoPrevious={currentIndex > 0}
              />
            ) : currentBlock ? (
              <>
                <LiveBlockCard
                  key={`${currentBlock.id}-${currentCompletedSets}`}
                  block={currentBlock}
                  blockIndex={currentIndex}
                  totalBlocks={blocks.length}
                  currentSeriesLabel={currentSeriesLabel}
                  isCompleted={completedBlockIds.includes(currentBlock.id)}
                  blockVolumeLabel={formatSessionVolumeKg(currentBlockVolume)}
                  actionLabel={usesSetBySetValidation ? 'Serie terminee' : 'Bloc termine'}
                  actionHint={
                    usesSetBySetValidation
                      ? 'Valide chaque serie pour avancer automatiquement.'
                      : 'Valide ce bloc quand tu as fini l effort.'
                  }
                  validationFeedback={validationFeedback}
                  onValidate={handleValidateCurrent}
                  actionDisabled={completedBlockIds.includes(currentBlock.id)}
                />

                <div className="session-live-quick-stats">
                  <article className="card session-live-quick-stat">
                    <span>Bloc courant</span>
                    <strong>{getSessionBlockTypeLabel(currentBlock.block_type)}</strong>
                  </article>
                  <article className="card session-live-quick-stat">
                    <span>Progression bloc</span>
                    <strong>{currentSeriesLabel}</strong>
                  </article>
                  <article className="card session-live-quick-stat">
                    <span>Duree estimee</span>
                    <strong>{estimatedDurationSeconds ? formatElapsedDuration(estimatedDurationSeconds) : '-'}</strong>
                  </article>
                  <article className="card session-live-quick-stat">
                    <span>Calories live</span>
                    <strong>{formatEstimatedWorkoutCalories(estimatedCalories) || '-'}</strong>
                  </article>
                </div>

                <LiveControls
                  onPrevious={goToPrevious}
                  onNext={goToNext}
                  previousDisabled={currentIndex === 0}
                  nextDisabled={currentIndex >= blocks.length - 1}
                />

                <article className="card session-live-rail-card">
                  <div className="session-live-rail-card__top">
                    <div>
                      <span className="section-kicker">Apercu rapide</span>
                      <h2>Plan de seance</h2>
                    </div>
                    <span className="session-block-chip">
                      {allBlocksCompleted ? 'Termine' : isTimerPaused ? 'Pause' : 'En cours'}
                    </span>
                  </div>

                  <LiveBlockPreviewRail
                    blocks={blocks.map((block) => ({
                      id: block.id,
                      name: block.name?.trim() || `Bloc ${block.position + 1}`,
                      block_type: block.block_type,
                    }))}
                    currentIndex={currentIndex}
                    completedBlockIds={completedBlockIds}
                    onSelect={goToBlockIndex}
                  />
                </article>
              </>
            ) : null}
          </>
        )}
      </section>
    </AppShell>
  );
}
