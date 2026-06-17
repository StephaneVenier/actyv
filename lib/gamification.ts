import { supabase } from '@/lib/supabase';
import { BADGES, STEP_BADGE_CODES, getBadgeByCode, normalizeBadgeCode } from '@/lib/badges';
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

type BadgeAwardResult = {
  badgeCode: BadgeCode;
  data: unknown | null;
  error: unknown | null;
  skipped?: boolean;
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

function getCanonicalBadgeSet(badgeRows: Array<{ badge_code: string }>) {
  return new Set(
    badgeRows
      .map((badge) => normalizeBadgeCode(badge.badge_code))
      .filter((badgeCode): badgeCode is BadgeCode => Boolean(badgeCode))
  );
}

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

async function resolveUserIdFromEmail(email: string | null | undefined) {
  if (!email) return null;

  const { data, error } = await supabase.from('profiles').select('id').eq('email', email).maybeSingle();

  if (error) {
    console.error('Erreur resolution profil gamification :', error);
    return null;
  }

  return data?.id || null;
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

export async function awardXp({
  userId,
  userEmail,
  source,
  metadata,
  xpOverride,
}: {
  userId?: string | null;
  userEmail?: string | null;
  source: XpSource;
  metadata?: Record<string, unknown>;
  xpOverride?: number | null;
}) {
  const targetUserId = userId || (await resolveUserIdFromEmail(userEmail));
  if (!targetUserId) return { awarded: false };

  try {
    const beforeResult = await getUserTotalXp(targetUserId, 0);
    if (beforeResult.error) {
      return { awarded: false, error: beforeResult.error, totalXp: beforeResult.totalXp };
    }

    const targetId = metadata?.target_id;
    const normalizedTargetId = typeof targetId === 'string' ? targetId : null;
    const {
      data: { user: authUser },
    } = await supabase.auth.getUser();

    const payload = {
      user_id: targetUserId,
      event_type: source,
      xp_amount:
        Number.isFinite(Number(xpOverride)) && Number(xpOverride) >= 0
          ? Number(xpOverride)
          : XP_RULES[source].xp,
      target_id: normalizedTargetId,
    };

    if (authUser?.id !== targetUserId) {
      return {
        awarded: false,
        error: {
          message: 'Utilisateur non connecte ou non autorise pour attribuer cet XP.',
          code: 'XP_AUTH_REQUIRED',
          details: 'La RPC award_xp exige un utilisateur authentifie pour son propre user_id.',
          hint: 'Verifie supabase.auth.getUser() avant awardXp.',
        },
        totalXp: beforeResult.totalXp,
      };
    }

    const existingEventResponse = normalizedTargetId
      ? await supabase
          .from('xp_events')
          .select('id')
          .eq('user_id', targetUserId)
          .eq('event_type', source)
          .eq('target_id', normalizedTargetId)
          .maybeSingle()
      : { data: null, error: null };

    if (existingEventResponse.error) {
      console.error('XP dedupe lookup failed', existingEventResponse.error);
      console.error('XP dedupe lookup details', {
        message: existingEventResponse.error.message,
        code: existingEventResponse.error.code,
        details: existingEventResponse.error.details,
        hint: existingEventResponse.error.hint,
      });
      return { awarded: false, error: existingEventResponse.error, totalXp: beforeResult.totalXp };
    }

    if (existingEventResponse.data) {
      return { awarded: false, error: null, totalXp: beforeResult.totalXp, reason: 'xp_event_already_exists' };
    }

    const { error } = await supabase.from('xp_events').insert(payload);

    if (error) {
      if (error.code === '23505') {
        return { awarded: false, error: null, totalXp: beforeResult.totalXp, reason: 'xp_event_already_exists' };
      }

      console.error('award xp insert error', error);
      console.error('XP award error details', {
        message: error.message,
        code: error.code,
        details: error.details,
        hint: error.hint,
      });
      console.error('XP award failed', {
        payload,
        error,
      });
      return { awarded: false, error, totalXp: beforeResult.totalXp };
    }

    const afterResult = await getUserTotalXp(targetUserId, beforeResult.totalXp);
    if (afterResult.error) {
      return { awarded: false, error: afterResult.error, totalXp: afterResult.totalXp };
    }

    const didIncreaseXp = afterResult.totalXp > beforeResult.totalXp;

    if (!didIncreaseXp) {
      return {
        awarded: false,
        error: null,
        reason: 'xp_not_persisted',
      };
    }

    return { awarded: true, error: null, totalXp: afterResult.totalXp };
  } catch (error) {
    console.error('Erreur gamification :', error);
    return { awarded: false, error };
  }
}

export async function awardBadge(userId: string, badgeCode: string) {
  const normalizedCode = normalizeBadgeCode(badgeCode) || (badgeCode as BadgeCode);

  const existingResponse = await supabase.from('user_badges').select('badge_code').eq('user_id', userId);

  if (existingResponse.error) {
    console.error('badge insert error', existingResponse.error);
    return { data: null, error: existingResponse.error, badgeCode: normalizedCode };
  }

  const normalizedExistingSet = getCanonicalBadgeSet(
    (existingResponse.data as Array<{ badge_code: string }> | null) || []
  );

  if (normalizedExistingSet.has(normalizedCode)) {
    return { data: null, error: null, badgeCode: normalizedCode, skipped: true };
  }

  const { data, error } = await supabase
    .from('user_badges')
    .insert({
      user_id: userId,
      badge_code: normalizedCode,
      unlocked_at: new Date().toISOString(),
    })
    .select('id, user_id, badge_code, unlocked_at');

  if (error) {
    console.error('badge insert error', error);
  }

  return { data, error, badgeCode: normalizedCode };
}

function buildBadgeCodesFromStats(summary: {
  overview: {
    totalActivities: number;
    totalDistanceKm: number;
    activitiesBySport: Array<{ sport: string; count: number }>;
  };
  movement: {
    totalStepsForBadges: number;
    maxDailyStepsForBadges: number;
    weeklySteps: number;
    activeStepDays: number;
    healthConnectSyncs: number;
  };
  sessions: {
    completedWorkouts: number;
  };
  dailySessions: {
    completedCount: number;
    currentStreak: number;
    bestStreak: number;
  };
  programs: {
    createdPrograms: number;
    sharedPrograms: number;
    completedPrograms: number;
    completedProgramSessions: number;
  };
  challenges: {
    createdChallenges: number;
    joinedChallenges: number;
    completedChallenges: number;
  };
  social: {
    likesGiven: number;
    likesReceived: number;
    boostsGiven: number;
    boostsReceived: number;
  };
}) {
  const badgeCodes: BadgeCode[] = [];
  const distinctSportsCount = summary.overview.activitiesBySport.length;

  if (summary.overview.totalActivities >= 1) badgeCodes.push('first_activity');
  if (summary.overview.totalActivities >= 5) badgeCodes.push('five_activities');
  if (summary.overview.totalActivities >= 10) badgeCodes.push('ten_activities');
  if (summary.overview.totalActivities >= 50) badgeCodes.push('fifty_activities');
  if (summary.overview.totalActivities >= 100) badgeCodes.push('hundred_activities');

  if (summary.challenges.createdChallenges >= 1) badgeCodes.push('first_challenge');
  if (summary.challenges.createdChallenges >= 5) badgeCodes.push('five_challenges');
  if (summary.challenges.joinedChallenges >= 1) badgeCodes.push('first_joined_challenge');
  if (summary.challenges.completedChallenges >= 1) badgeCodes.push('challenge_completed');

  if (summary.overview.totalDistanceKm >= 10) badgeCodes.push('distance_10');
  if (summary.overview.totalDistanceKm >= 50) badgeCodes.push('distance_50');
  if (summary.overview.totalDistanceKm >= 100) badgeCodes.push('distance_100');
  if (summary.overview.totalDistanceKm >= 500) badgeCodes.push('distance_500');

  if (summary.social.likesGiven >= 1 || summary.social.boostsGiven >= 1) badgeCodes.push('first_like');
  if (summary.social.likesReceived >= 10) badgeCodes.push('ten_likes_received');
  if (summary.social.likesReceived >= 50) badgeCodes.push('fifty_likes_received');

  if (summary.sessions.completedWorkouts >= 1) badgeCodes.push('first_session_completed');
  if (summary.sessions.completedWorkouts >= 5) badgeCodes.push('five_sessions_completed');
  if (summary.sessions.completedWorkouts >= 10) badgeCodes.push('ten_sessions_completed');
  if (summary.sessions.completedWorkouts >= 50) badgeCodes.push('fifty_sessions_completed');

  if (summary.programs.createdPrograms >= 1) badgeCodes.push('first_program_created');
  if (summary.programs.sharedPrograms >= 1) badgeCodes.push('program_shared');
  if (summary.programs.completedPrograms >= 1) badgeCodes.push('program_completed');

  if (summary.dailySessions.completedCount >= 1) badgeCodes.push('first_daily_session');
  if (summary.dailySessions.currentStreak >= 3) badgeCodes.push('daily_streak_3');
  if (summary.dailySessions.currentStreak >= 7) badgeCodes.push('daily_streak_7');
  if (summary.dailySessions.currentStreak >= 30) badgeCodes.push('daily_streak_30');

  if (summary.movement.healthConnectSyncs >= 1) badgeCodes.push(STEP_BADGE_CODES.firstHealthConnectSync);
  if (summary.movement.maxDailyStepsForBadges >= 5000) badgeCodes.push(STEP_BADGE_CODES.steps5000Day);
  if (summary.movement.maxDailyStepsForBadges >= 10000) badgeCodes.push(STEP_BADGE_CODES.steps10000Day);
  if (summary.movement.maxDailyStepsForBadges >= 20000) badgeCodes.push(STEP_BADGE_CODES.steps20000Day);
  if (summary.movement.totalStepsForBadges >= 10000) badgeCodes.push(STEP_BADGE_CODES.steps10000Total);
  if (summary.movement.totalStepsForBadges >= 50000) badgeCodes.push(STEP_BADGE_CODES.steps50000Total);
  if (summary.movement.totalStepsForBadges >= 100000) badgeCodes.push(STEP_BADGE_CODES.steps100000Total);
  if (summary.movement.totalStepsForBadges > 0) badgeCodes.push(STEP_BADGE_CODES.stepsFirst);
  if (summary.movement.weeklySteps >= 50000) {
    badgeCodes.push(STEP_BADGE_CODES.weekly50000);
  }

  if (distinctSportsCount >= 3) badgeCodes.push('three_sports');
  if (distinctSportsCount >= 5) badgeCodes.push('five_sports');

  return badgeCodes;
}

export async function checkAndUnlockBadgesFromStats(userId: string) {
  if (!userId) {
    return { awarded: [], error: null, data: null };
  }

  try {
    const { data: profileData, error: profileError } = await supabase
      .from('profiles')
      .select('email')
      .eq('id', userId)
      .maybeSingle();

    if (profileError) {
      console.error('BADGES DEBUG profile lookup error:', profileError);
    }

    const userEmail = (profileData as { email?: string | null } | null)?.email || null;
    const { loadUserStatistics } = await import('@/lib/user-statistics');
    const stats = await loadUserStatistics(userId, userEmail);

    const { data: existingBadgesData, error: existingBadgesError } = await supabase
      .from('user_badges')
      .select('badge_code')
      .eq('user_id', userId);

    if (existingBadgesError) {
      console.error('BADGES DEBUG existing badges read error:', existingBadgesError);
      return { awarded: [], error: existingBadgesError, data: stats };
    }

    const existingBadgeCodes = getCanonicalBadgeSet(
      ((existingBadgesData as { badge_code: string }[] | null) || [])
    );

    const badgeCodesToUnlock = buildBadgeCodesFromStats(stats).filter(
      (badgeCode) => !existingBadgeCodes.has(badgeCode)
    );

    console.log('BADGES DEBUG stats summary', {
      userId,
      totalActivities: stats.overview.totalActivities,
      totalDistanceKm: stats.overview.totalDistanceKm,
      completedWorkouts: stats.sessions.completedWorkouts,
      createdPrograms: stats.programs.createdPrograms,
      sharedPrograms: stats.programs.sharedPrograms,
      createdChallenges: stats.challenges.createdChallenges,
      joinedChallenges: stats.challenges.joinedChallenges,
      likesGiven: stats.social.likesGiven,
      likesReceived: stats.social.likesReceived,
      boostsGiven: stats.social.boostsGiven,
      boostsReceived: stats.social.boostsReceived,
      totalStepsForBadges: stats.movement.totalStepsForBadges,
      maxDailyStepsForBadges: stats.movement.maxDailyStepsForBadges,
      weeklySteps: stats.movement.weeklySteps,
      healthConnectSyncs: stats.movement.healthConnectSyncs,
      dailySessionCount: stats.dailySessions.completedCount,
      dailySessionStreak: stats.dailySessions.currentStreak,
      existingBadgeCodes: Array.from(existingBadgeCodes),
      badgeCodesToUnlock,
    });

    const awarded: BadgeAwardResult[] = [];

    for (const badgeCode of badgeCodesToUnlock) {
      const result = await awardBadge(userId, badgeCode);
      console.log('BADGES DEBUG insert result', {
        userId,
        badgeCode,
        result,
      });
      awarded.push({
        badgeCode,
        data: result.data ?? null,
        error: result.error ?? null,
        skipped: result.skipped,
      });
    }

    const insertErrors = awarded.filter((entry) => Boolean(entry.error));

    return {
      table: 'user_badges',
      columns: ['id', 'user_id', 'badge_code', 'unlocked_at'],
      awarded,
      insertErrors,
      data: stats,
      error: insertErrors[0]?.error || null,
    };
  } catch (error) {
    console.error('BADGES DEBUG stats unlock failure:', error);
    return { awarded: [], error, data: null };
  }
}

export async function checkAndAwardBadges(userId: string) {
  return checkAndUnlockBadgesFromStats(userId);
}

export async function refreshUserBadges(userId: string) {
  return checkAndUnlockBadgesFromStats(userId);
}
