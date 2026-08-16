'use client';

import Link from 'next/link';
import type { ComponentProps, ReactNode } from 'react';
import { SessionExerciseIcon } from '@/components/session-exercise-icon';
import {
  formatBlockMainValue,
  formatSessionRestSeconds,
  formatSessionVolumeKg,
  getSessionBlockTypeLabel,
  type SessionBlockDisplayLike,
} from '@/lib/session-blocks';

type SessionProgressBarProps = {
  value: number;
  label?: string;
};

type SessionLiveHeaderProps = {
  title: string;
  sportBadge?: ReactNode;
  elapsedLabel: string;
  currentBlockLabel: string;
  progressLabel: string;
  progressPercent: number;
  progressMetaLabel?: string;
  onTogglePause: () => void;
  isPaused: boolean;
  quitHref: ComponentProps<typeof Link>['href'];
};

type LiveBlockCardProps = {
  block: SessionBlockDisplayLike;
  exerciseImageUrl?: string | null;
  blockIndex: number;
  totalBlocks: number;
  currentSeriesLabel: string;
  livePrimaryValue?: string | null;
  statusLabel: string;
  isCompleted: boolean;
  blockVolumeLabel?: string | null;
  actionLabel: string;
  actionHint?: string | null;
  validationFeedback?: string | null;
  countdownLabel?: string | null;
  onValidate?: () => void;
  actionDisabled?: boolean;
  sportLabel?: string | null;
  menuContent?: ReactNode;
};

type RestTimerOverlayProps = {
  blockLabel: string;
  secondsLeft: number;
  totalSeconds: number;
  onSkip: () => void;
  onAdd15: () => void;
  onSubtract15: () => void;
  onNext: () => void;
  onPrevious: () => void;
  canGoPrevious: boolean;
};

type LiveControlsProps = {
  onPrevious: () => void;
  onNext: () => void;
  onOpenPreview?: () => void;
  nextLabel?: string;
  previousDisabled?: boolean;
  nextDisabled?: boolean;
};

type LiveWorkoutRowProps = {
  title: string;
  subtitle: string;
  progressLabel: string;
  detailLabel?: string | null;
  exerciseImageUrl?: string | null;
  index: number;
  state: 'done' | 'active' | 'upcoming' | 'skipped';
  isExpanded: boolean;
  onClick: () => void;
  sportLabel?: string | null;
  blockType?: SessionBlockDisplayLike['block_type'];
};

type LiveSetRowProps = {
  index: number;
  primaryLabel: string;
  secondaryLabel?: string | null;
  trailingLabel: string;
  state: 'done' | 'active' | 'upcoming' | 'skipped';
  control: ReactNode;
  isOpen?: boolean;
  onOpen?: () => void;
};

type LiveBlockPreviewRailProps = {
  blocks: Array<{ id: string; name: string; block_type: SessionBlockDisplayLike['block_type'] }>;
  currentIndex: number;
  completedBlockIds: string[];
  onSelect: (index: number) => void;
};

type LiveSequenceListProps = {
  blocks: SessionBlockDisplayLike[];
  currentIndex: number;
  completedBlockIds: string[];
  skippedBlockIds: string[];
  completedSetsByBlockId: Record<string, number>;
  currentSeriesLabel: string;
  currentStatusLabel: string;
  onSelect: (index: number) => void;
};

export function SessionProgressBar({ value, label }: SessionProgressBarProps) {
  const normalizedValue = Math.min(Math.max(Math.round(value), 0), 100);

  return (
    <div className="session-live-progress">
      <div className="session-live-progress__bar" aria-hidden="true">
        <span style={{ width: `${normalizedValue}%` }} />
      </div>
      {label ? <small>{label}</small> : null}
    </div>
  );
}

