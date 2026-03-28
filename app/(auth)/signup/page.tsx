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
    });

    if (error || !data.user) {
      setMessage(error?.message || "Erreur lors de l'inscription.");
      setLoading(false);
      return;
    }

    await supabase.from('profiles').insert({
      id: data.user.id,
      email: email,
      username: username,
    });

    setMessage('Compte créé avec succès.');

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
            />
          </div>

          <div className="field">
            <label>Mot de passe</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
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