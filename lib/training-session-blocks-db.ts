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
  rest_seconds: number | null;
};

export type TrainingSessionBlockInsert = {
  position: number;
  name: string;
  block_type: SessionBlockType;
  sets_count: number;
  target_value: number | null;
  charge_kg: number | null;
  rest_seconds: number;
};

function normalizeRows(rows: any[]) {
  return rows.map(
    (row): TrainingSessionBlockRecord => ({
      id: row.id,
      session_id: row.session_id,
      position: Number(row.position ?? 0),
      name: row.name,
      block_type: row.block_type,
      sets_count: Number.isFinite(Number(row.sets_count)) ? Number(row.sets_count) : 1,
      target_value: Number.isFinite(Number(row.target_value)) ? Number(row.target_value) : null,
      charge_kg: Number.isFinite(Number(row.charge_kg)) ? Number(row.charge_kg) : null,
      rest_seconds: Number.isFinite(Number(row.rest_seconds)) ? Number(row.rest_seconds) : 60,
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
  const rows = blocksPayload.map((block) => ({
    session_id: sessionId,
    position: block.position,
    name: block.name,
    block_type: block.block_type,
    sets_count: block.sets_count,
    target_value: block.target_value,
    charge_kg: block.charge_kg,
    rest_seconds: block.rest_seconds,
  }));

  const { error } = await supabase.from('training_session_blocks').insert(rows);

  if (error) {
    console.error('SESSION BLOCKS INSERT ERROR:', JSON.stringify(error, null, 2));
    return { error, variant: null };
  }

  return { error: null, variant: 'canonical' };
}

export async function fetchTrainingSessionBlocks(sessionIds: string[]) {
  if (sessionIds.length === 0) {
    return { data: [] as TrainingSessionBlockRecord[], error: null };
  }

  const response = await applySessionFilter(
    supabase
      .from('training_session_blocks')
      .select(
        'id, session_id, position, name, block_type, sets_count, target_value, charge_kg, rest_seconds'
      )
      .order('position', { ascending: true }),
    sessionIds
  );

  if (response.error) {
    console.error('SESSION BLOCKS SELECT ERROR:', JSON.stringify(response.error, null, 2));
    return { data: [] as TrainingSessionBlockRecord[], error: response.error };
  }

  return {
    data: normalizeRows((response.data as any[]) || []),
    error: null,
  };
}
