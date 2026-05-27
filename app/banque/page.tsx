'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { AppShell } from '@/components/AppShell';
import { queuePendingToast } from '@/components/ToastProvider';
import { formatSportBadgeLabel, getSportBadgeClassName } from '@/components/sport-badge';
import {
  fetchPublicCreatorProfiles,
  fetchPublicTrainingPrograms,
  fetchPublicTrainingSessions,
  fetchTrainingProgramSessionsForPrograms,
  getSessionEstimatedDurationLabel,
  importPublicTrainingProgram,
  importPublicTrainingSession,
  type PublicCreatorProfile,
  type PublicTrainingProgram,
  type PublicTrainingSession,
} from '@/lib/actyv-bank';
import { supabase } from '@/lib/supabase';
import type { TrainingProgramSession } from '@/lib/training-programs';
import { fetchTrainingSessionBlocks, type TrainingSessionBlockRecord } from '@/lib/training-session-blocks-db';

type BanqueTab = 'sessions' | 'programmes';

function getBanqueErrorMessage(error: {
  message?: string | null;
  code?: string | null;
  details?: string | null;
} | null | undefined) {
  const message = `${error?.message || ''} ${error?.details || ''}`.toLowerCase();

  if (message.includes('visibility') && message.includes('training_sessions')) {
    return "La colonne visibility des seances n'existe pas encore en base. Applique la migration Supabase Banque Actyv.";
  }

  if (message.includes('copied_from_session_id') && message.includes('column')) {
    return "La colonne copied_from_session_id n'existe pas encore en base. Applique la migration Supabase Banque Actyv.";
  }

  if (message.includes('copied_from_program_id') && message.includes('column')) {
    return "La colonne copied_from_program_id n'existe pas encore en base. Applique la migration Supabase de copie de programmes.";
  }

  if (error?.code === '42501' || message.includes('row-level security')) {
    return "Supabase refuse l'acces ou la copie. Verifie les policies RLS des contenus publics.";
  }

  return 'Impossible de charger la Banque Actyv pour le moment.';
}

