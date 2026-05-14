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

type BadgeRule = {
  code: string;
  label: string;
  description: string;
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
  { code: 'first-step', label: 'Premier pas', description: 'Ajouter une premiere activite.' },
  { code: 'creator', label: 'Createur', description: 'Creer un premier challenge.' },
  { code: 'collective', label: 'Collectif', description: 'Rejoindre un premier challenge.' },
  { code: 'regular', label: 'Regulier', description: 'Ajouter 5 activites.' },
  { code: 'serious', label: 'Serieux', description: 'Ajouter 10 activites.' },
  { code: 'booster', label: 'Booster', description: 'Donner 10 boosts.' },
  { code: 'motivated', label: 'Motive', description: 'Recevoir 10 boosts.' },
  { code: 'finisher', label: 'Finisher', description: 'Participer a un challenge termine.' },
];

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
  const currentThreshold = LEVEL_XP_TABLE[level - 1] ?? LEVEL_XP_TABLE[LEVEL_XP_TABLE.length - 1] + (level - LEVEL_XP_TABLE.length) * 3500;
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

  const { data, error } = await supabase
    .from('profiles')
    .select('id')
    .eq('email', email)
    .maybeSingle();

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
