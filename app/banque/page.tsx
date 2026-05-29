'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { AppShell } from '@/components/AppShell';
import { queuePendingToast } from '@/components/ToastProvider';
import { formatSportBadgeLabel, getSportBadgeClassName } from '@/components/sport-badge';
import {
  fetchPublicCreatorProfiles,
  fetchImportedPublicTrainingSessions,
  fetchPublicTrainingPrograms,
  fetchPublicTrainingSessions,
  fetchTrainingProgramSessionsForPrograms,
  fetchUserTrainingSessionsByNames,
  getSessionEstimatedDurationLabel,
  importPublicTrainingProgram,
  importPublicTrainingSession,
  type PublicCreatorProfile,
  type PublicTrainingProgram,
  type PublicTrainingSession,
} from '@/lib/actyv-bank';
import { getSessionEstimatedDuration } from '@/lib/session-blocks';
import { supabase } from '@/lib/supabase';
import type { TrainingProgramSession } from '@/lib/training-programs';
import { fetchTrainingSessionBlocks, type TrainingSessionBlockRecord } from '@/lib/training-session-blocks-db';

type BanqueTab = 'sessions' | 'programmes';
type BanqueSportFilter = 'Tous' | 'Fitness' | 'Course' | 'Trail' | 'Marche' | 'Velo' | 'Mobilite' | 'Yoga' | 'HIIT' | 'Autre';
type BanqueDurationFilter = 'all' | 'lt15' | '15to30' | '30to45' | '45to60' | '60plus';

const SPORT_FILTER_OPTIONS: BanqueSportFilter[] = ['Tous', 'Fitness', 'Course', 'Trail', 'Marche', 'Velo', 'Mobilite', 'Yoga', 'HIIT'];

const DURATION_FILTER_OPTIONS: Array<{ value: BanqueDurationFilter; label: string }> = [
  { value: 'all', label: 'Toutes' },
  { value: 'lt15', label: '< 15 min' },
  { value: '15to30', label: '15-30 min' },
  { value: '30to45', label: '30-45 min' },
  { value: '45to60', label: '45-60 min' },
  { value: '60plus', label: '60+ min' },
];

