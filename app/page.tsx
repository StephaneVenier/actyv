'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { AppShell } from '@/components/AppShell';
import { formatSportBadgeLabel, getSportBadgeClassName } from '@/components/sport-badge';
import { UserLevelBadge } from '@/components/user-level-badge';
import {
  formatDailySessionDateLabel,
  getBestDailySessionStreakDays,
  getDailySessionStreakDays,
  getTodayIsoDate,
  isDailySessionForToday,
  type DailySession,
  type DailySessionCompletion,
} from '@/lib/daily-sessions';
import { getSessionEstimatedDuration } from '@/lib/session-blocks';
import { supabase } from '@/lib/supabase';
import { fetchTrainingSessionBlocks } from '@/lib/training-session-blocks-db';
import {
  formatProgramDate,
  formatProgramDayLabel,
  getProgramSessionPlannedDate,
  TrainingProgram,
  TrainingProgramCompletion,
  TrainingProgramSession,
} from '@/lib/training-programs';

type Challenge = {
  id: string;
  name: string;
  sport: string | null;
  description: string | null;
  start_date: string | null;
  end_date: string | null;
  created_at?: string | null;
  goal_km?: number | null;
  visibility?: string | null;
  created_by?: string | null;
};

type Activity = {
  id: string;
  challenge_id: string;
  user_email: string | null;
  sport: string | null;
  distance_km: number | null;
  duration_minutes: number | null;
  comment: string | null;
  created_at: string | null;
};

type Profile = {
  email: string | null;
  username: string | null;
  level: number | null;
};

type SocialProfile = {
  username: string;
  level: number | null;
};

type ChallengeMember = {
  challenge_id: string;
  user_email: string | null;
};

type ChallengeParticipant = {
  challenge_id: string;
  user_id: string | null;
};

type ProgramReminderEntry = {
  key: string;
  program: TrainingProgram;
  session: TrainingProgramSession;
  plannedDate: Date | null;
  status: 'completed' | 'todo';
};

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

function formatDailyDurationLabel(totalSeconds: number | null) {
  if (!Number.isFinite(Number(totalSeconds)) || Number(totalSeconds) <= 0) {
    return 'Duree libre';
  }

  return `${Math.max(1, Math.round(Number(totalSeconds) / 60))} min`;
}

function isSameLocalDay(left: Date, right: Date) {
  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
  );
}

function compareReminderEntries(left: ProgramReminderEntry, right: ProgramReminderEntry) {
  const leftTime = left.plannedDate ? left.plannedDate.getTime() : Number.POSITIVE_INFINITY;
  const rightTime = right.plannedDate ? right.plannedDate.getTime() : Number.POSITIVE_INFINITY;

  if (leftTime !== rightTime) return leftTime - rightTime;
  if (left.session.week_number !== right.session.week_number) return left.session.week_number - right.session.week_number;
  if (left.session.day_of_week !== right.session.day_of_week) return left.session.day_of_week - right.session.day_of_week;
  return left.session.order_index - right.session.order_index;
}

function formatDate(dateString: string | null) {
  if (!dateString) return 'Date inconnue';

  const date = new Date(dateString);
  return new Intl.DateTimeFormat('fr-FR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(date);
}

function formatRelativeTime(dateString: string | null) {
  if (!dateString) return 'A l instant';

  const target = new Date(dateString).getTime();
  if (Number.isNaN(target)) return 'A l instant';

  const diffMs = target - Date.now();
  const minutes = Math.round(diffMs / (1000 * 60));
  const hours = Math.round(diffMs / (1000 * 60 * 60));
  const days = Math.round(diffMs / (1000 * 60 * 60 * 24));
  const rtf = new Intl.RelativeTimeFormat('fr', { numeric: 'auto' });

  if (Math.abs(minutes) < 60) return rtf.format(minutes, 'minute');
  if (Math.abs(hours) < 24) return rtf.format(hours, 'hour');
  return rtf.format(days, 'day');
}

function formatDistance(distance: number | null) {
  if (distance === null || distance === undefined) return null;
  return `${distance.toFixed(1)} km`;
}

function formatDuration(duration: number | null) {
  if (duration === null || duration === undefined) return null;
  return `${duration} min`;
}

function formatReminderPlannedDate(date: Date | null) {
  if (!date) return 'Date a definir';

  return date.toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: '2-digit',
    month: 'short',
  });
}