function formatRestCountdown(seconds: number) {
  const normalizedSeconds = Math.max(0, Math.trunc(seconds));
  const minutes = Math.floor(normalizedSeconds / 60);
  const remainingSeconds = normalizedSeconds % 60;

  return `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
}

export function SessionLiveHeader({
  title,
  sportBadge,
  elapsedLabel,
  currentBlockLabel,
  progressLabel,
  progressPercent,
  progressMetaLabel,
  onTogglePause,
  isPaused,
  quitHref,
}: SessionLiveHeaderProps) {
  return (
    <article className="card session-live-shell">
      <div className="session-live-shell__top">
        <div className="session-live-shell__copy">
          <span className="section-kicker">Seance</span>
          <div className="session-live-shell__headline">
            <h1>{title}</h1>
            <strong>{elapsedLabel}</strong>
          </div>
          <div className="session-live-shell__meta session-live-shell__meta--compact">
            <span className="session-live-shell__exercise-count">{currentBlockLabel}</span>
            {sportBadge ? sportBadge : null}
          </div>
        </div>

        <div className="session-live-shell__actions session-live-shell__actions--compact">
          <button type="button" className="button ghost" onClick={onTogglePause}>
            {isPaused ? 'Reprendre' : 'Pause'}
          </button>
          <Link href={quitHref} className="button ghost">
            Quitter
          </Link>
        </div>
      </div>

      <SessionProgressBar value={progressPercent} label={progressLabel} />
      {progressMetaLabel ? <p className="session-live-shell__progress-note">{progressMetaLabel}</p> : null}
    </article>
  );
}

function getLivePrimaryValue(block: SessionBlockDisplayLike) {
  if (block.block_type === 'free') {
    return 'Bloc libre';
  }

  return formatBlockMainValue(block);
}

export function LiveBlockCard({
  block,
  exerciseImageUrl,
  blockIndex,
  totalBlocks,
  currentSeriesLabel,
  livePrimaryValue,
  statusLabel,
  isCompleted,
  blockVolumeLabel,
  actionLabel,
  actionHint,
  validationFeedback,
  countdownLabel,
  onValidate,
  actionDisabled = false,
  sportLabel,
  menuContent,
}: LiveBlockCardProps) {
  const typeLabel = getSessionBlockTypeLabel(block.block_type);
  const restLabel = formatSessionRestSeconds(block.rest_seconds) || 'Sans repos';
  const totalSets = Math.max(Math.trunc(Number(block.sets_count || 1)), 1);
  const metricsLabel = [sportLabel, typeLabel].filter(Boolean).join(' • ');

  return (
    <article className={`card session-live-focus-card session-live-focus-card--compact${validationFeedback ? ' is-validated' : ''}`}>
      <div className="session-live-focus-card__header">
        <div className="session-live-focus-card__eyebrow">
          <span className="section-kicker">{`Exercice ${blockIndex + 1} / ${totalBlocks}`}</span>
          <span className={`session-block-chip${isCompleted ? ' is-done' : ''}`}>{statusLabel}</span>
        </div>
        {menuContent ? <div className="session-live-focus-card__menu">{menuContent}</div> : null}
      </div>

      <div className="session-live-focus-card__hero session-live-focus-card__hero--compact">
        <div className="session-live-focus-card__media" aria-hidden="true">
          <SessionExerciseIcon
            exerciseName={block.name}
            exerciseImageUrl={exerciseImageUrl}
            sport={sportLabel}
            blockType={block.block_type}
            size="md"
          />
        </div>

        <div className="session-live-focus-card__hero-copy">
          <h2>{block.name || `Bloc ${blockIndex + 1}`}</h2>
          {metricsLabel ? <p>{metricsLabel}</p> : null}
          <div className="session-live-focus-card__stats-row">
            <span>{`${totalSets} ${totalSets > 1 ? 'series' : 'serie'}`}</span>
            <span>{restLabel}</span>
            {blockVolumeLabel ? <span>{blockVolumeLabel}</span> : null}
          </div>
        </div>
      </div>

      <div className="session-live-focus-card__value session-live-focus-card__value--compact">
        <strong>{countdownLabel || livePrimaryValue || getLivePrimaryValue(block)}</strong>
        <span>{currentSeriesLabel}</span>
      </div>

      {actionLabel || actionHint || validationFeedback ? (
        <div className="session-live-focus-card__footer session-live-focus-card__footer--compact">
          {actionLabel ? (
            <button
              type="button"
              className="button primary session-live-focus-card__validate"
              onClick={onValidate}
              disabled={actionDisabled || !onValidate}
            >
              {actionLabel}
            </button>
          ) : null}
          {actionHint ? <p className="session-live-focus-card__action-hint">{actionHint}</p> : null}
          {validationFeedback ? (
            <p className="session-live-focus-card__feedback" aria-live="polite">
              {validationFeedback}
            </p>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}

export function RestTimerOverlay({
  blockLabel,
  secondsLeft,
  totalSeconds,
  onSkip,
  onAdd15,
  onSubtract15,
  onNext,
  onPrevious,
  canGoPrevious,
}: RestTimerOverlayProps) {
  const progressPercent =
    totalSeconds > 0 ? Math.min(Math.max(((totalSeconds - secondsLeft) / totalSeconds) * 100, 0), 100) : 100;
  const ringStyle = {
    background: `conic-gradient(#35e66b ${progressPercent}%, rgba(255,255,255,0.08) ${progressPercent}% 100%)`,
  };

  return (
    <article className="card session-live-rest-overlay">
      <span className="section-kicker">Repos</span>
      <h2>Repos en cours</h2>
      <p>{`Prochaine serie : ${blockLabel}`}</p>

      <div className="session-live-rest-overlay__ring" style={ringStyle}>
        <div className="session-live-rest-overlay__ring-inner">
          <strong>{formatRestCountdown(secondsLeft)}</strong>
          <span>restant</span>
        </div>
      </div>

      <p className="session-live-rest-overlay__hint">
        Le contexte de l'exercice reste visible pour repartir vite.
      </p>

      <div className="session-live-rest-overlay__adjust">
        <button type="button" className="button ghost" onClick={onSubtract15}>
          -15 sec
        </button>
        <button type="button" className="button ghost" onClick={onAdd15}>
          +15 sec
        </button>
      </div>

      <div className="session-live-rest-overlay__actions">
        <button type="button" className="button ghost" onClick={onSkip}>
          Passer
        </button>
        <button type="button" className="button ghost" onClick={onPrevious} disabled={!canGoPrevious}>
          Precedent
        </button>
        <button type="button" className="button primary" onClick={onNext}>
          Reprendre
        </button>
      </div>
    </article>
  );
}