export default function BanqueActyvPage() {
  const [activeTab, setActiveTab] = useState<BanqueTab>('sessions');
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [sessions, setSessions] = useState<PublicTrainingSession[]>([]);
  const [sessionBlocks, setSessionBlocks] = useState<TrainingSessionBlockRecord[]>([]);
  const [programs, setPrograms] = useState<PublicTrainingProgram[]>([]);
  const [programSessions, setProgramSessions] = useState<TrainingProgramSession[]>([]);
  const [creatorProfiles, setCreatorProfiles] = useState<PublicCreatorProfile[]>([]);
  const [importingSessionId, setImportingSessionId] = useState<string | null>(null);
  const [importingProgramId, setImportingProgramId] = useState<string | null>(null);

  useEffect(() => {
    const loadBank = async () => {
      setLoading(true);
      setMessage(null);

      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();

        setUserId(user?.id || null);

        const [sessionsResponse, programsResponse] = await Promise.all([
          fetchPublicTrainingSessions(),
          fetchPublicTrainingPrograms(),
        ]);

        if (sessionsResponse.error) {
          console.error('Erreur chargement seances banque :', sessionsResponse.error);
          setMessage(getBanqueErrorMessage(sessionsResponse.error));
          setSessions([]);
          setSessionBlocks([]);
        } else {
          setSessions(sessionsResponse.data);

          const blocksResponse = await fetchTrainingSessionBlocks(sessionsResponse.data.map((session) => session.id));
          if (blocksResponse.error) {
            console.error('Erreur chargement blocs banque :', blocksResponse.error);
            setSessionBlocks([]);
          } else {
            setSessionBlocks(blocksResponse.data);
          }
        }

        if (programsResponse.error) {
          console.error('Erreur chargement programmes banque :', programsResponse.error);
          setMessage((current) => current || getBanqueErrorMessage(programsResponse.error));
          setPrograms([]);
          setProgramSessions([]);
        } else {
          setPrograms(programsResponse.data);

          const sessionsResponseForPrograms = await fetchTrainingProgramSessionsForPrograms(
            programsResponse.data.map((program) => program.id)
          );

          if (sessionsResponseForPrograms.error) {
            console.error('Erreur chargement seances programmes banque :', sessionsResponseForPrograms.error);
            setProgramSessions([]);
          } else {
            setProgramSessions(sessionsResponseForPrograms.data);
          }
        }

        const creatorIds = Array.from(
          new Set([
            ...sessionsResponse.data.map((session) => session.user_id),
            ...programsResponse.data.map((program) => program.user_id),
          ].filter(Boolean))
        );

        const creatorsResponse = await fetchPublicCreatorProfiles(creatorIds);
        if (creatorsResponse.error) {
          console.error('Erreur chargement createurs banque :', creatorsResponse.error);
          setCreatorProfiles([]);
        } else {
          setCreatorProfiles(creatorsResponse.data);
        }
      } finally {
        setLoading(false);
      }
    };

    loadBank();
  }, []);

  const blocksBySession = useMemo(() => {
    const grouped = new Map<string, TrainingSessionBlockRecord[]>();
    sessionBlocks.forEach((block) => {
      const current = grouped.get(block.session_id) || [];
      current.push(block);
      grouped.set(block.session_id, current);
    });
    return grouped;
  }, [sessionBlocks]);

  const programSessionsByProgram = useMemo(() => {
    const grouped = new Map<string, TrainingProgramSession[]>();
    programSessions.forEach((entry) => {
      const current = grouped.get(entry.program_id) || [];
      current.push(entry);
      grouped.set(entry.program_id, current);
    });
    return grouped;
  }, [programSessions]);

  const creatorById = useMemo(
    () =>
      new Map(
        creatorProfiles.map((profile) => [profile.id, profile] as const)
      ),
    [creatorProfiles]
  );

  const handleImportSession = async (session: PublicTrainingSession) => {
    if (!userId) return;

    setImportingSessionId(session.id);
    setMessage(null);

    try {
      const result = await importPublicTrainingSession(session, userId);

      if (result.error || !result.data) {
        console.error('Erreur import seance banque :', result.error);
        setMessage(getBanqueErrorMessage(result.error));
        return;
      }

      queuePendingToast({ message: 'Seance ajoutee a tes seances', tone: 'success' });
    } finally {
      setImportingSessionId(null);
    }
  };

  const handleImportProgram = async (program: PublicTrainingProgram) => {
    if (!userId) return;

    setImportingProgramId(program.id);
    setMessage(null);

    try {
      const result = await importPublicTrainingProgram(
        program,
        programSessionsByProgram.get(program.id) || [],
        userId
      );

      if (result.error || !result.data) {
        console.error('Erreur import programme banque :', result.error);
        setMessage(getBanqueErrorMessage(result.error));
        return;
      }

      queuePendingToast({ message: 'Programme ajoute a tes programmes', tone: 'success' });
    } finally {
      setImportingProgramId(null);
    }
  };

  const loginHref = '/login?redirectTo=%2Fbanque';

  return (
    <AppShell>
      <section className="sessions-page sessions-page--dark banque-page">
        <article className="card session-hero-card banque-hero-card">
          <div className="session-hero-copy">
            <span className="section-kicker">Banque Actyv</span>
            <h1>Banque Actyv</h1>
            <p className="muted">
              Seances et programmes publics a ajouter a ton espace.
            </p>
          </div>

          <div className="session-hero-actions">
            <Link href="/sessions" className="button ghost">
              Mes seances
            </Link>
            <Link href="/programs" className="button ghost">
              Mes programmes
            </Link>
          </div>
        </article>

        <article className="card banque-tabs-card">
          <div className="program-view-toggle banque-tabs">
            <button
              type="button"
              className={`program-view-toggle__button${activeTab === 'sessions' ? ' is-active' : ''}`}
              onClick={() => setActiveTab('sessions')}
            >
              Seances
            </button>
            <button
              type="button"
              className={`program-view-toggle__button${activeTab === 'programmes' ? ' is-active' : ''}`}
              onClick={() => setActiveTab('programmes')}
            >
              Programmes
            </button>
          </div>
        </article>

        {message ? <p className="form-feedback form-feedback--error">{message}</p> : null}

        {loading ? (
          <div className="challenge-state">
            <p>Chargement de la Banque Actyv...</p>
          </div>
        ) : activeTab === 'sessions' ? (
          sessions.length === 0 ? (
            <div className="challenge-state">
              <p>Aucune seance publique disponible pour le moment.</p>
            </div>
          ) : (
            <div className="sessions-grid banque-grid">
              {sessions.map((session) => {
                const blocks = blocksBySession.get(session.id) || [];
                const creator = creatorById.get(session.user_id);
                const estimatedDuration = getSessionEstimatedDurationLabel(blocks);

                return (
                  <article key={session.id} className="session-card session-card--compact banque-card">
                    <div className="session-card__top">
                      <div className={getSportBadgeClassName(session.sport, 'badge', 'Sport')}>
                        {formatSportBadgeLabel(session.sport, 'Sport')}
                      </div>
                      <span className="session-progress-pill session-progress-pill--done">Public</span>
                    </div>

                    <div className="session-card__content">
                      <h2>{session.name}</h2>
                      <p>{session.description || 'Seance sans description pour le moment.'}</p>
                    </div>

                    <div className="session-card__meta">
                      <span>{blocks.length} bloc{blocks.length > 1 ? 's' : ''}</span>
                      <span>{estimatedDuration || 'Duree a venir'}</span>
                      <span>{creator?.username || creator?.email || 'Createur Actyv'}</span>
                    </div>

                    <div className="session-card__actions">
                      {userId ? (
                        <button
                          type="button"
                          className="button primary"
                          onClick={() => handleImportSession(session)}
                          disabled={importingSessionId === session.id}
                        >
                          {importingSessionId === session.id ? 'Ajout...' : 'Ajouter a mes seances'}
                        </button>
                      ) : (
                        <Link href={loginHref} className="button primary">
                          Connecte-toi pour ajouter
                        </Link>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          )
        ) : programs.length === 0 ? (
          <div className="challenge-state">
            <p>Aucun programme public disponible pour le moment.</p>
          </div>
        ) : (
          <div className="sessions-grid banque-grid">
            {programs.map((program) => {
              const entries = programSessionsByProgram.get(program.id) || [];
              const creator = creatorById.get(program.user_id);

              return (
                <article key={program.id} className="session-card session-card--compact banque-card">
                  <div className="session-card__top">
                    <div className={getSportBadgeClassName(program.sport, 'badge', 'Sport')}>
                      {formatSportBadgeLabel(program.sport, 'Sport')}
                    </div>
                    <span className="session-progress-pill session-progress-pill--done">Public</span>
                  </div>

                  <div className="session-card__content">
                    <h2>{program.name}</h2>
                    <p>{program.description || 'Programme sans description pour le moment.'}</p>
                  </div>

                  <div className="session-card__meta">
                    <span>{entries.length} seance{entries.length > 1 ? 's' : ''}</span>
                    <span>{program.duration_weeks} semaine{program.duration_weeks > 1 ? 's' : ''}</span>
                    <span>{creator?.username || creator?.email || 'Createur Actyv'}</span>
                  </div>

                  <div className="session-card__actions">
                    {userId ? (
                      <button
                        type="button"
                        className="button primary"
                        onClick={() => handleImportProgram(program)}
                        disabled={importingProgramId === program.id}
                      >
                        {importingProgramId === program.id ? 'Ajout...' : 'Ajouter a mes programmes'}
                      </button>
                    ) : (
                      <Link href={loginHref} className="button primary">
                        Connecte-toi pour ajouter
                      </Link>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </AppShell>
  );
}
