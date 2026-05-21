'use client';

import type { ReactNode } from 'react';
import type { SessionBlockType } from '@/lib/session-blocks';

type SessionExerciseIconProps = {
  exerciseName?: string | null;
  sport?: string | null;
  blockType?: SessionBlockType | null;
  size?: 'sm' | 'md';
  className?: string;
};

function normalize(value?: string | null) {
  return (value || '').trim().toLowerCase();
}

function IconShell({
  children,
  className,
  size = 'md',
}: {
  children: ReactNode;
  className?: string;
  size?: 'sm' | 'md';
}) {
  return (
    <span className={`exercise-icon-badge exercise-icon-badge--${size}${className ? ` ${className}` : ''}`} aria-hidden="true">
      {children}
    </span>
  );
}

function DumbbellSvg() {
  return (
    <svg viewBox="0 0 24 24" fill="none">
      <path d="M5 9v6" stroke="currentColor" strokeLinecap="round" />
      <path d="M8 7v10" stroke="currentColor" strokeLinecap="round" />
      <path d="M16 7v10" stroke="currentColor" strokeLinecap="round" />
      <path d="M19 9v6" stroke="currentColor" strokeLinecap="round" />
      <path d="M8 12h8" stroke="currentColor" strokeLinecap="round" />
      <path d="M3 10v4" stroke="currentColor" strokeLinecap="round" />
      <path d="M21 10v4" stroke="currentColor" strokeLinecap="round" />
    </svg>
  );
}

function FootprintsSvg() {
  return (
    <svg viewBox="0 0 24 24" fill="none">
      <path d="M7.5 14.5c1.2 0 2.2-1.4 2.2-3.1S8.7 8.3 7.5 8.3 5.3 9.7 5.3 11.4s1 3.1 2.2 3.1Z" stroke="currentColor" />
      <path d="M15.8 18.7c1.4 0 2.5-1.6 2.5-3.7s-1.1-3.7-2.5-3.7-2.5 1.6-2.5 3.7 1.1 3.7 2.5 3.7Z" stroke="currentColor" />
      <path d="M5.5 18.2c.9-.8 2.2-1.2 3.6-1" stroke="currentColor" strokeLinecap="round" />
      <path d="M12.7 21c1-.9 2.6-1.5 4.3-1.4" stroke="currentColor" strokeLinecap="round" />
    </svg>
  );
}

function BikeSvg() {
  return (
    <svg viewBox="0 0 24 24" fill="none">
      <circle cx="6.5" cy="17.5" r="3.5" stroke="currentColor" />
      <circle cx="17.5" cy="17.5" r="3.5" stroke="currentColor" />
      <path d="M9 7h3l2.2 4.5" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M8 17.5h5.2l-3-5.5L8 17.5Z" stroke="currentColor" strokeLinejoin="round" />
      <path d="M14 9.5h3.5" stroke="currentColor" strokeLinecap="round" />
    </svg>
  );
}

function TimerSvg() {
  return (
    <svg viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="13" r="7" stroke="currentColor" />
      <path d="M12 13V9.5" stroke="currentColor" strokeLinecap="round" />
      <path d="M9 3h6" stroke="currentColor" strokeLinecap="round" />
      <path d="M14.5 5.5 16 4" stroke="currentColor" strokeLinecap="round" />
    </svg>
  );
}

function RouteSvg() {
  return (
    <svg viewBox="0 0 24 24" fill="none">
      <path d="M6 18c2-6 3-8.5 6-12 1.2 4 2.3 6.3 6 12" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="6" cy="18" r="1.5" fill="currentColor" />
      <circle cx="12" cy="6" r="1.5" fill="currentColor" />
      <circle cx="18" cy="18" r="1.5" fill="currentColor" />
    </svg>
  );
}

function PencilSvg() {
  return (
    <svg viewBox="0 0 24 24" fill="none">
      <path d="m5 19 3.2-.6L18 8.6 15.4 6 5.6 15.8 5 19Z" stroke="currentColor" strokeLinejoin="round" />
      <path d="m13.8 7.6 2.6 2.6" stroke="currentColor" strokeLinecap="round" />
    </svg>
  );
}

function ActivitySvg() {
  return (
    <svg viewBox="0 0 24 24" fill="none">
      <path d="M3 12h4l2.2-4.5L13 17l2.3-5H21" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function selectIcon({
  exerciseName,
  sport,
  blockType,
}: Pick<SessionExerciseIconProps, 'exerciseName' | 'sport' | 'blockType'>) {
  const normalizedExercise = normalize(exerciseName);
  const normalizedSport = normalize(sport);

  const matches = (...keywords: string[]) => keywords.some((keyword) => normalizedExercise.includes(keyword));

  if (matches('velo', 'bike', 'cycling', 'cyclisme')) {
    return BikeSvg;
  }

  if (matches('course', 'running', 'run', 'marche', 'randonnee', 'trail', 'jog')) {
    return FootprintsSvg;
  }

  if (matches('repos', 'rest')) {
    return TimerSvg;
  }

  if (matches('gainage', 'cardio', 'burpee', 'hiit')) {
    return ActivitySvg;
  }

  if (matches('distance', 'sprint', 'intervalle')) {
    return RouteSvg;
  }

  if (matches('libre', 'note', 'mobilite', 'mobility')) {
    return PencilSvg;
  }

  if (
    matches(
      'developpe',
      'bench',
      'presse',
      'squat',
      'fente',
      'rowing',
      'tirage',
      'dips',
      'pompe',
      'mollet',
      'curl',
      'extension'
    )
  ) {
    return DumbbellSvg;
  }

  if (normalizedSport.includes('velo') || normalizedSport.includes('bike') || normalizedSport.includes('cycl')) {
    return BikeSvg;
  }

  if (normalizedSport.includes('run') || normalizedSport.includes('course') || normalizedSport.includes('marche')) {
    return FootprintsSvg;
  }

  if (blockType === 'duration') {
    return TimerSvg;
  }

  if (blockType === 'distance') {
    return RouteSvg;
  }

  if (blockType === 'free') {
    return PencilSvg;
  }

  if (blockType === 'reps') {
    return DumbbellSvg;
  }

  return ActivitySvg;
}

export function SessionExerciseIcon({
  exerciseName,
  sport,
  blockType,
  size = 'md',
  className,
}: SessionExerciseIconProps) {
  const Icon = selectIcon({ exerciseName, sport, blockType });
  return (
    <IconShell size={size} className={className}>
      <Icon />
    </IconShell>
  );
}
