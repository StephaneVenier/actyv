'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { AppShell } from '@/components/AppShell';
import { queuePendingToast } from '@/components/ToastProvider';
import { formatSportBadgeLabel, getSportBadgeClassName } from '@/components/sport-badge';
import {
  formatSessionBlockSummary,
  formatSessionVolumeKg,
  getSessionBlockTypeLabel,
  getSessionBlockVolumeKg,
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

  const completionStorageKey = `actyv.session.completed.${id}`;

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
          return;
        }

        const { data: sessionRow, error: sessionError } = await supabase
          .from('training_sessions')
          .select('id, user_id, name, sport, description, created_at')
          .eq('id', id)
          .eq('user_id', user.id)
          .maybeSingle();

        if (sessionError) {
          console.error('Erreur chargement detail seance :', sessionError);
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
          console.error('Erreur chargement blocs detail seance :', blocksError);
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
      <section className="sessions-page">
        <Link href="/sessions" className="detail-back-link">
          ← Retour aux seances
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
            <article className="card session-hero-card">
              <div className="session-hero-copy">
                <div className={getSportBadgeClassName(session.sport, 'badge', 'Sport')}>
                  {formatSportBadgeLabel(session.sport, 'Sport')}
                </div>
                <h1>{session.name}</h1>
                <p className="muted">{session.description || 'Aucune description pour le moment.'}</p>
              </div>

              <div className="session-hero-actions">
                <Link href={`/sessions/${session.id}/live`} className="button primary">
                  Lancer la seance
                </Link>
                <Link href={`/sessions/${session.id}/edit`} className="button ghost">
                  Modifier la seance
                </Link>
                <Link href="/sessions/new" className="button ghost">
                  Creer une autre seance
                </Link>
                <button
                  type="button"
                  className="button ghost session-delete-button"
                  onClick={handleDeleteSession}
                  disabled={deleting}
                  aria-busy={deleting}
                >
                  {deleting ? 'Suppression...' : 'Supprimer la seance'}
                </button>
              </div>

              <div className="session-detail-meta">
                <div className="session-meta-card">
                  <span>Creee</span>
                  <strong>{formatRelativeDate(session.created_at)}</strong>
                </div>
                <div className="session-meta-card">
                  <span>Blocs</span>
                  <strong>{blocks.length}</strong>
                </div>
                <div className="session-meta-card">
                  <span>Blocs structures</span>
                  <strong>{totalStructuredBlocks}</strong>
                </div>
                <div className="session-meta-card">
                  <span>Volume total</span>
                  <strong>{formatSessionVolumeKg(sessionTotalVolume) || '-'}</strong>
                </div>
              </div>
            </article>

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
                <p className="form-feedback form-feedback--success">Seance terminee ✅</p>
              )}

              {blocks.length === 0 ? (
                <div className="challenge-state challenge-state--compact">
                  <p>Aucun bloc ajoute pour le moment.</p>
                </div>
              ) : (
                <div className="session-block-list">
                  {blocks.map((block) => (
                    (() => {
                      const blockVolume = getSessionBlockVolumeKg(
                        block.block_type,
                        block.target_value,
                        block.sets_count,
                        block.charge_kg
                      );

                      return (
                        <article
                          key={block.id}
                          className={`session-block-card${
                            completedBlockIds.includes(block.id) ? ' session-block-card--completed' : ''
                          }`}
                        >
                          <div className="session-block-card__top">
                            <label className="session-block-check">
                              <input
                                type="checkbox"
                                checked={completedBlockIds.includes(block.id)}
                                onChange={() => toggleBlockCompleted(block.id)}
                                aria-label={`Marquer ${block.name} comme realise`}
                              />
                              <span className="session-block-check__label">
                                <strong>
                                  {block.position + 1}. {block.name}
                                </strong>
                                <small>
                                  {completedBlockIds.includes(block.id) ? 'Bloc realise' : 'A realiser'}
                                </small>
                              </span>
                            </label>
                            <span className="session-block-chip">{getSessionBlockTypeLabel(block.block_type)}</span>
                          </div>
                          <p className="session-block-preview">
                            Objectif :{' '}
                            <strong>
                              {formatSessionBlockSummary(
                                block.block_type,
                                block.target_value,
                                block.sets_count,
                                block.charge_kg
                              )}
                            </strong>
                          </p>
                          {blockVolume ? (
                            <p className="session-block-volume">Volume : {formatSessionVolumeKg(blockVolume)}</p>
                          ) : null}
                        </article>
                      );
                    })()
                  ))}
                </div>
              )}
            </article>
          </>
        )}
      </section>
    </AppShell>
  );
}
