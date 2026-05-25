export type TrainingProgram = {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  sport: string | null;
  duration_weeks: number;
  visibility: 'private' | 'shared';
  invite_code?: string | null;
  copied_from_program_id?: string | null;
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

export type ProgramCalendarDay = {
  key: string;
  date: Date;
  programWeekNumber: number;
  programDayNumber: number;
  dayLabel: string;
  dayShortLabel: string;
  shortDateLabel: string;
};

export type ProgramCalendarWeek = {
  key: string;
  title: string;
  days: ProgramCalendarDay[];
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

export function parseLocalDate(dateString: string | null | undefined) {
  if (!dateString) return null;

  const [year, month, day] = dateString.split('-').map(Number);
  if (!year || !month || !day) return null;

  const parsedDate = new Date(year, month - 1, day);
  if (Number.isNaN(parsedDate.getTime())) return null;
  return parsedDate;
}

export function addDays(baseDate: Date, days: number) {
  const nextDate = new Date(baseDate);
  nextDate.setDate(nextDate.getDate() + days);
  return nextDate;
}

export function startOfCalendarWeekMonday(date: Date) {
  const normalizedDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const dayOfWeek = normalizedDate.getDay();
  const daysFromMonday = (dayOfWeek + 6) % 7;
  return addDays(normalizedDate, -daysFromMonday);
}

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
  if (visibility === 'shared') return 'Partage';
  return 'Prive';
}

export function generateProgramInviteCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const values = new Uint32Array(6);

  if (typeof window !== 'undefined' && window.crypto?.getRandomValues) {
    window.crypto.getRandomValues(values);
  } else {
    for (let index = 0; index < values.length; index += 1) {
      values[index] = Math.floor(Math.random() * alphabet.length);
    }
  }

  const code = Array.from(values, (value) => alphabet[value % alphabet.length]).join('');
  return `ACTYV-${code}`;
}

export function getProgramDayLabel(dayOfWeek: number) {
  return PROGRAM_DAY_OPTIONS.find((option) => option.value === clampProgramDay(dayOfWeek))?.label || 'Jour';
}

export function getProgramWeekLabel(weekNumber: number) {
  return `Semaine ${Math.max(Math.trunc(weekNumber), 1)}`;
}

export function formatProgramDate(dateString: string | null | undefined) {
  if (!dateString) return '-';

  const date = dateString.includes('T') ? new Date(dateString) : parseLocalDate(dateString);
  if (!date || Number.isNaN(date.getTime())) return '-';

  return date.toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });
}

export function getProgramDateFromWeekDay(startDate: string | null | undefined, weekNumber: number, dayOfWeek: number) {
  if (!startDate) return null;

  const baseDate = parseLocalDate(startDate);
  if (!baseDate || Number.isNaN(baseDate.getTime())) return null;

  const normalizedWeek = Math.max(Math.trunc(weekNumber), 1);
  const normalizedDay = clampProgramDay(dayOfWeek);
  const plannedDate = addDays(baseDate, (normalizedWeek - 1) * 7 + (normalizedDay - 1));

  return plannedDate;
}

export function getProgramSessionPlannedDate(startDate: string | null | undefined, weekNumber: number, dayOfWeek: number) {
  return getProgramDateFromWeekDay(startDate, weekNumber, dayOfWeek);
}

export function formatProgramDayLabel(startDate: string | null | undefined, weekNumber: number, dayOfWeek: number) {
  const plannedDate = getProgramDateFromWeekDay(startDate, weekNumber, dayOfWeek);
  if (!plannedDate) {
    return getProgramDayLabel(dayOfWeek);
  }

  return plannedDate.toLocaleDateString('fr-FR', {
    weekday: 'long',
  });
}

export function formatProgramPlannedDateLabel(startDate: string | null | undefined, weekNumber: number, dayOfWeek: number) {
  const plannedDate = getProgramDateFromWeekDay(startDate, weekNumber, dayOfWeek);

  if (!plannedDate) {
    return 'Date a venir';
  }

  return plannedDate.toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: 'short',
  });
}

export function formatProgramPlannedShortDateLabel(
  startDate: string | null | undefined,
  weekNumber: number,
  dayOfWeek: number
) {
  const plannedDate = getProgramDateFromWeekDay(startDate, weekNumber, dayOfWeek);

  if (!plannedDate) {
    return null;
  }

  return plannedDate.toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: 'short',
  });
}

export function groupProgramDaysByCalendarWeek(startDate: string | null | undefined, weeksCount: number) {
  const baseDate = parseLocalDate(startDate);
  const normalizedWeeksCount = Math.max(Math.trunc(weeksCount), 1);

  if (!baseDate || Number.isNaN(baseDate.getTime())) {
    return [] as ProgramCalendarWeek[];
  }

  const totalProgramDays = normalizedWeeksCount * 7;
  const weeks = new Map<string, ProgramCalendarWeek>();

  for (let dayOffset = 0; dayOffset < totalProgramDays; dayOffset += 1) {
    const currentDate = addDays(baseDate, dayOffset);
    const calendarWeekStart = startOfCalendarWeekMonday(currentDate);
    const weekKey = `${calendarWeekStart.getFullYear()}-${calendarWeekStart.getMonth()}-${calendarWeekStart.getDate()}`;
    const programWeekNumber = Math.floor(dayOffset / 7) + 1;
    const programDayNumber = (dayOffset % 7) + 1;

    if (!weeks.has(weekKey)) {
      weeks.set(weekKey, {
        key: weekKey,
        title: `Semaine du ${calendarWeekStart.toLocaleDateString('fr-FR', {
          day: '2-digit',
          month: 'short',
        })}`,
        days: [],
      });
    }

    weeks.get(weekKey)?.days.push({
      key: `${programWeekNumber}-${programDayNumber}`,
      date: currentDate,
      programWeekNumber,
      programDayNumber,
      dayLabel: currentDate.toLocaleDateString('fr-FR', { weekday: 'long' }),
      dayShortLabel: currentDate.toLocaleDateString('fr-FR', { weekday: 'short' }),
      shortDateLabel: currentDate.toLocaleDateString('fr-FR', {
        day: '2-digit',
        month: 'short',
      }),
    });
  }

  return [...weeks.values()];
}

export function getProgramEndDate(startDate: string | null | undefined, durationWeeks: number) {
  if (!startDate) return null;

  const baseDate = parseLocalDate(startDate);
  if (!baseDate || Number.isNaN(baseDate.getTime())) return null;

  const normalizedWeeks = Math.max(Math.trunc(durationWeeks), 1);
  const endDate = addDays(baseDate, normalizedWeeks * 7 - 1);
  return endDate;
}

export function formatProgramEndDate(startDate: string | null | undefined, durationWeeks: number) {
  const endDate = getProgramEndDate(startDate, durationWeeks);
  if (!endDate) return '-';

  return endDate.toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
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

  const plannedDate = getProgramDateFromWeekDay(startDate, weekNumber, dayOfWeek);
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
