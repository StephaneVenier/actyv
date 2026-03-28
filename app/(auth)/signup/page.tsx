'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { AppShell } from '@/components/AppShell';
import { supabase } from '@/lib/supabase';

export default function SignupPage() {
  const router = useRouter();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const handleSignup = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setMessage('');

    if (!email || !password || !username) {
      setMessage('Tous les champs sont obligatoires.');
      return;
    }

    setLoading(true);

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: 'https://actyv-iota.vercel.app/auth/callback',
      },
    });

    if (error || !data.user) {
      setMessage(error?.message || "Erreur lors de l'inscription.");
      setLoading(false);
      return;
    }

    const { error: profileError } = await supabase.from('profiles').insert({
      id: data.user.id,
      email,
      username,
    });

    if (profileError) {
      setMessage("Compte créé, mais erreur lors de l'enregistrement du profil.");
      setLoading(false);
      return;
    }

    setMessage('Compte créé avec succès.');
    setLoading(false);

    router.push('/login');
  };

  return (
    <AppShell>
      <div className="card">
        <h1>Créer un compte</h1>

        <form onSubmit={handleSignup} className="form-grid">
          <div className="field">
            <label>Pseudo</label>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="StephRun"
            />
          </div>

          <div className="field">
            <label>Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="ton@email.com"
            />
          </div>

          <div className="field">
            <label>Mot de passe</label>
            <div style={{ position: 'relative' }}>
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Mot de passe"
                style={{ paddingRight: '44px', width: '100%' }}
              />

              <button
                type="button"
                onClick={() => setShowPassword((prev) => !prev)}
                aria-label={showPassword ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
                style={{
                  position: 'absolute',
                  right: '10px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: '1rem',
                }}
              >
                {showPassword ? '🙈' : '👁️'}
              </button>
            </div>
          </div>

          {message && <p>{message}</p>}

          <button type="submit" disabled={loading}>
            {loading ? 'Création...' : 'Créer mon compte'}
          </button>
        </form>
      </div>
    </AppShell>
  );
}