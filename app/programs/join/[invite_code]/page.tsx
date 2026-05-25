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
  formatProgramDayLabel,
  formatProgramPlannedDateLabel,
  TrainingProgram,
  TrainingProgramSession,
} from '@/lib/training-programs';

type SharedProgramRecord = TrainingProgram & {
  invite_code?: string | null;
};

type CreatorProfile = {
  username: string | null;
  email: string | null;
};

type JoinProgramErrorDetails = {
  message: string | null;
  code: string | null;
  details: string | null;
  hint: string | null;
};

function sortProgramSessions(entries: TrainingProgramSession[]) {
  return [...entries].sort((left, right) => {
    if (left.week_number !== right.week_number) return left.week_number - right.week_number;
    if (left.day_of_week !== right.day_of_week) return left.day_of_week - right.day_of_week;
    return left.order_index - right.order_index;
  });
}

function getJoinProgramErrorDetails(error: {
  message?: string | null;
  code?: string | null;
  details?: string | null;
  hint?: string | null;
} | null | undefined): JoinProgramErrorDetails {
  return {
    message: error?.message || null,
    code: error?.code || null,
    details: error?.details || null,
    hint: error?.hint || null,
  };
}

function getJoinProgramErrorMessage(error: {
  message?: string | null;
  code?: string | null;
  details?: string | null;
} | null | undefined) {
  const message = `${error?.message || ''} ${error?.details || ''}`.toLowerCase();

  if (message.includes('copied_from_program_id') && message.includes('column')) {
    return "La colonne copied_from_program_id n'existe pas encore en base. Applique la migration Supabase des copies de programmes.";
  }

  if (message.includes('row-level security') || error?.code === '42501') {
    return "Supabase refuse la copie du programme. Verifie la policy RLS d'insert sur training_programs.";
  }

  if (error?.code === '23514' && message.includes('copies_not_shared')) {
    return "La contrainte SQL des copies bloque cet enregistrement. Verifie visibility et copied_from_program_id.";
  }

  if (message.includes('null value') && message.includes('start_date')) {
    return "La copie ne peut pas etre creee car start_date est manquant sur le programme partage.";
  }

  return "Impossible d'ajouter ce programme pour le moment.";
}