export function LiveSequenceList({
  blocks,
  currentIndex,
  completedBlockIds,
  skippedBlockIds,
  completedSetsByBlockId,
  currentSeriesLabel,
  currentStatusLabel,
  onSelect,
}: LiveSequenceListProps) {
  return (
    <div className="session-live-sequence-list">
      {blocks.map((block, index) => {
        const isCompleted = completedBlockIds.includes((block as SessionBlockDisplayLike & { id?: string }).id || '');
        const isSkipped = skippedBlockIds.includes((block as SessionBlockDisplayLike & { id?: string }).id || '');
        const isCurrent = index === currentIndex;
        const normalizedSets = Math.max(Math.trunc(Number(block.sets_count || 1)), 1);
        const completedSets =
          isCurrent
            ? currentSeriesLabel
            : `${Math.min(
                Math.max(
                  Math.trunc(
                    Number(
                      completedSetsByBlockId[
                        ((block as SessionBlockDisplayLike & { id?: string }).id as string) || ''
                      ] || 0
                    )
                  ),
                  0
                ),
                normalizedSets
              )} / ${normalizedSets}`;
        const status = isCompleted ? 'Termine' : isSkipped ? 'Passe' : isCurrent ? currentStatusLabel : 'A venir';

        return (
          <button
            key={`${(block as SessionBlockDisplayLike & { id?: string }).id || index}`}
            type="button"
            className={`session-live-sequence-item${isCurrent ? ' is-current' : ''}${isCompleted ? ' is-done' : ''}${isSkipped ? ' is-skipped' : ''}`}
            onClick={() => onSelect(index)}
          >
            <div className="session-live-sequence-item__top">
              <strong>{block.name || `Bloc ${index + 1}`}</strong>
              <span className="session-block-chip">{status}</span>
            </div>
            <div className="session-live-sequence-item__meta">
              <span>{getSessionBlockTypeLabel(block.block_type)}</span>
              <span>{isCurrent ? currentSeriesLabel : `Series ${completedSets}`}</span>
              <span>{formatBlockMainValue(block)}</span>
            </div>
          </button>
        );
      })}
    </div>
  );
}

