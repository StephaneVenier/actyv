'use client';

import { useEffect } from 'react';

export function useScreenWakeLock(active: boolean) {
  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    let released = false;
    let wakeLockSentinel: { release?: () => Promise<void> } | null = null;

    const requestWakeLock = async () => {
      try {
        if (typeof navigator === 'undefined' || !('wakeLock' in navigator)) return;

        const wakeLockApi = (navigator as Navigator & {
          wakeLock?: { request: (type: 'screen') => Promise<{ release?: () => Promise<void> }> };
        }).wakeLock;

        if (!wakeLockApi || document.visibilityState !== 'visible' || !active) return;
        wakeLockSentinel = await wakeLockApi.request('screen');
      } catch {
        // ignore screen wake lock failures on unsupported platforms
      }
    };

    const releaseWakeLock = async () => {
      if (released) return;
      released = true;

      try {
        await wakeLockSentinel?.release?.();
      } catch {
        // ignore release failures
      }

      wakeLockSentinel = null;
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState !== 'visible') {
        void releaseWakeLock();
      } else if (active) {
        released = false;
        void requestWakeLock();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    if (active) {
      void requestWakeLock();
    }

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      void releaseWakeLock();
    };
  }, [active]);
}