const HOME_ACTIONS = [
  {
    title: 'Creer un challenge',
    description: 'Lancer un objectif solo ou collectif.',
    href: '/challenges/new',
    emoji: '🏆',
  },
  {
    title: 'Rejoindre un challenge',
    description: 'Explorer les challenges ouverts.',
    href: '/challenges',
    emoji: '🤝',
  },
  {
    title: 'Creer une seance',
    description: 'Composer une seance personnalisee.',
    href: '/sessions/new',
    emoji: '📝',
  },
  {
    title: 'Lancer une seance',
    description: 'Reprendre ton training en mode live.',
    href: '/sessions',
    emoji: '▶️',
  },
  {
    title: 'Voir mes statistiques',
    description: 'Retrouver progression, records et historique.',
    href: '/stats',
    emoji: '📊',
  },
  {
    title: 'Classements',
    description: 'Comparer l’activite avec ta communaute.',
    href: '/leaderboard',
    emoji: '🥇',
  },
  {
    title: 'Badges / XP',
    description: 'Suivre niveau, badges et progression.',
    href: '/profile',
    emoji: '✨',
  },
] as const;

const HOME_FEATURE_CARDS = [
  {
    title: 'Creer un challenge',
    description: 'Lance un objectif solo ou collectif.',
    href: '/challenges/new',
    emoji: '🏆',
  },
  {
    title: 'Rejoindre un challenge',
    description: 'Participe a des defis ouverts ou prives.',
    href: '/challenges',
    emoji: '🤝',
  },
  {
    title: 'Seances',
    description: 'Cree, lance et suis tes seances.',
    href: '/sessions',
    emoji: '🏋️',
  },
  {
    title: 'Programmes',
    description: 'Planifie tes cycles et suis ta progression.',
    href: '/programs',
    emoji: '🗓️',
  },
  {
    title: 'Banque Actyv',
    description: 'Importe des seances et programmes publics.',
    href: '/banque',
    emoji: '📚',
  },
  {
    title: 'Statistiques',
    description: 'Retrouve ta progression et ton historique.',
    href: '/stats',
    emoji: '📊',
  },
  {
    title: 'Classements',
    description: 'Compare ton activite avec la communaute.',
    href: '/leaderboard',
    emoji: '🥇',
  },
  {
    title: 'Badges / XP',
    description: 'Debloque des badges et gagne de l experience.',
    href: '/profile',
    emoji: '✨',
  },
] as const;

