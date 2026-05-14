type SportBadgeTone = 'run' | 'walk' | 'cycle' | 'strength' | 'swim' | 'trail' | 'other';

type SportBadgeMeta = {
  icon: string;
  label: string;
  tone: SportBadgeTone;
};

const sportBadgeConfigs: Array<SportBadgeMeta & { keywords: string[] }> = [
  {
    keywords: ['course', 'running', 'run', 'jog'],
    icon: '🏃',
    label: 'Course',
    tone: 'run',
  },
  {
    keywords: ['marche', 'walk'],
    icon: '🚶',
    label: 'Marche',
    tone: 'walk',
  },
  {
    keywords: ['velo', 'vélo', 'cycl', 'bike'],
    icon: '🚴',
    label: 'Vélo',
    tone: 'cycle',
  },
  {
    keywords: ['renforcement', 'muscu', 'musculation', 'fitness', 'force'],
    icon: '💪',
    label: 'Renforcement',
    tone: 'strength',
  },
  {
    keywords: ['natation', 'swim'],
    icon: '🏊',
    label: 'Natation',
    tone: 'swim',
  },
  {
    keywords: ['randon', 'trail', 'hike'],
    icon: '⛰️',
    label: 'Randonnée / trail',
    tone: 'trail',
  },
];

function normalizeSport(sport: string) {
  return sport
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

export function getSportBadgeMeta(sport: string | null | undefined, fallback = 'Autre'): SportBadgeMeta {
  const label = sport?.trim() || fallback;
  const normalized = normalizeSport(label);
  const config = sportBadgeConfigs.find((item) =>
    item.keywords.some((keyword) => normalized.includes(normalizeSport(keyword)))
  );

  if (config) {
    return {
      icon: config.icon,
      label: config.label,
      tone: config.tone,
    };
  }

  return {
    icon: '🏅',
    label,
    tone: 'other',
  };
}

export function formatSportBadgeLabel(sport: string | null | undefined, fallback = 'Autre') {
  const meta = getSportBadgeMeta(sport, fallback);
  return `${meta.icon} ${meta.label}`;
}

export function getSportBadgeClassName(
  sport: string | null | undefined,
  className = '',
  fallback = 'Autre'
) {
  const meta = getSportBadgeMeta(sport, fallback);
  return `${className} sport-badge sport-badge--${meta.tone}`.trim();
}
