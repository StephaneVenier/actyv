'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { AppShell } from '@/components/AppShell';
import { queuePendingToast } from '@/components/ToastProvider';
import { formatSportBadgeLabel, getSportBadgeClassName } from '@/components/sport-badge';
import {
  formatEstimatedWorkoutCalories,
  formatSessionBlockSummary,
  formatSessionVolumeKg,
  getEstimatedWorkoutCalories,
  getSessionBlockTypeLabel,
  getSessionBlockVolumeKg,
} from '@/lib/session-blocks';
import { supabase } from '@/lib/supabase';
import { fetchTrainingSessionBlocks, TrainingSessionBlockRecord } from '@/lib/training-session-blocks-db';

type TrainingSession = {
  id: string;
  user_id: string;
  name: string;
  sport: string | null;
  description: string | null;
  created_at: string | null;
};

type WorkoutHistoryEntry = {
  id: string;
  workout_id: string | null;
  workout_name: string;
  completed_at: string;
  duration_seconds: number | null;
  total_volume: number | null;
  completed_exercises: number | null;
  estimated_calories?: number | null;
};

type WorkoutHistoryDebug = {
  currentWorkoutId: string;
  currentUserId: string;
  exactRows: number;
  matchedByWorkoutNameWithNullId: number;
  loadedRows: number;
  loadedWorkoutIds: string[];
  queryError: string | null;
};

function formatRelativeDate(dateString: string | null) {
  if (!dateString) return 'recentement';

  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return 'recentement';

  const diffHours = Math.round((date.getTime() - Date.now()) / (1000 * 60 * 60));
  const formatter = new Intl.RelativeTimeFormat('fr', { numeric: 'auto' });

  if (Math.abs(diffHours) < 24) {
    return formatter.format(diffHours, 'hour');
  }

  return formatter.format(Math.round(diffHours / 24), 'day');
}

function formatDurationLabel(durationSeconds: number | null | undefined) {
  const normalizedSeconds = Number(durationSeconds);

  if (!Number.isFinite(normalizedSeconds) || normalizedSeconds <= 0) {
    return null;
  }

  const totalSeconds = Math.floor(normalizedSeconds);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  if (minutes <= 0) {
    return `${seconds} sec`;
  }

  return `${minutes} min ${seconds.toString().padStart(2, '0')} sec`;
}

function formatChartDayLabel(dateString: string) {
  const date = new Date(dateString);

  if (Number.isNaN(date.getTime())) {
    return '-';
  }

  return date.toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
  });
}

