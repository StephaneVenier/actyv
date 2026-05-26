import { supabase } from '@/lib/supabase';

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
  | 'program_shared';

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
  | 'boosteur'
  | 'premiere_seance_terminee'
  | 'cinq_seances_terminees'
  | 'dix_seances_terminees'
  | 'premier_programme_cree'
  | 'premier_programme_termine'
  | 'programme_partage';

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
  session_created: { xp: 5 },
  session_completed: { xp: 10 },
  workout_completed: { xp: 10 },
  program_completed: { xp: 50 },
  program_created: { xp: 10 },
  program_shared: { xp: 15 },
};

const DIRECT_XP_EVENT_SOURCES = new Set<XpSource>([
  'session_created',
  'session_completed',
  'program_created',
  'program_shared',
  'program_completed',
]);

const XP_EVENTS_VALUE_COLUMN_CANDIDATES = ['amount', 'xp', 'points', 'value'] as const;

type XpEventsValueColumn = (typeof XP_EVENTS_VALUE_COLUMN_CANDIDATES)[number];

export const BADGES: BadgeRule[] = [
  { code: 'premier_pas', label: 'Premier pas', description: 'Premiere activite ajoutee.' },
  { code: 'actyv_regulier', label: 'Actyv regulier', description: '5 activites ajoutees.' },
  { code: 'actyv_motive', label: 'Actyv motive', description: '10 activites ajoutees.' },
  { code: 'challenger', label: 'Challenger', description: 'Premier challenge cree.' },
  { code: 'collectif', label: 'Collectif', description: 'Premier challenge rejoint.' },
  { code: 'distance_10_km', label: 'Distance 10 km', description: '10 km cumules.' },
  { code: 'distance_50_km', label: 'Distance 50 km', description: '50 km cumules.' },
  { code: 'boosteur', label: 'Boosteur', description: 'Premier like ou boost donne.' },
  { code: 'premiere_seance_terminee', label: 'Premiere seance terminee', description: 'Premiere seance d entrainement terminee.' },
  { code: 'cinq_seances_terminees', label: '5 seances terminees', description: 'Cinq seances d entrainement terminees.' },
  { code: 'dix_seances_terminees', label: '10 seances terminees', description: 'Dix seances d entrainement terminees.' },
  { code: 'premier_programme_cree', label: 'Premier programme cree', description: 'Premier programme personnel cree.' },
  { code: 'premier_programme_termine', label: 'Premier programme termine', description: 'Premier programme mene jusqu au bout.' },
  { code: 'programme_partage', label: 'Programme partage', description: 'Premier programme partage sur Actyv.' },
];

export function getBadgeByCode(code: string | null | undefined) {
  const normalizedCode = normalizeBadgeCode(code);
  if (!normalizedCode) return null;
  return BADGES.find((badge) => badge.code === normalizedCode) || null;
}

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

function isMissingColumnError(error: { code?: string | null; message?: string | null; details?: string | null } | null | undefined) {
  const content = `${error?.message || ''} ${error?.details || ''}`.toLowerCase();
  return error?.code === '42703' || content.includes('does not exist') || content.includes('column');
}

function resolveXpValueColumnFromRow(row: Record<string, unknown> | null | undefined) {
  if (!row) return null;

  const rowKeys = Object.keys(row);
  console.log('xp_events row keys =', rowKeys);

  for (const candidate of XP_EVENTS_VALUE_COLUMN_CANDIDATES) {
    if (candidate in row) {
      console.log('xp total query column =', candidate);
      return candidate;
    }
  }

  return null;
}

async function queryXpEventsWithResolvedColumn(userId: string) {
  const response = await supabase
    .from('xp_events')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (response.error) {
    return { rows: null, columnName: null, error: response.error };
  }

  const rows = (response.data as Array<Record<string, unknown>> | null) || [];
  const columnName = resolveXpValueColumnFromRow(rows[0]);

  if (!columnName) {
    return {
      rows,
      columnName: null,
      error: {
        message: 'Impossible de trouver la colonne de valeur XP dans xp_events.',
        code: 'XP_COLUMN_UNKNOWN',
        details: rows[0] ? `Colonnes detectees: ${Object.keys(rows[0]).join(', ')}` : 'Aucune ligne xp_events visible pour cet utilisateur.',
        hint: 'Verifier le schema reel de public.xp_events dans Supabase.',
      },
    };
  }

  return {
    rows,
    columnName,
    error: null,
  };
}