export function LiveControls({
  onPrevious,
  onNext,
  onOpenPreview,
  nextLabel = 'Suivant',
  previousDisabled = false,
  nextDisabled = false,
}: LiveControlsProps) {
  return (
    <div className="session-live-controls session-live-controls--compact">
      <button type="button" className="button ghost" onClick={onPrevious} disabled={previousDisabled}>
        ← Exercice precedent
      </button>
      {onOpenPreview ? (
        <button type="button" className="button ghost" onClick={onOpenPreview}>
          Apercu rapide
        </button>
      ) : null}
      <button type="button" className="button ghost" onClick={onNext} disabled={nextDisabled}>
        {nextLabel.includes('Suivant') ? 'Exercice suivant →' : nextLabel}
      </button>
    </div>
  );
}

export function LiveWorkoutRow({
  title,
  subtitle,
  progressLabel,
  detailLabel,
  exerciseImageUrl,
  index,
  state,
  isExpanded,
  onClick,
  sportLabel,
  blockType,
}: LiveWorkoutRowProps) {
  const stateIcon =
    state === 'done' ? '✓' : state === 'active' ? String(index + 1) : state === 'skipped' ? '—' : String(index + 1);

  return (
    <button
      type="button"
      className={`session-live-workout-row is-${state}${isExpanded ? ' is-expanded' : ''}`}
      onClick={onClick}
    >
      <span className="session-live-workout-row__state" aria-hidden="true">
        {stateIcon}
      </span>
      <span className="session-live-workout-row__visual" aria-hidden="true">
        <SessionExerciseIcon
          exerciseName={title}
          exerciseImageUrl={exerciseImageUrl}
          sport={sportLabel}
          blockType={blockType}
          size="sm"
        />
      </span>
      <span className="session-live-workout-row__copy">
        <strong>{title}</strong>
        <span>{subtitle}</span>
      </span>
      <span className="session-live-workout-row__metrics">
        <strong>{progressLabel}</strong>
        {detailLabel ? <span>{detailLabel}</span> : null}
      </span>
      <span className="session-live-workout-row__chevron" aria-hidden="true">
        {isExpanded ? '⌃' : '›'}
      </span>
    </button>
  );
}

export function LiveSetRow({
  index,
  primaryLabel,
  secondaryLabel,
  trailingLabel,
  state,
  control,
  isOpen = false,
  onOpen,
}: LiveSetRowProps) {
  return (
    <div className={`session-live-set-row is-${state}${isOpen ? ' is-open' : ''}`}>
      <span className="session-live-set-row__index">{index + 1}</span>
      <span className="session-live-set-row__control">{control}</span>
      <button
        type="button"
        className="session-live-set-row__body"
        onClick={onOpen}
        disabled={!onOpen}
      >
        <span className="session-live-set-row__labels">
          <strong>{primaryLabel}</strong>
          {secondaryLabel ? <span>{secondaryLabel}</span> : null}
        </span>
        <span className="session-live-set-row__trail">
          <em>{trailingLabel}</em>
          {onOpen ? <span aria-hidden="true">{isOpen ? '⌃' : '›'}</span> : null}
        </span>
      </button>
    </div>
  );
}

export function LiveBlockPreviewRail({
  blocks,
  currentIndex,
  completedBlockIds,
  onSelect,
}: LiveBlockPreviewRailProps) {
  return (
    <div className="session-live-preview">
      {blocks.map((block, index) => {
        const isCompleted = completedBlockIds.includes(block.id);
        const isCurrent = index === currentIndex;

        return (
          <button
            key={block.id}
            type="button"
            className={`session-live-preview__item${isCurrent ? ' is-current' : ''}${isCompleted ? ' is-done' : ''}`}
            onClick={() => onSelect(index)}
          >
            <strong>{index + 1}</strong>
            <span>{block.name}</span>
          </button>
        );
      })}
    </div>
  );
}
