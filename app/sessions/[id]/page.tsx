'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { AppShell } from '@/components/AppShell';
import { formatSportBadgeLabel, getSportBadgeClassName } from '@/components/sport-badge';
import {
  formatSessionBlockTarget,
  getSessionBlockTypeLabel,
  SessionBlockType,
} from '@/lib/session-blocks';
import { supabase } from '@/lib/supabase';

type TrainingSession = {
  id: string;
  user_id: string;
  name: string;
  sport: string | null;
  description: string | null;
  created_at: string | null;
};

type TrainingSessionBlock = {
  id: string;
  session_id: string;
  position: number;
  name: string;
  block_type: SessionBlockType;
  target_value: number | null;
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
  const id = params?.id as string;

  const [session, setSession] = useState<TrainingSession | null>(null);
  const [blocks, setBlocks] = useState<TrainingSessionBlock[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [runnerOpen, setRunnerOpen] = useState(false);

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
            console.error('Erreur chargement user séance :', userError);
          }
          setMessage('Connecte-toi pour consulter cette séance.');
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
          console.error('Erreur chargement détail séance :', sessionError);
          setMessage('Impossible de charger cette séance.');
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

        const { data: blockRows, error: blocksError } = await supabase
          .from('training_session_blocks')
          .select('id, session_id, position, name, block_type, target_value')
          .eq('session_id', id)
          .order('position', { ascending: true });

        if (blocksError) {
          console.error('Erreur chargement blocs détail séance :', blocksError);
          setBlocks([]);
          return;
        }

        setBlocks((blockRows as TrainingSessionBlock[]) || []);
      } finally {
        setLoading(false);
      }
    };

    loadSession();
  }, [id]);

  const totalStructuredBlocks = useMemo(
    () => blocks.filter((block) => block.block_type !== 'free').length,
    [blocks]
  );

  const firstBlock = blocks[0] || null;

  return (
    <AppShell>
      <section className="sessions-page">
        <Link href="/sessions" className="detail-back-link">
          ← Retour aux seances
        </Link>

        {loading ? (
          <div className="challenge-state">
            <p>Chargement de la séance...</p>
          </div>
        ) : !session ? (
          <div className="challenge-state">
            <p>{message || 'Cette séance est introuvable.'}</p>
            <div className="session-empty-actions">
              <Link href="/sessions" className="button primary">
                Revenir à mes séances
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
                <button
                  type="button"
                  className="button primary"
                  onClick={() => setRunnerOpen((current) => !current)}
                >
                  {runnerOpen ? 'Fermer la seance' : 'Lancer la seance'}
                </button>
                <Link href="/sessions/new" className="button ghost">
                  Creer une autre seance
                </Link>
              </div>

              <div className="session-detail-meta">
                <div className="session-meta-card">
                  <span>Créée</span>
                  <strong>{formatRelativeDate(session.created_at)}</strong>
                </div>
                <div className="session-meta-card">
                  <span>Blocs</span>
                  <strong>{blocks.length}</strong>
                </div>
                <div className="session-meta-card">
                  <span>Blocs structurés</span>
                  <strong>{totalStructuredBlocks}</strong>
                </div>
              </div>
            </article>

            {runnerOpen && (
              <article className="card session-runner-card">
                <div className="session-blocks-header">
                  <div>
                    <span className="section-kicker">Mode seance</span>
                    <h2>Structure chrono V1</h2>
                  </div>
                </div>

                <div className="session-runner-grid">
                  <div className="session-runner-timer">
                    <span>Chrono seance</span>
                    <strong>00:00</strong>
                  </div>
                  <div className="session-runner-timer">
                    <span>Chrono exercice</span>
                    <strong>00:00</strong>
                  </div>
                  <div className="session-runner-timer">
                    <span>Chrono repos</span>
                    <strong>00:00</strong>
                  </div>
                </div>

                <div className="session-runner-preview">
                  <strong>Prochain bloc</strong>
                  <p>
                    {firstBlock
                      ? `${firstBlock.name} · ${formatSessionBlockTarget(
                          firstBlock.block_type,
                          firstBlock.target_value
                        )}`
                      : 'Ajoute un premier bloc pour préparer le mode séance.'}
                  </p>
                </div>
              </article>
            )}

            <article className="card session-form-card stack">
              <div className="session-blocks-header">
                <div>
                  <span className="section-kicker">Blocs</span>
                  <h2>Plan de la seance</h2>
                </div>
              </div>

              {blocks.length === 0 ? (
                <div className="challenge-state challenge-state--compact">
                  <p>Aucun bloc ajouté pour le moment.</p>
                </div>
              ) : (
                <div className="session-block-list">
                  {blocks.map((block) => (
                    <article key={block.id} className="session-block-card">
                      <div className="session-block-card__top">
                        <strong>{block.position + 1}. {block.name}</strong>
                        <span className="session-block-chip">{getSessionBlockTypeLabel(block.block_type)}</span>
                      </div>
                      <p className="session-block-preview">
                        Objectif : <strong>{formatSessionBlockTarget(block.block_type, block.target_value)}</strong>
                      </p>
                    </article>
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
