import { SessionBlockType } from '@/lib/session-blocks';
import { supabase } from '@/lib/supabase';

export type TrainingSessionBlockRecord = {
  id: string;
  session_id: string;
  position: number;
  name: string;
  block_type: SessionBlockType;
  sets_count: number | null;
  target_value: number | null;
  charge_kg: number | null;
};

export type TrainingSessionBlockInsert = {
  position: number;
  name: string;
  block_type: SessionBlockType;
  sets_count: number;
  target_value: number | null;
  charge_kg: number | null;
};

type BlockVariant = {
  label: string;
  rows: Record<string, unknown>[];
};

function isSchemaAlignmentError(serializedError: string) {
  return (
    serializedError.includes('PGRST204') ||
    serializedError.includes('Could not find the') ||
    serializedError.includes('column') ||
    serializedError.includes('order_index') ||
    serializedError.includes('block_name') ||
    serializedError.includes('block_type') ||
    serializedError.includes('sets_count') ||
    serializedError.includes('charge_kg')
  );
}

function normalizeCanonicalRows(rows: any[]) {
  return rows.map(
    (row): TrainingSessionBlockRecord => ({
      id: row.id,
      session_id: row.session_id,
      position: Number(row.position ?? 0),
      name: row.name,
      block_type: row.block_type,
      sets_count: row.sets_count ?? row.set_count ?? row.sets ?? row.series_count ?? 1,
      target_value: row.target_value,
      charge_kg: row.charge_kg ?? null,
    })
  );
}

function normalizeLegacyRows(rows: any[]) {
  return rows.map(
    (row): TrainingSessionBlockRecord => ({
      id: row.id,
      session_id: row.session_id,
      position: Number(row.order_index ?? 0),
      name: row.block_name,
      block_type: row.type,
      sets_count: row.sets_count ?? row.set_count ?? row.sets ?? row.series_count ?? 1,
      target_value: row.target_value,
      charge_kg: row.charge_kg ?? null,
    })
  );
}

function applySessionFilter(query: any, sessionIds: string[]) {
  if (sessionIds.length === 1) {
    return query.eq('session_id', sessionIds[0]);
  }

  return query.in('session_id', sessionIds);
}

export async function insertTrainingSessionBlocks(
  sessionId: string,
  blocksPayload: TrainingSessionBlockInsert[]
) {
  const variants: BlockVariant[] = [
    {
      label: 'canonical',
      rows: blocksPayload.map((block) => ({
        session_id: sessionId,
        position: block.position,
        name: block.name,
        block_type: block.block_type,
        sets_count: block.sets_count,
        target_value: block.target_value,
        charge_kg: block.charge_kg,
      })),
    },
    {
      label: 'canonical_without_charge',
      rows: blocksPayload.map((block) => ({
        session_id: sessionId,
        position: block.position,
        name: block.name,
        block_type: block.block_type,
        sets_count: block.sets_count,
        target_value: block.target_value,
      })),
    },
    {
      label: 'canonical_with_set_count',
      rows: blocksPayload.map((block) => ({
        session_id: sessionId,
        position: block.position,
        name: block.name,
        block_type: block.block_type,
        set_count: block.sets_count,
        target_value: block.target_value,
        charge_kg: block.charge_kg,
      })),
    },
    {
      label: 'canonical_with_sets',
      rows: blocksPayload.map((block) => ({
        session_id: sessionId,
        position: block.position,
        name: block.name,
        block_type: block.block_type,
        sets: block.sets_count,
        target_value: block.target_value,
        charge_kg: block.charge_kg,
      })),
    },
    {
      label: 'canonical_without_sets',
      rows: blocksPayload.map((block) => ({
        session_id: sessionId,
        position: block.position,
        name: block.name,
        block_type: block.block_type,
        target_value: block.target_value,
      })),
    },
    {
      label: 'legacy',
      rows: blocksPayload.map((block) => ({
        session_id: sessionId,
        order_index: block.position,
        block_name: block.name,
        type: block.block_type,
        sets_count: block.sets_count,
        target_value: block.target_value,
        charge_kg: block.charge_kg,
      })),
    },
    {
      label: 'legacy_with_set_count',
      rows: blocksPayload.map((block) => ({
        session_id: sessionId,
        order_index: block.position,
        block_name: block.name,
        type: block.block_type,
        set_count: block.sets_count,
        target_value: block.target_value,
        charge_kg: block.charge_kg,
      })),
    },
    {
      label: 'legacy_with_sets',
      rows: blocksPayload.map((block) => ({
        session_id: sessionId,
        order_index: block.position,
        block_name: block.name,
        type: block.block_type,
        sets: block.sets_count,
        target_value: block.target_value,
        charge_kg: block.charge_kg,
      })),
    },
    {
      label: 'legacy_without_charge',
      rows: blocksPayload.map((block) => ({
        session_id: sessionId,
        order_index: block.position,
        block_name: block.name,
        type: block.block_type,
        sets_count: block.sets_count,
        target_value: block.target_value,
      })),
    },
    {
      label: 'legacy_without_sets',
      rows: blocksPayload.map((block) => ({
        session_id: sessionId,
        order_index: block.position,
        block_name: block.name,
        type: block.block_type,
        target_value: block.target_value,
      })),
    },
  ];

  let lastError: any = null;

  for (const variant of variants) {
    const { error } = await supabase.from('training_session_blocks').insert(variant.rows);

    if (!error) {
      return { error: null, variant: variant.label };
    }

    lastError = error;
    const serializedError = JSON.stringify(error, null, 2);
    console.error('SESSION BLOCKS INSERT ERROR:', serializedError);

    if (!isSchemaAlignmentError(serializedError)) {
      break;
    }
  }

  return { error: lastError, variant: null };
}

