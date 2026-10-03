import type { LiveActivitySport, LiveGpsPoint } from '@/lib/live-tracking/types';
import type { NativeRecoverySession } from '@/lib/live-tracking/recovery';
import type {
  LiveTrackingListenerHandle,
  LiveTrackingPendingPointsResult,
  LiveTrackingPlatform,
  LiveTrackingPlatformStatus,
  LiveTrackingStartOptions,
  LiveTrackingPauseOptions,
  LiveTrackingResumeOptions,
  LiveTrackingStopOptions,
} from '@/lib/live-tracking/platform/types';

type LiveTrackingPluginResult = Partial<LiveTrackingPlatformStatus> & {
  points?: LiveGpsPoint[];
  blocked?: boolean;
  session?: NativeRecoverySession | null;
  recovery?: NativeRecoverySession | null;
};

type LiveTrackingPluginApi = {
  isAvailable?(): Promise<LiveTrackingPluginResult>;
  getTrackingStatus?(): Promise<LiveTrackingPluginResult>;
  checkPermissions?(): Promise<LiveTrackingPluginResult>;
  requestPermissions?(): Promise<LiveTrackingPluginResult>;
  startTracking?(options: LiveTrackingStartOptions): Promise<LiveTrackingPluginResult>;
  pauseTracking?(options: LiveTrackingPauseOptions): Promise<LiveTrackingPluginResult>;
  resumeTracking?(options: LiveTrackingResumeOptions): Promise<LiveTrackingPluginResult>;
  stopTracking?(options: LiveTrackingStopOptions): Promise<LiveTrackingPluginResult>;
  clearSession?(options: LiveTrackingStopOptions): Promise<LiveTrackingPluginResult>;
  getRecoverySession?(options: { ownerUserId: string }): Promise<LiveTrackingPluginResult>;
  recoverTracking?(options: LiveTrackingStopOptions): Promise<LiveTrackingPluginResult>;
  getPendingPoints?(options: {
    sessionId: string;
    afterSequence?: number;
  }): Promise<LiveTrackingPluginResult>;
  addListener?(
    eventName: 'locationUpdate' | 'trackingStatus' | 'trackingError',
    listenerFunc: (payload: any) => void
  ): Promise<LiveTrackingListenerHandle> | LiveTrackingListenerHandle;
};

type RuntimeCapacitor = {
  isNativePlatform?: () => boolean;
  getPlatform?: () => string;
  Plugins?: Record<string, LiveTrackingPluginApi | undefined>;
};

function getRuntimeCapacitor(): RuntimeCapacitor | null {
  if (typeof window === 'undefined') {
    return null;
  }

  return (window as any).Capacitor || null;
}

function getPlugin() {
  const runtime = getRuntimeCapacitor();
  if (!runtime?.Plugins) {
    return null;
  }

  return (
    runtime.Plugins.LiveTracking ||
    runtime.Plugins.LiveTrackingPlugin ||
    runtime.Plugins.liveTracking ||
    runtime.Plugins.livetracking ||
    null
  );
}

function isAndroidNative() {
  const runtime = getRuntimeCapacitor();
  if (!runtime) {
    return false;
  }

  const isNative =
    typeof runtime.isNativePlatform === 'function' ? runtime.isNativePlatform() : false;
  const platform = typeof runtime.getPlatform === 'function' ? runtime.getPlatform() : 'web';
  return isNative && platform === 'android';
}

function createDefaultStatus(
  overrides: Partial<LiveTrackingPlatformStatus> = {}
): LiveTrackingPlatformStatus {
  return {
    available: false,
    platform: 'web',
    trackingStatus: 'unavailable',
    permissionStatus: 'unknown',
    notificationPermissionStatus: 'unknown',
    gpsEnabled: false,
    serviceRunning: false,
    sessionId: null,
    sport: null,
    startedAtMs: null,
    pausedAtMs: null,
    accumulatedPausedMs: 0,
    lastSequence: 0,
    pointsRecorded: 0,
    message: null,
    ...overrides,
  };
}

