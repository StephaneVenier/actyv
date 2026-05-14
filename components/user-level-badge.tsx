type UserLevelBadgeProps = {
  level?: number | null;
  className?: string;
};

export function getUserLevelValue(level?: number | null) {
  if (typeof level !== 'number' || Number.isNaN(level) || level < 1) {
    return 1;
  }

  return Math.floor(level);
}

export function formatUserLevel(level?: number | null) {
  return `Nv.${getUserLevelValue(level)}`;
}

export function UserLevelBadge({ level, className }: UserLevelBadgeProps) {
  const classes = ['mini-level-badge', className].filter(Boolean).join(' ');

  return <span className={classes}>{formatUserLevel(level)}</span>;
}
