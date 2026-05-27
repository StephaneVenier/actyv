import { getSessionEstimatedDuration, type SessionBlockDisplayLike } from '@/lib/session-blocks';
import { supabase } from '@/lib/supabase';
import {
  fetchTrainingSessionBlocks,
  insertTrainingSessionBlocks,
  type TrainingSessionBlockInsert,
  type TrainingSessionBlockRecord,
} from '@/lib/training-session-blocks-db';
import type { TrainingProgram, TrainingProgramSession } from '@/lib/training-programs';

export type PublicTrainingSession = {
  id: string;
  user_id: string;
  name: string;
  sport: string | null;
  description: string | null;
  visibility: 'private' | 'public';
  copied_from_session_id: string | null;
  created_at: string | null;
};

export type PublicTrainingProgram = TrainingProgram;

export type PublicCreatorProfile = {
  id: string;
  username: string | null;
  email: string | null;
};

export async function fetchPublicTrainingSessions() {
  const { data, error } = await supabase
    .from('training_sessions')
    .select('id, user_id, name, sport, description, visibility, copied_from_session_id, created_at')
    .eq('visibility', 'public')
    .order('created_at', { ascending: false });

  return {
    data: ((data as PublicTrainingSession[] | null) || []).map((session) => ({
      ...session,
      copied_from_session_id: session.copied_from_session_id ?? null,
    })),
    error,
  };
}

export async function fetchImportedPublicTrainingSessions(userId: string, sourceSessionIds: string[]) {
  if (!userId || sourceSessionIds.length === 0) {
    return { data: [] as PublicTrainingSession[], error: null };
  }

  const { data, error } = await supabase
    .from('training_sessions')
    .select('id, user_id, name, sport, description, visibility, copied_from_session_id, created_at')
    .eq('user_id', userId)
    .in('copied_from_session_id', sourceSessionIds);

  return {
    data: ((data as PublicTrainingSession[] | null) || []).map((session) => ({
      ...session,
      copied_from_session_id: session.copied_from_session_id ?? null,
    })),
    error,
  };
}

export async function fetchUserTrainingSessionsByNames(userId: string, sourceNames: string[]) {
  if (!userId || sourceNames.length === 0) {
    return { data: [] as PublicTrainingSession[], error: null };
  }

  const { data, error } = await supabase
    .from('training_sessions')
    .select('id, user_id, name, sport, description, visibility, copied_from_session_id, created_at')
    .eq('user_id', userId)
    .in('name', sourceNames);

  return {
    data: ((data as PublicTrainingSession[] | null) || []).map((session) => ({
      ...session,
      copied_from_session_id: session.copied_from_session_id ?? null,
    })),
    error,
  };
}

export async function fetchPublicTrainingPrograms() {
  const { data, error } = await supabase
    .from('training_programs')
    .select(
      'id, user_id, name, description, sport, duration_weeks, visibility, invite_code, copied_from_program_id, start_date, created_at'
    )
    .eq('visibility', 'public')
    .order('created_at', { ascending: false });

  return {
    data: ((data as PublicTrainingProgram[] | null) || []).map((program) => ({
      ...program,
      copied_from_program_id: program.copied_from_program_id ?? null,
      invite_code: program.invite_code ?? null,
    })),
    error,
  };
}

export async function fetchTrainingProgramSessionsForPrograms(programIds: string[]) {
  if (programIds.length === 0) {
    return { data: [] as TrainingProgramSession[], error: null };
  }

  const { data, error } = await supabase
    .from('training_program_sessions')
    .select('id, program_id, session_id, session_name, sport, week_number, day_of_week, order_index, created_at')
    .in('program_id', programIds)
    .order('week_number', { ascending: true })
    .order('day_of_week', { ascending: true })
    .order('order_index', { ascending: true });

  return {
    data: (data as TrainingProgramSession[] | null) || [],
    error,
  };
}

export async function fetchPublicCreatorProfiles(userIds: string[]) {
  if (userIds.length === 0) {
    return { data: [] as PublicCreatorProfile[], error: null };
  }

  const { data, error } = await supabase
    .from('profiles')
    .select('id, username, email')
    .in('id', userIds);

  return {
    data: (data as PublicCreatorProfile[] | null) || [],
    error,
  };
}

