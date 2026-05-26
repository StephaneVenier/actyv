export type BadgeCode =
  | 'first_activity'
  | 'five_activities'
  | 'ten_activities'
  | 'fifty_activities'
  | 'hundred_activities'
  | 'first_challenge'
  | 'five_challenges'
  | 'first_joined_challenge'
  | 'challenge_completed'
  | 'distance_10'
  | 'distance_50'
  | 'distance_100'
  | 'distance_500'
  | 'first_like'
  | 'ten_likes_received'
  | 'fifty_likes_received'
  | 'first_session_completed'
  | 'five_sessions_completed'
  | 'ten_sessions_completed'
  | 'fifty_sessions_completed'
  | 'first_program_created'
  | 'program_shared'
  | 'program_completed'
  | 'three_sports'
  | 'five_sports';

export type BadgeCategory = 'activity' | 'challenge' | 'distance' | 'social' | 'session' | 'program' | 'sport';

export type BadgeDefinition = {
  code: BadgeCode;
  name: string;
  label: string;
  description: string;
  category: BadgeCategory;
  icon: string;
  color: string;
};

export type UserBadge = {
  badge_code: string;
  unlocked_at?: string | null;
};

const LEGACY_BADGE_CODE_MAP: Record<string, BadgeCode> = {
  'first-step': 'first_activity',
  'actyv-regular': 'five_activities',
  'actyv-motivated': 'ten_activities',
  challenger: 'first_challenge',
  collective: 'first_joined_challenge',
  'distance-10': 'distance_10',
  'distance-50': 'distance_50',
  distance_10: 'distance_10',
  distance_50: 'distance_50',
  premier_pas: 'first_activity',
  actyv_regulier: 'five_activities',
  actyv_motive: 'ten_activities',
  boosteur: 'first_like',
  collectif: 'first_joined_challenge',
  distance_10_km: 'distance_10',
  distance_50_km: 'distance_50',
  premiere_seance_terminee: 'first_session_completed',
  cinq_seances_terminees: 'five_sessions_completed',
  dix_seances_terminees: 'ten_sessions_completed',
  premier_programme_cree: 'first_program_created',
  premier_programme_termine: 'program_completed',
  programme_partage: 'program_shared',
};

