export type MasteryCategory = {
  id: string;
  label: string;
};

export type Mastery = {
  id: string;
  categoryId: string;
  name: string;
  unit: string;
  level: number;
  currentValue: number;
  nextLevelTarget: number;
  totalValue: number;
  last15DaysValue: number;
  bestSessionValue: number;
  nextRewardXp: number;
};

export const MASTERY_CATEGORIES: MasteryCategory[] = [
  { id: 'fitness', label: 'Fitness' },
  { id: 'musculation', label: 'Musculation' },
  { id: 'course', label: 'Course a pied' },
  { id: 'trail', label: 'Trail' },
  { id: 'marche', label: 'Marche' },
  { id: 'velo', label: 'Velo' },
  { id: 'natation', label: 'Natation' },
  { id: 'randonnee', label: 'Randonnee' },
];

export const MASTERIES: Mastery[] = [
  {
    id: 'pompes',
    categoryId: 'fitness',
    name: 'Pompes',
    unit: 'reps',
    level: 4,
    currentValue: 72,
    nextLevelTarget: 100,
    totalValue: 187,
    last15DaysValue: 62,
    bestSessionValue: 35,
    nextRewardXp: 5,
  },
  {
    id: 'burpees',
    categoryId: 'fitness',
    name: 'Burpees',
    unit: 'reps',
    level: 3,
    currentValue: 34,
    nextLevelTarget: 50,
    totalValue: 94,
    last15DaysValue: 28,
    bestSessionValue: 18,
    nextRewardXp: 5,
  },
  {
    id: 'planche',
    categoryId: 'fitness',
    name: 'Planche',
    unit: 'secondes',
    level: 5,
    currentValue: 780,
    nextLevelTarget: 1200,
    totalValue: 3240,
    last15DaysValue: 620,
    bestSessionValue: 180,
    nextRewardXp: 5,
  },
  {
    id: 'air-squats',
    categoryId: 'fitness',
    name: 'Air Squats',
    unit: 'reps',
    level: 6,
    currentValue: 420,
    nextLevelTarget: 600,
    totalValue: 1420,
    last15DaysValue: 240,
    bestSessionValue: 75,
    nextRewardXp: 5,
  },
  {
    id: 'tractions',
    categoryId: 'musculation',
    name: 'Tractions',
    unit: 'reps',
    level: 3,
    currentValue: 18,
    nextLevelTarget: 40,
    totalValue: 63,
    last15DaysValue: 16,
    bestSessionValue: 8,
    nextRewardXp: 5,
  },
  {
    id: 'developpe-couche',
    categoryId: 'musculation',
    name: 'Developpe couche',
    unit: 'kg',
    level: 4,
    currentValue: 3200,
    nextLevelTarget: 4000,
    totalValue: 12600,
    last15DaysValue: 2800,
    bestSessionValue: 960,
    nextRewardXp: 5,
  },
  {
    id: 'squat-barre',
    categoryId: 'musculation',
    name: 'Squat barre',
    unit: 'kg',
    level: 3,
    currentValue: 1500,
    nextLevelTarget: 2000,
    totalValue: 6800,
    last15DaysValue: 1900,
    bestSessionValue: 720,
    nextRewardXp: 5,
  },
  {
    id: 'dips',
    categoryId: 'musculation',
    name: 'Dips',
    unit: 'reps',
    level: 4,
    currentValue: 78,
    nextLevelTarget: 100,
    totalValue: 214,
    last15DaysValue: 46,
    bestSessionValue: 20,
    nextRewardXp: 5,
  },
  {
    id: 'distance-cap',
    categoryId: 'course',
    name: 'Distance CAP',
    unit: 'km',
    level: 6,
    currentValue: 127,
    nextLevelTarget: 175,
    totalValue: 482,
    last15DaysValue: 36,
    bestSessionValue: 18.4,
    nextRewardXp: 5,
  },
  {
    id: 'dplus-cap',
    categoryId: 'course',
    name: 'D+ CAP',
    unit: 'm',
    level: 4,
    currentValue: 820,
    nextLevelTarget: 1000,
    totalValue: 3810,
    last15DaysValue: 420,
    bestSessionValue: 240,
    nextRewardXp: 5,
  },
  {
    id: 'distance-trail',
    categoryId: 'trail',
    name: 'Distance Trail',
    unit: 'km',
    level: 4,
    currentValue: 74,
    nextLevelTarget: 100,
    totalValue: 246,
    last15DaysValue: 28,
    bestSessionValue: 22.1,
    nextRewardXp: 5,
  },
  {
    id: 'dplus-trail',
    categoryId: 'trail',
    name: 'D+ Trail',
    unit: 'm',
    level: 5,
    currentValue: 4200,
    nextLevelTarget: 6000,
    totalValue: 15420,
    last15DaysValue: 1320,
    bestSessionValue: 980,
    nextRewardXp: 5,
  },
  {
    id: 'distance-marche',
    categoryId: 'marche',
    name: 'Marche',
    unit: 'km',
    level: 6,
    currentValue: 142,
    nextLevelTarget: 200,
    totalValue: 516,
    last15DaysValue: 52,
    bestSessionValue: 24.8,
    nextRewardXp: 5,
  },
  {
    id: 'dplus-marche',
    categoryId: 'marche',
    name: 'D+ Marche',
    unit: 'm',
    level: 4,
    currentValue: 750,
    nextLevelTarget: 1000,
    totalValue: 2940,
    last15DaysValue: 360,
    bestSessionValue: 210,
    nextRewardXp: 5,
  },
  {
    id: 'distance-velo',
    categoryId: 'velo',
    name: 'Distance Velo',
    unit: 'km',
    level: 5,
    currentValue: 165,
    nextLevelTarget: 200,
    totalValue: 684,
    last15DaysValue: 82,
    bestSessionValue: 61.2,
    nextRewardXp: 5,
  },
  {
    id: 'dplus-velo',
    categoryId: 'velo',
    name: 'D+ Velo',
    unit: 'm',
    level: 4,
    currentValue: 2800,
    nextLevelTarget: 4000,
    totalValue: 11240,
    last15DaysValue: 1640,
    bestSessionValue: 760,
    nextRewardXp: 5,
  },
  {
    id: 'distance-natation',
    categoryId: 'natation',
    name: 'Distance Natation',
    unit: 'km',
    level: 3,
    currentValue: 6.4,
    nextLevelTarget: 10,
    totalValue: 24.6,
    last15DaysValue: 3.2,
    bestSessionValue: 1.8,
    nextRewardXp: 5,
  },
  {
    id: 'distance-randonnee',
    categoryId: 'randonnee',
    name: 'Distance Randonnee',
    unit: 'km',
    level: 4,
    currentValue: 72,
    nextLevelTarget: 100,
    totalValue: 212,
    last15DaysValue: 26,
    bestSessionValue: 19.4,
    nextRewardXp: 5,
  },
  {
    id: 'dplus-randonnee',
    categoryId: 'randonnee',
    name: 'D+ Randonnee',
    unit: 'm',
    level: 5,
    currentValue: 4500,
    nextLevelTarget: 6000,
    totalValue: 16020,
    last15DaysValue: 1220,
    bestSessionValue: 920,
    nextRewardXp: 5,
  },
];

export function getMasteriesByCategory(categoryId: string) {
  return MASTERIES.filter((mastery) => mastery.categoryId === categoryId);
}

export function getMasteryById(id: string) {
  return MASTERIES.find((mastery) => mastery.id === id) || null;
}

export function getMasteryCategoryById(categoryId: string) {
  return MASTERY_CATEGORIES.find((category) => category.id === categoryId) || null;
}

export function getMasteryProgressPercent(mastery: Mastery) {
  if (mastery.nextLevelTarget <= 0) return 0;
  return Math.max(0, Math.min((mastery.currentValue / mastery.nextLevelTarget) * 100, 100));
}

export function getMasteryCategorySummary(categoryId: string) {
  const masteries = getMasteriesByCategory(categoryId);

  return {
    startedCount: masteries.length,
    earnedLevels: masteries.reduce((total, mastery) => total + mastery.level, 0),
  };
}

