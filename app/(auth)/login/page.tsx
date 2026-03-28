'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { AppShell } from '@/components/AppShell';
import { supabase } from '@/lib/supabase';

export default function LoginPage() {
  const router = useRouter();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

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
        setMessage(error.message);
        return;
      }

      router.replace('/');
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
      </div>
    </AppShell>
  );
}