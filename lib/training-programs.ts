export type TrainingProgram = {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  sport: string | null;
  duration_weeks: number;
  visibility: 'private';
  start_date: string;
  created_at: string | null;
};

export type TrainingProgramSession = {
  id: string;
  program_id: string;
  session_id: string | null;
  session_name: string;
  sport: string | null;
  week_number: number;
  day_of_week: number;
  order_index: number;
  created_at: string | null;
};

export type TrainingProgramCompletion = {
  id: string;
  user_id: string;
  program_id: string;
  program_session_id: string;
  session_id: string | null;
  workout_history_id: string | null;
  completed_at: string;
  created_at: string | null;
};

export const PROGRAM_DAY_OPTIONS = [
  { value: 1, label: 'Lundi' },
  { value: 2, label: 'Mardi' },
  { value: 3, label: 'Mercredi' },
  { value: 4, label: 'Jeudi' },
  { value: 5, label: 'Vendredi' },
  { value: 6, label: 'Samedi' },
  { value: 7, label: 'Dimanche' },
] as const;

export function clampProgramWeek(weekNumber: number, maxWeeks: number) {
  if (!Number.isFinite(weekNumber)) {
    return 1;
  }

  return Math.min(Math.max(Math.trunc(weekNumber), 1), Math.max(Math.trunc(maxWeeks), 1));
}

export function clampProgramDay(dayOfWeek: number) {
  if (!Number.isFinite(dayOfWeek)) {
    return 1;
  }

  return Math.min(Math.max(Math.trunc(dayOfWeek), 1), 7);
}

export function formatProgramVisibilityLabel(visibility: string | null | undefined) {
  return visibility === 'private' || !visibility ? 'Prive' : visibility;
}

export function getProgramDayLabel(dayOfWeek: number) {
  return PROGRAM_DAY_OPTIONS.find((option) => option.value === clampProgramDay(dayOfWeek))?.label || 'Jour';
}

export function getProgramWeekLabel(weekNumber: number) {
  return `Semaine ${Math.max(Math.trunc(weekNumber), 1)}`;
}

export function formatProgramDate(dateString: string | null | undefined) {
  if (!dateString) return '-';

  const date = new Date(`${dateString}T00:00:00`);
  if (Number.isNaN(date.getTime())) return '-';

  return date.toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });
}

export function getProgramSessionPlannedDate(startDate: string | null | undefined, weekNumber: number, dayOfWeek: number) {
  if (!startDate) return null;

  const baseDate = new Date(`${startDate}T12:00:00`);
  if (Number.isNaN(baseDate.getTime())) return null;

  const normalizedWeek = Math.max(Math.trunc(weekNumber), 1);
  const normalizedDay = clampProgramDay(dayOfWeek);
  const plannedDate = new Date(baseDate);
  plannedDate.setDate(plannedDate.getDate() + (normalizedWeek - 1) * 7 + (normalizedDay - 1));

  return plannedDate;
}

export function formatProgramPlannedDateLabel(startDate: string | null | undefined, weekNumber: number, dayOfWeek: number) {
  const plannedDate = getProgramSessionPlannedDate(startDate, weekNumber, dayOfWeek);

  if (!plannedDate) {
    return 'Date a venir';
  }

  return plannedDate.toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: 'short',
  });
}

export function getTrainingProgramProgress(completedSessions: number, totalSessions: number) {
  if (totalSessions <= 0) {
    return 0;
  }

  return Math.max(0, Math.min(100, Math.round((completedSessions / totalSessions) * 100)));
}

export function getTrainingProgramSessionStatus(
  startDate: string | null | undefined,
  weekNumber: number,
  dayOfWeek: number,
  completedAt: string | null | undefined
) {
  if (completedAt) {
    return 'completed' as const;
  }

  const plannedDate = getProgramSessionPlannedDate(startDate, weekNumber, dayOfWeek);
  if (!plannedDate) {
    return 'todo' as const;
  }

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const plannedDay = new Date(plannedDate.getFullYear(), plannedDate.getMonth(), plannedDate.getDate());

  if (plannedDay.getTime() < today.getTime()) {
    return 'passed' as const;
  }

  return 'todo' as const;
}

export function getTrainingProgramSessionStatusLabel(status: 'completed' | 'passed' | 'todo') {
  if (status === 'completed') return 'Terminee';
  if (status === 'passed') return 'Passee';
  return 'A faire';
}