export default function JoinSharedProgramPage() {
  const params = useParams();
  const router = useRouter();
  const rawInviteCode = Array.isArray(params?.invite_code) ? params.invite_code[0] : params?.invite_code;
  const inviteCode = useMemo(() => {
    try {
      return decodeURIComponent(String(rawInviteCode || '')).trim();
    } catch {
      return String(rawInviteCode || '').trim();
    }
  }, [rawInviteCode]);

  const [program, setProgram] = useState<SharedProgramRecord | null>(null);
  const [programSessions, setProgramSessions] = useState<TrainingProgramSession[]>([]);
  const [creatorProfile, setCreatorProfile] = useState<CreatorProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [joinErrorDetails, setJoinErrorDetails] = useState<JoinProgramErrorDetails | null>(null);

  const returnToPath = useMemo(
    () => `/programs/join/${encodeURIComponent(inviteCode)}`,
    [inviteCode]
  );
  const loginHref = useMemo(() => `/login?redirectTo=${encodeURIComponent(returnToPath)}`, [returnToPath]);
  const signupHref = useMemo(() => `/signup?redirectTo=${encodeURIComponent(returnToPath)}`, [returnToPath]);

  useEffect(() => {
    const loadSharedProgram = async () => {
      setLoading(true);
      setMessage(null);
      setJoinErrorDetails(null);

      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();

        setUserId(user?.id || null);

        const { data: programRow, error: programError } = await supabase
          .from('training_programs')
          .select('id, user_id, name, description, sport, duration_weeks, visibility, invite_code, start_date, created_at')
          .eq('invite_code', inviteCode)
          .eq('visibility', 'shared')
          .maybeSingle();

        if (programError) {
          console.error('Erreur chargement programme partage :', programError);
          setMessage('Impossible de charger ce programme partage.');
          setProgram(null);
          setProgramSessions([]);
          return;
        }

        if (!programRow) {
          setMessage('Ce lien de partage est invalide ou le programme n est plus disponible.');
          setProgram(null);
          setProgramSessions([]);
          return;
        }

        setProgram(programRow as SharedProgramRecord);

        const [{ data: sessionsRows, error: sessionsError }, profileResponse] = await Promise.all([
          supabase
            .from('training_program_sessions')
            .select('id, program_id, session_id, session_name, sport, week_number, day_of_week, order_index, created_at')
            .eq('program_id', programRow.id)
            .order('week_number', { ascending: true })
            .order('day_of_week', { ascending: true })
            .order('order_index', { ascending: true }),
          supabase.from('profiles').select('username, email').eq('id', programRow.user_id).maybeSingle(),
        ]);

        if (sessionsError) {
          console.error('Erreur chargement seances programme partage :', sessionsError);
          setProgramSessions([]);
        } else {
          setProgramSessions(sortProgramSessions((sessionsRows as TrainingProgramSession[]) || []));
        }

        if (profileResponse.error) {
          setCreatorProfile(null);
        } else {
          setCreatorProfile((profileResponse.data as CreatorProfile | null) || null);
        }
      } finally {
        setLoading(false);
      }
    };

    if (inviteCode) {
      loadSharedProgram();
    } else {
      setLoading(false);
      setMessage('Lien de partage invalide.');
    }
  }, [inviteCode]);

  const sessionsByWeek = useMemo(() => {
    const grouped = new Map<number, TrainingProgramSession[]>();
    programSessions.forEach((entry) => {
      const current = grouped.get(entry.week_number) || [];
      current.push(entry);
      grouped.set(entry.week_number, current);
    });
    return grouped;
  }, [programSessions]);

  const plannedSessionsCount = programSessions.length;

  const handleJoinProgram = async () => {
    if (!program || joining) return;

    setJoining(true);
    setMessage(null);
    setJoinErrorDetails(null);

    try {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        if (userError) {
          console.error('Erreur chargement user ajout programme partage :', userError);
        }
        router.push(loginHref);
        return;
      }

      const programPayload = {
        user_id: user.id,
        name: program.name,
        description: program.description,
        sport: program.sport,
        duration_weeks: program.duration_weeks,
        visibility: 'private',
        invite_code: null,
        copied_from_program_id: program.id,
        start_date: program.start_date,
        updated_at: new Date().toISOString(),
      };
      console.log('Program join payload:', programPayload);

      const { data: createdProgram, error: programInsertError } = await supabase
        .from('training_programs')
        .insert(programPayload)
        .select('id')
        .single();

      if (programInsertError || !createdProgram) {
        console.error('Program join duplication error', programInsertError);
        console.error('Erreur duplication programme partage :', programInsertError);
        setJoinErrorDetails(getJoinProgramErrorDetails(programInsertError));
        setMessage(getJoinProgramErrorMessage(programInsertError));
        return;
      }

      if (programSessions.length > 0) {
        const sessionPayload = programSessions.map((entry) => ({
          program_id: createdProgram.id,
          session_id: entry.session_id,
          session_name: entry.session_name,
          sport: entry.sport,
          week_number: entry.week_number,
          day_of_week: entry.day_of_week,
          order_index: entry.order_index,
        }));

        const { error: sessionsInsertError } = await supabase.from('training_program_sessions').insert(sessionPayload);

        if (sessionsInsertError) {
          console.error('Program join sessions duplication error', sessionsInsertError);
          console.error('Erreur duplication seances programme partage :', sessionsInsertError);
          setJoinErrorDetails(getJoinProgramErrorDetails(sessionsInsertError));
          setMessage("Le programme a ete copie, mais pas ses seances planifiees.");
          router.push(`/programs/${createdProgram.id}`);
          return;
        }
      }

      queuePendingToast({ message: 'Programme ajoute a tes programmes', tone: 'success' });
      router.push(`/programs/${createdProgram.id}`);
    } catch (error) {
      console.error('Erreur inattendue ajout programme partage :', error);
      setMessage("Une erreur inattendue s'est produite.");
    } finally {
      setJoining(false);
    }
  };

  return (
    <AppShell>
      <section className="sessions-page sessions-page--dark">
        <article className="card session-hero-card">
          <div className="session-hero-copy">
            <span className="section-kicker">Programmes</span>
            <h1>Rejoindre un programme</h1>
            <p className="muted">Decouvre ce programme partage puis ajoute-le a tes programmes comme copie privee.</p>
          </div>

          <div className="session-hero-actions">
            <Link href="/programs" className="button ghost">
              Retour aux programmes
            </Link>
          </div>
        </article>

        {message ? <p className="form-feedback form-feedback--error">{message}</p> : null}
        {joinErrorDetails ? (
          <div className="form-feedback form-feedback--error">
            <strong>Erreur de copie</strong>
            <div className="stack stack--xs">
              <span>message: {joinErrorDetails.message || '-'}</span>
              <span>code: {joinErrorDetails.code || '-'}</span>
              <span>details: {joinErrorDetails.details || '-'}</span>
              <span>hint: {joinErrorDetails.hint || '-'}</span>
            </div>
          </div>
        ) : null}

        {loading ? (
          <div className="challenge-state">
            <p>Chargement du programme partage...</p>
          </div>
        ) : !program ? (
          <div className="challenge-state">
            <p>{message || 'Ce lien de partage est indisponible.'}</p>
          </div>
        ) : (
          <>
            <article className="card session-form-card stack">
              <div className="program-share-preview">
                <div className="program-share-preview__top">
                  <div className={getSportBadgeClassName(program.sport, 'badge', 'Sport')}>
                    {formatSportBadgeLabel(program.sport, 'Sport')}
                  </div>
                  <span className="session-progress-pill session-progress-pill--done">Partage</span>
                </div>

                <div className="program-share-preview__copy">
                  <h2>{program.name}</h2>
                  <p>{program.description || 'Programme sans description pour le moment.'}</p>
                </div>

                <div className="program-card__facts">
                  <span>{program.sport || 'Sport libre'}</span>
                  <span>
                    {program.duration_weeks} semaine{program.duration_weeks > 1 ? 's' : ''}
                  </span>
                  <span>Debut {formatProgramDate(program.start_date)}</span>
                  <span>{plannedSessionsCount} seance{plannedSessionsCount > 1 ? 's' : ''} prevue{plannedSessionsCount > 1 ? 's' : ''}</span>
                  {creatorProfile?.username || creatorProfile?.email ? (
                    <span>Par {creatorProfile.username || creatorProfile.email}</span>
                  ) : null}
                </div>

                <div className="program-share-stats">
                  <article className="program-share-stat">
                    <small>Sport</small>
                    <strong>{program.sport || 'Sport libre'}</strong>
                  </article>
                  <article className="program-share-stat">
                    <small>Duree</small>
                    <strong>
                      {program.duration_weeks} semaine{program.duration_weeks > 1 ? 's' : ''}
                    </strong>
                  </article>
                  <article className="program-share-stat">
                    <small>Debut</small>
                    <strong>{formatProgramDate(program.start_date)}</strong>
                  </article>
                  <article className="program-share-stat">
                    <small>Seances</small>
                    <strong>{plannedSessionsCount}</strong>
                  </article>
                </div>
              </div>

              <div className="session-summary-actions">
                <button type="button" className="button primary" onClick={handleJoinProgram} disabled={joining}>
                  {joining ? 'Ajout en cours...' : 'Ajouter a mes programmes'}
                </button>
                {userId ? null : (
                  <>
                    <Link href={loginHref} className="button ghost">
                      Se connecter
                    </Link>
                    <Link href={signupHref} className="button ghost">
                      Creer un compte
                    </Link>
                  </>
                )}
                <Link href="/programs" className="button ghost">
                  Annuler
                </Link>
              </div>
            </article>

            <article className="card session-form-card stack">
              <div className="session-blocks-header">
                <div>
                  <span className="section-kicker">Apercu</span>
                  <h2>Seances du programme</h2>
                </div>
              </div>

              {programSessions.length === 0 ? (
                <div className="challenge-state challenge-state--compact">
                  <p>Aucune seance n est planifiee pour le moment.</p>
                </div>
              ) : (
                <div className="program-join-week-list">
                  {Array.from(sessionsByWeek.entries())
                    .sort(([leftWeek], [rightWeek]) => leftWeek - rightWeek)
                    .map(([weekNumber, sessions]) => (
                      <section key={weekNumber} className="program-join-week">
                        <div className="program-plan-week__header">
                          <div>
                            <span className="section-kicker">Semaine</span>
                            <h3>Semaine {weekNumber}</h3>
                          </div>
                        </div>

                        <div className="program-list-view">
                          {sessions.map((entry) => (
                            <article key={entry.id} className="program-list-item">
                              <div className="program-list-item__main">
                                <div className="program-list-item__heading">
                                  <strong>
                                    {formatProgramDayLabel(program.start_date, entry.week_number, entry.day_of_week)}
                                  </strong>
                                  <span aria-hidden="true">•</span>
                                  <span className="program-list-item__title">{entry.session_name}</span>
                                </div>
                                <div className="program-list-item__meta">
                                  <span>{entry.sport || formatSportBadgeLabel(program.sport, 'Sport')}</span>
                                  <span>
                                    {formatProgramPlannedDateLabel(
                                      program.start_date,
                                      entry.week_number,
                                      entry.day_of_week
                                    )}
                                  </span>
                                </div>
                              </div>
                            </article>
                          ))}
                        </div>
                      </section>
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
