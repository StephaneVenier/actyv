import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

function clients() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key || !service) throw new Error('configuration');
  const auth = { persistSession: false, autoRefreshToken: false };
  return { client: createClient(url, key, { auth }), admin: createClient(url, service, { auth }) };
}

function proofHash(value: unknown) {
  if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) return null;
  return createHash('sha256').update(value.toLowerCase()).digest('hex');
}

const fail = (status: number, message: string) => NextResponse.json({ error: message }, { status });

export async function GET(request: NextRequest) {
  const hash = proofHash(request.headers.get('x-actyv-deletion-proof'));
  if (!hash) return fail(400, 'Confirmation invalide.');
  try {
    const { admin } = clients();
    const result = await admin.from('account_deletion_confirmations').select('user_id').eq('proof_hash', hash).maybeSingle();
    if (result.error) throw new Error('confirmation');
    // This opaque proof can only confirm deletion; it never authorizes it.
    return NextResponse.json({ confirmed: !!result.data && result.data.user_id === null }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return fail(503, 'Confirmation temporairement indisponible.');
  }
}

export async function POST(request: NextRequest) {
  const token = request.headers.get('authorization')?.match(/^Bearer ([^\s]+)$/i)?.[1];
  if (!token) return fail(401, 'Reconnecte-toi pour finaliser la suppression.');
  try {
    const { client, admin } = clients();
    const verified = await client.auth.getUser(token);
    const user = verified.data.user;
    if (verified.error || !user) return fail(401, 'Session invalide. Reconnecte-toi.');
    const body = await request.json().catch(() => null);
    const hash = proofHash(body?.purgeProof);
    if (!hash) return fail(400, 'Confirmation locale invalide.');
    const pending = await admin.from('account_deletion_state').select('user_id').eq('user_id', user.id).maybeSingle();
    if (pending.error) throw new Error('state');
    if (!pending.data) {
      if (!user.email || typeof body?.password !== 'string' || !body.password) return fail(400, 'Confirme ton mot de passe.');
      const confirmation = await client.auth.signInWithPassword({ email: user.email, password: body.password });
      if (confirmation.error || confirmation.data.user?.id !== user.id) return fail(403, 'Mot de passe incorrect ou confirmation indisponible.');
      await client.auth.signOut({ scope: 'local' });
    }
    const existing = await admin.from('account_deletion_confirmations').select('user_id').eq('proof_hash', hash).maybeSingle();
    if (existing.error) throw new Error('proof');
    if (existing.data && existing.data.user_id !== user.id) return fail(409, 'Confirmation refusée.');
    if (!existing.data) {
      const saved = await admin.from('account_deletion_confirmations').insert({ proof_hash: hash, user_id: user.id });
      if (saved.error) {
        if (saved.error.code !== '23505') throw new Error('proof');
        const raced = await admin.from('account_deletion_confirmations').select('user_id').eq('proof_hash', hash).maybeSingle();
        if (raced.error || raced.data?.user_id !== user.id) return fail(409, 'Confirmation refusée.');
      }
    }
    if (!pending.data) {
      const cleanup = await admin.rpc('cleanup_account_data', { p_user_id: user.id });
      if (cleanup.error) throw new Error('cleanup');
    }
    const deleted = await admin.auth.admin.deleteUser(user.id, false);
    if (deleted.error) return fail(503, 'La suppression de ton compte doit être finalisée. Reconnecte-toi puis réessaie.');
    return NextResponse.json({ success: true });
  } catch {
    return fail(503, 'Suppression non confirmée. Réessaie. Si le problème persiste, contacte contact@a-ctyv.fr.');
  }
}
