import { refreshUserBadges } from '@/lib/gamification';
import { upsertDailyStepsEntry } from '@/lib/steps';
import type { DailyStepsEntry } from '@/lib/steps';

type HealthConnectPluginResult = {
  available?: boolean;
  granted?: boolean;
  message?: string | null;
  stepsCount?: number;
  syncedAt?: string | null;
  androidError?: string | null;
  jsError?: string | null;
  supabaseError?: string | null;
  status?:
    | 'web_unavailable'
    | 'android_detected'
    | 'health_connect_plugin_missing'
    | 'health_connect_available'
    | 'permissions_granted';
};

type HealthConnectPluginApi = {
  isAvailable?(): Promise<HealthConnectPluginResult>;
  isHealthConnectAvailable(): Promise<HealthConnectPluginResult>;
  requestPermissions(): Promise<HealthConnectPluginResult>;
  readTodaySteps(): Promise<HealthConnectPluginResult>;
  syncTodaySteps(): Promise<HealthConnectPluginResult>;
  requestHealthPermissions?(): Promise<HealthConnectPluginResult>;
  readTodayHealthData?(): Promise<HealthConnectPluginResult>;
  syncTodayHealthData?(): Promise<HealthConnectPluginResult>;
  openHealthConnectSettings?(): Promise<HealthConnectPluginResult>;
};

type RuntimeCapacitor = {
  isNativePlatform?: () => boolean;
  getPlatform?: () => string;
  Plugins?: Record<string, HealthConnectPluginApi | undefined>;
};

export type HealthConnectStatus =
  | 'web_unavailable'
  | 'android_detected'
  | 'health_connect_plugin_missing'
  | 'health_connect_available'
  | 'permissions_granted';

export type HealthConnectDebugInfo = {
  readTodayStepsResponse: string | null;
  androidError: string | null;
  jsError: string | null;
  supabaseError: string | null;
};

export type HealthConnectStepsData = {
  status: HealthConnectStatus;
  available: boolean;
  granted: boolean;
  message: string | null;
  stepsCount: number;
  syncedAt: string | null;
  debug: HealthConnectDebugInfo;
};

export type HealthConnectSyncResult = HealthConnectStepsData & {
  savedEntry: DailyStepsEntry | null;
  awardedBadgeCodes: string[];
};

let hasLoggedCapacitorPlugins = false;

function createDebugInfo(overrides: Partial<HealthConnectDebugInfo> = {}): HealthConnectDebugInfo {
  return {
    readTodayStepsResponse: overrides.readTodayStepsResponse ?? null,
    androidError: overrides.androidError ?? null,
    jsError: overrides.jsError ?? null,
    supabaseError: overrides.supabaseError ?? null,
  };
}

function serializeDebugValue(value: unknown) {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === 'string') {
    return value;
  }

  try {
    return JSON.stringify(value, null, 2);
  } catch (error) {
    return String(value);
  }
}

function getRuntimeCapacitor(): RuntimeCapacitor | null {
  if (typeof window === 'undefined') {
    return null;
  }

  return (window as any).Capacitor || null;
}

function getPlatform() {
  const runtime = getRuntimeCapacitor();
  return runtime?.getPlatform?.() || 'web';
}

function isNativePlatform() {
  const runtime = getRuntimeCapacitor();
  if (typeof runtime?.isNativePlatform === 'function') {
    return runtime.isNativePlatform();
  }

  return getPlatform() !== 'web';
}

function getHealthConnectPlugin() {
  if (typeof window === 'undefined' || !isNativePlatform()) {
    return null;
  }

  const runtime = getRuntimeCapacitor();
  const plugins = runtime?.Plugins || {};

  if (!hasLoggedCapacitorPlugins) {
    console.log('Capacitor plugins:', Object.keys(plugins));
    hasLoggedCapacitorPlugins = true;
  }

  return (
    plugins.HealthConnect ||
    plugins.HealthConnectPlugin ||
    plugins.healthConnect ||
    plugins.healthconnect ||
    null
  );
}

function createHealthData(
  status: HealthConnectStatus,
  message: string,
  overrides: Partial<Pick<HealthConnectStepsData, 'available' | 'granted' | 'stepsCount' | 'syncedAt'>> = {},
  debugOverrides: Partial<HealthConnectDebugInfo> = {}
): HealthConnectStepsData {
  return {
    status,
    available:
      overrides.available ??
      (status === 'android_detected' ||
        status === 'health_connect_available' ||
        status === 'permissions_granted'),
    granted: overrides.granted ?? status === 'permissions_granted',
    message,
    stepsCount: overrides.stepsCount ?? 0,
    syncedAt: overrides.syncedAt ?? null,
    debug: createDebugInfo(debugOverrides),
  };
}

function normalizeHealthData(
  result: HealthConnectPluginResult | null | undefined,
  fallbackStatus: HealthConnectStatus
): HealthConnectStepsData {
  const status = result?.status || fallbackStatus;
  const available =
    status === 'android_detected' || status === 'health_connect_available' || status === 'permissions_granted'
      ? true
      : Boolean(result?.available);
  const granted = status === 'permissions_granted' ? true : Boolean(result?.granted);

  return {
    status,
    available,
    granted,
    message: result?.message || null,
    stepsCount: Math.max(0, Math.trunc(Number(result?.stepsCount || 0))),
    syncedAt: result?.syncedAt || null,
    debug: createDebugInfo({
      androidError: result?.androidError || null,
      jsError: result?.jsError || null,
      supabaseError: result?.supabaseError || null,
    }),
  };
}

