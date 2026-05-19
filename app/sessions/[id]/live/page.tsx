'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { AppShell } from '@/components/AppShell';
import { formatSportBadgeLabel, getSportBadgeClassName } from '@/components/sport-badge';
import {
  formatEstimatedWorkoutCalories,
  formatSessionBlockSummary,
  formatSessionBlockTarget,
  formatSessionVolumeKg,
  getEstimatedWorkoutCalories,
  getSessionBlockTypeLabel,
  getSessionBlockVolumeKg,
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
  restSecondsLeft: number;
  elapsedSeconds: number;
  isTimerPaused: boolean;
  runKey: string;
  historySaved: boolean;
};

type NewPersonalRecord = {
  exerciseName: string;
  metric: 'reps' | 'charge' | 'volume' | 'duration';
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

export default function LiveSessionPage() {
  const params = useParams();
  const id = params?.id as string;

  const [session, setSession] = useState<TrainingSession | null>(null);
  const [blocks, setBlocks] = useState<TrainingSessionBlockRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [historyMessage, setHistoryMessage] = useState<string | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [completedBlockIds, setCompletedBlockIds] = useState<string[]>([]);
  const [completedSetsByBlockId, setCompletedSetsByBlockId] = useState<Record<string, number>>({});
  const [restAfterBlockId, setRestAfterBlockId] = useState<string | null>(null);
  const [restSecondsLeft, setRestSecondsLeft] = useState(DEFAULT_REST_SECONDS);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [isTimerPaused, setIsTimerPaused] = useState(false);
  const [runKey, setRunKey] = useState('');
  const [historySaved, setHistorySaved] = useState(false);
  const [newPersonalRecords, setNewPersonalRecords] = useState<NewPersonalRecord[]>([]);

  const liveStorageKey = `actyv.session.live.${id}`;

  useEffect(() => {
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
  }, [liveStorageKey]);

  useEffect(() => {
    if (!runKey) {
      setRunKey(createLiveRunKey());
    }
  }, [runKey]);

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
  const estimatedCalories = useMemo(
    () => getEstimatedWorkoutCalories(elapsedSeconds, session?.sport),
    [elapsedSeconds, session?.sport]
  );
  const allBlocksCompleted = blocks.length > 0 && completedBlocksCount === blocks.length;
  const currentBlock = blocks[currentIndex] || null;
  const currentBlockSetsTotal = currentBlock ? normalizeSessionSetsCount(currentBlock.sets_count) : 1;
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

  const resetLiveProgress = () => {
    setCompletedBlockIds([]);
    setCompletedSetsByBlockId({});
    setCurrentIndex(0);
    setElapsedSeconds(0);
      setIsTimerPaused(false);
      setHistorySaved(false);
      setHistoryMessage(null);
      setNewPersonalRecords([]);
      setRunKey(createLiveRunKey());
      clearRestState();
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

    setRestAfterBlockId(currentBlock.id);
    setRestSecondsLeft(DEFAULT_REST_SECONDS);
  };

  const handleValidateCurrent = () => {
    if (!currentBlock) return;

    if (usesSetBySetValidation) {
      const nextCompletedSets = Math.min(currentCompletedSets + 1, currentBlockSetsTotal);

      setCompletedSetsByBlockId((current) => ({
        ...current,
        [currentBlock.id]: nextCompletedSets,
      }));

      if (nextCompletedSets >= currentBlockSetsTotal) {
        completeCurrentExercise();
      }

      return;
    }

    setCompletedSetsByBlockId((current) => ({
      ...current,
      [currentBlock.id]: currentBlockSetsTotal,
    }));

    completeCurrentExercise();
  };

  useEffect(() => {
    if (!allBlocksCompleted || historySaved || !session || !runKey) return;

    const saveHistoryEntry = async () => {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        console.error('Workout history insert error:', userError || new Error('No authenticated user'));
        setHistoryMessage("Impossible d'enregistrer l'historique de la seance.");
        return;
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

      const { data, error } = await supabase
        .from('workout_sessions_history')
        .insert(payload)
        .select(
          'id, workout_id, user_id, workout_name, duration_seconds, estimated_calories, total_volume, completed_exercises, completed_at'
        )
        .single();

      if (error) {
        if (error.code === '23505') {
          setHistorySaved(true);
          setHistoryMessage(null);
          return;
        }

        console.error('Workout history insert error:', error);
        setHistoryMessage("Impossible d'enregistrer l'historique de la seance.");
        return;
      }

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

          if (entry.reps > 0 && entry.reps > previousBest.reps) {
            detectedNewRecords.push({
              exerciseName: entry.exercise_name,
              metric: 'reps',
              value: entry.reps,
            });
          }

          if (entry.charge_kg > 0 && entry.charge_kg > previousBest.charge) {
            detectedNewRecords.push({
              exerciseName: entry.exercise_name,
              metric: 'charge',
              value: entry.charge_kg,
            });
          }

          if (entry.volume > 0 && entry.volume > previousBest.volume) {
            detectedNewRecords.push({
              exerciseName: entry.exercise_name,
              metric: 'volume',
              value: entry.volume,
            });
          }

          if (entry.duration_seconds > 0 && entry.duration_seconds > previousBest.duration) {
            detectedNewRecords.push({
              exerciseName: entry.exercise_name,
              metric: 'duration',
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
          setHistoryMessage("L'historique a ete enregistre, mais pas les records d'exercices.");
          setHistorySaved(true);
          return;
        }

        setNewPersonalRecords(detectedNewRecords);
      }

      console.log('Workout history saved:', data);
      setHistorySaved(true);
      setHistoryMessage(null);
    };

    saveHistoryEntry();
  }, [
    allBlocksCompleted,
    blocks.length,
    elapsedSeconds,
    estimatedCalories,
    historySaved,
    runKey,
    session,
    sessionTotalVolume,
  ]);

  return (
    <AppShell>
      <section className="sessions-page session-live-page">
        <Link href={`/sessions/${id}`} className="detail-back-link">
          ← Retour a la seance
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
            <p>Aucun bloc ajoute pour cette seance.</p>
            <div className="session-empty-actions">
              <Link href={`/sessions/${id}`} className="button ghost">
                Revenir au detail
              </Link>
            </div>
          </div>
        ) : (
          <>
            <article className="card session-hero-card">
              <div className="session-hero-copy">
                <div className={getSportBadgeClassName(session.sport, 'badge', 'Sport')}>
                  {formatSportBadgeLabel(session.sport, 'Sport')}
                </div>
                <h1>{session.name}</h1>
                <p className="muted">{session.description || 'Mode live simple pour suivre tes blocs.'}</p>
              </div>

              <div className="session-live-header">
                <span className="session-progress-pill">
                  {allBlocksCompleted ? 'Duree totale' : 'Temps'} {formatElapsedDuration(elapsedSeconds)}
                </span>
                {estimatedCalories ? (
                  <span className="session-progress-pill">
                    Calories estimees {formatEstimatedWorkoutCalories(estimatedCalories)}
                  </span>
                ) : null}
                <span className="session-progress-pill">
                  Exercice {Math.min(currentIndex + 1, blocks.length)} / {blocks.length}
                </span>
                {currentBlock && currentBlockSetsTotal > 1 ? (
                  <span className="session-progress-pill">
                    Serie {Math.max(displayedSeriesStep, 1)} / {currentBlockSetsTotal}
                  </span>
                ) : null}
                <span className="session-progress-pill">
                  {completedBlocksCount} / {blocks.length} valides
                </span>
              </div>

              <div className="session-live-actions">
                <button
                  type="button"
                  className="button ghost"
                  onClick={() => setIsTimerPaused((current) => !current)}
                  disabled={allBlocksCompleted}
                >
                  {isTimerPaused ? 'Reprendre' : 'Pause'}
                </button>
              </div>
            </article>

            {allBlocksCompleted && (
              <article className="card session-live-finished">
                <strong>Seance terminee ✅</strong>
                <p className="session-live-total-time">Duree totale : {formatElapsedDuration(elapsedSeconds)}</p>
                {estimatedCalories ? (
                  <p className="session-live-total-time">
                    Calories estimees : {formatEstimatedWorkoutCalories(estimatedCalories)}
                  </p>
                ) : null}
                {sessionTotalVolume > 0 ? (
                  <p className="session-live-total-time">Volume total : {formatSessionVolumeKg(sessionTotalVolume)}</p>
                ) : null}
                {historyMessage ? (
                  <p className="form-feedback form-feedback--error">{historyMessage}</p>
                ) : null}
                {newPersonalRecords.length > 0 ? (
                  <div className="session-live-records">
                    <div className="session-live-records__header">
                      <strong>Nouveaux records</strong>
                      <span className="session-block-chip">NEW PR</span>
                    </div>
                    <div className="session-records-list">
                      {newPersonalRecords.map((record, index) => (
                        <article key={`${record.exerciseName}-${record.metric}-${index}`} className="session-block-card session-record-card session-live-record-card">
                          <div className="session-block-card__top">
                            <div className="session-block-check__label">
                              <strong>🏆 {record.exerciseName}</strong>
                              <small>Nouveau record personnel</small>
                            </div>
                          </div>
                          <p className="session-record-lines">
                            <span>
                              {record.metric === 'reps'
                                ? `${record.value} reps`
                                : record.metric === 'charge'
                                  ? `${record.value} kg`
                                  : record.metric === 'volume'
                                    ? formatSessionVolumeKg(record.value)
                                    : formatElapsedDuration(record.value)}
                            </span>
                          </p>
                        </article>
                      ))}
                    </div>
                  </div>
                ) : null}
                <p>Tous les exercices ont ete valides. Tu peux revenir au detail ou relancer la seance.</p>
                <div className="session-live-actions">
                  <button type="button" className="button primary" onClick={resetLiveProgress}>
                    Relancer la seance
                  </button>
                  <Link href={`/sessions/${id}`} className="button ghost">
                    Retour au detail
                  </Link>
                </div>
              </article>
            )}

            {isResting && currentBlock ? (
              <article className="card session-live-rest">
                <div className="session-live-stage__top">
                  <div>
                    <span className="section-kicker">Repos</span>
                    <h2>Recuperation</h2>
                  </div>
                  <span className="session-block-chip">60 sec</span>
                </div>

                <p className="muted">
                  Exercice valide. Prends une minute avant de passer au suivant, ou avance
                  directement si tu es pret.
                </p>

                <div className="session-live-rest__timer">
                  <strong>{restSecondsLeft}s</strong>
                  <span>{restSecondsLeft > 0 ? 'de repos restant' : 'Repos termine'}</span>
                </div>

                <div className="session-live-actions">
                  <button
                    type="button"
                    className="button ghost"
                    onClick={goToPrevious}
                    disabled={currentIndex === 0}
                  >
                    Precedent
                  </button>
                  <button
                    type="button"
                    className="button ghost"
                    onClick={() => setRestSecondsLeft(0)}
                    disabled={restSecondsLeft === 0}
                  >
                    Passer le repos
                  </button>
                  <button type="button" className="button primary" onClick={goToNextExercise}>
                    Exercice suivant
                  </button>
                </div>
              </article>
            ) : currentBlock ? (
              <article className="card session-live-stage">
                <div className="session-live-stage__top">
                  <div>
                    <span className="section-kicker">Exercice courant</span>
                    <h2>{currentBlock.name}</h2>
                  </div>
                  <span className="session-block-chip">{getSessionBlockTypeLabel(currentBlock.block_type)}</span>
                </div>

                <p className="session-live-summary">
                  {formatSessionBlockSummary(
                    currentBlock.block_type,
                    currentBlock.target_value,
                    currentBlock.sets_count,
                    currentBlock.charge_kg
                  )}
                </p>

                <div className="session-live-meta">
                  <div className="session-meta-card">
                    <span>Series</span>
                    <strong>{currentBlock.sets_count || 1}</strong>
                  </div>
                  <div className="session-meta-card">
                    <span>Cible</span>
                    <strong>{formatSessionBlockTarget(currentBlock.block_type, currentBlock.target_value)}</strong>
                  </div>
                  {currentBlock.charge_kg ? (
                    <div className="session-meta-card">
                      <span>Charge</span>
                      <strong>{currentBlock.charge_kg} kg</strong>
                    </div>
                  ) : null}
                  {currentBlockVolume ? (
                    <div className="session-meta-card">
                      <span>Volume</span>
                      <strong>{formatSessionVolumeKg(currentBlockVolume)}</strong>
                    </div>
                  ) : null}
                </div>

                <div className="session-live-block-state">
                  {completedBlockIds.includes(currentBlock.id) ? (
                    <span className="form-feedback form-feedback--success">Exercice valide</span>
                  ) : usesSetBySetValidation ? (
                    <span className="form-feedback">
                      Serie {Math.max(displayedSeriesStep, 1)} / {currentBlockSetsTotal}
                    </span>
                  ) : (
                    <span className="form-feedback">Exercice en attente</span>
                  )}
                </div>

                <div className="session-live-actions">
                  <button
                    type="button"
                    className="button ghost"
                    onClick={goToPrevious}
                    disabled={currentIndex === 0}
                  >
                    Precedent
                  </button>
                  <button
                    type="button"
                    className="button primary"
                    onClick={handleValidateCurrent}
                    disabled={completedBlockIds.includes(currentBlock.id)}
                  >
                    {completedBlockIds.includes(currentBlock.id)
                      ? 'Exercice valide'
                      : usesSetBySetValidation
                        ? `Valider la serie ${Math.max(displayedSeriesStep, 1)}`
                        : 'Valider cet exercice'}
                  </button>
                  <button
                    type="button"
                    className="button ghost"
                    onClick={goToNext}
                    disabled={currentIndex >= blocks.length - 1}
                  >
                    Suivant
                  </button>
                </div>
              </article>
            ) : null}
          </>
        )}
      </section>
    </AppShell>
  );
}