export async function fetchTrainingSessionBlocks(sessionIds: string[]) {
  if (sessionIds.length === 0) {
    return { data: [] as TrainingSessionBlockRecord[], error: null };
  }

  const selectVariants = [
    {
      label: 'canonical',
      query: () =>
        applySessionFilter(
          supabase
            .from('training_session_blocks')
            .select('id, session_id, position, name, block_type, sets_count, target_value, charge_kg')
            .order('position', { ascending: true }),
          sessionIds
        ),
      normalize: normalizeCanonicalRows,
    },
    {
      label: 'canonical_without_charge',
      query: () =>
        applySessionFilter(
          supabase
            .from('training_session_blocks')
            .select('id, session_id, position, name, block_type, sets_count, target_value')
            .order('position', { ascending: true }),
          sessionIds
        ),
      normalize: normalizeCanonicalRows,
    },
    {
      label: 'canonical_with_set_count',
      query: () =>
        applySessionFilter(
          supabase
            .from('training_session_blocks')
            .select('id, session_id, position, name, block_type, set_count, target_value, charge_kg')
            .order('position', { ascending: true }),
          sessionIds
        ),
      normalize: normalizeCanonicalRows,
    },
    {
      label: 'canonical_with_sets',
      query: () =>
        applySessionFilter(
          supabase
            .from('training_session_blocks')
            .select('id, session_id, position, name, block_type, sets, target_value, charge_kg')
            .order('position', { ascending: true }),
          sessionIds
        ),
      normalize: normalizeCanonicalRows,
    },
    {
      label: 'canonical_without_sets',
      query: () =>
        applySessionFilter(
          supabase
            .from('training_session_blocks')
            .select('id, session_id, position, name, block_type, target_value, charge_kg')
            .order('position', { ascending: true }),
          sessionIds
        ),
      normalize: normalizeCanonicalRows,
    },
    {
      label: 'legacy',
      query: () =>
        applySessionFilter(
          supabase
            .from('training_session_blocks')
            .select('id, session_id, order_index, block_name, type, sets_count, target_value, charge_kg')
            .order('order_index', { ascending: true }),
          sessionIds
        ),
      normalize: normalizeLegacyRows,
    },
    {
      label: 'legacy_without_charge',
      query: () =>
        applySessionFilter(
          supabase
            .from('training_session_blocks')
            .select('id, session_id, order_index, block_name, type, sets_count, target_value')
            .order('order_index', { ascending: true }),
          sessionIds
        ),
      normalize: normalizeLegacyRows,
    },
    {
      label: 'legacy_with_set_count',
      query: () =>
        applySessionFilter(
          supabase
            .from('training_session_blocks')
            .select('id, session_id, order_index, block_name, type, set_count, target_value, charge_kg')
            .order('order_index', { ascending: true }),
          sessionIds
        ),
      normalize: normalizeLegacyRows,
    },
    {
      label: 'legacy_with_sets',
      query: () =>
        applySessionFilter(
          supabase
            .from('training_session_blocks')
            .select('id, session_id, order_index, block_name, type, sets, target_value, charge_kg')
            .order('order_index', { ascending: true }),
          sessionIds
        ),
      normalize: normalizeLegacyRows,
    },
    {
      label: 'legacy_without_sets',
      query: () =>
        applySessionFilter(
          supabase
            .from('training_session_blocks')
            .select('id, session_id, order_index, block_name, type, target_value, charge_kg')
            .order('order_index', { ascending: true }),
          sessionIds
        ),
      normalize: normalizeLegacyRows,
    },
  ];

  let lastError: any = null;

  for (const variant of selectVariants) {
    const response = await variant.query();

    if (!response.error) {
      return {
        data: variant.normalize((response.data as any[]) || []),
        error: null,
      };
    }

    lastError = response.error;
    console.error(
      `SESSION BLOCKS SELECT ERROR (${variant.label}):`,
      JSON.stringify(response.error, null, 2)
    );

    if (!isSchemaAlignmentError(JSON.stringify(response.error, null, 2))) {
      break;
    }
  }

  return { data: [] as TrainingSessionBlockRecord[], error: lastError };
}
