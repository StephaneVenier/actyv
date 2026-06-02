'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { AppShell } from '@/components/AppShell';
import { formatSportBadgeLabel, getSportBadgeClassName } from '@/components/sport-badge';
import { fetchTrainingSessionBlocks, type TrainingSessionBlockRecord } from '@/lib/training-session-blocks-db';
import { getSessionEstimatedDuration, formatBlockMainValue } from '@/lib/session-blocks';
import {
  formatDailySessionDateLabel,
  getBestDailySessionStreakDays,
  getDailySessionStreakDays,
  getTodayIsoDate,
  isDailySessionForToday,
  type DailySession,
  type DailySessionCompletion,
} from '@/lib/daily-sessions';
import { supabase } from '@/lib/supabase';

type TrainingSessionSummary = {
  id: string;
  user_id: string;
  name: string;
  sport: string | null;
  difficulty: string | null;
  description: string | null;
  visibility: 'private' | 'public' | null;
  created_at: string | null;
};

function formatDurationLabel(totalSeconds: number | null) {
  if (!Number.isFinite(Number(totalSeconds)) || Number(totalSeconds) <= 0) {
    return 'Duree libre';
  }

  const roundedMinutes = Math.max(1, Math.round(Number(totalSeconds) / 60));
  return `${roundedMinutes} min`;
}

