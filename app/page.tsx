'use client';

import Link from 'next/link';
import type { Route } from 'next';
import { useEffect, useMemo, useState } from 'react';
import { AppShell } from '@/components/AppShell';
import { HomeDashboard, type HomeDashboardStat } from '@/components/home/HomeDashboard';
import {
  RecentActivityFeed,
  type MonthlySummaryItem,
  type RecentActivityItem,
} from '@/components/home/RecentActivityFeed';
import { getLevelProgress } from '@/lib/gamification';
import { supabase } from '@/lib/supabase';
import { loadUserStatistics } from '@/lib/user-statistics';

type RecentActivityRow = {
  id: string;
  sport: string | null;
  activity_name: string | null;
  distance_km: number | null;
  duration_minutes: number | null;
  elevation_gain_m: number | null;
  occurred_at: string | null;
  created_at: string | null;
};

type RecentWorkoutRow = {
  id: string;
  workout_name: string | null;
  duration_seconds: number | null;
  total_volume: number | null;
  completed_exercises: number | null;
  completed_at: string | null;
};

type RecentMasteryUnlockRow = {
  id: string;
  mastery_id: string;
  level: number;
  xp_awarded: number | null;
  unlocked_at: string | null;
};

type MasteryLookupRow = {
  id: string;
  slug: string;
  name: string;
};

type HomeState = {
  loading: boolean;
  level: number;
  totalXp: number;
  progressPercent: number;
  currentThreshold: number;
  nextThreshold: number;
  xpToNextLevel: number;
  stats: HomeDashboardStat[];
  recentItems: RecentActivityItem[];
  monthlySummary: MonthlySummaryItem[];
};

function formatNumber(value: number) {
  return new Intl.NumberFormat('fr-FR').format(Math.max(0, Math.round(value)));
}

function getDefaultHomeState(): HomeState {
  return {
    loading: true,
    level: 1,
    totalXp: 0,
    progressPercent: 0,
    currentThreshold: 0,
    nextThreshold: 75,
    xpToNextLevel: 75,
    stats: [
      { icon: '↗', label: 'Activites', value: '0', hint: 'enregistrees', href: '/activities/new' },
      { icon: '◎', label: 'Challenges', value: '0', hint: 'rejoints ou crees', href: '/challenges' as Route },
      { icon: '▶', label: 'Seances', value: '0', hint: 'realisees', href: '/sessions' as Route },
      { icon: '◫', label: 'Programmes', value: '0', hint: 'suivis', href: '/programs' as Route },
    ],
    recentItems: [],
    monthlySummary: [
      { label: 'Distance', value: '0', unit: 'km' },
      { label: 'Temps actif', value: '0 min' },
      { label: 'D+', value: '0', unit: 'm' },
      { label: 'Activites', value: '0' },
    ],
  };
}

