'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
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
  quitHref: string;
};

type LiveBlockCardProps = {
  block: SessionBlockDisplayLike;
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
          <span className="section-kicker">Mode live</span>
          <h1>{title}</h1>
          <div className="session-live-shell__meta">
            {sportBadge ? sportBadge : null}
            <span className="session-block-chip">{currentBlockLabel}</span>
            <span className="session-block-chip">{elapsedLabel}</span>
          </div>
        </div>

        <div className="session-live-shell__actions">
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
}: LiveBlockCardProps) {
  const typeLabel = getSessionBlockTypeLabel(block.block_type);
  const restLabel = formatSessionRestSeconds(block.rest_seconds) || 'Sans repos';

  return (
    <article className={`card session-live-focus-card${validationFeedback ? ' is-validated' : ''}`}>
      <div className="session-live-focus-card__eyebrow">
        <span className="section-kicker">{`Bloc ${blockIndex + 1} / ${totalBlocks}`}</span>
        <span className={`session-block-chip${isCompleted ? ' is-done' : ''}`}>{typeLabel}</span>
      </div>

      <div className="session-live-focus-card__hero">
        <h2>{block.name || `Bloc ${blockIndex + 1}`}</h2>
        <p>{statusLabel}</p>
      </div>

      <div className="session-live-focus-card__value">
        <strong>{countdownLabel || livePrimaryValue || getLivePrimaryValue(block)}</strong>
        <span>{currentSeriesLabel}</span>
      </div>

      <div className="session-live-focus-card__facts">
        <div className="session-live-fact">
          <span>Format</span>
          <strong>{typeLabel}</strong>
        </div>

        {Number(block.charge_kg || 0) > 0 ? (
          <div className="session-live-fact">
            <span>Charge</span>
            <strong>{block.charge_kg} kg</strong>
          </div>
        ) : null}

        <div className="session-live-fact">
          <span>Repos</span>
          <strong>{restLabel}</strong>
        </div>

        {blockVolumeLabel ? (
          <div className="session-live-fact">
            <span>Volume</span>
            <strong>{blockVolumeLabel}</strong>
          </div>
        ) : null}
      </div>

      {block.block_type === 'free' ? (
        <p className="session-live-focus-card__note">
          Bloc libre sans objectif chiffre. Utilise-le pour une consigne simple, une technique
          ou une phase de mobilite.
        </p>
      ) : null}

      <div className="session-live-focus-card__footer">
        <button
          type="button"
          className="button primary session-live-focus-card__validate"
          onClick={onValidate}
          disabled={actionDisabled || !onValidate}
        >
          {actionLabel}
        </button>
        {actionHint ? <p className="session-live-focus-card__action-hint">{actionHint}</p> : null}
        {validationFeedback ? (
          <p className="session-live-focus-card__feedback" aria-live="polite">
            {validationFeedback}
          </p>
        ) : null}
      </div>
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
      <h2>Recuperation</h2>
      <p>{`Bloc valide : ${blockLabel}`}</p>

      <div className="session-live-rest-overlay__ring" style={ringStyle}>
        <div className="session-live-rest-overlay__ring-inner">
          <strong>{formatRestCountdown(secondsLeft)}</strong>
          <span>restant</span>
        </div>
      </div>

      <p className="session-live-rest-overlay__hint">
        Prends ton souffle. La prochaine serie attendra ton signal pour repartir.
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
        <button type="button" className="button ghost" onClick={onPrevious} disabled={!canGoPrevious}>
          Precedent
        </button>
        <button type="button" className="button ghost" onClick={onSkip}>
          Passer
        </button>
        <button type="button" className="button primary" onClick={onNext}>
          Bloc suivant
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
    <div className="session-live-controls">
      <button type="button" className="button ghost" onClick={onPrevious} disabled={previousDisabled}>
        Precedent
      </button>
      {onOpenPreview ? (
        <button type="button" className="button ghost" onClick={onOpenPreview}>
          Apercu rapide
        </button>
      ) : null}
      <button type="button" className="button ghost" onClick={onNext} disabled={nextDisabled}>
        {nextLabel}
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
