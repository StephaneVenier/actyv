'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { AppShell } from '@/components/AppShell';
import { UserLevelBadge } from '@/components/user-level-badge';
import {
  formatEstimatedWorkoutCalories,
  formatSessionVolumeKg,
  getEstimatedWorkoutCalories,
} from '@/lib/session-blocks';
import { supabase } from '@/lib/supabase';

type Profile = {
  id: string;
  email: string | null;
  username: string | null;
  level: number | null;
};

type WorkoutHistoryEntry = {
  id: string;
  workout_id: string | null;
  workout_name: string;
  completed_at: string;
  duration_seconds: number | null;
  estimated_calories: number | null;
  total_volume: number | null;
  completed_exercises: number | null;
};

type WorkoutExerciseHistoryEntry = {
  id: string;
  workout_id: string;
  exercise_name: string;
  block_type: 'reps' | 'duration' | 'distance' | 'free' | null;
  sets_count: number | null;
  reps: number | null;
  duration_seconds: number | null;
  distance: number | null;
  charge_kg: number | null;
  volume: number | null;
  completed_at: string;
};

type Challenge = {
  id: string;
  created_by: string | null;
};

type ChallengeLink = {
  challenge_id: string;
};

type ExerciseStatsCard = {
  exerciseName: string;
  completedCount: number;
  lastCompletedAt: string | null;
  maxChargeKg: number | null;
  bestVolumeKg: number | null;
  maxReps: number | null;
  bestDurationSeconds: number | null;
  progressionEntries: Array<{
    id: string;
    label: string;
    rawValue: number;
    formattedValue: string | null;
  }>;
  progressionMetricLabel: string | null;
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
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours} h ${minutes.toString().padStart(2, '0')} min`;
  }

  if (minutes > 0) {
    return `${minutes} min ${seconds.toString().padStart(2, '0')} sec`;
  }

  return `${seconds} sec`;
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

export default function StatsPage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [workoutHistory, setWorkoutHistory] = useState<WorkoutHistoryEntry[]>([]);
  const [exerciseHistory, setExerciseHistory] = useState<WorkoutExerciseHistoryEntry[]>([]);
  const [createdChallengesCount, setCreatedChallengesCount] = useState(0);
  const [joinedChallengesCount, setJoinedChallengesCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [selectedExerciseName, setSelectedExerciseName] = useState<string | null>(null);

  useEffect(() => {
    const loadStats = async () => {
      setLoading(true);
      setMessage(null);

      try {
        const {
          data: { user },
          error: userError,
        } = await supabase.auth.getUser();

        if (userError || !user) {
          if (userError) {
            console.error('Erreur chargement user statistiques :', userError);
          }
          setMessage('Connecte-toi pour voir tes statistiques.');
          setProfile(null);
          setWorkoutHistory([]);
          setExerciseHistory([]);
          setCreatedChallengesCount(0);
          setJoinedChallengesCount(0);
          return;
        }

        const [profileResponse, workoutHistoryResponse, exerciseHistoryResponse, challengesResponse, membersResponse, legacyMembersResponse, participantsResponse] =
          await Promise.all([
            supabase.from('profiles').select('id, email, username, level').eq('id', user.id).maybeSingle(),
            supabase
              .from('workout_sessions_history')
              .select(
                'id, workout_id, workout_name, completed_at, duration_seconds, estimated_calories, total_volume, completed_exercises'
              )
              .eq('user_id', user.id)
              .order('completed_at', { ascending: false }),
            supabase
              .from('workout_exercise_history')
              .select(
                'id, workout_id, exercise_name, block_type, sets_count, reps, duration_seconds, distance, charge_kg, volume, completed_at'
              )
              .eq('user_id', user.id)
              .order('completed_at', { ascending: true }),
            supabase.from('challenges').select('id, created_by').eq('created_by', user.id).eq('is_deleted', false),
            user.id
              ? supabase.from('challenge_members').select('challenge_id, user_id, user_email').eq('user_id', user.id)
              : Promise.resolve({ data: [], error: null }),
            user.email
              ? supabase.from('challenge_members').select('challenge_id, user_id, user_email').eq('user_email', user.email)
              : Promise.resolve({ data: [], error: null }),
            supabase.from('challenge_participants').select('challenge_id').eq('user_id', user.id),
          ]);

        if (profileResponse.error) {
          console.error('Erreur chargement profil statistiques :', profileResponse.error);
        }

        setProfile(
          (profileResponse.data as Profile | null) || {
            id: user.id,
            email: user.email || null,
            username: null,
            level: 1,
          }
        );

        if (workoutHistoryResponse.error) {
          console.error('Erreur chargement historique seances statistiques :', workoutHistoryResponse.error);
          setWorkoutHistory([]);
        } else {
          setWorkoutHistory((workoutHistoryResponse.data as WorkoutHistoryEntry[] | null) || []);
        }

        if (exerciseHistoryResponse.error) {
          console.error('Erreur chargement historique exercices statistiques :', exerciseHistoryResponse.error);
          setExerciseHistory([]);
        } else {
          setExerciseHistory((exerciseHistoryResponse.data as WorkoutExerciseHistoryEntry[] | null) || []);
        }

        if (challengesResponse.error) {
          console.error('Erreur chargement challenges crees statistiques :', challengesResponse.error);
          setCreatedChallengesCount(0);
        } else {
          setCreatedChallengesCount(((challengesResponse.data as Challenge[] | null) || []).length);
        }

        if (membersResponse.error) {
          console.error('Erreur chargement challenge_members statistiques :', membersResponse.error);
        }
        if (legacyMembersResponse.error) {
          console.error('Erreur chargement challenge_members legacy statistiques :', legacyMembersResponse.error);
        }
        if (participantsResponse.error) {
          console.error('Erreur chargement challenge_participants statistiques :', participantsResponse.error);
        }

        let joinedChallengeIdsFromMembers =
          ((membersResponse.data as ChallengeLink[] | null) || []).map((entry) => entry.challenge_id);

        joinedChallengeIdsFromMembers = [
          ...joinedChallengeIdsFromMembers,
          ...(((legacyMembersResponse.data as ChallengeLink[] | null) || []).map(
            (entry) => entry.challenge_id
          )),
        ];

        const joinedChallengeIds = new Set<string>([
          ...joinedChallengeIdsFromMembers,
          ...(((participantsResponse.data as ChallengeLink[] | null) || []).map((entry) => entry.challenge_id)),
        ]);
        setJoinedChallengesCount(joinedChallengeIds.size);
      } finally {
        setLoading(false);
      }
    };

    loadStats();
  }, []);

  const totalWorkouts = workoutHistory.length;
  const totalDurationSeconds = workoutHistory.reduce(
    (sum, entry) => sum + (Number.isFinite(Number(entry.duration_seconds)) ? Number(entry.duration_seconds) : 0),
    0
  );
  const totalCalories = workoutHistory.reduce(
    (sum, entry) => sum + (Number.isFinite(Number(entry.estimated_calories)) ? Number(entry.estimated_calories) : 0),
    0
  );
  const totalVolume = workoutHistory.reduce(
    (sum, entry) => sum + (Number.isFinite(Number(entry.total_volume)) ? Number(entry.total_volume) : 0),
    0
  );

  const progressionData = useMemo(() => {
    const sortedEntries = [...workoutHistory]
      .sort((left, right) => new Date(left.completed_at).getTime() - new Date(right.completed_at).getTime())
      .slice(-10);

    const metricCandidates = sortedEntries.map((entry) => ({
      id: entry.id,
      label: formatChartDayLabel(entry.completed_at),
      volume: Number.isFinite(Number(entry.total_volume)) ? Number(entry.total_volume) : 0,
      duration: Number.isFinite(Number(entry.duration_seconds)) ? Number(entry.duration_seconds) : 0,
      calories:
        Number.isFinite(Number(entry.estimated_calories)) && Number(entry.estimated_calories) > 0
          ? Number(entry.estimated_calories)
          : 0,
    }));

    const metricKey = metricCandidates.some((entry) => entry.volume > 0)
      ? 'volume'
      : metricCandidates.some((entry) => entry.duration > 0)
        ? 'duration'
        : metricCandidates.some((entry) => entry.calories > 0)
          ? 'calories'
          : null;

    if (!metricKey) {
      return { entries: [] as Array<{ id: string; label: string; rawValue: number; formattedValue: string | null }>, metricLabel: null as string | null };
    }

    return {
      entries: metricCandidates.map((entry) => {
        const rawValue =
          metricKey === 'volume' ? entry.volume : metricKey === 'duration' ? entry.duration : entry.calories;
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
      }),
      metricLabel:
        metricKey === 'volume' ? 'Volume total' : metricKey === 'duration' ? 'Duree totale' : 'Calories estimees',
    };
  }, [workoutHistory]);

  const chartMetricEntries = progressionData.entries;
  const chartMaxValue = useMemo(
    () => Math.max(...chartMetricEntries.map((entry) => entry.rawValue), 0),
    [chartMetricEntries]
  );
  const chartPoints = useMemo(() => {
    if (chartMetricEntries.length < 2 || chartMaxValue <= 0) {
      return [] as Array<{ x: number; y: number; label: string; formattedValue: string | null }>;
    }

    const stepX = chartMetricEntries.length === 1 ? 50 : 100 / (chartMetricEntries.length - 1);
    return chartMetricEntries.map((entry, index) => ({
      x: Number((index * stepX).toFixed(2)),
      y: Number((100 - (entry.rawValue / chartMaxValue) * 100).toFixed(2)),
      label: entry.label,
      formattedValue: entry.formattedValue,
    }));
  }, [chartMetricEntries, chartMaxValue]);
  const chartPath = useMemo(() => buildChartPath(chartPoints), [chartPoints]);

  const exerciseStatsCards = useMemo<ExerciseStatsCard[]>(() => {
    if (exerciseHistory.length === 0) {
      return [];
    }

    const groupedEntries = new Map<string, WorkoutExerciseHistoryEntry[]>();
    exerciseHistory.forEach((entry) => {
      const exerciseName = entry.exercise_name.trim();
      if (!exerciseName) return;
      const key = exerciseName.toLowerCase();
      const currentEntries = groupedEntries.get(key) || [];
      currentEntries.push(entry);
      groupedEntries.set(key, currentEntries);
    });

    return [...groupedEntries.entries()]
      .map(([, entries]) => {
        const sortedEntries = [...entries].sort(
          (left, right) => new Date(left.completed_at).getTime() - new Date(right.completed_at).getTime()
        );
        const latestEntry = sortedEntries[sortedEntries.length - 1] || null;
        const exerciseName = latestEntry?.exercise_name || entries[0]?.exercise_name || 'Exercice';
        const maxChargeKg = sortedEntries.reduce((best, entry) => Math.max(best, Number(entry.charge_kg || 0)), 0);
        const bestVolumeKg = sortedEntries.reduce((best, entry) => Math.max(best, Number(entry.volume || 0)), 0);
        const maxReps = sortedEntries.reduce((best, entry) => Math.max(best, Number(entry.reps || 0)), 0);
        const bestDurationSeconds = sortedEntries.reduce(
          (best, entry) => Math.max(best, Number(entry.duration_seconds || 0)),
          0
        );

        const progressionCandidates = sortedEntries.slice(-10).map((entry) => ({
          id: entry.id,
          label: formatChartDayLabel(entry.completed_at),
          volume: Number(entry.volume || 0),
          charge: Number(entry.charge_kg || 0),
          reps: Number(entry.reps || 0),
          duration: Number(entry.duration_seconds || 0),
        }));

        const metricKey = progressionCandidates.some((entry) => entry.volume > 0)
          ? 'volume'
          : progressionCandidates.some((entry) => entry.charge > 0)
            ? 'charge'
            : progressionCandidates.some((entry) => entry.reps > 0)
              ? 'reps'
              : progressionCandidates.some((entry) => entry.duration > 0)
                ? 'duration'
                : null;

        return {
          exerciseName,
          completedCount: sortedEntries.length,
          lastCompletedAt: latestEntry?.completed_at || null,
          maxChargeKg: maxChargeKg > 0 ? maxChargeKg : null,
          bestVolumeKg: bestVolumeKg > 0 ? bestVolumeKg : null,
          maxReps: maxReps > 0 ? maxReps : null,
          bestDurationSeconds: bestDurationSeconds > 0 ? bestDurationSeconds : null,
          progressionEntries:
            metricKey === null
              ? []
              : progressionCandidates.map((entry) => {
                  const rawValue =
                    metricKey === 'volume'
                      ? entry.volume
                      : metricKey === 'charge'
                        ? entry.charge
                        : metricKey === 'reps'
                          ? entry.reps
                          : entry.duration;

                  return {
                    id: entry.id,
                    label: entry.label,
                    rawValue,
                    formattedValue:
                      metricKey === 'volume'
                        ? formatSessionVolumeKg(rawValue)
                        : metricKey === 'charge'
                          ? `${rawValue} kg`
                          : metricKey === 'reps'
                            ? `${rawValue} reps`
                            : formatDurationLabel(rawValue),
                  };
                }),
          progressionMetricLabel:
            metricKey === 'volume'
              ? 'Volume'
              : metricKey === 'charge'
                ? 'Charge'
                : metricKey === 'reps'
                  ? 'Reps'
                  : metricKey === 'duration'
                    ? 'Duree'
                    : null,
        };
      })
      .sort((left, right) => left.exerciseName.localeCompare(right.exerciseName, 'fr'));
  }, [exerciseHistory]);

  useEffect(() => {
    if (exerciseStatsCards.length === 0) {
      setSelectedExerciseName(null);
      return;
    }

    if (!selectedExerciseName || !exerciseStatsCards.some((entry) => entry.exerciseName === selectedExerciseName)) {
      setSelectedExerciseName(exerciseStatsCards[0].exerciseName);
    }
  }, [exerciseStatsCards, selectedExerciseName]);

  const selectedExerciseStats =
    exerciseStatsCards.find((entry) => entry.exerciseName === selectedExerciseName) || exerciseStatsCards[0] || null;
  const selectedExerciseChartEntries = selectedExerciseStats?.progressionEntries || [];
  const selectedExerciseSingleEntry =
    selectedExerciseChartEntries.length === 1 ? selectedExerciseChartEntries[0] : null;
  const selectedExerciseChartMaxValue = useMemo(
    () => Math.max(...selectedExerciseChartEntries.map((entry) => entry.rawValue), 0),
    [selectedExerciseChartEntries]
  );
  const selectedExerciseChartPoints = useMemo(() => {
    if (selectedExerciseChartEntries.length < 2 || selectedExerciseChartMaxValue <= 0) {
      return [] as Array<{ x: number; y: number; label: string; formattedValue: string | null }>;
    }

    const stepX = selectedExerciseChartEntries.length === 1 ? 50 : 100 / (selectedExerciseChartEntries.length - 1);
    return selectedExerciseChartEntries.map((entry, index) => ({
      x: Number((index * stepX).toFixed(2)),
      y: Number((100 - (entry.rawValue / selectedExerciseChartMaxValue) * 100).toFixed(2)),
      label: entry.label,
      formattedValue: entry.formattedValue,
    }));
  }, [selectedExerciseChartEntries, selectedExerciseChartMaxValue]);
  const selectedExerciseChartPath = useMemo(
    () => buildChartPath(selectedExerciseChartPoints),
    [selectedExerciseChartPoints]
  );

  const recentWorkouts = workoutHistory.slice(0, 8);
  const topPersonalRecords = exerciseStatsCards.slice(0, 8);

  if (loading) {
    return (
      <AppShell>
        <div className="card">
          <h1>Statistiques</h1>
          <p>Chargement...</p>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="profile-page">
        <section className="card profile-hero-card">
          <div className="profile-hero-main">
            <div className="profile-hero-copy">
              <span className="section-kicker">Statistiques</span>
              <div className="profile-hero-heading">
                <h1>Mes statistiques</h1>
                <UserLevelBadge level={profile?.level} />
              </div>
              <p className="muted">
                Toutes tes donnees d&apos;entrainement, tes records et ta progression au meme endroit.
              </p>
            </div>

            <div className="profile-actions">
              <Link href="/profile" className="button ghost">
                Retour au profil
              </Link>
              <Link href="/sessions" className="button primary">
                Voir mes seances
              </Link>
            </div>
          </div>
        </section>

        {message && <p className="form-feedback form-feedback--error">{message}</p>}

        <section className="profile-stats-grid">
          <article className="card stat-card">
            <span className="stat-card-label">Seances realisees</span>
            <strong className="stat-card-value">{totalWorkouts}</strong>
          </article>
          <article className="card stat-card">
            <span className="stat-card-label">Duree totale</span>
            <strong className="stat-card-value">{formatDurationLabel(totalDurationSeconds) || '-'}</strong>
          </article>
          <article className="card stat-card">
            <span className="stat-card-label">Calories totales</span>
            <strong className="stat-card-value">{formatEstimatedWorkoutCalories(totalCalories) || '-'}</strong>
          </article>
          <article className="card stat-card">
            <span className="stat-card-label">Volume total</span>
            <strong className="stat-card-value">{formatSessionVolumeKg(totalVolume) || '-'}</strong>
          </article>
          <article className="card stat-card">
            <span className="stat-card-label">Challenges crees</span>
            <strong className="stat-card-value">{createdChallengesCount}</strong>
          </article>
          <article className="card stat-card">
            <span className="stat-card-label">Challenges rejoints</span>
            <strong className="stat-card-value">{joinedChallengesCount}</strong>
          </article>
        </section>

        <article className="card session-form-card stack">
          <div className="session-blocks-header">
            <div>
              <span className="section-kicker">Progression</span>
              <h2>Vue d&apos;ensemble</h2>
            </div>
          </div>

          {chartMetricEntries.length === 0 || chartMaxValue <= 0 ? (
            <div className="challenge-state challenge-state--compact">
              <p>Pas encore assez de donnees.</p>
            </div>
          ) : chartMetricEntries.length === 1 ? (
            <div className="session-progress-chart session-progress-chart--single">
              <div className="session-progress-chart__header">
                <span>{progressionData.metricLabel}</span>
                <strong>1 seance</strong>
              </div>
              <article className="session-block-card">
                <div className="session-block-card__top">
                  <div className="session-block-check__label">
                    <strong>{chartMetricEntries[0].formattedValue || '-'}</strong>
                    <small>{chartMetricEntries[0].label}</small>
                  </div>
                </div>
              </article>
            </div>
          ) : (
            <div className="session-progress-chart">
              <div className="session-progress-chart__header">
                <span>{progressionData.metricLabel || 'Progression'}</span>
                <strong>{chartMetricEntries.length} dernieres seances</strong>
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
              <span className="section-kicker">Records</span>
              <h2>Records personnels</h2>
            </div>
          </div>

          {topPersonalRecords.length === 0 ? (
            <div className="challenge-state challenge-state--compact">
              <p>Aucun record personnel pour le moment.</p>
            </div>
          ) : (
            <div className="session-records-list">
              {topPersonalRecords.map((record) => (
                <article key={record.exerciseName} className="session-block-card session-record-card">
                  <div className="session-block-card__top">
                    <div className="session-block-check__label">
                      <strong>{record.exerciseName}</strong>
                      <small>🏆 Record personnel</small>
                    </div>
                  </div>
                  <div className="session-record-lines">
                    {record.maxChargeKg ? (
                      <p>Charge max : <strong>{record.maxChargeKg} kg</strong></p>
                    ) : null}
                    {record.bestVolumeKg ? (
                      <p>Meilleur volume : <strong>{formatSessionVolumeKg(record.bestVolumeKg)}</strong></p>
                    ) : null}
                    {record.maxReps ? (
                      <p>Meilleur reps : <strong>{record.maxReps} reps</strong></p>
                    ) : null}
                    {record.bestDurationSeconds ? (
                      <p>Meilleur temps : <strong>{formatDurationLabel(record.bestDurationSeconds)}</strong></p>
                    ) : null}
                  </div>
                </article>
              ))}
            </div>
          )}
        </article>

        <article className="card session-form-card stack">
          <div className="session-blocks-header">
            <div>
              <span className="section-kicker">Exercices</span>
              <h2>Stats par exercice</h2>
            </div>
          </div>

          {exerciseStatsCards.length === 0 ? (
            <div className="challenge-state challenge-state--compact">
              <p>Pas encore assez de donnees par exercice.</p>
            </div>
          ) : (
            <div className="stack">
              <div className="session-records-list">
                {exerciseStatsCards.map((entry) => (
                  <button
                    key={entry.exerciseName}
                    type="button"
                    className={`session-block-card session-record-card session-exercise-stat-card${
                      selectedExerciseStats?.exerciseName === entry.exerciseName ? ' is-active' : ''
                    }`}
                    onClick={() => setSelectedExerciseName(entry.exerciseName)}
                  >
                    <div className="session-block-card__top">
                      <div className="session-block-check__label">
                        <strong>{entry.exerciseName}</strong>
                        <small>{entry.completedCount} fois realise</small>
                      </div>
                    </div>
                    <div className="session-record-lines">
                      <p>Derniere fois : <strong>{entry.lastCompletedAt ? formatRelativeDate(entry.lastCompletedAt) : '-'}</strong></p>
                    </div>
                  </button>
                ))}
              </div>

              {selectedExerciseStats ? (
                <article className="session-block-card session-exercise-stat-detail">
                  <div className="session-block-card__top">
                    <div className="session-block-check__label">
                      <strong>{selectedExerciseStats.exerciseName}</strong>
                      <small>Detail et progression</small>
                    </div>
                    <span className="session-block-chip">{selectedExerciseStats.progressionMetricLabel || 'Stats'}</span>
                  </div>

                  <div className="session-detail-meta">
                    <div className="session-meta-card">
                      <span>Realisations</span>
                      <strong>{selectedExerciseStats.completedCount}</strong>
                    </div>
                    <div className="session-meta-card">
                      <span>Derniere fois</span>
                      <strong>{selectedExerciseStats.lastCompletedAt ? formatRelativeDate(selectedExerciseStats.lastCompletedAt) : '-'}</strong>
                    </div>
                    <div className="session-meta-card">
                      <span>Charge max</span>
                      <strong>{selectedExerciseStats.maxChargeKg ? `${selectedExerciseStats.maxChargeKg} kg` : '-'}</strong>
                    </div>
                    <div className="session-meta-card">
                      <span>Volume max</span>
                      <strong>{selectedExerciseStats.bestVolumeKg ? formatSessionVolumeKg(selectedExerciseStats.bestVolumeKg) : '-'}</strong>
                    </div>
                    <div className="session-meta-card">
                      <span>Reps max</span>
                      <strong>{selectedExerciseStats.maxReps ? `${selectedExerciseStats.maxReps} reps` : '-'}</strong>
                    </div>
                    <div className="session-meta-card">
                      <span>Duree max</span>
                      <strong>{selectedExerciseStats.bestDurationSeconds ? formatDurationLabel(selectedExerciseStats.bestDurationSeconds) : '-'}</strong>
                    </div>
                  </div>

                  {selectedExerciseChartEntries.length === 0 ? (
                    <div className="challenge-state challenge-state--compact">
                      <p>Pas encore de progression chiffree pour cet exercice.</p>
                    </div>
                  ) : selectedExerciseSingleEntry ? (
                    <div className="session-progress-chart session-progress-chart--single">
                      <div className="session-progress-chart__header">
                        <span>{selectedExerciseStats.progressionMetricLabel}</span>
                        <strong>1 seance</strong>
                      </div>
                      <article className="session-block-card">
                        <div className="session-block-card__top">
                          <div className="session-block-check__label">
                            <strong>{selectedExerciseSingleEntry.formattedValue || '-'}</strong>
                            <small>{selectedExerciseSingleEntry.label}</small>
                          </div>
                        </div>
                      </article>
                    </div>
                  ) : (
                    <div className="session-progress-chart">
                      <div className="session-progress-chart__header">
                        <span>{selectedExerciseStats.progressionMetricLabel || 'Progression'}</span>
                        <strong>{selectedExerciseChartEntries.length} dernieres seances</strong>
                      </div>
                      <div className="session-progress-chart__svg-wrap">
                        <svg viewBox="0 0 100 100" className="session-progress-chart__svg" preserveAspectRatio="none">
                          <path d="M 0 100 L 100 100" className="session-progress-chart__axis" />
                          <path d={selectedExerciseChartPath} className="session-progress-chart__line" />
                          {selectedExerciseChartPoints.map((point) => (
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
                          {selectedExerciseChartEntries.map((entry) => (
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
              ) : null}
            </div>
          )}
        </article>

        <article className="card session-form-card stack">
          <div className="session-blocks-header">
            <div>
              <span className="section-kicker">Historique</span>
              <h2>Derniers entrainements</h2>
            </div>
          </div>

          {recentWorkouts.length === 0 ? (
            <div className="challenge-state challenge-state--compact">
              <p>Aucune seance realisee pour le moment.</p>
            </div>
          ) : (
            <div className="session-block-list">
              {recentWorkouts.map((entry) => (
                <article key={entry.id} className="session-block-card">
                  <div className="session-block-card__top">
                    <div className="session-block-check__label">
                      <strong>{entry.workout_name}</strong>
                      <small>{new Date(entry.completed_at).toLocaleDateString('fr-FR')}</small>
                    </div>
                  </div>

                  <p className="session-block-preview">
                    {formatDurationLabel(entry.duration_seconds) || '-'} • {entry.completed_exercises || 0} exercice
                    {(entry.completed_exercises || 0) > 1 ? 's' : ''}
                  </p>

                  {entry.total_volume ? (
                    <p className="session-block-volume">Volume : {formatSessionVolumeKg(entry.total_volume)}</p>
                  ) : null}

                  {(Number(entry.estimated_calories || 0) > 0) ? (
                    <p className="session-block-preview">
                      Calories estimees : {formatEstimatedWorkoutCalories(entry.estimated_calories)}
                    </p>
                  ) : null}
                </article>
              ))}
            </div>
          )}
        </article>
      </div>
    </AppShell>
  );
}
