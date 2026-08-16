'use client';

import Link from 'next/link';
import { MasteryVisual } from '@/components/MasteryVisual';
import { type Mastery, formatMasteryProgressLabel, getMasteryProgressPercent } from '@/lib/masteries';

export function MasteryCard({ mastery }: { mastery: Mastery }) {
  const progressPercent = getMasteryProgressPercent(mastery);

  return (
    <Link href={`/maitrises/${mastery.id}`} className="mastery-card">
      <div className="mastery-card__top">
        <div className="mastery-card__lead">
          <MasteryVisual mastery={mastery} size="card" className="mastery-card__exercise-art" />
          <div className="mastery-card__copy">
            <strong>{mastery.name}</strong>
            <span>Niveau {mastery.level}</span>
          </div>
        </div>
        <span className="mastery-card__chevron" aria-hidden="true">
          &rsaquo;
        </span>
      </div>

      <div className="mastery-card__progress-copy">
        <span>{formatMasteryProgressLabel(mastery)}</span>
        <strong>{Math.round(progressPercent)}%</strong>
      </div>

      <div className="progress-bar mastery-card__bar" aria-hidden="true">
        <span className="progress-fill" style={{ width: `${progressPercent}%` }} />
      </div>
    </Link>
  );
}