export function buildSessionBlockInsertPayload(blocks: TrainingSessionBlockRecord[]): TrainingSessionBlockInsert[] {
  return blocks.map((block) => ({
    position: block.position,
    name: block.name,
    block_type: block.block_type,
    sets_count: block.sets_count ?? 1,
    target_value: block.target_value ?? null,
    charge_kg: block.charge_kg ?? null,
    rest_seconds: block.rest_seconds ?? 60,
  }));
}

export function getSessionEstimatedDurationLabel(blocks: SessionBlockDisplayLike[]) {
  const seconds = getSessionEstimatedDuration(blocks);
  if (!seconds || seconds <= 0) return null;

  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;

  if (minutes <= 0) {
    return `${remainder} sec`;
  }

  return `${minutes} min${remainder > 0 ? ` ${remainder.toString().padStart(2, '0')}` : ''}`;
}

export async function importPublicTrainingSession(session: PublicTrainingSession, userId: string) {
  const existingCopyResponse = await fetchImportedPublicTrainingSessions(userId, [session.id]);
  if (existingCopyResponse.error) {
    return { data: null, error: existingCopyResponse.error };
  }

  const existingCopy = existingCopyResponse.data[0];
  if (existingCopy) {
    return { data: existingCopy, error: null, alreadyImported: true as const };
  }

  const existingByNameResponse = await fetchUserTrainingSessionsByNames(userId, [session.name]);
  if (existingByNameResponse.error) {
    return { data: null, error: existingByNameResponse.error };
  }

  const existingByName = existingByNameResponse.data.find((candidate) => candidate.name === session.name);
  if (existingByName) {
    return { data: existingByName, error: null, alreadyImported: true as const };
  }

  const { data: createdSession, error: sessionError } = await supabase
    .from('training_sessions')
    .insert({
      user_id: userId,
      name: session.name,
      sport: session.sport,
      description: session.description,
      visibility: 'private',
      copied_from_session_id: session.id,
    })
    .select('id')
    .single();

  if (sessionError || !createdSession) {
    return { data: null, error: sessionError, alreadyImported: false as const };
  }

  const blocksResponse = await fetchTrainingSessionBlocks([session.id]);
  if (blocksResponse.error) {
    return { data: createdSession, error: blocksResponse.error, alreadyImported: false as const };
  }

  const blocksPayload = buildSessionBlockInsertPayload(blocksResponse.data);
  if (blocksPayload.length > 0) {
    const { error: blocksError } = await insertTrainingSessionBlocks(createdSession.id, blocksPayload);

    if (blocksError) {
      return { data: createdSession, error: blocksError, alreadyImported: false as const };
    }
  }

  return { data: createdSession, error: null, alreadyImported: false as const };
}

export async function importPublicTrainingProgram(
  program: PublicTrainingProgram,
  programSessions: TrainingProgramSession[],
  userId: string
) {
  const { data: createdProgram, error: programError } = await supabase
    .from('training_programs')
    .insert({
      user_id: userId,
      name: program.name,
      description: program.description,
      sport: program.sport,
      duration_weeks: program.duration_weeks,
      visibility: 'private',
      invite_code: null,
      copied_from_program_id: program.id,
      start_date: program.start_date,
      updated_at: new Date().toISOString(),
    })
    .select('id')
    .single();

  if (programError || !createdProgram) {
    return { data: null, error: programError };
  }

  if (programSessions.length > 0) {
    const payload = programSessions.map((entry) => ({
      program_id: createdProgram.id,
      session_id: entry.session_id,
      session_name: entry.session_name,
      sport: entry.sport,
      week_number: entry.week_number,
      day_of_week: entry.day_of_week,
      order_index: entry.order_index,
    }));

    const { error: sessionsError } = await supabase.from('training_program_sessions').insert(payload);

    if (sessionsError) {
      return { data: createdProgram, error: sessionsError };
    }
  }

  return { data: createdProgram, error: null };
}