export default function HomePage() {
  const [challenges, setChallenges] = useState<Challenge[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [dailySession, setDailySession] = useState<DailySession | null>(null);
  const [dailySessionTraining, setDailySessionTraining] = useState<TrainingSessionSummary | null>(null);
  const [dailySessionCompletion, setDailySessionCompletion] = useState<DailySessionCompletion | null>(null);
  const [dailySessionBlockCount, setDailySessionBlockCount] = useState(0);
  const [dailySessionEstimatedDuration, setDailySessionEstimatedDuration] = useState<string | null>(null);
  const [dailySessionStreakDays, setDailySessionStreakDays] = useState(0);
  const [dailySessionBestStreakDays, setDailySessionBestStreakDays] = useState(0);
  const [todayProgramSessions, setTodayProgramSessions] = useState<ProgramReminderEntry[]>([]);
  const [nextProgramSession, setNextProgramSession] = useState<ProgramReminderEntry | null>(null);
  const [participantsCountMap, setParticipantsCountMap] = useState<Record<string, number>>({});
  const [profilesMap, setProfilesMap] = useState<Record<string, SocialProfile>>({});
  const [loadingChallenges, setLoadingChallenges] = useState(true);
  const [loadingFeed, setLoadingFeed] = useState(true);
  const [loadingProgramReminders, setLoadingProgramReminders] = useState(true);
  const [loadingDailySession, setLoadingDailySession] = useState(true);

  useEffect(() => {
    const fetchHomeData = async () => {
      setLoadingChallenges(true);
      setLoadingFeed(true);
      setLoadingProgramReminders(true);
      setLoadingDailySession(true);

      const {
        data: { user },
      } = await supabase.auth.getUser();

      const userEmail = user?.email || null;
      const userId = user?.id || null;
      const todayIso = getTodayIsoDate();

      const nextDailySessionResponse = await supabase
        .from('daily_sessions')
        .select('id, session_id, scheduled_for, bonus_xp, created_at')
        .gte('scheduled_for', todayIso)
        .order('scheduled_for', { ascending: true })
        .limit(1)
        .maybeSingle();

      if (nextDailySessionResponse.error) {
        console.error('Erreur chargement seance du jour accueil :', nextDailySessionResponse.error);
        setDailySession(null);
        setDailySessionTraining(null);
        setDailySessionCompletion(null);
        setDailySessionBlockCount(0);
        setDailySessionEstimatedDuration(null);
        setDailySessionStreakDays(0);
        setDailySessionBestStreakDays(0);
      } else {
        const nextDailySession = (nextDailySessionResponse.data as DailySession | null) || null;
        setDailySession(nextDailySession);

        if (!nextDailySession) {
          setDailySessionTraining(null);
          setDailySessionCompletion(null);
          setDailySessionBlockCount(0);
          setDailySessionEstimatedDuration(null);
          setDailySessionStreakDays(0);
          setDailySessionBestStreakDays(0);
        } else {
          const [{ data: sessionRow, error: sessionError }, completionResponse, streakResponse] = await Promise.all([
            supabase
              .from('training_sessions')
              .select('id, user_id, name, sport, difficulty, description, visibility, created_at')
              .eq('id', nextDailySession.session_id)
              .eq('visibility', 'public')
              .maybeSingle(),
            userId
              ? supabase
                  .from('daily_session_completions')
                  .select('id, daily_session_id, user_id, session_id, workout_history_id, scheduled_for, completed_at, created_at')
                  .eq('user_id', userId)
                  .eq('daily_session_id', nextDailySession.id)
                  .maybeSingle()
              : Promise.resolve({ data: null, error: null }),
            userId
              ? supabase
                  .from('daily_session_completions')
                  .select('scheduled_for')
                  .eq('user_id', userId)
                  .order('scheduled_for', { ascending: false })
                  .limit(120)
              : Promise.resolve({ data: [], error: null }),
          ]);

          if (sessionError) {
            console.error('Erreur chargement seance publique du jour accueil :', sessionError);
            setDailySessionTraining(null);
            setDailySessionBlockCount(0);
            setDailySessionEstimatedDuration(null);
          } else {
            const nextTraining = (sessionRow as TrainingSessionSummary | null) || null;
            setDailySessionTraining(nextTraining);

            if (nextTraining) {
              const { data: blockRows, error: blocksError } = await fetchTrainingSessionBlocks([nextTraining.id]);

              if (blocksError) {
                console.error('Erreur chargement blocs seance du jour accueil :', blocksError);
                setDailySessionBlockCount(0);
                setDailySessionEstimatedDuration(null);
              } else {
                const nextBlocks = blockRows || [];
                setDailySessionBlockCount(nextBlocks.length);
                setDailySessionEstimatedDuration(formatDailyDurationLabel(getSessionEstimatedDuration(nextBlocks)));
              }
            } else {
              setDailySessionBlockCount(0);
              setDailySessionEstimatedDuration(null);
            }
          }

          if (completionResponse.error) {
            console.error('Erreur chargement completion seance du jour accueil :', completionResponse.error);
            setDailySessionCompletion(null);
          } else {
            setDailySessionCompletion((completionResponse.data as DailySessionCompletion | null) || null);
          }

          if (streakResponse.error) {
            console.error('Erreur chargement streak seance du jour accueil :', streakResponse.error);
            setDailySessionStreakDays(0);
            setDailySessionBestStreakDays(0);
          } else {
            const streakRows =
              ((streakResponse.data as Array<Pick<DailySessionCompletion, 'scheduled_for'>>) || []);
            setDailySessionStreakDays(
              getDailySessionStreakDays(streakRows)
            );
            setDailySessionBestStreakDays(getBestDailySessionStreakDays(streakRows));
          }
        }
      }

      setLoadingDailySession(false);

      if (userId) {
        const { data: programsRows, error: programsError } = await supabase
          .from('training_programs')
          .select('id, user_id, name, description, sport, duration_weeks, visibility, start_date, created_at')
          .eq('user_id', userId)
          .order('created_at', { ascending: false });

        if (programsError) {
          console.error('Erreur chargement rappels programmes :', programsError);
          setTodayProgramSessions([]);
          setNextProgramSession(null);
        } else {
          const programs = (programsRows as TrainingProgram[] | null) || [];

          if (programs.length === 0) {
            setTodayProgramSessions([]);
            setNextProgramSession(null);
          } else {
            const programIds = programs.map((program) => program.id);
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
                .eq('user_id', userId)
                .in('program_id', programIds)
                .order('completed_at', { ascending: false }),
            ]);

            if (sessionsResponse.error) {
              console.error('Erreur chargement seances programmes accueil :', sessionsResponse.error);
              setTodayProgramSessions([]);
              setNextProgramSession(null);
            } else {
              if (completionsResponse.error) {
                console.error('Erreur chargement progression programmes accueil :', completionsResponse.error);
              }

              const programSessions = (sessionsResponse.data as TrainingProgramSession[] | null) || [];
              const programCompletions = (completionsResponse.data as TrainingProgramCompletion[] | null) || [];
              const completedProgramSessionIds = new Set(programCompletions.map((entry) => entry.program_session_id));
              const programsById = new Map(programs.map((program) => [program.id, program]));
              const today = new Date();
              const todayLocal = new Date(today.getFullYear(), today.getMonth(), today.getDate());

              const reminderEntries = programSessions
                .map((session) => {
                  const program = programsById.get(session.program_id);
                  if (!program) return null;

                  const plannedDate = program.start_date
                    ? getProgramSessionPlannedDate(program.start_date, session.week_number, session.day_of_week)
                    : null;

                  return {
                    key: session.id,
                    program,
                    session,
                    plannedDate,
                    status: completedProgramSessionIds.has(session.id) ? 'completed' : 'todo',
                  } satisfies ProgramReminderEntry;
                })
                .filter((entry): entry is ProgramReminderEntry => Boolean(entry));

              const remainingEntries = reminderEntries
                .filter((entry) => entry.status !== 'completed')
                .sort(compareReminderEntries);

              const todayEntries = remainingEntries.filter(
                (entry) => entry.plannedDate && isSameLocalDay(entry.plannedDate, todayLocal)
              );

              const futureEntries = remainingEntries.filter(
                (entry) => entry.plannedDate && entry.plannedDate.getTime() > todayLocal.getTime()
              );

              const undatedEntries = remainingEntries.filter((entry) => !entry.plannedDate);

              setTodayProgramSessions(todayEntries);
              setNextProgramSession(todayEntries[0] || futureEntries[0] || undatedEntries[0] || remainingEntries[0] || null);
            }
          }
        }
      } else {
        setTodayProgramSessions([]);
        setNextProgramSession(null);
      }

      setLoadingProgramReminders(false);

      let visibleChallengeIds: string[] = [];

      if (userEmail) {
        const { data: memberRows, error: membersError } = await supabase
          .from('challenge_members')
          .select('challenge_id, user_email')
          .eq('user_email', userEmail);

        if (membersError) {
          console.error('Erreur chargement challenge_members :', membersError);
        } else {
          visibleChallengeIds = (memberRows as ChallengeMember[] | null)?.map(
            (row) => row.challenge_id
          ) || [];
        }
      }

      let challengesQuery = supabase
        .from('challenges')
        .select('id, name, sport, description, start_date, end_date, created_at, goal_km, visibility, created_by')
        .eq('is_deleted', false)
        .order('created_at', { ascending: false });

      if (userEmail) {
        const visibilityFilters = ['visibility.eq.public'];

        if (userId) {
          visibilityFilters.push(`created_by.eq.${userId}`);
        }

        if (visibleChallengeIds.length > 0) {
          visibilityFilters.push(`id.in.(${visibleChallengeIds.join(',')})`);
        }

        challengesQuery = challengesQuery.or(visibilityFilters.join(','));
      } else {
        challengesQuery = challengesQuery.eq('visibility', 'public');
      }

      const { data: challengesData, error: challengesError } = await challengesQuery;

      if (challengesError) {
        console.error('Erreur chargement challenges :', challengesError);
        setChallenges([]);
        setParticipantsCountMap({});
      } else {
        const loadedChallenges = challengesData || [];
        setChallenges(loadedChallenges);

        const challengeIds = loadedChallenges.map((challenge) => challenge.id);

        if (challengeIds.length > 0) {
          const [membersResponse, participantsResponse] = await Promise.all([
            supabase
              .from('challenge_members')
              .select('challenge_id, user_email')
              .in('challenge_id', challengeIds),
            supabase
              .from('challenge_participants')
              .select('challenge_id, user_id')
              .in('challenge_id', challengeIds),
          ]);

          if (membersResponse.error) {
            console.error('Erreur compteur challenge_members :', membersResponse.error);
          }

          if (participantsResponse.error) {
            console.error('Erreur compteur challenge_participants :', participantsResponse.error);
          }

          const nextParticipantsCountMap: Record<string, number> = {};

          loadedChallenges.forEach((challenge) => {
            const keys = new Set<string>();

            if (challenge.created_by) {
              keys.add(`user:${challenge.created_by}`);
            }

            ((membersResponse.data as ChallengeMember[] | null) || []).forEach((member) => {
              if (member.challenge_id === challenge.id && member.user_email) {
                keys.add(`email:${member.user_email.toLowerCase()}`);
              }
            });

            ((participantsResponse.data as ChallengeParticipant[] | null) || []).forEach(
              (participant) => {
                if (participant.challenge_id === challenge.id && participant.user_id) {
                  keys.add(`user:${participant.user_id}`);
                }
              }
            );

            nextParticipantsCountMap[challenge.id] = Math.max(keys.size, 1);
          });

          setParticipantsCountMap(nextParticipantsCountMap);
        } else {
          setParticipantsCountMap({});
        }
      }

      setLoadingChallenges(false);

      if (!userEmail) {
        setActivities([]);
        setProfilesMap({});
        setLoadingFeed(false);
        return;
      }

      const joinedChallengeIds = visibleChallengeIds;

      if (joinedChallengeIds.length === 0) {
        setActivities([]);
        setProfilesMap({});
        setLoadingFeed(false);
        return;
      }

      const { data: feedActivities, error: feedError } = await supabase
        .from('activities')
        .select('id, challenge_id, user_email, sport, distance_km, duration_minutes, comment, created_at')
        .in('challenge_id', joinedChallengeIds)
        .order('created_at', { ascending: false })
        .limit(8);

      if (feedError) {
        console.error('Erreur chargement feed activites :', feedError);
        setActivities([]);
        setProfilesMap({});
        setLoadingFeed(false);
        return;
      }

      const loadedActivities = feedActivities || [];
      setActivities(loadedActivities);

      const emails = Array.from(
        new Set(
          loadedActivities
            .map((activity) => activity.user_email)
            .filter((email): email is string => Boolean(email))
        )
      );

      if (emails.length > 0) {
        const { data: profilesData, error: profilesError } = await supabase
          .from('profiles')
          .select('email, username, level')
          .in('email', emails);

        if (profilesError) {
          console.error('Erreur chargement profils :', profilesError);
          setProfilesMap({});
        } else {
          const nextProfilesMap: Record<string, SocialProfile> = {};

          (profilesData as Profile[] | null)?.forEach((profile) => {
            if (profile.email) {
              nextProfilesMap[profile.email] = {
                username: profile.username || profile.email,
                level: profile.level,
              };
            }
          });

          setProfilesMap(nextProfilesMap);
        }
      } else {
        setProfilesMap({});
      }

      setLoadingFeed(false);
    };

    fetchHomeData();
  }, []);

  const challengesMap = useMemo(() => {
    return Object.fromEntries(challenges.map((challenge) => [challenge.id, challenge]));
  }, [challenges]);

  const getDisplayProfile = (email: string | null) => {
    if (!email) {
      return { username: 'Utilisateur inconnu', level: 1 };
    }

    return profilesMap[email] || { username: email, level: 1 };
  };

  return (
    <AppShell>
      <div className="home-page">
        <section className="hero-banner">
          <div className="hero-actions">
            <Link
              href="/challenges/new"
              className="hero-btn hero-btn--primary hero-btn-left"
            >
              Creer un challenge
            </Link>

            <Link
              href="/challenges"
              className="hero-btn hero-btn--secondary hero-btn-right"
            >
              Explorer les challenges
            </Link>
          </div>
        </section>

        <section className="home-actions card">
          <div className="home-challenges__header">
            <div>
              <span className="section-kicker">Actyv en ce moment</span>
              <h2>Ce que tu peux faire sur Actyv</h2>
            </div>
          </div>

          <div className="home-actions-grid">
            {HOME_FEATURE_CARDS.map((action) => (
              <Link key={action.title} href={action.href} className="home-action-card">
                <span className="home-action-card__emoji" aria-hidden="true">
                  {action.emoji}
                </span>
                <strong>{action.title}</strong>
                <p>{action.description}</p>
              </Link>
            ))}
          </div>
        </section>

        <section className="home-placeholder card home-daily-session">
          <div className="home-challenges__header">
            <div>
              <span className="section-kicker">Actyv quotidien</span>
              <p>Ta mission sportive du jour</p>
              <h2>Séance du jour</h2>
            </div>
            <Link href="/session-du-jour" className="home-challenges__link">
              Ouvrir la page dédiée
            </Link>
          </div>

          {loadingDailySession ? (
            <div className="challenge-state challenge-state--compact">
              <p>Chargement de la séance du jour...</p>
            </div>
          ) : !dailySession || !dailySessionTraining ? (
            <div className="home-program-reminder-empty stack">
              <div className="challenge-state challenge-state--compact">
                <p>Aucune séance du jour disponible pour le moment.</p>
              </div>
              <div className="home-program-reminder-card__actions">
                <Link href="/banque" className="button ghost">
                  Ouvrir la Banque Actyv
                </Link>
              </div>
            </div>
          ) : (
            <article className="home-program-reminder-card daily-session-card daily-session-card--home">
              <div className="home-program-reminder-card__top">
                <div className={getSportBadgeClassName(dailySessionTraining.sport, 'badge', 'Sport')}>
                  {formatSportBadgeLabel(dailySessionTraining.sport, 'Sport')}
                </div>
                <span className="session-progress-pill">
                  {isDailySessionForToday(dailySession.scheduled_for)
                    ? 'Aujourd hui'
                    : formatDailySessionDateLabel(dailySession.scheduled_for)}
                </span>
              </div>

              <div className="home-program-reminder-card__copy">
                <span className="daily-session-card__eyebrow">
                  {isDailySessionForToday(dailySession.scheduled_for) ? "Seance d'aujourd'hui" : 'Prochaine seance du jour'}
                </span>
                <strong>{dailySessionTraining.name}</strong>
                <p>{dailySessionTraining.description || 'Séance publique prête à lancer.'}</p>
              </div>

              <div className="program-card__facts">
                <span>{dailySessionTraining.difficulty || 'Difficulte libre'}</span>
                <span>{dailySessionEstimatedDuration || 'Duree libre'}</span>
                <span>{dailySessionBlockCount} bloc{dailySessionBlockCount > 1 ? 's' : ''}</span>
                <span>{dailySession.bonus_xp} XP bonus</span>
              </div>

              <div className="daily-session-stats-grid">
              <p className="daily-session-streak">
                <span aria-hidden="true">🔥</span> Série actuelle <strong>{dailySessionStreakDays} jour{dailySessionStreakDays > 1 ? 's' : ''}</strong>
              </p>

              <p className="daily-session-streak">
                <span aria-hidden="true">🏅</span> Meilleure serie <strong>{dailySessionBestStreakDays} jour{dailySessionBestStreakDays > 1 ? 's' : ''}</strong>
              </p>
              </div>

              {dailySessionCompletion ? (
                <>
                <p className="daily-session-status">
                  Deja realisee aujourd&apos;hui. Relance libre, sans XP supplementaire.
                </p>
                <p className="form-feedback form-feedback--success">
                  Bonus du jour déjà récupéré.
                </p>
                </>
              ) : (
                <p className="daily-session-status">
                  Seance non realisee. {dailySession.bonus_xp} XP bonus disponibles aujourd&apos;hui.
                </p>
              )}

              <div className="home-program-reminder-card__actions">
                <Link
                  href={`/sessions/${dailySessionTraining.id}/live?dailySessionId=${dailySession.id}`}
                  className="button primary"
                >
                  {dailySessionCompletion ? 'Relancer' : 'Lancer'}
                </Link>
                <Link href="/session-du-jour" className="button ghost">
                  Voir la séance du jour
                </Link>
              </div>
            </article>
          )}
        </section>

        <section className="home-placeholder card home-program-reminders">
          <div className="home-challenges__header">
            <div>
              <span className="section-kicker">Programmes</span>
              <h2>A faire aujourd hui</h2>
            </div>
            <Link href="/programs" className="home-challenges__link">
              Voir mes programmes
            </Link>
          </div>

          {loadingProgramReminders ? (
            <div className="challenge-state challenge-state--compact">
              <p>Chargement de tes seances du jour...</p>
            </div>
          ) : todayProgramSessions.length > 0 ? (
            <div className="home-program-reminder-list">
              {todayProgramSessions.map((entry) => (
                <article key={entry.key} className="home-program-reminder-card">
                  <div className="home-program-reminder-card__top">
                    <div className={getSportBadgeClassName(entry.session.sport || entry.program.sport, 'badge', 'Sport')}>
                      {formatSportBadgeLabel(entry.session.sport || entry.program.sport, 'Sport')}
                    </div>
                    <span className="session-progress-pill">{formatReminderPlannedDate(entry.plannedDate)}</span>
                  </div>

                  <div className="home-program-reminder-card__copy">
                    <strong>{entry.session.session_name}</strong>
                    <p>{entry.program.name}</p>
                  </div>

                  <div className="program-card__facts">
                    <span>{entry.program.name}</span>
                    <span>{formatProgramDayLabel(entry.program.start_date, entry.session.week_number, entry.session.day_of_week)}</span>
                    <span>Semaine {entry.session.week_number}</span>
                  </div>

                  <div className="home-program-reminder-card__actions">
                    {entry.session.session_id ? (
                      <Link href={`/sessions/${entry.session.session_id}/live`} className="button primary">
                        Lancer
                      </Link>
                    ) : (
                      <Link href={`/programs/${entry.program.id}`} className="button primary">
                        Voir le programme
                      </Link>
                    )}
                    <Link href={`/programs/${entry.program.id}`} className="button ghost">
                      Voir programme
                    </Link>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="home-program-reminder-empty stack">
              <div className="challenge-state challenge-state--compact">
                <p>Rien de prevu aujourd hui.</p>
              </div>

              {nextProgramSession ? (
                <article className="home-program-reminder-card home-program-reminder-card--next">
                  <div className="home-program-reminder-card__top">
                    <span className="section-kicker">Prochaine seance</span>
                    <span className="session-progress-pill">{formatReminderPlannedDate(nextProgramSession.plannedDate)}</span>
                  </div>

                  <div className="home-program-reminder-card__copy">
                    <strong>{nextProgramSession.session.session_name}</strong>
                    <p>{nextProgramSession.program.name}</p>
                  </div>

                  <div className="program-card__facts">
                    <span>{nextProgramSession.program.sport || 'Sport libre'}</span>
                    <span>
                      Semaine {nextProgramSession.session.week_number} •{' '}
                      {formatProgramDayLabel(
                        nextProgramSession.program.start_date,
                        nextProgramSession.session.week_number,
                        nextProgramSession.session.day_of_week
                      )}
                    </span>
                    {nextProgramSession.program.start_date ? (
                      <span>Debut {formatProgramDate(nextProgramSession.program.start_date)}</span>
                    ) : (
                      <span>Programme sans date de debut</span>
                    )}
                  </div>

                  <div className="home-program-reminder-card__actions">
                    {nextProgramSession.session.session_id ? (
                      <Link href={`/sessions/${nextProgramSession.session.session_id}/live`} className="button primary">
                        Lancer
                      </Link>
                    ) : (
                      <Link href={`/programs/${nextProgramSession.program.id}`} className="button primary">
                        Voir le programme
                      </Link>
                    )}
                    <Link href={`/programs/${nextProgramSession.program.id}`} className="button ghost">
                      Voir programme
                    </Link>
                  </div>
                </article>
              ) : (
                <p className="muted">Aucune prochaine seance a afficher pour le moment.</p>
              )}
            </div>
          )}
        </section>

        <section className="home-challenges">
          <div className="home-challenges__header">
            <div>
              <span className="section-kicker">En ce moment</span>
              <h2>Challenges a suivre</h2>
            </div>

            <Link href="/challenges" className="home-challenges__link">
              Voir tous les challenges
            </Link>
          </div>

          {loadingChallenges ? (
            <div className="challenge-state">
              <p>Chargement des challenges...</p>
            </div>
          ) : challenges.length === 0 ? (
            <div className="challenge-state">
              <p>Aucun challenge en cours pour le moment.</p>
            </div>
          ) : (
            <div className="challenge-list">
              {challenges.slice(0, 3).map((challenge) => (
                <Link
                  key={challenge.id}
                  href={`/challenges/${challenge.id}`}
                  className="challenge-item"
                >
                  <div className="challenge-item__top">
                    <span className={getSportBadgeClassName(challenge.sport, 'challenge-item__pill', 'Sport')}>
                      {formatSportBadgeLabel(challenge.sport, 'Sport')}
                    </span>
                    <span className="challenge-item__pill challenge-item__participants-pill">
                      {participantsCountMap[challenge.id] || 1} participant
                      {(participantsCountMap[challenge.id] || 1) > 1 ? 's' : ''}
                    </span>
                  </div>

                  <h3>{challenge.name}</h3>

                  <p>
                    {challenge.description?.trim()
                      ? challenge.description
                      : challenge.goal_km
                        ? `Objectif : ${challenge.goal_km} km`
                        : 'Rejoins ce challenge et commence a faire progresser ton equipe.'}
                  </p>

                  <span className="challenge-item__cta">Voir le detail</span>
                </Link>
              ))}
            </div>
          )}
        </section>

        <section className="home-feed">
          <div className="home-feed__header">
            <div>
              <span className="section-kicker">A suivre</span>
              <h2>Activites recentes</h2>
            </div>
          </div>

          {loadingFeed ? (
            <div className="challenge-state">
              <p>Chargement des activites...</p>
            </div>
          ) : activities.length === 0 ? (
            <div className="challenge-state">
              <p>Aucune activite recente sur tes challenges pour le moment.</p>
            </div>
          ) : (
            <div className="feed-list">
              {activities.map((activity) => {
                const challenge = challengesMap[activity.challenge_id];
                const distanceText = formatDistance(activity.distance_km);
                const durationText = formatDuration(activity.duration_minutes);
                const activityProfile = getDisplayProfile(activity.user_email);

                return (
                  <article key={activity.id} className="feed-item">
                    <div className="feed-item__top">
                      <div className="feed-item__identity">
                        <span className="feed-item__eyebrow">Nouvelle activite</span>
                        <strong className="feed-item__headline">
                          <span className="feed-item__author">{activityProfile.username}</span>
                          <UserLevelBadge level={activityProfile.level} />
                          <span className="feed-item__action">a ajoute une activite</span>
                        </strong>
                        <span className="feed-item__date" title={formatDate(activity.created_at)}>
                          {formatRelativeTime(activity.created_at)}
                        </span>
                      </div>

                      {challenge && (
                        <Link
                          href={`/challenges/${challenge.id}`}
                          className="feed-item__challenge"
                        >
                          {challenge.name}
                        </Link>
                      )}
                    </div>

                    <div
                      className={getSportBadgeClassName(
                        activity.sport || challenge?.sport,
                        'feed-item__sport',
                        'Activite'
                      )}
                    >
                      {formatSportBadgeLabel(activity.sport || challenge?.sport, 'Activite')}
                    </div>

                    <div className="feed-item__stats">
                      {distanceText && (
                        <span>
                          <small>Distance</small>
                          <strong>{distanceText}</strong>
                        </span>
                      )}
                      {durationText && (
                        <span>
                          <small>Duree</small>
                          <strong>{durationText}</strong>
                        </span>
                      )}
                    </div>

                    {activity.comment && (
                      <p className="feed-item__comment">{activity.comment}</p>
                    )}
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </AppShell>
  );
}
