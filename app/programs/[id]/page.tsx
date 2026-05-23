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
  PROGRAM_DAY_OPTIONS,
  TrainingProgram,
  TrainingProgramCompletion,
  TrainingProgramSession,
} from '@/lib/training-programs';
import { fetchTrainingSessionBlocks } from '@/lib/training-session-blocks-db';

type AvailableProgramSessionOption = {
  id: string;
  name: string;
  sport: string | null;
  description: string | null;
  blockCount: number;
};

type PlannerSlot = {
  weekNumber: number;
  dayOfWeek: number;
};

function formatRelativeCompletionDate(dateString: string | null | undefined) {
  if (!dateString) return '-';

  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return '-';

  return date.toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: 'short',
  });
}

function sortProgramSessions(entries: TrainingProgramSession[]) {
  return [...entries].sort((left, right) => {
    if (left.week_number !== right.week_number) return left.week_number - right.week_number;
    if (left.day_of_week !== right.day_of_week) return left.day_of_week - right.day_of_week;
    return left.order_index - right.order_index;
  });
}

export default function ProgramDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params?.id as string;

  const [program, setProgram] = useState<TrainingProgram | null>(null);
  const [programSessions, setProgramSessions] = useState<TrainingProgramSession[]>([]);
  const [programCompletions, setProgramCompletions] = useState<TrainingProgramCompletion[]>([]);
  const [availableSessions, setAvailableSessions] = useState<AvailableProgramSessionOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingAvailableSessions, setLoadingAvailableSessions] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [plannerBusy, setPlannerBusy] = useState(false);
  const [activeSlot, setActiveSlot] = useState<PlannerSlot | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const loadProgram = async () => {
      setLoading(true);
      setLoadingAvailableSessions(true);
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
          setAvailableSessions([]);
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
          setAvailableSessions([]);
          setMessage('Impossible de charger ce programme.');
          return;
        }

        if (!programRow) {
          setProgram(null);
          setProgramSessions([]);
          setProgramCompletions([]);
          setAvailableSessions([]);
          return;
        }

        setProgram(programRow as TrainingProgram);

        const [sessionsResponse, completionsResponse, availableSessionsResponse] = await Promise.all([
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
          supabase
            .from('training_sessions')
            .select('id, name, sport, description')
            .eq('user_id', user.id)
            .order('created_at', { ascending: false }),
        ]);

        if (sessionsResponse.error) {
          console.error('Erreur chargement seances detail programme :', sessionsResponse.error);
          setProgramSessions([]);
        } else {
          setProgramSessions(sortProgramSessions((sessionsResponse.data as TrainingProgramSession[]) || []));
        }

        if (completionsResponse.error) {
          console.error('Erreur chargement progression detail programme :', completionsResponse.error);
          setProgramCompletions([]);
        } else {
          setProgramCompletions((completionsResponse.data as TrainingProgramCompletion[]) || []);
        }

        if (availableSessionsResponse.error) {
          console.error('Erreur chargement seances disponibles programme :', availableSessionsResponse.error);
          setAvailableSessions([]);
        } else {
          const nextAvailableSessions =
            ((availableSessionsResponse.data as Array<{
              id: string;
              name: string;
              sport: string | null;
              description: string | null;
            }>) || []);

          if (nextAvailableSessions.length === 0) {
            setAvailableSessions([]);
          } else {
            const { data: sessionBlocks } = await fetchTrainingSessionBlocks(
              nextAvailableSessions.map((entry) => entry.id)
            );

            const blockCounts = new Map<string, number>();
            (sessionBlocks || []).forEach((block) => {
              blockCounts.set(block.session_id, (blockCounts.get(block.session_id) || 0) + 1);
            });

            setAvailableSessions(
              nextAvailableSessions.map((entry) => ({
                ...entry,
                blockCount: blockCounts.get(entry.id) || 0,
              }))
            );
          }
        }
      } finally {
        setLoading(false);
        setLoadingAvailableSessions(false);
      }
    };

    loadProgram();
  }, [id]);

  const completedCount = programCompletions.length;
  const totalSessions = programSessions.length;
  const progress = getTrainingProgramProgress(completedCount, totalSessions);

  const weekNumbers = useMemo(() => {
    const totalWeeks = Math.max(program?.duration_weeks || 1, 1);
    return Array.from({ length: totalWeeks }, (_, index) => index + 1);
  }, [program?.duration_weeks]);

  const plannedSessionsBySlot = useMemo(() => {
    const grouped = new Map<string, TrainingProgramSession[]>();

    programSessions.forEach((entry) => {
      const key = `${entry.week_number}-${entry.day_of_week}`;
      const current = grouped.get(key) || [];
      current.push(entry);
      grouped.set(key, current);
    });

    return grouped;
  }, [programSessions]);

  const togglePlannerSlot = (weekNumber: number, dayOfWeek: number) => {
    setActiveSlot((current) =>
      current?.weekNumber === weekNumber && current?.dayOfWeek === dayOfWeek
        ? null
        : { weekNumber, dayOfWeek }
    );
  };

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

  const handleAddSessionToSlot = async (
    weekNumber: number,
    dayOfWeek: number,
    sessionOption: AvailableProgramSessionOption
  ) => {
    if (!program || plannerBusy) return;

    setPlannerBusy(true);
    setMessage(null);

    try {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        if (userError) {
          console.error('Erreur chargement user ajout seance programme :', userError);
        }
        setMessage('Connecte-toi pour modifier ce programme.');
        return;
      }

      const currentEntries = plannedSessionsBySlot.get(`${weekNumber}-${dayOfWeek}`) || [];
      const nextOrderIndex = currentEntries.reduce((max, entry) => Math.max(max, entry.order_index), 0) + 1;

      const payload = {
        program_id: program.id,
        session_id: sessionOption.id,
        session_name: sessionOption.name,
        sport: sessionOption.sport,
        week_number: weekNumber,
        day_of_week: dayOfWeek,
        order_index: nextOrderIndex,
      };

      const { data: createdSession, error } = await supabase
        .from('training_program_sessions')
        .insert(payload)
        .select('id, program_id, session_id, session_name, sport, week_number, day_of_week, order_index, created_at')
        .single();

      if (error || !createdSession) {
        console.error('Erreur ajout seance programme :', error);
        setMessage("Impossible d'ajouter cette seance au programme pour le moment.");
        return;
      }

      setProgramSessions((current) => sortProgramSessions([...current, createdSession as TrainingProgramSession]));
      setActiveSlot(null);
      queuePendingToast({ message: 'Seance ajoutee au programme', tone: 'success' });
    } catch (error) {
      console.error('Erreur inattendue ajout seance programme :', error);
      setMessage("Une erreur inattendue s'est produite.");
    } finally {
      setPlannerBusy(false);
    }
  };

  const handleRemoveProgramSession = async (programSessionId: string) => {
    if (plannerBusy) return;

    setPlannerBusy(true);
    setMessage(null);

    try {
      const { error } = await supabase.from('training_program_sessions').delete().eq('id', programSessionId);

      if (error) {
        console.error('Erreur retrait seance programme :', error);
        setMessage("Impossible de retirer cette seance du programme pour le moment.");
        return;
      }

      setProgramSessions((current) => current.filter((entry) => entry.id !== programSessionId));
      queuePendingToast({ message: 'Seance retiree du programme', tone: 'info' });
    } catch (error) {
      console.error('Erreur inattendue retrait seance programme :', error);
      setMessage("Une erreur inattendue s'est produite.");
    } finally {
      setPlannerBusy(false);
    }
  };

  return (
    <AppShell>
      <section className="sessions-page">
        <Link href="/programs" className="detail-back-link">
          Retour aux programmes
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

            {message ? <p className="form-feedback form-feedback--error">{message}</p> : null}

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

            <article className="card session-form-card stack">
              <div className="session-blocks-header">
                <div>
                  <span className="section-kicker">Plan du programme</span>
                  <h2>Organisation par semaine</h2>
                </div>
              </div>

              <div className="program-plan-list">
                {weekNumbers.map((weekNumber) => (
                  <section key={weekNumber} className="program-plan-week">
                    <div className="program-plan-week__header">
                      <div>
                        <span className="section-kicker">Semaine</span>
                        <h3>{getProgramWeekLabel(weekNumber)}</h3>
                      </div>
                    </div>

                    <div className="program-plan-days">
                      {PROGRAM_DAY_OPTIONS.map((dayOption) => {
                        const slotKey = `${weekNumber}-${dayOption.value}`;
                        const dayEntries = plannedSessionsBySlot.get(slotKey) || [];
                        const slotIsActive =
                          activeSlot?.weekNumber === weekNumber && activeSlot?.dayOfWeek === dayOption.value;

                        return (
                          <article key={slotKey} className="program-plan-day">
                            <div className="program-plan-day__header">
                              <div className="program-plan-day__label">
                                <strong>Jour {dayOption.value}</strong>
                                <small>{getProgramDayLabel(dayOption.value)}</small>
                              </div>

                              <button
                                type="button"
                                className="button ghost"
                                onClick={() => togglePlannerSlot(weekNumber, dayOption.value)}
                                disabled={plannerBusy}
                              >
                                Ajouter une seance
                              </button>
                            </div>

                            {dayEntries.length === 0 ? (
                              <p className="muted">Aucune seance planifiee pour ce jour.</p>
                            ) : (
                              <div className="program-plan-day__entries">
                                {dayEntries.map((entry) => {
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
                                              Ouvrir la seance
                                            </Link>
                                          </>
                                        ) : (
                                          <span className="muted">Seance non liee pour le moment.</span>
                                        )}
                                        <button
                                          type="button"
                                          className="button ghost"
                                          onClick={() => handleRemoveProgramSession(entry.id)}
                                          disabled={plannerBusy}
                                        >
                                          Retirer du programme
                                        </button>
                                      </div>
                                    </article>
                                  );
                                })}
                              </div>
                            )}

                            {slotIsActive ? (
                              <div className="program-planner-panel">
                                <div className="program-planner-panel__header">
                                  <div>
                                    <strong>Ajouter une seance</strong>
                                    <small>
                                      {getProgramWeekLabel(weekNumber)} · Jour {dayOption.value}
                                    </small>
                                  </div>
                                  <button
                                    type="button"
                                    className="button ghost"
                                    onClick={() => setActiveSlot(null)}
                                    disabled={plannerBusy}
                                  >
                                    Fermer
                                  </button>
                                </div>

                                {loadingAvailableSessions ? (
                                  <p className="muted">Chargement de tes seances...</p>
                                ) : availableSessions.length === 0 ? (
                                  <div className="challenge-state challenge-state--compact">
                                    <p>Cree une seance avant de l'ajouter a ton programme.</p>
                                    <div className="session-empty-actions">
                                      <Link href="/sessions/new" className="button primary">
                                        Creer une seance
                                      </Link>
                                    </div>
                                  </div>
                                ) : (
                                  <div className="program-planner-session-list">
                                    {availableSessions.map((sessionOption) => (
                                      <article key={sessionOption.id} className="program-planner-session-card">
                                        <div>
                                          <strong>{sessionOption.name}</strong>
                                          <p>{sessionOption.description || 'Seance prete a etre planifiee.'}</p>
                                          <div className="program-card__facts">
                                            <span>{sessionOption.sport || 'Sport libre'}</span>
                                            <span>
                                              {sessionOption.blockCount} bloc
                                              {sessionOption.blockCount > 1 ? 's' : ''}
                                            </span>
                                          </div>
                                        </div>
                                        <button
                                          type="button"
                                          className="button primary"
                                          onClick={() =>
                                            handleAddSessionToSlot(weekNumber, dayOption.value, sessionOption)
                                          }
                                          disabled={plannerBusy}
                                        >
                                          Ajouter
                                        </button>
                                      </article>
                                    ))}
                                  </div>
                                )}
                              </div>
                            ) : null}
                          </article>
                        );
                      })}
                    </div>
                  </section>
                ))}
              </div>
            </article>
          </>
        )}
      </section>
    </AppShell>
  );
}
