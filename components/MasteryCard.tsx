'use client';

import Link from 'next/link';
import { type Mastery, getMasteryProgressPercent } from '@/lib/masteries';

function formatMasteryValue(value: number, unit: string) {
  return `${new Intl.NumberFormat('fr-FR', {
    maximumFractionDigits: unit === 'km' ? 1 : 0,
  }).format(value)} ${unit}`;
}

export function MasteryCard({ mastery }: { mastery: Mastery }) {
  const progressPercent = getMasteryProgressPercent(mastery);

  return (
    <Link href={`/maitrises/${mastery.id}`} className="mastery-card">
      <div className="mastery-card__top">
        <div className="mastery-card__copy">
          <strong>{mastery.name}</strong>
          <span>Niveau {mastery.level}</span>
        </div>
        <span className="mastery-card__level-chip">{Math.round(progressPercent)} %</span>
      </div>

      <div className="mastery-card__progress-copy">
        <span>{formatMasteryValue(mastery.currentValue, mastery.unit)}</span>
        <span>{formatMasteryValue(mastery.nextLevelTarget, mastery.unit)}</span>
      </div>

      <div className="progress-bar mastery-card__bar" aria-hidden="true">
        <span className="progress-fill" style={{ width: `${progressPercent}%` }} />
      </div>
    </Link>
  );
}
