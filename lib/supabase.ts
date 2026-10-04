import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
export const AUTH_STORAGE_KEY = supabaseUrl ? `sb-${new URL(supabaseUrl).hostname.split('.')[0]}-auth-token` : null;

// ⚠️ Ne pas crash au build
export const supabase =
  supabaseUrl && supabaseKey
    ? createClient(supabaseUrl, supabaseKey, {auth:{storageKey:AUTH_STORAGE_KEY!}})
    : ({} as any);

// Auth URL processing can finish before the recovery page mounts.
if (typeof window !== 'undefined' && supabase.auth) {
  supabase.auth.onAuthStateChange((event: string, session: {user:{id:string}} | null) => {
    try {
    if (event === 'PASSWORD_RECOVERY' && session) {
      window.sessionStorage.setItem('actyv.password-recovery', JSON.stringify({owner:session.user.id,at:Date.now()}));
    } else if (event === 'SIGNED_OUT') {
      window.sessionStorage.removeItem('actyv.password-recovery');
    }
    } catch { /* Recovery events still work when browser storage is disabled. */ }
  });
}
