'use client';

import Link from 'next/link';
import { ReactNode, useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';

type Profile = {
  username: string | null;
};

export function AppShell({ children }: { children: ReactNode }) {
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [username, setUsername] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const loadUser = async () => {
      try {
        const {
          data: { user },
          error: userError,
        } = await supabase.auth.getUser();

        if (userError) {
          console.error('Erreur getUser :', userError);
          setUserEmail(null);
          setUsername(null);
          return;
        }

        if (!user) {
          setUserEmail(null);
          setUsername(null);
          return;
        }

        const email = user.email || null;
        setUserEmail(email);

        if (!email) {
          setUsername(null);
          return;
        }

        const { data, error: profileError } = await supabase
          .from('profiles')
          .select('username')
          .eq('email', email)
          .maybeSingle<Profile>();

        if (profileError) {
          console.error('Erreur chargement profil :', profileError);
          setUsername(null);
          return;
        }

        setUsername(data?.username || null);
      } catch (err) {
        console.error('Erreur AppShell :', err);
        setUserEmail(null);
        setUsername(null);
      }
    };

    loadUser();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(() => {
      loadUser();
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (!menuRef.current) return;
      if (!menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setMenuOpen(false);
    window.location.href = '/login';
  };

  const profileLabel = username || userEmail || 'Mon profil';

  return (
    <div className="app-shell">
      <header className="topbar">
  <div className="topbar-inner">
    <div className="topbar-left">
      <nav className="nav desktop-nav">
        <Link href="/">Accueil</Link>
        <Link href="/challenges/new" className="button primary">
          Créer un challenge
        </Link>
        <Link href="/activities/new">Ajouter une activité</Link>
      </nav>
    </div>

    <Link href="/" className="brand" aria-label="Retour à l'accueil Actyv">
      <img
        src="/images/actyv-logo.png"
        alt="Actyv"
        className="brand-logo"
      />
    </Link>

    <div className="topbar-right">
      {!userEmail ? (
        <div className="auth-actions">
          <Link href="/login" className="button ghost">
            Connexion
          </Link>
          <Link href="/signup" className="button primary desktop-only">
            Créer un compte
          </Link>
        </div>
      ) : (
        <div ref={menuRef} className="profile-menu-wrap">
          <button
            type="button"
            onClick={() => setMenuOpen((prev) => !prev)}
            className="profile-trigger"
          >
            <span className="profile-trigger-text">{profileLabel}</span>
            <span className="profile-trigger-arrow">▾</span>
          </button>

          {menuOpen && (
            <div className="profile-dropdown">
              <Link
                href="/profile"
                onClick={() => setMenuOpen(false)}
                className="profile-dropdown-link"
              >
                Mon profil
              </Link>

              <button
                type="button"
                onClick={handleLogout}
                className="profile-dropdown-button"
              >
                Déconnexion
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  </div>
</header>

      <main className="page-content">{children}</main>

      <div className="bottom-bar">
        <Link
          href="/challenges/new"
          className="bottom-btn"
          aria-label="Créer un challenge"
        >
          <span className="bottom-btn-icon">🏆</span>
          <span className="bottom-btn-label">Challenge</span>
        </Link>

        <div className="bottom-bar-center-space" />

        <Link
          href="/activities/new"
          className="bottom-btn"
          aria-label="Ajouter une activité"
        >
          <span className="bottom-btn-icon">🏃</span>
          <span className="bottom-btn-label">Activité</span>
        </Link>
      </div>

      <button
        className="menu-center-btn"
        type="button"
        aria-label="Menu Actyv"
      />
    </div>
  );
}