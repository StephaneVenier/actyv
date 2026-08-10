export const MASTERY_MEASUREMENT_TYPES = [
  'reps',
  'duration',
  'distance',
  'elevation',
  'volume',
  'count',
] as const;

export const MASTERY_SOURCES = ['manual', 'session', 'activity', 'import'] as const;

export type MasteryMeasurementType = (typeof MASTERY_MEASUREMENT_TYPES)[number];
export type MasterySource = (typeof MASTERY_SOURCES)[number];

export type MasteryCategory = {
  id: string;
  dbId?: string;
  label: string;
  sortOrder: number;
  active?: boolean;
};

export type MasteryLevel = {
  masteryId: string;
  level: number;
  threshold: number;
  xpReward: number;
};

export type MasteryEntry = {
  id: string;
  userId: string;
  masteryId: string;
  value: number;
  source: MasterySource;
  sourceRefId: string | null;
  metadata: Record<string, unknown>;
  performedAt: string;
  createdAt: string;
};

export type MasteryUnlock = {
  id?: string;
  userId: string;
  masteryId: string;
  level: number;
  xpAwarded: number;
  unlockedAt: string;
};

export type MasteryProgress = {
  totalValue: number;
  currentLevel: number;
  currentThreshold: number;
  nextLevel: number;
  nextThreshold: number;
  remainingValue: number;
  progressPercent: number;
  xpRewardNextLevel: number;
  isMaxLevel: boolean;
};

export type Mastery = {
  id: string;
  dbId: string;
  categoryId: string;
  categoryDbId: string;
  name: string;
  unit: string;
  measurementType: MasteryMeasurementType;
  description: string | null;
  level: number;
  currentValue: number;
  currentThreshold: number;
  nextLevel: number;
  nextLevelTarget: number;
  remainingValue: number;
  progressPercent: number;
  totalValue: number;
  last15DaysValue: number;
  bestSessionValue: number;
  nextRewardXp: number;
  isMaxLevel: boolean;
};

export type MasteryCategorySummary = {
  startedCount: number;
  earnedLevels: number;
};

export type MasteryDashboardData = {
  categories: MasteryCategory[];
  masteries: Mastery[];
  masteriesByCategory: Record<string, Mastery[]>;
  summaries: Record<string, MasteryCategorySummary>;
};

export type MasteryDetailData = {
  mastery: Mastery;
  history: MasteryEntry[];
  recentUnlocks: MasteryUnlock[];
};

export type AddMasteryEntryResult = {
  entryId: string;
  masteryId: string;
  totalValue: number;
  currentLevel: number;
  currentThreshold: number;
  nextLevel: number;
  nextThreshold: number;
  remainingValue: number;
  progressPercent: number;
  xpRewardNextLevel: number;
  xpAwarded: number;
  unlockedLevels: Array<{
    level: number;
    xpReward: number;
  }>;
  insertedValue: number;
  isMaxLevel: boolean;
};

export const MASTERY_CATEGORY_FALLBACKS: MasteryCategory[] = [
  { id: 'fitness', label: 'Fitness', sortOrder: 1 },
  { id: 'musculation', label: 'Musculation', sortOrder: 2 },
  { id: 'course-a-pied', label: 'Course à pied', sortOrder: 3 },
  { id: 'trail', label: 'Trail', sortOrder: 4 },
  { id: 'marche', label: 'Marche', sortOrder: 5 },
  { id: 'velo', label: 'Vélo', sortOrder: 6 },
  { id: 'natation', label: 'Natation', sortOrder: 7 },
];

function clampPercent(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(value, 100));
}

export function normalizeMasteryNumber(value: number | string | null | undefined) {
  const normalized = Number(value || 0);
  return Number.isFinite(normalized) ? normalized : 0;
}

export function formatMasteryValue(value: number, unit: string) {
  const normalized = normalizeMasteryNumber(value);
  const maximumFractionDigits = unit === 'km' ? 1 : unit === 'kg' ? 0 : 0;

  return new Intl.NumberFormat('fr-FR', {
    minimumFractionDigits: unit === 'km' && normalized % 1 !== 0 ? 1 : 0,
    maximumFractionDigits,
  }).format(normalized);
}

export function getMasteryUnitLabel(unit: string, value?: number) {
  const normalizedValue = Math.abs(normalizeMasteryNumber(value));

  if (unit === 'repetitions') {
    return normalizedValue > 1 ? 'répétitions' : 'répétition';
  }

  if (unit === 'secondes') {
    return normalizedValue > 1 ? 'secondes' : 'seconde';
  }

  if (unit === 'kg') return 'kg';
  if (unit === 'km') return 'km';
  if (unit === 'm') return 'm';

  return unit;
}

export function computeMasteryProgress(levels: MasteryLevel[], totalValue: number): MasteryProgress {
  const sortedLevels = [...levels].sort((left, right) => left.level - right.level);
  const normalizedTotal = normalizeMasteryNumber(totalValue);

  const currentLevelDefinition =
    [...sortedLevels].reverse().find((definition) => normalizedTotal >= definition.threshold) || null;
  const currentLevel = currentLevelDefinition?.level || 0;
  const currentThreshold = currentLevelDefinition?.threshold || 0;
  const nextLevelDefinition =
    sortedLevels.find((definition) => definition.level === currentLevel + 1) ||
    sortedLevels.find((definition) => definition.level > currentLevel) ||
    null;

  if (!nextLevelDefinition) {
    return {
      totalValue: normalizedTotal,
      currentLevel,
      currentThreshold,
      nextLevel: currentLevel,
      nextThreshold: currentThreshold,
      remainingValue: 0,
      progressPercent: normalizedTotal > 0 ? 100 : 0,
      xpRewardNextLevel: 0,
      isMaxLevel: true,
    };
  }

  const nextThreshold = nextLevelDefinition.threshold;
  const remainingValue = Math.max(nextThreshold - normalizedTotal, 0);
  const progressRange = Math.max(nextThreshold - currentThreshold, 1);
  const progressPercent = clampPercent(((normalizedTotal - currentThreshold) / progressRange) * 100);

  return {
    totalValue: normalizedTotal,
    currentLevel,
    currentThreshold,
    nextLevel: nextLevelDefinition.level,
    nextThreshold,
    remainingValue,
    progressPercent,
    xpRewardNextLevel: normalizeMasteryNumber(nextLevelDefinition.xpReward),
    isMaxLevel: false,
  };
}

