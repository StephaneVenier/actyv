import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

function buildJsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

function normalizeBearerToken(authorizationHeader: string | null) {
  if (!authorizationHeader) return null;
  const [scheme, token] = authorizationHeader.split(' ');
  if (scheme?.toLowerCase() !== 'bearer' || !token) return null;
  return token.trim();
}

function getErrorMessage(error: unknown) {
  if (error && typeof error === 'object' && 'message' in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === 'string') return message;
  }

  return 'Erreur inconnue';
}

async function safeDeleteByUserId(
  adminClient: ReturnType<typeof createClient>,
  table: string,
  userId: string,
  notes: string[]
) {
  const { error } = await adminClient.from(table).delete().eq('user_id', userId);
  if (!error) return;

  const message = getErrorMessage(error);
  if (message.toLowerCase().includes('relation') && message.toLowerCase().includes('does not exist')) {
    notes.push(`Table ${table} absente de cette base, suppression ignoree.`);
    return;
  }

  throw error;
}

async function safeDeleteByEmail(
  adminClient: ReturnType<typeof createClient>,
  table: string,
  column: string,
  email: string | null,
  notes: string[]
) {
  if (!email) return;

  const { error } = await adminClient.from(table).delete().eq(column, email);
  if (!error) return;

  const message = getErrorMessage(error).toLowerCase();
  if (message.includes('column') && message.includes(column.toLowerCase())) {
    notes.push(`Colonne ${table}.${column} absente, suppression legacy ignoree.`);
    return;
  }

  if (message.includes('relation') && message.includes('does not exist')) {
    notes.push(`Table ${table} absente de cette base, suppression legacy ignoree.`);
    return;
  }

  throw error;
}

export async function POST(request: NextRequest) {
  if (!supabaseUrl || !supabaseAnonKey) {
    return buildJsonError('Configuration Supabase publique manquante.', 500);
  }

  if (!supabaseServiceRoleKey) {
    return buildJsonError(
      'SUPABASE_SERVICE_ROLE_KEY manquante. Ajoute cette variable cote serveur pour activer la suppression de compte.',
      503
    );
  }

  const token = normalizeBearerToken(request.headers.get('authorization'));
  if (!token) {
    return buildJsonError('Session invalide. Reconnecte-toi puis reessaie.', 401);
  }

  const authClient = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  const {
    data: { user },
    error: userError,
  } = await authClient.auth.getUser(token);

  if (userError || !user) {
    return buildJsonError('Impossible de verifier ton identite.', 401);
  }

  const adminClient = createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  const notes: string[] = [];

  try {
    const { error: activitiesByUserError } = await adminClient
      .from('activities')
      .update({
        user_id: null,
        comment: null,
      })
      .eq('user_id', user.id);

    if (activitiesByUserError) {
      throw activitiesByUserError;
    }

    if (user.email) {
      const { error: activitiesByEmailError } = await adminClient
        .from('activities')
        .update({
          user_email: null,
          comment: null,
        })
        .eq('user_email', user.email);

      if (activitiesByEmailError) {
        const message = getErrorMessage(activitiesByEmailError).toLowerCase();
        if (message.includes('column') && message.includes('user_email')) {
          notes.push('La colonne activities.user_email est absente, nettoyage email legacy ignore.');
        } else {
          throw activitiesByEmailError;
        }
      }
    }

    const { error: challengesError } = await adminClient
      .from('challenges')
      .update({
        created_by: null,
      })
      .eq('created_by', user.id);

    if (challengesError) {
      throw challengesError;
    }

    await safeDeleteByUserId(adminClient, 'challenge_participants', user.id, notes);
    await safeDeleteByUserId(adminClient, 'activity_interactions', user.id, notes);

    const { error: membersByUserError } = await adminClient
      .from('challenge_members')
      .delete()
      .eq('user_id', user.id);

    if (membersByUserError) {
      const message = getErrorMessage(membersByUserError).toLowerCase();
      if (message.includes('relation') && message.includes('does not exist')) {
        notes.push('Table challenge_members absente de cette base, suppression ignoree.');
      } else {
        throw membersByUserError;
      }
    }

    await safeDeleteByEmail(adminClient, 'challenge_members', 'user_email', user.email ?? null, notes);

    const { error: usersByIdError } = await adminClient.from('users').delete().eq('id', user.id);
    if (usersByIdError) {
      const message = getErrorMessage(usersByIdError).toLowerCase();
      if (message.includes('relation') && message.includes('does not exist')) {
        notes.push('Table users absente de cette base, suppression legacy ignoree.');
      } else {
        throw usersByIdError;
      }
    }

    await safeDeleteByEmail(adminClient, 'users', 'email', user.email ?? null, notes);

    const { error: profileDeleteError } = await adminClient.from('profiles').delete().eq('id', user.id);
    if (profileDeleteError) {
      throw profileDeleteError;
    }

    const { error: deleteAuthError } = await adminClient.auth.admin.deleteUser(user.id, false);
    if (deleteAuthError) {
      throw deleteAuthError;
    }

    return NextResponse.json({
      success: true,
      notes,
      deletedUserId: user.id,
    });
  } catch (error) {
    console.error('Erreur suppression compte Actyv :', error);
    return buildJsonError(
      `Suppression impossible pour le moment: ${getErrorMessage(error)}`,
      500
    );
  }
}
