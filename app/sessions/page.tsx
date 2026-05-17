'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { AppShell } from '@/components/AppShell';
import { formatSportBadgeLabel, getSportBadgeClassName } from '@/components/sport-badge';
import { formatSessionBlockSummary } from '@/lib/session-blocks';
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
  if (!dateString) return 'Date recente';

  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return 'Date recente';

  const diffHours = Math.round((date.getTime() - Date.now()) / (1000 * 60 * 60));
  const formatter = new Intl.RelativeTimeFormat('fr', { numeric: 'auto' });

  if (Math.abs(diffHours) < 24) {
    return formatter.format(diffHours, 'hour');
  }

  return formatter.format(Math.round(diffHours / 24), 'day');
}

export default function SessionsPage() {
  const [sessions, setSessions] = useState<TrainingSession[]>([]);
  const [blocks, setBlocks] = useState<TrainingSessionBlockRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const loadSessions = async () => {
      setLoading(true);
      setMessage(null);

      try {
        const {
          data: { user },
          error: userError,
        } = await supabase.auth.getUser();

        if (userError) {
          console.error('Erreur chargement user séances :', userError);
          setMessage('Impossible de charger tes séances pour le moment.');
          setSessions([]);
          setBlocks([]);
          return;
        }

        if (!user) {
          setSessions([]);
          setBlocks([]);
          return;
        }

        const { data: sessionRows, error: sessionsError } = await supabase
          .from('training_sessions')
          .select('id, user_id, name, sport, description, created_at')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false });

        if (sessionsError) {
          console.error('Erreur chargement séances :', sessionsError);
          setMessage('Impossible de charger tes séances pour le moment.');
          setSessions([]);
          setBlocks([]);
          return;
        }

        const nextSessions = (sessionRows as TrainingSession[]) || [];
        setSessions(nextSessions);

        if (nextSessions.length === 0) {
          setBlocks([]);
          return;
        }

        const { data: blockRows, error: blocksError } = await fetchTrainingSessionBlocks(
          nextSessions.map((session) => session.id)
        );

        if (blocksError) {
          console.error('Erreur chargement blocs séances :', blocksError);
          setBlocks([]);
          return;
        }

        setBlocks(blockRows || []);
      } finally {
        setLoading(false);
      }
    };

    loadSessions();
  }, []);

  const blocksBySession = useMemo(() => {
    const grouped = new Map<string, TrainingSessionBlockRecord[]>();

    blocks.forEach((block) => {
      const current = grouped.get(block.session_id) || [];
      current.push(block);
      grouped.set(block.session_id, current);
    });

    return grouped;
  }, [blocks]);

  return (
    <AppShell>
      <section className="sessions-page">
        <article className="card session-hero-card">
          <div className="session-hero-copy">
            <span className="section-kicker">Seances</span>
            <h1>Mes seances</h1>
            <p className="muted">
              Garde sous la main tes formats d&apos;entrainement, quel que soit le sport.
            </p>
          </div>

          <div className="session-hero-actions">
            <Link href="/sessions/new" className="button primary">
              Creer une seance
            </Link>
          </div>
        </article>

        {message && <p className="form-feedback form-feedback--error">{message}</p>}

        {loading ? (
          <div className="challenge-state">
            <p>Chargement de tes séances...</p>
          </div>
        ) : sessions.length === 0 ? (
          <div className="challenge-state">
            <p>Aucune séance créée.</p>
            <div className="session-empty-actions">
              <Link href="/sessions/new" className="button primary">
                Créer une séance
              </Link>
            </div>
          </div>
        ) : (
          <div className="sessions-grid">
            {sessions.map((session) => {
              const sessionBlocks = blocksBySession.get(session.id) || [];
              const firstBlock = sessionBlocks[0];

              return (
                <article key={session.id} className="session-card">
                  <div className="session-card__top">
                    <div className={getSportBadgeClassName(session.sport, 'badge', 'Sport')}>
                      {formatSportBadgeLabel(session.sport, 'Sport')}
                    </div>
                    <span className="session-card__date">
                      Cree {formatRelativeDate(session.created_at)}
                    </span>
                  </div>

                  <div className="session-card__content">
                    <h2>{session.name}</h2>
                    <p>{session.description || 'Séance sans description pour le moment.'}</p>
                  </div>

                  <div className="session-card__meta">
                    <span>{sessionBlocks.length} bloc{sessionBlocks.length > 1 ? 's' : ''}</span>
                    <span>
                      {firstBlock
                        ? `${firstBlock.name} · ${formatSessionBlockSummary(
                            firstBlock.block_type,
                            firstBlock.target_value,
                            firstBlock.sets_count,
                            firstBlock.charge_kg
                          )}`
                        : 'Bloc à compléter'}
                    </span>
                  </div>

                  <Link href={`/sessions/${session.id}`} className="button ghost">
                    Voir le detail
                  </Link>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </AppShell>
  );
}



