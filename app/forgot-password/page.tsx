'use client';

import Link from 'next/link';
import { useState } from 'react';
import { AppShell } from '@/components/AppShell';
import { supabase } from '@/lib/supabase';
import { ACTYV_AUTH_ORIGIN, RECOVERY_SENT_MESSAGE } from '@/lib/auth-navigation';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${ACTYV_AUTH_ORIGIN}/reset-password`,
      });
      setMessage(RECOVERY_SENT_MESSAGE);
    } catch { setMessage('Connexion indisponible. Réessaie.'); }
    finally { setBusy(false); }
  }
  return <AppShell><section className="card stack" style={{maxWidth:520,margin:'0 auto'}}>
    <h1>Mot de passe oublié</h1>
    <form onSubmit={submit} className="stack">
      <label>Email<input type="email" autoComplete="email" required value={email} onChange={e=>setEmail(e.target.value)} /></label>
      <button className="button primary" disabled={busy}>{busy?'Envoi…':'Envoyer le lien'}</button>
    </form>
    <p role="status">{message}</p><Link href="/login">Retour à la connexion</Link>
  </section></AppShell>;
}
