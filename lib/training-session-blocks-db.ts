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
};

export type TrainingSessionBlockInsert = {
  position: number;
  name: string;
  block_type: SessionBlockType;
  sets_count: number;
  target_value: number | null;
};

function isSchemaAlignmentError(serializedError: string) {
  return (
    serializedError.includes('PGRST204') ||
    serializedError.includes('Could not find the') ||
    serializedError.includes('column') ||
    serializedError.includes('order_index') ||
    serializedError.includes('block_name') ||
    serializedError.includes('block_type') ||
    serializedError.includes('sets_count')
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
      sets_count: row.sets_count ?? 1,
      target_value: row.target_value,
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
      sets_count: row.sets_count ?? 1,
      target_value: row.target_value,
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
  console.log('BLOCKS PAYLOAD:', blocksPayload);

  const variants = [
    {
      label: 'canonical',
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

  const canonicalQuery = applySessionFilter(
    supabase
      .from('training_session_blocks')
      .select('id, session_id, position, name, block_type, sets_count, target_value')
      .order('position', { ascending: true }),
    sessionIds
  );
  const canonicalResponse = await canonicalQuery;

  if (!canonicalResponse.error) {
    return {
      data: normalizeCanonicalRows((canonicalResponse.data as any[]) || []),
      error: null,
    };
  }

  console.error(
    'SESSION BLOCKS SELECT ERROR:',
    JSON.stringify(canonicalResponse.error, null, 2)
  );

  const canonicalFallbackQuery = applySessionFilter(
    supabase
      .from('training_session_blocks')
      .select('id, session_id, position, name, block_type, target_value')
      .order('position', { ascending: true }),
    sessionIds
  );
  const canonicalFallbackResponse = await canonicalFallbackQuery;

  if (!canonicalFallbackResponse.error) {
    return {
      data: normalizeCanonicalRows((canonicalFallbackResponse.data as any[]) || []),
      error: null,
    };
  }

  console.error(
    'SESSION BLOCKS SELECT FALLBACK ERROR:',
    JSON.stringify(canonicalFallbackResponse.error, null, 2)
  );

  const legacyQuery = applySessionFilter(
    supabase
      .from('training_session_blocks')
      .select('id, session_id, order_index, block_name, type, sets_count, target_value')
      .order('order_index', { ascending: true }),
    sessionIds
  );
  const legacyResponse = await legacyQuery;

  if (!legacyResponse.error) {
    return {
      data: normalizeLegacyRows((legacyResponse.data as any[]) || []),
      error: null,
    };
  }

  console.error(
    'SESSION BLOCKS LEGACY SELECT ERROR:',
    JSON.stringify(legacyResponse.error, null, 2)
  );

  const legacyFallbackQuery = applySessionFilter(
    supabase
      .from('training_session_blocks')
      .select('id, session_id, order_index, block_name, type, target_value')
      .order('order_index', { ascending: true }),
    sessionIds
  );
  const legacyFallbackResponse = await legacyFallbackQuery;

  if (!legacyFallbackResponse.error) {
    return {
      data: normalizeLegacyRows((legacyFallbackResponse.data as any[]) || []),
      error: null,
    };
  }

  console.error(
    'SESSION BLOCKS LEGACY FALLBACK ERROR:',
    JSON.stringify(legacyFallbackResponse.error, null, 2)
  );

  return { data: [] as TrainingSessionBlockRecord[], error: legacyFallbackResponse.error };
}