export function buildMasteryRecord({
  dbId,
  slug,
  categorySlug,
  categoryDbId,
  name,
  unit,
  measurementType,
  description,
  totalValue,
  last15DaysValue,
  bestSessionValue,
  levels,
}: {
  dbId: string;
  slug: string;
  categorySlug: string;
  categoryDbId: string;
  name: string;
  unit: string;
  measurementType: MasteryMeasurementType;
  description: string | null;
  totalValue: number;
  last15DaysValue: number;
  bestSessionValue: number;
  levels: MasteryLevel[];
}): Mastery {
  const progress = computeMasteryProgress(levels, totalValue);

  return {
    id: slug,
    dbId,
    categoryId: categorySlug,
    categoryDbId,
    name,
    unit,
    measurementType,
    description,
    level: progress.currentLevel,
    currentValue: progress.totalValue,
    currentThreshold: progress.currentThreshold,
    nextLevel: progress.nextLevel,
    nextLevelTarget: progress.nextThreshold,
    remainingValue: progress.remainingValue,
    progressPercent: progress.progressPercent,
    totalValue: progress.totalValue,
    last15DaysValue: normalizeMasteryNumber(last15DaysValue),
    bestSessionValue: normalizeMasteryNumber(bestSessionValue),
    nextRewardXp: progress.xpRewardNextLevel,
    isMaxLevel: progress.isMaxLevel,
  };
}

export function getMasteriesByCategory(masteries: Mastery[], categoryId: string) {
  return masteries.filter((mastery) => mastery.categoryId === categoryId);
}

export function getMasteryById(masteries: Mastery[], id: string) {
  return masteries.find((mastery) => mastery.id === id) || null;
}

export function getMasteryCategoryById(categories: MasteryCategory[], categoryId: string) {
  return categories.find((category) => category.id === categoryId) || null;
}

export function getMasteryProgressPercent(mastery: Pick<Mastery, 'progressPercent'>) {
  return clampPercent(mastery.progressPercent);
}

export function formatMasteryProgressLabel(mastery: Pick<Mastery, 'currentValue' | 'nextLevelTarget' | 'unit' | 'isMaxLevel'>) {
  if (mastery.isMaxLevel || mastery.nextLevelTarget <= 0) {
    return `${formatMasteryValue(mastery.currentValue, mastery.unit)} ${getMasteryUnitLabel(
      mastery.unit,
      mastery.currentValue
    )}`;
  }

  return `${formatMasteryValue(mastery.currentValue, mastery.unit)} / ${formatMasteryValue(
    mastery.nextLevelTarget,
    mastery.unit
  )} ${getMasteryUnitLabel(mastery.unit, mastery.nextLevelTarget)}`;
}

export function getMasteryInfoCopy(mastery: Pick<Mastery, 'measurementType' | 'unit'>) {
  if (mastery.measurementType === 'reps') {
    return 'Chaque répétition validée fait progresser cette maîtrise.';
  }

  if (mastery.measurementType === 'duration') {
    return 'Chaque seconde cumulée fait progresser cette maîtrise.';
  }

  if (mastery.measurementType === 'distance') {
    return 'Chaque kilomètre validé fait progresser cette maîtrise.';
  }

  if (mastery.measurementType === 'elevation') {
    return 'Chaque mètre de dénivelé validé fait progresser cette maîtrise.';
  }

  if (mastery.measurementType === 'volume') {
    return 'Chaque kilo cumulé dans tes performances fait progresser cette maîtrise.';
  }

  return 'Les niveaux sont basés sur le volume cumulé de tes performances.';
}

export function getMasteryCategorySummary(masteries: Mastery[]): MasteryCategorySummary {
  return {
    startedCount: masteries.filter((mastery) => mastery.totalValue > 0).length,
    earnedLevels: masteries.reduce((total, mastery) => total + mastery.level, 0),
  };
}

export function getMasteryInputLabel(mastery: Pick<Mastery, 'measurementType' | 'unit'>) {
  if (mastery.measurementType === 'reps') return 'Répétitions';
  if (mastery.measurementType === 'duration') return 'Durée';
  if (mastery.measurementType === 'distance') return 'Distance';
  if (mastery.measurementType === 'elevation') return 'Dénivelé';
  if (mastery.measurementType === 'volume') return 'Volume';
  return 'Valeur';
}

export function getMasteryInputStep(mastery: Pick<Mastery, 'measurementType' | 'unit'>) {
  if (mastery.measurementType === 'distance' && mastery.unit === 'km') return '0.1';
  if (mastery.measurementType === 'volume') return '1';
  return '1';
}

export function getMasteryInputHint(mastery: Pick<Mastery, 'measurementType' | 'unit'>) {
  if (mastery.measurementType === 'volume') {
    return 'Renseigne séries, répétitions et charge pour calculer le volume en kg.';
  }

  return `Valeur attendue en ${getMasteryUnitLabel(mastery.unit)}.`;
}
