type SportBadgeTone =
  | 'course'
  | 'marche'
  | 'velo'
  | 'renforcement'
  | 'fitness'
  | 'hiit'
  | 'mobilite'
  | 'natation'
  | 'trail'
  | 'yoga'
  | 'other';

type SportBadgeMeta = {
  icon: string;
  label: string;
  tone: SportBadgeTone;
};

type SportBadgeConfig = {
  aliases: string[];
  icon: string;
  tone: SportBadgeTone;
};

const sportBadgeConfigs: SportBadgeConfig[] = [
  { aliases: ['renforcement', 'muscu', 'musculation', 'force'], icon: '🏋', tone: 'renforcement' },
  { aliases: ['fitness'], icon: '✦', tone: 'fitness' },
  { aliases: ['hiit'], icon: '⚡', tone: 'hiit' },
  { aliases: ['mobilite', 'mobilite douce'], icon: '✧', tone: 'mobilite' },
  { aliases: ['course', 'course a pied', 'running', 'run', 'jog'], icon: '🏃', tone: 'course' },
  { aliases: ['trail', 'randonnee', 'hike'], icon: '⛰', tone: 'trail' },
  { aliases: ['marche', 'walk'], icon: '🚶', tone: 'marche' },
  { aliases: ['velo', 'bike', 'cycling', 'cyclisme'], icon: '🚲', tone: 'velo' },
  { aliases: ['yoga'], icon: '♥', tone: 'yoga' },
  { aliases: ['natation', 'swim'], icon: '🏊', tone: 'natation' },
];

function normalizeSport(sport: string) {
  return sport
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

function resolveSportBadgeConfig(sport: string | null | undefined) {
  const normalized = normalizeSport(sport || '');
  if (!normalized) return null;

  return (
    sportBadgeConfigs.find((config) => config.aliases.some((alias) => normalizeSport(alias) === normalized)) ||
    sportBadgeConfigs.find((config) => config.aliases.some((alias) => normalized.includes(normalizeSport(alias))))
  );
}

export function getSportBadgeMeta(sport: string | null | undefined, fallback = 'Autre'): SportBadgeMeta {
  const label = sport?.trim() || fallback;
  const config = resolveSportBadgeConfig(sport);

  if (config) {
    return {
      icon: config.icon,
      label,
      tone: config.tone,
    };
  }

  return {
    icon: '◎',
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
