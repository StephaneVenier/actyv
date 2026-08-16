'use client';

import Link from 'next/link';
import { MasteryIcon } from '@/components/MasteryIcon';
import { SessionExerciseIcon } from '@/components/session-exercise-icon';
import { type Mastery, formatMasteryProgressLabel, getMasteryProgressPercent } from '@/lib/masteries';

export function MasteryCard({ mastery }: { mastery: Mastery }) {
  const progressPercent = getMasteryProgressPercent(mastery);

  return (
    <Link href={`/maitrises/${mastery.id}`} className="mastery-card">
      <div className="mastery-card__top">
        <div className="mastery-card__lead">
          {mastery.linkedExerciseImageUrl || mastery.linkedExerciseVisualCategory ? (
            <SessionExerciseIcon
              exerciseName={mastery.linkedExerciseName || mastery.name}
              exerciseImageUrl={mastery.linkedExerciseImageUrl}
              visualCategory={mastery.linkedExerciseVisualCategory}
              size="sm"
              className="mastery-card__exercise-art"
            />
          ) : (
            <MasteryIcon categoryId={mastery.categoryId} />
          )}
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
