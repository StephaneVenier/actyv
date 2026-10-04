import { supabase } from '@/lib/supabase';
import { BADGES, getBadgeByCode, normalizeBadgeCode } from '@/lib/badges';
import type { BadgeCode } from '@/lib/badges';

export type XpSource =
  | 'challenge_created'
  | 'challenge_joined'
  | 'activity_added'
  | 'like_received'
  | 'boost_received'
  | 'challenge_completed'
  | 'session_created'
  | 'session_completed'
  | 'workout_completed'
  | 'program_completed'
  | 'program_created'
  | 'program_shared'
  | 'daily_session_completed';

export type XpRule = {
  xp: number;
  dailyLimit?: number;
  dailySourceLimit?: number;
};

export const LEVEL_XP_TABLE = [
  0, 75, 175, 325, 525, 800, 1150, 1575, 2075, 2650,
  3300, 4050, 4900, 5850, 6900, 8300, 10000, 12000, 14500, 17500,
];

export const XP_RULES: Record<XpSource, XpRule> = {
  challenge_created: { xp: 20, dailySourceLimit: 2 },
  challenge_joined: { xp: 10 },
  activity_added: { xp: 25, dailySourceLimit: 4 },
  like_received: { xp: 1, dailyLimit: 20 },
  boost_received: { xp: 3, dailyLimit: 30 },
  challenge_completed: { xp: 50 },
  session_created: { xp: 5 },
  session_completed: { xp: 10 },
  workout_completed: { xp: 10 },
  program_completed: { xp: 50 },
  program_created: { xp: 10 },
  program_shared: { xp: 15 },
  daily_session_completed: { xp: 25 },
};

export { BADGES, getBadgeByCode, normalizeBadgeCode };
export type { BadgeCode } from '@/lib/badges';

export function calculateLevel(totalXp: number) {
  const xp = Math.max(totalXp || 0, 0);
  const tableLevel = LEVEL_XP_TABLE.reduce((level, threshold, index) => {
    return xp >= threshold ? index + 1 : level;
  }, 1);

  if (xp <= LEVEL_XP_TABLE[LEVEL_XP_TABLE.length - 1]) {
    return tableLevel;
  }

  const extraXp = xp - LEVEL_XP_TABLE[LEVEL_XP_TABLE.length - 1];
  return LEVEL_XP_TABLE.length + Math.floor(extraXp / 3500);
}

export function getLevelProgress(totalXp: number) {
  const level = calculateLevel(totalXp);
  const currentThreshold =
    LEVEL_XP_TABLE[level - 1] ??
    LEVEL_XP_TABLE[LEVEL_XP_TABLE.length - 1] + (level - LEVEL_XP_TABLE.length) * 3500;
  const nextThreshold = LEVEL_XP_TABLE[level] ?? currentThreshold + 3500;
  const progressXp = Math.max(totalXp - currentThreshold, 0);
  const neededXp = Math.max(nextThreshold - currentThreshold, 1);

  return {
    level,
    currentThreshold,
    nextThreshold,
    progressPercent: Math.min((progressXp / neededXp) * 100, 100),
    xpToNextLevel: Math.max(nextThreshold - totalXp, 0),
  };
}

export async function getUserTotalXp(
  userId: string | null | undefined,
  legacyProfileXp?: number | null | undefined
) {
  if (!userId) {
    return { totalXp: 0, eventsCount: 0, error: null };
  }

  let totalXp = Number(legacyProfileXp || 0);
  let eventsCount = 0;
  let firstHardError: unknown = null;

  const xpEventsResponse = await supabase
    .from('xp_events')
    .select('xp_amount')
    .eq('user_id', userId);

  if (xpEventsResponse.error) {
    console.error('XP total query error on xp_events', xpEventsResponse.error);
    console.error('XP total query error details', {
      message: xpEventsResponse.error.message,
      code: xpEventsResponse.error.code,
      details: xpEventsResponse.error.details,
      hint: xpEventsResponse.error.hint,
    });
    firstHardError = xpEventsResponse.error;
  } else {
    const rows = (xpEventsResponse.data as Array<{ xp_amount: number | null }> | null) || [];
    totalXp = rows.reduce(
      (sum, entry) => sum + Number(entry.xp_amount || 0),
      0
    );
    eventsCount = rows.length;
  }

  return {
    totalXp,
    eventsCount,
    error: firstHardError,
  };
}

// Compatibility adapter: callers request an evaluation; only SQL selects rewards.
export async function awardXp({
  userId, source, metadata,
}: {
  userId?: string | null;
  userEmail?: string | null;
  source: XpSource;
  metadata?: Record<string, unknown>;
  xpOverride?: number | null;
}) {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user || (userId && userId !== user.id)) {
      return { awarded: false, error: { message: 'XP_AUTH_REQUIRED' } };
    }
    const targetId = metadata?.target_id;
    if (typeof targetId !== 'string' || !targetId) {
      return { awarded: false, error: { message: 'XP_TARGET_REQUIRED' } };
    }
    const { data, error } = await supabase.rpc('request_xp_reward', {
      p_event_type: source, p_target_id: targetId,
    });
    if (error) return { awarded: false, error };
    return {
      awarded: Boolean(data?.awarded),
      error: null,
      totalXp: Number(data?.total_xp || 0),
      reason: data?.reason as string | undefined,
    };
  } catch (error) {
    return { awarded: false, error };
  }
}

export async function checkAndUnlockBadgesFromStats(userId: string) {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user || user.id !== userId) {
      return { awarded: [] as BadgeCode[], error: { message: 'BADGES_AUTH_REQUIRED' }, data: null };
    }
    const { data, error } = await supabase.rpc('refresh_own_badges');
    const awarded: BadgeCode[] = Array.isArray(data?.awarded)
      ? data.awarded.map((code: string) => normalizeBadgeCode(code)).filter((code: BadgeCode | null): code is BadgeCode => Boolean(code))
      : [];
    return { awarded: error ? [] : awarded, error, data };
  } catch (error) {
    return { awarded: [] as BadgeCode[], error, data: null };
  }
}

export async function checkAndAwardBadges(userId: string) {
  return checkAndUnlockBadgesFromStats(userId);
}

export async function refreshUserBadges(userId: string) {
  return checkAndUnlockBadgesFromStats(userId);
}
