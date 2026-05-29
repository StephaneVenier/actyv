import {
  normalizeSessionSetsCount,
  SessionBlockType,
} from '@/lib/session-blocks';
import { TrainingSessionBlockInsert, TrainingSessionBlockRecord } from '@/lib/training-session-blocks-db';

export type SessionBlockDraft = {
  id: string;
  name: string;
  blockType: SessionBlockType;
  sets_count: number | '';
  targetValue: string;
  chargeKg: string;
  restSeconds: string;
};

export function createEmptySessionBlockDraft(index: number): SessionBlockDraft {
  return {
    id: `block-${Date.now()}-${index}`,
    name: '',
    blockType: 'reps',
    sets_count: 1,
    targetValue: '',
    chargeKg: '',
    restSeconds: '60',
  };
}

export function mapSessionBlockRecordToDraft(block: TrainingSessionBlockRecord): SessionBlockDraft {
  return {
    id: block.id,
    name: block.name,
    blockType: block.block_type,
    sets_count: normalizeSessionSetsCount(block.sets_count),
    targetValue:
      block.target_value === null || block.target_value === undefined ? '' : String(block.target_value),
    chargeKg:
      block.charge_kg === null || block.charge_kg === undefined ? '' : String(block.charge_kg),
    restSeconds:
      block.rest_seconds === null || block.rest_seconds === undefined
        ? '60'
        : String(block.rest_seconds),
  };
}

export function normalizeSessionRestSeconds(value: number | string | null | undefined) {
  const parsedValue =
    typeof value === 'string' ? Number.parseInt(value, 10) : Number(value);

  if (!Number.isFinite(parsedValue) || parsedValue < 0) {
    return 0;
  }

  return Math.trunc(parsedValue);
}

export function normalizeDraftSessionBlocks(blocks: SessionBlockDraft[]): TrainingSessionBlockInsert[] {
  return blocks
    .map((block, index) => ({
      position: index,
      name: block.name.trim(),
      block_type: block.blockType,
      sets_count: normalizeSessionSetsCount(block.sets_count),
      target_value:
        block.blockType === 'free' || block.targetValue.trim() === ''
          ? null
          : Number(block.targetValue),
      charge_kg:
        block.chargeKg.trim() === '' || Number(block.chargeKg) <= 0 ? null : Number(block.chargeKg),
      rest_seconds: normalizeSessionRestSeconds(block.restSeconds),
    }))
    .filter((block) => block.name);
}

export function getInvalidSessionBlock(blocks: TrainingSessionBlockInsert[]) {
  return blocks.find(
    (block) =>
      Number.isNaN(block.sets_count) ||
      block.sets_count <= 0 ||
      !Number.isInteger(block.sets_count) ||
      Number.isNaN(block.rest_seconds) ||
      block.rest_seconds < 0 ||
      !Number.isInteger(block.rest_seconds) ||
      (block.charge_kg !== null && Number.isNaN(block.charge_kg)) ||
      ((block.block_type === 'reps' || block.block_type === 'duration' || block.block_type === 'distance') &&
        (block.target_value === null || Number.isNaN(block.target_value) || block.target_value <= 0))
  );
}

export function getSessionBlockValidationMessage(blocks: TrainingSessionBlockInsert[]) {
  for (const [index, block] of blocks.entries()) {
    const needsTarget =
      block.block_type === 'reps' || block.block_type === 'duration' || block.block_type === 'distance';

    const hasInvalidSets =
      Number.isNaN(block.sets_count) || block.sets_count < 1 || !Number.isInteger(block.sets_count);
    const hasInvalidRest =
      Number.isNaN(block.rest_seconds) || block.rest_seconds < 0 || !Number.isInteger(block.rest_seconds);
    const hasInvalidCharge = block.charge_kg !== null && Number.isNaN(block.charge_kg);
    const hasInvalidTarget =
      needsTarget &&
      (block.target_value === null || Number.isNaN(block.target_value) || block.target_value <= 0);

    if (hasInvalidSets || hasInvalidRest || hasInvalidCharge || hasInvalidTarget) {
      const blockLabel = block.name?.trim() ? `"${block.name.trim()}"` : `#${index + 1}`;

      if (hasInvalidSets) {
        return `Bloc ${blockLabel} : le nombre de series doit etre superieur ou egal a 1.`;
      }

      if (hasInvalidRest) {
        return `Bloc ${blockLabel} : le repos doit etre un nombre entier superieur ou egal a 0.`;
      }

      if (hasInvalidTarget) {
        return `Bloc ${blockLabel} : renseigne une cible valide pour ce type d'exercice.`;
      }

      if (hasInvalidCharge) {
        return `Bloc ${blockLabel} : la charge doit etre un nombre valide ou vide.`;
      }

      return `Bloc ${blockLabel} : verifie les valeurs saisies.`;
    }
  }

  return null;
}
