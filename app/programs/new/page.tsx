'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AppShell } from '@/components/AppShell';
import { queuePendingToast } from '@/components/ToastProvider';
import { sports } from '@/components/challenge-data';
import { supabase } from '@/lib/supabase';
import { clampProgramDay, clampProgramWeek, PROGRAM_DAY_OPTIONS } from '@/lib/training-programs';

type TrainingSessionOption = {
  id: string;
  name: string;
  sport: string | null;
  description: string | null;
};

type DraftProgramSession = {
  id: string;
  sessionId: string;
  quickSessionName: string;
  weekNumber: number;
  dayOfWeek: number;
  orderIndex: number;
};

function createDraftProgramSession(index: number): DraftProgramSession {
  return {
    id: `program-session-${Date.now()}-${index}`,
    sessionId: '',
    quickSessionName: '',
    weekNumber: 1,
    dayOfWeek: 1,
    orderIndex: index + 1,
  };
}

function getDefaultStartDateValue() {
  const now = new Date();
  const year = now.getFullYear();
  const month = `${now.getMonth() + 1}`.padStart(2, '0');
  const day = `${now.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export default function NewProgramPage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [sport, setSport] = useState('');
  const [description, setDescription] = useState('');
  const [durationWeeks, setDurationWeeks] = useState(4);
  const [startDate, setStartDate] = useState(getDefaultStartDateValue());
  const [draftSessions, setDraftSessions] = useState<DraftProgramSession[]>([createDraftProgramSession(0)]);
  const [availableSessions, setAvailableSessions] = useState<TrainingSessionOption[]>([]);
  const [loadingSessions, setLoadingSessions] = useState(true);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const loadAvailableSessions = async () => {
      setLoadingSessions(true);

      try {
        const {
          data: { user },
          error: userError,
        } = await supabase.auth.getUser();

        if (userError || !user) {
          if (userError) {
            console.error('Erreur chargement user programmes :', userError);
          }
          setAvailableSessions([]);
          return;
        }

        const { data, error } = await supabase
          .from('training_sessions')
          .select('id, name, sport, description')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false });

        if (error) {
          console.error('Erreur chargement seances programme :', error);
          setAvailableSessions([]);
          return;
        }

        setAvailableSessions((data as TrainingSessionOption[]) || []);
      } finally {
        setLoadingSessions(false);
      }
    };

    loadAvailableSessions();
  }, []);

  const weekOptions = useMemo(
    () =>
      Array.from({ length: Math.max(durationWeeks, 1) }, (_, index) => ({
        value: index + 1,
        label: `Semaine ${index + 1}`,
      })),
    [durationWeeks]
  );

  const plannedSessionsCount = useMemo(
    () =>
      draftSessions.filter(
        (entry) => entry.sessionId.trim().length > 0 || entry.quickSessionName.trim().length > 0
      ).length,
    [draftSessions]
  );

  const updateDraftSession = (draftId: string, updates: Partial<DraftProgramSession>) => {
    setDraftSessions((current) =>
      current.map((entry) => {
        if (entry.id !== draftId) return entry;

        const nextWeekNumber =
          updates.weekNumber !== undefined
            ? clampProgramWeek(updates.weekNumber, durationWeeks)
            : clampProgramWeek(entry.weekNumber, durationWeeks);

        return {
          ...entry,
          ...updates,
          weekNumber: nextWeekNumber,
          dayOfWeek:
            updates.dayOfWeek !== undefined ? clampProgramDay(updates.dayOfWeek) : entry.dayOfWeek,
        };
      })
    );
  };

  const addDraftSession = () => {
    setDraftSessions((current) => [...current, createDraftProgramSession(current.length)]);
  };

  const removeDraftSession = (draftId: string) => {
    setDraftSessions((current) =>
      current.length > 1 ? current.filter((entry) => entry.id !== draftId) : current
    );
  };

  const handleDurationWeeksChange = (value: string) => {
    const numericValue = Number(value);
    const nextDurationWeeks =
      Number.isFinite(numericValue) && numericValue > 0 ? Math.min(Math.trunc(numericValue), 52) : 1;

    setDurationWeeks(nextDurationWeeks);
    setDraftSessions((current) =>
      current.map((entry) => ({
        ...entry,
        weekNumber: clampProgramWeek(entry.weekNumber, nextDurationWeeks),
      }))
    );
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (loading) return;

    setMessage(null);

    if (!name.trim() || !sport || !startDate) {
      setMessage('Renseigne le nom, le sport et la date de debut du programme.');
      return;
    }

    const normalizedDraftSessions = draftSessions
      .map((entry) => ({
        ...entry,
        sessionId: entry.sessionId.trim(),
        quickSessionName: entry.quickSessionName.trim(),
        weekNumber: clampProgramWeek(entry.weekNumber, durationWeeks),
        dayOfWeek: clampProgramDay(entry.dayOfWeek),
        orderIndex:
          Number.isFinite(Number(entry.orderIndex)) && Number(entry.orderIndex) > 0
            ? Math.trunc(Number(entry.orderIndex))
            : 1,
      }))
      .filter((entry) => entry.sessionId || entry.quickSessionName);

    if (normalizedDraftSessions.length === 0) {
      setMessage('Ajoute au moins une seance planifiee dans le programme.');
      return;
    }

    setLoading(true);

    try {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        setMessage('Connecte-toi pour creer un programme.');
        return;
      }

      const availableSessionsMap = new Map(availableSessions.map((session) => [session.id, session]));
      const resolvedSessionEntries: Array<{
        session_id: string | null;
        session_name: string;
        sport: string | null;
        week_number: number;
        day_of_week: number;
        order_index: number;
      }> = [];

      for (const entry of normalizedDraftSessions) {
        if (entry.sessionId) {
          const selectedSession = availableSessionsMap.get(entry.sessionId);

          if (!selectedSession) {
            setMessage("Une seance selectionnee n'est plus disponible.");
            return;
          }

          resolvedSessionEntries.push({
            session_id: selectedSession.id,
            session_name: selectedSession.name,
            sport: selectedSession.sport || sport,
            week_number: entry.weekNumber,
            day_of_week: entry.dayOfWeek,
            order_index: entry.orderIndex,
          });
          continue;
        }

        const { data: quickSession, error: quickSessionError } = await supabase
          .from('training_sessions')
          .insert({
            user_id: user.id,
            name: entry.quickSessionName,
            sport,
            description: `Seance rapide creee depuis le programme ${name.trim()}.`,
          })
          .select('id, name, sport')
          .single();

        if (quickSessionError || !quickSession) {
          console.error('Erreur creation seance rapide programme :', quickSessionError);
          setMessage("Impossible de creer l'une des seances rapides du programme.");
          return;
        }

        resolvedSessionEntries.push({
          session_id: quickSession.id,
          session_name: quickSession.name,
          sport: quickSession.sport || sport,
          week_number: entry.weekNumber,
          day_of_week: entry.dayOfWeek,
          order_index: entry.orderIndex,
        });
      }

      const programPayload = {
        user_id: user.id,
        name: name.trim(),
        description: description.trim() || null,
        sport,
        duration_weeks: durationWeeks,
        visibility: 'private',
        start_date: startDate,
      };

      console.log('Program payload:', programPayload);

      const { data: createdProgram, error: programError } = await supabase
        .from('training_programs')
        .insert(programPayload)
        .select('id')
        .single();

      if (programError || !createdProgram) {
        console.error('Program insert error:', programError);
        setMessage('Impossible de creer le programme pour le moment.');
        return;
      }

      const programSessionPayload = resolvedSessionEntries.map((entry) => ({
        program_id: createdProgram.id,
        session_id: entry.session_id,
        session_name: entry.session_name,
        sport: entry.sport,
        week_number: entry.week_number,
        day_of_week: entry.day_of_week,
        order_index: entry.order_index,
      }));

      const { error: programSessionsError } = await supabase
        .from('training_program_sessions')
        .insert(programSessionPayload);

      if (programSessionsError) {
        console.error('Erreur creation seances programme :', programSessionsError);
        setMessage("Le programme a ete cree, mais pas ses seances planifiees.");
        return;
      }

      queuePendingToast({ message: 'Programme cree', tone: 'success' });
      router.push(`/programs/${createdProgram.id}`);
    } catch (error) {
      console.error('Erreur inattendue creation programme :', error);
      setMessage("Une erreur inattendue s'est produite.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <AppShell>
      <section className="sessions-page">
        <article className="card session-hero-card">
          <div className="session-hero-copy">
            <span className="section-kicker">Programmes</span>
            <h1>Creer un programme</h1>
            <p className="muted">
              Planifie plusieurs seances sur plusieurs semaines, avec une progression simple et privee.
            </p>
          </div>

          <div className="session-hero-actions">
            <Link href="/programs" className="button ghost">
              Voir mes programmes
            </Link>
          </div>
        </article>

        <form className="sessions-layout" onSubmit={handleSubmit}>
          <article className="card session-form-card stack">
            <div className="session-form-grid">
              <div className="field">
                <label htmlFor="program-name">Nom du programme</label>
                <input
                  id="program-name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Ex : Renfo 8 semaines, Base cardio, Prepa trail"
                  disabled={loading}
                />
              </div>

              <div className="field">
                <label htmlFor="program-sport">Sport</label>
                <select
                  id="program-sport"
                  value={sport}
                  onChange={(event) => setSport(event.target.value)}
                  disabled={loading}
                >
                  <option value="">Choisir un sport</option>
                  {sports.map((sportItem) => (
                    <option key={sportItem} value={sportItem}>
                      {sportItem}
                    </option>
                  ))}
                </select>
              </div>

              <div className="field">
                <label htmlFor="program-duration">Duree (semaines)</label>
                <input
                  id="program-duration"
                  type="number"
                  min="1"
                  max="52"
                  value={durationWeeks}
                  onChange={(event) => handleDurationWeeksChange(event.target.value)}
                  disabled={loading}
                />
              </div>

              <div className="field">
                <label htmlFor="program-start-date">Date de debut</label>
                <input
                  id="program-start-date"
                  type="date"
                  value={startDate}
                  onChange={(event) => setStartDate(event.target.value)}
                  disabled={loading}
                />
              </div>

              <div className="field full">
                <label htmlFor="program-description">Description</label>
                <textarea
                  id="program-description"
                  rows={4}
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  placeholder="Objectif, rythme, points d'attention..."
                  disabled={loading}
                />
              </div>

              <div className="field full">
                <label>Visibilite</label>
                <input value="Prive pour l'instant" disabled />
              </div>
            </div>

            {message ? <p className="form-feedback form-feedback--error">{message}</p> : null}
          </article>

          <article className="card session-form-card stack">
            <div className="session-blocks-header">
              <div>
                <span className="section-kicker">Planification</span>
                <h2>Seances du programme</h2>
              </div>

              <button type="button" className="button ghost" onClick={addDraftSession} disabled={loading}>
                + Ajouter une seance
              </button>
            </div>

            {loadingSessions ? (
              <div className="challenge-state challenge-state--compact">
                <p>Chargement de tes seances...</p>
              </div>
            ) : null}

            <div className="session-block-list">
              {draftSessions.map((entry, index) => (
                <article key={entry.id} className="session-block-card">
                  <div className="session-block-card__top">
                    <strong>Seance {index + 1}</strong>
                    <button
                      type="button"
                      className="button ghost session-block-remove"
                      onClick={() => removeDraftSession(entry.id)}
                      disabled={loading || draftSessions.length === 1}
                    >
                      Retirer
                    </button>
                  </div>

                  <div className="session-form-grid">
                    <div className="field">
                      <label>Seance existante</label>
                      <select
                        value={entry.sessionId}
                        onChange={(event) =>
                          updateDraftSession(entry.id, {
                            sessionId: event.target.value,
                            quickSessionName: event.target.value ? '' : entry.quickSessionName,
                          })
                        }
                        disabled={loading}
                      >
                        <option value="">Choisir une seance existante</option>
                        {availableSessions.map((sessionOption) => (
                          <option key={sessionOption.id} value={sessionOption.id}>
                            {sessionOption.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="field">
                      <label>Ou seance rapide</label>
                      <input
                        value={entry.quickSessionName}
                        onChange={(event) =>
                          updateDraftSession(entry.id, {
                            quickSessionName: event.target.value,
                            sessionId: event.target.value.trim() ? '' : entry.sessionId,
                          })
                        }
                        placeholder="Ex : Haut du corps, Sortie zone 2"
                        disabled={loading || Boolean(entry.sessionId)}
                      />
                    </div>

                    <div className="field">
                      <label>Semaine</label>
                      <select
                        value={entry.weekNumber}
                        onChange={(event) =>
                          updateDraftSession(entry.id, { weekNumber: Number(event.target.value) })
                        }
                        disabled={loading}
                      >
                        {weekOptions.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="field">
                      <label>Jour</label>
                      <select
                        value={entry.dayOfWeek}
                        onChange={(event) =>
                          updateDraftSession(entry.id, { dayOfWeek: Number(event.target.value) })
                        }
                        disabled={loading}
                      >
                        {PROGRAM_DAY_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="field">
                      <label>Ordre</label>
                      <input
                        type="number"
                        min="1"
                        step="1"
                        value={entry.orderIndex}
                        onChange={(event) =>
                          updateDraftSession(entry.id, {
                            orderIndex:
                              Number.isFinite(Number(event.target.value)) && Number(event.target.value) > 0
                                ? Math.trunc(Number(event.target.value))
                                : 1,
                          })
                        }
                        disabled={loading}
                      />
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </article>

          <article className="card session-summary-card">
            <span className="section-kicker">Resume</span>
            <h2>Programme V1</h2>
            <p className="muted">
              {plannedSessionsCount} seance{plannedSessionsCount > 1 ? 's' : ''} planifiee
              {plannedSessionsCount > 1 ? 's' : ''} sur {durationWeeks} semaine
              {durationWeeks > 1 ? 's' : ''}.
            </p>

            <div className="session-summary-actions">
              <button type="submit" className="button primary" disabled={loading} aria-busy={loading}>
                {loading ? 'Creation...' : 'Enregistrer le programme'}
              </button>
              <Link href="/programs" className="button ghost">
                Annuler
              </Link>
            </div>
          </article>
        </form>
      </section>
    </AppShell>
  );
}
