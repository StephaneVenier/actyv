'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AppShell } from '@/components/AppShell';
import { supabase } from '@/lib/supabase';
import Link from 'next/link';
import { safeLocalRedirect } from '@/lib/auth-navigation';

export default function LoginPage() {
  const router = useRouter();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  const redirectTo = useMemo(() => {
    if (typeof window === 'undefined') {
      return '/';
    }
    const nextValue = new URLSearchParams(window.location.search).get('redirectTo');
    return safeLocalRedirect(nextValue);
  }, []);

  const handleLogin = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setMessage('');
    setLoading(true);

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        setMessage('Connexion impossible. Vérifie tes identifiants et la confirmation de ton email.');
        return;
      }

      router.replace(redirectTo);
      router.refresh();
    } catch (err) {
      console.error('Erreur connexion :', err);
      setMessage('Une erreur est survenue pendant la connexion.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AppShell>
      <div className="card stack" style={{ maxWidth: 520, margin: '0 auto' }}>
        <h1 style={{ margin: 0 }}>Connexion</h1>

        <form onSubmit={handleLogin} className="stack">
          <div className="field">
            <label>Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Votre email"
              required
            />
          </div>

          <div className="field">
            <label>Mot de passe</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Votre mot de passe"
              required
            />
          </div>

          {message && (
            <p style={{ margin: 0, color: 'crimson' }}>
              {message}
            </p>
          )}

          <button type="submit" disabled={loading} className="button primary">
            {loading ? 'Connexion...' : 'Se connecter'}
          </button>
        </form>
        <Link href="/forgot-password">Mot de passe oublié ?</Link>
      </div>
    </AppShell>
  );
}
