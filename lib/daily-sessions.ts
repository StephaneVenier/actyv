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
