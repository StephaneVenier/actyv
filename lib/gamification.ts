import { supabase } from '@/lib/supabase';
import { BADGES, getBadgeByCode, normalizeBadgeCode } from '@/lib/badges';
import type { BadgeCode } from '@/lib/badges';
import { getDailySessionStreakDays } from '@/lib/daily-sessions';

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

type BadgeActivityRow = {
  id: string;
  user_id: string | null;
  user_email?: string | null;
  sport?: string | null;
  challenge_id?: string | null;
  distance_km: number | null;
  unit_type: string | null;
  unit_value: number | null;
};

type BadgeTrainingProgramRow = {
  id: string;
  visibility: string | null;
  copied_from_program_id: string | null;
};

type BadgeXpEventRow = {
  event_type: string | null;
};

type BadgeDailySessionCompletionRow = {
  scheduled_for: string;
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

async function fetchTrainingProgramsForBadges(userId: string) {
  const primaryResponse = await supabase
    .from('training_programs')
    .select('id, visibility, copied_from_program_id')
    .eq('user_id', userId);

  if (!primaryResponse.error) {
    return {
      data: ((primaryResponse.data as BadgeTrainingProgramRow[] | null) || []).map((program) => ({
        ...program,
        copied_from_program_id: program.copied_from_program_id ?? null,
      })),
      error: null,
    };
  }

  const message = (primaryResponse.error.message || '').toLowerCase();
  const missingCopiedFromColumn =
    primaryResponse.error.code === '42703' ||
    (message.includes('copied_from_program_id') && message.includes('column'));

  if (!missingCopiedFromColumn) {
    return { data: null, error: primaryResponse.error };
  }

  const fallbackResponse = await supabase
    .from('training_programs')
    .select('id, visibility')
    .eq('user_id', userId);

  if (fallbackResponse.error) {
    return { data: null, error: fallbackResponse.error };
  }

  return {
    data: (((fallbackResponse.data as Array<{ id: string; visibility: string | null }> | null) || []).map(
      (program) => ({
        id: program.id,
        visibility: program.visibility,
        copied_from_program_id: null,
      })
    ) as BadgeTrainingProgramRow[]),
    error: null,
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

export async function checkAndAwardBadges(userId: string) {
  const { data: profileData } = await supabase
    .from('profiles')
    .select('email')
    .eq('id', userId)
    .maybeSingle();

  const userEmail = (profileData as { email?: string | null } | null)?.email || null;

  const [
    activitiesResponse,
    challengesResponse,
    participantsResponse,
    membersResponse,
    interactionsResponse,
    workoutHistoryResponse,
    trainingProgramsResponse,
    xpEventsResponse,
    dailySessionCompletionsResponse,
  ] = await Promise.all([
      supabase
        .from('activities')
        .select('id, user_id, user_email, sport, challenge_id, distance_km, unit_type, unit_value')
        .or(`user_id.eq.${userId}${userEmail ? `,user_email.eq.${userEmail}` : ''}`),
      supabase
        .from('challenges')
        .select('id')
        .eq('created_by', userId)
        .eq('is_deleted', false),
      supabase
        .from('challenge_participants')
        .select('id')
        .eq('user_id', userId),
      userEmail
        ? supabase.from('challenge_members').select('id').eq('user_email', userEmail)
        : Promise.resolve({ data: [], error: null }),
      supabase
        .from('activity_interactions')
        .select('id, type')
        .eq('user_id', userId)
        .in('type', ['like', 'boost']),
      supabase
        .from('workout_sessions_history')
        .select('id')
        .eq('user_id', userId),
      fetchTrainingProgramsForBadges(userId),
      supabase
        .from('xp_events')
        .select('event_type')
        .eq('user_id', userId)
        .in('event_type', ['challenge_completed', 'program_completed']),
      supabase
        .from('daily_session_completions')
        .select('scheduled_for')
        .eq('user_id', userId)
        .order('scheduled_for', { ascending: false })
        .limit(120),
    ]);

  const firstError =
    activitiesResponse.error ||
    challengesResponse.error ||
    participantsResponse.error ||
    membersResponse.error ||
    interactionsResponse.error ||
    workoutHistoryResponse.error ||
    trainingProgramsResponse.error ||
    xpEventsResponse.error ||
    dailySessionCompletionsResponse.error;

  if (firstError) {
    console.error('BADGES ERROR:', firstError);
    return { awarded: [], error: firstError };
  }

  const activities = (activitiesResponse.data as BadgeActivityRow[] | null) || [];
  const createdChallenges = challengesResponse.data || [];
  const joinedChallenges = participantsResponse.data || [];
  const joinedMembers = membersResponse.data || [];
  const interactions = interactionsResponse.data || [];
  const workoutHistory = workoutHistoryResponse.data || [];
  const trainingPrograms = (trainingProgramsResponse.data as BadgeTrainingProgramRow[] | null) || [];
  const xpEvents = (xpEventsResponse.data as BadgeXpEventRow[] | null) || [];
  const dailySessionCompletions =
    (dailySessionCompletionsResponse.data as BadgeDailySessionCompletionRow[] | null) || [];

  const ownedActivityIds = activities.map((activity) => activity.id);
  const reactionsReceivedResponse =
    ownedActivityIds.length > 0
      ? await supabase
          .from('activity_interactions')
          .select('id')
          .in('activity_id', ownedActivityIds)
      : { data: [], error: null };

  if (reactionsReceivedResponse.error) {
    console.error('BADGES ERROR:', reactionsReceivedResponse.error);
    return { awarded: [], error: reactionsReceivedResponse.error };
  }

  const reactionsReceived = reactionsReceivedResponse.data || [];

  const totalDistance = activities.reduce((sum, activity) => {
    const isDistance =
      (activity.unit_type || (activity.distance_km !== null ? 'distance' : null)) === 'distance';
    if (!isDistance) return sum;
    return sum + Number(activity.unit_value ?? activity.distance_km ?? 0);
  }, 0);

  const distinctSportsCount = new Set(
    activities
      .map((activity) => (activity.sport || '').trim().toLowerCase())
      .filter(Boolean)
  ).size;

  const completedSessionsCount = workoutHistory.length;
  const createdPrograms = trainingPrograms.filter((program) => !program.copied_from_program_id);
  const sharedProgramsCount = createdPrograms.filter((program) => program.visibility === 'shared').length;
  const challengeCompletedCount = xpEvents.filter((event) => event.event_type === 'challenge_completed').length;
  const programCompletedCount = xpEvents.filter((event) => event.event_type === 'program_completed').length;
  const dailySessionCount = dailySessionCompletions.length;
  const dailySessionStreak = getDailySessionStreakDays(dailySessionCompletions);

  const badgesToAward: BadgeCode[] = [];

  if (activities.length >= 1) badgesToAward.push('first_activity');
  if (activities.length >= 5) badgesToAward.push('five_activities');
  if (activities.length >= 10) badgesToAward.push('ten_activities');
  if (activities.length >= 50) badgesToAward.push('fifty_activities');
  if (activities.length >= 100) badgesToAward.push('hundred_activities');

  if (createdChallenges.length >= 1) badgesToAward.push('first_challenge');
  if (createdChallenges.length >= 5) badgesToAward.push('five_challenges');
  if (joinedChallenges.length + joinedMembers.length >= 1) badgesToAward.push('first_joined_challenge');
  if (challengeCompletedCount >= 1) badgesToAward.push('challenge_completed');

  if (totalDistance >= 10) badgesToAward.push('distance_10');
  if (totalDistance >= 50) badgesToAward.push('distance_50');
  if (totalDistance >= 100) badgesToAward.push('distance_100');
  if (totalDistance >= 500) badgesToAward.push('distance_500');

  if (interactions.length >= 1) badgesToAward.push('first_like');
  if (reactionsReceived.length >= 10) badgesToAward.push('ten_likes_received');
  if (reactionsReceived.length >= 50) badgesToAward.push('fifty_likes_received');

  if (completedSessionsCount >= 1) badgesToAward.push('first_session_completed');
  if (completedSessionsCount >= 5) badgesToAward.push('five_sessions_completed');
  if (completedSessionsCount >= 10) badgesToAward.push('ten_sessions_completed');
  if (completedSessionsCount >= 50) badgesToAward.push('fifty_sessions_completed');

  if (createdPrograms.length >= 1) badgesToAward.push('first_program_created');
  if (sharedProgramsCount >= 1) badgesToAward.push('program_shared');
  if (programCompletedCount >= 1) badgesToAward.push('program_completed');

  if (dailySessionCount >= 1) badgesToAward.push('first_daily_session');
  if (dailySessionStreak >= 3) badgesToAward.push('daily_streak_3');
  if (dailySessionStreak >= 7) badgesToAward.push('daily_streak_7');
  if (dailySessionStreak >= 30) badgesToAward.push('daily_streak_30');

  if (distinctSportsCount >= 3) badgesToAward.push('three_sports');
  if (distinctSportsCount >= 5) badgesToAward.push('five_sports');

  const awarded = [];

  for (const badgeCode of badgesToAward) {
    const result = await awardBadge(userId, badgeCode);
    awarded.push(result);
  }

  const unlockedCodes = awarded
    .filter((entry) => !entry.error && !entry.skipped)
    .map((entry) => entry.badgeCode);

  const result = {
    table: 'user_badges',
    columns: ['id', 'user_id', 'badge_code', 'unlocked_at'],
    awarded,
  };

  return result;
}

export async function refreshUserBadges(userId: string) {
  if (!userId) {
    return { awarded: [], error: null, data: null };
  }

  try {
    const { data: beforeBadges, error: beforeError } = await supabase
      .from('user_badges')
      .select('badge_code')
      .eq('user_id', userId);

    if (beforeError) {
      console.error('Erreur lecture badges avant refresh :', beforeError);
      return { awarded: [], error: beforeError, data: null };
    }

    const beforeSet = getCanonicalBadgeSet(
      ((beforeBadges as { badge_code: string }[] | null) || [])
    );

    const { data, error } = await supabase.rpc('refresh_user_badges', {
      p_user_id: userId,
    });

    if (error) {
      console.error('BADGES ERROR:', error);
    }

    const localResult = await checkAndAwardBadges(userId);

    if (localResult.error) {
      return { awarded: [], error: localResult.error, data: localResult };
    }

    const { data: afterBadges, error: afterError } = await supabase
      .from('user_badges')
      .select('badge_code')
      .eq('user_id', userId);

    if (afterError) {
      console.error('Erreur lecture badges apres refresh :', afterError);
      return { awarded: [], error: afterError, data: localResult };
    }

    const afterSet = getCanonicalBadgeSet(
      ((afterBadges as { badge_code: string }[] | null) || [])
    );

    const awarded = Array.from(afterSet).filter((badgeCode) => !beforeSet.has(badgeCode));

    const result = {
      rpc: 'refresh_user_badges',
      table: 'user_badges',
      columns: ['id', 'user_id', 'badge_code', 'unlocked_at'],
      data: {
        rpcResult: data,
        rpcError: error,
        localResult,
      },
      awarded,
      error: null,
    };

    return result;
  } catch (error) {
    console.error('BADGES ERROR:', error);
    return { awarded: [], error, data: null };
  }
}
