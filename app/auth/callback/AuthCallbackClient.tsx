'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { AppShell } from '@/components/AppShell';
import { supabase } from '@/lib/supabase';

type CallbackState = 'loading' | 'success' | 'error';

export function AuthCallbackClient() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [state, setState] = useState<CallbackState>('loading');
  const [message, setMessage] = useState('Validation de votre compte en cours...');

  const errorMessage = useMemo(() => {
    const directError =
      searchParams.get('error_description') ||
      searchParams.get('error') ||
      searchParams.get('message');

    return directError ? decodeURIComponent(directError.replace(/\+/g, ' ')) : '';
  }, [searchParams]);

  useEffect(() => {
    let cancelled = false;

    const finishWithError = (text: string) => {
      if (cancelled) return;
      setState('error');
      setMessage(text);
    };

    const finishWithSuccess = (text: string) => {
      if (cancelled) return;
      setState('success');
      setMessage(text);

      window.setTimeout(() => {
        router.replace('/profile');
        router.refresh();
      }, 1200);
    };

    const handleCallback = async () => {
      if (errorMessage) {
        finishWithError(errorMessage);
        return;
      }

      try {
        const code = searchParams.get('code');

        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);

          if (error) {
            finishWithError(error.message || 'Le lien de confirmation est invalide ou expire.');
            return;
          }

          finishWithSuccess('Compte verifie. Redirection en cours...');
          return;
        }

        const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
        const accessToken = hashParams.get('access_token');
        const refreshToken = hashParams.get('refresh_token');
        const hashError = hashParams.get('error_description') || hashParams.get('error');

        if (hashError) {
          finishWithError(decodeURIComponent(hashError.replace(/\+/g, ' ')));
          return;
        }

        if (accessToken && refreshToken) {
          const { error } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });

          if (error) {
            finishWithError(error.message || 'Impossible de finaliser la connexion.');
            return;
          }

          finishWithSuccess('Connexion confirmee. Redirection en cours...');
          return;
        }

        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (session) {
          finishWithSuccess('Connexion confirmee. Redirection en cours...');
          return;
        }

        finishWithError('Lien de confirmation invalide ou deja utilise.');
      } catch (error) {
        console.error('Erreur callback auth :', error);
        finishWithError('Une erreur est survenue pendant la confirmation du compte.');
      }
    };

    handleCallback();

    return () => {
      cancelled = true;
    };
  }, [errorMessage, router, searchParams]);

  return (
    <AppShell>
      <div className="card stack" style={{ maxWidth: 560, margin: '0 auto', textAlign: 'center' }}>
        <div
          aria-hidden="true"
          style={{
            width: 56,
            height: 56,
            margin: '0 auto',
            borderRadius: '50%',
            background:
              state === 'error'
                ? 'rgba(239, 68, 68, 0.12)'
                : 'rgba(76, 217, 100, 0.14)',
            display: 'grid',
            placeItems: 'center',
            fontSize: '1rem',
            fontWeight: 700,
            letterSpacing: '0.04em',
          }}
        >
          {state === 'error' ? 'ERR' : 'OK'}
        </div>

        <h1 style={{ margin: 0 }}>
          {state === 'loading'
            ? 'Confirmation en cours'
            : state === 'success'
              ? 'Compte confirme'
              : 'Confirmation impossible'}
        </h1>

        <p style={{ margin: 0, color: '#475569' }}>{message}</p>

        {state === 'loading' && (
          <div
            aria-hidden="true"
            style={{
              width: 36,
              height: 36,
              margin: '8px auto 0',
              borderRadius: '50%',
              border: '3px solid rgba(30, 107, 214, 0.16)',
              borderTopColor: '#1e6bd6',
              animation: 'spin 0.9s linear infinite',
            }}
          />
        )}

        {state === 'error' && (
          <div style={{ display: 'flex', justifyContent: 'center', gap: 12, flexWrap: 'wrap' }}>
            <Link href="/login" className="button primary">
              Aller a la connexion
            </Link>
            <Link href="/" className="button secondary">
              Retour a l&apos;accueil
            </Link>
          </div>
        )}
      </div>
    </AppShell>
  );
}