async function insertXpEventWithResolvedColumn(payload: {
  user_id: string;
  source: XpSource;
  xp: number;
  metadata: Record<string, unknown>;
}) {
  const schemaProbe = await queryXpEventsWithResolvedColumn(payload.user_id);

  if (schemaProbe.error && schemaProbe.columnName === null) {
    return { error: schemaProbe.error, columnName: null };
  }

  const resolvedColumnName = schemaProbe.columnName;

  if (!resolvedColumnName) {
    return {
      error: {
        message: 'Impossible de resoudre la colonne XP pour xp_events.',
        code: 'XP_COLUMN_UNKNOWN',
        details: 'Aucune colonne xp/amount/points/value detectee.',
        hint: 'Inspecter public.xp_events dans Supabase.',
      },
      columnName: null,
    };
  }

  const insertPayload: Record<string, unknown> = {
    user_id: payload.user_id,
    source: payload.source,
    metadata: payload.metadata,
    [resolvedColumnName]: payload.xp,
  };

  console.log('xp insert column =', resolvedColumnName);

  const response = await supabase.from('xp_events').insert(insertPayload);

  return { error: response.error, columnName: resolvedColumnName };
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

  const xpEventsResponse = await queryXpEventsWithResolvedColumn(userId);

  if (xpEventsResponse.error) {
    console.error('XP total query error on xp_events', xpEventsResponse.error);
    console.error('XP total query error details', {
      message: (xpEventsResponse.error as { message?: string | null }).message,
      code: (xpEventsResponse.error as { code?: string | null }).code,
      details: (xpEventsResponse.error as { details?: string | null }).details,
      hint: (xpEventsResponse.error as { hint?: string | null }).hint,
    });
    firstHardError = xpEventsResponse.error;
  } else {
    const rows = xpEventsResponse.rows || [];
    const columnName = xpEventsResponse.columnName as XpEventsValueColumn;
    totalXp = rows.reduce(
      (sum, entry) => sum + Number(entry[columnName] || 0),
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
}: {
  userId?: string | null;
  userEmail?: string | null;
  source: XpSource;
  metadata?: Record<string, unknown>;
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
      source,
      xp: XP_RULES[source].xp,
      metadata: normalizedTargetId ? { target_id: normalizedTargetId } : {},
    };

    console.log('XP payload', payload);
    console.log(`award xp ${source}`, payload);

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

    if (DIRECT_XP_EVENT_SOURCES.has(source)) {
      const { error, columnName } = await insertXpEventWithResolvedColumn(payload);

      if (error) {
        if (error.code === '23505') {
          return { awarded: false, error: null, totalXp: beforeResult.totalXp, reason: 'xp_event_already_exists' };
        }

        console.error('XP insert failed', error);
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

      console.log('xp insert succeeded with column =', columnName);
    } else {
      const { error } = await supabase.rpc('award_xp', {
        p_user_id: targetUserId,
        p_source: source,
        p_target_id: normalizedTargetId,
      });

      if (error) {
        console.error('XP insert failed', error);
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

    const { data, error } = await supabase.rpc('refresh_user_badges', {
      p_user_id: userId,
    });

    if (error) {
      console.error('BADGES ERROR:', error);
      return { awarded: [], error, data: null };
    }

    const badgeCodes =
      data && typeof data === 'object' && data !== null && Array.isArray((data as { badges?: unknown[] }).badges)
        ? ((data as { badges: string[] }).badges || [])
        : [];

    const beforeSet = new Set(
      ((beforeBadges as { badge_code: string }[] | null) || [])
        .map((badge) => normalizeBadgeCode(badge.badge_code))
        .filter((badgeCode): badgeCode is BadgeCode => Boolean(badgeCode))
    );

    const awarded = badgeCodes
      .map((badgeCode) => normalizeBadgeCode(badgeCode))
      .filter((badgeCode): badgeCode is BadgeCode => Boolean(badgeCode))
      .filter((badgeCode) => !beforeSet.has(badgeCode));

    const result = {
      rpc: 'refresh_user_badges',
      table: 'user_badges',
      columns: ['id', 'user_id', 'badge_code', 'unlocked_at'],
      data,
      awarded,
      error: null,
    };

    return result;
  } catch (error) {
    console.error('BADGES ERROR:', error);
    return { awarded: [], error, data: null };
  }
}
