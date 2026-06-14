import { refreshUserBadges } from '@/lib/gamification';
import { upsertDailyStepsEntry } from '@/lib/steps';
import type { DailyStepsEntry } from '@/lib/steps';

type HealthConnectPluginResult = {
  available?: boolean;
  granted?: boolean;
  message?: string | null;
  stepsCount?: number;
  syncedAt?: string | null;
};

type HealthConnectPluginApi = {
  isHealthConnectAvailable(): Promise<HealthConnectPluginResult>;
  requestPermissions(): Promise<HealthConnectPluginResult>;
  readTodaySteps(): Promise<HealthConnectPluginResult>;
  syncTodaySteps(): Promise<HealthConnectPluginResult>;
  requestHealthPermissions?(): Promise<HealthConnectPluginResult>;
  readTodayHealthData?(): Promise<HealthConnectPluginResult>;
  syncTodayHealthData?(): Promise<HealthConnectPluginResult>;
};

type CapacitorWindow = Window & {
  Capacitor?: {
    getPlatform?: () => string;
    Plugins?: Record<string, HealthConnectPluginApi | undefined>;
  };
};

export type HealthConnectStepsData = {
  available: boolean;
  granted: boolean;
  message: string | null;
  stepsCount: number;
  syncedAt: string | null;
};

export type HealthConnectSyncResult = HealthConnectStepsData & {
  savedEntry: DailyStepsEntry | null;
  awardedBadgeCodes: string[];
};

function getHealthConnectPlugin() {
  if (typeof window === 'undefined') {
    return null;
  }

  const capacitorWindow = window as CapacitorWindow;
  const capacitor = capacitorWindow.Capacitor;
  const platform = capacitor?.getPlatform?.();

  if (!capacitor || platform !== 'android') {
    return null;
  }

  return capacitor.Plugins?.HealthConnect || null;
}

function normalizeHealthData(result: HealthConnectPluginResult | null | undefined): HealthConnectStepsData {
  return {
    available: Boolean(result?.available),
    granted: Boolean(result?.granted),
    message: result?.message || null,
    stepsCount: Math.max(0, Math.trunc(Number(result?.stepsCount || 0))),
    syncedAt: result?.syncedAt || null,
  };
}

function createUnavailableHealthData(message: string): HealthConnectStepsData {
  return {
    available: false,
    granted: false,
    message,
    stepsCount: 0,
    syncedAt: null,
  };
}

async function callPluginMethod(
  methodName: keyof HealthConnectPluginApi,
  unavailableMessage: string
): Promise<HealthConnectStepsData> {
  const plugin = getHealthConnectPlugin();
  if (!plugin) {
    return createUnavailableHealthData(unavailableMessage);
  }

  const method = plugin[methodName];
  if (typeof method !== 'function') {
    return createUnavailableHealthData('Health Connect est indisponible sur cet appareil.');
  }

  try {
    const result = await method.call(plugin);
    return normalizeHealthData(result);
  } catch (error) {
    console.error(`Health Connect ${String(methodName)} failed:`, error);
    return createUnavailableHealthData('Health Connect est indisponible sur cet appareil.');
  }
}

export async function isHealthConnectAvailable(): Promise<HealthConnectStepsData> {
  return callPluginMethod('isHealthConnectAvailable', 'Health Connect est disponible uniquement sur Android.');
}

export async function requestPermissions(): Promise<HealthConnectStepsData> {
  return callPluginMethod('requestPermissions', 'Health Connect est disponible uniquement sur Android.');
}

export async function readTodaySteps(): Promise<HealthConnectStepsData> {
  return callPluginMethod('readTodaySteps', 'Health Connect est disponible uniquement sur Android.');
}

export async function syncTodaySteps(userId: string): Promise<HealthConnectSyncResult> {
  const readResult = await callPluginMethod('syncTodaySteps', 'Health Connect est disponible uniquement sur Android.');

  if (!readResult.available) {
    return {
      ...readResult,
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

  const syncedAt = readResult.syncedAt || new Date().toISOString();

  try {
    const savedEntry = await upsertDailyStepsEntry(userId, {
      stepsCount: readResult.stepsCount,
      source: 'health_connect',
      syncedAt,
      distanceMeters: null,
      walkRunDistanceMeters: null,
      bikeDistanceMeters: null,
    });
    const badgeResult = await refreshUserBadges(userId);

    console.log('Health Connect disponible');
    console.log('Permissions accordees');
    console.log(`Pas recuperes: ${savedEntry.steps_count}`);
    console.log('Synchronisation reussie');

    return {
      ...readResult,
      message: 'Synchronisation Health Connect terminee.',
      syncedAt: savedEntry.synced_at || syncedAt,
      savedEntry,
      awardedBadgeCodes: badgeResult.awarded || [],
    };
  } catch (error) {
    console.error('Health Connect sync failed:', error);
    return {
      ...readResult,
      message: "Impossible de synchroniser Health Connect pour le moment.",
      savedEntry: null,
      awardedBadgeCodes: [],
    };
  }
}

export const requestHealthPermissions = requestPermissions;
export const readTodayHealthData = readTodaySteps;
export const syncTodayHealthData = syncTodaySteps;
