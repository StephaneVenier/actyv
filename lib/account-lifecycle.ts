import { AUTH_STORAGE_KEY, supabase } from '@/lib/supabase';
import { liveTrackingPlatform } from '@/lib/live-tracking/platform';
import { purgeAccountStorage, purgeDeletedAuthStorage } from '@/lib/account-storage';

let accountTransitionCount = 0;
export function isAccountTransitionInProgress() { return accountTransitionCount > 0; }
export function beginAccountTransition() {
  accountTransitionCount += 1;
  let released = false;
  return () => { if (!released) { released = true; accountTransitionCount -= 1; } };
}

export async function logoutAccount() {
  const release = beginAccountTransition();
  try {
  await liveTrackingPlatform.transitionOwner(null);
  const { error } = await supabase.auth.signOut({scope:'local'});
  if (error) throw new Error('Déconnexion impossible. Réessaie avec une connexion réseau.');
  window.sessionStorage.removeItem('actyv.pendingToasts');
  // A document replacement destroys page state and pending UI callbacks.
  window.location.replace('/login');
  } catch (error) { release(); throw error; }
}

export async function purgeDeletedAccount(owner: string) {
  const { data: { session } } = await supabase.auth.getSession();
  await liveTrackingPlatform.transitionOwner(owner);
  await liveTrackingPlatform.purgeOwner(owner);
  purgeAccountStorage(window.localStorage, owner);
  purgeDeletedAuthStorage(window.localStorage, owner, AUTH_STORAGE_KEY);
  if (session?.user.id === owner) {
    await supabase.auth.stopAutoRefresh();
    const { error } = await supabase.auth.signOut({ scope: 'local' });
    if (error) throw new Error('Nettoyage Auth incomplet. Reessaie.');
  }
  window.sessionStorage.removeItem('actyv.pendingToasts');
  await liveTrackingPlatform.transitionOwner(null);
}
