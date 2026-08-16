'use client';

import { MasteryIcon } from '@/components/MasteryIcon';
import { MasterySportVisual } from '@/components/MasterySportVisual';
import { SessionExerciseIcon } from '@/components/session-exercise-icon';
import type { Mastery } from '@/lib/masteries';
import { resolveMasteryVisual } from '@/lib/mastery-visuals';

type MasteryVisualProps = {
  mastery: Mastery;
  size: 'card' | 'hero';
  className?: string;
};

export function MasteryVisual({ mastery, size, className }: MasteryVisualProps) {
  const visual = resolveMasteryVisual(mastery);

  if (visual.type === 'exercise') {
    return (
      <SessionExerciseIcon
        exerciseName={visual.exerciseName}
        exerciseImageUrl={visual.imageUrl}
        visualCategory={visual.visualCategory}
        size={size === 'hero' ? 'lg' : 'sm'}
        className={className}
      />
    );
  }

  if (visual.type === 'sport_metric') {
    return <MasterySportVisual visual={visual} className={className} />;
  }

  const fallbackClassName = `${className ? `${className} ` : ''}mastery-icon${size === 'hero' ? ' mastery-icon--hero' : ''}`;

  return <MasteryIcon categoryId={visual.categoryId} className={fallbackClassName} />;
}
