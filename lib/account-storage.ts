export function workoutStorageKey(kind: 'live' | 'completed', owner: string | null, session: string) {
  return owner ? `actyv.account.${owner}.session.${kind}.${session}` : null;
}

export function readOwnedSnapshot<T extends { ownerUserId?: string }>(storage: Storage, key: string | null, owner: string | null): T | null {
  if (!key || !owner) return null;
  try {
    const value = JSON.parse(storage.getItem(key) || 'null');
    return value?.ownerUserId === owner ? value : null;
  } catch { return null; }
}

export function purgeAccountStorage(storage: Storage, owner: string) {
  const keys = Array.from({ length: storage.length }, (_, i) => storage.key(i)).filter((key): key is string => !!key);
  for (const key of keys) {
    if (key.startsWith(`actyv.account.${owner}.`) || key.startsWith('actyv.session.')) storage.removeItem(key);
  }
  const checkpoint = storage.getItem('actyv-live-tracking-v1');
  if (checkpoint) {
    const parsed = JSON.parse(checkpoint);
    if (parsed?.state?.ownerUserId === owner) storage.removeItem('actyv-live-tracking-v1');
  }
  const outbox = storage.getItem('actyv-live-activity-outbox-v1');
  if (outbox) {
    const rows = JSON.parse(outbox);
    if (!Array.isArray(rows)) throw new Error('Nettoyage local incomplet.');
    storage.setItem('actyv-live-activity-outbox-v1', JSON.stringify(rows.filter(row => row.ownerUserId !== owner)));
  }
}

export function purgeDeletedAuthStorage(storage: Storage, owner: string, key: string | null) {
  if (!key) return;
  const raw = storage.getItem(key);
  if (!raw) return;
  const session = JSON.parse(raw);
  if (session?.user?.id !== owner) return;
  storage.removeItem(key);
  storage.removeItem(`${key}-code-verifier`);
}

export type AccountPurgeMarker = { owner: string; proof: string; confirmed: boolean };
const PURGE_MARKERS_KEY = 'actyv-account-deletions-v1';
export function readAccountPurgeMarkers(storage: Storage): AccountPurgeMarker[] {
  const rows = JSON.parse(storage.getItem(PURGE_MARKERS_KEY) || '[]');
  if (!Array.isArray(rows) || rows.some(row => typeof row?.owner !== 'string' || typeof row?.proof !== 'string' || typeof row?.confirmed !== 'boolean')) {
    throw new Error('Etat de nettoyage local invalide.');
  }
  return rows;
}
export function writeAccountPurgeMarker(storage: Storage, marker: AccountPurgeMarker) {
  storage.setItem(PURGE_MARKERS_KEY, JSON.stringify([...readAccountPurgeMarkers(storage).filter(row => row.owner !== marker.owner), marker]));
}
export function removeAccountPurgeMarker(storage: Storage, owner: string) {
  const remaining = readAccountPurgeMarkers(storage).filter(row => row.owner !== owner);
  if (remaining.length) storage.setItem(PURGE_MARKERS_KEY, JSON.stringify(remaining));
  else storage.removeItem(PURGE_MARKERS_KEY);
}
