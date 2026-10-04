import { supabase } from '@/lib/supabase';
import { liveTrackingPlatform } from '@/lib/live-tracking/platform';
import { beginAccountTransition, purgeDeletedAccount } from '@/lib/account-lifecycle';
import { readAccountPurgeMarkers, removeAccountPurgeMarker, writeAccountPurgeMarker, type AccountPurgeMarker } from '@/lib/account-storage';

async function confirmMarker(marker: AccountPurgeMarker) {
  if (marker.confirmed) return true;
  const response = await fetch('/api/account/delete', { headers: { 'x-actyv-deletion-proof': marker.proof }, cache: 'no-store' });
  if (!response.ok) throw new Error('Connexion requise pour verifier la suppression du compte.');
  const result = await response.json();
  if (result.confirmed === true) {
    marker.confirmed = true;
    writeAccountPurgeMarker(window.localStorage, marker);
  }
  return marker.confirmed;
}

let purgeQueue: Promise<void> = Promise.resolve();
export function resumeAccountPurges() {
  purgeQueue = purgeQueue.catch(() => undefined).then(runAccountPurges);
  return purgeQueue;
}

async function runAccountPurges() {
  const release = beginAccountTransition();
  try {
    for (const marker of readAccountPurgeMarkers(window.localStorage)) {
      if (await confirmMarker(marker)) {
        await purgeDeletedAccount(marker.owner);
        removeAccountPurgeMarker(window.localStorage, marker.owner);
      }
    }
  } finally { release(); }
}

export async function requestAccountDeletion(owner: string, password?: string) {
  const release = beginAccountTransition();
  try {
    let marker = readAccountPurgeMarkers(window.localStorage).find(row => row.owner === owner);
    if (marker && await confirmMarker(marker)) {
      await purgeDeletedAccount(owner);
      removeAccountPurgeMarker(window.localStorage, owner);
      window.location.replace('/login');
      return;
    }
    const { data: { session }, error } = await supabase.auth.getSession();
    if (error || session?.user.id !== owner) throw new Error('Reconnecte-toi pour finaliser la suppression.');
    marker ??= { owner, proof: crypto.randomUUID(), confirmed: false };
    writeAccountPurgeMarker(window.localStorage, marker);
    await liveTrackingPlatform.transitionOwner(null);
    const response = await fetch('/api/account/delete', {
      method: 'POST', headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ password, purgeProof: marker.proof }),
    });
    const result = await response.json().catch(() => null);
    if (!response.ok || !result?.success) {
      if (!await confirmMarker(marker)) throw new Error(result?.error || 'Suppression non confirmee. Reessaie.');
    }
    writeAccountPurgeMarker(window.localStorage, { ...marker, confirmed: true });
    await purgeDeletedAccount(owner);
    removeAccountPurgeMarker(window.localStorage, owner);
    window.location.replace('/login');
  } finally { release(); }
}
