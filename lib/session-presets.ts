import { SessionBlockDraft } from '@/lib/session-draft-blocks';

export type SessionPreset = {
  name: string;
  sport: string;
  description: string;
  blocks: SessionBlockDraft[];
};

type SessionPresetBlockInput = Omit<SessionBlockDraft, 'id'>;

function createPresetBlock(index: number, block: SessionPresetBlockInput): SessionBlockDraft {
  return {
    id: `preset-block-${Date.now()}-${index}`,
    ...block,
  };
}

export function buildTrailFitnessSessionPreset(): SessionPreset {
  const blocks: SessionBlockDraft[] = [
    createPresetBlock(0, {
      name: 'Rameur',
      blockType: 'duration',
      sets_count: 1,
      targetValue: '300',
      chargeKg: '',
      restSeconds: '0',
    }),
    createPresetBlock(1, {
      name: 'Tapis incline',
      blockType: 'duration',
      sets_count: 1,
      targetValue: '240',
      chargeKg: '',
      restSeconds: '0',
    }),
    createPresetBlock(2, {
      name: 'Mountain climbers controles',
      blockType: 'duration',
      sets_count: 2,
      targetValue: '30',
      chargeKg: '',
      restSeconds: '30',
    }),
    createPresetBlock(3, {
      name: 'Squat goblet',
      blockType: 'reps',
      sets_count: 4,
      targetValue: '8',
      chargeKg: '20',
      restSeconds: '75',
    }),
    createPresetBlock(4, {
      name: 'Fentes bulgares',
      blockType: 'reps',
      sets_count: 3,
      targetValue: '8',
      chargeKg: '12',
      restSeconds: '75',
    }),
    createPresetBlock(5, {
      name: 'Hip thrust',
      blockType: 'reps',
      sets_count: 4,
      targetValue: '10',
      chargeKg: '40',
      restSeconds: '75',
    }),
    createPresetBlock(6, {
      name: 'Mollets debout',
      blockType: 'reps',
      sets_count: 3,
      targetValue: '15',
      chargeKg: '20',
      restSeconds: '45',
    }),
    createPresetBlock(7, {
      name: 'Gainage frontal',
      blockType: 'duration',
      sets_count: 3,
      targetValue: '45',
      chargeKg: '',
      restSeconds: '30',
    }),
    createPresetBlock(8, {
      name: 'Gainage lateral',
      blockType: 'duration',
      sets_count: 3,
      targetValue: '30',
      chargeKg: '',
      restSeconds: '30',
    }),
    createPresetBlock(9, {
      name: 'Rowing halteres leger',
      blockType: 'reps',
      sets_count: 3,
      targetValue: '12',
      chargeKg: '12',
      restSeconds: '60',
    }),
    createPresetBlock(10, {
      name: 'Assault bike',
      blockType: 'duration',
      sets_count: 6,
      targetValue: '40',
      chargeKg: '',
      restSeconds: '20',
    }),
    createPresetBlock(11, {
      name: 'Marche inclinee lente',
      blockType: 'duration',
      sets_count: 1,
      targetValue: '240',
      chargeKg: '',
      restSeconds: '0',
    }),
    createPresetBlock(12, {
      name: 'Mobilite hanches chevilles respiration',
      blockType: 'duration',
      sets_count: 1,
      targetValue: '300',
      chargeKg: '',
      restSeconds: '0',
    }),
  ];

  return {
    name: 'Renforcement trail jambes & tronc',
    sport: 'Fitness',
    description:
      'Seance intermediaire orientee jambes, tronc et stabilite pour soutenir la reprise course et trail.',
    blocks,
  };
}
