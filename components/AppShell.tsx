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
    <div className="page-shell">
      <header className="topbar">
        <Link href="/" className="brand" aria-label="Retour à l'accueil Actyv">
          <img
            src="/images/actyv-logo.png"
            alt="Actyv"
            className="brand-logo"
          />
        </Link>

        <nav className="nav" style={{ flex: 1 }}>
          <Link href="/">Accueil</Link>
          <Link href="/challenges/new" className="button primary">
  Créer un challenge
</Link>
          <Link href="/activities/new">Ajouter une activité</Link>
        </nav>

        <div style={{ marginLeft: 'auto' }}>
          {!userEmail ? (
            <div
              style={{
                display: 'flex',
                gap: '0.75rem',
                alignItems: 'center',
                flexWrap: 'wrap',
              }}
            >
              <Link href="/login" className="button ghost">
                Connexion
              </Link>
              <Link href="/signup" className="button primary">
                Créer un compte
              </Link>
            </div>
          ) : (
            <div ref={menuRef} style={{ position: 'relative' }}>
              <button
                type="button"
                onClick={() => setMenuOpen((prev) => !prev)}
                className="profile-trigger"
              >
                {profileLabel} <span style={{ fontSize: '0.85em' }}>▾</span>
              </button>

              {menuOpen && (
                <div
                  style={{
                    position: 'absolute',
                    top: 'calc(100% + 0.6rem)',
                    right: 0,
                    minWidth: '230px',
                    background: 'rgba(255, 255, 255, 0.98)',
                    border: '1px solid rgba(11, 18, 32, 0.08)',
                    borderRadius: '18px',
                    boxShadow: '0 18px 40px rgba(2, 8, 23, 0.12)',
                    padding: '0.55rem',
                    zIndex: 30,
                    display: 'grid',
                    gap: '0.35rem',
                    backdropFilter: 'blur(10px)',
                  }}
                >
                  <Link
                    href="/profile"
                    onClick={() => setMenuOpen(false)}
                    style={{
                      padding: '0.9rem 1rem',
                      borderRadius: '14px',
                      textDecoration: 'none',
                      color: 'inherit',
                      fontWeight: 600,
                      transition: 'background 0.18s ease',
                    }}
                  >
                    Mon profil
                  </Link>

<button class="menu-center-btn">
  <img src="/images/logo-actyv-A.png" alt="Actyv menu" />
</button>


                  <button
                    type="button"
                    onClick={handleLogout}
                    style={{
                      textAlign: 'left',
                      padding: '0.9rem 1rem',
                      borderRadius: '14px',
                      border: 'none',
                      background: 'transparent',
                      cursor: 'pointer',
                      fontSize: '1rem',
                      fontWeight: 600,
                      color: '#0f172a',
                    }}
                  >
                    Déconnexion
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </header>

      {children}
    </div>
  );
}