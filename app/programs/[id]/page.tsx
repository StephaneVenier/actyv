'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { AppShell } from '@/components/AppShell';
import { queuePendingToast } from '@/components/ToastProvider';
import { formatSportBadgeLabel, getSportBadgeClassName } from '@/components/sport-badge';
import { awardXp, getBadgeByCode, refreshUserBadges } from '@/lib/gamification';
import { supabase } from '@/lib/supabase';
import {
  generateProgramInviteCode,
  formatProgramDate,
  formatProgramDayLabel,
  formatProgramEndDate,
  formatProgramPlannedShortDateLabel,
  formatProgramVisibilityLabel,
  getProgramSessionPlannedDate,
  groupProgramDaysByCalendarWeek,
  parseLocalDate,
  getProgramWeekLabel,
  getTrainingProgramProgress,
  PROGRAM_DAY_OPTIONS,
  TrainingProgram,
  TrainingProgramSession,
} from '@/lib/training-programs';
import { fetchTrainingSessionBlocks, TrainingSessionBlockRecord } from '@/lib/training-session-blocks-db';

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

type ProgramPlanView = 'calendar' | 'list';

type WorkoutHistoryCompletion = {
  id: string;
  workout_id: string | null;
  completed_at: string;
};

type ProgramSessionInsight = {
  blockCount: number;
  estimatedDurationSeconds: number | null;
};

