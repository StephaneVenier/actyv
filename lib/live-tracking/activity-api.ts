import { supabase } from '@/lib/supabase';
import { synchronizeLiveActivity, type ExistingLiveActivity } from '@/lib/live-tracking/activity-sync';
import { saveFinishedLiveActivity } from '@/lib/live-tracking/storage';
import type { FinishedLiveActivity } from '@/lib/live-tracking/types';

export function syncFinishedLiveActivity(snapshot: FinishedLiveActivity) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);
  return synchronizeLiveActivity(snapshot, {
    async getUser() {
      const { data, error } = await Promise.race([
        supabase.auth.getUser(),
        new Promise<never>((_resolve, reject) => controller.signal.addEventListener('abort',
          () => reject(new Error('Connexion trop lente. Ton activite est conservee, reessaie.')), { once: true })),
      ]);
      if (error || !data.user) throw new Error('Connecte-toi avec le compte de cette activite pour la synchroniser.');
      return data.user;
    },
    async insert(payload) {
      const { error } = await supabase.from('activities').insert(payload).abortSignal(controller.signal);
      if (error) throw error;
    },
    async find(id) {
      const { data, error } = await supabase.from('activities')
        .select('id,user_id,source,challenge_id,live_session_id:metadata->>live_session_id')
        .eq('id', id).abortSignal(controller.signal).maybeSingle();
      if (error) throw error;
      if (!data) return null;
      const row = data as Omit<ExistingLiveActivity, 'metadata'> & { live_session_id: string | null };
      return { id: row.id, user_id: row.user_id, source: row.source, challenge_id: row.challenge_id,
        metadata: row.live_session_id ? { live_session_id: row.live_session_id } : null };
    },
    async processMasteries(id) {
      const { error } = await supabase.rpc('process_activity_masteries', { p_activity_id: id })
        .abortSignal(controller.signal);
      if (error) throw error;
    },
    persist: saveFinishedLiveActivity,
  }).finally(() => clearTimeout(timeout));
}
