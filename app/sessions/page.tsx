'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { AppShell } from '@/components/AppShell';
import { formatSportBadgeLabel, getSportBadgeClassName } from '@/components/sport-badge';
import {
  formatEstimatedWorkoutCalories,
  formatSessionBlockSummary,
  formatSessionVolumeKg,
  getEstimatedWorkoutCalories,
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

type WorkoutHistoryEntry = {
  id: string;
  workout_id: string | null;
  workout_name: string;
  completed_at: string;
  duration_seconds: number | null;
  total_volume: number | null;
  completed_exercises: number | null;
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

function formatSessionDuration(durationSeconds: number | null) {
  if (!durationSeconds || durationSeconds <= 0) return null;

  const minutes = Math.floor(durationSeconds / 60);
  const seconds = durationSeconds % 60;

  if (minutes <= 0) {
    return `${seconds} sec`;
  }

  return `${minutes} min${seconds > 0 ? ` ${seconds.toString().padStart(2, '0')}` : ''}`;
}

export default function SessionsPage() {
  const [sessions, setSessions] = useState<TrainingSession[]>([]);
  const [blocks, setBlocks] = useState<TrainingSessionBlockRecord[]>([]);
  const [historyEntries, setHistoryEntries] = useState<WorkoutHistoryEntry[]>([]);
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
          console.error('Erreur chargement user seances :', userError);
          setMessage('Impossible de charger tes seances pour le moment.');
          setSessions([]);
          setBlocks([]);
          setHistoryEntries([]);
          return;
        }

        if (!user) {
          setSessions([]);
          setBlocks([]);
          setHistoryEntries([]);
          return;
        }

        const { data: sessionRows, error: sessionsError } = await supabase
          .from('training_sessions')
          .select('id, user_id, name, sport, description, created_at')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false });

        if (sessionsError) {
          console.error('Erreur chargement seances :', sessionsError);
          setMessage('Impossible de charger tes seances pour le moment.');
          setSessions([]);
          setBlocks([]);
          setHistoryEntries([]);
          return;
        }

        const nextSessions = (sessionRows as TrainingSession[]) || [];
        setSessions(nextSessions);

        const { data: historyRows, error: historyError } = await supabase
          .from('workout_sessions_history')
          .select(
            'id, workout_id, workout_name, completed_at, duration_seconds, total_volume, completed_exercises'
          )
          .eq('user_id', user.id)
          .order('completed_at', { ascending: false })
          .limit(12);

        if (historyError) {
          console.error('Erreur chargement historique seances :', historyError);
          setHistoryEntries([]);
        } else {
          setHistoryEntries((historyRows as WorkoutHistoryEntry[]) || []);
        }

        if (nextSessions.length === 0) {
          setBlocks([]);
          return;
        }

        const { data: blockRows, error: blocksError } = await fetchTrainingSessionBlocks(
          nextSessions.map((session) => session.id)
        );

        if (blocksError) {
          console.error('Erreur chargement blocs seances :', blocksError);
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
      <section className="sessions-page sessions-page--dark sessions-page--compact-overview">
        <article className="card session-hero-card session-hero-card--compact">
          <div className="session-hero-copy">
            <span className="section-kicker">Seances</span>
            <h1>Mes seances</h1>
            <p className="muted">
              Garde sous la main tes formats d&apos;entrainement, quel que soit le sport.
            </p>
          </div>

          <div className="session-hero-actions session-hero-actions--compact">
            <Link href="/sessions/new" className="button primary">
              Creer une seance
            </Link>
          </div>
        </article>

        {message && <p className="form-feedback form-feedback--error">{message}</p>}

        {loading ? (
          <div className="challenge-state">
            <p>Chargement de tes seances...</p>
          </div>
        ) : sessions.length === 0 ? (
          <div className="challenge-state">
            <p>Aucune seance creee.</p>
            <div className="session-empty-actions">
              <Link href="/sessions/new" className="button primary">
                Creer une seance
              </Link>
            </div>
          </div>
        ) : (
          <div className="sessions-grid sessions-grid--compact-overview">
            {sessions.map((session) => {
              const sessionBlocks = blocksBySession.get(session.id) || [];
              const firstBlock = sessionBlocks[0];

              return (
                <article key={session.id} className="session-card session-card--compact session-card--overview-compact">
                  <div className="session-card__top">
                    <div className={getSportBadgeClassName(session.sport, 'badge', 'Sport')}>
                      {formatSportBadgeLabel(session.sport, 'Sport')}
                    </div>
                    <span className="session-card__date">Cree {formatRelativeDate(session.created_at)}</span>
                  </div>

                  <div className="session-card__content">
                    <h2>{session.name}</h2>
                    <p>{session.description || 'Seance sans description pour le moment.'}</p>
                  </div>

                  <div className="session-card__meta session-card__meta--compact">
                    <span>{sessionBlocks.length} bloc{sessionBlocks.length > 1 ? 's' : ''}</span>
                    <span>
                      {firstBlock
                        ? `Premier: ${firstBlock.name} · ${formatSessionBlockSummary(
                            firstBlock.block_type,
                            firstBlock.target_value,
                            firstBlock.sets_count,
                            firstBlock.charge_kg
                          )}`
                        : 'Bloc a completer'}
                    </span>
                  </div>

                  <div className="session-card__actions session-card__actions--compact">
                    <Link href={`/sessions/${session.id}/live`} className="button primary">
                      Lancer
                    </Link>
                    <Link href={`/sessions/${session.id}`} className="button ghost">
                      Voir le detail
                    </Link>
                  </div>
                </article>
              );
            })}
          </div>
        )}

        <article className="card session-form-card stack">
          <div className="session-blocks-header">
            <div>
              <span className="section-kicker">Historique</span>
              <h2>Historique des seances</h2>
            </div>
          </div>

          {historyEntries.length === 0 ? (
            <div className="challenge-state challenge-state--compact">
              <p>Aucune seance realisee pour le moment.</p>
            </div>
          ) : (
            <div className="session-block-list">
              {historyEntries.map((entry) => {
                const linkedSession = sessions.find((session) => session.id === entry.workout_id) || null;
                const estimatedCalories =
                  entry.duration_seconds && linkedSession
                    ? getEstimatedWorkoutCalories(entry.duration_seconds, linkedSession.sport)
                    : null;

                return (
                  <article key={entry.id} className="session-block-card">
                    <div className="session-block-card__top">
                      <div className="session-block-check__label">
                        <strong>{entry.workout_name}</strong>
                        <small>{new Date(entry.completed_at).toLocaleDateString('fr-FR')}</small>
                      </div>
                      {linkedSession ? (
                        <div className={getSportBadgeClassName(linkedSession.sport, 'badge', 'Sport')}>
                          {formatSportBadgeLabel(linkedSession.sport, 'Sport')}
                        </div>
                      ) : null}
                    </div>

                    <p className="session-block-preview">
                      {formatSessionDuration(entry.duration_seconds) || '-'} •{' '}
                      {entry.completed_exercises || 0} exercice
                      {(entry.completed_exercises || 0) > 1 ? 's' : ''}
                    </p>

                    {entry.total_volume ? (
                      <p className="session-block-volume">
                        Volume : {formatSessionVolumeKg(entry.total_volume)}
                      </p>
                    ) : null}

                    {estimatedCalories ? (
                      <p className="session-block-preview">
                        Calories estimees : {formatEstimatedWorkoutCalories(estimatedCalories)}
                      </p>
                    ) : null}
                  </article>
                );
              })}
            </div>
          )}
        </article>
      </section>
    </AppShell>
  );
}