type ProgramShareErrorDetails = {
  message: string | null;
  code: string | null;
  details: string | null;
  hint: string | null;
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

function capitalizeLabel(value: string | null | undefined) {
  if (!value) return '';
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function sortProgramSessions(entries: TrainingProgramSession[]) {
  return [...entries].sort((left, right) => {
    if (left.week_number !== right.week_number) return left.week_number - right.week_number;
    if (left.day_of_week !== right.day_of_week) return left.day_of_week - right.day_of_week;
    return left.order_index - right.order_index;
  });
}

function buildNormalizedProgramSessions(entries: TrainingProgramSession[]) {
  const grouped = new Map<string, TrainingProgramSession[]>();

  entries.forEach((entry) => {
    const key = `${entry.week_number}-${entry.day_of_week}`;
    const current = grouped.get(key) || [];
    current.push(entry);
    grouped.set(key, current);
  });

  const normalized: TrainingProgramSession[] = [];

  [...grouped.values()].forEach((groupEntries) => {
    sortProgramSessions(groupEntries).forEach((entry, index) => {
      normalized.push({
        ...entry,
        order_index: index + 1,
      });
    });
  });

  return sortProgramSessions(normalized);
}

async function fetchOwnedProgram(programId: string, userId: string) {
  const selectWithSharing =
    'id, user_id, name, description, sport, duration_weeks, visibility, invite_code, copied_from_program_id, start_date, created_at';
  const selectWithInviteCode =
    'id, user_id, name, description, sport, duration_weeks, visibility, invite_code, start_date, created_at';
  const selectWithoutSharing = 'id, user_id, name, description, sport, duration_weeks, visibility, start_date, created_at';

  const primaryResponse = await supabase
    .from('training_programs')
    .select(selectWithSharing)
    .eq('id', programId)
    .eq('user_id', userId)
    .maybeSingle();

  if (!primaryResponse.error) {
    return {
      data: primaryResponse.data as TrainingProgram | null,
      error: null,
    };
  }

  const inviteCodeFallbackResponse = await supabase
    .from('training_programs')
    .select(selectWithInviteCode)
    .eq('id', programId)
    .eq('user_id', userId)
    .maybeSingle();

  if (!inviteCodeFallbackResponse.error) {
    return {
      data: inviteCodeFallbackResponse.data
        ? ({ ...inviteCodeFallbackResponse.data, copied_from_program_id: null } as TrainingProgram)
        : null,
      error: null,
    };
  }

  const fallbackResponse = await supabase
    .from('training_programs')
    .select(selectWithoutSharing)
    .eq('id', programId)
    .eq('user_id', userId)
    .maybeSingle();

  return {
    data: fallbackResponse.data
      ? ({ ...fallbackResponse.data, invite_code: null, copied_from_program_id: null } as TrainingProgram)
      : null,
    error: fallbackResponse.error,
  };
}

async function copyTextWithFallback(value: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }

  if (typeof document === 'undefined') {
    throw new Error('Clipboard indisponible');
  }

  const textarea = document.createElement('textarea');
  textarea.value = value;
  textarea.setAttribute('readonly', 'true');
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  textarea.style.pointerEvents = 'none';
  document.body.appendChild(textarea);
  textarea.select();

  const copied = document.execCommand('copy');
  document.body.removeChild(textarea);

  if (!copied) {
    throw new Error('Copie impossible');
  }
}

function getProgramSharingErrorMessage(error: { code?: string; message?: string; details?: string | null } | null | undefined) {
  const message = `${error?.message || ''} ${error?.details || ''}`.toLowerCase();

  if (error?.code === '23505') {
    return "Le code de partage genere est deja utilise. Reessaie dans un instant.";
  }

  if (error?.code === '23514' && message.includes('copies_not_shared')) {
    return 'Seul le createur original peut partager ce programme.';
  }

  if (error?.code === '23514' || message.includes('training_programs_visibility_check')) {
    return "La base de donnees n'autorise pas encore le statut shared. Applique la migration Supabase du partage.";
  }

  if (message.includes('invite_code') && message.includes('column')) {
    return "La colonne invite_code n'existe pas encore en base. Applique la migration Supabase du partage.";
  }

  if (message.includes('copied_from_program_id') && message.includes('column')) {
    return "La colonne copied_from_program_id n'existe pas encore en base. Applique la migration Supabase du partage des copies.";
  }

  if (message.includes('visibility') && message.includes('column')) {
    return "La colonne visibility n'existe pas encore en base. Applique la migration Supabase du partage.";
  }

  if (message.includes('row-level security') || error?.code === '42501') {
    return "Supabase refuse la mise a jour du partage. Verifie la policy RLS d'update sur training_programs.";
  }

  return "Impossible d'activer le partage pour le moment.";
}

function getProgramShareErrorDetails(error: {
  code?: string | null;
  message?: string | null;
  details?: string | null;
  hint?: string | null;
} | null | undefined): ProgramShareErrorDetails {
  return {
    message: error?.message || null,
    code: error?.code || null,
    details: error?.details || null,
    hint: error?.hint || null,
  };
}

function formatDurationCompact(totalSeconds: number | null | undefined) {
  if (!Number.isFinite(Number(totalSeconds)) || Number(totalSeconds) <= 0) {
    return null;
  }

  const normalizedSeconds = Math.max(0, Math.round(Number(totalSeconds)));
  const hours = Math.floor(normalizedSeconds / 3600);
  const minutes = Math.round((normalizedSeconds % 3600) / 60);

  if (hours > 0) {
    return `${hours} h ${minutes.toString().padStart(2, '0')}`;
  }

  return `${Math.max(1, minutes)} min`;
}

function getProgramSessionInsight(blocks: TrainingSessionBlockRecord[]): ProgramSessionInsight {
  if (blocks.length === 0) {
    return { blockCount: 0, estimatedDurationSeconds: null };
  }

  let estimatedSeconds = 0;
  let hasEstimate = false;

  blocks.forEach((block) => {
    const sets = Math.max(1, Number(block.sets_count || 1));
    const targetValue = Number(block.target_value || 0);
    const restSeconds = Number(block.rest_seconds || 0);

    if (block.block_type === 'duration' && Number.isFinite(targetValue) && targetValue > 0) {
      estimatedSeconds += targetValue * sets;
      hasEstimate = true;
    }

    if (Number.isFinite(restSeconds) && restSeconds > 0 && sets > 1) {
      estimatedSeconds += restSeconds * (sets - 1);
      hasEstimate = true;
    }
  });

  return {
    blockCount: blocks.length,
    estimatedDurationSeconds: hasEstimate ? estimatedSeconds : null,
  };
}

export default function ProgramDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params?.id as string;

  const [program, setProgram] = useState<TrainingProgram | null>(null);
  const [programSessions, setProgramSessions] = useState<TrainingProgramSession[]>([]);
  const [sessionCompletions, setSessionCompletions] = useState<WorkoutHistoryCompletion[]>([]);
  const [availableSessions, setAvailableSessions] = useState<AvailableProgramSessionOption[]>([]);
  const [programSessionInsights, setProgramSessionInsights] = useState<Record<string, ProgramSessionInsight>>({});
  const [loading, setLoading] = useState(true);
  const [loadingAvailableSessions, setLoadingAvailableSessions] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [duplicating, setDuplicating] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [plannerBusy, setPlannerBusy] = useState(false);
  const [activeSlot, setActiveSlot] = useState<PlannerSlot | null>(null);
  const [planView, setPlanView] = useState<ProgramPlanView>('calendar');
  const [isMobileProgramLayout, setIsMobileProgramLayout] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [shareErrorDetails, setShareErrorDetails] = useState<ProgramShareErrorDetails | null>(null);

  useEffect(() => {
    const savedView = window.localStorage.getItem('actyv-program-plan-view');
    if (savedView === 'calendar' || savedView === 'list') {
      setPlanView(savedView);
    }
  }, []);

  useEffect(() => {
    const mediaQuery = window.matchMedia('(max-width: 767px)');
    const updateViewport = () => setIsMobileProgramLayout(mediaQuery.matches);

    updateViewport();
    mediaQuery.addEventListener('change', updateViewport);

    return () => mediaQuery.removeEventListener('change', updateViewport);
  }, []);

  useEffect(() => {
    if (!activeSlot) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setActiveSlot(null);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeSlot]);

  useEffect(() => {
    window.localStorage.setItem('actyv-program-plan-view', planView);
  }, [planView]);

  const effectivePlanView: ProgramPlanView = isMobileProgramLayout ? 'list' : planView;

  useEffect(() => {
    const loadProgram = async () => {
      setLoading(true);
      setLoadingAvailableSessions(true);
      setMessage(null);
      setShareErrorDetails(null);

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
          setSessionCompletions([]);
          setAvailableSessions([]);
          setProgramSessionInsights({});
          setMessage('Connecte-toi pour consulter ce programme.');
          return;
        }

        const { data: programRow, error: programError } = await fetchOwnedProgram(id, user.id);

        if (programError) {
          console.error('Erreur chargement detail programme :', programError);
          setProgram(null);
          setProgramSessions([]);
          setSessionCompletions([]);
          setAvailableSessions([]);
          setProgramSessionInsights({});
          setMessage('Impossible de charger ce programme.');
          return;
        }

        if (!programRow) {
          setProgram(null);
          setProgramSessions([]);
          setSessionCompletions([]);
          setAvailableSessions([]);
          setProgramSessionInsights({});
          return;
        }

        setProgram(programRow as TrainingProgram);

        const [sessionsResponse, availableSessionsResponse] = await Promise.all([
          supabase
            .from('training_program_sessions')
            .select('id, program_id, session_id, session_name, sport, week_number, day_of_week, order_index, created_at')
            .eq('program_id', id)
            .order('week_number', { ascending: true })
            .order('day_of_week', { ascending: true })
            .order('order_index', { ascending: true }),
          supabase
            .from('training_sessions')
            .select('id, name, sport, description')
            .eq('user_id', user.id)
            .order('created_at', { ascending: false }),
        ]);

        const nextProgramSessions = sessionsResponse.error
          ? []
          : sortProgramSessions((sessionsResponse.data as TrainingProgramSession[]) || []);

        if (sessionsResponse.error) {
          console.error('Erreur chargement seances detail programme :', sessionsResponse.error);
        }

        const linkedSessionIds = nextProgramSessions
          .map((entry) => entry.session_id)
          .filter((sessionId): sessionId is string => Boolean(sessionId));

        setProgramSessions(nextProgramSessions);

        if (linkedSessionIds.length === 0) {
          setProgramSessionInsights({});
        } else {
          const { data: linkedSessionBlocks } = await fetchTrainingSessionBlocks(linkedSessionIds);
          const groupedBlocks = new Map<string, TrainingSessionBlockRecord[]>();

          (linkedSessionBlocks || []).forEach((block) => {
            const currentBlocks = groupedBlocks.get(block.session_id) || [];
            currentBlocks.push(block);
            groupedBlocks.set(block.session_id, currentBlocks);
          });

          const nextInsights: Record<string, ProgramSessionInsight> = {};
          linkedSessionIds.forEach((sessionId) => {
            nextInsights[sessionId] = getProgramSessionInsight(groupedBlocks.get(sessionId) || []);
          });
          setProgramSessionInsights(nextInsights);
        }

        if (linkedSessionIds.length === 0) {
          setSessionCompletions([]);
        } else {
          const { data: completionsRows, error: completionsError } = await supabase
            .from('workout_sessions_history')
            .select('id, workout_id, completed_at')
            .eq('user_id', user.id)
            .in('workout_id', linkedSessionIds)
            .order('completed_at', { ascending: false });

          if (completionsError) {
            console.error('Erreur chargement progression programme :', completionsError);
            setSessionCompletions([]);
          } else {
            setSessionCompletions((completionsRows as WorkoutHistoryCompletion[]) || []);
          }
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

  const completedSessionIds = useMemo(() => {
    const ids = new Set<string>();
    sessionCompletions.forEach((entry) => {
      if (entry.workout_id) ids.add(entry.workout_id);
    });
    return ids;
  }, [sessionCompletions]);

  const latestCompletionBySessionId = useMemo(() => {
    const entries = new Map<string, WorkoutHistoryCompletion>();
    sessionCompletions.forEach((entry) => {
      if (!entry.workout_id) return;
      if (!entries.has(entry.workout_id)) {
        entries.set(entry.workout_id, entry);
      }
    });
    return entries;
  }, [sessionCompletions]);

  const completedCount = useMemo(
    () => programSessions.filter((entry) => entry.session_id && completedSessionIds.has(entry.session_id)).length,
    [completedSessionIds, programSessions]
  );
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

  const currentWeek = useMemo(() => {
    if (!program?.start_date) return 1;

    const start = parseLocalDate(program.start_date);
    if (!start || Number.isNaN(start.getTime())) return 1;

    const now = new Date();
    const diffMs = now.getTime() - start.getTime();
    const diffDays = Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
    return Math.min(Math.max(1, Math.floor(diffDays / 7) + 1), Math.max(program.duration_weeks, 1));
  }, [program?.duration_weeks, program?.start_date]);

  const remainingSessionsCount = useMemo(() => Math.max(totalSessions - completedCount, 0), [completedCount, totalSessions]);

  const nextProgramSession = useMemo(() => {
    const unfinishedSessions = programSessions.filter(
      (entry) => !entry.session_id || !completedSessionIds.has(entry.session_id)
    );

    if (unfinishedSessions.length === 0) {
      return null;
    }

    if (!program?.start_date) {
      return unfinishedSessions[0] || null;
    }

    const today = new Date();
    const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());

    const sessionsWithDates = unfinishedSessions.map((entry) => ({
      entry,
      plannedDate: getProgramSessionPlannedDate(program.start_date, entry.week_number, entry.day_of_week),
    }));

    const upcomingSession = sessionsWithDates.find(({ plannedDate }) => {
      if (!plannedDate) return false;
      const plannedDay = new Date(plannedDate.getFullYear(), plannedDate.getMonth(), plannedDate.getDate());
      return plannedDay.getTime() >= todayStart.getTime();
    });

    if (upcomingSession) {
      return upcomingSession.entry;
    }

    return sessionsWithDates[0]?.entry || null;
  }, [completedSessionIds, program?.start_date, programSessions]);

  const nextProgramSessionInsight = useMemo(() => {
    if (!nextProgramSession?.session_id) return null;
    return programSessionInsights[nextProgramSession.session_id] || null;
  }, [nextProgramSession, programSessionInsights]);

  const nextProgramSessionDateLabel = useMemo(() => {
    if (!program?.start_date || !nextProgramSession) return null;
    const plannedDate = getProgramSessionPlannedDate(
      program.start_date,
      nextProgramSession.week_number,
      nextProgramSession.day_of_week
    );
    if (!plannedDate) return null;

    return plannedDate.toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    });
  }, [nextProgramSession, program?.start_date]);

  const displayWeeks = useMemo(() => {
    if (program?.start_date) {
      return groupProgramDaysByCalendarWeek(program.start_date, program.duration_weeks).map((week) => ({
        key: week.key,
        title: week.title,
        days: week.days.map((day) => ({
          key: day.key,
          weekNumber: day.programWeekNumber,
          dayOfWeek: day.programDayNumber,
          dayLabel: capitalizeLabel(day.dayLabel),
          shortDateLabel: day.shortDateLabel,
        })),
      }));
    }

    return weekNumbers.map((weekNumber) => ({
      key: `week-${weekNumber}`,
      title: getProgramWeekLabel(weekNumber),
      days: PROGRAM_DAY_OPTIONS.map((dayOption) => ({
        key: `${weekNumber}-${dayOption.value}`,
        weekNumber,
        dayOfWeek: dayOption.value,
        dayLabel: dayOption.label,
        shortDateLabel: null,
      })),
    }));
  }, [program?.duration_weeks, program?.start_date, weekNumbers]);

  const activeSlotSubtitle = useMemo(() => {
    if (!activeSlot) return null;

    const dayLabel = capitalizeLabel(
      formatProgramDayLabel(program?.start_date, activeSlot.weekNumber, activeSlot.dayOfWeek)
    );
    const shortDate = formatProgramPlannedShortDateLabel(
      program?.start_date,
      activeSlot.weekNumber,
      activeSlot.dayOfWeek
    );

    return shortDate ? `${dayLabel} ${shortDate}` : `${getProgramWeekLabel(activeSlot.weekNumber)} - ${dayLabel}`;
  }, [activeSlot, program?.start_date]);

  const shareUrl = useMemo(() => {
    if (!program?.invite_code || typeof window === 'undefined') return null;
    return `${window.location.origin}/programs/join/${encodeURIComponent(program.invite_code.trim())}`;
  }, [program?.invite_code]);

  const canManageSharing = useMemo(() => !program?.copied_from_program_id, [program?.copied_from_program_id]);

  const togglePlannerSlot = (weekNumber: number, dayOfWeek: number) => {
    setActiveSlot((current) =>
      current?.weekNumber === weekNumber && current?.dayOfWeek === dayOfWeek ? null : { weekNumber, dayOfWeek }
    );
  };

  const enableProgramSharing = async () => {
    if (!program || sharing) return;
    if (program.copied_from_program_id) {
      setMessage('Seul le createur original peut partager ce programme.');
      return;
    }

    setSharing(true);
    setMessage(null);
    setShareErrorDetails(null);

    try {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        if (userError) {
          console.error('Erreur chargement user partage programme :', userError);
        }
        setMessage('Connecte-toi pour partager ce programme.');
        setShareErrorDetails(
          getProgramShareErrorDetails({
            message: userError?.message || 'Utilisateur non connecte',
            code: userError?.code || null,
            details: userError?.message || null,
            hint: null,
          })
        );
        return;
      }

      const existingInviteCode = program.invite_code || null;

      for (let attempt = 0; attempt < 5; attempt += 1) {
        const inviteCode = existingInviteCode || generateProgramInviteCode();
        const payload = {
          visibility: 'shared',
          invite_code: inviteCode,
          updated_at: new Date().toISOString(),
        };
        console.log('Program sharing payload:', payload);

        const { error } = await supabase
          .from('training_programs')
          .update(payload)
          .eq('id', program.id)
          .eq('user_id', user.id);

        if (!error) {
          const refreshedProgram = await fetchOwnedProgram(program.id, user.id);
          if (refreshedProgram.data) {
            setProgram(refreshedProgram.data);
          }
          const xpResult = await awardXp({
            userId: user.id,
            source: 'program_shared',
            metadata: { target_id: program.id },
          });

          if (xpResult?.awarded) {
            queuePendingToast({ message: '+5 XP programme partage', tone: 'info' });
          } else if (xpResult?.error) {
            console.error('XP award failed', {
              payload: {
                user_id: user.id,
                event_type: 'program_shared',
                source_type: 'training_program',
                source_id: program.id,
                xp_amount: 5,
              },
              error: xpResult.error,
            });
          }

          const badgeResult = await refreshUserBadges(user.id);

          if (badgeResult.error) {
            console.error('Erreur refresh badges partage programme :', badgeResult.error);
          } else {
            badgeResult.awarded.forEach((badgeCode) => {
              const badge = getBadgeByCode(badgeCode);
              queuePendingToast({
                message: `Badge debloque : ${badge?.label || badgeCode}`,
                tone: 'celebrate',
              });
            });
          }
          queuePendingToast({ message: 'Partage active', tone: 'success' });
          return;
        }

        console.error('Share activation error', error);
        console.error('Program sharing update error:', error);
        console.error('Program sharing update error full:', JSON.stringify(error, null, 2));
        setShareErrorDetails(getProgramShareErrorDetails(error));

        if (error?.code !== '23505' || existingInviteCode) {
          setMessage(getProgramSharingErrorMessage(error));
          return;
        }
      }

      setMessage("Impossible de generer un lien de partage unique pour le moment.");
      setShareErrorDetails(
        getProgramShareErrorDetails({
          message: 'Aucun invite_code unique n a pu etre genere apres plusieurs essais.',
          code: 'invite_code_generation_failed',
          details: 'Le programme n a pas pu passer en shared apres 5 tentatives.',
          hint: 'Verifie la contrainte unique de training_programs.invite_code.',
        })
      );
    } catch (error) {
      console.error('Erreur inattendue partage programme :', error);
      setMessage("Une erreur inattendue s'est produite.");
      setShareErrorDetails(
        getProgramShareErrorDetails({
          message: error instanceof Error ? error.message : 'Erreur inattendue',
          code: null,
          details: null,
          hint: null,
        })
      );
    } finally {
      setSharing(false);
    }
  };

  const disableProgramSharing = async () => {
    if (!program || sharing) return;
    if (program.copied_from_program_id) {
      setMessage('Seul le createur original peut partager ce programme.');
      return;
    }

    setSharing(true);
    setMessage(null);
    setShareErrorDetails(null);

    try {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        if (userError) {
          console.error('Erreur chargement user fin partage programme :', userError);
        }
        setMessage('Connecte-toi pour modifier le partage de ce programme.');
        setShareErrorDetails(
          getProgramShareErrorDetails({
            message: userError?.message || 'Utilisateur non connecte',
            code: userError?.code || null,
            details: userError?.message || null,
            hint: null,
          })
        );
        return;
      }

      const { error } = await supabase
        .from('training_programs')
        .update({
          visibility: 'private',
          invite_code: null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', program.id)
        .eq('user_id', user.id);

      if (error) {
        console.error('Program sharing disable error:', error);
        console.error('Program sharing disable error full:', JSON.stringify(error, null, 2));
        setMessage("Impossible de desactiver le partage pour le moment.");
        setShareErrorDetails(getProgramShareErrorDetails(error));
        return;
      }

      const refreshedProgram = await fetchOwnedProgram(program.id, user.id);
      if (refreshedProgram.data) {
        setProgram(refreshedProgram.data);
      }
      queuePendingToast({ message: 'Partage desactive', tone: 'info' });
    } catch (error) {
      console.error('Erreur inattendue desactivation partage programme :', error);
      setMessage("Une erreur inattendue s'est produite.");
      setShareErrorDetails(
        getProgramShareErrorDetails({
          message: error instanceof Error ? error.message : 'Erreur inattendue',
          code: null,
          details: null,
          hint: null,
        })
      );
    } finally {
      setSharing(false);
    }
  };

  const copyProgramShareLink = async () => {
    if (program?.copied_from_program_id) {
      setMessage('Seul le createur original peut partager ce programme.');
      return;
    }
    if (!shareUrl) {
      setMessage("Active le partage pour obtenir un lien.");
      return;
    }

    try {
      console.log('copy click', shareUrl);
      await copyTextWithFallback(shareUrl);
      queuePendingToast({ message: 'Lien de partage copie', tone: 'success' });
    } catch (error) {
      console.error('Erreur copie lien partage programme :', error);
      setMessage("Impossible de copier le lien pour le moment.");
    }
  };

  const shareProgramLink = async () => {
    if (program?.copied_from_program_id) {
      setMessage('Seul le createur original peut partager ce programme.');
      return;
    }
    if (!shareUrl || !program) {
      setMessage("Active le partage pour obtenir un lien.");
      return;
    }

    const shareData = {
      title: `Programme Actyv : ${program.name}`,
      text: `Je te partage mon programme d'entrainement Actyv : ${program.name}. Tu peux l'ajouter a tes programmes.`,
      url: shareUrl,
    };

    try {
      console.log('share click', shareUrl);
      if (navigator.share) {
        await navigator.share(shareData);
        queuePendingToast({ message: 'Lien de partage pret', tone: 'success' });
        return;
      }

      await copyTextWithFallback(shareUrl);
      queuePendingToast({ message: 'Lien copie', tone: 'success' });
    } catch (error) {
      console.error('Erreur partage natif programme :', error);
      setMessage("Impossible de partager le lien pour le moment.");
    }
  };

  const handleDuplicateProgram = async () => {
    if (!program || duplicating) return;

    setDuplicating(true);
    setMessage(null);

    try {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        if (userError) {
          console.error('Erreur chargement user duplication programme :', userError);
        }
        setMessage('Connecte-toi pour dupliquer ce programme.');
        return;
      }

      const programPayload = {
        user_id: user.id,
        name: `Copie de ${program.name}`,
        description: program.description,
        sport: program.sport,
        duration_weeks: program.duration_weeks,
        visibility: 'private' as const,
        copied_from_program_id: program.copied_from_program_id || program.id,
        start_date: program.start_date,
      };

      const { data: duplicatedProgram, error: duplicatedProgramError } = await supabase
        .from('training_programs')
        .insert(programPayload)
        .select('id')
        .single();

      if (duplicatedProgramError || !duplicatedProgram) {
        console.error('Erreur duplication programme :', duplicatedProgramError);
        setMessage("Impossible de dupliquer le programme pour le moment.");
        return;
      }

      if (programSessions.length > 0) {
        const duplicatedSessionsPayload = programSessions.map((entry) => ({
          program_id: duplicatedProgram.id,
          session_id: entry.session_id,
          session_name: entry.session_name,
          sport: entry.sport,
          week_number: entry.week_number,
          day_of_week: entry.day_of_week,
          order_index: entry.order_index,
        }));

        const { error: duplicatedSessionsError } = await supabase
          .from('training_program_sessions')
          .insert(duplicatedSessionsPayload);

        if (duplicatedSessionsError) {
          console.error('Erreur duplication seances programme :', duplicatedSessionsError);
          setMessage("Le programme a ete copie, mais pas ses seances planifiees.");
          router.push(`/programs/${duplicatedProgram.id}`);
          return;
        }
      }

      queuePendingToast({ message: 'Programme duplique', tone: 'success' });
      router.push(`/programs/${duplicatedProgram.id}`);
    } catch (error) {
      console.error('Erreur inattendue duplication programme :', error);
      setMessage("Une erreur inattendue s'est produite.");
    } finally {
      setDuplicating(false);
    }
  };

  const handleDeleteProgram = async () => {
    if (!program || deleting) return;

    const confirmed = window.confirm(
      'Supprimer ce programme ? Les seances associees resteront disponibles dans tes seances.'
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

  const persistProgramSessionOrdering = async (nextEntries: TrainingProgramSession[]) => {
    const updates = await Promise.all(
      nextEntries.map((entry) =>
        supabase
          .from('training_program_sessions')
          .update({
            week_number: entry.week_number,
            day_of_week: entry.day_of_week,
            order_index: entry.order_index,
          })
          .eq('id', entry.id)
      )
    );

    const failedUpdate = updates.find((result) => result.error);
    if (failedUpdate?.error) {
      console.error('Erreur reorganisation seances programme :', failedUpdate.error);
      return failedUpdate.error;
    }

    return null;
  };

  const handleMoveProgramSession = async (programSessionId: string, direction: 'up' | 'down') => {
    if (plannerBusy) return;

    const currentEntry = programSessions.find((entry) => entry.id === programSessionId);
    if (!currentEntry) return;

    const slotEntries = sortProgramSessions(
      programSessions.filter(
        (entry) =>
          entry.week_number === currentEntry.week_number && entry.day_of_week === currentEntry.day_of_week
      )
    );
    const currentIndex = slotEntries.findIndex((entry) => entry.id === programSessionId);
    const swapIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;

    if (currentIndex < 0 || swapIndex < 0 || swapIndex >= slotEntries.length) {
      return;
    }

    const reorderedSlotEntries = [...slotEntries];
    const [movedEntry] = reorderedSlotEntries.splice(currentIndex, 1);
    reorderedSlotEntries.splice(swapIndex, 0, movedEntry);

    const normalizedSlotEntries = reorderedSlotEntries.map((entry, index) => ({
      ...entry,
      order_index: index + 1,
    }));

    const otherEntries = programSessions.filter(
      (entry) =>
        !(entry.week_number === currentEntry.week_number && entry.day_of_week === currentEntry.day_of_week)
    );
    const nextEntries = sortProgramSessions([...otherEntries, ...normalizedSlotEntries]);

    setPlannerBusy(true);
    setMessage(null);

    try {
      const error = await persistProgramSessionOrdering(nextEntries);
      if (error) {
        setMessage("Impossible de reorganiser les seances du programme pour le moment.");
        return;
      }

      setProgramSessions(nextEntries);
    } catch (error) {
      console.error('Erreur inattendue reorganisation seances programme :', error);
      setMessage("Une erreur inattendue s'est produite.");
    } finally {
      setPlannerBusy(false);
    }
  };

  const handleChangeProgramSessionSlot = async (
    programSessionId: string,
    field: 'week' | 'day',
    rawValue: number
  ) => {
    if (plannerBusy) return;

    const currentEntry = programSessions.find((entry) => entry.id === programSessionId);
    if (!currentEntry) return;

    const nextWeekNumber =
      field === 'week'
        ? Math.min(Math.max(Math.trunc(rawValue), 1), Math.max(program?.duration_weeks || 1, 1))
        : currentEntry.week_number;
    const nextDayOfWeek =
      field === 'day' ? Math.min(Math.max(Math.trunc(rawValue), 1), 7) : currentEntry.day_of_week;

    if (nextWeekNumber === currentEntry.week_number && nextDayOfWeek === currentEntry.day_of_week) {
      return;
    }

    const nextEntries = buildNormalizedProgramSessions(
      programSessions.map((entry) =>
        entry.id === programSessionId
          ? {
              ...entry,
              week_number: nextWeekNumber,
              day_of_week: nextDayOfWeek,
              order_index: 999,
            }
          : entry
      )
    );

    setPlannerBusy(true);
    setMessage(null);

    try {
      const error = await persistProgramSessionOrdering(nextEntries);
      if (error) {
        setMessage("Impossible de deplacer cette seance dans le programme pour le moment.");
        return;
      }

      setProgramSessions(nextEntries);
    } catch (error) {
      console.error('Erreur inattendue deplacement seance programme :', error);
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
                <button
                  type="button"
                  className="button ghost"
                  onClick={handleDuplicateProgram}
                  disabled={duplicating}
                  aria-busy={duplicating}
                >
                  {duplicating ? 'Duplication...' : 'Dupliquer le programme'}
                </button>
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

            <article className="card session-form-card stack program-next-session-card">
              <div className="session-blocks-header">
                <div>
                  <span className="section-kicker">Prochaine seance</span>
                  <h2>
                    {totalSessions === 0
                      ? 'Ton programme est pret a etre construit'
                      : nextProgramSession
                        ? nextProgramSession.session_name
                        : 'Programme termine'}
                  </h2>
                </div>
                <span className={`session-progress-pill ${!nextProgramSession && totalSessions > 0 ? 'session-progress-pill--done' : ''}`}>
                  {totalSessions === 0
                    ? 'A planifier'
                    : nextProgramSession
                      ? 'A faire'
                      : '100% complete'}
                </span>
              </div>

              {totalSessions === 0 ? (
                <div className="program-next-session-card__empty">
                  <strong>Ajoute des seances pour commencer ton programme.</strong>
                  <p>Une fois ton planning rempli, Actyv mettra en avant la prochaine seance a lancer.</p>
                </div>
              ) : !nextProgramSession ? (
                <div className="program-next-session-card__empty">
                  <strong>Programme termine 🎉</strong>
                  <p>
                    {completedCount} seance{completedCount > 1 ? 's' : ''} completee{completedCount > 1 ? 's' : ''} sur {totalSessions}.
                  </p>
                </div>
              ) : (
                <>
                  <div className="program-next-session-card__grid">
                    <div className="program-next-session-card__hero">
                      <div className={getSportBadgeClassName(nextProgramSession.sport || program.sport, 'badge', 'Sport')}>
                        {formatSportBadgeLabel(nextProgramSession.sport || program.sport, 'Sport')}
                      </div>
                      <div className="program-next-session-card__copy">
                        <strong>{nextProgramSession.session_name}</strong>
                        <p>
                          {getProgramWeekLabel(nextProgramSession.week_number)} •{' '}
                          {capitalizeLabel(
                            formatProgramDayLabel(
                              program.start_date,
                              nextProgramSession.week_number,
                              nextProgramSession.day_of_week
                            )
                          )}
                        </p>
                      </div>
                    </div>

                    <div className="program-next-session-card__stats">
                      <div>
                        <span>Date</span>
                        <strong>{nextProgramSessionDateLabel || 'Ordre du programme'}</strong>
                      </div>
                      <div>
                        <span>Blocs</span>
                        <strong>{nextProgramSessionInsight?.blockCount || 0}</strong>
                      </div>
                      <div>
                        <span>Duree estimee</span>
                        <strong>{formatDurationCompact(nextProgramSessionInsight?.estimatedDurationSeconds) || '—'}</strong>
                      </div>
                      <div>
                        <span>Restantes</span>
                        <strong>{remainingSessionsCount}</strong>
                      </div>
                    </div>
                  </div>

                  <div className="program-next-session-card__footer">
                    <div className="program-next-session-card__meta">
                      <span>Progression {progress}%</span>
                      <span>Semaine {currentWeek}</span>
                      <span>
                        {remainingSessionsCount} seance{remainingSessionsCount > 1 ? 's' : ''} restante
                        {remainingSessionsCount > 1 ? 's' : ''}
                      </span>
                    </div>
                    <div className="session-summary-actions">
                      {nextProgramSession.session_id ? (
                        <>
                          <Link
                            href={`/sessions/${nextProgramSession.session_id}/live?programSessionId=${nextProgramSession.id}&programId=${program.id}`}
                            className="button primary"
                          >
                            Lancer
                          </Link>
                          <Link href={`/sessions/${nextProgramSession.session_id}`} className="button ghost">
                            Ouvrir la seance
                          </Link>
                        </>
                      ) : (
                        <span className="muted">Cette seance n est pas encore liee a une seance Actyv.</span>
                      )}
                    </div>
                  </div>
                </>
              )}
            </article>

            <article className="card session-form-card stack">
              <div className="session-blocks-header">
                <div>
                  <span className="section-kicker">Progression</span>
                  <h2>Resume du programme</h2>
                </div>
                <span className="session-progress-pill">{formatProgramVisibilityLabel(program.visibility)}</span>
              </div>

              <div className="program-progress-track" aria-hidden="true">
                <span className="program-progress-track__fill" style={{ width: `${progress}%` }} />
              </div>

              <div className="session-detail-meta">
                <div className="session-meta-card">
                  <span>Seances prevues</span>
                  <strong>{totalSessions}</strong>
                </div>
                <div className="session-meta-card">
                  <span>Seances realisees</span>
                  <strong>{completedCount}</strong>
                </div>
                <div className="session-meta-card">
                  <span>Progression</span>
                  <strong>{progress}%</strong>
                </div>
                <div className="session-meta-card">
                  <span>Semaine actuelle</span>
                  <strong>
                    Semaine {currentWeek} / {program.duration_weeks}
                  </strong>
                </div>
                <div className="session-meta-card">
                  <span>Prochaine seance</span>
                  <strong>{nextProgramSession?.session_name || 'Toutes les seances sont realisees'}</strong>
                </div>
                <div className="session-meta-card">
                  <span>Date de debut</span>
                  <strong>{formatProgramDate(program.start_date)}</strong>
                </div>
                <div className="session-meta-card">
                  <span>Fin estimee</span>
                  <strong>{formatProgramEndDate(program.start_date, program.duration_weeks)}</strong>
                </div>
              </div>

              <div className="program-summary-note">
                <strong>Progression actuelle</strong>
                <p>
                  {totalSessions === 0
                    ? 'Ajoute des seances pour suivre ta progression.'
                    : `${completedCount} seance${completedCount > 1 ? 's' : ''} realisee${completedCount > 1 ? 's' : ''} sur ${totalSessions}.`}
                </p>
                {!program.start_date ? (
                  <p>Ajoute une date de debut pour afficher les dates dans le calendrier.</p>
                ) : null}
              </div>
            </article>

            {canManageSharing ? (
              <article className="card session-form-card stack">
                <div className="session-blocks-header">
                  <div>
                    <span className="section-kicker">Partage</span>
                    <h2>Partager le programme</h2>
                  </div>
                  <span className={`session-progress-pill ${program.visibility === 'shared' ? 'session-progress-pill--done' : ''}`}>
                    {program.visibility === 'shared' ? 'Partage actif' : 'Programme prive'}
                  </span>
                </div>

                <p className="muted">
                  {program.visibility === 'shared'
                    ? 'Ce programme peut etre consulte puis ajoute comme copie via son lien de partage.'
                    : 'Active le partage pour generer un lien public et permettre a d autres utilisateurs de copier ce programme.'}
                </p>

                {program.visibility === 'shared' && shareUrl ? (
                  <div className="program-share-link">
                    <strong>Lien de partage</strong>
                    <p>{shareUrl}</p>
                  </div>
                ) : null}

                {shareErrorDetails ? (
                  <div className="form-feedback form-feedback--error">
                    <strong>Erreur de partage</strong>
                    <div className="stack stack--xs">
                      <span>message: {shareErrorDetails.message || '-'}</span>
                      <span>code: {shareErrorDetails.code || '-'}</span>
                      <span>details: {shareErrorDetails.details || '-'}</span>
                      <span>hint: {shareErrorDetails.hint || '-'}</span>
                    </div>
                  </div>
                ) : null}

                <div className="session-summary-actions">
                  {program.visibility === 'shared' ? (
                    <>
                      <button
                        type="button"
                        className="button primary"
                        onClick={shareProgramLink}
                        disabled={sharing || !shareUrl}
                      >
                        Partager
                      </button>
                      <button
                        type="button"
                        className="button ghost"
                        onClick={copyProgramShareLink}
                        disabled={sharing || !shareUrl}
                      >
                        Copier le lien
                      </button>
                      <button
                        type="button"
                        className="button ghost"
                        onClick={disableProgramSharing}
                        disabled={sharing}
                      >
                        {sharing ? 'Mise a jour...' : 'Desactiver le partage'}
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      className="button primary"
                      onClick={enableProgramSharing}
                      disabled={sharing}
                    >
                      {sharing ? 'Activation...' : 'Activer le partage'}
                    </button>
                  )}
                </div>
              </article>
            ) : (
              <article className="card session-form-card stack">
                <div className="session-blocks-header">
                  <div>
                    <span className="section-kicker">Partage</span>
                    <h2>Programme ajoute depuis un partage</h2>
                  </div>
                  <span className="session-progress-pill">Copie privee</span>
                </div>
                <p className="muted">
                  Cette copie reste privee. Seul le createur original peut activer ou desactiver le partage.
                </p>
              </article>
            )}

            <article className="card session-form-card stack">
              <div className="session-blocks-header">
                <div>
                  <span className="section-kicker">Plan du programme</span>
                  <h2>{effectivePlanView === 'calendar' ? 'Calendrier des semaines' : 'Liste des seances'}</h2>
                </div>
                {isMobileProgramLayout ? (
                  <div className="program-view-toggle program-view-toggle--mobile-note" aria-live="polite">
                    <span className="program-view-toggle__mobile-label">Vue liste active sur mobile</span>
                  </div>
                ) : (
                  <div className="program-view-toggle" role="tablist" aria-label="Changer la vue du programme">
                    <button
                      type="button"
                      className={`program-view-toggle__button ${planView === 'calendar' ? 'is-active' : ''}`}
                      onClick={() => setPlanView('calendar')}
                      aria-pressed={planView === 'calendar'}
                    >
                      Vue calendrier
                    </button>
                    <button
                      type="button"
                      className={`program-view-toggle__button ${planView === 'list' ? 'is-active' : ''}`}
                      onClick={() => setPlanView('list')}
                      aria-pressed={planView === 'list'}
                    >
                      Vue liste
                    </button>
                  </div>
                )}
              </div>

              {programSessions.length === 0 ? (
                <div className="challenge-state challenge-state--compact">
                  <p>Ajoute des seances pour construire ton calendrier.</p>
                </div>
              ) : null}

              <div className="program-plan-list">
                {displayWeeks.map((displayWeek) => {
                  const displayWeekEntries = displayWeek.days.flatMap((day) =>
                    sortProgramSessions(plannedSessionsBySlot.get(`${day.weekNumber}-${day.dayOfWeek}`) || []).map((entry) => ({
                      entry,
                      day,
                    }))
                  );
                  const firstDisplayDay = displayWeek.days[0] || null;

                  return (
                    <section key={displayWeek.key} className="program-plan-week">
                      <div className="program-plan-week__header">
                        <div>
                          <span className="section-kicker">Semaine</span>
                          <h3>{displayWeek.title}</h3>
                        </div>
                      </div>

                      {effectivePlanView === 'calendar' ? (
                        <div
                          className="program-plan-days program-plan-days--calendar"
                          style={
                            program.start_date
                              ? { gridTemplateColumns: `repeat(${Math.max(displayWeek.days.length, 1)}, minmax(0, 1fr))` }
                              : undefined
                          }
                        >
                          {displayWeek.days.map((day) => {
                            const slotKey = `${day.weekNumber}-${day.dayOfWeek}`;
                            const dayEntries = plannedSessionsBySlot.get(slotKey) || [];
                            return (
                              <article key={slotKey} className="program-plan-day program-plan-day--calendar">
                                <div className="program-plan-day__header">
                                  <div className="program-plan-day__label">
                                    <strong>{day.dayLabel}</strong>
                                    <small>{day.shortDateLabel || `Jour ${day.dayOfWeek}`}</small>
                                  </div>

                                  <button
                                    type="button"
                                    className="button ghost"
                                    onClick={() => togglePlannerSlot(day.weekNumber, day.dayOfWeek)}
                                    disabled={plannerBusy}
                                  >
                                    Ajouter
                                  </button>
                                </div>

                                {dayEntries.length === 0 ? (
                                  <p className="muted">Repos</p>
                                ) : (
                                  <div className="program-plan-day__entries">
                                    {dayEntries.map((entry) => {
                                      const completed =
                                        Boolean(entry.session_id) && completedSessionIds.has(entry.session_id);
                                      const completion = entry.session_id
                                        ? latestCompletionBySessionId.get(entry.session_id)
                                        : null;

                                      return (
                                        <article
                                          key={entry.id}
                                          className={`session-block-card program-session-card program-session-card--calendar${
                                            completed ? ' session-block-card--completed' : ''
                                          }`}
                                          title={entry.session_name}
                                        >
                                          <div className="session-block-card__top">
                                            <div className="session-block-check__label">
                                              <strong className="program-session-card__title">{entry.session_name}</strong>
                                              <small>
                                                {entry.sport || formatSportBadgeLabel(program.sport, 'Sport')}
                                              </small>
                                            </div>
                                            <span
                                              className={`program-status ${
                                                completed ? 'program-status--completed' : 'program-status--todo'
                                              }`}
                                            >
                                              {completed ? `\u2713 Realisee` : 'A faire'}
                                            </span>
                                          </div>

                                          <div className="session-card__meta program-session-card__meta--calendar">
                                            {completion?.completed_at ? (
                                              <span>{formatRelativeCompletionDate(completion.completed_at)}</span>
                                            ) : (
                                              <span>A faire</span>
                                            )}
                                            <span>#{entry.order_index}</span>
                                          </div>

                                          <div className="program-session-controls">
                                            <div className="program-session-controls__group">
                                              <label>
                                                <span>Sem.</span>
                                                <select
                                                  value={entry.week_number}
                                                  onChange={(event) =>
                                                    handleChangeProgramSessionSlot(
                                                      entry.id,
                                                      'week',
                                                      Number(event.target.value)
                                                    )
                                                  }
                                                  disabled={plannerBusy}
                                                >
                                                  {weekNumbers.map((weekNumberOption) => (
                                                    <option key={weekNumberOption} value={weekNumberOption}>
                                                      S{weekNumberOption}
                                                    </option>
                                                  ))}
                                                </select>
                                              </label>

                                              <label>
                                                <span>Jour</span>
                                                <select
                                                  value={entry.day_of_week}
                                                  onChange={(event) =>
                                                    handleChangeProgramSessionSlot(
                                                      entry.id,
                                                      'day',
                                                      Number(event.target.value)
                                                    )
                                                  }
                                                  disabled={plannerBusy}
                                                >
                                                  {PROGRAM_DAY_OPTIONS.map((option) => (
                                                    <option key={option.value} value={option.value}>
                                                      {capitalizeLabel(
                                                        formatProgramDayLabel(
                                                          program.start_date,
                                                          entry.week_number,
                                                          option.value
                                                        )
                                                      ).slice(0, 3)}
                                                    </option>
                                                  ))}
                                                </select>
                                              </label>
                                            </div>

                                            <div className="program-session-controls__group program-session-controls__group--actions">
                                              <button
                                                type="button"
                                                className="button ghost program-action-button"
                                                onClick={() => handleMoveProgramSession(entry.id, 'up')}
                                                disabled={plannerBusy || entry.order_index <= 1}
                                                title="Monter"
                                                aria-label="Monter"
                                              >
                                                {'\u2191'}
                                              </button>
                                              <button
                                                type="button"
                                                className="button ghost program-action-button"
                                                onClick={() => handleMoveProgramSession(entry.id, 'down')}
                                                disabled={plannerBusy || entry.order_index >= dayEntries.length}
                                                title="Descendre"
                                                aria-label="Descendre"
                                              >
                                                {'\u2193'}
                                              </button>
                                            </div>
                                          </div>

                                          <div className="session-hero-actions program-session-actions--calendar">
                                            {entry.session_id ? (
                                              <>
                                                <Link
                                                  href={`/sessions/${entry.session_id}/live?programSessionId=${entry.id}&programId=${program.id}`}
                                                  className="button primary program-action-button"
                                                  title="Lancer la seance"
                                                  aria-label="Lancer la seance"
                                                >
                                                  {'\u25B6'}
                                                </Link>
                                                <Link
                                                  href={`/sessions/${entry.session_id}`}
                                                  className="button ghost program-action-button"
                                                  title="Ouvrir la seance"
                                                  aria-label="Ouvrir la seance"
                                                >
                                                  {'\u2197'}
                                                </Link>
                                              </>
                                            ) : (
                                              <span className="muted">Seance non liee pour le moment.</span>
                                            )}

                                            <button
                                              type="button"
                                              className="button ghost program-action-button"
                                              onClick={() => handleRemoveProgramSession(entry.id)}
                                              disabled={plannerBusy}
                                              title="Retirer du programme"
                                              aria-label="Retirer du programme"
                                            >
                                              {'\u00D7'}
                                            </button>
                                          </div>
                                        </article>
                                      );
                                    })}
                                  </div>
                                )}
                              </article>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="program-list-view">
                          {displayWeekEntries.length === 0 ? (
                            <div className="program-list-empty">
                              <p className="muted">Aucune seance prevue cette semaine.</p>
                              {firstDisplayDay ? (
                                <button
                                  type="button"
                                  className="button ghost"
                                  onClick={() => togglePlannerSlot(firstDisplayDay.weekNumber, firstDisplayDay.dayOfWeek)}
                                  disabled={plannerBusy}
                                >
                                  Ajouter une seance
                                </button>
                              ) : null}
                            </div>
                          ) : (
                            displayWeekEntries.map(({ entry, day }) => {
                              const completed = Boolean(entry.session_id) && completedSessionIds.has(entry.session_id);
                              const completion = entry.session_id
                                ? latestCompletionBySessionId.get(entry.session_id)
                                : null;

                              return (
                                <article
                                  key={entry.id}
                                  className={`program-list-item ${completed ? 'program-list-item--completed' : ''}`}
                                >
                                  <div className="program-list-item__main">
                                    <div className="program-list-item__heading">
                                      <strong>
                                        {day.dayLabel}
                                        {day.shortDateLabel ? ` ${day.shortDateLabel}` : ''}
                                      </strong>
                                      <span aria-hidden="true">•</span>
                                      <span className="program-list-item__title">{entry.session_name}</span>
                                    </div>
                                    <div className="program-list-item__meta">
                                      <span>{entry.sport || formatSportBadgeLabel(program.sport, 'Sport')}</span>
                                      <span
                                        className={`program-status ${
                                          completed ? 'program-status--completed' : 'program-status--todo'
                                        }`}
                                      >
                                        {completed ? `\u2713 Realisee` : 'A faire'}
                                      </span>
                                      {completion?.completed_at ? (
                                        <span>{formatRelativeCompletionDate(completion.completed_at)}</span>
                                      ) : null}
                                    </div>
                                  </div>

                                  <div className="program-list-item__actions">
                                    {entry.session_id ? (
                                      <>
                                        <Link
                                          href={`/sessions/${entry.session_id}/live?programSessionId=${entry.id}&programId=${program.id}`}
                                          className="button primary program-action-button"
                                          title="Lancer la seance"
                                          aria-label="Lancer la seance"
                                        >
                                          {'\u25B6'}
                                        </Link>
                                        <Link
                                          href={`/sessions/${entry.session_id}`}
                                          className="button ghost program-action-button"
                                          title="Ouvrir la seance"
                                          aria-label="Ouvrir la seance"
                                        >
                                          {'\u2197'}
                                        </Link>
                                      </>
                                    ) : null}
                                    <button
                                      type="button"
                                      className="button ghost program-action-button"
                                      onClick={() => handleRemoveProgramSession(entry.id)}
                                      disabled={plannerBusy}
                                      title="Retirer du programme"
                                      aria-label="Retirer du programme"
                                    >
                                      {'\u00D7'}
                                    </button>
                                  </div>
                                </article>
                              );
                            })
                          )}
                        </div>
                      )}
                    </section>
                  );
                })}
              </div>
            </article>

            {activeSlot ? (
              <div className="program-modal-backdrop" onClick={() => setActiveSlot(null)} role="presentation">
                <div
                  className="program-modal"
                  role="dialog"
                  aria-modal="true"
                  aria-labelledby="program-session-modal-title"
                  onClick={(event) => event.stopPropagation()}
                >
                  <div className="program-modal__header">
                    <div className="program-modal__copy">
                      <strong id="program-session-modal-title">Ajouter une seance</strong>
                      <small>
                        {activeSlotSubtitle || `${getProgramWeekLabel(activeSlot.weekNumber)} - Jour ${activeSlot.dayOfWeek}`}
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

                  <div className="program-modal__body">
                    {loadingAvailableSessions ? (
                      <p className="muted">Chargement de tes seances...</p>
                    ) : availableSessions.length === 0 ? (
                      <div className="challenge-state challenge-state--compact">
                        <p>Aucune seance disponible.</p>
                        <div className="session-empty-actions">
                          <Link
                            href={`/sessions/new?programId=${program?.id || ''}&week=${activeSlot.weekNumber}&day=${activeSlot.dayOfWeek}`}
                            className="button primary"
                          >
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
                                handleAddSessionToSlot(activeSlot.weekNumber, activeSlot.dayOfWeek, sessionOption)
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

                  <div className="program-modal__footer">
                    <Link
                      href={`/sessions/new?programId=${program?.id || ''}&week=${activeSlot.weekNumber}&day=${activeSlot.dayOfWeek}`}
                      className="button ghost"
                    >
                      Creer une nouvelle seance
                    </Link>
                  </div>
                </div>
              </div>
            ) : null}
          </>
        )}
      </section>
    </AppShell>
  );
}

