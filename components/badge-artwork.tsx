'use client';

import type { ReactNode } from 'react';
import { useMemo, useState } from 'react';
import { getBadgeArtworkSrc } from '@/lib/badges';

type BadgeArtworkProps = {
  badgeCode: string;
  badgeName: string;
  unlocked?: boolean;
  className?: string;
  fallback?: ReactNode;
};

export function BadgeArtwork({ badgeCode, badgeName, unlocked = false, className = '', fallback }: BadgeArtworkProps) {
  const [imageMissing, setImageMissing] = useState(false);
  const src = useMemo(() => getBadgeArtworkSrc(badgeCode), [badgeCode]);
  const classes = ['badge-artwork', unlocked ? 'badge-artwork--unlocked' : 'badge-artwork--locked', className]
    .filter(Boolean)
    .join(' ');

  if (!src || imageMissing) {
    return (
      <span className={`${classes} badge-artwork--fallback`} aria-hidden="true">
        {fallback ?? badgeName.slice(0, 1).toUpperCase()}
      </span>
    );
  }

  return (
    <span className={classes}>
      <img
        src={src}
        alt={`Badge ${badgeName}`}
        className="badge-artwork__image"
        loading="lazy"
        decoding="async"
        onError={() => setImageMissing(true)}
      />
    </span>
  );
}