export default function DailySessionPage() {
  const [dailySession, setDailySession] = useState<DailySession | null>(null);
  const [session, setSession] = useState<TrainingSessionSummary | null>(null);
  const [blocks, setBlocks] = useState<TrainingSessionBlockRecord[]>([]);
  const [completion, setCompletion] = useState<DailySessionCompletion | null>(null);
  const [streakDays, setStreakDays] = useState(0);
  const [bestStreakDays, setBestStreakDays] = useState(0);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const loadDailySession = async () => {
      setLoading(true);
      setMessage(null);

      try {
        const todayIso = getTodayIsoDate();
        const {
          data: { user },
        } = await supabase.auth.getUser();

        let selectedDailySession: DailySession | null = null;

        const todayResponse = await supabase
          .from('daily_sessions')
          .select('id, session_id, scheduled_for, bonus_xp, created_at')
          .eq('scheduled_for', todayIso)
          .maybeSingle();

        if (todayResponse.error) {
          console.error('Erreur chargement seance du jour :', todayResponse.error);
        } else {
          selectedDailySession = (todayResponse.data as DailySession | null) || null;
        }

        if (!selectedDailySession) {
          const nextResponse = await supabase
            .from('daily_sessions')
            .select('id, session_id, scheduled_for, bonus_xp, created_at')
            .gte('scheduled_for', todayIso)
            .order('scheduled_for', { ascending: true })
            .limit(1)
            .maybeSingle();

          if (nextResponse.error) {
            console.error('Erreur chargement prochaine seance du jour :', nextResponse.error);
          } else {
            selectedDailySession = (nextResponse.data as DailySession | null) || null;
          }
        }

        if (!selectedDailySession) {
          setDailySession(null);
          setSession(null);
          setBlocks([]);
          setCompletion(null);
          setStreakDays(0);
          setBestStreakDays(0);
          setMessage("Aucune seance du jour n'est programmee pour le moment.");
          return;
        }

        setDailySession(selectedDailySession);

        const { data: sessionRow, error: sessionError } = await supabase
          .from('training_sessions')
          .select('id, user_id, name, sport, difficulty, description, visibility, created_at')
          .eq('id', selectedDailySession.session_id)
          .eq('visibility', 'public')
          .maybeSingle();

        if (sessionError) {
          console.error('Erreur chargement seance publique du jour :', sessionError);
          setSession(null);
          setBlocks([]);
          setCompletion(null);
          setMessage("Impossible de charger la seance du jour.");
          return;
        }

        if (!sessionRow) {
          setSession(null);
          setBlocks([]);
          setCompletion(null);
          setMessage("La seance du jour referencee est introuvable.");
          return;
        }

        setSession(sessionRow as TrainingSessionSummary);

        const { data: blockRows, error: blocksError } = await fetchTrainingSessionBlocks([selectedDailySession.session_id]);
        if (blocksError) {
          console.error('Erreur chargement blocs seance du jour :', blocksError);
          setBlocks([]);
        } else {
          setBlocks(blockRows || []);
        }

        if (!user) {
          setCompletion(null);
          setStreakDays(0);
          setBestStreakDays(0);
          return;
        }

        const [completionResponse, streakResponse] = await Promise.all([
          supabase
            .from('daily_session_completions')
            .select('id, daily_session_id, user_id, session_id, workout_history_id, scheduled_for, completed_at, created_at')
            .eq('user_id', user.id)
            .eq('daily_session_id', selectedDailySession.id)
            .maybeSingle(),
          supabase
            .from('daily_session_completions')
            .select('scheduled_for')
            .eq('user_id', user.id)
            .order('scheduled_for', { ascending: false })
            .limit(120),
        ]);

        if (completionResponse.error) {
          console.error('Erreur chargement completion seance du jour :', completionResponse.error);
          setCompletion(null);
        } else {
          setCompletion((completionResponse.data as DailySessionCompletion | null) || null);
        }

        if (streakResponse.error) {
          console.error('Erreur chargement streak seance du jour :', streakResponse.error);
          setStreakDays(0);
          setBestStreakDays(0);
        } else {
          const streakRows =
            ((streakResponse.data as Array<Pick<DailySessionCompletion, 'scheduled_for'>>) || []);
          setStreakDays(getDailySessionStreakDays(streakRows));
          setBestStreakDays(getBestDailySessionStreakDays(streakRows));
        }
      } finally {
        setLoading(false);
      }
    };

    loadDailySession();
  }, []);

  const estimatedDuration = useMemo(() => formatDurationLabel(getSessionEstimatedDuration(blocks)), [blocks]);
  const isToday = isDailySessionForToday(dailySession?.scheduled_for);

  return (
    <AppShell>
      <section className="sessions-page sessions-page--dark">
        <article className="card session-hero-card daily-session-hero">
          <div className="session-hero-copy">
            <span className="section-kicker">Actyv quotidien</span>
            <h1>Seance du jour</h1>
            <p className="muted">
              Une seance publique prete a lancer, avec bonus XP si tu la valides aujourd&apos;hui.
            </p>
          </div>
          <div className="daily-session-hero__aside">
            <span className="daily-session-hero__label">Ta mission sportive du jour</span>
            <strong>{streakDays} jour{streakDays > 1 ? 's' : ''} de serie</strong>
          </div>
        </article>

        {loading ? (
          <div className="challenge-state">
            <p>Chargement de la seance du jour...</p>
          </div>
        ) : !dailySession || !session ? (
          <div className="challenge-state">
            <p>{message || "Aucune seance du jour n'est disponible."}</p>
            <div className="session-empty-actions">
              <Link href="/banque" className="button primary">
                Ouvrir la Banque Actyv
              </Link>
            </div>
          </div>
        ) : (
          <>
            <article className="card home-program-reminder-card daily-session-card">
              <div className="home-program-reminder-card__top">
                <div className={getSportBadgeClassName(session.sport, 'badge', 'Sport')}>
                  {formatSportBadgeLabel(session.sport, 'Sport')}
                </div>
                <span className="session-progress-pill">
                  {isToday ? "Aujourd'hui" : formatDailySessionDateLabel(dailySession.scheduled_for)}
                </span>
              </div>

              <div className="home-program-reminder-card__copy">
                <span className="daily-session-card__eyebrow">
                  {isToday ? "Seance d'aujourd'hui" : 'Prochaine seance du jour'}
                </span>
                <strong>{session.name}</strong>
                <p>{session.description || 'Seance publique Actyv du jour.'}</p>
              </div>

              <div className="program-card__facts">
                <span>{session.difficulty || 'Difficulte libre'}</span>
                <span>{estimatedDuration}</span>
                <span>{blocks.length} bloc{blocks.length > 1 ? 's' : ''}</span>
                <span>{dailySession.bonus_xp} XP bonus</span>
              </div>

              <div className="daily-session-stats-grid">
                <p className="daily-session-streak">
                  <span aria-hidden="true">🔥</span> Serie actuelle <strong>{streakDays} jour{streakDays > 1 ? 's' : ''}</strong>
                </p>
                <p className="daily-session-streak">
                  <span aria-hidden="true">🏅</span> Meilleure serie <strong>{bestStreakDays} jour{bestStreakDays > 1 ? 's' : ''}</strong>
                </p>
              </div>

              {completion ? (
                <p className="form-feedback form-feedback--success">
                  Deja realisee aujourd&apos;hui. Bonus XP deja recupere pour {formatDailySessionDateLabel(completion.scheduled_for)}.
                </p>
              ) : (
                <p className="daily-session-status">
                  Pas encore realisee aujourd&apos;hui. {dailySession.bonus_xp} XP bonus a recuperer.
                </p>
              )}

              <div className="home-program-reminder-card__actions">
                <Link
                  href={`/sessions/${session.id}/live?dailySessionId=${dailySession.id}`}
                  className="button primary"
                >
                  {completion ? 'Relancer la seance' : 'Lancer la seance'}
                </Link>
                <Link href={`/sessions/${session.id}`} className="button ghost">
                  Voir la seance
                </Link>
              </div>
            </article>

            <article className="card daily-session-blocks">
              <div className="home-challenges__header">
                <div>
                  <span className="section-kicker">Apercu</span>
                  <h2>Les blocs de la seance</h2>
                </div>
              </div>

              <div className="daily-session-blocks__list">
                {blocks.map((block, index) => (
                  <article key={block.id} className="session-block-card daily-session-block-card">
                    <div className="session-block-card__top">
                      <strong>{`${index + 1}. ${block.name}`}</strong>
                    </div>
                    <p className="muted">{formatBlockMainValue(block)}</p>
                  </article>
                ))}
              </div>
            </article>
          </>
        )}
      </section>
    </AppShell>
  );
}
