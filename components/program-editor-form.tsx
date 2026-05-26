'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { sports } from '@/components/challenge-data';
import { SessionBlocksEditor } from '@/components/session-blocks-editor';
import { queuePendingToast } from '@/components/ToastProvider';
import {
  createEmptySessionBlockDraft,
  getInvalidSessionBlock,
  mapSessionBlockRecordToDraft,
  normalizeDraftSessionBlocks,
  SessionBlockDraft,
} from '@/lib/session-draft-blocks';
import { supabase } from '@/lib/supabase';
import {
  clampProgramDay,
  clampProgramWeek,
  PROGRAM_DAY_OPTIONS,
  TrainingProgram,
  TrainingProgramSession,
} from '@/lib/training-programs';
import {
  fetchTrainingSessionBlocks,
  insertTrainingSessionBlocks,
  TrainingSessionBlockRecord,
} from '@/lib/training-session-blocks-db';
import { awardXp, getBadgeByCode, refreshUserBadges } from '@/lib/gamification';

type TrainingSessionOption = {
  id: string;
  name: string;
  sport: string | null;
  description: string | null;
};

type SessionDraftConfig = {
  sourceSessionId: string | null;
  name: string;
  sport: string;
  description: string;
  blocks: SessionBlockDraft[];
};

type DraftProgramSession = {
  id: string;
  mode: 'existing' | 'new';
  existingSessionId: string;
  weekNumber: number;
  dayOfWeek: number;
  orderIndex: number;
  sessionDraft: SessionDraftConfig;
};

type AvailableSessionDetails = TrainingSessionOption & {
  blocks: TrainingSessionBlockRecord[];
};

type ProgramEditorFormProps = {
  mode: 'create' | 'edit';
  programId?: string;
  initialProgram?: Partial<TrainingProgram> | null;
  initialProgramSessions?: TrainingProgramSession[];
  submitLabel: string;
};

function createEmptySessionDraft(defaultSport: string) {
  return {
    sourceSessionId: null,
    name: '',
    sport: defaultSport,
    description: '',
    blocks: [createEmptySessionBlockDraft(0)],
  };
}

function createDraftProgramSession(index: number, defaultSport: string): DraftProgramSession {
  return {
    id: `program-session-${Date.now()}-${index}`,
    mode: 'existing',
    existingSessionId: '',
    weekNumber: 1,
    dayOfWeek: 1,
    orderIndex: index + 1,
    sessionDraft: createEmptySessionDraft(defaultSport),
  };
}