function buildChartPath(points: Array<{ x: number; y: number }>) {
  if (points.length === 0) return '';

  return points
    .map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`)
    .join(' ');
}

export default function SessionDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params?.id as string;

  const [session, setSession] = useState<TrainingSession | null>(null);
  const [blocks, setBlocks] = useState<TrainingSessionBlockRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [completedBlockIds, setCompletedBlockIds] = useState<string[]>([]);
  const [lastLiveElapsedSeconds, setLastLiveElapsedSeconds] = useState(0);
  const [lastLiveCompletedCount, setLastLiveCompletedCount] = useState(0);
  const [historyEntries, setHistoryEntries] = useState<WorkoutHistoryEntry[]>([]);
  const [historyDebug, setHistoryDebug] = useState<WorkoutHistoryDebug | null>(null);

  const completionStorageKey = `actyv.session.completed.${id}`;
  const liveStorageKey = `actyv.session.live.${id}`;

  useEffect(() => {
    const loadSession = async () => {
      setLoading(true);
      setMessage(null);

      try {
        const {
          data: { user },
          error: userError,
        } = await supabase.auth.getUser();

        if (userError || !user) {
          if (userError) {
            console.error('Erreur chargement user seance :', userError);
          }
          setMessage('Connecte-toi pour consulter cette seance.');
          setSession(null);
          setBlocks([]);
          setHistoryEntries([]);
          setHistoryDebug(null);
          return;
        }

        const { data: sessionRow, error: sessionError } = await supabase
          .from('training_sessions')
          .select('id, user_id, name, sport, description, created_at')
          .eq('id', id)
          .eq('user_id', user.id)
          .maybeSingle();

        if (sessionError) {
          console.error('Erreur chargement detail seance :', sessionError);
          setMessage('Impossible de charger cette seance.');
          setSession(null);
          setBlocks([]);
          setHistoryEntries([]);
          setHistoryDebug(null);
          return;
        }

        if (!sessionRow) {
          setSession(null);
          setBlocks([]);
          setHistoryEntries([]);
          setHistoryDebug(null);
          return;
        }

        const currentSession = sessionRow as TrainingSession;
        setSession(currentSession);

        const { data: blockRows, error: blocksError } = await fetchTrainingSessionBlocks([id]);

        if (blocksError) {
          console.error('Erreur chargement blocs detail seance :', blocksError);
          setBlocks([]);
        } else {
          setBlocks(blockRows || []);
        }

        const { data: historyRows, error: historyError } = await supabase
          .from('workout_sessions_history')
          .select(
            'id, workout_id, workout_name, completed_at, duration_seconds, total_volume, completed_exercises, estimated_calories'
          )
          .eq('user_id', user.id)
          .eq('workout_id', currentSession.id)
          .order('completed_at', { ascending: true });

        if (historyError) {
          console.error('Erreur chargement historique detail seance :', historyError);
          setHistoryEntries([]);
          if (process.env.NODE_ENV === 'development') {
            console.log('WORKOUT HISTORY SELECT SESSION ID:', currentSession.id);
            console.log('WORKOUT HISTORY SELECT USER ID:', user.id);
            console.log('WORKOUT HISTORY SELECT DATA:', null);
            console.log('WORKOUT HISTORY SELECT ERROR:', historyError);
            setHistoryDebug({
              currentWorkoutId: currentSession.id,
              currentUserId: user.id,
              exactRows: 0,
              matchedByWorkoutNameWithNullId: 0,
              loadedRows: 0,
              loadedWorkoutIds: [],
              queryError: JSON.stringify(historyError),
            });
          } else {
            setHistoryDebug(null);
          }
        } else {
          const exactHistoryRows = (historyRows as WorkoutHistoryEntry[]) || [];
          let resolvedHistoryEntries = exactHistoryRows;
          let matchedByWorkoutNameWithNullId: WorkoutHistoryEntry[] = [];

          if (exactHistoryRows.length === 0) {
            const { data: fallbackRows, error: fallbackError } = await supabase
              .from('workout_sessions_history')
              .select(
                'id, workout_id, workout_name, completed_at, duration_seconds, total_volume, completed_exercises, estimated_calories'
              )
              .eq('user_id', user.id)
              .is('workout_id', null)
              .eq('workout_name', currentSession.name)
              .order('completed_at', { ascending: true });

            if (fallbackError) {
              console.error('Erreur chargement historique fallback detail seance :', fallbackError);
            } else {
              matchedByWorkoutNameWithNullId = (fallbackRows as WorkoutHistoryEntry[]) || [];
              if (matchedByWorkoutNameWithNullId.length > 0) {
                resolvedHistoryEntries = matchedByWorkoutNameWithNullId;
              }
            }
          }

          setHistoryEntries(resolvedHistoryEntries);

          if (process.env.NODE_ENV === 'development') {
            console.log('WORKOUT HISTORY SELECT SESSION ID:', currentSession.id);
            console.log('WORKOUT HISTORY SELECT USER ID:', user.id);
            console.log('WORKOUT HISTORY SELECT DATA:', exactHistoryRows);
            console.log('WORKOUT HISTORY SELECT ERROR:', null);
            setHistoryDebug({
              currentWorkoutId: currentSession.id,
              currentUserId: user.id,
              exactRows: exactHistoryRows.length,
              matchedByWorkoutNameWithNullId: matchedByWorkoutNameWithNullId.length,
              loadedRows: resolvedHistoryEntries.length,
              loadedWorkoutIds: resolvedHistoryEntries
                .map((entry) => entry.workout_id || 'null')
                .slice(0, 10),
              queryError: null,
            });
          } else {
            setHistoryDebug(null);
          }
        }
      } finally {
        setLoading(false);
      }
    };

    loadSession();
  }, [id]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    try {
      const savedValue = window.localStorage.getItem(completionStorageKey);
      if (!savedValue) {
        setCompletedBlockIds([]);
        return;
      }

      const parsedValue = JSON.parse(savedValue);
      setCompletedBlockIds(Array.isArray(parsedValue) ? parsedValue.filter(Boolean) : []);
    } catch (error) {
      console.error('Erreur lecture progression seance :', error);
      setCompletedBlockIds([]);
    }
  }, [completionStorageKey]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    try {
      const savedValue = window.localStorage.getItem(liveStorageKey);
      if (!savedValue) {
        setLastLiveElapsedSeconds(0);
        setLastLiveCompletedCount(0);
        return;
      }

      const parsedValue = JSON.parse(savedValue) as {
        elapsedSeconds?: number;
        completedBlockIds?: string[];
      };

      setLastLiveElapsedSeconds(
        typeof parsedValue.elapsedSeconds === 'number' && Number.isFinite(parsedValue.elapsedSeconds)
          ? Math.max(0, Math.floor(parsedValue.elapsedSeconds))
          : 0
      );
      setLastLiveCompletedCount(
        Array.isArray(parsedValue.completedBlockIds) ? parsedValue.completedBlockIds.filter(Boolean).length : 0
      );
    } catch (error) {
      console.error('Erreur lecture progression live seance :', error);
      setLastLiveElapsedSeconds(0);
      setLastLiveCompletedCount(0);
    }
  }, [liveStorageKey]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const validBlockIds = new Set(blocks.map((block) => block.id));
    const sanitizedIds = completedBlockIds.filter((blockId) => validBlockIds.has(blockId));

    if (sanitizedIds.length !== completedBlockIds.length) {
      setCompletedBlockIds(sanitizedIds);
      return;
    }

    try {
      if (sanitizedIds.length === 0) {
        window.localStorage.removeItem(completionStorageKey);
      } else {
        window.localStorage.setItem(completionStorageKey, JSON.stringify(sanitizedIds));
      }
    } catch (error) {
      console.error('Erreur sauvegarde progression seance :', error);
    }
  }, [blocks, completedBlockIds, completionStorageKey]);

  const totalStructuredBlocks = useMemo(
    () => blocks.filter((block) => block.block_type !== 'free').length,
    [blocks]
  );

  const completedBlocksCount = useMemo(
    () => blocks.filter((block) => completedBlockIds.includes(block.id)).length,
    [blocks, completedBlockIds]
  );

  const allBlocksCompleted = blocks.length > 0 && completedBlocksCount === blocks.length;
  const lastLiveWasCompleted = blocks.length > 0 && lastLiveCompletedCount === blocks.length;
  const estimatedCalories = useMemo(
    () =>
      lastLiveWasCompleted
        ? getEstimatedWorkoutCalories(lastLiveElapsedSeconds, session?.sport)
        : null,
    [lastLiveElapsedSeconds, lastLiveWasCompleted, session?.sport]
  );
  const sessionTotalVolume = useMemo(
    () =>
      blocks.reduce((total, block) => {
        const volume = getSessionBlockVolumeKg(
          block.block_type,
          block.target_value,
          block.sets_count,
          block.charge_kg
        );
        return total + (volume ?? 0);
      }, 0),
    [blocks]
  );
  const totalSets = useMemo(
    () =>
      blocks.reduce((total, block) => total + Math.max(Number(block.sets_count || 1), 1), 0),
    [blocks]
  );
  const totalRealizations = historyEntries.length;
  const completedDurationEntries = historyEntries.filter(
    (entry) => Number.isFinite(Number(entry.duration_seconds)) && Number(entry.duration_seconds) > 0
  );
  const averageDurationSeconds =
    completedDurationEntries.length > 0
      ? Math.round(
          completedDurationEntries.reduce((total, entry) => total + Number(entry.duration_seconds || 0), 0) /
            completedDurationEntries.length
        )
      : null;
  const averageCalories =
    completedDurationEntries.length > 0
      ? Math.round(
          completedDurationEntries.reduce(
            (total, entry) =>
              total +
                (Number.isFinite(Number(entry.estimated_calories))
                  ? Number(entry.estimated_calories)
                  : getEstimatedWorkoutCalories(entry.duration_seconds, session?.sport) || 0),
            0
          ) / completedDurationEntries.length
        )
      : null;
  const bestVolume =
    historyEntries.length > 0
      ? historyEntries.reduce((best, entry) => Math.max(best, Number(entry.total_volume || 0)), 0)
      : 0;
  const lastCompletedAt = historyEntries[0]?.completed_at || null;
  const progressionData = useMemo(() => {
    const sortedEntries = [...historyEntries]
      .sort(
        (left, right) =>
          new Date(left.completed_at).getTime() - new Date(right.completed_at).getTime()
      )
      .slice(-10);

    const metricCandidates = sortedEntries.map((entry) => ({
      id: entry.id,
      label: formatChartDayLabel(entry.completed_at),
      completedAt: entry.completed_at,
      volume: Number.isFinite(Number(entry.total_volume)) ? Number(entry.total_volume) : 0,
      duration: Number.isFinite(Number(entry.duration_seconds)) ? Number(entry.duration_seconds) : 0,
      calories: getEstimatedWorkoutCalories(entry.duration_seconds, session?.sport) || 0,
    }));

    const hasVolume = metricCandidates.some((entry) => entry.volume > 0);
    const hasDuration = metricCandidates.some((entry) => entry.duration > 0);
    const hasCalories = metricCandidates.some((entry) => entry.calories > 0);

    const metricKey = hasVolume ? 'volume' : hasDuration ? 'duration' : hasCalories ? 'calories' : null;

    if (!metricKey) {
      return {
        entries: [] as Array<{
          id: string;
          label: string;
          rawValue: number;
          formattedValue: string | null;
        }>,
        metricLabel: null as string | null,
      };
    }

    const entries = metricCandidates.map((entry) => {
      const rawValue = metricKey === 'volume' ? entry.volume : metricKey === 'duration' ? entry.duration : entry.calories;
      return {
        id: entry.id,
        label: entry.label,
        rawValue,
        formattedValue:
          metricKey === 'volume'
            ? formatSessionVolumeKg(rawValue)
            : metricKey === 'duration'
              ? formatDurationLabel(rawValue)
              : formatEstimatedWorkoutCalories(rawValue),
      };
    });

    return {
      entries,
      metricLabel:
        metricKey === 'volume'
          ? 'Volume total'
          : metricKey === 'duration'
            ? 'Duree totale'
            : 'Calories estimees',
    };
  }, [historyEntries, id, session?.sport]);
  const chartMetricEntries = progressionData.entries;
  const chartMetricLabel = progressionData.metricLabel;
  const chartMaxValue = useMemo(
    () => Math.max(...chartMetricEntries.map((entry) => entry.rawValue), 0),
    [chartMetricEntries]
  );
  const singleProgressEntry = chartMetricEntries.length === 1 ? chartMetricEntries[0] : null;
  const chartPoints = useMemo(() => {
    if (chartMetricEntries.length < 2 || chartMaxValue <= 0) {
      return [] as Array<{ x: number; y: number; label: string; formattedValue: string | null }>;
    }

    const chartWidth = 100;
    const chartHeight = 100;
    const stepX = chartMetricEntries.length === 1 ? chartWidth / 2 : chartWidth / (chartMetricEntries.length - 1);

    return chartMetricEntries.map((entry, index) => {
      const ratio = chartMaxValue > 0 ? entry.rawValue / chartMaxValue : 0;
      return {
        x: Number((index * stepX).toFixed(2)),
        y: Number((chartHeight - ratio * chartHeight).toFixed(2)),
        label: entry.label,
        formattedValue: entry.formattedValue,
      };
    });
  }, [chartMaxValue, chartMetricEntries]);
  const chartPath = useMemo(() => buildChartPath(chartPoints), [chartPoints]);

  const toggleBlockCompleted = (blockId: string) => {
    setCompletedBlockIds((current) =>
      current.includes(blockId)
        ? current.filter((value) => value !== blockId)
        : [...current, blockId]
    );
  };

  const handleDeleteSession = async () => {
    if (!session || deleting) return;

    const confirmed = window.confirm(
      'Supprimer cette seance ? Tous les blocs lies seront supprimes aussi.'
    );

    if (!confirmed) return;

    setDeleting(true);
    setMessage(null);

    try {
      const { error } = await supabase.from('training_sessions').delete().eq('id', session.id);

      if (error) {
        console.error('Erreur suppression seance :', error);
        setMessage("Impossible de supprimer la seance pour le moment.");
        return;
      }

      queuePendingToast({ message: 'Seance supprimee', tone: 'info' });
      router.push('/sessions');
    } catch (error) {
      console.error('Erreur inattendue suppression seance :', error);
      setMessage("Une erreur inattendue s'est produite.");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <AppShell>
      <section className="sessions-page">
        <Link href="/sessions" className="detail-back-link">
          ← Retour aux seances
        </Link>

        {loading ? (
          <div className="challenge-state">
            <p>Chargement de la seance...</p>
          </div>
        ) : !session ? (
          <div className="challenge-state">
            <p>{message || 'Cette seance est introuvable.'}</p>
            <div className="session-empty-actions">
              <Link href="/sessions" className="button primary">
                Revenir a mes seances
              </Link>
            </div>
          </div>
        ) : (
          <>
            <article className="card session-hero-card">
              <div className="session-hero-copy">
                <div className={getSportBadgeClassName(session.sport, 'badge', 'Sport')}>
                  {formatSportBadgeLabel(session.sport, 'Sport')}
                </div>
                <h1>{session.name}</h1>
                <p className="muted">{session.description || 'Aucune description pour le moment.'}</p>
              </div>

              <div className="session-hero-actions">
                <Link href={`/sessions/${session.id}/live`} className="button primary">
                  Lancer la seance
                </Link>
                <Link href={`/sessions/${session.id}/edit`} className="button ghost">
                  Modifier la seance
                </Link>
                <Link href="/sessions/new" className="button ghost">
                  Creer une autre seance
                </Link>
                <button
                  type="button"
                  className="button ghost session-delete-button"
                  onClick={handleDeleteSession}
                  disabled={deleting}
                  aria-busy={deleting}
                >
                  {deleting ? 'Suppression...' : 'Supprimer la seance'}
                </button>
              </div>

              <div className="session-detail-meta">
                <div className="session-meta-card">
                  <span>Creee</span>
                  <strong>{formatRelativeDate(session.created_at)}</strong>
                </div>
                <div className="session-meta-card">
                  <span>Blocs</span>
                  <strong>{blocks.length}</strong>
                </div>
                <div className="session-meta-card">
                  <span>Blocs structures</span>
                  <strong>{totalStructuredBlocks}</strong>
                </div>
                <div className="session-meta-card">
                  <span>Volume total</span>
                  <strong>{formatSessionVolumeKg(sessionTotalVolume) || '-'}</strong>
                </div>
                <div className="session-meta-card">
                  <span>Calories estimees</span>
                  <strong>{formatEstimatedWorkoutCalories(estimatedCalories) || '-'}</strong>
                </div>
              </div>
            </article>

            <article className="card session-form-card stack">
              <div className="session-blocks-header">
                <div>
                  <span className="section-kicker">Stats</span>
                  <h2>Stats de la seance</h2>
                </div>
              </div>

              <div className="session-detail-meta">
                <div className="session-meta-card">
                  <span>Exercices</span>
                  <strong>{blocks.length}</strong>
                </div>
                <div className="session-meta-card">
                  <span>Series totales</span>
                  <strong>{totalSets}</strong>
                </div>
                <div className="session-meta-card">
                  <span>Volume prevu</span>
                  <strong>{formatSessionVolumeKg(sessionTotalVolume) || '-'}</strong>
                </div>
                <div className="session-meta-card">
                  <span>Seances realisees</span>
                  <strong>{totalRealizations}</strong>
                </div>
                <div className="session-meta-card">
                  <span>Duree moyenne</span>
                  <strong>{formatDurationLabel(averageDurationSeconds) || '-'}</strong>
                </div>
                <div className="session-meta-card">
                  <span>Calories moyennes</span>
                  <strong>{formatEstimatedWorkoutCalories(averageCalories) || '-'}</strong>
                </div>
                <div className="session-meta-card">
                  <span>Meilleur volume</span>
                  <strong>{bestVolume > 0 ? formatSessionVolumeKg(bestVolume) : '-'}</strong>
                </div>
                <div className="session-meta-card">
                  <span>Dernier entrainement</span>
                  <strong>{lastCompletedAt ? formatRelativeDate(lastCompletedAt) : '-'}</strong>
                </div>
              </div>

              {historyEntries.length === 0 && (
                <div className="challenge-state challenge-state--compact">
                  <p>Pas encore de seance realisee.</p>
                </div>
              )}
            </article>

            {process.env.NODE_ENV === 'development' && historyDebug ? (
              <article className="card session-form-card stack">
                <div className="session-blocks-header">
                  <div>
                    <span className="section-kicker">Debug</span>
                    <h2>Historique charge</h2>
                  </div>
                </div>
                <div className="challenge-state challenge-state--compact">
                  <p>Workout courant : {historyDebug.currentWorkoutId}</p>
                  <p>User courant : {historyDebug.currentUserId}</p>
                  <p>Matches workout_id exact : {historyDebug.exactRows}</p>
                  <p>Matches nom + id null : {historyDebug.matchedByWorkoutNameWithNullId}</p>
                  <p>Historique retenu : {historyDebug.loadedRows}</p>
                  <p>Workout ids charges : {historyDebug.loadedWorkoutIds.join(', ') || '-'}</p>
                  <p>Erreur requete : {historyDebug.queryError || 'aucune'}</p>
                </div>
              </article>
            ) : null}

            <article className="card session-form-card stack">
              <div className="session-blocks-header">
                <div>
                  <span className="section-kicker">Progression</span>
                  <h2>Progression</h2>
                </div>
              </div>

              {chartMetricEntries.length === 0 || chartMaxValue <= 0 ? (
                <div className="challenge-state challenge-state--compact">
                  <p>Pas encore assez de donnees.</p>
                </div>
              ) : singleProgressEntry ? (
                <div className="session-progress-chart session-progress-chart--single">
                  <div className="session-progress-chart__header">
                    <span>{chartMetricLabel}</span>
                    <strong>1 seance</strong>
                  </div>

                  <article className="session-block-card">
                    <div className="session-block-card__top">
                      <div className="session-block-check__label">
                        <strong>{singleProgressEntry.formattedValue || '-'}</strong>
                        <small>{singleProgressEntry.label}</small>
                      </div>
                    </div>
                  </article>
                </div>
              ) : (
                <div className="session-progress-chart">
                  <div className="session-progress-chart__header">
                    <span>{chartMetricLabel || 'Progression'}</span>
                    <strong>{chartMetricEntries.length} derniere(s) seance(s)</strong>
                  </div>

                  <div className="session-progress-chart__svg-wrap">
                    <svg viewBox="0 0 100 100" className="session-progress-chart__svg" preserveAspectRatio="none">
                      <path d="M 0 100 L 100 100" className="session-progress-chart__axis" />
                      <path d={chartPath} className="session-progress-chart__line" />
                      {chartPoints.map((point) => (
                        <circle
                          key={point.label + point.x}
                          cx={point.x}
                          cy={point.y}
                          r="2.8"
                          className="session-progress-chart__point"
                        />
                      ))}
                    </svg>

                    <div className="session-progress-chart__labels">
                      {chartMetricEntries.map((entry) => (
                        <div key={entry.id} className="session-progress-chart__label-item">
                          <strong>{entry.formattedValue || '-'}</strong>
                          <span>{entry.label}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </article>

            <article className="card session-form-card stack">
              <div className="session-blocks-header">
                <div>
                  <span className="section-kicker">Blocs</span>
                  <h2>Plan de la seance</h2>
                </div>
                {blocks.length > 0 && (
                  <span className="session-progress-pill">
                    {completedBlocksCount} / {blocks.length} blocs realises
                  </span>
                )}
              </div>

              {message && <p className="form-feedback form-feedback--error">{message}</p>}

              {allBlocksCompleted && (
                <p className="form-feedback form-feedback--success">Seance terminee ✅</p>
              )}

              {blocks.length === 0 ? (
                <div className="challenge-state challenge-state--compact">
                  <p>Aucun bloc ajoute pour le moment.</p>
                </div>
              ) : (
                <div className="session-block-list">
                  {blocks.map((block) => (
                    (() => {
                      const blockVolume = getSessionBlockVolumeKg(
                        block.block_type,
                        block.target_value,
                        block.sets_count,
                        block.charge_kg
                      );

                      return (
                        <article
                          key={block.id}
                          className={`session-block-card${
                            completedBlockIds.includes(block.id) ? ' session-block-card--completed' : ''
                          }`}
                        >
                          <div className="session-block-card__top">
                            <label className="session-block-check">
                              <input
                                type="checkbox"
                                checked={completedBlockIds.includes(block.id)}
                                onChange={() => toggleBlockCompleted(block.id)}
                                aria-label={`Marquer ${block.name} comme realise`}
                              />
                              <span className="session-block-check__label">
                                <strong>
                                  {block.position + 1}. {block.name}
                                </strong>
                                <small>
                                  {completedBlockIds.includes(block.id) ? 'Bloc realise' : 'A realiser'}
                                </small>
                              </span>
                            </label>
                            <span className="session-block-chip">{getSessionBlockTypeLabel(block.block_type)}</span>
                          </div>
                          <p className="session-block-preview">
                            Objectif :{' '}
                            <strong>
                              {formatSessionBlockSummary(
                                block.block_type,
                                block.target_value,
                                block.sets_count,
                                block.charge_kg
                              )}
                            </strong>
                          </p>
                          {blockVolume ? (
                            <p className="session-block-volume">Volume : {formatSessionVolumeKg(blockVolume)}</p>
                          ) : null}
                        </article>
                      );
                    })()
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