export const BADGES: BadgeDefinition[] = [
  {
    code: 'first_activity',
    name: 'Premier pas',
    label: 'Premier pas',
    description: 'Premiere activite ajoutee.',
    category: 'activity',
    icon: 'Footprints',
    color: '#35e66b',
  },
  {
    code: 'five_activities',
    name: 'Actyv regulier',
    label: 'Actyv regulier',
    description: '5 activites ajoutees.',
    category: 'activity',
    icon: 'TrendingUp',
    color: '#20b7a6',
  },
  {
    code: 'ten_activities',
    name: 'Actyv motive',
    label: 'Actyv motive',
    description: '10 activites ajoutees.',
    category: 'activity',
    icon: 'Flame',
    color: '#35e66b',
  },
  {
    code: 'fifty_activities',
    name: 'Machine Actyv',
    label: 'Machine Actyv',
    description: '50 activites ajoutees.',
    category: 'activity',
    icon: 'Dumbbell',
    color: '#4db3ff',
  },
  {
    code: 'hundred_activities',
    name: 'Legende Actyv',
    label: 'Legende Actyv',
    description: '100 activites ajoutees.',
    category: 'activity',
    icon: 'Crown',
    color: '#b084ff',
  },
  {
    code: 'first_challenge',
    name: 'Challenger',
    label: 'Challenger',
    description: 'Premier challenge cree.',
    category: 'challenge',
    icon: 'Trophy',
    color: '#20b7a6',
  },
  {
    code: 'five_challenges',
    name: 'Organisateur',
    label: 'Organisateur',
    description: '5 challenges crees.',
    category: 'challenge',
    icon: 'Medal',
    color: '#4db3ff',
  },
  {
    code: 'first_joined_challenge',
    name: 'Collectif',
    label: 'Collectif',
    description: 'Premier challenge rejoint.',
    category: 'challenge',
    icon: 'Users',
    color: '#35e66b',
  },
  {
    code: 'challenge_completed',
    name: 'Gladiateur',
    label: 'Gladiateur',
    description: 'Premier challenge termine.',
    category: 'challenge',
    icon: 'ShieldCheck',
    color: '#f0a35e',
  },
  {
    code: 'distance_10',
    name: 'Distance 10 km',
    label: 'Distance 10 km',
    description: '10 km cumules.',
    category: 'distance',
    icon: 'Map',
    color: '#20b7a6',
  },
  {
    code: 'distance_50',
    name: 'Distance 50 km',
    label: 'Distance 50 km',
    description: '50 km cumules.',
    category: 'distance',
    icon: 'Route',
    color: '#35e66b',
  },
  {
    code: 'distance_100',
    name: 'Distance 100 km',
    label: 'Distance 100 km',
    description: '100 km cumules.',
    category: 'distance',
    icon: 'Compass',
    color: '#4db3ff',
  },
  {
    code: 'distance_500',
    name: 'Distance 500 km',
    label: 'Distance 500 km',
    description: '500 km cumules.',
    category: 'distance',
    icon: 'Mountain',
    color: '#b084ff',
  },
  {
    code: 'first_like',
    name: 'Boosteur',
    label: 'Boosteur',
    description: 'Premier like ou boost donne.',
    category: 'social',
    icon: 'HeartHandshake',
    color: '#20b7a6',
  },
  {
    code: 'ten_likes_received',
    name: 'Inspirant',
    label: 'Inspirant',
    description: '10 reactions recues.',
    category: 'social',
    icon: 'Sparkles',
    color: '#4db3ff',
  },
  {
    code: 'fifty_likes_received',
    name: 'Star Actyv',
    label: 'Star Actyv',
    description: '50 reactions recues.',
    category: 'social',
    icon: 'Star',
    color: '#b084ff',
  },
  {
    code: 'first_session_completed',
    name: 'Premiere seance terminee',
    label: 'Premiere seance terminee',
    description: 'Premiere seance validee.',
    category: 'session',
    icon: 'PlayCircle',
    color: '#35e66b',
  },
  {
    code: 'five_sessions_completed',
    name: '5 seances terminees',
    label: '5 seances terminees',
    description: '5 seances validees.',
    category: 'session',
    icon: 'BarChart3',
    color: '#20b7a6',
  },
  {
    code: 'ten_sessions_completed',
    name: '10 seances terminees',
    label: '10 seances terminees',
    description: '10 seances validees.',
    category: 'session',
    icon: 'Gauge',
    color: '#4db3ff',
  },
  {
    code: 'fifty_sessions_completed',
    name: "Machine d'entrainement",
    label: "Machine d'entrainement",
    description: '50 seances validees.',
    category: 'session',
    icon: 'Dumbbell',
    color: '#b084ff',
  },
  {
    code: 'first_program_created',
    name: 'Premier programme cree',
    label: 'Premier programme cree',
    description: 'Creer un programme.',
    category: 'program',
    icon: 'CalendarPlus',
    color: '#20b7a6',
  },
  {
    code: 'program_shared',
    name: 'Programme partage',
    label: 'Programme partage',
    description: 'Partager un programme.',
    category: 'program',
    icon: 'Share2',
    color: '#4db3ff',
  },
  {
    code: 'program_completed',
    name: 'Programme termine',
    label: 'Programme termine',
    description: 'Terminer un programme.',
    category: 'program',
    icon: 'Flag',
    color: '#35e66b',
  },
  {
    code: 'three_sports',
    name: 'Polyvalent',
    label: 'Polyvalent',
    description: '3 sports differents pratiques.',
    category: 'sport',
    icon: 'Shapes',
    color: '#20b7a6',
  },
  {
    code: 'five_sports',
    name: 'Aventurier',
    label: 'Aventurier',
    description: '5 sports differents pratiques.',
    category: 'sport',
    icon: 'Compass',
    color: '#b084ff',
  },
];

export function normalizeBadgeCode(code: string | null | undefined): BadgeCode | null {
  if (!code) return null;
  if (BADGES.some((badge) => badge.code === code)) {
    return code as BadgeCode;
  }
  return LEGACY_BADGE_CODE_MAP[code] || null;
}

export function getBadgeByCode(code: string | null | undefined) {
  const normalizedCode = normalizeBadgeCode(code);
  if (!normalizedCode) return null;
  return BADGES.find((badge) => badge.code === normalizedCode) || null;
}

export function getUnlockedBadgeCodes(userBadges: UserBadge[]) {
  return new Set(
    userBadges
      .map((badge) => normalizeBadgeCode(badge.badge_code))
      .filter((badgeCode): badgeCode is BadgeCode => Boolean(badgeCode))
  );
}
