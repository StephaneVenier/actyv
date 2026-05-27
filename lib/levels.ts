export const ACTYV_LEVELS = [
  { level: 1, minXp: 0 },
  { level: 2, minXp: 100 },
  { level: 3, minXp: 250 },
  { level: 4, minXp: 500 },
  { level: 5, minXp: 800 },
  { level: 6, minXp: 1200 },
  { level: 7, minXp: 1700 },
  { level: 8, minXp: 2300 },
  { level: 9, minXp: 3000 },
  { level: 10, minXp: 4000 },
] as const;

export type ActyvLevelProgress = {
  level: number;
  currentLevelXp: number;
  nextLevelXp: number | null;
  xpIntoLevel: number;
  xpToNextLevel: number;
  progressPercent: number;
};

export function getActyvLevel(totalXp: number): ActyvLevelProgress {
  const normalizedXp = Math.max(Math.trunc(Number(totalXp) || 0), 0);

  const currentLevel =
    [...ACTYV_LEVELS].reverse().find((entry) => normalizedXp >= entry.minXp) || ACTYV_LEVELS[0];

  const nextLevel = ACTYV_LEVELS.find((entry) => entry.level === currentLevel.level + 1) || null;
  const currentLevelXp = currentLevel.minXp;
  const nextLevelXp = nextLevel?.minXp ?? null;
  const xpIntoLevel = Math.max(normalizedXp - currentLevelXp, 0);
  const xpToNextLevel = nextLevelXp === null ? 0 : Math.max(nextLevelXp - normalizedXp, 0);
  const levelSpan = nextLevelXp === null ? 0 : Math.max(nextLevelXp - currentLevelXp, 1);
  const progressPercent =
    nextLevelXp === null
      ? 100
      : Math.min(Math.max((xpIntoLevel / levelSpan) * 100, 0), 100);

  return {
    level: currentLevel.level,
    currentLevelXp,
    nextLevelXp,
    xpIntoLevel,
    xpToNextLevel,
    progressPercent,
  };
}
