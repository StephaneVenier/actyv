'use client';

import Link from 'next/link';
import { ReactNode, useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { ToastProvider } from '@/components/ToastProvider';
import { supabase } from '@/lib/supabase';
import { isAccountTransitionInProgress, logoutAccount } from '@/lib/account-lifecycle';
import { liveTrackingPlatform } from '@/lib/live-tracking/platform';
import { requestAccountDeletion, resumeAccountPurges } from '@/lib/account-deletion';

type Profile = {
  username: string | null;
};

type WorkoutQuickStatRow = {
  id: string;
  duration_seconds: number | null;
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
  const pathname = usePathname();
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [accountReady, setAccountReady] = useState(false);
  const [pendingDeletionOwner, setPendingDeletionOwner] = useState<string | null>(null);
  const [accountError, setAccountError] = useState('');
  const [finalizingDeletion, setFinalizingDeletion] = useState(false);
  const [accountCheckAttempt, setAccountCheckAttempt] = useState(0);
  const [username, setUsername] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [quickMenuOpen, setQuickMenuOpen] = useState(false);
  const [quickStatsSummary, setQuickStatsSummary] = useState<QuickStatsSummary | null>(null);

  const menuRef = useRef<HTMLDivElement | null>(null);
  const quickMenuRef = useRef<HTMLDivElement | null>(null);
  const accountRef = useRef<string | null | undefined>(undefined);
  const authLoadRef = useRef(0);

  useEffect(() => {
    const loadUser = async (signedOut = false) => {
      if (isAccountTransitionInProgress()) return;
      const generation = ++authLoadRef.current;
      try {
        await resumeAccountPurges();
        const {
          data: { user },
          error: userError,
        } = signedOut ? {data:{user:null},error:null} : await supabase.auth.getUser();
        if (generation !== authLoadRef.current || isAccountTransitionInProgress()) return;
        // A temporary network failure is not an account transition.
        if (userError && userError.name !== 'AuthSessionMissingError') {
          setAccountError('Connexion requise pour verifier ton compte. Recharge la page pour reessayer.');
          return;
        }
        const nextOwner = user?.id ?? null;
        if (user) {
          const status = await supabase.rpc('get_own_account_deletion_status');
          if (status.error) throw new Error('Verification de suppression indisponible. Recharge la page pour reessayer.');
          if (status.data === true) {
            await liveTrackingPlatform.transitionOwner(null);
            setPendingDeletionOwner(user.id);
            setAccountReady(false);
            return;
          }
        }
        setPendingDeletionOwner(null);
        await liveTrackingPlatform.transitionOwner(nextOwner);
        if (generation !== authLoadRef.current || isAccountTransitionInProgress()) return;
        if (accountRef.current !== undefined && accountRef.current !== nextOwner) {
          window.location.replace(window.location.pathname === '/reset-password' ? '/reset-password' : nextOwner ? '/' : '/login');
          return;
        }
        accountRef.current = nextOwner;
        setAccountError('');
        setAccountReady(true);

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

        const { error: provisionError } = await supabase.rpc('ensure_own_profile');
        if (provisionError) {
          console.error('Erreur initialisation profil :', provisionError);
        }

        if (!email) {
          setUsername(null);
        } else {
          const { data, error: profileError } = await supabase
            .from('profiles')
            .select('username')
            .eq('id', user.id)
            .maybeSingle();

          if (profileError) {
            console.error('Erreur chargement profil :', profileError);
            setUsername(null);
          } else {
            setUsername((data as Profile | null)?.username || null);
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

        const normalizedStatsRows = ((statsRows as WorkoutQuickStatRow[] | null) || []);
        const completedWorkouts = normalizedStatsRows.length;
        const totalDurationSeconds = normalizedStatsRows.reduce((sum, row) => {
          const duration = Number(row.duration_seconds || 0);
          return sum + (Number.isFinite(duration) ? duration : 0);
        }, 0);

        setQuickStatsSummary({
          completedWorkouts,
          totalDurationSeconds,
        });
      } catch (err) {
        if (generation !== authLoadRef.current || isAccountTransitionInProgress()) return;
        setAccountReady(false);
        setAccountError(err instanceof Error ? err.message : 'Verification du compte indisponible.');
        console.error('Erreur AppShell :', err);
        setUserEmail(null);
        setUsername(null);
        setQuickStatsSummary(null);
      }
    };

    loadUser();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event:string) => {
      loadUser(event === 'SIGNED_OUT');
    });

    const recheckAccount = () => { void loadUser(); };
    window.addEventListener('online', recheckAccount);
    window.addEventListener('focus', recheckAccount);

    return () => {
      authLoadRef.current += 1;
      subscription.unsubscribe();
      window.removeEventListener('online', recheckAccount);
      window.removeEventListener('focus', recheckAccount);
    };
  }, [accountCheckAttempt]);

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
    try { await logoutAccount(); }
    catch { window.alert('Déconnexion impossible. Le suivi est arrêté ; réessaie avec du réseau et un APK à jour.'); }
  };

  const profileLabel = username || userEmail || 'Mon profil';
  const isRouteActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);
  const isQuickMenuActive =
    isRouteActive('/stats') ||
    isRouteActive('/leaderboard') ||
    isRouteActive('/sessions') ||
    isRouteActive('/programs') ||
    isRouteActive('/maitrises') ||
    isRouteActive('/badges') ||
    isRouteActive('/banque');

  return (
    <ToastProvider>
      <div className="app-shell">
        <header className="topbar">
          <div className="topbar-inner">
            <div className="topbar-left">
              <nav className="nav desktop-nav">
                <Link href="/" className={isRouteActive('/') ? 'nav-link is-active' : 'nav-link'}>
                  Accueil
                </Link>
                <Link
                  href="/challenges/new"
                  className={
                    isRouteActive('/challenges')
                      ? 'button primary nav-link nav-link--cta is-active'
                      : 'button primary nav-link nav-link--cta'
                  }
                >
                  Creer un challenge
                </Link>
                <Link
                  href="/activities/new"
                  className={isRouteActive('/activities') ? 'nav-link is-active' : 'nav-link'}
                >
                  Ajouter une activite
                </Link>
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

                      <Link
                        href="/badges"
                        onClick={() => setMenuOpen(false)}
                        className="profile-dropdown-link"
                      >
                        Mes badges
                      </Link>

                      <Link
                        href="/maitrises"
                        onClick={() => setMenuOpen(false)}
                        className="profile-dropdown-link"
                      >
                        Mes maitrises
                      </Link>

                      <Link
                        href="/banque"
                        onClick={() => setMenuOpen(false)}
                        className="profile-dropdown-link"
                      >
                        Banque Actyv
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

        <main className="page-content">
          {pendingDeletionOwner ? (
            <section className="card">
              <h1>La suppression de ton compte doit etre finalisee</h1>
              <button type="button" className="button" disabled={finalizingDeletion} onClick={async () => {
                setFinalizingDeletion(true);
                try { await requestAccountDeletion(pendingDeletionOwner); }
                catch (error) { setAccountError(error instanceof Error ? error.message : 'Reessaie.'); }
                finally { setFinalizingDeletion(false); }
              }}>{finalizingDeletion ? 'Suppression...' : 'Reessayer'}</button>
              <button type="button" className="button" onClick={handleLogout}>Se deconnecter</button>
              {accountError && <p role="alert">{accountError}</p>}
            </section>
          ) : accountReady ? children : (
            <section>
              <p role="status">{accountError || 'Verification du compte...'}</p>
              {accountError && <button type="button" className="button" onClick={() => {
                setAccountError('');
                setAccountCheckAttempt(attempt => attempt + 1);
              }}>Reessayer la verification</button>}
            </section>
          )}
          <footer className="site-footer" aria-label="Informations legales">
            <div className="site-footer__inner">
              <span className="site-footer__brand">Actyv</span>
              <nav className="site-footer__nav">
                <Link href="/legal/mentions-legales">Mentions legales</Link>
                <Link href="/legal/confidentialite">Confidentialite</Link>
                <Link href="/legal/cookies">Cookies</Link>
              </nav>
            </div>
          </footer>
        </main>

        <div className="bottom-bar">
          <Link
            href="/challenges/new"
            className={isRouteActive('/challenges') ? 'bottom-btn is-active' : 'bottom-btn'}
            aria-label="Creer un challenge"
          >
            <span className="bottom-btn-icon">🏆</span>
            <span className="bottom-btn-label">Challenge</span>
          </Link>

          <div className="bottom-bar-center-space" />

          <Link
            href="/activities/new"
            className={isRouteActive('/activities') ? 'bottom-btn is-active' : 'bottom-btn'}
            aria-label="Ajouter une activite"
          >
            <span className="bottom-btn-icon">🏃</span>
            <span className="bottom-btn-label">Activite</span>
          </Link>
        </div>

        <div ref={quickMenuRef} className="quick-menu-wrap">
          {quickMenuOpen && (
            <div className="quick-menu-panel">
              <Link
                href="/stats"
                className={isRouteActive('/stats') ? 'quick-menu-item quick-menu-item--featured is-active' : 'quick-menu-item quick-menu-item--featured'}
                onClick={() => setQuickMenuOpen(false)}
              >
                <div className="quick-menu-item__heading">
                  <span className="quick-menu-item__icon quick-menu-item__icon--stats" aria-hidden="true" />
                  <span className="quick-menu-item__title">Statistiques</span>
                </div>
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
                className={isRouteActive('/leaderboard') ? 'quick-menu-item is-active' : 'quick-menu-item'}
                onClick={() => setQuickMenuOpen(false)}
              >
                <div className="quick-menu-item__heading">
                  <span className="quick-menu-item__icon quick-menu-item__icon--leaderboard" aria-hidden="true" />
                  <span className="quick-menu-item__title">Classements</span>
                </div>
                <span className="quick-menu-item__meta">Voir les classements Actyv</span>
              </Link>

              <Link
                href="/sessions/new"
                className={isRouteActive('/sessions') ? 'quick-menu-item is-active' : 'quick-menu-item'}
                onClick={() => setQuickMenuOpen(false)}
              >
                <div className="quick-menu-item__heading">
                  <span className="quick-menu-item__icon quick-menu-item__icon--sessions" aria-hidden="true" />
                  <span className="quick-menu-item__title">Seances</span>
                </div>
                <span className="quick-menu-item__meta">Creer, lancer et suivre tes seances</span>
              </Link>

              <Link
                href="/programs"
                className={isRouteActive('/programs') ? 'quick-menu-item is-active' : 'quick-menu-item'}
                onClick={() => setQuickMenuOpen(false)}
              >
                <div className="quick-menu-item__heading">
                  <span className="quick-menu-item__icon quick-menu-item__icon--programs" aria-hidden="true" />
                  <span className="quick-menu-item__title">Programmes</span>
                </div>
                <span className="quick-menu-item__meta">Planifier et suivre tes cycles</span>
              </Link>

              <Link
                href="/maitrises"
                className={isRouteActive('/maitrises') ? 'quick-menu-item is-active' : 'quick-menu-item'}
                onClick={() => setQuickMenuOpen(false)}
              >
                <div className="quick-menu-item__heading">
                  <span className="quick-menu-item__icon quick-menu-item__icon--masteries" aria-hidden="true" />
                  <span className="quick-menu-item__title">Maitrises</span>
                </div>
                <span className="quick-menu-item__meta">Faire progresser tes competences sportives</span>
              </Link>

              <Link
                href="/badges"
                className={isRouteActive('/badges') ? 'quick-menu-item is-active' : 'quick-menu-item'}
                onClick={() => setQuickMenuOpen(false)}
              >
                <div className="quick-menu-item__heading">
                  <span className="quick-menu-item__icon quick-menu-item__icon--badges" aria-hidden="true" />
                  <span className="quick-menu-item__title">Badges</span>
                </div>
                <span className="quick-menu-item__meta">Voir ta collection Actyv</span>
              </Link>

              <Link
                href="/banque"
                className={isRouteActive('/banque') ? 'quick-menu-item is-active' : 'quick-menu-item'}
                onClick={() => setQuickMenuOpen(false)}
              >
                <div className="quick-menu-item__heading">
                  <span className="quick-menu-item__icon quick-menu-item__icon--bank" aria-hidden="true" />
                  <span className="quick-menu-item__title">Banque Actyv</span>
                </div>
                <span className="quick-menu-item__meta">Importer des seances et programmes publics</span>
              </Link>
            </div>
          )}

          <button
            className={quickMenuOpen || isQuickMenuActive ? 'menu-center-btn is-active' : 'menu-center-btn'}
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
