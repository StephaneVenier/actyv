import { supabase } from '@/lib/supabase';

export type XpSource =
  | 'challenge_created'
  | 'challenge_joined'
  | 'activity_added'
  | 'like_received'
  | 'boost_received'
  | 'challenge_completed';

export type XpRule = {
  xp: number;
  dailyLimit?: number;
  dailySourceLimit?: number;
};

export type BadgeCode =
  | 'premier_pas'
  | 'actyv_regulier'
  | 'actyv_motive'
  | 'challenger'
  | 'collectif'
  | 'distance_10_km'
  | 'distance_50_km'
  | 'boosteur';

type BadgeRule = {
  code: BadgeCode;
  label: string;
  description: string;
};

const LEGACY_BADGE_CODE_MAP: Record<string, BadgeCode> = {
  'first-step': 'premier_pas',
  'actyv-regular': 'actyv_regulier',
  'actyv-motivated': 'actyv_motive',
  challenger: 'challenger',
  collective: 'collectif',
  'distance-10': 'distance_10_km',
  'distance-50': 'distance_50_km',
  distance_10: 'distance_10_km',
  distance_50: 'distance_50_km',
  boosteur: 'boosteur',
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
};

export const BADGES: BadgeRule[] = [
  { code: 'premier_pas', label: '👟 Premier pas', description: 'Premiere activite ajoutee.' },
  { code: 'actyv_regulier', label: '📅 Actyv regulier', description: '5 activites ajoutees.' },
  { code: 'actyv_motive', label: '🔥 Actyv motivé', description: '10 activites ajoutees.' },
  { code: 'challenger', label: '🏆 Challenger', description: 'Premier challenge cree.' },
  { code: 'collectif', label: '🤝 Collectif', description: 'Premier challenge rejoint.' },
  { code: 'distance_10_km', label: '📍 Distance 10 km', description: '10 km cumules.' },
  { code: 'distance_50_km', label: '🚀 Distance 50 km', description: '50 km cumules.' },
  { code: 'boosteur', label: '⚡ Boosteur', description: 'Premier like ou boost donne.' },
];

export function normalizeBadgeCode(code: string | null | undefined): BadgeCode | null {
  if (!code) return null;
  if (BADGES.some((badge) => badge.code === code)) {
    return code as BadgeCode;
  }
  return LEGACY_BADGE_CODE_MAP[code] || null;
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

export async function awardXp({
  userId,
  userEmail,
  source,
  metadata,
}: {
  userId?: string | null;
  userEmail?: string | null;
  source: XpSource;
  metadata?: Record<string, unknown>;
}) {
  const targetUserId = userId || (await resolveUserIdFromEmail(userEmail));
  if (!targetUserId) return;

  try {
    const targetId = metadata?.target_id;
    const { error } = await supabase.rpc('award_xp', {
      p_user_id: targetUserId,
      p_source: source,
      p_target_id: typeof targetId === 'string' ? targetId : null,
    });

    if (error) {
      console.error('Erreur gamification XP :', error);
    }
  } catch (error) {
    console.error('Erreur gamification :', error);
  }
}

export async function awardBadge(userId: string, badgeCode: string) {
  const normalizedCode = normalizeBadgeCode(badgeCode) || (badgeCode as BadgeCode);

  const { data, error } = await supabase
    .from('user_badges')
    .upsert(
      {
        user_id: userId,
        badge_code: normalizedCode,
      },
      {
        onConflict: 'user_id,badge_code',
        ignoreDuplicates: true,
      }
    )
    .select('id, user_id, badge_code, unlocked_at');

  return { data, error, badgeCode: normalizedCode };
}

export async function checkAndAwardBadges(userId: string) {
  console.log('CHECK BADGES START');

  const [activitiesResponse, challengesResponse, participantsResponse, interactionsResponse] =
    await Promise.all([
      supabase
        .from('activities')
        .select('id, user_id, distance_km, unit_type, unit_value')
        .eq('user_id', userId),
      supabase
        .from('challenges')
        .select('id')
        .eq('created_by', userId)
        .eq('is_deleted', false),
      supabase
        .from('challenge_participants')
        .select('id')
        .eq('user_id', userId),
      supabase
        .from('activity_interactions')
        .select('id, type')
        .eq('user_id', userId)
        .in('type', ['like', 'boost']),
    ]);

  const firstError =
    activitiesResponse.error ||
    challengesResponse.error ||
    participantsResponse.error ||
    interactionsResponse.error;

  if (firstError) {
    console.error('BADGES ERROR:', firstError);
    return { awarded: [], error: firstError };
  }

  const activities = activitiesResponse.data || [];
  const createdChallenges = challengesResponse.data || [];
  const joinedChallenges = participantsResponse.data || [];
  const interactions = interactionsResponse.data || [];

  const totalDistance = activities.reduce((sum, activity) => {
    const isDistance =
      (activity.unit_type || (activity.distance_km !== null ? 'distance' : null)) === 'distance';
    if (!isDistance) return sum;
    return sum + Number(activity.unit_value ?? activity.distance_km ?? 0);
  }, 0);

  const badgesToAward: BadgeCode[] = [];

  if (activities.length >= 1) badgesToAward.push('premier_pas');
  if (activities.length >= 5) badgesToAward.push('actyv_regulier');
  if (activities.length >= 10) badgesToAward.push('actyv_motive');
  if (createdChallenges.length >= 1) badgesToAward.push('challenger');
  if (joinedChallenges.length >= 1) badgesToAward.push('collectif');
  if (totalDistance >= 10) badgesToAward.push('distance_10_km');
  if (totalDistance >= 50) badgesToAward.push('distance_50_km');
  if (interactions.length >= 1) badgesToAward.push('boosteur');

  const awarded = [];

  for (const badgeCode of badgesToAward) {
    const result = await awardBadge(userId, badgeCode);
    awarded.push(result);
  }

  const result = {
    table: 'user_badges',
    columns: ['id', 'user_id', 'badge_code', 'unlocked_at'],
    awarded,
  };

  console.log('BADGES RESULT:', result);
  return result;
}

export async function refreshUserBadges(userId: string) {
  if (!userId) {
    console.log('[badges] refresh skipped: missing userId');
    return { awarded: [], error: null };
  }

  try {
    const { data: beforeBadges, error: beforeError } = await supabase
      .from('user_badges')
      .select('badge_code')
      .eq('user_id', userId);

    if (beforeError) {
      console.error('[badges] error loading badges before refresh:', beforeError);
    }

    console.log('[badges] refresh start for user:', userId);
    console.log('[badges] badges before refresh:', beforeBadges || []);

    const { data, error } = await supabase.rpc('refresh_user_badges', {
      p_user_id: userId,
    });

    if (error) {
      console.error('BADGES ERROR:', error);
      return { awarded: [], error };
    }

    const { data: afterBadges, error: afterError } = await supabase
      .from('user_badges')
      .select('badge_code')
      .eq('user_id', userId);

    if (afterError) {
      console.error('[badges] error loading badges after refresh:', afterError);
      return { awarded: [], error: afterError };
    }

    const result = {
      rpc: 'refresh_user_badges',
      table: 'user_badges',
      columns: ['id', 'user_id', 'badge_code', 'unlocked_at'],
      data,
      afterBadges: afterBadges || [],
    };

    console.log('BADGES RESULT:', result);
    return result;
  } catch (error) {
    console.error('BADGES ERROR:', error);
    return { awarded: [], error };
  }
}
