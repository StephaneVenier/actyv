import type { Route } from 'next';

export const ACTYV_AUTH_ORIGIN = 'https://a-ctyv.fr';

export function safeLocalRedirect(value: string | null, fallback: Route = '/'): Route {
  if (!value || !value.startsWith('/') || value.startsWith('//')) return fallback;
  try {
    const decoded = decodeURIComponent(value);
    if (/[\\\u0000-\u0020]/.test(decoded) || decoded.startsWith('//')) return fallback;
    const url = new URL(value, ACTYV_AUTH_ORIGIN);
    return (url.origin === ACTYV_AUTH_ORIGIN ? value : fallback) as Route;
  } catch { return fallback; }
}

export const RECOVERY_SENT_MESSAGE = 'Si un compte correspond à cette adresse, un email de récupération a été envoyé.';