function normalizeSearchValue(value: string | null | undefined) {
  return (value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function getSportFilterValue(sport: string | null | undefined): BanqueSportFilter {
  const normalized = normalizeSearchValue(sport);

  if (!normalized) return 'Autre';
  if (normalized.includes('mobilit')) return 'Mobilite';
  if (normalized.includes('trail')) return 'Trail';
  if (normalized.includes('course') || normalized.includes('run')) return 'Course';
  if (normalized.includes('march')) return 'Marche';
  if (normalized.includes('velo') || normalized.includes('bike') || normalized.includes('cycl')) return 'Velo';
  if (normalized.includes('yoga')) return 'Yoga';
  if (normalized.includes('hiit')) return 'HIIT';
  if (normalized.includes('fitness') || normalized.includes('renforcement') || normalized.includes('muscu') || normalized.includes('force')) {
    return 'Fitness';
  }

  return 'Autre';
}

function matchesSearchQuery(name: string, description: string | null, query: string) {
  if (!query) return true;
  const haystack = normalizeSearchValue(`${name} ${description || ''}`);
  return haystack.includes(query);
}

function matchesSportFilter(sport: string | null | undefined, sportFilter: BanqueSportFilter) {
  if (sportFilter === 'Tous') return true;
  return getSportFilterValue(sport) === sportFilter;
}

function matchesDurationFilter(totalSeconds: number | null, durationFilter: BanqueDurationFilter) {
  if (durationFilter === 'all' || totalSeconds === null) return true;

  const minutes = totalSeconds / 60;

  switch (durationFilter) {
    case 'lt15':
      return minutes < 15;
    case '15to30':
      return minutes >= 15 && minutes < 30;
    case '30to45':
      return minutes >= 30 && minutes < 45;
    case '45to60':
      return minutes >= 45 && minutes < 60;
    case '60plus':
      return minutes >= 60;
    default:
      return true;
  }
}

function formatProgramEstimatedDuration(totalSeconds: number | null) {
  if (!totalSeconds || totalSeconds <= 0) return null;

  const totalMinutes = Math.round(totalSeconds / 60);
  if (totalMinutes < 60) {
    return `${totalMinutes} min`;
  }

  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (minutes === 0) {
    return `${hours} h`;
  }

  return `${hours} h ${minutes.toString().padStart(2, '0')}`;
}

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
  const [searchQuery, setSearchQuery] = useState('');
  const [sportFilter, setSportFilter] = useState<BanqueSportFilter>('Tous');
  const [durationFilter, setDurationFilter] = useState<BanqueDurationFilter>('all');
  const [sessions, setSessions] = useState<PublicTrainingSession[]>([]);
  const [sessionBlocks, setSessionBlocks] = useState<TrainingSessionBlockRecord[]>([]);
  const [programs, setPrograms] = useState<PublicTrainingProgram[]>([]);
  const [programSessions, setProgramSessions] = useState<TrainingProgramSession[]>([]);
  const [creatorProfiles, setCreatorProfiles] = useState<PublicCreatorProfile[]>([]);
  const [importedSessionSourceIds, setImportedSessionSourceIds] = useState<string[]>([]);
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

          if (user?.id) {
            const [importedSessionsResponse, importedSessionsByNameResponse] = await Promise.all([
              fetchImportedPublicTrainingSessions(
                user.id,
                sessionsResponse.data.map((session) => session.id)
              ),
              fetchUserTrainingSessionsByNames(
                user.id,
                sessionsResponse.data.map((session) => session.name)
              ),
            ]);

            if (importedSessionsResponse.error) {
              console.error('Erreur chargement copies banque :', importedSessionsResponse.error);
              setImportedSessionSourceIds([]);
            } else if (importedSessionsByNameResponse.error) {
              console.error('Erreur chargement copies banque par nom :', importedSessionsByNameResponse.error);
              setImportedSessionSourceIds(
                importedSessionsResponse.data
                  .map((session) => session.copied_from_session_id)
                  .filter((sessionId): sessionId is string => Boolean(sessionId))
              );
            } else {
              const sourceIdByName = new Map(sessionsResponse.data.map((session) => [session.name, session.id] as const));
              const importedIdsFromName = importedSessionsByNameResponse.data
                .map((session) => sourceIdByName.get(session.name))
                .filter((sessionId): sessionId is string => Boolean(sessionId));

              setImportedSessionSourceIds(
                Array.from(
                  new Set([
                    ...importedSessionsResponse.data
                      .map((session) => session.copied_from_session_id)
                      .filter((sessionId): sessionId is string => Boolean(sessionId)),
                    ...importedIdsFromName,
                  ])
                )
              );
            }
          } else {
            setImportedSessionSourceIds([]);
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

  const importedSessionSourceIdSet = useMemo(
    () => new Set(importedSessionSourceIds),
    [importedSessionSourceIds]
  );

  const normalizedSearchQuery = useMemo(() => normalizeSearchValue(searchQuery.trim()), [searchQuery]);

  const sessionDurationById = useMemo(() => {
    const durations = new Map<string, number | null>();
    sessions.forEach((session) => {
      const blocks = blocksBySession.get(session.id) || [];
      const totalSeconds = getSessionEstimatedDuration(blocks);
      durations.set(session.id, totalSeconds && totalSeconds > 0 ? totalSeconds : null);
    });
    return durations;
  }, [blocksBySession, sessions]);

  const filteredSessions = useMemo(
    () =>
      sessions.filter((session) => {
        if (!matchesSearchQuery(session.name, session.description, normalizedSearchQuery)) {
          return false;
        }

        if (!matchesSportFilter(session.sport, sportFilter)) {
          return false;
        }

        return matchesDurationFilter(sessionDurationById.get(session.id) ?? null, durationFilter);
      }),
    [durationFilter, normalizedSearchQuery, sessionDurationById, sessions, sportFilter]
  );

  const filteredPrograms = useMemo(
    () =>
      programs.filter((program) => {
        if (!matchesSearchQuery(program.name, program.description, normalizedSearchQuery)) {
          return false;
        }

        if (!matchesSportFilter(program.sport, sportFilter)) {
          return false;
        }

        const linkedEntries = programSessionsByProgram.get(program.id) || [];
        const totalSeconds = linkedEntries.reduce((sum, entry) => {
          const sessionSeconds = entry.session_id ? sessionDurationById.get(entry.session_id) ?? null : null;
          return sum + (sessionSeconds ?? 0);
        }, 0);

        const effectiveDuration = totalSeconds > 0 ? totalSeconds : null;
        return matchesDurationFilter(effectiveDuration, durationFilter);
      }),
    [durationFilter, normalizedSearchQuery, programSessionsByProgram, programs, sessionDurationById, sportFilter]
  );

  const resetFilters = () => {
    setSearchQuery('');
    setSportFilter('Tous');
    setDurationFilter('all');
  };

  const handleImportSession = async (session: PublicTrainingSession) => {
    if (!userId) return;
    if (importedSessionSourceIdSet.has(session.id)) return;

    setImportingSessionId(session.id);
    setMessage(null);

    try {
      const result = await importPublicTrainingSession(session, userId);

      if (result.error || !result.data) {
        console.error('Erreur import seance banque :', result.error);
        setMessage(getBanqueErrorMessage(result.error));
        return;
      }

      if (result.alreadyImported) {
        setImportedSessionSourceIds((current) => (current.includes(session.id) ? current : [...current, session.id]));
        queuePendingToast({ message: 'Seance deja ajoutee a tes seances', tone: 'info' });
        return;
      }

      setImportedSessionSourceIds((current) => (current.includes(session.id) ? current : [...current, session.id]));
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

        <article className="card banque-filters-card">
          <div className="banque-filters">
            <label className="banque-filter banque-filter--search">
              <span>Recherche</span>
              <input
                type="search"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Rechercher une séance ou un programme..."
                className="banque-search-input"
              />
            </label>

            <label className="banque-filter">
              <span>Sport</span>
              <select
                value={sportFilter}
                onChange={(event) => setSportFilter(event.target.value as BanqueSportFilter)}
                className="banque-filter-select"
              >
                {SPORT_FILTER_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option === 'Mobilite' ? 'Mobilité' : option}
                  </option>
                ))}
              </select>
            </label>

            <label className="banque-filter">
              <span>Durée</span>
              <select
                value={durationFilter}
                onChange={(event) => setDurationFilter(event.target.value as BanqueDurationFilter)}
                className="banque-filter-select"
              >
                {DURATION_FILTER_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </article>

        {message ? <p className="form-feedback form-feedback--error">{message}</p> : null}

        {loading ? (
          <div className="challenge-state">
            <p>Chargement de la Banque Actyv...</p>
          </div>
        ) : activeTab === 'sessions' ? (
          filteredSessions.length === 0 ? (
            <div className="challenge-state banque-empty-state">
              <span className="banque-empty-state__icon">+</span>
              <div>
                <p>Aucun résultat</p>
                <span>Essaie un autre mot-clé ou réinitialise les filtres.</span>
              </div>
              <button type="button" className="button ghost" onClick={resetFilters}>
                Réinitialiser les filtres
              </button>
            </div>
          ) : (
            <div className="sessions-grid banque-grid">
              {filteredSessions.map((session) => {
                const blocks = blocksBySession.get(session.id) || [];
                const creator = creatorById.get(session.user_id);
                const estimatedDuration = getSessionEstimatedDurationLabel(blocks);
                const alreadyImported = importedSessionSourceIdSet.has(session.id);
                const sportLabel = session.sport?.trim() || 'Séance';

                return (
                  <article key={session.id} className="session-card session-card--compact banque-card">
                    <div className="session-card__top">
                      <div className={getSportBadgeClassName(session.sport, 'badge', 'Séance')}>
                        {formatSportBadgeLabel(session.sport, 'Séance')}
                      </div>
                      <span className={`session-progress-pill ${alreadyImported ? 'session-progress-pill--pending' : 'session-progress-pill--done'}`}>
                        {alreadyImported ? 'Deja ajoutee' : 'Public'}
                      </span>
                    </div>

                    <div className="session-card__content">
                      <h2>{session.name}</h2>
                      <p>{session.description || 'Seance sans description pour le moment.'}</p>
                    </div>

                    <div className="session-card__meta">
                      <span>{sportLabel}</span>
                      <span>{estimatedDuration || 'Durée libre'}</span>
                      <span>{blocks.length} bloc{blocks.length > 1 ? 's' : ''}</span>
                      <span>Difficulté libre</span>
                      <span>{creator?.username || creator?.email || 'Createur Actyv'}</span>
                    </div>

                    <div className="session-card__actions">
                      {userId ? (
                        <button
                          type="button"
                          className="button primary"
                          onClick={() => handleImportSession(session)}
                          disabled={importingSessionId === session.id || alreadyImported}
                        >
                          {alreadyImported
                            ? 'Deja ajoutee'
                            : importingSessionId === session.id
                              ? 'Ajout...'
                              : 'Ajouter a mes seances'}
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
        ) : filteredPrograms.length === 0 ? (
          <div className="challenge-state banque-empty-state">
            <span className="banque-empty-state__icon">+</span>
            <div>
              <p>Aucun résultat</p>
              <span>Essaie un autre mot-clé ou réinitialise les filtres.</span>
            </div>
            <button type="button" className="button ghost" onClick={resetFilters}>
              Réinitialiser les filtres
            </button>
          </div>
        ) : (
          <div className="sessions-grid banque-grid">
            {filteredPrograms.map((program) => {
              const entries = programSessionsByProgram.get(program.id) || [];
              const creator = creatorById.get(program.user_id);
              const linkedDurationSeconds = entries.reduce((sum, entry) => {
                const sessionSeconds = entry.session_id ? sessionDurationById.get(entry.session_id) ?? null : null;
                return sum + (sessionSeconds ?? 0);
              }, 0);
              const totalDuration = formatProgramEstimatedDuration(linkedDurationSeconds > 0 ? linkedDurationSeconds : null);
              const sportLabel = program.sport?.trim() || 'Autre';

              return (
                <article key={program.id} className="session-card session-card--compact banque-card">
                  <div className="session-card__top">
                    <div className={getSportBadgeClassName(program.sport, 'badge', 'Autre')}>
                      {formatSportBadgeLabel(program.sport, 'Autre')}
                    </div>
                    <span className="session-progress-pill session-progress-pill--done">Public</span>
                  </div>

                  <div className="session-card__content">
                    <h2>{program.name}</h2>
                    <p>{program.description || 'Programme sans description pour le moment.'}</p>
                  </div>

                  <div className="session-card__meta">
                    <span>{sportLabel}</span>
                    <span>{entries.length} seance{entries.length > 1 ? 's' : ''}</span>
                    <span>{program.duration_weeks} semaine{program.duration_weeks > 1 ? 's' : ''}</span>
                    <span>{totalDuration || 'Durée à découvrir'}</span>
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
