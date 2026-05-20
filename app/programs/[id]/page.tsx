'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { AppShell } from '@/components/AppShell';
import { queuePendingToast } from '@/components/ToastProvider';
import { formatSportBadgeLabel, getSportBadgeClassName } from '@/components/sport-badge';
import { supabase } from '@/lib/supabase';
import {
  formatProgramDate,
  formatProgramPlannedDateLabel,
  formatProgramVisibilityLabel,
  getProgramDayLabel,
  getProgramWeekLabel,
  getTrainingProgramProgress,
  getTrainingProgramSessionStatus,
  getTrainingProgramSessionStatusLabel,
  TrainingProgram,
  TrainingProgramCompletion,
  TrainingProgramSession,
} from '@/lib/training-programs';

function formatRelativeCompletionDate(dateString: string | null | undefined) {
  if (!dateString) return '-';

  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return '-';

  return date.toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: 'short',
  });
}

export default function ProgramDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params?.id as string;

  const [program, setProgram] = useState<TrainingProgram | null>(null);
  const [programSessions, setProgramSessions] = useState<TrainingProgramSession[]>([]);
  const [programCompletions, setProgramCompletions] = useState<TrainingProgramCompletion[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const loadProgram = async () => {
      setLoading(true);
      setMessage(null);

      try {
        const {
          data: { user },
          error: userError,
        } = await supabase.auth.getUser();

        if (userError || !user) {
          if (userError) {
            console.error('Erreur chargement user programme :', userError);
          }
          setProgram(null);
          setProgramSessions([]);
          setProgramCompletions([]);
          setMessage('Connecte-toi pour consulter ce programme.');
          return;
        }

        const { data: programRow, error: programError } = await supabase
          .from('training_programs')
          .select('id, user_id, name, description, sport, duration_weeks, visibility, start_date, created_at')
          .eq('id', id)
          .eq('user_id', user.id)
          .maybeSingle();

        if (programError) {
          console.error('Erreur chargement detail programme :', programError);
          setProgram(null);
          setProgramSessions([]);
          setProgramCompletions([]);
          setMessage('Impossible de charger ce programme.');
          return;
        }

        if (!programRow) {
          setProgram(null);
          setProgramSessions([]);
          setProgramCompletions([]);
          return;
        }

        setProgram(programRow as TrainingProgram);

        const [sessionsResponse, completionsResponse] = await Promise.all([
          supabase
            .from('training_program_sessions')
            .select('id, program_id, session_id, session_name, sport, week_number, day_of_week, order_index, created_at')
            .eq('program_id', id)
            .order('week_number', { ascending: true })
            .order('day_of_week', { ascending: true })
            .order('order_index', { ascending: true }),
          supabase
            .from('training_program_completions')
            .select('id, user_id, program_id, program_session_id, session_id, workout_history_id, completed_at, created_at')
            .eq('user_id', user.id)
            .eq('program_id', id)
            .order('completed_at', { ascending: false }),
        ]);

        if (sessionsResponse.error) {
          console.error('Erreur chargement seances detail programme :', sessionsResponse.error);
          setProgramSessions([]);
        } else {
          setProgramSessions((sessionsResponse.data as TrainingProgramSession[]) || []);
        }

        if (completionsResponse.error) {
          console.error('Erreur chargement progression detail programme :', completionsResponse.error);
          setProgramCompletions([]);
        } else {
          setProgramCompletions((completionsResponse.data as TrainingProgramCompletion[]) || []);
        }
      } finally {
        setLoading(false);
      }
    };

    loadProgram();
  }, [id]);

  const completedCount = programCompletions.length;
  const totalSessions = programSessions.length;
  const progress = getTrainingProgramProgress(completedCount, totalSessions);

  const sessionsByWeek = useMemo(() => {
    const grouped = new Map<number, TrainingProgramSession[]>();

    programSessions.forEach((entry) => {
      const current = grouped.get(entry.week_number) || [];
      current.push(entry);
      grouped.set(entry.week_number, current);
    });

    return [...grouped.entries()].sort((left, right) => left[0] - right[0]);
  }, [programSessions]);

  const handleDeleteProgram = async () => {
    if (!program || deleting) return;

    const confirmed = window.confirm(
      'Supprimer ce programme ? Ses seances planifiees et sa progression seront supprimees, mais pas tes seances originales.'
    );

    if (!confirmed) return;

    setDeleting(true);
    setMessage(null);

    try {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        if (userError) {
          console.error('Erreur chargement user suppression programme :', userError);
        }
        setMessage('Connecte-toi pour supprimer ce programme.');
        return;
      }

      const { error } = await supabase
        .from('training_programs')
        .delete()
        .eq('id', program.id)
        .eq('user_id', user.id);

      if (error) {
        console.error('Erreur suppression programme :', error);
        setMessage('Impossible de supprimer le programme pour le moment.');
        return;
      }

      queuePendingToast({ message: 'Programme supprime', tone: 'info' });
      router.push('/programs');
    } catch (error) {
      console.error('Erreur inattendue suppression programme :', error);
      setMessage("Une erreur inattendue s'est produite.");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <AppShell>
      <section className="sessions-page">
        <Link href="/programs" className="detail-back-link">
          ← Retour aux programmes
        </Link>

        {loading ? (
          <div className="challenge-state">
            <p>Chargement du programme...</p>
          </div>
        ) : !program ? (
          <div className="challenge-state">
            <p>{message || 'Ce programme est introuvable.'}</p>
            <div className="session-empty-actions">
              <Link href="/programs" className="button primary">
                Revenir aux programmes
              </Link>
            </div>
          </div>
        ) : (
          <>
            <article className="card session-hero-card">
              <div className="session-hero-copy">
                <div className={getSportBadgeClassName(program.sport, 'badge', 'Sport')}>
                  {formatSportBadgeLabel(program.sport, 'Sport')}
                </div>
                <h1>{program.name}</h1>
                <p className="muted">{program.description || 'Programme sans description pour le moment.'}</p>
              </div>

              <div className="session-hero-actions">
                <Link href={`/programs/${program.id}/edit`} className="button primary">
                  Modifier le programme
                </Link>
                <Link href="/programs/new" className="button ghost">
                  Creer un autre programme
                </Link>
                <Link href="/sessions" className="button ghost">
                  Voir mes seances
                </Link>
                <button
                  type="button"
                  className="button ghost session-delete-button"
                  onClick={handleDeleteProgram}
                  disabled={deleting}
                  aria-busy={deleting}
                >
                  {deleting ? 'Suppression...' : 'Supprimer le programme'}
                </button>
              </div>
            </article>

            <article className="card session-form-card stack">
              <div className="session-blocks-header">
                <div>
                  <span className="section-kicker">Progression</span>
                  <h2>Vue d'ensemble</h2>
                </div>
                <span className="session-progress-pill">{formatProgramVisibilityLabel(program.visibility)}</span>
              </div>

              <div className="program-progress-track" aria-hidden="true">
                <span className="program-progress-track__fill" style={{ width: `${progress}%` }} />
              </div>

              <div className="session-detail-meta">
                <div className="session-meta-card">
                  <span>Sport</span>
                  <strong>{formatSportBadgeLabel(program.sport, 'Sport')}</strong>
                </div>
                <div className="session-meta-card">
                  <span>Progression</span>
                  <strong>
                    {completedCount} / {totalSessions}
                  </strong>
                </div>
                <div className="session-meta-card">
                  <span>Pourcentage</span>
                  <strong>{progress}%</strong>
                </div>
                <div className="session-meta-card">
                  <span>Duree</span>
                  <strong>
                    {program.duration_weeks} semaine{program.duration_weeks > 1 ? 's' : ''}
                  </strong>
                </div>
                <div className="session-meta-card">
                  <span>Debut</span>
                  <strong>{formatProgramDate(program.start_date)}</strong>
                </div>
              </div>
            </article>

            {programSessions.length === 0 ? (
              <article className="card session-form-card stack">
                <div className="challenge-state challenge-state--compact">
                  <p>Aucune seance planifiee dans ce programme.</p>
                </div>
              </article>
            ) : (
              sessionsByWeek.map(([weekNumber, entries]) => (
                <article key={weekNumber} className="card session-form-card stack">
                  <div className="session-blocks-header">
                    <div>
                      <span className="section-kicker">Semaine</span>
                      <h2>{getProgramWeekLabel(weekNumber)}</h2>
                    </div>
                  </div>

                  <div className="session-block-list">
                    {entries.map((entry) => {
                      const completion = programCompletions.find(
                        (completionEntry) => completionEntry.program_session_id === entry.id
                      );
                      const status = getTrainingProgramSessionStatus(
                        program.start_date,
                        entry.week_number,
                        entry.day_of_week,
                        completion?.completed_at
                      );

                      return (
                        <article key={entry.id} className="session-block-card program-session-card">
                          <div className="session-block-card__top">
                            <div className="session-block-check__label">
                              <strong>{entry.session_name}</strong>
                              <small>
                                {getProgramDayLabel(entry.day_of_week)} ·{' '}
                                {formatProgramPlannedDateLabel(
                                  program.start_date,
                                  entry.week_number,
                                  entry.day_of_week
                                )}
                              </small>
                            </div>
                            <span className={`program-status program-status--${status}`}>
                              {getTrainingProgramSessionStatusLabel(status)}
                            </span>
                          </div>

                          <div className="session-card__meta">
                            <span>Ordre {entry.order_index}</span>
                            <span>{entry.sport || formatSportBadgeLabel(program.sport, 'Sport')}</span>
                            {completion?.completed_at ? (
                              <span>Realisee {formatRelativeCompletionDate(completion.completed_at)}</span>
                            ) : null}
                          </div>

                          <div className="session-hero-actions">
                            {entry.session_id ? (
                              <>
                                <Link
                                  href={`/sessions/${entry.session_id}/live?programSessionId=${entry.id}&programId=${program.id}`}
                                  className="button primary"
                                >
                                  Lancer
                                </Link>
                                <Link href={`/sessions/${entry.session_id}`} className="button ghost">
                                  Voir la seance
                                </Link>
                              </>
                            ) : (
                              <span className="muted">Seance non liee pour le moment.</span>
                            )}
                          </div>
                        </article>
                      );
                    })}
                  </div>
                </article>
              ))
            )}
          </>
        )}
      </section>
    </AppShell>
  );
}