async function callPluginMethod(
  methodName: keyof HealthConnectPluginApi,
  fallbackStatus: HealthConnectStatus
): Promise<HealthConnectStepsData> {
  if (typeof window === 'undefined') {
    return createHealthData('web_unavailable', 'Health Connect est disponible uniquement sur Android.');
  }

  const capacitor = (window as any).Capacitor;
  const platform = capacitor?.getPlatform?.();
  const isNative = Boolean(capacitor?.isNativePlatform?.());

  if (!capacitor || (!isNative && platform !== 'android')) {
    return createHealthData('web_unavailable', 'Health Connect est disponible uniquement sur Android.');
  }

  const plugin = getHealthConnectPlugin();
  if (!plugin) {
    return createHealthData(
      'health_connect_plugin_missing',
      'Application Android detectee. Connexion Health Connect a configurer.'
    );
  }

  const method = plugin[methodName];
  if (typeof method !== 'function') {
    return createHealthData(
      'health_connect_plugin_missing',
      'Application Android detectee. Connexion Health Connect a configurer.'
    );
  }

  try {
    const result = await method.call(plugin);
    return normalizeHealthData(result, fallbackStatus);
  } catch (error) {
    console.error(`Health Connect ${String(methodName)} failed:`, error);
    return createHealthData(
      'health_connect_plugin_missing',
      'Application Android detectee. Connexion Health Connect a configurer.',
      {},
      { jsError: serializeDebugValue(error) }
    );
  }
}

export async function isHealthConnectAvailable(): Promise<HealthConnectStepsData> {
  if (typeof window === 'undefined') {
    return createHealthData('web_unavailable', 'Health Connect est disponible uniquement sur Android.');
  }

  const capacitor = (window as any).Capacitor;
  const platform = capacitor?.getPlatform?.();
  const isNative = Boolean(capacitor?.isNativePlatform?.());

  if (!capacitor || (!isNative && platform !== 'android')) {
    return createHealthData('web_unavailable', 'Health Connect est disponible uniquement sur Android.');
  }

  const plugin = getHealthConnectPlugin();
  if (!plugin) {
    return createHealthData(
      'health_connect_plugin_missing',
      'Application Android detectee. Connexion Health Connect a configurer.'
    );
  }

  try {
    const availabilityMethod = plugin.isAvailable || plugin.isHealthConnectAvailable;
    const result = await availabilityMethod.call(plugin);
    return normalizeHealthData(result, result?.available ? 'health_connect_available' : 'android_detected');
  } catch (error) {
    console.error('Health Connect availability check failed:', error);
    return createHealthData(
      'health_connect_plugin_missing',
      'Application Android detectee. Connexion Health Connect a configurer.',
      {},
      { jsError: serializeDebugValue(error) }
    );
  }
}

export async function requestPermissions(): Promise<HealthConnectStepsData> {
  return callPluginMethod('requestPermissions', 'android_detected');
}

export async function readTodaySteps(): Promise<HealthConnectStepsData> {
  return callPluginMethod('readTodaySteps', 'health_connect_available');
}

export async function syncTodaySteps(userId: string): Promise<HealthConnectSyncResult> {
  console.log('syncTodayHealthData called');
  console.log('user id =', userId);
  const readResult = await callPluginMethod('readTodaySteps', 'health_connect_available');
  console.log('plugin response =', readResult);
  const rawReadTodayStepsResponse = serializeDebugValue(readResult);
  const debug = {
    ...readResult.debug,
    readTodayStepsResponse: rawReadTodayStepsResponse,
  };

  if (readResult.status === 'web_unavailable' || readResult.status === 'health_connect_plugin_missing') {
    return {
      ...readResult,
      debug,
      savedEntry: null,
      awardedBadgeCodes: [],
    };
  }

  if (readResult.status === 'android_detected') {
    return {
      ...readResult,
      debug,
      savedEntry: null,
      awardedBadgeCodes: [],
    };
  }

  if (!readResult.granted) {
    return {
      ...readResult,
      debug,
      message: readResult.message || 'Permissions Health Connect manquantes.',
      savedEntry: null,
      awardedBadgeCodes: [],
    };
  }

  const syncedAt = readResult.syncedAt || new Date().toISOString();

  try {
    console.log('steps received =', readResult.stepsCount);
    console.log('upsert daily_steps started');
    const savedEntry = await upsertDailyStepsEntry(userId, {
      stepsCount: readResult.stepsCount,
      source: 'health_connect',
      syncedAt,
      distanceMeters: null,
      walkRunDistanceMeters: null,
      bikeDistanceMeters: null,
    });
    console.log('upsert daily_steps success =', savedEntry);
    const badgeResult = await refreshUserBadges(userId);

    console.log('Health Connect disponible');
    console.log('Permissions accordees');
    console.log(`Pas recuperes: ${savedEntry.steps_count}`);
    console.log('Synchronisation reussie');

    return {
      ...readResult,
      debug,
      status: 'permissions_granted',
      available: true,
      granted: true,
      message: 'Synchronisation Health Connect terminee.',
      syncedAt: savedEntry.synced_at || syncedAt,
      savedEntry,
      awardedBadgeCodes: badgeResult.awarded || [],
    };
  } catch (error) {
    const supabaseError = serializeDebugValue(error);
    console.error('upsert daily_steps error =', error);
    console.error('Health Connect sync failed:', error);
    return {
      ...readResult,
      debug: {
        ...debug,
        supabaseError,
      },
      message: 'Impossible de synchroniser Health Connect pour le moment.',
      savedEntry: null,
      awardedBadgeCodes: [],
    };
  }
}

export async function openHealthConnectSettings(): Promise<HealthConnectStepsData> {
  return callPluginMethod('openHealthConnectSettings', 'health_connect_available');
}

export const requestHealthPermissions = requestPermissions;
export const readTodayHealthData = readTodaySteps;
export const syncTodayHealthData = syncTodaySteps;
