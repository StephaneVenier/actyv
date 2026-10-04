'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { AppShell } from '@/components/AppShell';
import { supabase } from '@/lib/supabase';

export default function ResetPasswordPage() {
  const [ready,setReady]=useState(false);
  const [password,setPassword]=useState('');
  const [confirmation,setConfirmation]=useState('');
  const [message,setMessage]=useState('Vérification du lien…');
  const [busy,setBusy]=useState(false);
  const [done,setDone]=useState(false);
  useEffect(()=>{
    let cancelled=false;
    let recoveryRecognized=false;
    const markReady=()=>{recoveryRecognized=true;if(!cancelled){setReady(true);setMessage('');}};
    const {data}=supabase.auth.onAuthStateChange((event:string)=>{if(event==='PASSWORD_RECOVERY') markReady();});
    void (async()=>{
      try {
        const params=new URLSearchParams(window.location.hash.slice(1));
        const query=new URLSearchParams(window.location.search);
        if(params.has('error')||query.has('error')) throw new Error('invalid');
        // This client uses implicit recovery; await SDK URL processing before inspecting it.
        const {data: session,error}=await supabase.auth.getSession();
        if(error) throw error;
        const proof=JSON.parse(window.sessionStorage.getItem('actyv.password-recovery')||'null');
        if(proof?.owner===session.session?.user.id && Date.now()-proof.at<10*60*1000) markReady();
        else if(query.get('code')) {
          const result=await supabase.auth.exchangeCodeForSession(query.get('code')!);
          if(result.error || result.data.redirectType!=='recovery') throw new Error('invalid');
          markReady();
        } else if(!cancelled && !recoveryRecognized) setMessage('Lien invalide, expiré ou déjà utilisé. Demande un nouveau lien.');
        window.history.replaceState(null,'','/reset-password');
      } catch { if(!cancelled){setReady(false);setMessage('Lien invalide, expiré ou déjà utilisé. Demande un nouveau lien.');} }
    })();
    return ()=>{cancelled=true;data.subscription.unsubscribe();};
  },[]);
  async function submit(event:React.FormEvent){
    event.preventDefault();if(busy||!ready)return;
    if(password.length<6||password!==confirmation){setMessage('Saisis deux mots de passe identiques, de 6 caractères minimum.');return;}
    setBusy(true);
    try {
      const {error}=await supabase.auth.updateUser({password});
      if(error) {setMessage('Changement refusé. Vérifie les règles du mot de passe ou demande un nouveau lien.');return;}
      window.sessionStorage.removeItem('actyv.password-recovery');
      const {error:logoutError}=await supabase.auth.signOut();
      if(logoutError){setMessage('Mot de passe modifié. Ferme ce navigateur puis reconnecte-toi dans Actyv.');}
      else setMessage('Mot de passe modifié. Reconnecte-toi dans l’application Actyv.');
      setReady(false);setDone(true);setPassword('');setConfirmation('');
    }catch{setMessage('Connexion indisponible. Réessaie.');}finally{setBusy(false);}
  }
  return <AppShell><section className="card stack" style={{maxWidth:520,margin:'0 auto'}}>
    <h1>Nouveau mot de passe</h1><p role="status">{message}</p>
    {ready&&!done&&<form onSubmit={submit} className="stack">
      <label>Nouveau mot de passe<input type="password" autoComplete="new-password" minLength={6} required value={password} onChange={e=>setPassword(e.target.value)}/></label>
      <label>Confirmation<input type="password" autoComplete="new-password" required value={confirmation} onChange={e=>setConfirmation(e.target.value)}/></label>
      <button className="button primary" disabled={busy}>Enregistrer</button>
    </form>}
    <Link href="/login">Se reconnecter</Link>{!ready&&!done&&<Link href="/forgot-password">Demander un nouveau lien</Link>}
  </section></AppShell>;
}