function normalizeSportKey(value: string | null | undefined) {
  return (value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

function formatDistanceKm(value: number | null) {
  if (!Number.isFinite(Number(value)) || Number(value) <= 0) return null;
  return `${new Intl.NumberFormat('fr-FR', {
    minimumFractionDigits: Number(value) >= 10 ? 0 : 1,
    maximumFractionDigits: 1,
  }).format(Number(value))} km`;
}

function formatDurationMinutes(value: number | null) {
  if (!Number.isFinite(Number(value)) || Number(value) <= 0) return null;

  const totalMinutes = Math.round(Number(value));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours <= 0) {
    return `${minutes} min`;
  }

  return `${hours}h${minutes.toString().padStart(2, '0')}`;
}

function formatDurationSeconds(value: number | null) {
  if (!Number.isFinite(Number(value)) || Number(value) <= 0) return null;
  return formatDurationMinutes(Math.round(Number(value) / 60));
}

function formatElevation(value: number | null) {
  if (!Number.isFinite(Number(value)) || Number(value) <= 0) return null;
  return `${formatNumber(Number(value))} m D+`;
}

function formatPace(distanceKm: number | null, durationMinutes: number | null) {
  const distance = Number(distanceKm || 0);
  const minutes = Number(durationMinutes || 0);

  if (!Number.isFinite(distance) || !Number.isFinite(minutes) || distance <= 0 || minutes <= 0) {
    return null;
  }

  const totalSecondsPerKm = Math.round((minutes * 60) / distance);
  const paceMinutes = Math.floor(totalSecondsPerKm / 60);
  const paceSeconds = totalSecondsPerKm % 60;
  return `${paceMinutes}'${paceSeconds.toString().padStart(2, '0')}" /km`;
}

function formatSpeed(distanceKm: number | null, durationMinutes: number | null) {
  const distance = Number(distanceKm || 0);
  const minutes = Number(durationMinutes || 0);

  if (!Number.isFinite(distance) || !Number.isFinite(minutes) || distance <= 0 || minutes <= 0) {
    return null;
  }

  const speed = distance / (minutes / 60);
  return `${new Intl.NumberFormat('fr-FR', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(speed)} km/h`;
}

function getActivityMetricLabel(sport: string | null, distanceKm: number | null, durationMinutes: number | null) {
  const normalizedSport = normalizeSportKey(sport);
  const usesPace =
    normalizedSport.includes('course') ||
    normalizedSport.includes('trail') ||
    normalizedSport.includes('marche') ||
    normalizedSport.includes('walk') ||
    normalizedSport.includes('randon');

  return usesPace ? formatPace(distanceKm, durationMinutes) : formatSpeed(distanceKm, durationMinutes);
}

function formatRelativeDay(timestamp: string) {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return '';

  const now = new Date();
  const todayKey = `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}`;
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const yesterdayKey = `${yesterday.getFullYear()}-${yesterday.getMonth()}-${yesterday.getDate()}`;
  const currentKey = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;

  if (currentKey === todayKey) return "Aujourd'hui";
  if (currentKey === yesterdayKey) return 'Hier';

  return new Intl.DateTimeFormat('fr-FR', {
    day: '2-digit',
    month: 'short',
  }).format(date);
}

function formatTime(timestamp: string) {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return '';

  return new Intl.DateTimeFormat('fr-FR', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function formatDistanceValue(value: number) {
  return new Intl.NumberFormat('fr-FR', {
    minimumFractionDigits: value >= 100 ? 0 : 1,
    maximumFractionDigits: 1,
  }).format(Math.max(0, value));
}

function buildActivityFeedItem(row: RecentActivityRow): RecentActivityItem | null {
  const timestamp = row.occurred_at || row.created_at;
  if (!timestamp) return null;

  const details = [
    formatDistanceKm(row.distance_km),
    formatDurationMinutes(row.duration_minutes),
    getActivityMetricLabel(row.sport, row.distance_km, row.duration_minutes),
    formatElevation(row.elevation_gain_m),
  ].filter((entry): entry is string => Boolean(entry));

  const sportLabel = row.sport?.trim() || 'Activite';

  return {
    id: `activity-${row.id}`,
    href: '/historique' as Route,
    kind: 'activity',
    title: row.activity_name?.trim() || sportLabel,
    subtitle: details.join(' • ') || 'Activite enregistree',
    metaLabel: `${formatRelativeDay(timestamp)} • ${formatTime(timestamp)}`,
    timestamp,
    accent: 'sport',
    badgeLabel: sportLabel,
  };
}

function buildWorkoutFeedItem(row: RecentWorkoutRow): RecentActivityItem | null {
  const timestamp = row.completed_at;
  if (!timestamp) return null;

  const exerciseCount = Number(row.completed_exercises || 0);
  const details = [
    Number(row.total_volume || 0) > 0 ? `+${formatNumber(Number(row.total_volume || 0))} kg de volume` : null,
    exerciseCount > 0 ? `${formatNumber(exerciseCount)} exercice${exerciseCount > 1 ? 's' : ''}` : null,
    formatDurationSeconds(row.duration_seconds),
  ].filter((entry): entry is string => Boolean(entry));

  return {
    id: `workout-${row.id}`,
    href: '/sessions' as Route,
    kind: 'workout',
    title: row.workout_name?.trim() || 'Seance terminee',
    subtitle: details.join(' • ') || 'Seance enregistree',
    metaLabel: `${formatRelativeDay(timestamp)} • ${formatTime(timestamp)}`,
    timestamp,
    accent: 'workout',
    badgeLabel: 'Seance',
  };
}

function buildMasteryFeedItem(
  row: RecentMasteryUnlockRow,
  masteriesById: Map<string, MasteryLookupRow>
): RecentActivityItem | null {
  const timestamp = row.unlocked_at;
  if (!timestamp) return null;

  const mastery = masteriesById.get(row.mastery_id);
  const masteryName = mastery?.name || 'Maitrise';

  return {
    id: `mastery-${row.id}`,
    href: (mastery?.slug ? `/maitrises/${mastery.slug}` : '/maitrises') as Route,
    kind: 'mastery',
    title: `Maitrise ${masteryName}`,
    subtitle: `Niveau ${row.level} atteint${Number(row.xp_awarded || 0) > 0 ? ` • +${formatNumber(Number(row.xp_awarded || 0))} XP` : ''}`,
    metaLabel: `${formatRelativeDay(timestamp)} • ${formatTime(timestamp)}`,
    timestamp,
    accent: 'mastery',
    badgeLabel: 'Maitrise',
  };
}

export default function HomePage() {
  const [homeState, setHomeState] = useState<HomeState>(getDefaultHomeState);

  useEffect(() => {
    let cancelled = false;

    async function fetchHomeData() {
      try {
        const {
          data: { user },
          error: authError,
        } = await supabase.auth.getUser();

        if (authError) {
          console.error('Erreur auth accueil :', authError);
        }

        if (!user) {
          if (!cancelled) {
            setHomeState({
              ...getDefaultHomeState(),
              loading: false,
            });
          }
          return;
        }

        const userEmail = user.email || null;
        const [stats, activitiesResponse, workoutsResponse, unlocksResponse] = await Promise.all([
          loadUserStatistics(user.id, userEmail),
          supabase
            .from('activities')
            .select('id, sport, activity_name, distance_km, duration_minutes, elevation_gain_m, occurred_at, created_at')
            .or(`user_id.eq.${user.id}${userEmail ? `,user_email.eq.${userEmail}` : ''}`)
            .order('occurred_at', { ascending: false })
            .limit(5),
          supabase
            .from('workout_sessions_history')
            .select('id, workout_name, duration_seconds, total_volume, completed_exercises, completed_at')
            .eq('user_id', user.id)
            .order('completed_at', { ascending: false })
            .limit(5),
          supabase
            .from('mastery_level_unlocks')
            .select('id, mastery_id, level, xp_awarded, unlocked_at')
            .eq('user_id', user.id)
            .order('unlocked_at', { ascending: false })
            .limit(5),
        ]);

        if (activitiesResponse.error) {
          console.error('Erreur accueil activites recentes :', activitiesResponse.error);
        }
        if (workoutsResponse.error) {
          console.error('Erreur accueil seances recentes :', workoutsResponse.error);
        }
        if (unlocksResponse.error) {
          console.error('Erreur accueil maitrises recentes :', unlocksResponse.error);
        }

        const recentActivities = ((activitiesResponse.data as RecentActivityRow[] | null) || [])
          .map(buildActivityFeedItem)
          .filter((item): item is RecentActivityItem => Boolean(item));

        const recentWorkouts = ((workoutsResponse.data as RecentWorkoutRow[] | null) || [])
          .map(buildWorkoutFeedItem)
          .filter((item): item is RecentActivityItem => Boolean(item));

        const unlockRows = (unlocksResponse.data as RecentMasteryUnlockRow[] | null) || [];
        const masteryIds = Array.from(new Set(unlockRows.map((entry) => entry.mastery_id).filter(Boolean)));

        let masteriesById = new Map<string, MasteryLookupRow>();

        if (masteryIds.length > 0) {
          const masteriesResponse = await supabase.from('masteries').select('id, slug, name').in('id', masteryIds);

          if (masteriesResponse.error) {
            console.error('Erreur accueil lookup maitrises :', masteriesResponse.error);
          } else {
            masteriesById = new Map(
              (((masteriesResponse.data as MasteryLookupRow[] | null) || []).map((entry) => [entry.id, entry]))
            );
          }
        }

        const recentUnlocks = unlockRows
          .map((entry) => buildMasteryFeedItem(entry, masteriesById))
          .filter((item): item is RecentActivityItem => Boolean(item));

        const mergedRecentItems = [...recentActivities, ...recentWorkouts, ...recentUnlocks]
          .sort((left, right) => new Date(right.timestamp).getTime() - new Date(left.timestamp).getTime())
          .slice(0, 5);
        const levelProgress = getLevelProgress(stats.profile.totalXp);
        const challengesCount = stats.challenges.createdChallenges + stats.challenges.joinedChallenges;
        const programsCount = stats.programs.createdPrograms + stats.programs.joinedPrograms;
        const sessionDurationHint =
          stats.sessions.totalWorkoutDurationMinutes > 0
            ? formatDurationMinutes(stats.sessions.totalWorkoutDurationMinutes)
            : null;
        const activitiesDistanceHint =
          stats.month.distanceKm > 0 ? `${formatDistanceValue(stats.month.distanceKm)} km` : null;
        const challengeHint =
          stats.challenges.completedChallenges > 0
            ? `${formatNumber(stats.challenges.completedChallenges)} termine${stats.challenges.completedChallenges > 1 ? 's' : ''}`
            : null;
        const programHint =
          stats.programs.completedPrograms > 0
            ? `${formatNumber(stats.programs.completedPrograms)} termine${stats.programs.completedPrograms > 1 ? 's' : ''}`
            : null;

        if (!cancelled) {
          setHomeState({
            loading: false,
            level: levelProgress.level,
            totalXp: stats.profile.totalXp,
            progressPercent: levelProgress.progressPercent,
            currentThreshold: levelProgress.currentThreshold,
            nextThreshold: levelProgress.nextThreshold,
            xpToNextLevel: levelProgress.xpToNextLevel,
            stats: [
              {
                icon: '↗',
                label: 'ACTIVITES',
                value: formatNumber(stats.overview.totalActivities),
                hint: activitiesDistanceHint || 'enregistrees',
                href: '/activities/new' as Route,
              },
              {
                icon: '◎',
                label: 'CHALLENGES',
                value: formatNumber(challengesCount),
                hint: challengeHint || 'rejoints ou crees',
                href: '/challenges' as Route,
              },
              {
                icon: '▶',
                label: 'SEANCES',
                value: formatNumber(stats.sessions.completedWorkouts),
                hint: sessionDurationHint || 'realisees',
                href: '/sessions' as Route,
              },
              {
                icon: '◫',
                label: 'PROGRAMMES',
                value: formatNumber(programsCount),
                hint: programHint || 'suivis',
                href: '/programs' as Route,
              },
            ],
            recentItems: mergedRecentItems,
            monthlySummary: [
              {
                label: 'Distance',
                value: formatDistanceValue(stats.month.distanceKm),
                unit: 'km',
              },
              {
                label: 'Temps actif',
                value: formatDurationMinutes(stats.month.durationMinutes) || '0 min',
              },
              {
                label: 'D+',
                value: formatNumber(stats.month.elevationGainM),
                unit: 'm',
              },
              {
                label: 'Activites',
                value: formatNumber(stats.month.activitiesCount),
              },
            ],
          });
        }
      } catch (error) {
        console.error("Erreur inattendue sur l'accueil :", error);
        if (!cancelled) {
          setHomeState({
            ...getDefaultHomeState(),
            loading: false,
          });
        }
      }
    }

    void fetchHomeData();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(() => {
      void fetchHomeData();
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  return (
    <AppShell>
      <div className="home-page home-dashboard">
        <section className="hero-banner hero-banner--dashboard">
          <div className="hero-actions hero-actions--dashboard">
            <Link href="/session-du-jour" className="hero-btn hero-btn--primary hero-btn-left">
              Voir la seance du jour
            </Link>

            <Link href="/sessions" className="hero-btn hero-btn--secondary hero-btn-right">
              Ouvrir mes seances
            </Link>
          </div>
        </section>

        <HomeDashboard
          loading={homeState.loading}
          level={homeState.level}
          totalXp={homeState.totalXp}
          progressPercent={homeState.progressPercent}
          currentThreshold={homeState.currentThreshold}
          nextThreshold={homeState.nextThreshold}
          xpToNextLevel={homeState.xpToNextLevel}
          stats={homeState.stats}
        />

        <RecentActivityFeed
          loading={homeState.loading}
          items={homeState.recentItems}
          monthlySummary={homeState.monthlySummary}
        />
      </div>
    </AppShell>
  );
}
