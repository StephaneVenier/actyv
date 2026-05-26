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

export type BadgeCategory = 'activity' | 'challenge' | 'distance' | 'social' | 'session' | 'program';

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

export const BADGES: BadgeDefinition[] = [
  {
    code: 'premier_pas',
    name: 'Premier pas',
    label: 'Premier pas',
    description: 'Premiere activite ajoutee.',
    category: 'activity',
    icon: 'Footprints',
    color: '#35e66b',
  },
  {
    code: 'actyv_regulier',
    name: 'Actyv regulier',
    label: 'Actyv regulier',
    description: '5 activites ajoutees.',
    category: 'activity',
    icon: 'TrendingUp',
    color: '#20b7a6',
  },
  {
    code: 'actyv_motive',
    name: 'Actyv motive',
    label: 'Actyv motive',
    description: '10 activites ajoutees.',
    category: 'activity',
    icon: 'Flame',
    color: '#35e66b',
  },
  {
    code: 'challenger',
    name: 'Challenger',
    label: 'Challenger',
    description: 'Premier challenge cree.',
    category: 'challenge',
    icon: 'Trophy',
    color: '#20b7a6',
  },
  {
    code: 'collectif',
    name: 'Collectif',
    label: 'Collectif',
    description: 'Premier challenge rejoint.',
    category: 'challenge',
    icon: 'Users',
    color: '#35e66b',
  },
  {
    code: 'distance_10_km',
    name: 'Distance 10 km',
    label: 'Distance 10 km',
    description: '10 km cumules.',
    category: 'distance',
    icon: 'Map',
    color: '#20b7a6',
  },
  {
    code: 'distance_50_km',
    name: 'Distance 50 km',
    label: 'Distance 50 km',
    description: '50 km cumules.',
    category: 'distance',
    icon: 'Route',
    color: '#35e66b',
  },
  {
    code: 'boosteur',
    name: 'Boosteur',
    label: 'Boosteur',
    description: 'Premier like ou boost donne.',
    category: 'social',
    icon: 'HeartHandshake',
    color: '#20b7a6',
  },
  {
    code: 'premiere_seance_terminee',
    name: 'Premiere seance terminee',
    label: 'Premiere seance terminee',
    description: 'Premiere seance d entrainement terminee.',
    category: 'session',
    icon: 'PlayCircle',
    color: '#35e66b',
  },
  {
    code: 'cinq_seances_terminees',
    name: '5 seances terminees',
    label: '5 seances terminees',
    description: 'Cinq seances d entrainement terminees.',
    category: 'session',
    icon: 'BarChart3',
    color: '#20b7a6',
  },
  {
    code: 'dix_seances_terminees',
    name: '10 seances terminees',
    label: '10 seances terminees',
    description: 'Dix seances d entrainement terminees.',
    category: 'session',
    icon: 'Gauge',
    color: '#35e66b',
  },
  {
    code: 'premier_programme_cree',
    name: 'Premier programme cree',
    label: 'Premier programme cree',
    description: 'Premier programme personnel cree.',
    category: 'program',
    icon: 'CalendarPlus',
    color: '#20b7a6',
  },
  {
    code: 'premier_programme_termine',
    name: 'Premier programme termine',
    label: 'Premier programme termine',
    description: 'Premier programme mene jusqu au bout.',
    category: 'program',
    icon: 'Flag',
    color: '#35e66b',
  },
  {
    code: 'programme_partage',
    name: 'Programme partage',
    label: 'Programme partage',
    description: 'Premier programme partage sur Actyv.',
    category: 'program',
    icon: 'Share2',
    color: '#20b7a6',
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
