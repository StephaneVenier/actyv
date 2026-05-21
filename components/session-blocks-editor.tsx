'use client';

import { useEffect, useState } from 'react';
import { SessionExercisePicker } from '@/components/session-exercise-picker';
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
  title?: string;
  kicker?: string;
  onAddBlock: () => void;
  onRemoveBlock: (blockId: string) => void;
  onUpdateBlock: (blockId: string, updates: Partial<SessionBlockDraft>) => void;
};

export function SessionBlocksEditor({
  blocks,
  disabled = false,
  title = 'Structure de la seance',
  kicker = 'Blocs',
  onAddBlock,
  onRemoveBlock,
  onUpdateBlock,
}: SessionBlocksEditorProps) {
  const [expandedBlockIds, setExpandedBlockIds] = useState<string[]>([]);

  useEffect(() => {
    setExpandedBlockIds((current) => current.filter((blockId) => blocks.some((block) => block.id === blockId)));
  }, [blocks]);

  const toggleDetails = (blockId: string) => {
    setExpandedBlockIds((current) =>
      current.includes(blockId) ? current.filter((value) => value !== blockId) : [...current, blockId]
    );
  };

  return (
    <article className="card session-form-card stack session-editor-card">
      <div className="session-blocks-header">
        <div>
          <span className="section-kicker">{kicker}</span>
          <h2>{title}</h2>
        </div>

        <button type="button" className="button ghost" onClick={onAddBlock} disabled={disabled}>
          + Ajouter un bloc
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

          return (
            <article
              key={block.id}
              className={`session-editor-block session-editor-block--accent-${accent}${isExpanded ? ' is-expanded' : ''}`}
            >
              <div className="session-editor-block__compact">
                <div className="session-editor-block__lead">
                  <div className="session-editor-block__index">
                    <span className="session-editor-block__grip">≡</span>
                    <strong>{String(index + 1).padStart(2, '0')}</strong>
                  </div>
                  <span className="session-editor-block__accent" />
                  <div className="session-editor-block__identity">
                    <strong>{previewBlock.name}</strong>
                    <small>{getSessionBlockTypeLabel(block.blockType)}</small>
                  </div>
                </div>

                <div className="session-editor-block__summary">
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
                </div>

                <div className="session-editor-block__controls">
                  <button
                    type="button"
                    className="button ghost compact-exercise-card__toggle"
                    onClick={() => toggleDetails(block.id)}
                    disabled={disabled}
                    aria-expanded={isExpanded}
                  >
                    {isExpanded ? 'Details ▴' : 'Details ▾'}
                  </button>
                  <button
                    type="button"
                    className="button ghost session-block-remove"
                    onClick={() => onRemoveBlock(block.id)}
                    disabled={disabled || blocks.length === 1}
                  >
                    Supprimer
                  </button>
                </div>
              </div>

              {isExpanded ? (
                <div className="session-editor-block__details">
                  <div className="session-form-grid">
                    <div className="field">
                      <label>Nom du bloc</label>
                      <div className="session-block-name-field">
                        <SessionExercisePicker
                          disabled={disabled}
                          onSelectExercise={(exerciseName) => onUpdateBlock(block.id, { name: exerciseName })}
                        />
                      </div>
                      <input
                        value={block.name}
                        onChange={(event) => onUpdateBlock(block.id, { name: event.target.value })}
                        placeholder="Ex : Pompes, Gainage, 400m rapide"
                        disabled={disabled}
                      />
                    </div>

                    <div className="field">
                      <label>Type</label>
                      <select
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
                        type="number"
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

                    <div className="field">
                      <label>Charge (kg)</label>
                      <input
                        type="number"
                        min="0"
                        step="0.5"
                        value={block.chargeKg}
                        onChange={(event) => onUpdateBlock(block.id, { chargeKg: event.target.value })}
                        placeholder="Ex : 80"
                        disabled={disabled}
                      />
                    </div>

                    <div className="field">
                      <label>Repos (sec)</label>
                      <input
                        type="number"
                        min="0"
                        step="1"
                        value={block.restSeconds}
                        onChange={(event) => onUpdateBlock(block.id, { restSeconds: event.target.value })}
                        placeholder="Ex : 60"
                        disabled={disabled}
                      />
                    </div>

                    <div className="field full">
                      <label>{getSessionBlockInputLabel(block.blockType)}</label>
                      <input
                        type={block.blockType === 'free' ? 'text' : 'number'}
                        min={block.blockType === 'free' ? undefined : '0'}
                        step="1"
                        value={block.targetValue}
                        onChange={(event) => onUpdateBlock(block.id, { targetValue: event.target.value })}
                        placeholder={getSessionBlockPlaceholder(block.blockType)}
                        disabled={disabled || block.blockType === 'free'}
                      />
                    </div>
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
                </div>
              ) : null}
            </article>
          );
        })}
      </div>
    </article>
  );
}