function normalizeStatus(result?: LiveTrackingPluginResult | null): LiveTrackingPlatformStatus {
  if (!isAndroidNative()) {
    return createDefaultStatus({
      message: 'Suivi GPS natif disponible dans l’application Android.',
    });
  }

  if (!result) {
    return createDefaultStatus({
      available: Boolean(getPlugin()),
      platform: 'android',
      trackingStatus: getPlugin() ? 'idle' : 'unavailable',
      message: getPlugin()
        ? 'Application Android détectée.'
        : 'Plugin GPS natif indisponible dans cette version.',
    });
  }

  return createDefaultStatus({
    available: Boolean(result.available ?? true),
    platform: 'android',
    trackingStatus: result.trackingStatus ?? 'idle',
    permissionStatus: result.permissionStatus ?? 'unknown',
    notificationPermissionStatus: result.notificationPermissionStatus ?? 'unknown',
    gpsEnabled: Boolean(result.gpsEnabled),
    serviceRunning: Boolean(result.serviceRunning),
    sessionId: result.sessionId ?? null,
    sport: (result.sport as LiveActivitySport | null | undefined) ?? null,
    startedAtMs:
      typeof result.startedAtMs === 'number' ? result.startedAtMs : null,
    pausedAtMs: typeof result.pausedAtMs === 'number' ? result.pausedAtMs : null,
    accumulatedPausedMs:
      typeof result.accumulatedPausedMs === 'number' ? result.accumulatedPausedMs : 0,
    lastSequence: typeof result.lastSequence === 'number' ? result.lastSequence : 0,
    pointsRecorded: typeof result.pointsRecorded === 'number' ? result.pointsRecorded : 0,
    message: typeof result.message === 'string' ? result.message : null,
    finalizationVersion: result.finalizationVersion ?? 0,
    stoppedAtMs: result.stoppedAtMs ?? null,
    recoveryVersion: result.recoveryVersion ?? 0,
    ownerUserId: result.ownerUserId ?? null,
  });
}

function normalizePoint(payload: any): LiveGpsPoint | null {
  if (!payload || typeof payload.latitude !== 'number' || typeof payload.longitude !== 'number') {
    return null;
  }

  return {
    sessionId: typeof payload.sessionId === 'string' ? payload.sessionId : null,
    sequence: typeof payload.sequence === 'number' ? payload.sequence : null,
    trackingPaused: typeof payload.trackingPaused === 'boolean' ? payload.trackingPaused : undefined,
    latitude: payload.latitude,
    longitude: payload.longitude,
    altitude: typeof payload.altitude === 'number' ? payload.altitude : null,
    accuracy: typeof payload.accuracy === 'number' ? payload.accuracy : null,
    altitudeAccuracy:
      typeof payload.altitudeAccuracy === 'number' ? payload.altitudeAccuracy : null,
    speed: typeof payload.speed === 'number' ? payload.speed : null,
    heading: typeof payload.heading === 'number' ? payload.heading : null,
    timestamp:
      typeof payload.timestamp === 'number' ? payload.timestamp : Date.now(),
  };
}

async function callPluginMethod<T>(
  methodName: keyof LiveTrackingPluginApi,
  payload?: T
): Promise<LiveTrackingPluginResult | null> {
  if (!isAndroidNative()) {
    return null;
  }

  const plugin = getPlugin();
  const method = plugin?.[methodName];
  if (!plugin || typeof method !== 'function') {
    return null;
  }

  try {
    const callable = method as (arg?: T) => Promise<LiveTrackingPluginResult>;
    return await callable.call(plugin, payload);
  } catch (error) {
    console.error(`Live tracking plugin ${String(methodName)} failed:`, error);
    throw error;
  }
}

async function addPluginListener(
  eventName: 'locationUpdate' | 'trackingStatus' | 'trackingError',
  listener: (payload: any) => void
) {
  if (!isAndroidNative()) {
    return null;
  }

  const plugin = getPlugin();
  if (!plugin?.addListener) {
    return null;
  }

  const handle = await plugin.addListener(eventName, listener);
  return handle || null;
}

