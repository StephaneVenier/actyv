import { refreshUserBadges } from '@/lib/gamification';
import type { DailyStepsEntry, UpsertDailyStepsInput } from '@/lib/steps';
import { upsertDailyStepsEntry } from '@/lib/steps';

type HealthConnectPluginResult = {
  available?: boolean;
  sdkStatus?: number;
  needsUpdate?: boolean;
  granted?: boolean;
  message?: string | null;
  stepsCount?: number;
  distanceMeters?: number | null;
  walkRunDistanceMeters?: number | null;
  bikeDistanceMeters?: number | null;
  syncedAt?: string | null;
};

type HealthConnectPluginApi = {
  isHealthConnectAvailable(): Promise<HealthConnectPluginResult>;
  requestHealthPermissions(): Promise<HealthConnectPluginResult>;
  readTodayHealthData(): Promise<HealthConnectPluginResult>;
  syncTodayHealthData(): Promise<HealthConnectPluginResult>;
};

export type HealthConnectTodayData = {
  available: boolean;
  granted: boolean;
  message: string | null;
  stepsCount: number;
  distanceMeters: number | null;
  walkRunDistanceMeters: number | null;
  bikeDistanceMeters: number | null;
  syncedAt: string | null;
};

export type HealthConnectSyncResult = HealthConnectTodayData & {
  savedEntry: DailyStepsEntry | null;
  awardedBadgeCodes: string[];
};

type CapacitorCoreModule = typeof import('@capacitor/core');

let capacitorCorePromise: Promise<CapacitorCoreModule | null> | null = null;
let registeredHealthConnectPlugin: HealthConnectPluginApi | null = null;

async function getCapacitorCore() {
  if (typeof window === 'undefined') {
    return null;
  }

  if (!capacitorCorePromise) {
    capacitorCorePromise = import('@capacitor/core').catch((error) => {
      console.error('Failed to load Capacitor core:', error);
      return null;
    });
  }

  return capacitorCorePromise;
}

async function getHealthConnectPlugin() {
  if (registeredHealthConnectPlugin) {
    return registeredHealthConnectPlugin;
  }

  const capacitorCore = await getCapacitorCore();
  if (!capacitorCore) {
    return null;
  }

  if (capacitorCore.Capacitor.getPlatform() !== 'android') {
    return null;
  }

  registeredHealthConnectPlugin = capacitorCore.registerPlugin<HealthConnectPluginApi>('HealthConnect');
  return registeredHealthConnectPlugin;
}

function normalizeHealthData(result: HealthConnectPluginResult | null | undefined): HealthConnectTodayData {
  return {
    available: Boolean(result?.available),
    granted: Boolean(result?.granted),
    message: result?.message || null,
    stepsCount: Math.max(0, Math.trunc(Number(result?.stepsCount || 0))),
    distanceMeters:
      result?.distanceMeters === null || result?.distanceMeters === undefined
        ? null
        : Number(result.distanceMeters),
    walkRunDistanceMeters:
      result?.walkRunDistanceMeters === null || result?.walkRunDistanceMeters === undefined
        ? null
        : Number(result.walkRunDistanceMeters),
    bikeDistanceMeters:
      result?.bikeDistanceMeters === null || result?.bikeDistanceMeters === undefined
        ? null
        : Number(result.bikeDistanceMeters),
    syncedAt: result?.syncedAt || null,
  };
}

function createUnavailableHealthData(message: string): HealthConnectTodayData {
  return {
    available: false,
    granted: false,
    message,
    stepsCount: 0,
    distanceMeters: null,
    walkRunDistanceMeters: null,
    bikeDistanceMeters: null,
    syncedAt: null,
  };
}

export async function isHealthConnectAvailable(): Promise<HealthConnectTodayData> {
  const plugin = await getHealthConnectPlugin();
  if (!plugin) {
    return createUnavailableHealthData('Health Connect est disponible uniquement sur Android.');
  }

  try {
    const result = await plugin.isHealthConnectAvailable();
    return normalizeHealthData(result);
  } catch (error) {
    console.error('Health Connect availability check failed:', error);
    return createUnavailableHealthData('Health Connect est indisponible sur cet appareil.');
  }
}

export async function requestHealthPermissions(): Promise<HealthConnectTodayData> {
  const plugin = await getHealthConnectPlugin();
  if (!plugin) {
    return createUnavailableHealthData('Health Connect est disponible uniquement sur Android.');
  }

  try {
    const result = await plugin.requestHealthPermissions();
    return normalizeHealthData(result);
  } catch (error) {
    console.error('Health Connect permission request failed:', error);
    return createUnavailableHealthData('Impossible de demander les permissions Health Connect.');
  }
}

export async function readTodayHealthData(): Promise<HealthConnectTodayData> {
  const plugin = await getHealthConnectPlugin();
  if (!plugin) {
    return createUnavailableHealthData('Health Connect est disponible uniquement sur Android.');
  }

  try {
    const result = await plugin.readTodayHealthData();
    return normalizeHealthData(result);
  } catch (error) {
    console.error('Health Connect read failed:', error);
    return createUnavailableHealthData('Impossible de lire les donnees Health Connect.');
  }
}

export async function syncTodayHealthData(userId: string): Promise<HealthConnectSyncResult> {
  const readResult = await readTodayHealthData();

  if (!readResult.available) {
    return {
      ...readResult,
      savedEntry: null,
      awardedBadgeCodes: [],
    };
  }

  const hasReadableData =
    readResult.stepsCount > 0 ||
    readResult.distanceMeters !== null ||
    readResult.walkRunDistanceMeters !== null ||
    readResult.bikeDistanceMeters !== null;

  if (!hasReadableData) {
    return {
      ...readResult,
      message: 'Aucune donnee Health Connect disponible aujourd\'hui.',
      savedEntry: null,
      awardedBadgeCodes: [],
    };
  }

  if (!readResult.granted) {
    return {
      ...readResult,
      message: readResult.message || 'Permissions Health Connect manquantes.',
      savedEntry: null,
      awardedBadgeCodes: [],
    };
  }

  const now = new Date().toISOString();
  const upsertPayload: UpsertDailyStepsInput = {
    stepsCount: readResult.stepsCount,
    source: 'health_connect',
    syncedAt: readResult.syncedAt || now,
    distanceMeters: readResult.distanceMeters,
    walkRunDistanceMeters: readResult.walkRunDistanceMeters,
    bikeDistanceMeters: readResult.bikeDistanceMeters,
  };

  const savedEntry = await upsertDailyStepsEntry(userId, upsertPayload);
  const badgeResult = await refreshUserBadges(userId);

  return {
    ...readResult,
    syncedAt: upsertPayload.syncedAt,
    message: 'Synchronisation Health Connect terminee.',
    savedEntry,
    awardedBadgeCodes: badgeResult.awarded || [],
  };
}
