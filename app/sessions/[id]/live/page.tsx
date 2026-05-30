'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { AppShell } from '@/components/AppShell';
import {
  LiveBlockCard,
  LiveBlockPreviewRail,
  LiveControls,
  LiveSequenceList,
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
import { awardXp, getBadgeByCode, refreshUserBadges, XP_RULES } from '@/lib/gamification';
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
  skippedBlockIds: string[];
  completedSetsByBlockId: Record<string, number>;
  restAfterBlockId: string | null;
  restResumeIndex: number | null;
  restSecondsLeft: number;
  exerciseBlockId: string | null;
  exerciseSecondsLeft: number;
  awaitingExerciseCompletion: boolean;
  elapsedSeconds: number;
  isTimerPaused: boolean;
  runKey: string;
  historySaved: boolean;
  startedSeriesKey: string | null;
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

function formatTimerClock(totalSeconds: number) {
  const normalizedSeconds = Math.max(0, Math.trunc(Number(totalSeconds) || 0));
  const minutes = Math.floor(normalizedSeconds / 60);
  const seconds = normalizedSeconds % 60;

  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

function createLiveRunKey() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function triggerHaptic(pattern: number | number[]) {
  try {
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      navigator.vibrate(pattern);
    }
  } catch {
    // ignore
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
  const [skippedBlockIds, setSkippedBlockIds] = useState<string[]>([]);
  const [completedSetsByBlockId, setCompletedSetsByBlockId] = useState<Record<string, number>>({});
  const [restAfterBlockId, setRestAfterBlockId] = useState<string | null>(null);
  const [restResumeIndex, setRestResumeIndex] = useState<number | null>(null);
  const [restSecondsLeft, setRestSecondsLeft] = useState(DEFAULT_REST_SECONDS);
  const [exerciseBlockId, setExerciseBlockId] = useState<string | null>(null);
  const [exerciseSecondsLeft, setExerciseSecondsLeft] = useState(0);
  const [awaitingExerciseCompletion, setAwaitingExerciseCompletion] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [isTimerPaused, setIsTimerPaused] = useState(false);
  const [runKey, setRunKey] = useState('');
  const [historySaved, setHistorySaved] = useState(false);
  const [startedSeriesKey, setStartedSeriesKey] = useState<string | null>(null);
  const [newPersonalRecords, setNewPersonalRecords] = useState<NewPersonalRecord[]>([]);
  const [earnedXpTotal, setEarnedXpTotal] = useState(0);
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
        setSkippedBlockIds([]);
        setCompletedSetsByBlockId({});
        setRestAfterBlockId(null);
        setRestResumeIndex(null);
        setRestSecondsLeft(DEFAULT_REST_SECONDS);
        setExerciseBlockId(null);
        setExerciseSecondsLeft(0);
        setAwaitingExerciseCompletion(false);
        setElapsedSeconds(0);
        setIsTimerPaused(false);
        setHistorySaved(false);
        setHistoryMessage(null);
        setSaveState('idle');
        setNewPersonalRecords([]);
        setStartedSeriesKey(null);
        setEarnedXpTotal(0);
        setRunKey(createLiveRunKey());
        return;
      }

      if (typeof parsedValue.currentIndex === 'number') {
        setCurrentIndex(parsedValue.currentIndex);
      }
      if (Array.isArray(parsedValue.completedBlockIds)) {
        setCompletedBlockIds(parsedValue.completedBlockIds.filter(Boolean));
      }
      if (Array.isArray(parsedValue.skippedBlockIds)) {
        setSkippedBlockIds(parsedValue.skippedBlockIds.filter(Boolean));
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
      if (typeof parsedValue.exerciseBlockId === 'string' || parsedValue.exerciseBlockId === null) {
        setExerciseBlockId(parsedValue.exerciseBlockId ?? null);
      }
      if (
        typeof parsedValue.exerciseSecondsLeft === 'number' &&
        Number.isFinite(parsedValue.exerciseSecondsLeft)
      ) {
        setExerciseSecondsLeft(Math.max(0, Math.floor(parsedValue.exerciseSecondsLeft)));
      }
      if (typeof parsedValue.awaitingExerciseCompletion === 'boolean') {
        setAwaitingExerciseCompletion(parsedValue.awaitingExerciseCompletion);
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
      if (typeof parsedValue.startedSeriesKey === 'string' || parsedValue.startedSeriesKey === null) {
        setStartedSeriesKey(parsedValue.startedSeriesKey ?? null);
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
  const skippedBlocksCount = useMemo(
    () => blocks.filter((block) => skippedBlockIds.includes(block.id)).length,
    [blocks, skippedBlockIds]
  );
  const resolvedBlockIds = useMemo(
    () => [...new Set([...completedBlockIds, ...skippedBlockIds])],
    [completedBlockIds, skippedBlockIds]
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
  const allBlocksResolved = blocks.length > 0 && resolvedBlockIds.length === blocks.length;
  const globalProgressPercent =
    blocks.length > 0 ? Math.min(100, Math.max(0, Math.round((resolvedBlockIds.length / blocks.length) * 100))) : 0;
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
  const isDurationBlock = currentBlock?.block_type === 'duration';
  const usesSetBySetValidation =
    Boolean(currentBlock) &&
    currentBlockSetsTotal > 1 &&
    !resolvedBlockIds.includes(currentBlock.id);
  const displayedSeriesStep = currentBlock
    ? Math.min(currentCompletedSets + (resolvedBlockIds.includes(currentBlock.id) ? 0 : 1), currentBlockSetsTotal)
    : 1;
  const isCurrentBlockSkipped = Boolean(currentBlock) && skippedBlockIds.includes(currentBlock.id);
  const isResting = Boolean(restAfterBlockId) && !allBlocksResolved;
  const isExercising =
    Boolean(currentBlock) && (Boolean(isSeriesStarted) || awaitingExerciseCompletion) && !isResting;
  const currentPhase: 'ready' | 'exercising' | 'resting' | 'paused' | 'completed' = allBlocksResolved
    ? 'completed'
    : isResting
      ? 'resting'
      : isTimerPaused
          ? 'paused'
          : isExercising
            ? 'exercising'
            : 'ready';
  const currentStatusLabel = allBlocksResolved
    ? 'Bloc termine'
    : isTimerPaused
      ? 'Pause'
      : isResting
      ? 'Repos'
      : isExercising
          ? awaitingExerciseCompletion
            ? 'Serie prete a etre terminee'
            : 'Serie en cours'
          : isCurrentBlockSkipped
            ? 'Bloc passe'
            : currentCompletedSets > 0
              ? 'Pret pour la serie suivante'
              : 'Pret pour la serie';
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
  const currentSeriesKey = currentBlock ? `${currentBlock.id}:${currentCompletedSets}` : null;
  const isSeriesStarted =
    Boolean(currentSeriesKey) &&
    startedSeriesKey === currentSeriesKey &&
    !resolvedBlockIds.includes(currentBlock?.id ?? '');
  const finishStateLabel =
    saveState === 'saving'
      ? 'Enregistrement...'
      : saveState === 'success'
        ? 'Seance enregistree'
        : saveState === 'error'
          ? "Erreur d'enregistrement"
          : 'Clique sur Terminer pour enregistrer ta seance.';
  const canValidateCurrentBlock =
    Boolean(currentBlock) &&
    currentPhase !== 'completed' &&
    currentPhase !== 'resting' &&
    !resolvedBlockIds.includes(currentBlock?.id ?? '') &&
    (!isDurationBlock || currentPhase !== 'exercising' || awaitingExerciseCompletion);

  const validatedSeriesCount = useMemo(
    () =>
      blocks.reduce((total, block) => {
        if (!completedBlockIds.includes(block.id)) {
          return total;
        }

        const recordedSets = Number(completedSetsByBlockId[block.id] ?? normalizeSessionSetsCount(block.sets_count));
        const normalizedSets = Math.min(
          Math.max(Number.isFinite(recordedSets) ? Math.trunc(recordedSets) : 0, 0),
          normalizeSessionSetsCount(block.sets_count)
        );

        return total + normalizedSets;
      }, 0),
    [blocks, completedBlockIds, completedSetsByBlockId]
  );

  const totalExercisesCount = blocks.length;
  const displayedEarnedXp = historySaved ? earnedXpTotal : XP_RULES.session_completed.xp;

  useEffect(() => {
    if (typeof window === 'undefined' || blocks.length === 0) return;

    const validBlockIds = new Set(blocks.map((block) => block.id));
    const sanitizedIds = completedBlockIds.filter((blockId) => validBlockIds.has(blockId));
    const sanitizedSkippedIds = skippedBlockIds.filter(
      (blockId) => validBlockIds.has(blockId) && !sanitizedIds.includes(blockId)
    );

    if (sanitizedIds.length !== completedBlockIds.length) {
      setCompletedBlockIds(sanitizedIds);
      return;
    }

    if (sanitizedSkippedIds.length !== skippedBlockIds.length) {
      setSkippedBlockIds(sanitizedSkippedIds);
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

      const sanitizedStartedSeriesKey =
        typeof startedSeriesKey === 'string' &&
        startedSeriesKey.trim().length > 0 &&
        (() => {
          const [blockId] = startedSeriesKey.split(':');
          return validBlockIds.has(blockId);
        })()
          ? startedSeriesKey
          : null;

      if (sanitizedStartedSeriesKey !== startedSeriesKey) {
        setStartedSeriesKey(sanitizedStartedSeriesKey);
        return;
      }

    try {
      const payload: LiveState = {
        currentIndex: nextIndex,
        completedBlockIds: sanitizedIds,
        skippedBlockIds: sanitizedSkippedIds,
        completedSetsByBlockId: sanitizedCompletedSetsByBlockId,
        restAfterBlockId: sanitizedRestAfterBlockId,
        restResumeIndex: nextResumeIndex,
        restSecondsLeft,
        exerciseBlockId,
        exerciseSecondsLeft,
        awaitingExerciseCompletion,
        elapsedSeconds,
        isTimerPaused,
        runKey,
        historySaved,
        startedSeriesKey: sanitizedStartedSeriesKey,
      };
      window.localStorage.setItem(liveStorageKey, JSON.stringify(payload));
    } catch (error) {
      console.error('Erreur sauvegarde etat live seance :', error);
    }
  }, [
    blocks,
    completedBlockIds,
    skippedBlockIds,
    completedSetsByBlockId,
    currentIndex,
    liveStorageKey,
    restAfterBlockId,
    restResumeIndex,
    restSecondsLeft,
    exerciseBlockId,
    exerciseSecondsLeft,
    awaitingExerciseCompletion,
    elapsedSeconds,
    isTimerPaused,
    runKey,
    historySaved,
    startedSeriesKey,
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
    if (!isExercising || exerciseSecondsLeft <= 0 || isTimerPaused) return;

    const timeoutId = window.setTimeout(() => {
      setExerciseSecondsLeft((current) => Math.max(0, current - 1));
    }, 1000);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [exerciseSecondsLeft, isExercising, isTimerPaused]);

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
    if (!exerciseBlockId || exerciseSecondsLeft > 0) return;

    triggerHaptic([20, 35, 20]);
    setExerciseBlockId(null);
    setAwaitingExerciseCompletion(true);
  }, [exerciseBlockId, exerciseSecondsLeft]);

  useEffect(() => {
    if (loading || !session || blocks.length === 0 || allBlocksResolved || isTimerPaused) return;

    const timeoutId = window.setTimeout(() => {
      setElapsedSeconds((current) => current + 1);
    }, 1000);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [allBlocksResolved, blocks.length, isTimerPaused, loading, session, elapsedSeconds]);

  const clearRestState = () => {
    setRestAfterBlockId(null);
    setRestResumeIndex(null);
    setRestSecondsLeft(DEFAULT_REST_SECONDS);
  };

  const clearExerciseState = () => {
    setExerciseBlockId(null);
    setExerciseSecondsLeft(0);
    setAwaitingExerciseCompletion(false);
    setStartedSeriesKey(null);
  };

  const goToPrevious = () => {
    clearRestState();
    clearExerciseState();
    setCurrentIndex((value) => Math.max(value - 1, 0));
  };

  const goToNext = () => {
    clearRestState();
    clearExerciseState();
    setCurrentIndex((value) => Math.min(value + 1, Math.max(blocks.length - 1, 0)));
  };

  const goToNextExercise = () => {
    clearRestState();
    clearExerciseState();
    setCurrentIndex((value) => Math.min(value + 1, Math.max(blocks.length - 1, 0)));
  };

  const goToBlockIndex = (index: number) => {
    clearRestState();
    clearExerciseState();
    setCurrentIndex(Math.min(Math.max(index, 0), Math.max(blocks.length - 1, 0)));
  };

  const adjustRestSeconds = (delta: number) => {
    setRestSecondsLeft((current) => Math.max(0, current + delta));
  };

  const beginRest = (sourceBlockId: string, nextIndex: number, restSeconds: number) => {
    const normalizedRest = Number.isFinite(Number(restSeconds)) ? Math.max(0, Math.trunc(Number(restSeconds))) : 0;

    if (normalizedRest <= 0) {
      clearRestState();
      clearExerciseState();
      setCurrentIndex(Math.min(Math.max(nextIndex, 0), Math.max(blocks.length - 1, 0)));
      return;
    }

    setRestAfterBlockId(sourceBlockId);
    setRestResumeIndex(Math.min(Math.max(nextIndex, 0), Math.max(blocks.length - 1, 0)));
    setRestSecondsLeft(normalizedRest);
    clearExerciseState();
  };

  const resetLiveProgress = () => {
    setCompletedBlockIds([]);
    setSkippedBlockIds([]);
    setCompletedSetsByBlockId({});
    setCurrentIndex(0);
    setElapsedSeconds(0);
    setIsTimerPaused(false);
    setHistorySaved(false);
    setHistoryMessage(null);
    setNewPersonalRecords([]);
    setStartedSeriesKey(null);
    setEarnedXpTotal(0);
    setSaveState('idle');
    setRunKey(createLiveRunKey());
    clearRestState();
    clearExerciseState();
    clearPersistedLiveState();
  };

  const completeCurrentExercise = () => {
    if (!currentBlock) return;

    setSkippedBlockIds((current) => current.filter((blockId) => blockId !== currentBlock.id));
    setCompletedBlockIds((current) =>
      current.includes(currentBlock.id) ? current : [...current, currentBlock.id]
    );

    if (currentIndex >= blocks.length - 1) {
      clearRestState();
      clearExerciseState();
      return;
    }

    beginRest(currentBlock.id, currentIndex + 1, currentBlockRestSeconds);
  };

  const handleValidateCurrent = () => {
    if (!currentBlock) return;

    triggerHaptic(18);
    setStartedSeriesKey(null);
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

  const handleSkipCurrentBlock = () => {
    if (!currentBlock || resolvedBlockIds.includes(currentBlock.id)) return;

    triggerHaptic(12);
    clearRestState();
    clearExerciseState();
    setValidationFeedback('Bloc passe');
    setSkippedBlockIds((current) => (current.includes(currentBlock.id) ? current : [...current, currentBlock.id]));

    if (currentIndex >= blocks.length - 1) {
      return;
    }

    setCurrentIndex((value) => Math.min(value + 1, Math.max(blocks.length - 1, 0)));
  };

  const handleStartCurrentSeries = () => {
    try {
      if (!currentBlock) return;

      triggerHaptic(18);
      setValidationFeedback(null);

      if (currentBlock.block_type === 'duration') {
        const duration = Number(currentBlock?.target_value ?? 0);
        const normalizedTarget =
          Number.isFinite(duration) && duration > 0 ? Math.max(1, Math.trunc(duration)) : 0;

        if (normalizedTarget <= 0) {
          setValidationFeedback('Duree invalide, serie validee sans chrono');
          handleValidateCurrent();
          return;
        }

        setStartedSeriesKey(currentSeriesKey);
        setExerciseBlockId(currentBlock.id);
        setExerciseSecondsLeft(normalizedTarget);
        setAwaitingExerciseCompletion(false);
        setIsTimerPaused(false);
        return;
      }

      setStartedSeriesKey(currentSeriesKey);
      setValidationFeedback('Serie lancee');
    } catch (error) {
      console.error('start exercise failed', error);
      setValidationFeedback("Impossible de lancer la serie pour le moment.");
      clearExerciseState();
    }
  };

  const shouldKeepScreenAwake = Boolean(session) && blocks.length > 0 && !allBlocksResolved;

  useEffect(() => {
    if (typeof window === 'undefined') return;

    let released = false;
    let wakeLockSentinel: { release?: () => Promise<void> } | null = null;

    const requestWakeLock = async () => {
      try {
        if (typeof navigator === 'undefined' || !('wakeLock' in navigator)) return;

        const wakeLockApi = (navigator as Navigator & {
          wakeLock?: { request: (type: 'screen') => Promise<{ release?: () => Promise<void> }> };
        }).wakeLock;

        if (!wakeLockApi || document.visibilityState !== 'visible' || !shouldKeepScreenAwake) return;
        wakeLockSentinel = await wakeLockApi.request('screen');
      } catch {
        // ignore
      }
    };

    const releaseWakeLock = async () => {
      if (released) return;
      released = true;
      try {
        await wakeLockSentinel?.release?.();
      } catch {
        // ignore
      }
      wakeLockSentinel = null;
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState !== 'visible') {
        void releaseWakeLock();
      } else if (shouldKeepScreenAwake) {
        released = false;
        void requestWakeLock();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    if (shouldKeepScreenAwake) {
      void requestWakeLock();
    }

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      void releaseWakeLock();
    };
  }, [shouldKeepScreenAwake]);

  const saveCompletedSession = useCallback(async () => {
    if (!allBlocksResolved || historySaved || !session || !runKey || saveState === 'saving') {
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
      const normalizedCompletedExercises = Number.isFinite(Number(completedBlocksCount))
        ? Number(completedBlocksCount)
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

      const awardedXpMessages: string[] = [];
      let nextEarnedXpTotal = 0;

      const workoutXpResult = await awardXp({
        userId: user.id,
        source: 'session_completed',
        metadata: { target_id: data.id },
      });

      if (workoutXpResult?.awarded) {
        awardedXpMessages.push('+10 XP seance');
        nextEarnedXpTotal += XP_RULES.session_completed.xp;
      } else if (workoutXpResult?.error) {
        console.error('XP award failed', {
          payload: {
            user_id: user.id,
            event_type: 'session_completed',
            xp_amount: 10,
            target_id: data.id,
          },
          error: workoutXpResult.error,
        });
      }

      let exerciseHistoryMessage: string | null = null;

      const exerciseHistoryPayload = blocks
        .filter((block) => completedBlockIds.includes(block.id))
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
          } else {
            const [{ count: totalProgramSessionsCount }, { count: completedProgramSessionsCount }] = await Promise.all([
              supabase
                .from('training_program_sessions')
                .select('*', { count: 'exact', head: true })
                .eq('program_id', programId),
              supabase
                .from('training_program_completions')
                .select('*', { count: 'exact', head: true })
                .eq('program_id', programId)
                .eq('user_id', user.id),
            ]);

            if (
              Number.isFinite(Number(totalProgramSessionsCount)) &&
              Number(totalProgramSessionsCount) > 0 &&
              Number(completedProgramSessionsCount || 0) >= Number(totalProgramSessionsCount)
            ) {
              const programCompletedXpResult = await awardXp({
                userId: user.id,
                source: 'program_completed',
                metadata: { target_id: programId },
              });

              if (programCompletedXpResult?.awarded) {
                awardedXpMessages.push('+50 XP programme termine');
                nextEarnedXpTotal += XP_RULES.program_completed.xp;
              } else if (programCompletedXpResult?.error) {
                console.error('XP award failed', {
                  payload: {
                    user_id: user.id,
                    event_type: 'program_completed',
                    xp_amount: 50,
                    target_id: programId,
                  },
                  error: programCompletedXpResult.error,
                });
              }
            }
          }
        }
      }

      const badgeResult = await refreshUserBadges(user.id);

      if (badgeResult.error) {
        console.error('Erreur refresh badges seance live :', badgeResult.error);
      }

      awardedXpMessages.forEach((xpMessage) => {
        queuePendingToast({ message: xpMessage, tone: 'info' });
      });

      badgeResult.awarded.forEach((badgeCode) => {
        const badge = getBadgeByCode(badgeCode);
        queuePendingToast({
          message: `Badge debloque : ${badge?.label || badgeCode}`,
          tone: 'celebrate',
        });
      });

      setHistorySaved(true);
      setEarnedXpTotal(nextEarnedXpTotal);
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
    allBlocksResolved,
    blocks,
    completedBlockIds,
    completedBlocksCount,
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
    queuePendingToast({ message: 'Seance enregistree', tone: 'success' });
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
        ) : !currentBlock && !allBlocksResolved ? (
          <div className="challenge-state">
            <p>Impossible d&apos;afficher le bloc courant de cette seance.</p>
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
                allBlocksResolved
                  ? skippedBlocksCount > 0
                    ? 'Tous les blocs ont ete traites, avec certains passes.'
                    : 'Tous les blocs sont termines.'
                  : usesSetBySetValidation
                    ? `${currentSeriesLabel} - progression de la seance en direct`
                    : 'Un seul bloc a la fois, sans distraction.'
              }
              progressPercent={globalProgressPercent}
              onTogglePause={() => setIsTimerPaused((current) => !current)}
              isPaused={isTimerPaused || allBlocksResolved}
              quitHref={`/sessions/${id}`}
            />

            {allBlocksResolved ? (
              <article className="card session-live-finished session-live-finished--v1">
                <div className="session-live-finished__hero">
                  <span className="section-kicker">Fin de seance</span>
                  <strong>Seance terminee</strong>
                </div>

                <div className="session-live-finished__stats">
                  <div className="session-live-fact">
                    <span>XP gagnee</span>
                    <strong>{`${displayedEarnedXp} XP`}</strong>
                  </div>
                  <div className="session-live-fact">
                    <span>Duree</span>
                    <strong>{formatElapsedDuration(elapsedSeconds)}</strong>
                  </div>
                  <div className="session-live-fact">
                    <span>Exercices</span>
                    <strong>{`${completedBlocksCount} / ${totalExercisesCount}`}</strong>
                  </div>
                  <div className="session-live-fact">
                    <span>Series validees</span>
                    <strong>{validatedSeriesCount}</strong>
                  </div>
                  <div className="session-live-fact">
                    <span>Passes</span>
                    <strong>{skippedBlocksCount}</strong>
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
                      ? `Ta realisation est bien prise en compte avec ${displayedEarnedXp} XP ajoutes.`
                      : skippedBlocksCount > 0
                        ? "Ta seance sera enregistree avec les blocs passes comme seance partielle."
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
                  {skippedBlocksCount > 0
                    ? 'La seance est prete a etre enregistree, avec quelques blocs passes.'
                    : 'La seance est prete a etre enregistree.'}
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
                  statusLabel={currentStatusLabel}
                  isCompleted={completedBlockIds.includes(currentBlock.id)}
                  blockVolumeLabel={formatSessionVolumeKg(currentBlockVolume)}
                  actionLabel={
                    isExercising
                      ? awaitingExerciseCompletion
                        ? 'Terminer la serie'
                        : isDurationBlock
                          ? 'Terminer la serie'
                          : usesSetBySetValidation
                            ? 'Valider la serie'
                            : 'Terminer le bloc'
                      : currentCompletedSets > 0
                        ? 'Lancer la serie suivante'
                        : 'Lancer la serie'
                  }
                  actionHint={
                    isDurationBlock
                      ? isExercising
                        ? awaitingExerciseCompletion
                          ? 'Le chrono est termine. Confirme la serie pour passer au repos.'
                          : `Temps ecoule : ${formatTimerClock(
                              Number(currentBlock?.target_value ?? 0) - exerciseSecondsLeft
                            )} / ${formatTimerClock(Number(currentBlock?.target_value ?? 0))}`
                        : 'Lance la serie quand tu es pret.'
                      : isExercising
                        ? usesSetBySetValidation
                          ? 'La serie est en cours. Valide-la des que tu as termine.'
                          : "Le bloc est en cours. Termine-le quand tu as fini l'effort."
                        : usesSetBySetValidation
                          ? 'Lance puis valide chaque serie, avec repos entre les tours.'
                          : 'Lance ce bloc avant de pouvoir le terminer.'
                  }
                  validationFeedback={validationFeedback}
                  countdownLabel={isDurationBlock && isExercising && !awaitingExerciseCompletion ? formatTimerClock(exerciseSecondsLeft) : null}
                  onValidate={
                    !canValidateCurrentBlock
                      ? undefined
                      : isExercising
                        ? handleValidateCurrent
                        : handleStartCurrentSeries
                  }
                  actionDisabled={!canValidateCurrentBlock}
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
                  onNext={resolvedBlockIds.includes(currentBlock.id) ? goToNext : handleSkipCurrentBlock}
                  previousDisabled={currentIndex === 0}
                  nextDisabled={currentIndex >= blocks.length - 1 && resolvedBlockIds.includes(currentBlock.id)}
                  nextLabel={resolvedBlockIds.includes(currentBlock.id) ? 'Suivant' : 'Passer ce bloc'}
                />

                <article className="card session-live-rail-card">
                  <div className="session-live-rail-card__top">
                    <div>
                      <span className="section-kicker">Sequence complete</span>
                      <h2>Vue d ensemble</h2>
                    </div>
                    <span className="session-block-chip">{currentStatusLabel}</span>
                  </div>

                  <LiveSequenceList
                    blocks={blocks}
                    currentIndex={currentIndex}
                    completedBlockIds={completedBlockIds}
                    skippedBlockIds={skippedBlockIds}
                    completedSetsByBlockId={completedSetsByBlockId}
                    currentSeriesLabel={currentSeriesLabel}
                    currentStatusLabel={currentStatusLabel}
                    onSelect={goToBlockIndex}
                  />
                </article>

                <article className="card session-live-rail-card">
                  <div className="session-live-rail-card__top">
                    <div>
                      <span className="section-kicker">Apercu rapide</span>
                      <h2>Plan de seance</h2>
                    </div>
                    <span className="session-block-chip">
                      {allBlocksResolved ? 'Termine' : isTimerPaused ? 'Pause' : 'En cours'}
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
