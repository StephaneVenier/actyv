export type DailySession = {
  id: string;
  session_id: string;
  scheduled_for: string;
  bonus_xp: number;
  created_at: string | null;
};

export type DailySessionCompletion = {
  id: string;
  daily_session_id: string;
  user_id: string;
  session_id: string | null;
  workout_history_id: string | null;
  scheduled_for: string;
  completed_at: string;
  created_at: string | null;
};

export function getTodayIsoDate() {
  const now = new Date();
  const year = now.getFullYear();
  const month = `${now.getMonth() + 1}`.padStart(2, '0');
  const day = `${now.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function formatDailySessionDateLabel(dateString: string | null | undefined) {
  if (!dateString) return 'Date a definir';

  const [year, month, day] = dateString.split('-').map(Number);
  if (!year || !month || !day) return 'Date a definir';

  const date = new Date(year, month - 1, day);
  if (Number.isNaN(date.getTime())) return 'Date a definir';

  return date.toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
  });
}

export function isDailySessionForToday(dateString: string | null | undefined) {
  return dateString === getTodayIsoDate();
}

function parseIsoLocalDate(dateString: string | null | undefined) {
  if (!dateString) return null;

  const [year, month, day] = dateString.split('-').map(Number);
  if (!year || !month || !day) return null;

  const parsed = new Date(year, month - 1, day);
  if (Number.isNaN(parsed.getTime())) return null;

  return new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
}

export function getDailySessionStreakDays(
  completions: Array<Pick<DailySessionCompletion, 'scheduled_for'>> | null | undefined
) {
  if (!completions?.length) return 0;

  const completionDates = Array.from(
    new Set(
      completions
        .map((completion) => completion.scheduled_for)
        .filter((dateString): dateString is string => Boolean(dateString))
    )
  )
    .map(parseIsoLocalDate)
    .filter((date): date is Date => Boolean(date))
    .sort((left, right) => right.getTime() - left.getTime());

  if (completionDates.length === 0) return 0;

  const today = parseIsoLocalDate(getTodayIsoDate());
  if (!today) return 0;

  const latestDate = completionDates[0];
  const diffFromToday = Math.round((today.getTime() - latestDate.getTime()) / 86400000);

  if (diffFromToday > 1) return 0;

  let streak = 1;

  for (let index = 1; index < completionDates.length; index += 1) {
    const previousDate = completionDates[index - 1];
    const currentDate = completionDates[index];
    const dayGap = Math.round((previousDate.getTime() - currentDate.getTime()) / 86400000);

    if (dayGap !== 1) break;
    streak += 1;
  }

  return streak;
}
