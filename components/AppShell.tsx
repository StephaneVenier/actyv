'use client';

import Link from 'next/link';
import { ReactNode, useEffect, useRef, useState } from 'react';
import { ToastProvider } from '@/components/ToastProvider';
import { supabase } from '@/lib/supabase';

type Profile = {
  username: string | null;
};

type QuickStatsSummary = {
  completedWorkouts: number;
  totalDurationSeconds: number;
};

function formatQuickStatsDuration(totalSeconds: number) {
  if (!Number.isFinite(totalSeconds) || totalSeconds <= 0) {
    return '0 min';
  }

  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);

  if (hours > 0) {
    return `${hours} h ${minutes.toString().padStart(2, '0')}`;
  }

  return `${minutes} min`;
}

export function AppShell({ children }: { children: ReactNode }) {
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [username, setUsername] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [quickMenuOpen, setQuickMenuOpen] = useState(false);
  const [quickStatsSummary, setQuickStatsSummary] = useState<QuickStatsSummary | null>(null);

  const menuRef = useRef<HTMLDivElement | null>(null);
  const quickMenuRef = useRef<HTMLDivElement | null>(null);

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
          setQuickStatsSummary(null);
          return;
        }

        if (!user) {
          setUserEmail(null);
          setUsername(null);
          setQuickStatsSummary(null);
          return;
        }

        const email = user.email || null;
        setUserEmail(email);

        if (!email) {
          setUsername(null);
        } else {
          const { data, error: profileError } = await supabase
            .from('profiles')
            .select('username')
            .eq('email', email)
            .maybeSingle<Profile>();

          if (profileError) {
            console.error('Erreur chargement profil :', profileError);
            setUsername(null);
          } else {
            setUsername(data?.username || null);
          }
        }

        const { data: statsRows, error: statsError } = await supabase
          .from('workout_sessions_history')
          .select('id, duration_seconds')
          .eq('user_id', user.id)
          .order('completed_at', { ascending: false });

        if (statsError) {
          console.error('Erreur chargement resume statistiques menu :', statsError);
          setQuickStatsSummary(null);
          return;
        }

        const completedWorkouts = (statsRows || []).length;
        const totalDurationSeconds = (statsRows || []).reduce((sum, row) => {
          const duration = Number((row as { duration_seconds?: number | null }).duration_seconds || 0);
          return sum + (Number.isFinite(duration) ? duration : 0);
        }, 0);

        setQuickStatsSummary({
          completedWorkouts,
          totalDurationSeconds,
        });
      } catch (err) {
        console.error('Erreur AppShell :', err);
        setUserEmail(null);
        setUsername(null);
        setQuickStatsSummary(null);
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
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }

      if (quickMenuRef.current && !quickMenuRef.current.contains(event.target as Node)) {
        setQuickMenuOpen(false);
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
    <ToastProvider>
      <div className="app-shell">
        <header className="topbar">
          <div className="topbar-inner">
            <div className="topbar-left">
              <nav className="nav desktop-nav">
                <Link href="/">Accueil</Link>
                <Link href="/challenges/new" className="button primary">
                  Creer un challenge
                </Link>
                <Link href="/activities/new">Ajouter une activite</Link>
              </nav>
            </div>

            <Link href="/" className="brand" aria-label="Retour a l'accueil Actyv">
              <img src="/images/actyv-logo.png" alt="Actyv" className="brand-logo" />
            </Link>

            <div className="topbar-right">
              {!userEmail ? (
                <div ref={menuRef} className="profile-menu-wrap">
                  <button
                    type="button"
                    onClick={() => setMenuOpen((prev) => !prev)}
                    className="profile-trigger auth-trigger"
                    aria-haspopup="menu"
                    aria-expanded={menuOpen}
                  >
                    <span className="profile-trigger-text">Connexion / inscription</span>
                    <span className="profile-trigger-arrow">▾</span>
                  </button>

                  {menuOpen && (
                    <div className="profile-dropdown">
                      <Link
                        href="/login"
                        onClick={() => setMenuOpen(false)}
                        className="profile-dropdown-link"
                      >
                        Se connecter
                      </Link>

                      <Link
                        href="/signup"
                        onClick={() => setMenuOpen(false)}
                        className="profile-dropdown-link"
                      >
                        Creer un compte
                      </Link>
                    </div>
                  )}
                </div>
              ) : (
                <div ref={menuRef} className="profile-menu-wrap">
                  <button
                    type="button"
                    onClick={() => setMenuOpen((prev) => !prev)}
                    className="profile-trigger"
                    aria-haspopup="menu"
                    aria-expanded={menuOpen}
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
                        Deconnexion
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
          <Link href="/challenges/new" className="bottom-btn" aria-label="Creer un challenge">
            <span className="bottom-btn-icon">🏆</span>
            <span className="bottom-btn-label">Challenge</span>
          </Link>

          <div className="bottom-bar-center-space" />

          <Link href="/activities/new" className="bottom-btn" aria-label="Ajouter une activite">
            <span className="bottom-btn-icon">🏃</span>
            <span className="bottom-btn-label">Activite</span>
          </Link>
        </div>

        <div ref={quickMenuRef} className="quick-menu-wrap">
          {quickMenuOpen && (
            <div className="quick-menu-panel">
              <Link
                href="/stats"
                className="quick-menu-item quick-menu-item--featured"
                onClick={() => setQuickMenuOpen(false)}
              >
                <span className="quick-menu-item__title">Statistiques</span>
                <span className="quick-menu-item__meta">Voir tes donnees detaillees</span>
                {quickStatsSummary ? (
                  <span className="quick-menu-item__summary">
                    {quickStatsSummary.completedWorkouts} seance
                    {quickStatsSummary.completedWorkouts > 1 ? 's' : ''} •{' '}
                    {formatQuickStatsDuration(quickStatsSummary.totalDurationSeconds)}
                  </span>
                ) : null}
              </Link>

              <Link
                href="/leaderboard"
                className="quick-menu-item"
                onClick={() => setQuickMenuOpen(false)}
              >
                <span className="quick-menu-item__title">Classements</span>
                <span className="quick-menu-item__meta">Voir les classements Actyv</span>
              </Link>

              <Link
                href="/sessions/new"
                className="quick-menu-item"
                onClick={() => setQuickMenuOpen(false)}
              >
                <span className="quick-menu-item__title">Creer une seance</span>
                <span className="quick-menu-item__meta">Composer une seance simple</span>
              </Link>

              <Link
                href="/programs/new"
                className="quick-menu-item"
                onClick={() => setQuickMenuOpen(false)}
              >
                <span className="quick-menu-item__title">Creer un programme</span>
                <span className="quick-menu-item__meta">Bientot disponible</span>
              </Link>
            </div>
          )}

          <button
            className="menu-center-btn"
            type="button"
            aria-label="Menu Actyv"
            aria-haspopup="menu"
            aria-expanded={quickMenuOpen}
            onClick={() => setQuickMenuOpen((prev) => !prev)}
          />
        </div>
      </div>
    </ToastProvider>
  );
}
