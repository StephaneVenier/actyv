'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { AppShell } from '@/components/AppShell';
import { formatSportBadgeLabel, getSportBadgeClassName } from '@/components/sport-badge';
import { supabase } from '@/lib/supabase';
import {
  formatProgramDate,
  formatProgramPlannedDateLabel,
  formatProgramVisibilityLabel,
  getTrainingProgramProgress,
  getTrainingProgramSessionStatus,
  getTrainingProgramSessionStatusLabel,
  TrainingProgram,
  TrainingProgramCompletion,
  TrainingProgramSession,
} from '@/lib/training-programs';

type ProgramCardData = TrainingProgram & {
  sessions: TrainingProgramSession[];
  completions: TrainingProgramCompletion[];
};

function formatProgramProgressLabel(completedCount: number, totalCount: number) {
  return `${completedCount} / ${totalCount} seance${totalCount > 1 ? 's' : ''} terminee${totalCount > 1 ? 's' : ''}`;
}

export default function ProgramsPage() {
  const [programs, setPrograms] = useState<TrainingProgram[]>([]);
  const [programSessions, setProgramSessions] = useState<TrainingProgramSession[]>([]);
  const [programCompletions, setProgramCompletions] = useState<TrainingProgramCompletion[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const loadPrograms = async () => {
      setLoading(true);
      setMessage(null);

      try {
        const {
          data: { user },
          error: userError,
        } = await supabase.auth.getUser();

        if (userError || !user) {
          if (userError) {
            console.error('Erreur chargement user programmes :', userError);
          }
          setPrograms([]);
          setProgramSessions([]);
          setProgramCompletions([]);
          setMessage('Connecte-toi pour voir tes programmes.');
          return;
        }

        const { data: programsRows, error: programsError } = await supabase
          .from('training_programs')
          .select('id, user_id, name, description, sport, duration_weeks, visibility, start_date, created_at')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false });

        if (programsError) {
          console.error('Erreur chargement programmes :', programsError);
          setPrograms([]);
          setProgramSessions([]);
          setProgramCompletions([]);
          setMessage('Impossible de charger tes programmes pour le moment.');
          return;
        }

        const nextPrograms = (programsRows as TrainingProgram[]) || [];
        setPrograms(nextPrograms);

        if (nextPrograms.length === 0) {
          setProgramSessions([]);
          setProgramCompletions([]);
          return;
        }

        const programIds = nextPrograms.map((program) => program.id);

        const [sessionsResponse, completionsResponse] = await Promise.all([
          supabase
            .from('training_program_sessions')
            .select('id, program_id, session_id, session_name, sport, week_number, day_of_week, order_index, created_at')
            .in('program_id', programIds)
            .order('week_number', { ascending: true })
            .order('day_of_week', { ascending: true })
            .order('order_index', { ascending: true }),
          supabase
            .from('training_program_completions')
            .select('id, user_id, program_id, program_session_id, session_id, workout_history_id, completed_at, created_at')
            .eq('user_id', user.id)
            .in('program_id', programIds)
            .order('completed_at', { ascending: false }),
        ]);

        if (sessionsResponse.error) {
          console.error('Erreur chargement seances de programme :', sessionsResponse.error);
          setProgramSessions([]);
        } else {
          setProgramSessions((sessionsResponse.data as TrainingProgramSession[]) || []);
        }

        if (completionsResponse.error) {
          console.error('Erreur chargement progression programme :', completionsResponse.error);
          setProgramCompletions([]);
        } else {
          setProgramCompletions((completionsResponse.data as TrainingProgramCompletion[]) || []);
        }
      } finally {
        setLoading(false);
      }
    };

    loadPrograms();
  }, []);

  const programsWithChildren = useMemo<ProgramCardData[]>(() => {
    return programs.map((program) => ({
      ...program,
      sessions: programSessions.filter((entry) => entry.program_id === program.id),
      completions: programCompletions.filter((entry) => entry.program_id === program.id),
    }));
  }, [programCompletions, programSessions, programs]);

  return (
    <AppShell>
      <section className="sessions-page">
        <article className="card session-hero-card">
          <div className="session-hero-copy">
            <span className="section-kicker">Programmes</span>
            <h1>Mes programmes</h1>
            <p className="muted">Construis, planifie et partage tes seances sur plusieurs semaines.</p>
          </div>

          <div className="session-hero-actions">
            <Link href="/programs/new" className="button primary">
              Creer un programme
            </Link>
            <Link href="/sessions" className="button ghost">
              Voir mes seances
            </Link>
          </div>
        </article>

        <article className="card session-form-card program-placeholder-card">
          <div className="program-placeholder-card__copy">
            <span className="section-kicker">Apercu</span>
            <h2>Programmes</h2>
            <p className="muted">
              Structure tes prochaines semaines avec un cadre simple : sport principal, duree, seances planifiees
              et suivi de progression.
            </p>
          </div>
          <div className="program-placeholder-card__chips">
            <span className="session-block-chip">Cycles hebdo</span>
            <span className="session-block-chip">Seances planifiees</span>
            <span className="session-block-chip">Partage a venir</span>
          </div>
        </article>

        {message ? <p className="form-feedback form-feedback--error">{message}</p> : null}

        {loading ? (
          <div className="challenge-state">
            <p>Chargement de tes programmes...</p>
          </div>
        ) : programsWithChildren.length === 0 ? (
          <div className="challenge-state">
            <p>Aucun programme pour le moment.</p>
            <div className="session-empty-actions">
              <Link href="/programs/new" className="button primary">
                Creer un programme
              </Link>
            </div>
          </div>
        ) : (
          <div className="sessions-grid programs-grid">
            {programsWithChildren.map((program) => {
              const totalSessions = program.sessions.length;
              const completedCount = program.completions.length;
              const progress = getTrainingProgramProgress(completedCount, totalSessions);
              const nextPlannedSession = program.sessions.find((sessionEntry) => {
                const completion = program.completions.find((entry) => entry.program_session_id === sessionEntry.id);
                return (
                  getTrainingProgramSessionStatus(
                    program.start_date,
                    sessionEntry.week_number,
                    sessionEntry.day_of_week,
                    completion?.completed_at
                  ) !== 'completed'
                );
              });
              const nextPlannedCompletion = nextPlannedSession
                ? program.completions.find((entry) => entry.program_session_id === nextPlannedSession.id)
                : null;

              return (
                <article key={program.id} className="session-card program-card">
                  <div className="session-card__top">
                    <div className={getSportBadgeClassName(program.sport, 'badge', 'Sport')}>
                      {formatSportBadgeLabel(program.sport, 'Sport')}
                    </div>
                    <span className="session-card__date">{formatProgramVisibilityLabel(program.visibility)}</span>
                  </div>

                  <div className="session-card__content">
                    <h2>{program.name}</h2>
                    <p>{program.description || 'Programme sans description pour le moment.'}</p>
                  </div>

                  <div className="program-card__facts">
                    <span>{program.sport || 'Sport libre'}</span>
                    <span>
                      {program.duration_weeks} semaine{program.duration_weeks > 1 ? 's' : ''}
                    </span>
                    <span>Debut {formatProgramDate(program.start_date)}</span>
                    <span>Cree le {formatProgramDate(program.created_at)}</span>
                  </div>

                  <div className="program-card__summary">
                    <div className="program-progress-track" aria-hidden="true">
                      <span className="program-progress-track__fill" style={{ width: `${progress}%` }} />
                    </div>
                    <div className="session-card__meta">
                      <span>{formatProgramProgressLabel(completedCount, totalSessions)}</span>
                      <span>
                        Debut {formatProgramDate(program.start_date)} · {program.duration_weeks} semaine
                        {program.duration_weeks > 1 ? 's' : ''}
                      </span>
                    </div>
                  </div>

                  {nextPlannedSession ? (
                    <div className="program-next-card">
                      <strong>Prochaine seance</strong>
                      <p>
                        {nextPlannedSession.session_name} ·{' '}
                        {formatProgramPlannedDateLabel(
                          program.start_date,
                          nextPlannedSession.week_number,
                          nextPlannedSession.day_of_week
                        )}
                      </p>
                      <small>
                        {getTrainingProgramSessionStatusLabel(
                          getTrainingProgramSessionStatus(
                            program.start_date,
                            nextPlannedSession.week_number,
                            nextPlannedSession.day_of_week,
                            nextPlannedCompletion?.completed_at
                          )
                        )}
                      </small>
                    </div>
                  ) : null}

                  <Link href={`/programs/${program.id}`} className="button ghost">
                    Voir le programme
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