function getDefaultStartDateValue() {
  const now = new Date();
  const year = now.getFullYear();
  const month = `${now.getMonth() + 1}`.padStart(2, '0');
  const day = `${now.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function ProgramEditorForm({
  mode,
  programId,
  initialProgram,
  initialProgramSessions = [],
  submitLabel,
}: ProgramEditorFormProps) {
  const router = useRouter();
  const [name, setName] = useState(initialProgram?.name || '');
  const [sport, setSport] = useState(initialProgram?.sport || '');
  const [description, setDescription] = useState(initialProgram?.description || '');
  const [durationWeeks, setDurationWeeks] = useState(initialProgram?.duration_weeks || 4);
  const [startDate, setStartDate] = useState(initialProgram?.start_date || getDefaultStartDateValue());
  const [draftSessions, setDraftSessions] = useState<DraftProgramSession[]>([
    createDraftProgramSession(0, initialProgram?.sport || ''),
  ]);
  const [availableSessions, setAvailableSessions] = useState<AvailableSessionDetails[]>([]);
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

        const { data: sessionsRows, error: sessionsError } = await supabase
          .from('training_sessions')
          .select('id, name, sport, description')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false });

        if (sessionsError) {
          console.error('Erreur chargement seances programme :', sessionsError);
          setAvailableSessions([]);
          return;
        }

        const nextSessions = (sessionsRows as TrainingSessionOption[]) || [];
        const { data: sessionBlocks } = await fetchTrainingSessionBlocks(nextSessions.map((session) => session.id));

        const blocksBySession = new Map<string, TrainingSessionBlockRecord[]>();
        (sessionBlocks || []).forEach((block) => {
          const current = blocksBySession.get(block.session_id) || [];
          current.push(block);
          blocksBySession.set(block.session_id, current);
        });

        setAvailableSessions(
          nextSessions.map((session) => ({
            ...session,
            blocks: blocksBySession.get(session.id) || [],
          }))
        );
      } finally {
        setLoadingSessions(false);
      }
    };

    loadAvailableSessions();
  }, []);

  useEffect(() => {
    if (loadingSessions) return;
    if (!initialProgramSessions.length) return;

    const sessionMap = new Map(availableSessions.map((session) => [session.id, session]));
    const nextDrafts = initialProgramSessions.map((entry, index) => {
      const linkedSession = entry.session_id ? sessionMap.get(entry.session_id) : null;

      return {
        id: entry.id,
        mode: linkedSession ? 'new' as const : 'existing' as const,
        existingSessionId: entry.session_id || '',
        weekNumber: entry.week_number,
        dayOfWeek: entry.day_of_week,
        orderIndex: entry.order_index,
        sessionDraft: linkedSession
          ? {
              sourceSessionId: linkedSession.id,
              name: linkedSession.name,
              sport: linkedSession.sport || initialProgram?.sport || '',
              description: linkedSession.description || '',
              blocks:
                linkedSession.blocks.length > 0
                  ? linkedSession.blocks.map(mapSessionBlockRecordToDraft)
                  : [createEmptySessionBlockDraft(0)],
            }
          : createEmptySessionDraft(initialProgram?.sport || ''),
      };
    });

    setDraftSessions(nextDrafts.length > 0 ? nextDrafts : [createDraftProgramSession(0, initialProgram?.sport || '')]);
  }, [availableSessions, initialProgram?.sport, initialProgramSessions, loadingSessions]);

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
      draftSessions.filter((entry) =>
        entry.mode === 'existing'
          ? entry.existingSessionId.trim().length > 0
          : entry.sessionDraft.name.trim().length > 0
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

  const updateDraftSessionConfig = (draftId: string, updates: Partial<SessionDraftConfig>) => {
    setDraftSessions((current) =>
      current.map((entry) =>
        entry.id === draftId
          ? {
              ...entry,
              sessionDraft: {
                ...entry.sessionDraft,
                ...updates,
              },
            }
          : entry
      )
    );
  };

  const updateDraftSessionBlocks = (draftId: string, nextBlocks: SessionBlockDraft[]) => {
    updateDraftSessionConfig(draftId, { blocks: nextBlocks });
  };

  const addDraftSession = () => {
    setDraftSessions((current) => [...current, createDraftProgramSession(current.length, sport)]);
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

  const hydrateSessionDraftFromExisting = (draftId: string, sessionId: string) => {
    const selectedSession = availableSessions.find((session) => session.id === sessionId);
    if (!selectedSession) return;

    updateDraftSession(draftId, {
      existingSessionId: sessionId,
      mode: 'existing',
    });
    updateDraftSessionConfig(draftId, {
      sourceSessionId: selectedSession.id,
      name: selectedSession.name,
      sport: selectedSession.sport || sport,
      description: selectedSession.description || '',
      blocks:
        selectedSession.blocks.length > 0
          ? selectedSession.blocks.map(mapSessionBlockRecordToDraft)
          : [createEmptySessionBlockDraft(0)],
    });
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (loading) return;

    setMessage(null);

    if (!name.trim() || !sport || !startDate) {
      setMessage('Renseigne le nom, le sport et la date de debut du programme.');
      return;
    }

    setLoading(true);

    try {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        setMessage('Connecte-toi pour enregistrer un programme.');
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

      for (const entry of draftSessions) {
        if (entry.mode === 'existing') {
          const selectedSession = availableSessionsMap.get(entry.existingSessionId);

          if (!selectedSession) {
            setMessage("Choisis une seance existante valide ou configure une nouvelle seance.");
            return;
          }

          resolvedSessionEntries.push({
            session_id: selectedSession.id,
            session_name: selectedSession.name,
            sport: selectedSession.sport || sport,
            week_number: clampProgramWeek(entry.weekNumber, durationWeeks),
            day_of_week: clampProgramDay(entry.dayOfWeek),
            order_index: entry.orderIndex,
          });
          continue;
        }

        if (!entry.sessionDraft.name.trim() || !entry.sessionDraft.sport.trim()) {
          setMessage('Chaque nouvelle seance du programme doit avoir un nom et un sport.');
          return;
        }

        const normalizedBlocks = normalizeDraftSessionBlocks(entry.sessionDraft.blocks);
        if (normalizedBlocks.length === 0) {
          setMessage('Chaque nouvelle seance du programme doit contenir au moins un bloc.');
          return;
        }

        const invalidBlock = getInvalidSessionBlock(normalizedBlocks);
        if (invalidBlock) {
          setMessage(
            'Les blocs de seance du programme doivent avoir des series, repos et objectifs valides.'
          );
          return;
        }

        let resolvedSessionId = entry.sessionDraft.sourceSessionId;

        if (resolvedSessionId) {
          const { error: sessionUpdateError } = await supabase
            .from('training_sessions')
            .update({
              name: entry.sessionDraft.name.trim(),
              sport: entry.sessionDraft.sport.trim(),
              description: entry.sessionDraft.description.trim() || null,
              updated_at: new Date().toISOString(),
            })
            .eq('id', resolvedSessionId)
            .eq('user_id', user.id);

          if (sessionUpdateError) {
            console.error('Erreur mise a jour seance programme :', sessionUpdateError);
            setMessage("Impossible de mettre a jour l'une des seances du programme.");
            return;
          }

          const { error: deleteBlocksError } = await supabase
            .from('training_session_blocks')
            .delete()
            .eq('session_id', resolvedSessionId);

          if (deleteBlocksError) {
            console.error('Erreur suppression blocs seance programme :', deleteBlocksError);
            setMessage("Impossible de remettre a jour les blocs d'une seance du programme.");
            return;
          }
        } else {
          const { data: createdSession, error: createdSessionError } = await supabase
            .from('training_sessions')
            .insert({
              user_id: user.id,
              name: entry.sessionDraft.name.trim(),
              sport: entry.sessionDraft.sport.trim(),
              description: entry.sessionDraft.description.trim() || null,
            })
            .select('id')
            .single();

          if (createdSessionError || !createdSession) {
            console.error('Erreur creation seance inline programme :', createdSessionError);
            setMessage("Impossible de creer l'une des seances du programme.");
            return;
          }

          resolvedSessionId = createdSession.id;
        }

        const { error: blocksError } = await insertTrainingSessionBlocks(resolvedSessionId, normalizedBlocks);

        if (blocksError) {
          console.error('Erreur creation blocs seance programme :', blocksError);
          setMessage("Impossible d'enregistrer les blocs d'une seance du programme.");
          return;
        }

        resolvedSessionEntries.push({
          session_id: resolvedSessionId,
          session_name: entry.sessionDraft.name.trim(),
          sport: entry.sessionDraft.sport.trim() || sport,
          week_number: clampProgramWeek(entry.weekNumber, durationWeeks),
          day_of_week: clampProgramDay(entry.dayOfWeek),
          order_index:
            Number.isFinite(Number(entry.orderIndex)) && Number(entry.orderIndex) > 0
              ? Math.trunc(Number(entry.orderIndex))
              : 1,
        });
      }

      let resolvedProgramId = programId || null;

      const programPayload = {
        user_id: user.id,
        name: name.trim(),
        description: description.trim() || null,
        sport,
        duration_weeks: durationWeeks,
        visibility: 'private',
        start_date: startDate,
      };

      if (mode === 'edit' && resolvedProgramId) {
        const { error: programUpdateError } = await supabase
          .from('training_programs')
          .update({
            ...programPayload,
            updated_at: new Date().toISOString(),
          })
          .eq('id', resolvedProgramId)
          .eq('user_id', user.id);

        if (programUpdateError) {
          console.error('Erreur mise a jour programme :', programUpdateError);
          setMessage('Impossible de mettre a jour le programme pour le moment.');
          return;
        }

        const { error: deleteProgramSessionsError } = await supabase
          .from('training_program_sessions')
          .delete()
          .eq('program_id', resolvedProgramId);

        if (deleteProgramSessionsError) {
          console.error('Erreur reinitialisation seances programme :', deleteProgramSessionsError);
          setMessage('Impossible de remettre a jour les seances planifiees.');
          return;
        }
      } else {
        console.log('Program payload:', programPayload);

        const { data: createdProgram, error: programInsertError } = await supabase
          .from('training_programs')
          .insert(programPayload)
          .select('id')
          .single();

        if (programInsertError || !createdProgram) {
          console.error('Program insert error:', programInsertError);
          setMessage('Impossible de creer le programme pour le moment.');
          return;
        }

        resolvedProgramId = createdProgram.id;
      }

      if (!resolvedProgramId) {
        setMessage('Impossible de retrouver le programme a enregistrer.');
        return;
      }

      const programSessionPayload = resolvedSessionEntries.map((entry) => ({
        program_id: resolvedProgramId,
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
        setMessage("Le programme a ete enregistre, mais pas ses seances planifiees.");
        return;
      }

      if (mode === 'create') {
        const xpResult = await awardXp({
          userId: user.id,
          source: 'program_created',
          metadata: { target_id: resolvedProgramId },
        });

        if (xpResult?.awarded) {
          queuePendingToast({ message: '+5 XP programme cree', tone: 'info' });
        } else if (xpResult?.error) {
          console.error('XP award failed', {
            payload: {
              user_id: user.id,
              event_type: 'program_created',
              source_type: 'training_program',
              source_id: resolvedProgramId,
              xp_amount: 5,
            },
            error: xpResult.error,
          });
        }

        const badgeResult = await refreshUserBadges(user.id);

        if (badgeResult.error) {
          console.error('Erreur refresh badges programme :', badgeResult.error);
        } else {
          badgeResult.awarded.forEach((badgeCode) => {
            const badge = getBadgeByCode(badgeCode);
            queuePendingToast({
              message: `Badge debloque : ${badge?.label || badgeCode}`,
              tone: 'celebrate',
            });
          });
        }
      }

      queuePendingToast({
        message: mode === 'edit' ? 'Programme mis a jour' : 'Programme cree',
        tone: 'success',
      });
      router.push(`/programs/${resolvedProgramId}`);
    } catch (error) {
      console.error('Erreur inattendue programme :', error);
      setMessage("Une erreur inattendue s'est produite.");
    } finally {
      setLoading(false);
    }
  };

  return (
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

              <div className="program-mode-switch">
                <button
                  type="button"
                  className={`button ${entry.mode === 'existing' ? 'primary' : 'ghost'}`}
                  onClick={() => updateDraftSession(entry.id, { mode: 'existing' })}
                  disabled={loading}
                >
                  Choisir une seance existante
                </button>
                <button
                  type="button"
                  className={`button ${entry.mode === 'new' ? 'primary' : 'ghost'}`}
                  onClick={() => updateDraftSession(entry.id, { mode: 'new' })}
                  disabled={loading}
                >
                  Configurer une nouvelle seance
                </button>
              </div>

              <div className="session-form-grid">
                <div className="field">
                  <label>Semaine</label>
                  <select
                    value={entry.weekNumber}
                    onChange={(event) => updateDraftSession(entry.id, { weekNumber: Number(event.target.value) })}
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
                    onChange={(event) => updateDraftSession(entry.id, { dayOfWeek: Number(event.target.value) })}
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

              {entry.mode === 'existing' ? (
                <div className="session-form-grid">
                  <div className="field full">
                    <label>Seance existante</label>
                    <select
                      value={entry.existingSessionId}
                      onChange={(event) => hydrateSessionDraftFromExisting(entry.id, event.target.value)}
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
                </div>
              ) : (
                <div className="stack">
                  <div className="session-form-grid">
                    <div className="field">
                      <label>Nom de la seance</label>
                      <input
                        value={entry.sessionDraft.name}
                        onChange={(event) =>
                          updateDraftSessionConfig(entry.id, { name: event.target.value })
                        }
                        placeholder="Ex : Full body A, Fractionne court"
                        disabled={loading}
                      />
                    </div>

                    <div className="field">
                      <label>Sport</label>
                      <select
                        value={entry.sessionDraft.sport}
                        onChange={(event) =>
                          updateDraftSessionConfig(entry.id, { sport: event.target.value })
                        }
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

                    <div className="field full">
                      <label>Description</label>
                      <textarea
                        rows={3}
                        value={entry.sessionDraft.description}
                        onChange={(event) =>
                          updateDraftSessionConfig(entry.id, { description: event.target.value })
                        }
                        placeholder="Objectif, intensite, consigne..."
                        disabled={loading}
                      />
                    </div>
                  </div>

                  <SessionBlocksEditor
                    blocks={entry.sessionDraft.blocks}
                    disabled={loading}
                    title="Configuration de la seance"
                    kicker="Seance"
                    onAddBlock={() =>
                      updateDraftSessionBlocks(entry.id, [
                        ...entry.sessionDraft.blocks,
                        createEmptySessionBlockDraft(entry.sessionDraft.blocks.length),
                      ])
                    }
                    onRemoveBlock={(blockId) =>
                      updateDraftSessionBlocks(
                        entry.id,
                        entry.sessionDraft.blocks.length > 1
                          ? entry.sessionDraft.blocks.filter((block) => block.id !== blockId)
                          : entry.sessionDraft.blocks
                      )
                    }
                    onUpdateBlock={(blockId, updates) =>
                      updateDraftSessionBlocks(
                        entry.id,
                        entry.sessionDraft.blocks.map((block) =>
                          block.id === blockId ? { ...block, ...updates } : block
                        )
                      )
                    }
                  />
                </div>
              )}
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
            {loading ? 'Enregistrement...' : submitLabel}
          </button>
          <Link href={mode === 'edit' && programId ? `/programs/${programId}` : '/programs'} className="button ghost">
            Annuler
          </Link>
        </div>
      </article>
    </form>
  );
}