let currentOwnerUserId: string | null = null;

export const liveTrackingPlatform: LiveTrackingPlatform = {
  setOwner(ownerUserId) { currentOwnerUserId = ownerUserId; },
  async getRecoverySession(ownerUserId) {
    if (!isAndroidNative()) return { session: null };
    if (!getPlugin()?.getRecoverySession) throw new Error('Mets a jour l’application Android pour recuperer les Lives.');
    const result = await callPluginMethod('getRecoverySession', { ownerUserId });
    if (!result) throw new Error('Recuperation native indisponible. Les donnees sont conservees.');
    return result;
  },
  async recoverTracking(sessionId) {
    if (!getPlugin()?.recoverTracking) throw new Error('Reprise native indisponible. Mets a jour l’application.');
    return normalizeStatus(await callPluginMethod('recoverTracking', { sessionId, ownerUserId: currentOwnerUserId }));
  },
  isAvailable() {
    return isAndroidNative() && Boolean(getPlugin());
  },

  async getStatus() {
    return normalizeStatus(await callPluginMethod('getTrackingStatus'));
  },

  async checkPermissions() {
    return normalizeStatus(await callPluginMethod('checkPermissions'));
  },

  async requestPermissions() {
    return normalizeStatus(await callPluginMethod('requestPermissions'));
  },

  async startTracking(options: LiveTrackingStartOptions) {
    return normalizeStatus(await callPluginMethod('startTracking', options));
  },

  async pauseTracking(options: LiveTrackingPauseOptions) {
    return normalizeStatus(await callPluginMethod('pauseTracking', { ...options, ownerUserId: currentOwnerUserId }));
  },

  async resumeTracking(options: LiveTrackingResumeOptions) {
    return normalizeStatus(await callPluginMethod('resumeTracking', { ...options, ownerUserId: currentOwnerUserId }));
  },

  async stopTracking(options: LiveTrackingStopOptions) {
    const status = await this.getStatus();
    if (status.finalizationVersion !== 1) {
      throw new Error('Mets a jour l’application Android pour enregistrer les Lives sans perdre les derniers points.');
    }
    const stopped = normalizeStatus(await callPluginMethod('stopTracking', { ...options, ownerUserId: currentOwnerUserId }));
    if (stopped.trackingStatus !== 'stopped' || stopped.serviceRunning) {
      throw new Error('Le suivi GPS n’est pas encore arrete. Reessaie.');
    }
    return stopped;
  },

  async clearSession(sessionId: string) {
    if (isAndroidNative() && !getPlugin()?.clearSession) throw new Error('Nettoyage natif indisponible.');
    await callPluginMethod('clearSession', { sessionId, ownerUserId: currentOwnerUserId });
  },

  async getPendingPoints(
    sessionId: string,
    afterSequence: number = 0
  ): Promise<LiveTrackingPendingPointsResult> {
    const result = await callPluginMethod('getPendingPoints', {
      sessionId,
      afterSequence,
      ownerUserId: currentOwnerUserId,
    });

    const rawPoints = Array.isArray(result?.points) ? result.points : [];

    return {
      sessionId: typeof result?.sessionId === 'string' ? result.sessionId : sessionId,
      lastSequence: typeof result?.lastSequence === 'number' ? result.lastSequence : afterSequence,
      points: rawPoints.map(normalizePoint).filter((point): point is LiveGpsPoint => Boolean(point)),
      recovery: result?.recovery ?? null,
    };
  },

  async addLocationListener(listener) {
    return addPluginListener('locationUpdate', (payload) => {
      const point = normalizePoint(payload);
      if (point) {
        listener(point);
      }
    });
  },

  async addStatusListener(listener) {
    return addPluginListener('trackingStatus', (payload) => {
      listener(normalizeStatus(payload));
    });
  },

  async addErrorListener(listener) {
    return addPluginListener('trackingError', (payload) => {
      const message =
        typeof payload?.message === 'string'
          ? payload.message
          : 'Erreur native de suivi GPS.';
      listener(message);
    });
  },
};

export * from '@/lib/live-tracking/platform/types';
