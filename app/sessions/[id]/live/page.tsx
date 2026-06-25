'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { AppShell } from '@/components/AppShell';
import { BadgeArtwork } from '@/components/badge-artwork';
import {
  LiveBlockCard,
  LiveBlockPreviewRail,
  LiveControls,
  LiveSequenceList,
  RestTimerOverlay,
  SessionLiveHeader,
} from '@/components/session-live-ui';
import { queuePendingToast } from '@/components/ToastProvider';
import { formatSportBadgeLabel, getSportBadgeClassName } from '@/components/sport-badge';
import {
  formatEstimatedWorkoutCalories,
  formatSessionVolumeKg,
  getEstimatedWorkoutCalories,
  getSessionBlockTypeLabel,
  getSessionBlockVolumeKg,
  getSessionEstimatedDuration,
  normalizeSessionSetsCount,
  type SessionBlockType,
} from '@/lib/session-blocks';
import { awardXp, getBadgeByCode, getUserTotalXp, refreshUserBadges, XP_RULES } from '@/lib/gamification';
import { formatPercent } from '@/lib/display-format';
import { getActyvLevel, type ActyvLevelProgress } from '@/lib/levels';
import { supabase } from '@/lib/supabase';
import { fetchTrainingSessionBlocks, TrainingSessionBlockRecord } from '@/lib/training-session-blocks-db';
import { WorkoutCompletionMetadata, WorkoutSetPerformance } from '@/lib/workout-history';

type TrainingSession = {
  id: string;
  user_id: string;
  name: string;
  sport: string | null;
  description: string | null;
  visibility: 'private' | 'public' | null;
  created_at: string | null;
};

type ActualPerformanceDraft = {
  actualReps: number | null;
  actualChargeKg: number | null;
};

type LivePerformanceLineDraft = {
  id: string;
  setsCount: number;
  targetValue: number | null;
  chargeKg: number | null;
  note: string;
};

type LivePerformanceDraft = {
  lines: LivePerformanceLineDraft[];
  freeText: string;
};

type LiveState = {
  currentIndex: number;
  blocks: TrainingSessionBlockRecord[];
  completedBlockIds: string[];
  skippedBlockIds: string[];
  completedSetsByBlockId: Record<string, number>;
  actualPerformanceDraftsByBlockId: Record<string, ActualPerformanceDraft>;
  actualPerformanceCarryForwardByBlockId: Record<string, ActualPerformanceDraft>;
  performanceDraftsByBlockId: Record<string, LivePerformanceDraft>;
  setPerformances: WorkoutSetPerformance[];
  finishReviewOpen: boolean;
  restAfterBlockId: string | null;
  restResumeIndex: number | null;
  restSecondsLeft: number;
  exerciseBlockId: string | null;
  exerciseSecondsLeft: number;
  awaitingExerciseCompletion: boolean;
  elapsedSeconds: number;
  isTimerPaused: boolean;
  runKey: string;
  historySaved: boolean;
  startedSeriesKey: string | null;
};

type NewPersonalRecord = {
  exerciseName: string;
  metric: 'reps' | 'charge' | 'volume' | 'duration';
  previousValue: number;
  value: number;
};

const DEFAULT_REST_SECONDS = 60;

function formatElapsedDuration(totalSeconds: number) {
  const normalizedSeconds = Math.max(0, Math.trunc(totalSeconds));
  const minutes = Math.floor(normalizedSeconds / 60);
  const seconds = normalizedSeconds % 60;

  return `${minutes} min ${seconds.toString().padStart(2, '0')} sec`;
}

function formatTimerClock(totalSeconds: number) {
  const normalizedSeconds = Math.max(0, Math.trunc(Number(totalSeconds) || 0));
  const minutes = Math.floor(normalizedSeconds / 60);
  const seconds = normalizedSeconds % 60;

  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

function createLiveRunKey() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function triggerHaptic(pattern: number | number[]) {
  try {
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      navigator.vibrate(pattern);
    }
  } catch {
    // ignore
  }
}

function formatPersonalRecordValue(metric: NewPersonalRecord['metric'], value: number) {
  if (!Number.isFinite(value) || value <= 0) {
    return '-';
  }

  if (metric === 'reps') {
    return `${value} reps`;
  }

  if (metric === 'charge') {
    return `${value} kg`;
  }

  if (metric === 'volume') {
    return formatSessionVolumeKg(value) || `${value} kg`;
  }

  return formatElapsedDuration(value);
}

function normalizePositiveInteger(value: unknown, fallback = 0) {
  const normalizedValue = Number(value);
  if (!Number.isFinite(normalizedValue)) {
    return fallback;
  }

  return Math.max(Math.trunc(normalizedValue), fallback);
}

function normalizeNonNegativeNumber(value: unknown, fallback = 0) {
  const normalizedValue = Number(value);
  if (!Number.isFinite(normalizedValue)) {
    return fallback;
  }

  return Math.max(normalizedValue, fallback);
}

function safeTrimText(value: string | null | undefined) {
  return typeof value === 'string' ? value.trim() : '';
}

function getPlannedReps(block: TrainingSessionBlockRecord | null) {
  if (!block || block.block_type !== 'reps') return null;
  const normalizedValue = normalizePositiveInteger(block.target_value, 0);
  return normalizedValue > 0 ? normalizedValue : null;
}

function getPlannedChargeKg(block: TrainingSessionBlockRecord | null) {
  if (!block) return null;
  const normalizedValue = normalizeNonNegativeNumber(block.charge_kg, 0);
  return normalizedValue > 0 ? normalizedValue : null;
}

function getPerformanceDraftFromBlock(block: TrainingSessionBlockRecord | null): ActualPerformanceDraft {
  return {
    actualReps: getPlannedReps(block),
    actualChargeKg: getPlannedChargeKg(block),
  };
}

