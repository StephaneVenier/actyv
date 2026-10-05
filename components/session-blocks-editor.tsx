'use client';

import { useEffect, useRef, useState } from 'react';
import { SessionExercisePicker } from '@/components/session-exercise-picker';
import { SessionExerciseIcon } from '@/components/session-exercise-icon';
import { getExercisesByIds } from '@/lib/exercise-library-api';
import type { ExerciseLibraryItem } from '@/lib/exercise-library';
import {
  formatBlockMainValue,
  formatBlockSecondaryValues,
  formatSessionBlockSummary,
  formatSessionRestSeconds,
  formatSessionVolumeKg,
  getBlockAccentColor,
  getSessionBlockInputLabel,
  getSessionBlockPlaceholder,
  getSessionBlockTypeLabel,
  getSessionBlockVolumeKg,
  normalizeSessionSetsCount,
  SESSION_BLOCK_TYPES,
  SessionBlockType,
} from '@/lib/session-blocks';
import { normalizeSessionRestSeconds, SessionBlockDraft } from '@/lib/session-draft-blocks';

type SessionBlocksEditorProps = {
  blocks: SessionBlockDraft[];
  disabled?: boolean;
  compact?: boolean;
  title?: string;
  kicker?: string;
  onAddBlock: () => void;
  onRemoveBlock: (blockId: string) => void;
  onUpdateBlock: (blockId: string, updates: Partial<SessionBlockDraft>) => void;
};

