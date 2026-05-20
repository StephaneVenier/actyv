'use client';

import { SessionExercisePicker } from '@/components/session-exercise-picker';
import {
  formatSessionBlockSummary,
  formatSessionRestSeconds,
  getSessionBlockInputLabel,
  getSessionBlockPlaceholder,
  getSessionBlockTypeLabel,
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
  return (
    <article className="card session-form-card stack">
      <div className="session-blocks-header">
        <div>
          <span className="section-kicker">{kicker}</span>
          <h2>{title}</h2>
        </div>

        <button type="button" className="button ghost" onClick={onAddBlock} disabled={disabled}>
          + Ajouter un bloc
        </button>
      </div>

      <div className="session-block-list">
        {blocks.map((block, index) => (
          <article key={block.id} className="session-block-card">
            <div className="session-block-card__top">
              <strong>Bloc {index + 1}</strong>
              <button
                type="button"
                className="button ghost session-block-remove"
                onClick={() => onRemoveBlock(block.id)}
                disabled={disabled || blocks.length === 1}
              >
                Retirer
              </button>
            </div>

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
                  step={block.blockType === 'distance' ? '1' : '1'}
                  value={block.targetValue}
                  onChange={(event) => onUpdateBlock(block.id, { targetValue: event.target.value })}
                  placeholder={getSessionBlockPlaceholder(block.blockType)}
                  disabled={disabled || block.blockType === 'free'}
                />
              </div>
            </div>

            <p className="session-block-preview">
              Apercu : <strong>{block.name.trim() || 'Bloc sans nom'}</strong> ·{' '}
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
          </article>
        ))}
      </div>
    </article>
  );
}