function createLivePerformanceLineDraftFromBlock(
  block: TrainingSessionBlockRecord | null,
  setsCount?: number
): LivePerformanceLineDraft {
  return {
    id: `${block?.id || 'block'}-line-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    setsCount: Math.max(Math.trunc(Number(setsCount ?? block?.sets_count ?? 1) || 1), 1),
    targetValue:
      block?.block_type === 'free'
        ? null
        : block?.block_type === 'reps'
          ? getPlannedReps(block)
          : Number.isFinite(Number(block?.target_value)) && Number(block?.target_value) > 0
            ? Number(block?.target_value)
            : null,
    chargeKg: getPlannedChargeKg(block),
    note: '',
  };
}

function createDefaultLivePerformanceDraft(block: TrainingSessionBlockRecord | null): LivePerformanceDraft {
  return {
    lines: [createLivePerformanceLineDraftFromBlock(block)],
    freeText: '',
  };
}

function normalizeLivePerformanceLineDraft(
  line: Partial<LivePerformanceLineDraft> | null | undefined,
  block: TrainingSessionBlockRecord | null
): LivePerformanceLineDraft {
  const fallback = createLivePerformanceLineDraftFromBlock(block);

  return {
    id:
      typeof line?.id === 'string' && line.id.trim().length > 0
        ? line.id
        : fallback.id,
    setsCount: Math.max(
      Math.trunc(Number(line?.setsCount ?? fallback.setsCount) || fallback.setsCount),
      1
    ),
    targetValue:
      line?.targetValue == null
        ? fallback.targetValue
        : Number.isFinite(Number(line.targetValue)) && Number(line.targetValue) >= 0
          ? Number(line.targetValue)
          : fallback.targetValue,
    chargeKg:
      line?.chargeKg == null
        ? fallback.chargeKg
        : Number.isFinite(Number(line.chargeKg)) && Number(line.chargeKg) >= 0
          ? Number(line.chargeKg)
          : fallback.chargeKg,
    note: typeof line?.note === 'string' ? line.note : fallback.note,
  };
}

function normalizeLivePerformanceDraft(
  draft: Partial<LivePerformanceDraft> | null | undefined,
  block: TrainingSessionBlockRecord | null
): LivePerformanceDraft {
  const fallback = createDefaultLivePerformanceDraft(block);
  const nextLines = Array.isArray(draft?.lines) && draft.lines.length > 0
    ? draft.lines.map((line) => normalizeLivePerformanceLineDraft(line, block))
    : fallback.lines;

  return {
    lines: nextLines.length > 0 ? nextLines : fallback.lines,
    freeText: typeof draft?.freeText === 'string' ? draft.freeText : fallback.freeText,
  };
}

function getLivePerformanceDraftTotalSets(draft: LivePerformanceDraft | null | undefined, block: TrainingSessionBlockRecord | null) {
  if (!draft || draft.lines.length === 0) {
    return normalizeSessionSetsCount(block?.sets_count ?? 1);
  }

  return draft.lines.reduce((total, line) => total + Math.max(Math.trunc(Number(line.setsCount) || 0), 1), 0);
}

function getLivePerformanceDraftVolumeKg(
  draft: LivePerformanceDraft | null | undefined,
  block: TrainingSessionBlockRecord | null
) {
  const normalizedLines = getLivePerformanceDraftLines(draft, block);
  const blockType = block?.block_type;

  return normalizedLines.reduce((total, line) => {
    const setsCount = Math.max(Math.trunc(Number(line.setsCount) || 0), 1);
    const targetValue =
      line.targetValue != null
        ? Number(line.targetValue)
        : blockType === 'reps'
          ? Number(block?.target_value ?? 0)
          : Number(block?.target_value ?? 0);
    const chargeKg =
      line.chargeKg != null
        ? Number(line.chargeKg)
        : blockType === 'reps'
          ? Number(block?.charge_kg ?? 0)
          : Number(block?.charge_kg ?? 0);

    if (!Number.isFinite(targetValue) || !Number.isFinite(chargeKg) || targetValue <= 0 || chargeKg <= 0) {
      return total;
    }

    return total + setsCount * targetValue * chargeKg;
  }, 0);
}

function getLivePerformanceDraftLines(
  draft: LivePerformanceDraft | null | undefined,
  block: TrainingSessionBlockRecord | null
) {
  const normalizedDraft = normalizeLivePerformanceDraft(draft, block);
  return normalizedDraft.lines;
}

function getLivePerformanceLineIndexByCompletedSets(
  lines: LivePerformanceLineDraft[],
  completedSets: number
) {
  const normalizedCompletedSets = Math.max(Math.trunc(Number(completedSets) || 0), 0);
  let consumed = 0;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const lineSets = Math.max(Math.trunc(Number(line.setsCount) || 0), 1);
    const nextConsumed = consumed + lineSets;

    if (normalizedCompletedSets < nextConsumed) {
      return index;
    }

    consumed = nextConsumed;
  }

  return Math.max(lines.length - 1, 0);
}

function getLivePerformanceLineStartSetNumber(lines: LivePerformanceLineDraft[], lineIndex: number) {
  return lines.slice(0, Math.max(lineIndex, 0)).reduce((total, line) => total + Math.max(Math.trunc(Number(line.setsCount) || 0), 1), 0);
}

function getLivePerformanceLineForSetNumber(lines: LivePerformanceLineDraft[], setNumber: number) {
  const normalizedSetNumber = Math.max(Math.trunc(Number(setNumber) || 0), 1);
  let consumed = 0;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const lineSets = Math.max(Math.trunc(Number(line.setsCount) || 0), 1);
    consumed += lineSets;

    if (normalizedSetNumber <= consumed) {
      return { line, lineIndex: index };
    }
  }

  const fallbackLine = lines[lines.length - 1] || createLivePerformanceLineDraftFromBlock(null);
  return { line: fallbackLine, lineIndex: Math.max(lines.length - 1, 0) };
}

function formatLivePerformanceLineSummary(blockType: SessionBlockType, line: LivePerformanceLineDraft) {
  const setsLabel = `${Math.max(Math.trunc(Number(line.setsCount) || 0), 1)} série${Math.max(Math.trunc(Number(line.setsCount) || 0), 1) > 1 ? 's' : ''}`;

  if (blockType === 'reps') {
    const repsLabel = line.targetValue == null ? '-' : `${line.targetValue} reps`;
    const chargeLabel = line.chargeKg != null && line.chargeKg > 0 ? ` @ ${line.chargeKg} kg` : '';
    return `${setsLabel} · ${repsLabel}${chargeLabel}`;
  }

  if (blockType === 'duration') {
    const seconds = line.targetValue ?? 0;
    return `${setsLabel} · ${formatTimerClock(seconds)}`;
  }

  if (blockType === 'distance') {
    const distance = line.targetValue ?? 0;
    return `${setsLabel} · ${distance} km`;
  }

  if (line.note.trim()) {
    return `${setsLabel} · ${line.note.trim()}`;
  }

  return setsLabel;
}

function getSetPerformanceKey(entry: Pick<WorkoutSetPerformance, 'block_id' | 'set_number' | 'status'>) {
  return `${entry.block_id}:${entry.set_number}:${entry.status}`;
}

export default function LiveSessionPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const id = Array.isArray(params?.id) ? params.id[0] : (params?.id as string | undefined) || '';
  const programSessionId = searchParams.get('programSessionId');
  const programId = searchParams.get('programId');
  const dailySessionId = searchParams.get('dailySessionId');

  const [session, setSession] = useState<TrainingSession | null>(null);
  const [blocks, setBlocks] = useState<TrainingSessionBlockRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [historyMessage, setHistoryMessage] = useState<string | null>(null);
  const [authUserId, setAuthUserId] = useState<string | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [completedBlockIds, setCompletedBlockIds] = useState<string[]>([]);
  const [skippedBlockIds, setSkippedBlockIds] = useState<string[]>([]);
  const [completedSetsByBlockId, setCompletedSetsByBlockId] = useState<Record<string, number>>({});
  const [actualPerformanceDraftsByBlockId, setActualPerformanceDraftsByBlockId] = useState<
    Record<string, ActualPerformanceDraft>
  >({});
  const [actualPerformanceCarryForwardByBlockId, setActualPerformanceCarryForwardByBlockId] = useState<
    Record<string, ActualPerformanceDraft>
  >({});
  const [performanceDraftsByBlockId, setPerformanceDraftsByBlockId] = useState<
    Record<string, LivePerformanceDraft>
  >({});
  const [setPerformances, setSetPerformances] = useState<WorkoutSetPerformance[]>([]);
  const [finishReviewOpen, setFinishReviewOpen] = useState(false);
  const [restAfterBlockId, setRestAfterBlockId] = useState<string | null>(null);
  const [restResumeIndex, setRestResumeIndex] = useState<number | null>(null);
  const [restSecondsLeft, setRestSecondsLeft] = useState(DEFAULT_REST_SECONDS);
  const [exerciseBlockId, setExerciseBlockId] = useState<string | null>(null);
  const [exerciseSecondsLeft, setExerciseSecondsLeft] = useState(0);
  const [awaitingExerciseCompletion, setAwaitingExerciseCompletion] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [isTimerPaused, setIsTimerPaused] = useState(false);
  const [runKey, setRunKey] = useState('');
  const [historySaved, setHistorySaved] = useState(false);
  const [startedSeriesKey, setStartedSeriesKey] = useState<string | null>(null);
  const [newPersonalRecords, setNewPersonalRecords] = useState<NewPersonalRecord[]>([]);
  const [awardedBadgeCodes, setAwardedBadgeCodes] = useState<string[]>([]);
  const [earnedXpTotal, setEarnedXpTotal] = useState(0);
  const [completionSummaryTitle, setCompletionSummaryTitle] = useState<string | null>(null);
  const [completionSummarySubtitle, setCompletionSummarySubtitle] = useState<string | null>(null);
  const [completionTotalXp, setCompletionTotalXp] = useState(0);
  const [completionLevelProgress, setCompletionLevelProgress] = useState<ActyvLevelProgress | null>(null);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'success' | 'error'>('idle');
  const [validationFeedback, setValidationFeedback] = useState<string | null>(null);
  const [isAddExerciseOpen, setIsAddExerciseOpen] = useState(false);
  const [newExerciseName, setNewExerciseName] = useState('');
  const [newExerciseType, setNewExerciseType] = useState<SessionBlockType>('reps');
  const [newExerciseSets, setNewExerciseSets] = useState('1');
  const [newExerciseTargetValue, setNewExerciseTargetValue] = useState('');
  const [newExerciseChargeKg, setNewExerciseChargeKg] = useState('');
  const [newExerciseRestSeconds, setNewExerciseRestSeconds] = useState('60');
  const [newExerciseFreeText, setNewExerciseFreeText] = useState('');
  const hasHydratedLiveStateRef = useRef(false);

  const liveStorageKey = `actyv.session.live.${id}`;

  const clearPersistedLiveState = useCallback(() => {
    if (typeof window === 'undefined') return;

    try {
      window.localStorage.removeItem(liveStorageKey);
    } catch (error) {
      console.error('Erreur suppression etat live seance :', error);
    }
  }, [liveStorageKey]);

  const resolveLiveAuthUserId = useCallback(async () => {
    try {
      const { data, error } = await supabase.auth.getSession();

      if (error) {
        console.error('Erreur getSession seance live :', error);
      }

      const sessionUserId = data.session?.user?.id ?? null;
      if (sessionUserId) {
        return sessionUserId;
      }

      if (typeof window === 'undefined') {
        return null;
      }

      return await new Promise<string | null>((resolve) => {
        let settled = false;
        let timeoutId: number | undefined;
        let subscription: { unsubscribe: () => void } | null = null;

        const finish = (nextUserId: string | null) => {
          if (settled) return;
          settled = true;
          if (typeof timeoutId === 'number') {
            window.clearTimeout(timeoutId);
          }
          subscription?.unsubscribe();
          resolve(nextUserId);
        };

        timeoutId = window.setTimeout(() => {
          finish(null);
        }, 1500);

        subscription = supabase.auth.onAuthStateChange((_event, nextSession) => {
          if (nextSession?.user?.id) {
            finish(nextSession.user.id);
          }
        }).data.subscription;
      });
    } catch (error) {
      console.error('Erreur resolution auth seance live :', error);
      return null;
    }
  }, []);

  useEffect(() => {
    if (!id) {
      setLoading(false);
      setSession(null);
      setBlocks([]);
      setMessage('Impossible de charger cette seance.');
      return;
    }

    const loadSession = async () => {
      setLoading(true);
      setMessage(null);
      setHistoryMessage(null);
      setAuthUserId(null);

      try {
        const resolvedUserId = await resolveLiveAuthUserId();

        if (!resolvedUserId) {
          setMessage('Connecte-toi pour lancer cette seance.');
          setSession(null);
          setBlocks([]);
          return;
        }

        setAuthUserId(resolvedUserId);

        const { data: sessionRow, error: sessionError } = await supabase
          .from('training_sessions')
          .select('id, user_id, name, sport, description, visibility, created_at')
          .eq('id', id)
          .or(`user_id.eq.${resolvedUserId},visibility.eq.public`)
          .maybeSingle();

        if (sessionError) {
          console.error('Erreur chargement seance live :', sessionError);
          setMessage('Impossible de charger cette seance.');
          setSession(null);
          setBlocks([]);
          return;
        }

        if (!sessionRow) {
          setSession(null);
          setBlocks([]);
          setMessage('Cette seance est introuvable.');
          return;
        }

        setSession(sessionRow as TrainingSession);

        const { data: blockRows, error: blocksError } = await fetchTrainingSessionBlocks([id]);

        if (blocksError) {
          console.error('Erreur chargement blocs live :', blocksError);
          setMessage('Impossible de charger les blocs de cette seance.');
          setBlocks([]);
          return;
        }

        setBlocks(blockRows || []);
      } catch (error) {
        console.error('Erreur inattendue seance live :', error);
        setMessage('Impossible de charger cette seance.');
        setSession(null);
        setBlocks([]);
      } finally {
        setLoading(false);
      }
    };

    loadSession();
  }, [id, resolveLiveAuthUserId]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    try {
      const savedValue = window.localStorage.getItem(liveStorageKey);
      if (!savedValue) return;

      const parsedValue = JSON.parse(savedValue) as Partial<LiveState>;
      let hydratedBlocks: TrainingSessionBlockRecord[] | null = null;
      if (Array.isArray(parsedValue.blocks)) {
        hasHydratedLiveStateRef.current = true;
        const nextBlocks = parsedValue.blocks.flatMap((block) => {
            if (!block || typeof block !== 'object') return [];
            const candidateBlock = block as Partial<TrainingSessionBlockRecord>;
            if (
              typeof candidateBlock.id !== 'string' ||
              typeof candidateBlock.name !== 'string' ||
              typeof candidateBlock.block_type !== 'string'
            ) {
              return [];
            }

            return [
              {
                id: candidateBlock.id,
                session_id: typeof candidateBlock.session_id === 'string' ? candidateBlock.session_id : id,
                position: Number.isFinite(Number(candidateBlock.position)) ? Number(candidateBlock.position) : 0,
                name: candidateBlock.name,
                block_type: candidateBlock.block_type as SessionBlockType,
                sets_count:
                  Number.isFinite(Number(candidateBlock.sets_count)) && Number(candidateBlock.sets_count) > 0
                    ? Number(candidateBlock.sets_count)
                    : 1,
                target_value:
                  candidateBlock.target_value === null || candidateBlock.target_value === undefined
                    ? null
                    : Number(candidateBlock.target_value),
                charge_kg:
                  candidateBlock.charge_kg === null || candidateBlock.charge_kg === undefined
                    ? null
                    : Number(candidateBlock.charge_kg),
                rest_seconds:
                  Number.isFinite(Number(candidateBlock.rest_seconds)) && Number(candidateBlock.rest_seconds) >= 0
                    ? Number(candidateBlock.rest_seconds)
                    : 60,
              } satisfies TrainingSessionBlockRecord,
            ];
        });
        hydratedBlocks = nextBlocks;
        setBlocks(nextBlocks);
      }
      if (parsedValue.historySaved === true) {
        clearPersistedLiveState();
        hasHydratedLiveStateRef.current = false;
        setCurrentIndex(0);
        setBlocks([]);
        setCompletedBlockIds([]);
        setSkippedBlockIds([]);
        setCompletedSetsByBlockId({});
        setActualPerformanceDraftsByBlockId({});
        setActualPerformanceCarryForwardByBlockId({});
        setPerformanceDraftsByBlockId({});
        setSetPerformances([]);
        setFinishReviewOpen(false);
        setRestAfterBlockId(null);
        setRestResumeIndex(null);
        setRestSecondsLeft(DEFAULT_REST_SECONDS);
        setExerciseBlockId(null);
        setExerciseSecondsLeft(0);
        setAwaitingExerciseCompletion(false);
        setElapsedSeconds(0);
        setIsTimerPaused(false);
        setHistorySaved(false);
        setHistoryMessage(null);
        setSaveState('idle');
        setNewPersonalRecords([]);
        setAwardedBadgeCodes([]);
        setStartedSeriesKey(null);
        setEarnedXpTotal(0);
        setRunKey(createLiveRunKey());
        return;
      }

      if (typeof parsedValue.currentIndex === 'number') {
        setCurrentIndex(parsedValue.currentIndex);
      }
      if (Array.isArray(parsedValue.completedBlockIds)) {
        setCompletedBlockIds(parsedValue.completedBlockIds.filter(Boolean));
      }
      if (Array.isArray(parsedValue.skippedBlockIds)) {
        setSkippedBlockIds(parsedValue.skippedBlockIds.filter(Boolean));
      }
      if (parsedValue.completedSetsByBlockId && typeof parsedValue.completedSetsByBlockId === 'object') {
        const nextCompletedSets = Object.fromEntries(
          Object.entries(parsedValue.completedSetsByBlockId).filter(
            ([blockId, completedSets]) =>
              Boolean(blockId) && typeof completedSets === 'number' && Number.isFinite(completedSets)
          )
        );
        setCompletedSetsByBlockId(nextCompletedSets);
      }
      if (
        parsedValue.actualPerformanceDraftsByBlockId &&
        typeof parsedValue.actualPerformanceDraftsByBlockId === 'object'
      ) {
        const nextDrafts = Object.fromEntries(
          Object.entries(parsedValue.actualPerformanceDraftsByBlockId).flatMap(([blockId, draft]) => {
            if (!blockId || !draft || typeof draft !== 'object') return [];
            const candidateDraft = draft as Partial<ActualPerformanceDraft>;
            return [
              [
                blockId,
                {
                  actualReps:
                    candidateDraft.actualReps == null ? null : normalizePositiveInteger(candidateDraft.actualReps, 0),
                  actualChargeKg:
                    candidateDraft.actualChargeKg == null
                      ? null
                      : normalizeNonNegativeNumber(candidateDraft.actualChargeKg, 0),
                } satisfies ActualPerformanceDraft,
              ],
            ];
          })
        );
        setActualPerformanceDraftsByBlockId(nextDrafts);
      }
      if (
        parsedValue.actualPerformanceCarryForwardByBlockId &&
        typeof parsedValue.actualPerformanceCarryForwardByBlockId === 'object'
      ) {
        const nextCarryForward = Object.fromEntries(
          Object.entries(parsedValue.actualPerformanceCarryForwardByBlockId).flatMap(([blockId, draft]) => {
            if (!blockId || !draft || typeof draft !== 'object') return [];
            const candidateDraft = draft as Partial<ActualPerformanceDraft>;
            return [
              [
                blockId,
                {
                  actualReps:
                    candidateDraft.actualReps == null ? null : normalizePositiveInteger(candidateDraft.actualReps, 0),
                  actualChargeKg:
                    candidateDraft.actualChargeKg == null
                      ? null
                      : normalizeNonNegativeNumber(candidateDraft.actualChargeKg, 0),
                } satisfies ActualPerformanceDraft,
              ],
            ];
          })
        );
        setActualPerformanceCarryForwardByBlockId(nextCarryForward);
      }
      if (parsedValue.performanceDraftsByBlockId && typeof parsedValue.performanceDraftsByBlockId === 'object') {
        hasHydratedLiveStateRef.current = true;
        const nextPerformanceDrafts = Object.fromEntries(
          Object.entries(parsedValue.performanceDraftsByBlockId).flatMap(([blockId, draft]) => {
            if (!blockId || !draft || typeof draft !== 'object') return [];
            const candidateDraft = draft as Partial<LivePerformanceDraft>;
            return [
              [
                blockId,
                normalizeLivePerformanceDraft(
                  candidateDraft,
                  (hydratedBlocks || blocks).find((block) => block.id === blockId) || null
                ),
              ],
            ];
          })
        );
        setPerformanceDraftsByBlockId(nextPerformanceDrafts);
      }
      if (Array.isArray(parsedValue.setPerformances)) {
        setSetPerformances(
          parsedValue.setPerformances.flatMap((entry) => {
            if (!entry || typeof entry !== 'object') return [];
            const candidateEntry = entry as Partial<WorkoutSetPerformance>;
            if (
              typeof candidateEntry.block_id !== 'string' ||
              typeof candidateEntry.block_name !== 'string' ||
              typeof candidateEntry.set_number !== 'number' ||
              (candidateEntry.status !== 'completed' && candidateEntry.status !== 'skipped')
            ) {
              return [];
            }

            return [
              {
                block_id: candidateEntry.block_id,
                block_name: candidateEntry.block_name,
                set_number: normalizePositiveInteger(candidateEntry.set_number, 1),
                planned_reps:
                  candidateEntry.planned_reps == null ? null : normalizePositiveInteger(candidateEntry.planned_reps, 0),
                actual_reps:
                  candidateEntry.actual_reps == null ? null : normalizePositiveInteger(candidateEntry.actual_reps, 0),
                planned_charge_kg:
                  candidateEntry.planned_charge_kg == null
                    ? null
                    : normalizeNonNegativeNumber(candidateEntry.planned_charge_kg, 0),
                actual_charge_kg:
                  candidateEntry.actual_charge_kg == null
                    ? null
                    : normalizeNonNegativeNumber(candidateEntry.actual_charge_kg, 0),
                status: candidateEntry.status,
              } satisfies WorkoutSetPerformance,
            ];
          })
        );
      }
      if (typeof parsedValue.finishReviewOpen === 'boolean') {
        setFinishReviewOpen(parsedValue.finishReviewOpen);
      }
      if (
        typeof parsedValue.restAfterBlockId === 'string' ||
        parsedValue.restAfterBlockId === null
      ) {
        setRestAfterBlockId(parsedValue.restAfterBlockId ?? null);
      }
      if (
        typeof parsedValue.restResumeIndex === 'number' &&
        Number.isFinite(parsedValue.restResumeIndex)
      ) {
        setRestResumeIndex(Math.max(0, Math.floor(parsedValue.restResumeIndex)));
      }
      if (
        typeof parsedValue.restSecondsLeft === 'number' &&
        Number.isFinite(parsedValue.restSecondsLeft)
      ) {
        setRestSecondsLeft(Math.max(0, Math.floor(parsedValue.restSecondsLeft)));
      }
      if (typeof parsedValue.exerciseBlockId === 'string' || parsedValue.exerciseBlockId === null) {
        setExerciseBlockId(parsedValue.exerciseBlockId ?? null);
      }
      if (
        typeof parsedValue.exerciseSecondsLeft === 'number' &&
        Number.isFinite(parsedValue.exerciseSecondsLeft)
      ) {
        setExerciseSecondsLeft(Math.max(0, Math.floor(parsedValue.exerciseSecondsLeft)));
      }
      if (typeof parsedValue.awaitingExerciseCompletion === 'boolean') {
        setAwaitingExerciseCompletion(parsedValue.awaitingExerciseCompletion);
      }
      if (
        typeof parsedValue.elapsedSeconds === 'number' &&
        Number.isFinite(parsedValue.elapsedSeconds)
      ) {
        setElapsedSeconds(Math.max(0, Math.floor(parsedValue.elapsedSeconds)));
      }
      if (typeof parsedValue.isTimerPaused === 'boolean') {
        setIsTimerPaused(parsedValue.isTimerPaused);
      }
      if (typeof parsedValue.runKey === 'string' && safeTrimText(parsedValue.runKey).length > 0) {
        setRunKey(parsedValue.runKey);
      }
      if (typeof parsedValue.historySaved === 'boolean') {
        setHistorySaved(parsedValue.historySaved);
      }
      if (typeof parsedValue.startedSeriesKey === 'string' || parsedValue.startedSeriesKey === null) {
        setStartedSeriesKey(parsedValue.startedSeriesKey ?? null);
      }
    } catch (error) {
      console.error('Erreur lecture etat live seance :', error);
    }
  }, [clearPersistedLiveState, liveStorageKey]);

  useEffect(() => {
    if (!runKey) {
      setRunKey(createLiveRunKey());
    }
  }, [runKey]);

  useEffect(() => {
    if (!validationFeedback) return;

    const timeoutId = window.setTimeout(() => {
      setValidationFeedback(null);
    }, 900);

    return () => window.clearTimeout(timeoutId);
  }, [validationFeedback]);

  const completedBlocksCount = useMemo(
    () => blocks.filter((block) => completedBlockIds.includes(block.id)).length,
    [blocks, completedBlockIds]
  );
  const skippedBlocksCount = useMemo(
    () => blocks.filter((block) => skippedBlockIds.includes(block.id)).length,
    [blocks, skippedBlockIds]
  );
  const remainingBlocksCount = useMemo(
    () => blocks.filter((block) => !completedBlockIds.includes(block.id)).length,
    [blocks, completedBlockIds]
  );
  const resolvedBlockIds = useMemo(
    () => [...new Set([...completedBlockIds, ...skippedBlockIds])],
    [completedBlockIds, skippedBlockIds]
  );
  const sessionTotalVolume = useMemo(
    () =>
      blocks.reduce((total, block) => {
        if (!completedBlockIds.includes(block.id)) {
          return total;
        }

        const volume = getLivePerformanceDraftVolumeKg(
          performanceDraftsByBlockId[block.id] || createDefaultLivePerformanceDraft(block),
          block
        );
        return total + (volume ?? 0);
      }, 0),
    [blocks, completedBlockIds, performanceDraftsByBlockId]
  );
  const estimatedDurationSeconds = useMemo(() => getSessionEstimatedDuration(blocks), [blocks]);
  const estimatedCalories = useMemo(
    () => getEstimatedWorkoutCalories(elapsedSeconds, session?.sport),
    [elapsedSeconds, session?.sport]
  );
  const allBlocksCompleted = blocks.length > 0 && completedBlocksCount === blocks.length;
  const isFinishReviewVisible = historySaved || finishReviewOpen || allBlocksCompleted;
  const globalProgressPercent =
    blocks.length > 0 ? Math.min(100, Math.max(0, Math.round((completedBlocksCount / blocks.length) * 100))) : 0;
  const currentBlock = blocks[currentIndex] || null;
  const restSourceBlock = useMemo(
    () => blocks.find((block) => block.id === restAfterBlockId) || null,
    [blocks, restAfterBlockId]
  );
  const currentBlockSetsTotal = currentBlock ? normalizeSessionSetsCount(currentBlock.sets_count) : 1;
  const currentBlockRestSeconds =
    currentBlock && Number.isFinite(Number(currentBlock.rest_seconds))
      ? Math.max(0, Math.trunc(Number(currentBlock.rest_seconds)))
      : DEFAULT_REST_SECONDS;
  const restSourceBlockRestSeconds =
    restSourceBlock && Number.isFinite(Number(restSourceBlock.rest_seconds))
      ? Math.max(0, Math.trunc(Number(restSourceBlock.rest_seconds)))
      : currentBlockRestSeconds;
  const currentBlockVolume = currentBlock
    ? getLivePerformanceDraftVolumeKg(
        (currentBlock ? performanceDraftsByBlockId[currentBlock.id] : null) ||
          createDefaultLivePerformanceDraft(currentBlock),
        currentBlock
      )
    : null;
  const currentLivePerformanceDraft =
    (currentBlock ? performanceDraftsByBlockId[currentBlock.id] : null) ||
    createDefaultLivePerformanceDraft(currentBlock);
  const currentLivePerformanceLines = getLivePerformanceDraftLines(
    currentLivePerformanceDraft,
    currentBlock
  );
  const currentLivePerformanceTotalSets = getLivePerformanceDraftTotalSets(
    currentLivePerformanceDraft,
    currentBlock
  );
  const currentLiveBlockSetsTotal = Math.max(currentBlockSetsTotal, currentLivePerformanceTotalSets);
  const rawCurrentCompletedSets = currentBlock ? Number(completedSetsByBlockId[currentBlock.id] ?? 0) : 0;
  const currentCompletedSets = currentBlock
    ? Math.min(
        Number.isFinite(rawCurrentCompletedSets) ? Math.max(Math.trunc(rawCurrentCompletedSets), 0) : 0,
        currentLiveBlockSetsTotal
      )
    : 0;
  const isDurationBlock = currentBlock?.block_type === 'duration';
  const usesSetBySetValidation =
    Boolean(currentBlock) &&
    currentLiveBlockSetsTotal > 1 &&
    !resolvedBlockIds.includes(currentBlock.id);
  const displayedSeriesStep = currentBlock
    ? Math.min(currentCompletedSets + (resolvedBlockIds.includes(currentBlock.id) ? 0 : 1), currentLiveBlockSetsTotal)
    : 1;
  const isCurrentBlockSkipped = Boolean(currentBlock) && skippedBlockIds.includes(currentBlock.id);
  const isResting = Boolean(restAfterBlockId) && !isFinishReviewVisible;
  const currentSeriesKey = currentBlock ? `${currentBlock.id}:${currentCompletedSets}` : null;
  const isSeriesStarted =
    Boolean(currentSeriesKey) &&
    startedSeriesKey === currentSeriesKey &&
    !resolvedBlockIds.includes(currentBlock?.id ?? '');
  const isExercising =
    Boolean(currentBlock) && (Boolean(isSeriesStarted) || awaitingExerciseCompletion) && !isResting;
  const currentPhase: 'ready' | 'exercising' | 'resting' | 'paused' | 'completed' = isFinishReviewVisible
    ? 'completed'
    : isResting
      ? 'resting'
      : isTimerPaused
          ? 'paused'
          : isExercising
            ? 'exercising'
            : 'ready';
  const currentStatusLabel = allBlocksCompleted
    ? 'Bloc termine'
    : isTimerPaused
      ? 'Pause'
      : isResting
      ? 'Repos'
      : isExercising
          ? awaitingExerciseCompletion
            ? 'Serie prete a etre terminee'
            : 'Serie en cours'
          : isCurrentBlockSkipped
            ? 'Bloc passe'
            : currentCompletedSets > 0
              ? 'Pret pour la serie suivante'
              : 'Pret pour la serie';
  const currentSeriesLabel = currentBlock
    ? usesSetBySetValidation
      ? `Serie ${Math.max(displayedSeriesStep, 1)} / ${currentLiveBlockSetsTotal}`
      : currentLiveBlockSetsTotal > 1
        ? `${currentLiveBlockSetsTotal} series prevues`
        : 'Bloc unique'
    : '-';
  const currentBlockName = safeTrimText(currentBlock?.name) || (currentBlock ? `Bloc ${currentIndex + 1}` : 'Bloc');
  const restingBlockName =
    safeTrimText(restSourceBlock?.name) ||
    (restSourceBlock ? `Bloc ${restSourceBlock.position + 1}` : currentBlockName);
  const plannedRepsForCurrentBlock = getPlannedReps(currentBlock);
  const plannedChargeKgForCurrentBlock = getPlannedChargeKg(currentBlock);
  const currentActivePerformanceLineIndex = getLivePerformanceLineIndexByCompletedSets(
    currentLivePerformanceLines,
    currentCompletedSets
  );
  const currentActivePerformanceLine =
    currentLivePerformanceLines[currentActivePerformanceLineIndex] ||
    currentLivePerformanceLines[0] ||
    createLivePerformanceLineDraftFromBlock(currentBlock);
  const currentCompletedSetsBeforeActiveLine = getLivePerformanceLineStartSetNumber(
    currentLivePerformanceLines,
    currentActivePerformanceLineIndex
  );
  const currentActiveLineCompletedSets = Math.max(
    currentCompletedSets - currentCompletedSetsBeforeActiveLine,
    0
  );
  const currentActiveLineTotalSets = Math.max(Math.trunc(Number(currentActivePerformanceLine.setsCount) || 0), 1);
  const currentActualReps =
    currentBlock?.block_type === 'reps'
      ? currentActivePerformanceLine.targetValue == null
        ? plannedRepsForCurrentBlock
        : normalizePositiveInteger(currentActivePerformanceLine.targetValue, 0)
      : currentBlock?.block_type === 'duration'
        ? currentActivePerformanceLine.targetValue == null
          ? Number(currentBlock?.target_value ?? 0)
          : normalizePositiveInteger(currentActivePerformanceLine.targetValue, 0)
        : currentBlock?.block_type === 'distance'
          ? currentActivePerformanceLine.targetValue == null
            ? Number(currentBlock?.target_value ?? 0)
            : normalizeNonNegativeNumber(currentActivePerformanceLine.targetValue, 0)
        : null;
  const currentActualChargeKg =
    currentBlock?.block_type === 'reps'
      ? currentActivePerformanceLine.chargeKg == null
        ? plannedChargeKgForCurrentBlock
        : normalizeNonNegativeNumber(currentActivePerformanceLine.chargeKg, 0)
      : null;
  const currentActualText =
    currentBlock?.block_type === 'free'
      ? safeTrimText(currentActivePerformanceLine.note)
      : safeTrimText(currentActivePerformanceLine.note).length > 0
        ? safeTrimText(currentActivePerformanceLine.note)
        : null;
  const finishStateLabel =
    saveState === 'saving'
      ? 'Enregistrement...'
      : saveState === 'success'
        ? 'Seance enregistree'
        : saveState === 'error'
          ? "Erreur d'enregistrement"
          : 'Clique sur Terminer pour enregistrer ta seance.';
  const canValidateCurrentBlock =
    Boolean(currentBlock) &&
    currentPhase !== 'completed' &&
    currentPhase !== 'resting' &&
    !resolvedBlockIds.includes(currentBlock?.id ?? '') &&
    (!isDurationBlock || currentPhase !== 'exercising' || awaitingExerciseCompletion);
  const canAdjustCurrentPerformance =
    Boolean(currentBlock) &&
    (currentBlock.block_type === 'reps' ||
      currentBlock.block_type === 'duration' ||
      currentBlock.block_type === 'distance' ||
      currentBlock.block_type === 'free') &&
    !resolvedBlockIds.includes(currentBlock.id);
  const canOpenFinishReview =
    Boolean(session) &&
    blocks.length > 0 &&
    !historySaved &&
    (allBlocksCompleted ||
      currentIndex >= blocks.length - 1 ||
      completedBlocksCount > 0 ||
      skippedBlocksCount > 0);
  const finishReviewHint = canOpenFinishReview
    ? allBlocksCompleted
      ? 'Tous les blocs sont termines. Tu peux valider la seance.'
      : 'Tu peux terminer maintenant la seance ou revenir sur les blocs restants.'
      : 'Termine, passe ou atteins le dernier bloc pour pouvoir cloturer la seance.';

  useEffect(() => {
    if (!currentBlock || resolvedBlockIds.includes(currentBlock.id)) {
      return;
    }

    const nextDraft = normalizeLivePerformanceDraft(
      performanceDraftsByBlockId[currentBlock.id] || createDefaultLivePerformanceDraft(currentBlock),
      currentBlock
    );

    const nextScalarDraft = getPerformanceDraftFromBlock(currentBlock);

    setPerformanceDraftsByBlockId((current) => {
      const currentDraft = current[currentBlock.id];
      if (JSON.stringify(currentDraft) === JSON.stringify(nextDraft)) {
        return current;
      }

      return {
        ...current,
        [currentBlock.id]: nextDraft,
      };
    });

    setActualPerformanceDraftsByBlockId((current) => {
      const currentDraft = current[currentBlock.id];
      if (
        currentDraft &&
        currentDraft.actualReps === nextScalarDraft.actualReps &&
        currentDraft.actualChargeKg === nextScalarDraft.actualChargeKg
      ) {
        return current;
      }

      return {
        ...current,
        [currentBlock.id]: nextScalarDraft,
      };
    });
  }, [currentBlock, performanceDraftsByBlockId, resolvedBlockIds]);

  const validatedSeriesCount = useMemo(
    () =>
      blocks.reduce((total, block) => {
        if (!completedBlockIds.includes(block.id)) {
          return total;
        }

        const recordedSets = Number(
          completedSetsByBlockId[block.id] ??
            getLivePerformanceDraftTotalSets(performanceDraftsByBlockId[block.id], block)
        );
        const normalizedSets = Math.min(
          Math.max(Number.isFinite(recordedSets) ? Math.trunc(recordedSets) : 0, 0),
          getLivePerformanceDraftTotalSets(performanceDraftsByBlockId[block.id], block)
        );

        return total + normalizedSets;
      }, 0),
    [blocks, completedBlockIds, completedSetsByBlockId, performanceDraftsByBlockId]
  );
  const actualCompletedSetPerformances = useMemo(
    () => setPerformances.filter((entry) => entry.status === 'completed'),
    [setPerformances]
  );
  const actualTotalRepetitionsCount = useMemo(
    () =>
      actualCompletedSetPerformances.reduce(
        (total, entry) => total + Math.max(Number(entry.actual_reps ?? 0), 0),
        0
      ),
    [actualCompletedSetPerformances]
  );
  const actualSessionVolume = useMemo(
    () =>
      actualCompletedSetPerformances.reduce((total, entry) => {
        const reps = Math.max(Number(entry.actual_reps ?? 0), 0);
        const charge = Math.max(Number(entry.actual_charge_kg ?? 0), 0);
        return total + reps * charge;
      }, 0),
    [actualCompletedSetPerformances]
  );
  const totalSetsCount = useMemo(
    () =>
      blocks.reduce(
        (total, block) => total + getLivePerformanceDraftTotalSets(performanceDraftsByBlockId[block.id], block),
        0
      ),
    [blocks, performanceDraftsByBlockId]
  );
  const skippedSeriesCount = useMemo(
    () =>
      blocks.reduce((total, block) => {
        if (!skippedBlockIds.includes(block.id)) {
          return total;
        }

        const completedSets = Math.min(
          Math.max(Number(completedSetsByBlockId[block.id] ?? 0), 0),
          getLivePerformanceDraftTotalSets(performanceDraftsByBlockId[block.id], block)
        );

        return total + Math.max(getLivePerformanceDraftTotalSets(performanceDraftsByBlockId[block.id], block) - completedSets, 0);
      }, 0),
    [blocks, skippedBlockIds, completedSetsByBlockId, performanceDraftsByBlockId]
  );
  const unresolvedSeriesCount = useMemo(
    () =>
      blocks.reduce((total, block) => {
        if (completedBlockIds.includes(block.id) || skippedBlockIds.includes(block.id)) {
          return total;
        }

        const completedSets = Math.min(
          Math.max(Number(completedSetsByBlockId[block.id] ?? 0), 0),
          getLivePerformanceDraftTotalSets(performanceDraftsByBlockId[block.id], block)
        );

        return total + Math.max(getLivePerformanceDraftTotalSets(performanceDraftsByBlockId[block.id], block) - completedSets, 0);
      }, 0),
    [blocks, completedBlockIds, skippedBlockIds, completedSetsByBlockId, performanceDraftsByBlockId]
  );
  const completionRate = blocks.length > 0 ? Math.round((completedBlocksCount / blocks.length) * 100) : 0;
  const isPartialCompletion = skippedBlocksCount > 0 || skippedSeriesCount > 0 || remainingBlocksCount > 0;
  const totalExercisesCount = blocks.length;
  const displayedEarnedXp = historySaved ? earnedXpTotal : XP_RULES.session_completed.xp;

  useEffect(() => {
    if (typeof window === 'undefined' || blocks.length === 0) return;

    const validBlockIds = new Set(blocks.map((block) => block.id));
    const sanitizedIds = completedBlockIds.filter((blockId) => validBlockIds.has(blockId));
    const sanitizedSkippedIds = skippedBlockIds.filter(
      (blockId) => validBlockIds.has(blockId) && !sanitizedIds.includes(blockId)
    );

    if (sanitizedIds.length !== completedBlockIds.length) {
      setCompletedBlockIds(sanitizedIds);
      return;
    }

    if (sanitizedSkippedIds.length !== skippedBlockIds.length) {
      setSkippedBlockIds(sanitizedSkippedIds);
      return;
    }

    const sanitizedCompletedSetsByBlockId = Object.fromEntries(
      Object.entries(completedSetsByBlockId)
        .filter(([blockId]) => validBlockIds.has(blockId))
        .map(([blockId, completedSets]) => {
          const matchingBlock = blocks.find((block) => block.id === blockId);
          const maxSets = normalizeSessionSetsCount(matchingBlock?.sets_count ?? 1);
          return [blockId, Math.min(Math.max(Math.trunc(completedSets), 0), maxSets)];
        })
    );

    if (
      JSON.stringify(sanitizedCompletedSetsByBlockId) !== JSON.stringify(completedSetsByBlockId)
    ) {
      setCompletedSetsByBlockId(sanitizedCompletedSetsByBlockId);
      return;
    }

    const sanitizedActualPerformanceDraftsByBlockId = Object.fromEntries(
      Object.entries(actualPerformanceDraftsByBlockId)
        .filter(([blockId]) => validBlockIds.has(blockId))
        .map(([blockId, draft]) => [
          blockId,
          {
            actualReps: draft.actualReps == null ? null : normalizePositiveInteger(draft.actualReps, 0),
            actualChargeKg: draft.actualChargeKg == null ? null : normalizeNonNegativeNumber(draft.actualChargeKg, 0),
          } satisfies ActualPerformanceDraft,
        ])
    );

    if (
      JSON.stringify(sanitizedActualPerformanceDraftsByBlockId) !==
      JSON.stringify(actualPerformanceDraftsByBlockId)
    ) {
      setActualPerformanceDraftsByBlockId(sanitizedActualPerformanceDraftsByBlockId);
      return;
    }

    const sanitizedActualPerformanceCarryForwardByBlockId = Object.fromEntries(
      Object.entries(actualPerformanceCarryForwardByBlockId)
        .filter(([blockId]) => validBlockIds.has(blockId))
        .map(([blockId, draft]) => [
          blockId,
          {
            actualReps: draft.actualReps == null ? null : normalizePositiveInteger(draft.actualReps, 0),
            actualChargeKg: draft.actualChargeKg == null ? null : normalizeNonNegativeNumber(draft.actualChargeKg, 0),
          } satisfies ActualPerformanceDraft,
        ])
    );

    if (
      JSON.stringify(sanitizedActualPerformanceCarryForwardByBlockId) !==
      JSON.stringify(actualPerformanceCarryForwardByBlockId)
    ) {
      setActualPerformanceCarryForwardByBlockId(sanitizedActualPerformanceCarryForwardByBlockId);
      return;
    }

    const sanitizedSetPerformances = setPerformances
      .filter((entry) => validBlockIds.has(entry.block_id))
      .map((entry) => ({
        ...entry,
        set_number: normalizePositiveInteger(entry.set_number, 1),
        line_number: entry.line_number == null ? null : normalizePositiveInteger(entry.line_number, 1),
        block_type:
          entry.block_type === 'reps' ||
          entry.block_type === 'duration' ||
          entry.block_type === 'distance' ||
          entry.block_type === 'free'
            ? entry.block_type
            : null,
        planned_reps: entry.planned_reps == null ? null : normalizePositiveInteger(entry.planned_reps, 0),
        actual_reps: entry.actual_reps == null ? null : normalizePositiveInteger(entry.actual_reps, 0),
        planned_charge_kg:
          entry.planned_charge_kg == null ? null : normalizeNonNegativeNumber(entry.planned_charge_kg, 0),
        actual_charge_kg:
          entry.actual_charge_kg == null ? null : normalizeNonNegativeNumber(entry.actual_charge_kg, 0),
        planned_value: entry.planned_value == null ? null : normalizeNonNegativeNumber(entry.planned_value, 0),
        actual_value: entry.actual_value == null ? null : normalizeNonNegativeNumber(entry.actual_value, 0),
        actual_text: typeof entry.actual_text === 'string' ? entry.actual_text : null,
      }));

    if (JSON.stringify(sanitizedSetPerformances) !== JSON.stringify(setPerformances)) {
      setSetPerformances(sanitizedSetPerformances);
      return;
    }

    const sanitizedRestAfterBlockId =
      restAfterBlockId && validBlockIds.has(restAfterBlockId) ? restAfterBlockId : null;

    if (sanitizedRestAfterBlockId !== restAfterBlockId) {
      setRestAfterBlockId(sanitizedRestAfterBlockId);
      return;
    }

    const nextResumeIndex =
      typeof restResumeIndex === 'number' && Number.isFinite(restResumeIndex)
        ? Math.min(Math.max(restResumeIndex, 0), Math.max(blocks.length - 1, 0))
        : null;

    if (nextResumeIndex !== restResumeIndex) {
      setRestResumeIndex(nextResumeIndex);
      return;
    }

    const nextIndex = Math.min(Math.max(currentIndex, 0), Math.max(blocks.length - 1, 0));
      if (nextIndex !== currentIndex) {
        setCurrentIndex(nextIndex);
        return;
      }

      const sanitizedStartedSeriesKey =
        typeof startedSeriesKey === 'string' &&
        startedSeriesKey.trim().length > 0 &&
        (() => {
          const [blockId] = startedSeriesKey.split(':');
          return validBlockIds.has(blockId);
        })()
          ? startedSeriesKey
          : null;

      if (sanitizedStartedSeriesKey !== startedSeriesKey) {
        setStartedSeriesKey(sanitizedStartedSeriesKey);
        return;
      }

    try {
      const payload: LiveState = {
        currentIndex: nextIndex,
        blocks,
        completedBlockIds: sanitizedIds,
        skippedBlockIds: sanitizedSkippedIds,
        completedSetsByBlockId: sanitizedCompletedSetsByBlockId,
        actualPerformanceDraftsByBlockId: sanitizedActualPerformanceDraftsByBlockId,
        actualPerformanceCarryForwardByBlockId: sanitizedActualPerformanceCarryForwardByBlockId,
        performanceDraftsByBlockId,
        setPerformances: sanitizedSetPerformances,
        finishReviewOpen,
        restAfterBlockId: sanitizedRestAfterBlockId,
        restResumeIndex: nextResumeIndex,
        restSecondsLeft,
        exerciseBlockId,
        exerciseSecondsLeft,
        awaitingExerciseCompletion,
        elapsedSeconds,
        isTimerPaused,
        runKey,
        historySaved,
        startedSeriesKey: sanitizedStartedSeriesKey,
      };
      window.localStorage.setItem(liveStorageKey, JSON.stringify(payload));
    } catch (error) {
      console.error('Erreur sauvegarde etat live seance :', error);
    }
  }, [
    blocks,
    completedBlockIds,
    skippedBlockIds,
    completedSetsByBlockId,
    actualPerformanceDraftsByBlockId,
    actualPerformanceCarryForwardByBlockId,
    performanceDraftsByBlockId,
    setPerformances,
    currentIndex,
    finishReviewOpen,
    liveStorageKey,
    restAfterBlockId,
    restResumeIndex,
    restSecondsLeft,
    exerciseBlockId,
    exerciseSecondsLeft,
    awaitingExerciseCompletion,
    elapsedSeconds,
    isTimerPaused,
    runKey,
    historySaved,
    startedSeriesKey,
  ]);

  useEffect(() => {
    if (!isResting || restSecondsLeft <= 0) return;

    const timeoutId = window.setTimeout(() => {
      setRestSecondsLeft((current) => Math.max(0, current - 1));
    }, 1000);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [isResting, restSecondsLeft]);

  useEffect(() => {
    if (!isExercising || exerciseSecondsLeft <= 0 || isTimerPaused) return;

    const timeoutId = window.setTimeout(() => {
      setExerciseSecondsLeft((current) => Math.max(0, current - 1));
    }, 1000);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [exerciseSecondsLeft, isExercising, isTimerPaused]);

  useEffect(() => {
    if (!isResting || restSecondsLeft > 0) return;

    triggerHaptic([20, 35, 20]);
    const nextIndex =
      typeof restResumeIndex === 'number' && Number.isFinite(restResumeIndex)
        ? Math.min(Math.max(restResumeIndex, 0), Math.max(blocks.length - 1, 0))
        : currentIndex;

    setCurrentIndex(nextIndex);
    setRestAfterBlockId(null);
    setRestResumeIndex(null);
    setRestSecondsLeft(DEFAULT_REST_SECONDS);
  }, [blocks.length, currentIndex, isResting, restResumeIndex, restSecondsLeft]);

  useEffect(() => {
    if (!exerciseBlockId || exerciseSecondsLeft > 0) return;

    triggerHaptic([20, 35, 20]);
    setExerciseBlockId(null);
    setAwaitingExerciseCompletion(true);
  }, [exerciseBlockId, exerciseSecondsLeft]);

  useEffect(() => {
    if (loading || !session || blocks.length === 0 || isFinishReviewVisible || isTimerPaused) return;

    const timeoutId = window.setTimeout(() => {
      setElapsedSeconds((current) => current + 1);
    }, 1000);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [blocks.length, elapsedSeconds, isFinishReviewVisible, isTimerPaused, loading, session]);

  const clearRestState = () => {
    setRestAfterBlockId(null);
    setRestResumeIndex(null);
    setRestSecondsLeft(DEFAULT_REST_SECONDS);
  };

  const clearExerciseState = () => {
    setExerciseBlockId(null);
    setExerciseSecondsLeft(0);
    setAwaitingExerciseCompletion(false);
    setStartedSeriesKey(null);
  };

  const goToPrevious = () => {
    clearRestState();
    clearExerciseState();
    setFinishReviewOpen(false);
    setCurrentIndex((value) => Math.max(value - 1, 0));
  };

  const goToNext = () => {
    clearRestState();
    clearExerciseState();
    setFinishReviewOpen(false);
    setCurrentIndex((value) => Math.min(value + 1, Math.max(blocks.length - 1, 0)));
  };

  const goToNextExercise = () => {
    clearRestState();
    clearExerciseState();
    setFinishReviewOpen(false);
    setCurrentIndex((value) => Math.min(value + 1, Math.max(blocks.length - 1, 0)));
  };

  const goToBlockIndex = (index: number) => {
    clearRestState();
    clearExerciseState();
    setFinishReviewOpen(false);
    setCurrentIndex(Math.min(Math.max(index, 0), Math.max(blocks.length - 1, 0)));
  };

  const goToRemainingBlocks = () => {
    clearRestState();
    clearExerciseState();
    setFinishReviewOpen(false);

    const nextIndex = blocks.findIndex((block) => !completedBlockIds.includes(block.id));
    if (nextIndex >= 0) {
      setCurrentIndex(nextIndex);
    }
  };

  const addExerciseToLive = () => {
    if (!newExerciseName.trim() || !session) return;

    const sanitizedSets = Math.max(Math.trunc(Number(newExerciseSets) || 1), 1);
    const sanitizedTargetValue =
      newExerciseType === 'free'
        ? null
        : newExerciseTargetValue.trim() === ''
          ? null
          : Math.max(Number(newExerciseTargetValue), 0);
    const sanitizedChargeKg =
      newExerciseType === 'reps' && newExerciseChargeKg.trim() !== ''
        ? Math.max(Number(newExerciseChargeKg), 0)
        : null;
    const sanitizedRestSeconds = Math.max(Math.trunc(Number(newExerciseRestSeconds) || 0), 0);

    const nextBlock: TrainingSessionBlockRecord = {
      id: `live-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      session_id: session.id,
      position: blocks.length,
      name: newExerciseName.trim(),
      block_type: newExerciseType,
      sets_count: sanitizedSets,
      target_value: sanitizedTargetValue,
      charge_kg: sanitizedChargeKg,
      rest_seconds: sanitizedRestSeconds,
    };

    setBlocks((current) => [...current, nextBlock]);
    setCurrentIndex(blocks.length);
    setPerformanceDraftsByBlockId((current) => ({
      ...current,
      [nextBlock.id]: createDefaultLivePerformanceDraft(nextBlock),
    }));
    setActualPerformanceDraftsByBlockId((current) => ({
      ...current,
      [nextBlock.id]: getPerformanceDraftFromBlock(nextBlock),
    }));
    setIsAddExerciseOpen(false);
    setNewExerciseName('');
    setNewExerciseType('reps');
    setNewExerciseSets('1');
    setNewExerciseTargetValue('');
    setNewExerciseChargeKg('');
    setNewExerciseRestSeconds('60');
    setNewExerciseFreeText('');
    setValidationFeedback('Exercice ajoute');
  };

  const updateCurrentPerformanceLine = (changes: Partial<LivePerformanceLineDraft>) => {
    if (!currentBlock) return;

    setPerformanceDraftsByBlockId((current) => {
      const existingDraft = current[currentBlock.id] || createDefaultLivePerformanceDraft(currentBlock);
      const nextLines = existingDraft.lines.length > 0 ? [...existingDraft.lines] : [createLivePerformanceLineDraftFromBlock(currentBlock)];
      const lineIndex = Math.min(
        getLivePerformanceLineIndexByCompletedSets(nextLines, currentCompletedSets),
        nextLines.length - 1
      );
      const currentLine = nextLines[lineIndex] || createLivePerformanceLineDraftFromBlock(currentBlock);

      nextLines[lineIndex] = {
        ...currentLine,
        id: currentLine.id || createLivePerformanceLineDraftFromBlock(currentBlock).id,
        setsCount: changes.setsCount !== undefined ? Math.max(Math.trunc(Number(changes.setsCount) || 0), 1) : currentLine.setsCount,
        targetValue:
          changes.targetValue !== undefined
            ? changes.targetValue
            : currentLine.targetValue,
        chargeKg:
          changes.chargeKg !== undefined
            ? changes.chargeKg
            : currentLine.chargeKg,
        note: changes.note !== undefined ? changes.note : currentLine.note,
      };

      return {
        ...current,
        [currentBlock.id]: {
          ...existingDraft,
          lines: nextLines.map((line) => normalizeLivePerformanceLineDraft(line, currentBlock)),
        },
      };
    });

    setActualPerformanceDraftsByBlockId((current) => {
      const fallbackDraft = current[currentBlock.id] || getPerformanceDraftFromBlock(currentBlock);
      return {
        ...current,
        [currentBlock.id]: {
          actualReps:
            changes.targetValue !== undefined && currentBlock.block_type === 'reps'
              ? changes.targetValue
              : fallbackDraft.actualReps,
          actualChargeKg:
            changes.chargeKg !== undefined
              ? changes.chargeKg
              : fallbackDraft.actualChargeKg,
        },
      };
    });
  };

  const updateCurrentPerformanceLineAt = (lineIndex: number, changes: Partial<LivePerformanceLineDraft>) => {
    if (!currentBlock) return;

    setPerformanceDraftsByBlockId((current) => {
      const existingDraft = current[currentBlock.id] || createDefaultLivePerformanceDraft(currentBlock);
      if (lineIndex < 0 || lineIndex >= existingDraft.lines.length) {
        return current;
      }

      const nextLines = existingDraft.lines.map((line, index) =>
        index === lineIndex
          ? normalizeLivePerformanceLineDraft(
              {
                ...line,
                ...changes,
              },
              currentBlock
            )
          : line
      );

      return {
        ...current,
        [currentBlock.id]: {
          ...existingDraft,
          lines: nextLines,
        },
      };
    });
  };

  const addCurrentPerformanceLine = () => {
    if (!currentBlock) return;

    setPerformanceDraftsByBlockId((current) => {
      const existingDraft = current[currentBlock.id] || createDefaultLivePerformanceDraft(currentBlock);
      const nextLine = createLivePerformanceLineDraftFromBlock(currentBlock, 1);
      const nextLines = [...existingDraft.lines, nextLine];

      return {
        ...current,
        [currentBlock.id]: {
          ...existingDraft,
          lines: nextLines,
        },
      };
    });
  };

  const removeCurrentPerformanceLine = (lineIndex: number) => {
    if (!currentBlock) return;

    setPerformanceDraftsByBlockId((current) => {
      const existingDraft = current[currentBlock.id] || createDefaultLivePerformanceDraft(currentBlock);
      if (existingDraft.lines.length <= 1 || lineIndex < 0 || lineIndex >= existingDraft.lines.length) {
        return current;
      }

      const nextLines = existingDraft.lines.filter((_, index) => index !== lineIndex);

      return {
        ...current,
        [currentBlock.id]: {
          ...existingDraft,
          lines: nextLines.length > 0 ? nextLines : [createLivePerformanceLineDraftFromBlock(currentBlock)],
        },
      };
    });
  };

  const resetCurrentPerformanceDraft = () => {
    if (!currentBlock) return;

    setPerformanceDraftsByBlockId((current) => ({
      ...current,
      [currentBlock.id]: createDefaultLivePerformanceDraft(currentBlock),
    }));
    setActualPerformanceDraftsByBlockId((current) => {
      const nextState = { ...current };
      nextState[currentBlock.id] = getPerformanceDraftFromBlock(currentBlock);
      return nextState;
    });
    setValidationFeedback('Retour aux valeurs prevues');
  };

  const applyCurrentPerformanceToRemainingSets = () => {
    if (!currentBlock) return;

    setPerformanceDraftsByBlockId((current) => {
      const existingDraft = current[currentBlock.id] || createDefaultLivePerformanceDraft(currentBlock);
      const nextLines = existingDraft.lines.map((line, index) =>
        index < currentActivePerformanceLineIndex
          ? line
          : currentBlock.block_type === 'free'
            ? {
                ...line,
                note: currentActualText ?? line.note,
              }
            : currentBlock.block_type === 'duration' || currentBlock.block_type === 'distance'
              ? {
                  ...line,
                  targetValue: currentActualReps,
                }
              : {
                  ...line,
                  targetValue: currentActualReps,
                  chargeKg: currentActualChargeKg,
                }
      );

      return {
        ...current,
        [currentBlock.id]: {
          ...existingDraft,
          lines: nextLines,
        },
      };
    });
    setValidationFeedback('Applique aux series restantes');
  };

  const upsertSetPerformanceEntries = (entries: WorkoutSetPerformance[]) => {
    if (entries.length === 0) return;

    setSetPerformances((current) => {
      const nextByKey = new Map(current.map((entry) => [getSetPerformanceKey(entry), entry]));
      entries.forEach((entry) => {
        nextByKey.set(getSetPerformanceKey(entry), entry);
      });

      return Array.from(nextByKey.values()).sort((left, right) => {
        if (left.block_id === right.block_id) {
          if (left.set_number === right.set_number) {
            return left.status.localeCompare(right.status);
          }
          return left.set_number - right.set_number;
        }

        return left.block_id.localeCompare(right.block_id);
      });
    });
  };

  const adjustRestSeconds = (delta: number) => {
    setRestSecondsLeft((current) => Math.max(0, current + delta));
  };

  const beginRest = (sourceBlockId: string, nextIndex: number, restSeconds: number) => {
    const normalizedRest = Number.isFinite(Number(restSeconds)) ? Math.max(0, Math.trunc(Number(restSeconds))) : 0;

    if (normalizedRest <= 0) {
      clearRestState();
      clearExerciseState();
      setCurrentIndex(Math.min(Math.max(nextIndex, 0), Math.max(blocks.length - 1, 0)));
      return;
    }

    setRestAfterBlockId(sourceBlockId);
    setRestResumeIndex(Math.min(Math.max(nextIndex, 0), Math.max(blocks.length - 1, 0)));
    setRestSecondsLeft(normalizedRest);
    clearExerciseState();
  };

  const resetLiveProgress = () => {
    setCompletedBlockIds([]);
    setSkippedBlockIds([]);
    setCompletedSetsByBlockId({});
    setActualPerformanceDraftsByBlockId({});
    setActualPerformanceCarryForwardByBlockId({});
    setSetPerformances([]);
    setCurrentIndex(0);
    setElapsedSeconds(0);
    setIsTimerPaused(false);
    setFinishReviewOpen(false);
    setHistorySaved(false);
    setHistoryMessage(null);
    setNewPersonalRecords([]);
    setAwardedBadgeCodes([]);
    setCompletionSummaryTitle(null);
    setCompletionSummarySubtitle(null);
    setCompletionTotalXp(0);
    setCompletionLevelProgress(null);
    setStartedSeriesKey(null);
    setEarnedXpTotal(0);
    setSaveState('idle');
    setRunKey(createLiveRunKey());
    setIsAddExerciseOpen(false);
    setNewExerciseName('');
    setNewExerciseType('reps');
    setNewExerciseSets('1');
    setNewExerciseTargetValue('');
    setNewExerciseChargeKg('');
    setNewExerciseRestSeconds('60');
    setNewExerciseFreeText('');
    clearRestState();
    clearExerciseState();
    clearPersistedLiveState();
  };

  const completeCurrentExercise = () => {
    if (!currentBlock) return;

    setSkippedBlockIds((current) => current.filter((blockId) => blockId !== currentBlock.id));
    setCompletedBlockIds((current) =>
      current.includes(currentBlock.id) ? current : [...current, currentBlock.id]
    );

    if (currentIndex >= blocks.length - 1) {
      clearRestState();
      clearExerciseState();
      return;
    }

    beginRest(currentBlock.id, currentIndex + 1, currentBlockRestSeconds);
  };

  const handleValidateCurrent = () => {
    if (!currentBlock) return;

    triggerHaptic(18);
    setStartedSeriesKey(null);
    setValidationFeedback(usesSetBySetValidation ? 'Serie validee' : 'Bloc valide');

    const setNumber = Math.min(currentCompletedSets + 1, currentLiveBlockSetsTotal);
    const plannedReps = getPlannedReps(currentBlock);
    const plannedChargeKg = getPlannedChargeKg(currentBlock);
    const plannedTargetValue =
      currentBlock.block_type === 'reps'
        ? currentActivePerformanceLine.targetValue ?? plannedReps
        : currentBlock.block_type === 'duration'
          ? normalizePositiveInteger(currentActivePerformanceLine.targetValue ?? currentBlock.target_value ?? 0, 0)
          : currentBlock.block_type === 'distance'
            ? normalizeNonNegativeNumber(currentActivePerformanceLine.targetValue ?? currentBlock.target_value ?? 0, 0)
            : null;

    upsertSetPerformanceEntries([
      {
        block_id: currentBlock.id,
        block_name: safeTrimText(currentBlock.name) || `Bloc ${currentIndex + 1}`,
        set_number: setNumber,
        line_number: currentActivePerformanceLineIndex + 1,
        block_type: currentBlock.block_type,
        planned_reps: plannedReps,
        actual_reps: currentBlock.block_type === 'reps' ? currentActualReps ?? plannedReps : null,
        planned_charge_kg: plannedChargeKg,
        actual_charge_kg:
          currentBlock.block_type === 'reps' ? (currentActualChargeKg && currentActualChargeKg > 0 ? currentActualChargeKg : null) : null,
        planned_value: plannedTargetValue,
        actual_value:
          currentBlock.block_type === 'duration' || currentBlock.block_type === 'distance'
            ? currentActualReps
            : null,
        actual_text: currentBlock.block_type === 'free' ? currentActivePerformanceLine.note || null : null,
        status: 'completed',
      },
    ]);

    if (usesSetBySetValidation) {
      const nextCompletedSets = Math.min(currentCompletedSets + 1, currentLiveBlockSetsTotal);

      setCompletedSetsByBlockId((current) => ({
        ...current,
        [currentBlock.id]: nextCompletedSets,
      }));

      if (nextCompletedSets >= currentLiveBlockSetsTotal) {
        completeCurrentExercise();
      } else {
        beginRest(currentBlock.id, currentIndex, currentBlockRestSeconds);
      }

      return;
    }

    setCompletedSetsByBlockId((current) => ({
      ...current,
      [currentBlock.id]: currentLiveBlockSetsTotal,
    }));

    completeCurrentExercise();
  };

  const handleSkipCurrentBlock = () => {
    if (!currentBlock || resolvedBlockIds.includes(currentBlock.id)) return;

    triggerHaptic(12);
    clearRestState();
    clearExerciseState();
    setValidationFeedback('Bloc passe');
    const plannedReps = getPlannedReps(currentBlock);
    const plannedChargeKg = getPlannedChargeKg(currentBlock);
    const plannedTargetValue =
      currentBlock.block_type === 'reps'
        ? currentActivePerformanceLine.targetValue ?? plannedReps
        : currentBlock.block_type === 'duration'
          ? normalizePositiveInteger(currentActivePerformanceLine.targetValue ?? currentBlock.target_value ?? 0, 0)
          : currentBlock.block_type === 'distance'
            ? normalizeNonNegativeNumber(currentActivePerformanceLine.targetValue ?? currentBlock.target_value ?? 0, 0)
            : null;
    const skippedEntries: WorkoutSetPerformance[] = Array.from(
      { length: Math.max(currentLiveBlockSetsTotal - currentCompletedSets, 0) },
      (_, index) => ({
        block_id: currentBlock.id,
        block_name: safeTrimText(currentBlock.name) || `Bloc ${currentIndex + 1}`,
        set_number: currentCompletedSets + index + 1,
        line_number: currentActivePerformanceLineIndex + 1,
        block_type: currentBlock.block_type,
        planned_reps: plannedReps,
        actual_reps: null,
        planned_charge_kg: plannedChargeKg,
        actual_charge_kg: null,
        planned_value: plannedTargetValue,
        actual_value: null,
        actual_text: null,
        status: 'skipped' as const,
      })
    );
    upsertSetPerformanceEntries(skippedEntries);
    setSkippedBlockIds((current) => (current.includes(currentBlock.id) ? current : [...current, currentBlock.id]));

    if (currentIndex >= blocks.length - 1) {
      return;
    }

    setCurrentIndex((value) => Math.min(value + 1, Math.max(blocks.length - 1, 0)));
  };

  const handleStartCurrentSeries = () => {
    try {
      if (!currentBlock) return;

      triggerHaptic(18);
      setValidationFeedback(null);

      if (currentBlock.block_type === 'duration') {
        const duration = Number(currentBlock?.target_value ?? 0);
        const normalizedTarget =
          Number.isFinite(duration) && duration > 0 ? Math.max(1, Math.trunc(duration)) : 0;

        if (normalizedTarget <= 0) {
          setValidationFeedback('Duree invalide, serie validee sans chrono');
          handleValidateCurrent();
          return;
        }

        setStartedSeriesKey(currentSeriesKey);
        setExerciseBlockId(currentBlock.id);
        setExerciseSecondsLeft(normalizedTarget);
        setAwaitingExerciseCompletion(false);
        setIsTimerPaused(false);
        return;
      }

      setStartedSeriesKey(currentSeriesKey);
      setValidationFeedback('Serie lancee');
    } catch (error) {
      console.error('start exercise failed', error);
      setValidationFeedback("Impossible de lancer la serie pour le moment.");
      clearExerciseState();
    }
  };

  const shouldKeepScreenAwake = Boolean(session) && blocks.length > 0 && !historySaved;

  useEffect(() => {
    if (typeof window === 'undefined') return;

    let released = false;
    let wakeLockSentinel: { release?: () => Promise<void> } | null = null;

    const requestWakeLock = async () => {
      try {
        if (typeof navigator === 'undefined' || !('wakeLock' in navigator)) return;

        const wakeLockApi = (navigator as Navigator & {
          wakeLock?: { request: (type: 'screen') => Promise<{ release?: () => Promise<void> }> };
        }).wakeLock;

        if (!wakeLockApi || document.visibilityState !== 'visible' || !shouldKeepScreenAwake) return;
        wakeLockSentinel = await wakeLockApi.request('screen');
      } catch {
        // ignore
      }
    };

    const releaseWakeLock = async () => {
      if (released) return;
      released = true;
      try {
        await wakeLockSentinel?.release?.();
      } catch {
        // ignore
      }
      wakeLockSentinel = null;
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState !== 'visible') {
        void releaseWakeLock();
      } else if (shouldKeepScreenAwake) {
        released = false;
        void requestWakeLock();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    if (shouldKeepScreenAwake) {
      void requestWakeLock();
    }

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      void releaseWakeLock();
    };
  }, [shouldKeepScreenAwake]);

  const saveCompletedSession = useCallback(async () => {
    if (historySaved || !session || !runKey || saveState === 'saving') {
      return false;
    }

    setSaveState('saving');
    setHistoryMessage(null);

    try {
      const currentUserId = authUserId || (await resolveLiveAuthUserId());

      if (!currentUserId) {
        console.error('Workout history insert error:', new Error('No authenticated user'));
        setHistoryMessage("Impossible d'enregistrer l'historique de la seance.");
        setSaveState('error');
        return false;
      }

      setAuthUserId(currentUserId);

      const finalSetPerformanceByKey = new Map(
        setPerformances.map((entry) => [getSetPerformanceKey(entry), entry])
      );

      blocks.forEach((block, blockIndex) => {
        const liveDraft =
          performanceDraftsByBlockId[block.id] || createDefaultLivePerformanceDraft(block);
        const liveLines = getLivePerformanceDraftLines(liveDraft, block);
        const totalSets = getLivePerformanceDraftTotalSets(liveDraft, block);
        const completedSets = Math.min(
          Math.max(Number(completedSetsByBlockId[block.id] ?? 0), 0),
          totalSets
        );
        const blockName = safeTrimText(block.name) || `Bloc ${blockIndex + 1}`;

        for (let setNumber = 1; setNumber <= completedSets; setNumber += 1) {
          const { line, lineIndex } = getLivePerformanceLineForSetNumber(liveLines, setNumber);
          const normalizedTargetValue = line.targetValue == null ? null : normalizeNonNegativeNumber(line.targetValue, 0);
          const normalizedChargeKg = line.chargeKg == null ? null : normalizeNonNegativeNumber(line.chargeKg, 0);
          const lineType = block.block_type;
          const key = getSetPerformanceKey({
            block_id: block.id,
            set_number: setNumber,
            status: 'completed',
          });

          if (!finalSetPerformanceByKey.has(key)) {
            finalSetPerformanceByKey.set(key, {
              block_id: block.id,
              block_name: blockName,
              set_number: setNumber,
              line_number: lineIndex + 1,
              block_type: lineType,
              planned_reps: lineType === 'reps' ? normalizedTargetValue : null,
              actual_reps: lineType === 'reps' ? normalizedTargetValue : null,
              planned_charge_kg: lineType === 'reps' ? normalizedChargeKg : null,
              actual_charge_kg: lineType === 'reps' ? normalizedChargeKg : null,
              planned_value:
                lineType === 'duration' || lineType === 'distance'
                  ? normalizedTargetValue
                  : null,
              actual_value:
                lineType === 'duration' || lineType === 'distance'
                  ? normalizedTargetValue
                  : null,
              actual_text: lineType === 'free' ? safeTrimText(line.note) || null : null,
              status: 'completed',
            });
          }
        }

        for (let setNumber = completedSets + 1; setNumber <= totalSets; setNumber += 1) {
          const { line, lineIndex } = getLivePerformanceLineForSetNumber(liveLines, setNumber);
          const normalizedTargetValue = line.targetValue == null ? null : normalizeNonNegativeNumber(line.targetValue, 0);
          const lineType = block.block_type;
          const key = getSetPerformanceKey({
            block_id: block.id,
            set_number: setNumber,
            status: 'skipped',
          });

          if (!finalSetPerformanceByKey.has(key)) {
            finalSetPerformanceByKey.set(key, {
              block_id: block.id,
              block_name: blockName,
              set_number: setNumber,
              line_number: lineIndex + 1,
              block_type: lineType,
              planned_reps: lineType === 'reps' ? normalizedTargetValue : null,
              actual_reps: null,
              planned_charge_kg: lineType === 'reps' ? normalizeNonNegativeNumber(line.chargeKg, 0) : null,
              actual_charge_kg: null,
              planned_value:
                lineType === 'duration' || lineType === 'distance'
                  ? normalizedTargetValue
                  : null,
              actual_value: null,
              actual_text: null,
              status: 'skipped',
            });
          }
        }
      });

      const finalSetPerformances = Array.from(finalSetPerformanceByKey.values()).sort((left, right) => {
        const leftBlockIndex = blocks.findIndex((block) => block.id === left.block_id);
        const rightBlockIndex = blocks.findIndex((block) => block.id === right.block_id);

        if (leftBlockIndex === rightBlockIndex) {
          if (left.set_number === right.set_number) {
            return left.status.localeCompare(right.status);
          }
          return left.set_number - right.set_number;
        }

        return leftBlockIndex - rightBlockIndex;
      });

      const completedSetPerformances = finalSetPerformances.filter((entry) => entry.status === 'completed');
      const actualVolumeTotal = completedSetPerformances.reduce((total, entry) => {
        const reps = Math.max(Number(entry.actual_reps ?? 0), 0);
        const charge = Math.max(Number(entry.actual_charge_kg ?? 0), 0);
        return total + reps * charge;
      }, 0);
      const actualRepetitionsTotal = completedSetPerformances.reduce(
        (total, entry) => total + Math.max(Number(entry.actual_reps ?? 0), 0),
        0
      );

      const normalizedDurationSeconds = Number.isFinite(Number(elapsedSeconds))
        ? Number(elapsedSeconds)
        : 0;
      const normalizedEstimatedCalories = Number.isFinite(Number(estimatedCalories))
        ? Number(estimatedCalories)
        : 0;
      const normalizedTotalVolume = Number.isFinite(Number(actualVolumeTotal))
        ? Number(actualVolumeTotal)
        : 0;
      const normalizedCompletedExercises = Number.isFinite(Number(completedBlocksCount))
        ? Number(completedBlocksCount)
        : 0;
      const normalizedSkippedBlocks = Number.isFinite(Number(remainingBlocksCount))
        ? Number(remainingBlocksCount)
        : 0;
      const normalizedTotalBlocks = Number.isFinite(Number(totalExercisesCount))
        ? Number(totalExercisesCount)
        : 0;
      const normalizedCompletedSets = Number.isFinite(Number(validatedSeriesCount))
        ? Number(validatedSeriesCount)
        : 0;
      const normalizedSkippedSets = Number.isFinite(Number(skippedSeriesCount + unresolvedSeriesCount))
        ? Number(skippedSeriesCount + unresolvedSeriesCount)
        : 0;
      const normalizedTotalSets = Number.isFinite(Number(totalSetsCount))
        ? Number(totalSetsCount)
        : 0;
      const normalizedCompletionRate = Number.isFinite(
        Number(normalizedTotalBlocks > 0 ? Math.round((normalizedCompletedExercises / normalizedTotalBlocks) * 100) : 0)
      )
        ? Number(normalizedTotalBlocks > 0 ? Math.round((normalizedCompletedExercises / normalizedTotalBlocks) * 100) : 0)
        : 0;
      const normalizedTotalRepetitions = Number.isFinite(Number(actualRepetitionsTotal))
        ? Number(actualRepetitionsTotal)
        : 0;
      const completionType: WorkoutCompletionMetadata['completion_type'] = isPartialCompletion ? 'partial' : 'full';
      const historyMetadata: WorkoutCompletionMetadata = {
        stats_version: 4,
        total_blocks: normalizedTotalBlocks,
        completed_blocks: normalizedCompletedExercises,
        skipped_blocks: normalizedSkippedBlocks,
        total_sets: normalizedTotalSets,
        completed_sets: normalizedCompletedSets,
        skipped_sets: normalizedSkippedSets,
        completion_rate: normalizedCompletionRate,
        completion_type: completionType,
        total_repetitions: normalizedTotalRepetitions,
        total_volume: normalizedTotalVolume,
        planned_total_volume: Number.isFinite(Number(sessionTotalVolume)) ? Number(sessionTotalVolume) : 0,
        actual_total_volume: normalizedTotalVolume,
        estimated_calories: normalizedEstimatedCalories,
        earned_xp: XP_RULES.session_completed.xp,
        actual_sets: finalSetPerformances,
      };

      const payload = {
        user_id: user.id,
        workout_id: session.id,
        workout_name: session.name,
        completed_at: new Date().toISOString(),
        duration_seconds: normalizedDurationSeconds,
        estimated_calories: normalizedEstimatedCalories,
        total_volume: normalizedTotalVolume,
        completed_exercises: normalizedCompletedExercises,
        metadata: historyMetadata,
      };

      let completionMessage: string | null = null;

      let insertResponse = await supabase
        .from('workout_sessions_history')
        .insert(payload)
        .select(
          'id, workout_id, user_id, workout_name, duration_seconds, estimated_calories, total_volume, completed_exercises, completed_at, metadata'
        )
        .single();

      const missingMetadataColumn =
        insertResponse.error?.code === 'PGRST204' ||
        insertResponse.error?.code === '42703' ||
        (insertResponse.error?.message || '').toLowerCase().includes('metadata');

      if (missingMetadataColumn) {
        const { metadata, ...legacyPayload } = payload;
        insertResponse = await supabase
          .from('workout_sessions_history')
          .insert(legacyPayload)
          .select(
            'id, workout_id, user_id, workout_name, duration_seconds, estimated_calories, total_volume, completed_exercises, completed_at'
          )
          .single();
      }

      const { data, error } = insertResponse;

      if (error) {
        console.error('Workout history insert error:', error);
        setHistoryMessage("Impossible d'enregistrer l'historique de la seance.");
        setSaveState('error');
        return false;
      }

      const awardedXpMessages: string[] = [];
      let nextEarnedXpTotal = 0;
      let nextCompletionSummaryTitle: string | null = null;
      let nextCompletionSummarySubtitle: string | null = null;
      let dailySessionRow:
        | {
            id: string;
            session_id: string | null;
            scheduled_for: string;
            bonus_xp: number | null;
          }
        | null = null;
      let alreadyCompletedDailySession = false;

      if (dailySessionId) {
        const { data: fetchedDailySessionRow, error: dailySessionError } = await supabase
          .from('daily_sessions')
          .select('id, session_id, scheduled_for, bonus_xp')
          .eq('id', dailySessionId)
          .maybeSingle();

        if (dailySessionError) {
          console.error('Daily session completion lookup error:', dailySessionError);
          completionMessage =
            completionMessage || "L'historique a ete enregistre, mais pas la validation de la seance du jour.";
        } else if (fetchedDailySessionRow) {
          dailySessionRow = fetchedDailySessionRow;

          const { data: existingDailyCompletion, error: existingDailyCompletionError } = await supabase
            .from('daily_session_completions')
            .select('id')
            .eq('user_id', user.id)
            .eq('daily_session_id', dailySessionId)
            .maybeSingle();

          if (existingDailyCompletionError) {
            console.error('Daily session completion existing check error:', existingDailyCompletionError);
            completionMessage =
              completionMessage || "L'historique a ete enregistre, mais pas la validation de la seance du jour.";
          } else {
            alreadyCompletedDailySession = Boolean(existingDailyCompletion?.id);
          }
        }
      }

      if (!dailySessionId || !alreadyCompletedDailySession) {
        const workoutXpResult = await awardXp({
          userId: user.id,
          source: 'session_completed',
          metadata: { target_id: data.id },
        });

        if (workoutXpResult?.awarded) {
          awardedXpMessages.push('+10 XP seance');
          nextEarnedXpTotal += XP_RULES.session_completed.xp;
        } else if (workoutXpResult?.error) {
          console.error('XP award failed', {
            payload: {
              user_id: user.id,
              event_type: 'session_completed',
              xp_amount: 10,
              target_id: data.id,
            },
            error: workoutXpResult.error,
          });
        }
      } else {
        completionMessage = completionMessage || "Deja realisee aujourd'hui. Aucun XP supplementaire.";
        nextCompletionSummaryTitle = "Seance deja realisee aujourd'hui";
        nextCompletionSummarySubtitle = 'Aucun XP supplementaire';
      }

      let exerciseHistoryMessage: string | null = null;

      const exerciseHistoryPayload = blocks
        .filter((block) => completedBlockIds.includes(block.id))
        .filter((block) => safeTrimText(block.name).length > 0)
        .map((block) => {
          const normalizedSetsCount =
            Number(completedSetsByBlockId[block.id] ?? 0) > 0
              ? Math.min(
                  Math.max(Number(completedSetsByBlockId[block.id] ?? 0), 0),
                  normalizeSessionSetsCount(block.sets_count)
                )
              : normalizeSessionSetsCount(block.sets_count);
          const normalizedTargetValue =
            Number.isFinite(Number(block.target_value)) && Number(block.target_value) > 0
              ? Number(block.target_value)
              : 0;
          const normalizedChargeKg =
            Number.isFinite(Number(block.charge_kg)) && Number(block.charge_kg) > 0
              ? Number(block.charge_kg)
              : 0;
          const normalizedBlockVolume =
            getSessionBlockVolumeKg(
              block.block_type,
              block.target_value,
              normalizedSetsCount,
              block.charge_kg
            ) ?? 0;

          return {
            history_id: data.id,
            user_id: user.id,
            workout_id: session.id,
            exercise_name: safeTrimText(block.name) || `Bloc ${block.position + 1}`,
            block_type: block.block_type,
            sets_count: normalizedSetsCount,
            reps: block.block_type === 'reps' ? normalizedTargetValue : 0,
            duration_seconds: block.block_type === 'duration' ? Math.trunc(normalizedTargetValue) : 0,
            distance: block.block_type === 'distance' ? normalizedTargetValue : 0,
            charge_kg: normalizedChargeKg,
            volume: normalizedBlockVolume,
            completed_at: payload.completed_at,
          };
        });

      if (exerciseHistoryPayload.length > 0) {
        const exerciseNames = [...new Set(exerciseHistoryPayload.map((entry) => entry.exercise_name))];
        const { data: previousExerciseHistory, error: previousExerciseHistoryError } = await supabase
          .from('workout_exercise_history')
          .select('exercise_name, reps, duration_seconds, charge_kg, volume')
          .eq('user_id', user.id)
          .in('exercise_name', exerciseNames);

        if (previousExerciseHistoryError) {
          console.error('Workout exercise history comparison error:', previousExerciseHistoryError);
        }

        const previousBestByExercise = new Map<
          string,
          { reps: number; duration: number; charge: number; volume: number }
        >();

        (((previousExerciseHistory as Array<{
          exercise_name: string;
          reps: number | null;
          duration_seconds: number | null;
          charge_kg: number | null;
          volume: number | null;
        }>) || [])).forEach((entry) => {
          const key = safeTrimText(entry.exercise_name).toLowerCase();
          const current = previousBestByExercise.get(key) || {
            reps: 0,
            duration: 0,
            charge: 0,
            volume: 0,
          };

          previousBestByExercise.set(key, {
            reps: Math.max(current.reps, Number(entry.reps || 0)),
            duration: Math.max(current.duration, Number(entry.duration_seconds || 0)),
            charge: Math.max(current.charge, Number(entry.charge_kg || 0)),
            volume: Math.max(current.volume, Number(entry.volume || 0)),
          });
        });

        const detectedNewRecords: NewPersonalRecord[] = [];

        exerciseHistoryPayload.forEach((entry) => {
          const key = safeTrimText(entry.exercise_name).toLowerCase();
          const previousBest = previousBestByExercise.get(key) || {
            reps: 0,
            duration: 0,
            charge: 0,
            volume: 0,
          };

          if (entry.reps > 0 && previousBest.reps > 0 && entry.reps > previousBest.reps) {
            detectedNewRecords.push({
              exerciseName: entry.exercise_name,
              metric: 'reps',
              previousValue: previousBest.reps,
              value: entry.reps,
            });
          }

          if (entry.charge_kg > 0 && previousBest.charge > 0 && entry.charge_kg > previousBest.charge) {
            detectedNewRecords.push({
              exerciseName: entry.exercise_name,
              metric: 'charge',
              previousValue: previousBest.charge,
              value: entry.charge_kg,
            });
          }

          if (entry.volume > 0 && previousBest.volume > 0 && entry.volume > previousBest.volume) {
            detectedNewRecords.push({
              exerciseName: entry.exercise_name,
              metric: 'volume',
              previousValue: previousBest.volume,
              value: entry.volume,
            });
          }

          if (
            entry.duration_seconds > 0 &&
            previousBest.duration > 0 &&
            entry.duration_seconds > previousBest.duration
          ) {
            detectedNewRecords.push({
              exerciseName: entry.exercise_name,
              metric: 'duration',
              previousValue: previousBest.duration,
              value: entry.duration_seconds,
            });
          }
        });

        const { error: exerciseHistoryError } = await supabase
          .from('workout_exercise_history')
          .insert(exerciseHistoryPayload);

        if (exerciseHistoryError) {
          console.error('Workout exercise history insert error:', exerciseHistoryError);
          console.error('Exercise history insert error:', exerciseHistoryError);
          console.error('Exercise history insert error details:', {
            message: exerciseHistoryError.message,
            code: exerciseHistoryError.code,
            details: exerciseHistoryError.details,
            hint: exerciseHistoryError.hint,
          });
          console.error(
            'Exercise history insert error full:',
            JSON.stringify(exerciseHistoryError, null, 2)
          );
          exerciseHistoryMessage = "L'historique a ete enregistre, mais pas les records d'exercices.";
        }

        setNewPersonalRecords(detectedNewRecords);
      }

      if (programSessionId && programId) {
        const programCompletionPayload = {
          user_id: user.id,
          program_id: programId,
          program_session_id: programSessionId,
          session_id: session.id,
          workout_history_id: data.id,
          completed_at: payload.completed_at,
        };

        const { data: existingCompletion, error: existingCompletionError } = await supabase
          .from('training_program_completions')
          .select('id')
          .eq('user_id', user.id)
          .eq('program_id', programId)
          .eq('program_session_id', programSessionId)
          .maybeSingle();

        if (existingCompletionError) {
          console.error('Program completion insert error:', existingCompletionError);
          console.error(
            'Program completion insert error full:',
            JSON.stringify(existingCompletionError, null, 2)
          );
          completionMessage = "L'historique a ete enregistre, mais pas la progression du programme.";
        } else if (!existingCompletion) {
          const { error: completionInsertError } = await supabase
            .from('training_program_completions')
            .insert(programCompletionPayload);

          if (completionInsertError) {
            console.error('Program completion insert error:', completionInsertError);
            console.error(
              'Program completion insert error full:',
              JSON.stringify(completionInsertError, null, 2)
            );
            completionMessage = "L'historique a ete enregistre, mais pas la progression du programme.";
          } else {
            const [{ count: totalProgramSessionsCount }, { count: completedProgramSessionsCount }] = await Promise.all([
              supabase
                .from('training_program_sessions')
                .select('*', { count: 'exact', head: true })
                .eq('program_id', programId),
              supabase
                .from('training_program_completions')
                .select('*', { count: 'exact', head: true })
                .eq('program_id', programId)
                .eq('user_id', user.id),
            ]);

            if (
              Number.isFinite(Number(totalProgramSessionsCount)) &&
              Number(totalProgramSessionsCount) > 0 &&
              Number(completedProgramSessionsCount || 0) >= Number(totalProgramSessionsCount)
            ) {
              const programCompletedXpResult = await awardXp({
                userId: user.id,
                source: 'program_completed',
                metadata: { target_id: programId },
              });

              if (programCompletedXpResult?.awarded) {
                awardedXpMessages.push('+50 XP programme termine');
                nextEarnedXpTotal += XP_RULES.program_completed.xp;
              } else if (programCompletedXpResult?.error) {
                console.error('XP award failed', {
                  payload: {
                    user_id: user.id,
                    event_type: 'program_completed',
                    xp_amount: 50,
                    target_id: programId,
                  },
                  error: programCompletedXpResult.error,
                });
              }
            }
          }
        }
      }

      if (dailySessionId && dailySessionRow) {
        if (!alreadyCompletedDailySession) {
          const dailyCompletionPayload = {
            user_id: user.id,
            daily_session_id: dailySessionId,
            session_id: session.id,
            workout_history_id: data.id,
            scheduled_for: dailySessionRow.scheduled_for,
            completed_at: payload.completed_at,
          };

          const { error: dailyCompletionInsertError } = await supabase
            .from('daily_session_completions')
            .insert(dailyCompletionPayload);

          if (dailyCompletionInsertError) {
            console.error('Daily session completion insert error:', dailyCompletionInsertError);
            completionMessage =
              completionMessage || "L'historique a ete enregistre, mais pas la validation de la seance du jour.";
          } else {
            const bonusXp = Number(dailySessionRow.bonus_xp || 25);
            const dailyXpResult = await awardXp({
              userId: currentUserId,
              source: 'daily_session_completed',
              metadata: { target_id: dailySessionId },
              xpOverride: bonusXp,
            });

            if (dailyXpResult?.awarded) {
              awardedXpMessages.push(`+${bonusXp} XP seance du jour`);
              nextEarnedXpTotal += bonusXp;
              nextCompletionSummaryTitle = 'Seance du jour terminee';
              nextCompletionSummarySubtitle = `+${bonusXp} XP bonus ajoutes`;
            } else if (dailyXpResult?.error) {
              console.error('XP award failed', {
                payload: {
                  user_id: currentUserId,
                  event_type: 'daily_session_completed',
                  xp_amount: bonusXp,
                  target_id: dailySessionId,
                },
                error: dailyXpResult.error,
              });
            }
          }
        } else {
          completionMessage = completionMessage || "Deja realisee aujourd'hui. Aucun XP supplementaire.";
          nextCompletionSummaryTitle = "Seance deja realisee aujourd'hui";
          nextCompletionSummarySubtitle = 'Aucun XP supplementaire';
        }
      }

      const badgeResult = await refreshUserBadges(currentUserId);

      if (badgeResult.error) {
        console.error('Erreur refresh badges seance live :', badgeResult.error);
      }

      awardedXpMessages.forEach((xpMessage) => {
        queuePendingToast({ message: xpMessage, tone: 'info' });
      });

      badgeResult.awarded.forEach((badgeCode) => {
        const badge = getBadgeByCode(badgeCode);
        queuePendingToast({
          message: `Badge debloque : ${badge?.label || badgeCode}`,
          tone: 'celebrate',
        });
      });

      const xpTotalResult = await getUserTotalXp(currentUserId, 0);
      if (!xpTotalResult.error) {
        setCompletionTotalXp(xpTotalResult.totalXp);
        setCompletionLevelProgress(getActyvLevel(xpTotalResult.totalXp));
      }

      if (!nextCompletionSummaryTitle) {
        nextCompletionSummaryTitle = 'Seance terminee';
        nextCompletionSummarySubtitle =
          nextEarnedXpTotal > 0 ? `+${XP_RULES.session_completed.xp} XP ajoutes` : 'Aucun XP supplementaire';
      }

      setAwardedBadgeCodes(badgeResult.awarded);
      setCompletionSummaryTitle(nextCompletionSummaryTitle);
      setCompletionSummarySubtitle(nextCompletionSummarySubtitle);
      setHistorySaved(true);
      setFinishReviewOpen(true);
      setEarnedXpTotal(nextEarnedXpTotal);
      setHistoryMessage(exerciseHistoryMessage || completionMessage);
      setSaveState('success');
      return true;
    } catch (error) {
      console.error('Workout history unexpected save error:', error);
      setHistoryMessage("Une erreur inattendue s'est produite pendant l'enregistrement.");
      setSaveState('error');
      return false;
    }
  }, [
    authUserId,
    actualPerformanceCarryForwardByBlockId,
    actualPerformanceDraftsByBlockId,
    blocks,
    completedBlockIds,
    completedBlocksCount,
    completedSetsByBlockId,
    totalExercisesCount,
    totalSetsCount,
    elapsedSeconds,
    estimatedCalories,
    historySaved,
    isPartialCompletion,
    programId,
    programSessionId,
    dailySessionId,
    remainingBlocksCount,
    runKey,
    saveState,
    session,
    sessionTotalVolume,
    setPerformances,
    resolveLiveAuthUserId,
    skippedBlocksCount,
    skippedSeriesCount,
    unresolvedSeriesCount,
    validatedSeriesCount,
  ]);

  const handleFinishSession = async () => {
    if (historySaved) {
      clearPersistedLiveState();
      router.push(`/sessions/${id}`);
      return;
    }

    const didSave = await saveCompletedSession();
    if (!didSave) return;
  };

  const primaryAwardedBadge = awardedBadgeCodes.length > 0 ? getBadgeByCode(awardedBadgeCodes[0]) : null;
  const completionProgressLabel = completionLevelProgress
    ? completionLevelProgress.nextLevelXp === null
      ? `${completionTotalXp} XP`
      : `${completionTotalXp} / ${completionLevelProgress.nextLevelXp} XP`
    : null;
  const loginHref = `/login?redirectTo=${encodeURIComponent(`/sessions/${id}/live`)}`;

  return (
    <AppShell>
      <section className="sessions-page sessions-page--dark session-live-page">
        <Link href={`/sessions/${id}`} className="detail-back-link">
          &larr; Retour a la seance
        </Link>

        {loading ? (
          <div className="challenge-state">
            <p>Chargement de la seance live...</p>
          </div>
        ) : !session ? (
          <div className="challenge-state">
            <p>{message || 'Cette seance est introuvable.'}</p>
            <div className="session-empty-actions">
              <Link href="/sessions" className="button primary">
                Revenir a mes seances
              </Link>
              {message?.toLowerCase().includes('connecte-toi') ? (
                <Link href={loginHref} className="button ghost">
                  Se connecter
                </Link>
              ) : null}
            </div>
          </div>
        ) : blocks.length === 0 ? (
          <div className="challenge-state">
            <p>Cette seance ne contient aucun bloc.</p>
            <div className="session-empty-actions">
              <Link href={`/sessions/${id}`} className="button ghost">
                Revenir au detail
              </Link>
            </div>
          </div>
        ) : !currentBlock && !isFinishReviewVisible ? (
          <div className="challenge-state">
            <p>Impossible d&apos;afficher le bloc courant de cette seance.</p>
            <div className="session-empty-actions">
              <button type="button" className="button primary" onClick={resetLiveProgress}>
                Reinitialiser la progression
              </button>
              <Link href={`/sessions/${id}`} className="button ghost">
                Retour a la seance
              </Link>
            </div>
          </div>
        ) : (
          <>
            <SessionLiveHeader
              sportBadge={
                <div className={getSportBadgeClassName(session.sport, 'badge', 'Sport')}>
                  {formatSportBadgeLabel(session.sport, 'Sport')}
                </div>
              }
              title={session.name}
              elapsedLabel={`Temps : ${formatElapsedDuration(elapsedSeconds)}`}
              currentBlockLabel={`Bloc ${Math.min(currentIndex + 1, blocks.length)} / ${blocks.length}`}
              progressLabel={`${completedBlocksCount} / ${blocks.length} blocs termines - ${formatPercent(globalProgressPercent)}`}
              progressMetaLabel={
                allBlocksCompleted
                  ? skippedBlocksCount > 0
                    ? 'Tous les blocs ont ete traites, avec certains passes.'
                    : 'Tous les blocs sont termines.'
                  : usesSetBySetValidation
                    ? `${currentSeriesLabel} - progression de la seance en direct`
                    : 'Un seul bloc a la fois, sans distraction.'
              }
              progressPercent={globalProgressPercent}
              onTogglePause={() => setIsTimerPaused((current) => !current)}
              isPaused={isTimerPaused || isFinishReviewVisible}
              quitHref={`/sessions/${id}`}
            />

            {isFinishReviewVisible ? (
              <article className="card session-live-finished session-live-finished--v1">
                <div className="session-live-finished__hero">
                  <span className="section-kicker">Fin de seance</span>
                  <strong>
                    {historySaved
                      ? isPartialCompletion
                        ? '🏁 Seance terminee partiellement'
                        : '🏁 Seance terminee'
                      : remainingBlocksCount > 0
                        ? `Il reste ${remainingBlocksCount} bloc${remainingBlocksCount > 1 ? 's' : ''} non termine${remainingBlocksCount > 1 ? 's' : ''}`
                        : '🏁 Seance terminee'}
                  </strong>
                  {historySaved ? <p className="session-live-finished__session-name">{session.name}</p> : null}
                </div>

                <div className="session-live-finished__stats">
                  <div className="session-live-fact">
                    <span>Blocs valides</span>
                    <strong>{`${completedBlocksCount} / ${totalExercisesCount}`}</strong>
                  </div>
                  <div className="session-live-fact">
                    <span>Series validees</span>
                    <strong>{validatedSeriesCount}</strong>
                  </div>
                  <div className="session-live-fact">
                    <span>Duree reelle</span>
                    <strong>{formatElapsedDuration(elapsedSeconds)}</strong>
                  </div>
                  <div className="session-live-fact">
                    <span>XP gagnee</span>
                    <strong>{`+${displayedEarnedXp} XP`}</strong>
                  </div>
                  <div className="session-live-fact">
                    <span>Series passees</span>
                    <strong>{skippedSeriesCount}</strong>
                  </div>
                  <div className="session-live-fact">
                    <span>Repetitions</span>
                    <strong>{actualTotalRepetitionsCount > 0 ? `${actualTotalRepetitionsCount} reps` : '-'}</strong>
                  </div>
                  <div className="session-live-fact">
                    <span>Blocs passes</span>
                    <strong>{skippedBlocksCount}</strong>
                  </div>
                  <div className="session-live-fact">
                    <span>Calories</span>
                    <strong>{formatEstimatedWorkoutCalories(estimatedCalories) || '-'}</strong>
                  </div>
                  <div className="session-live-fact">
                    <span>Volume reel</span>
                    <strong>{formatSessionVolumeKg(actualSessionVolume) || '-'}</strong>
                  </div>
                  <div className="session-live-fact">
                    <span>Taux de completion</span>
                    <strong>{formatPercent(completionRate)}</strong>
                  </div>
                </div>

                {historySaved && completionLevelProgress ? (
                  <div className="session-live-summary-panel">
                    <div className="session-live-summary-panel__top">
                      <div>
                        <span className="section-kicker">Progression Actyv</span>
                        <strong>{`Niveau ${completionLevelProgress.level}`}</strong>
                      </div>
                      <div className="session-live-summary-panel__xp">
                        <span>XP gagnee</span>
                        <strong>{`+${displayedEarnedXp} XP`}</strong>
                      </div>
                    </div>
                    <div className="session-live-summary-panel__progress">
                      <div className="session-live-summary-panel__progress-bar" aria-hidden="true">
                        <span style={{ width: `${completionLevelProgress.progressPercent}%` }} />
                      </div>
                      <p>{completionProgressLabel}</p>
                    </div>
                  </div>
                ) : null}

                {estimatedDurationSeconds ? (
                  <p className="session-live-total-time">
                    Duree estimee : {formatElapsedDuration(estimatedDurationSeconds)}
                  </p>
                ) : null}

                <div className={`session-live-save-banner session-live-save-banner--${saveState}`}>
                  <strong>{historySaved ? completionSummaryTitle || finishStateLabel : finishStateLabel}</strong>
                  <span>
                    {historySaved || saveState === 'success'
                      ? completionSummarySubtitle || `+${displayedEarnedXp} XP ajoutes`
                      : remainingBlocksCount > 0
                        ? 'Tu peux revenir aux blocs restants ou terminer maintenant la seance.'
                        : 'Tous les blocs sont termines. Valide maintenant la seance pour attribuer XP, badges et stats.'}
                  </span>
                </div>

                {historyMessage ? (
                  <p
                    className={`form-feedback ${
                      saveState === 'success' ? 'form-feedback--success' : 'form-feedback--error'
                    }`}
                  >
                    {historyMessage}
                  </p>
                ) : null}

                {primaryAwardedBadge ? (
                  <div className="session-live-badge-banner">
                    <div className="session-live-badge-banner__art">
                      <BadgeArtwork
                        badgeCode={primaryAwardedBadge.code}
                        badgeName={primaryAwardedBadge.label}
                        unlocked
                      />
                    </div>
                    <div className="session-live-badge-banner__copy">
                      <span className="section-kicker">Nouveau badge obtenu</span>
                      <strong>{primaryAwardedBadge.label}</strong>
                      <p>{primaryAwardedBadge.description}</p>
                    </div>
                  </div>
                ) : null}

                {awardedBadgeCodes.length > 1 ? (
                  <div className="session-live-records">
                    <div className="session-live-records__header">
                      <strong>Autres badges debloques</strong>
                      <span className="session-block-chip">BADGES</span>
                    </div>
                    <div className="program-card__facts">
                      {awardedBadgeCodes.slice(1).map((badgeCode) => (
                        <span key={badgeCode}>{getBadgeByCode(badgeCode)?.label || badgeCode}</span>
                      ))}
                    </div>
                  </div>
                ) : null}

                {newPersonalRecords.length > 0 ? (
                  <div className="session-live-records">
                    <div className="session-live-records__header">
                      <strong>Nouveaux records</strong>
                      <span className="session-block-chip">NEW PR</span>
                    </div>
                    <div className="session-records-list">
                      {newPersonalRecords.map((record, index) => (
                        <article
                          key={`${record.exerciseName}-${record.metric}-${index}`}
                          className="session-block-card session-record-card session-live-record-card"
                        >
                          <div className="session-block-card__top">
                            <div className="session-block-check__label">
                              <strong>{record.exerciseName}</strong>
                              <small>Nouveau record personnel</small>
                            </div>
                            <span className="session-block-chip">NEW PR</span>
                          </div>
                          <div className="session-record-lines">
                            <p>
                              Type :{' '}
                              <strong>
                                {record.metric === 'reps'
                                  ? 'Reps'
                                  : record.metric === 'charge'
                                    ? 'Charge'
                                    : record.metric === 'volume'
                                      ? 'Volume'
                                      : 'Duree'}
                              </strong>
                            </p>
                            <p>
                              Ancien :{' '}
                              <strong>{formatPersonalRecordValue(record.metric, record.previousValue)}</strong>
                            </p>
                            <p>
                              Nouveau :{' '}
                              <strong>{formatPersonalRecordValue(record.metric, record.value)}</strong>
                            </p>
                          </div>
                        </article>
                      ))}
                    </div>
                  </div>
                ) : null}

                <p className="session-live-finished__copy">
                  {historySaved
                    ? skippedBlocksCount > 0 || remainingBlocksCount > 0
                      ? 'La seance a bien ete enregistree en mode partiel.'
                      : 'La seance est bien enregistree.'
                    : remainingBlocksCount > 0
                      ? 'Tant que tu n as pas clique sur Terminer la seance, tu peux revenir sur les blocs restants.'
                      : 'Tous les blocs sont termines. Il ne reste plus qu a valider la seance.'}
                </p>

                <div className="session-live-actions session-live-actions--end">
                  <Link href="/sessions" className="button ghost">
                    Retour aux seances
                  </Link>
                  {dailySessionId ? (
                    <Link href="/session-du-jour" className="button ghost">
                      Retour Actyv Quotidien
                    </Link>
                  ) : null}
                  <button type="button" className="button primary" onClick={resetLiveProgress}>
                    Relancer la seance
                  </button>
                  {!historySaved ? (
                    <button
                      type="button"
                      className="button ghost"
                      onClick={remainingBlocksCount > 0 ? goToRemainingBlocks : () => setFinishReviewOpen(false)}
                    >
                      {remainingBlocksCount > 0 ? 'Revenir aux blocs restants' : 'Revenir a la seance'}
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className="button primary session-live-finish-button"
                    onClick={handleFinishSession}
                    disabled={saveState === 'saving' || historySaved}
                    aria-busy={saveState === 'saving'}
                  >
                    {saveState === 'saving'
                      ? 'Enregistrement...'
                      : historySaved || saveState === 'success'
                        ? 'Seance enregistree'
                        : remainingBlocksCount > 0
                          ? '🏁 Terminer la seance'
                          : '🏁 Valider la seance'}
                  </button>
                </div>
              </article>
            ) : isResting && currentBlock ? (
              <RestTimerOverlay
                blockLabel={restingBlockName}
                secondsLeft={restSecondsLeft}
                totalSeconds={restSourceBlockRestSeconds}
                onSkip={() => setRestSecondsLeft(0)}
                onAdd15={() => adjustRestSeconds(15)}
                onSubtract15={() => adjustRestSeconds(-15)}
                onNext={() => setRestSecondsLeft(0)}
                onPrevious={goToPrevious}
                canGoPrevious={currentIndex > 0}
              />
            ) : currentBlock ? (
              <>
                <LiveBlockCard
                  key={`${currentBlock.id}-${currentCompletedSets}`}
                  block={currentBlock}
                  blockIndex={currentIndex}
                  totalBlocks={blocks.length}
                  currentSeriesLabel={currentSeriesLabel}
                  statusLabel={currentStatusLabel}
                  isCompleted={completedBlockIds.includes(currentBlock.id)}
                  blockVolumeLabel={formatSessionVolumeKg(currentBlockVolume)}
                  actionLabel={
                    isExercising
                      ? awaitingExerciseCompletion
                        ? 'Terminer la serie'
                        : isDurationBlock
                          ? 'Terminer la serie'
                          : usesSetBySetValidation
                            ? 'Valider la serie'
                            : 'Terminer le bloc'
                      : currentCompletedSets > 0
                        ? 'Lancer la serie suivante'
                        : 'Lancer la serie'
                  }
                  actionHint={
                    isDurationBlock
                      ? isExercising
                        ? awaitingExerciseCompletion
                          ? 'Le chrono est termine. Confirme la serie pour passer au repos.'
                          : `Temps ecoule : ${formatTimerClock(
                              Number(currentBlock?.target_value ?? 0) - exerciseSecondsLeft
                            )} / ${formatTimerClock(Number(currentBlock?.target_value ?? 0))}`
                        : 'Lance la serie quand tu es pret.'
                      : isExercising
                        ? usesSetBySetValidation
                          ? 'La serie est en cours. Valide-la des que tu as termine.'
                          : "Le bloc est en cours. Termine-le quand tu as fini l'effort."
                        : usesSetBySetValidation
                          ? 'Lance puis valide chaque serie, avec repos entre les tours.'
                          : 'Lance ce bloc avant de pouvoir le terminer.'
                  }
                  validationFeedback={validationFeedback}
                  countdownLabel={isDurationBlock && isExercising && !awaitingExerciseCompletion ? formatTimerClock(exerciseSecondsLeft) : null}
                  onValidate={
                    !canValidateCurrentBlock
                      ? undefined
                      : isExercising
                        ? handleValidateCurrent
                        : handleStartCurrentSeries
                  }
                  actionDisabled={!canValidateCurrentBlock}
                />

                {canAdjustCurrentPerformance ? (
                  <article className="card session-live-performance-card">
                    <div className="session-live-performance-card__header">
                      <div>
                        <span className="section-kicker">Réalisé</span>
                        <h2>{currentBlock.block_type === 'free' ? 'Texte libre' : 'Lignes de série'}</h2>
                      </div>
                      <span className="session-block-chip">{currentSeriesLabel}</span>
                    </div>

                    <div className="session-live-performance-card__planned">
                      <span>Prévu</span>
                      <strong>
                        {formatLivePerformanceLineSummary(currentBlock.block_type, currentActivePerformanceLine)}
                      </strong>
                    </div>

                    <div className="session-live-performance-card__planned">
                      <span>Actif</span>
                      <strong>
                        {currentBlock.block_type === 'free'
                          ? currentActualText || 'Saisis ton texte libre'
                          : formatLivePerformanceLineSummary(currentBlock.block_type, currentActivePerformanceLine)}
                      </strong>
                    </div>

                    <div className="session-live-line-list">
                      {currentLivePerformanceLines.map((line, lineIndex) => {
                        const isActiveLine = lineIndex === currentActivePerformanceLineIndex;
                        const lineSummary = formatLivePerformanceLineSummary(currentBlock.block_type, line);

                        return (
                          <article
                            key={line.id}
                            className={`session-live-line-item${isActiveLine ? ' session-live-line-item--active' : ''}`}
                          >
                            <div className="session-live-line-item__top">
                              <div>
                                <span className="section-kicker">{`Ligne ${lineIndex + 1}`}</span>
                                <strong>{lineSummary}</strong>
                              </div>
                              {currentLivePerformanceLines.length > 1 ? (
                                <button
                                  type="button"
                                  className="button ghost session-live-line-item__remove"
                                  onClick={() => removeCurrentPerformanceLine(lineIndex)}
                                >
                                  Retirer
                                </button>
                              ) : null}
                            </div>

                            <div className="session-live-performance-grid session-live-performance-grid--dense">
                              <div className="session-live-performance-field">
                                <span>Séries</span>
                                <input
                                  type="number"
                                  min={1}
                                  inputMode="numeric"
                                  value={line.setsCount}
                                  onChange={(event) =>
                                    updateCurrentPerformanceLineAt(lineIndex, {
                                      setsCount: normalizePositiveInteger(event.target.value, 1),
                                    })
                                  }
                                />
                              </div>

                              {currentBlock.block_type === 'reps' ? (
                                <>
                                  <div className="session-live-performance-field">
                                    <span>Répétitions</span>
                                    <input
                                      type="number"
                                      min={0}
                                      inputMode="numeric"
                                      value={line.targetValue ?? 0}
                                      onChange={(event) =>
                                        updateCurrentPerformanceLineAt(lineIndex, {
                                          targetValue: normalizePositiveInteger(event.target.value, 0),
                                        })
                                      }
                                    />
                                  </div>
                                  <div className="session-live-performance-field">
                                    <span>Charge kg</span>
                                    <input
                                      type="number"
                                      min={0}
                                      step="0.5"
                                      inputMode="decimal"
                                      value={line.chargeKg ?? 0}
                                      onChange={(event) =>
                                        updateCurrentPerformanceLineAt(lineIndex, {
                                          chargeKg: normalizeNonNegativeNumber(event.target.value, 0),
                                        })
                                      }
                                    />
                                  </div>
                                </>
                              ) : currentBlock.block_type === 'duration' ? (
                                <div className="session-live-performance-field">
                                  <span>Durée (sec)</span>
                                  <input
                                    type="number"
                                    min={0}
                                    inputMode="numeric"
                                    value={line.targetValue ?? 0}
                                    onChange={(event) =>
                                      updateCurrentPerformanceLineAt(lineIndex, {
                                        targetValue: normalizePositiveInteger(event.target.value, 0),
                                      })
                                    }
                                  />
                                </div>
                              ) : currentBlock.block_type === 'distance' ? (
                                <div className="session-live-performance-field">
                                  <span>Distance</span>
                                  <input
                                    type="number"
                                    min={0}
                                    step="0.1"
                                    inputMode="decimal"
                                    value={line.targetValue ?? 0}
                                    onChange={(event) =>
                                      updateCurrentPerformanceLineAt(lineIndex, {
                                        targetValue: normalizeNonNegativeNumber(event.target.value, 0),
                                      })
                                    }
                                  />
                                </div>
                              ) : (
                                <div className="session-live-performance-field session-live-performance-field--full">
                                  <span>Texte libre</span>
                                  <textarea
                                    rows={2}
                                    value={line.note}
                                    onChange={(event) =>
                                      updateCurrentPerformanceLineAt(lineIndex, {
                                        note: event.target.value,
                                      })
                                    }
                                  />
                                </div>
                              )}
                            </div>
                          </article>
                        );
                      })}
                    </div>

                    <div className="session-live-performance-card__actions">
                      <button type="button" className="button ghost" onClick={addCurrentPerformanceLine}>
                        + Ajouter une ligne
                      </button>
                      {currentLivePerformanceTotalSets > 1 && currentCompletedSets < currentLivePerformanceTotalSets - 1 ? (
                        <button type="button" className="button ghost" onClick={applyCurrentPerformanceToRemainingSets}>
                          Appliquer aux séries restantes
                        </button>
                      ) : null}
                      <button type="button" className="button ghost" onClick={resetCurrentPerformanceDraft}>
                        Revenir au prévu
                      </button>
                    </div>
                  </article>
                ) : null}

                <div className="session-live-quick-stats">
                  <article className="card session-live-quick-stat">
                    <span>Bloc courant</span>
                    <strong>{getSessionBlockTypeLabel(currentBlock.block_type)}</strong>
                  </article>
                  <article className="card session-live-quick-stat">
                    <span>Progression bloc</span>
                    <strong>{currentSeriesLabel}</strong>
                  </article>
                  <article className="card session-live-quick-stat">
                    <span>Duree estimee</span>
                    <strong>{estimatedDurationSeconds ? formatElapsedDuration(estimatedDurationSeconds) : '-'}</strong>
                  </article>
                  <article className="card session-live-quick-stat">
                    <span>Volume reel</span>
                    <strong>{formatSessionVolumeKg(actualSessionVolume) || '-'}</strong>
                  </article>
                  <article className="card session-live-quick-stat">
                    <span>Calories live</span>
                    <strong>{formatEstimatedWorkoutCalories(estimatedCalories) || '-'}</strong>
                  </article>
                </div>

                <LiveControls
                  onPrevious={goToPrevious}
                  onNext={resolvedBlockIds.includes(currentBlock.id) ? goToNext : handleSkipCurrentBlock}
                  previousDisabled={currentIndex === 0}
                  nextDisabled={currentIndex >= blocks.length - 1 && resolvedBlockIds.includes(currentBlock.id)}
                  nextLabel={resolvedBlockIds.includes(currentBlock.id) ? 'Suivant' : 'Passer ce bloc'}
                />

                <div className="session-live-actions session-live-actions--inline">
                  <button
                    type="button"
                    className="button primary session-live-finish-button"
                    disabled={!canOpenFinishReview}
                    onClick={() => {
                      if (!canOpenFinishReview) return;
                      clearRestState();
                      clearExerciseState();
                      setFinishReviewOpen(true);
                    }}
                  >
                    🏁 Terminer la seance
                  </button>
                  <p className="session-live-actions__hint">{finishReviewHint}</p>
                </div>

                <article className="card session-live-rail-card">
                  <div className="session-live-rail-card__top">
                    <div>
                      <span className="section-kicker">Sequence complete</span>
                      <h2>Vue d ensemble</h2>
                    </div>
                    <span className="session-block-chip">{currentStatusLabel}</span>
                  </div>

                  <LiveSequenceList
                    blocks={blocks}
                    currentIndex={currentIndex}
                    completedBlockIds={completedBlockIds}
                    skippedBlockIds={skippedBlockIds}
                    completedSetsByBlockId={completedSetsByBlockId}
                    currentSeriesLabel={currentSeriesLabel}
                    currentStatusLabel={currentStatusLabel}
                    onSelect={goToBlockIndex}
                  />
                </article>

                <article className="card session-live-rail-card">
                  <div className="session-live-rail-card__top">
                    <div>
                      <span className="section-kicker">Apercu rapide</span>
                      <h2>Plan de seance</h2>
                    </div>
                    <span className="session-block-chip">
                      {allBlocksCompleted ? 'Termine' : isTimerPaused ? 'Pause' : 'En cours'}
                    </span>
                  </div>

                  <LiveBlockPreviewRail
                    blocks={blocks.map((block) => ({
                      id: block.id,
                      name: safeTrimText(block.name) || `Bloc ${block.position + 1}`,
                      block_type: block.block_type,
                    }))}
                    currentIndex={currentIndex}
                    completedBlockIds={completedBlockIds}
                    onSelect={goToBlockIndex}
                  />
                </article>
              </>
            ) : null}
          </>
        )}
      </section>
    </AppShell>
  );
}
