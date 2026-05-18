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
  const [userId, setUserId] = useState<string | null>(null);
  const [blocks, setBlocks] = useState<TrainingSessionBlockRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [completedBlockIds, setCompletedBlockIds] = useState<string[]>([]);
  const [completedSetsByBlockId, setCompletedSetsByBlockId] = useState<Record<string, number>>({});
  const [restAfterBlockId, setRestAfterBlockId] = useState<string | null>(null);
  const [restSecondsLeft, setRestSecondsLeft] = useState(DEFAULT_REST_SECONDS);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [isTimerPaused, setIsTimerPaused] = useState(false);
  const [runKey, setRunKey] = useState('');
  const [historySaved, setHistorySaved] = useState(false);

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
            console.error('Erreur chargement user seance live :', userError);
          }
          setUserId(null);
          setMessage('Connecte-toi pour lancer cette seance.');
          setSession(null);
          setBlocks([]);
          return;
        }

        setUserId(user.id);

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
    if (!allBlocksCompleted || historySaved || !session || !userId || !runKey) return;

    const saveHistoryEntry = async () => {
      const payload = {
        user_id: userId,
        workout_id: session.id,
        workout_name: session.name,
        completed_at: new Date().toISOString(),
        duration_seconds: elapsedSeconds,
        estimated_calories: estimatedCalories ?? null,
        total_volume: sessionTotalVolume > 0 ? sessionTotalVolume : null,
        completed_exercises: blocks.length,
        run_key: runKey,
      };

      const { error } = await supabase.from('workout_sessions_history').insert(payload);

      if (error) {
        if (error.code === '23505') {
          setHistorySaved(true);
          return;
        }

        console.error('Erreur sauvegarde historique seance :', error);
        return;
      }

      setHistorySaved(true);
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
    userId,
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
