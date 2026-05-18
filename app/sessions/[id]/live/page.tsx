'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { AppShell } from '@/components/AppShell';
import { formatSportBadgeLabel, getSportBadgeClassName } from '@/components/sport-badge';
import {
  formatSessionBlockSummary,
  formatSessionBlockTarget,
  getSessionBlockTypeLabel,
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
  restAfterBlockId: string | null;
  restSecondsLeft: number;
};

const DEFAULT_REST_SECONDS = 60;

export default function LiveSessionPage() {
  const params = useParams();
  const id = params?.id as string;

  const [session, setSession] = useState<TrainingSession | null>(null);
  const [blocks, setBlocks] = useState<TrainingSessionBlockRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [completedBlockIds, setCompletedBlockIds] = useState<string[]>([]);
  const [restAfterBlockId, setRestAfterBlockId] = useState<string | null>(null);
  const [restSecondsLeft, setRestSecondsLeft] = useState(DEFAULT_REST_SECONDS);

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
    } catch (error) {
      console.error('Erreur lecture etat live seance :', error);
    }
  }, [liveStorageKey]);

  const completedBlocksCount = useMemo(
    () => blocks.filter((block) => completedBlockIds.includes(block.id)).length,
    [blocks, completedBlockIds]
  );
  const allBlocksCompleted = blocks.length > 0 && completedBlocksCount === blocks.length;
  const currentBlock = blocks[currentIndex] || null;
  const isResting = Boolean(restAfterBlockId) && !allBlocksCompleted;

  useEffect(() => {
    if (typeof window === 'undefined' || blocks.length === 0) return;

    const validBlockIds = new Set(blocks.map((block) => block.id));
    const sanitizedIds = completedBlockIds.filter((blockId) => validBlockIds.has(blockId));

    if (sanitizedIds.length !== completedBlockIds.length) {
      setCompletedBlockIds(sanitizedIds);
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
        restAfterBlockId: sanitizedRestAfterBlockId,
        restSecondsLeft,
      };
      window.localStorage.setItem(liveStorageKey, JSON.stringify(payload));
    } catch (error) {
      console.error('Erreur sauvegarde etat live seance :', error);
    }
  }, [blocks, completedBlockIds, currentIndex, liveStorageKey, restAfterBlockId, restSecondsLeft]);

  useEffect(() => {
    if (!isResting || restSecondsLeft <= 0) return;

    const timeoutId = window.setTimeout(() => {
      setRestSecondsLeft((current) => Math.max(0, current - 1));
    }, 1000);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [isResting, restSecondsLeft]);

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

  const handleValidateCurrent = () => {
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
                  Exercice {Math.min(currentIndex + 1, blocks.length)} / {blocks.length}
                </span>
                <span className="session-progress-pill">
                  {completedBlocksCount} / {blocks.length} valides
                </span>
              </div>
            </article>

            {allBlocksCompleted && (
              <article className="card session-live-finished">
                <strong>Seance terminee ✅</strong>
                <p>Tous les exercices ont ete valides. Tu peux revenir au detail ou relancer la seance.</p>
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
                </div>

                <div className="session-live-block-state">
                  {completedBlockIds.includes(currentBlock.id) ? (
                    <span className="form-feedback form-feedback--success">Exercice valide</span>
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