export function SessionBlocksEditor({
  blocks,
  disabled = false,
  compact = false,
  title = 'Structure de la seance',
  kicker = 'Blocs',
  onAddBlock,
  onRemoveBlock,
  onUpdateBlock,
}: SessionBlocksEditorProps) {
  const [expandedBlockIds, setExpandedBlockIds] = useState<string[]>([]);
  const pendingAdd = useRef(false);
  const [visuals, setVisuals] = useState<Record<string, ExerciseLibraryItem>>({});
  const visualIds = compact ? [...new Set(blocks.map(block => block.exerciseId).filter(Boolean))].join(',') : '';

  useEffect(() => {
    if (!visualIds) return;
    let cancelled = false;
    void getExercisesByIds(visualIds.split(',')).then(({ data }) => {
      if (!cancelled) setVisuals(Object.fromEntries(data.filter(item => item.id).map(item => [item.id!, item])));
    });
    return () => { cancelled = true; };
  }, [visualIds]);

  useEffect(() => {
    setExpandedBlockIds((current) => current.filter((blockId) => blocks.some((block) => block.id === blockId)));
    if (compact && pendingAdd.current) {
      pendingAdd.current = false;
      setExpandedBlockIds(blocks.length ? [blocks[blocks.length - 1].id] : []);
    }
  }, [blocks, compact]);

  const toggleDetails = (blockId: string) => {
    setExpandedBlockIds((current) =>
      current.includes(blockId) ? current.filter((value) => value !== blockId) : compact ? [blockId] : [...current, blockId]
    );
  };

  return (
    <article className={`card session-form-card stack session-editor-card${compact ? ' session-editor-card--compact' : ''}`}>
      <div className="session-blocks-header">
        <div>
          <span className="section-kicker">{kicker}</span>
          <h2>{title}</h2>
        </div>

        <button type="button" className="button ghost" onClick={() => { pendingAdd.current = compact; onAddBlock(); }} disabled={disabled}>
          {compact ? '+ Ajouter un exercice' : '+ Ajouter un bloc'}
        </button>
      </div>

      <div className="session-block-list session-block-list--editor">
        {blocks.map((block, index) => {
          const previewBlock = {
            name: block.name.trim() || `Bloc ${index + 1}`,
            block_type: block.blockType,
            target_value: block.targetValue.trim() === '' ? null : Number(block.targetValue),
            sets_count: normalizeSessionSetsCount(block.sets_count),
            charge_kg: block.chargeKg.trim() === '' ? null : Number(block.chargeKg),
            rest_seconds: normalizeSessionRestSeconds(block.restSeconds),
          };
          const blockVolume = getSessionBlockVolumeKg(
            previewBlock.block_type,
            previewBlock.target_value,
            previewBlock.sets_count,
            previewBlock.charge_kg
          );
          const secondaryValues = formatBlockSecondaryValues(previewBlock);
          const isExpanded = expandedBlockIds.includes(block.id);
          const accent = getBlockAccentColor(previewBlock);
          const ChargeField = compact && block.blockType !== 'reps' ? 'details' : 'div';

          return (
            <article
              key={block.id}
              className={`session-editor-block session-editor-block--accent-${accent}${isExpanded ? ' is-expanded' : ''}`}
            >
              <div className="session-editor-block__compact">
                {compact ? <button type="button" className="session-editor-block__open" onClick={() => toggleDetails(block.id)}
                  disabled={disabled} aria-expanded={isExpanded} aria-label={`Configurer ${previewBlock.name}`} /> : null}
                <div className="session-editor-block__lead">
                  <div className="session-editor-block__index">
                    {!compact ? <span className="session-editor-block__grip">≡</span> : null}
                    <strong>{String(index + 1).padStart(2, '0')}</strong>
                  </div>
                  <span className="session-editor-block__accent" />
                  {compact ? <SessionExerciseIcon exerciseName={previewBlock.name} blockType={block.blockType} size="sm"
                    exerciseImageUrl={block.exerciseId ? visuals[block.exerciseId]?.imageUrl : null}
                    visualCategory={block.exerciseId ? visuals[block.exerciseId]?.visualCategory : null} /> : null}
                  <div className="session-editor-block__identity">
                    <strong>{previewBlock.name}</strong>
                    <small>{getSessionBlockTypeLabel(block.blockType)}</small>
                  </div>
                </div>

                <div className="session-editor-block__summary">
                  {compact ? <span className="session-editor-block__inline-meta">
                    {[formatBlockMainValue(previewBlock), Number(previewBlock.charge_kg) > 0 ? `${previewBlock.charge_kg} kg` : null,
                      formatSessionRestSeconds(previewBlock.rest_seconds)].filter(Boolean).join(' · ')}
                  </span> : <>
                  <div className="session-editor-block__main">
                    <span>{formatBlockMainValue(previewBlock)}</span>
                    {blockVolume ? <strong>{formatSessionVolumeKg(blockVolume)}</strong> : null}
                  </div>

                  <div className="session-editor-block__chips">
                    {secondaryValues.slice(0, 4).map((value) => (
                      <span key={value} className="session-editor-block__chip">
                        {value}
                      </span>
                    ))}
                  </div>
                  </>}
                </div>
                <div className="session-editor-block__controls">
                  <button
                    type="button"
                    className="button ghost compact-exercise-card__toggle"
                    onClick={() => toggleDetails(block.id)}
                    disabled={disabled}
                    aria-expanded={isExpanded}
                    aria-label={compact ? `${isExpanded ? 'Fermer' : 'Configurer'} ${previewBlock.name}` : undefined}
                  >
                    {compact ? (isExpanded ? '⌃' : '›') : isExpanded ? 'Details ▴' : 'Details ▾'}
                  </button>
                  {!compact ? <button
                    type="button"
                    className="button ghost session-block-remove"
                    onClick={() => onRemoveBlock(block.id)}
                    disabled={disabled || blocks.length === 1}
                  >
                    Supprimer
                  </button> : null}
                </div>
              </div>

              {isExpanded ? (
                <div className="session-editor-block__details">
                  {compact ? <button type="button" className="button ghost session-block-remove" onClick={() => onRemoveBlock(block.id)}
                    disabled={disabled || blocks.length === 1}>Supprimer cet exercice</button> : null}
                  <div className="session-form-grid">
                    <div className="field">
                      <label>Nom du bloc</label>
                      <div className="session-block-name-field">
                        <SessionExercisePicker
                          disabled={disabled}
                          onSelectExercise={(exercise) =>
                            onUpdateBlock(block.id, {
                              name: exercise.name,
                              exerciseId: exercise.id,
                            })
                          }
                        />
                      </div>
                      <input
                        aria-label={compact ? 'Nom du bloc' : undefined}
                        value={block.name}
                        onChange={(event) =>
                          onUpdateBlock(block.id, {
                            name: event.target.value,
                            exerciseId: null,
                          })
                        }
                        placeholder="Ex : Pompes, Gainage, 400m rapide"
                        disabled={disabled}
                      />
                    </div>

                    <div className="field">
                      <label>Type</label>
                      <select
                        aria-label={compact ? 'Type' : undefined}
                        value={block.blockType}
                        onChange={(event) =>
                          onUpdateBlock(block.id, {
                            blockType: event.target.value as SessionBlockType,
                            targetValue: event.target.value === 'free' ? '' : block.targetValue,
                          })
                        }
                        disabled={disabled}
                      >
                        {SESSION_BLOCK_TYPES.map((blockType) => (
                          <option key={blockType} value={blockType}>
                            {getSessionBlockTypeLabel(blockType)}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="field">
                      <label>Series</label>
                      <input
                        aria-label={compact ? 'Series' : undefined}
                        type="number"
                        inputMode={compact ? 'numeric' : undefined}
                        min="1"
                        step="1"
                        value={block.sets_count}
                        onChange={(event) =>
                          onUpdateBlock(block.id, {
                            sets_count:
                              event.target.value.trim() === ''
                                ? ''
                                : normalizeSessionSetsCount(event.target.value),
                          })
                        }
                        placeholder="Ex : 3"
                        disabled={disabled}
                      />
                    </div>

                    <ChargeField className="field">
                      {compact && block.blockType !== 'reps' ? <summary>Charge optionnelle</summary> : null}
                      <label>Charge (kg)</label>
                      <input
                        aria-label={compact ? 'Charge (kg)' : undefined}
                        type="number"
                        inputMode={compact ? 'decimal' : undefined}
                        min="0"
                        step="0.5"
                        value={block.chargeKg}
                        onChange={(event) => onUpdateBlock(block.id, { chargeKg: event.target.value })}
                        placeholder="Ex : 80"
                        disabled={disabled}
                      />
                    </ChargeField>

                    <div className="field">
                      <label>Repos (sec)</label>
                      <input
                        aria-label={compact ? 'Repos (sec)' : undefined}
                        type="number"
                        inputMode={compact ? 'numeric' : undefined}
                        min="0"
                        step="1"
                        value={block.restSeconds}
                        onChange={(event) => onUpdateBlock(block.id, { restSeconds: event.target.value })}
                        placeholder="Ex : 60"
                        disabled={disabled}
                      />
                    </div>

                    {(!compact || block.blockType !== 'free') ? <div className="field full">
                      <label>{getSessionBlockInputLabel(block.blockType)}</label>
                      <input
                        aria-label={compact ? getSessionBlockInputLabel(block.blockType) : undefined}
                        type={block.blockType === 'free' ? 'text' : 'number'}
                        inputMode={compact ? block.blockType === 'free' ? 'text' : block.blockType === 'distance' ? 'decimal' : 'numeric' : undefined}
                        min={block.blockType === 'free' ? undefined : '0'}
                        step="1"
                        value={block.targetValue}
                        onChange={(event) => onUpdateBlock(block.id, { targetValue: event.target.value })}
                        placeholder={getSessionBlockPlaceholder(block.blockType)}
                        disabled={disabled || block.blockType === 'free'}
                      />
                    </div> : null}
                  </div>

                  <p className="session-block-preview">
                    Apercu : <strong>{previewBlock.name}</strong> ·{' '}
                    {formatSessionBlockSummary(
                      block.blockType,
                      block.targetValue ? Number(block.targetValue) : null,
                      normalizeSessionSetsCount(block.sets_count),
                      block.chargeKg ? Number(block.chargeKg) : null
                    )}
                    {block.restSeconds.trim()
                      ? ` · ${formatSessionRestSeconds(normalizeSessionRestSeconds(block.restSeconds))}`
                      : ''}
                  </p>
                  {compact && blockVolume ? <p className="session-block-preview">Volume : {formatSessionVolumeKg(blockVolume)}</p> : null}
                </div>
              ) : null}
            </article>
          );
        })}
      </div>
    </article>
  );
}
