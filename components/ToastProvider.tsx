'use client';

import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

export type ToastTone = 'success' | 'celebrate' | 'info';

export type ToastInput = {
  message: string;
  tone?: ToastTone;
};

type ToastItem = ToastInput & {
  id: string;
};

const PENDING_TOASTS_KEY = 'actyv.pendingToasts';
const TOAST_DURATION_MS = 3000;

type ToastContextValue = {
  showToast: (toast: ToastInput) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

function readPendingToasts() {
  if (typeof window === 'undefined') return [];

  try {
    const raw = window.sessionStorage.getItem(PENDING_TOASTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writePendingToasts(toasts: ToastInput[]) {
  if (typeof window === 'undefined') return;
  window.sessionStorage.setItem(PENDING_TOASTS_KEY, JSON.stringify(toasts));
}

export function queuePendingToast(toast: ToastInput) {
  const existing = readPendingToasts();
  const alreadyQueued = existing.some(
    (item) => item.message === toast.message && (item.tone || 'success') === (toast.tone || 'success')
  );

  if (alreadyQueued) return;

  writePendingToasts([...existing, toast]);
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const timersRef = useRef<Record<string, number>>({});

  const dismissToast = useCallback((id: string) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));

    if (timersRef.current[id]) {
      window.clearTimeout(timersRef.current[id]);
      delete timersRef.current[id];
    }
  }, []);

  const showToast = useCallback(
    (toast: ToastInput) => {
      setToasts((current) => {
        const duplicate = current.some(
          (item) =>
            item.message === toast.message &&
            (item.tone || 'success') === (toast.tone || 'success')
        );

        if (duplicate) return current;

        const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const nextToast = { ...toast, tone: toast.tone || 'success', id };
        return [...current, nextToast];
      });
    },
    []
  );

  useEffect(() => {
    const pendingToasts = readPendingToasts();
    if (pendingToasts.length > 0) {
      pendingToasts.forEach((toast) => showToast(toast));
      writePendingToasts([]);
    }
  }, [showToast]);

  useEffect(() => {
    toasts.forEach((toast) => {
      if (timersRef.current[toast.id]) return;

      timersRef.current[toast.id] = window.setTimeout(() => {
        dismissToast(toast.id);
      }, TOAST_DURATION_MS);
    });
  }, [dismissToast, toasts]);

  useEffect(() => {
    return () => {
      Object.values(timersRef.current).forEach((timer) => window.clearTimeout(timer));
      timersRef.current = {};
    };
  }, []);

  const contextValue = useMemo(() => ({ showToast }), [showToast]);

  return (
    <ToastContext.Provider value={contextValue}>
      {children}

      <div className="toast-stack" aria-live="polite" aria-atomic="true">
        {toasts.map((toast) => (
          <div key={toast.id} className={`toast toast--${toast.tone || 'success'}`}>
            <span>{toast.message}</span>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);

  if (!context) {
    throw new Error('useToast must be used within ToastProvider');
  }

  return context;
}
