'use client';

import { ReactNode, useMemo, useState } from 'react';
import { SessionExerciseIcon } from '@/components/session-exercise-icon';
import {
  formatBlockMainValue,
  formatSessionRestSeconds,
  formatSessionVolumeKg,
  getBlockAccentColor,
  getBlockProgress,
  getBlockStatus,
  getSessionBlockTypeLabel,
  getSessionBlockVolumeKg,
  SessionBlockDisplayLike,
} from '@/lib/session-blocks';

type CompactExerciseCardProps = {
  index: number;
  block: SessionBlockDisplayLike & { id?: string };
  isCompleted?: boolean;
  isCurrent?: boolean;
  completedSets?: number;
  actionLabel?: string;
  onAction?: () => void;
  actionDisabled?: boolean;
  details?: ReactNode;
  subtitle?: string | null;
};

type SessionSummaryHeaderProps = {
  sportBadge?: ReactNode;
  title: string;
  description?: string | null;
  stats: Array<{ label: string; value: string | number }>;
  actions?: ReactNode;
  progressLabel?: string | null;
};

export function SessionBlockTimeline({
  index,
  status,
}: {
  index: number;
  status: ReturnType<typeof getBlockStatus>;
}) {
  return (
    <div className="session-block-timeline" aria-hidden="true">
      <span className={`session-block-timeline__dot session-block-timeline__dot--${status}`}>
        {status === 'done' ? '✓' : index + 1}
      </span>
      <span className="session-block-timeline__line" />
    </div>
  );
}

export function SessionSummaryHeader({
  sportBadge,
  title,
  description,
  stats,
  actions,
  progressLabel,
}: SessionSummaryHeaderProps) {
  return (
    <article className="card session-summary-header">
      <div className="session-summary-header__main">
        <div className="session-summary-header__copy">
          {sportBadge ? <div className="session-summary-header__badge">{sportBadge}</div> : null}
          <h1>{title}</h1>
          <p>{description || 'Seance Actyv prete a etre lancee.'}</p>
        </div>

        <div className="session-summary-header__side">
          {progressLabel ? <span className="session-progress-pill">{progressLabel}</span> : null}
          {actions ? <div className="session-summary-header__actions">{actions}</div> : null}
        </div>
      </div>

      <div className="session-summary-header__stats">
        {stats.map((stat) => (
          <div key={stat.label} className="session-summary-header__stat">
            <span>{stat.label}</span>
            <strong>{stat.value}</strong>
          </div>
        ))}
      </div>
    </article>
  );
}

export function CompactExerciseCard({
  index,
  block,
  isCompleted = false,
  isCurrent = false,
  completedSets = 0,
  actionLabel,
  onAction,
  actionDisabled = false,
  details,
  subtitle,
}: CompactExerciseCardProps) {
  const [expanded, setExpanded] = useState(false);

  const status = getBlockStatus({ isCompleted, isCurrent });
  const accent = getBlockAccentColor(block);
  const progress = getBlockProgress(block, completedSets, isCompleted);
  const blockVolume = useMemo(
    () =>
      getSessionBlockVolumeKg(
        block.block_type,
        block.target_value,
        block.sets_count,
        block.charge_kg
      ),
    [block]
  );

  return (
    <article
      className={`compact-exercise-card compact-exercise-card--${status} compact-exercise-card--accent-${accent}`}
    >
      <SessionBlockTimeline index={index} status={status} />

      <div className="compact-exercise-card__accent" />

      <div className="compact-exercise-card__content">
        <div className="compact-exercise-card__identity">
          <div className="compact-exercise-card__identity-main">
            <SessionExerciseIcon
              exerciseName={block.name}
              blockType={block.block_type}
              size="md"
            />
            <div>
              <strong>{block.name || `Bloc ${index + 1}`}</strong>
              <small>{subtitle || getSessionBlockTypeLabel(block.block_type)}</small>
            </div>
          </div>
          <span className="session-block-chip">{getSessionBlockTypeLabel(block.block_type)}</span>
        </div>

        <div className="compact-exercise-card__metrics">
          <div className="compact-exercise-card__metric">
            <span>Format</span>
            <strong>{formatBlockMainValue(block)}</strong>
          </div>

          {Number(block.charge_kg || 0) > 0 ? (
            <div className="compact-exercise-card__metric">
              <span>Charge</span>
              <strong>{block.charge_kg} kg</strong>
            </div>
          ) : null}

          <div className="compact-exercise-card__metric">
            <span>Repos</span>
            <strong>{formatSessionRestSeconds(block.rest_seconds) || 'Sans repos'}</strong>
          </div>

          <div className="compact-exercise-card__metric">
            <span>Progression</span>
            <strong>{progress.label}</strong>
          </div>

          {blockVolume ? (
            <div className="compact-exercise-card__metric">
              <span>Volume</span>
              <strong>{formatSessionVolumeKg(blockVolume)}</strong>
            </div>
          ) : null}
        </div>

        <div className="compact-exercise-card__actions">
          {actionLabel ? (
            <button
              type="button"
              className={`button ${status === 'done' ? 'ghost' : 'primary'}`}
              onClick={onAction}
              disabled={actionDisabled || !onAction}
            >
              {actionLabel}
            </button>
          ) : null}

          {details ? (
            <button
              type="button"
              className="button ghost compact-exercise-card__toggle"
              onClick={() => setExpanded((current) => !current)}
              aria-expanded={expanded}
            >
              {expanded ? 'Masquer ▴' : 'DÃ©tails â–¾'}
            </button>
          ) : null}
        </div>

        {expanded && details ? <div className="compact-exercise-card__details">{details}</div> : null}
      </div>
    </article>
  );
}
