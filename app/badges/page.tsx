'use client';

import type { CSSProperties, ReactNode } from 'react';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { AppShell } from '@/components/AppShell';
import { BADGES, getUnlockedBadgeCodes } from '@/lib/badges';
import type { BadgeDefinition, UserBadge } from '@/lib/badges';
import { supabase } from '@/lib/supabase';

function iconStroke(path: ReactNode) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {path}
    </svg>
  );
}

function renderBadgeIcon(iconName: string) {
  const icons: Record<string, ReactNode> = {
    Footprints: iconStroke(
      <>
        <path d="M7 15c1.2-2.6.9-5.3-.6-6.2-1.4-.8-3.3.6-4.4 3.1-.9 2.1-.7 4.2.6 5 1.1.6 2.8-.3 4.4-1.9Z" />
        <path d="M15 20c1.2-2.6.9-5.3-.6-6.2-1.4-.8-3.3.6-4.4 3.1-.9 2.1-.7 4.2.6 5 1.1.6 2.8-.3 4.4-1.9Z" />
        <path d="M14 4c1 0 2 .9 2 2s-.8 2-1.8 2S12.5 7 12.5 6s.5-2 1.5-2Z" />
        <path d="M19 8c1 0 2 .9 2 2s-.8 2-1.8 2S17.5 11 17.5 10s.5-2 1.5-2Z" />
      </>
    ),
    TrendingUp: iconStroke(
      <>
        <path d="M4 16l6-6 4 4 6-7" />
        <path d="M14 7h6v6" />
      </>
    ),
    Flame: iconStroke(
      <>
        <path d="M12 3c1 2 4 3.5 4 7a4 4 0 1 1-8 0c0-2.4 1.3-4.1 2.6-5.5.8-.8 1.2-1.3 1.4-1.5Z" />
        <path d="M12 13c.8.8 1.5 1.7 1.5 3a1.5 1.5 0 0 1-3 0c0-1 .5-1.9 1.5-3Z" />
      </>
    ),
    Trophy: iconStroke(
      <>
        <path d="M8 4h8v3a4 4 0 0 1-8 0V4Z" />
        <path d="M6 6H4a2 2 0 0 0 2 4h1" />
        <path d="M18 6h2a2 2 0 0 1-2 4h-1" />
        <path d="M12 11v4" />
        <path d="M9 20h6" />
        <path d="M10 15h4v3h-4z" />
      </>
    ),
    Users: iconStroke(
      <>
        <path d="M16 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2" />
        <path d="M9.5 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z" />
        <path d="M20 21v-2a4 4 0 0 0-3-3.9" />
        <path d="M16.5 4.1a3.5 3.5 0 0 1 0 6.8" />
      </>
    ),
    Map: iconStroke(
      <>
        <path d="M3 6.5 9 4l6 2.5L21 4v13.5L15 20l-6-2.5L3 20V6.5Z" />
        <path d="M9 4v13.5" />
        <path d="M15 6.5V20" />
      </>
    ),
    Route: iconStroke(
      <>
        <circle cx="6" cy="18" r="2" />
        <circle cx="18" cy="6" r="2" />
        <path d="M8 18h4a3 3 0 0 0 3-3V9" />
        <path d="M12 9h6" />
      </>
    ),
    HeartHandshake: iconStroke(
      <>
        <path d="M8.5 12.5 6 10a2.8 2.8 0 0 1 4-4l2 2 2-2a2.8 2.8 0 0 1 4 4l-2.5 2.5" />
        <path d="M7 14l2.5 2.5a2 2 0 0 0 2.8 0L15 14" />
        <path d="M9 12h6" />
      </>
    ),
    PlayCircle: iconStroke(
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="m10 8 6 4-6 4Z" />
      </>
    ),
    BarChart3: iconStroke(
      <>
        <path d="M5 20V10" />
        <path d="M12 20V4" />
        <path d="M19 20v-7" />
      </>
    ),
    Gauge: iconStroke(
      <>
        <path d="M12 4a9 9 0 1 0 9 9" />
        <path d="m12 12 5-3" />
        <path d="M12 12v.01" />
      </>
    ),
    CalendarPlus: iconStroke(
      <>
        <path d="M7 3v3" />
        <path d="M17 3v3" />
        <rect x="4" y="5" width="16" height="15" rx="2" />
        <path d="M8 12h8" />
        <path d="M12 8v8" />
      </>
    ),
    Flag: iconStroke(
      <>
        <path d="M5 21V4" />
        <path d="m5 5 10-2v9L5 10" />
      </>
    ),
    Share2: iconStroke(
      <>
        <circle cx="18" cy="5" r="2" />
        <circle cx="6" cy="12" r="2" />
        <circle cx="18" cy="19" r="2" />
        <path d="m8 12 8-6" />
        <path d="m8 12 8 6" />
      </>
    ),
  };

  return icons[iconName] || iconStroke(<circle cx="12" cy="12" r="8" />);
}

function getBadgeCategoryLabel(badge: BadgeDefinition) {
  const labels: Record<BadgeDefinition['category'], string> = {
    activity: 'Activite',
    challenge: 'Challenge',
    distance: 'Distance',
    social: 'Social',
    session: 'Seance',
    program: 'Programme',
  };

  return labels[badge.category];
}

export default function BadgesPage() {
  const [loading, setLoading] = useState(true);
  const [authenticated, setAuthenticated] = useState(true);
  const [userBadges, setUserBadges] = useState<UserBadge[]>([]);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    const loadBadges = async () => {
      setLoading(true);
      setErrorMessage('');

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setAuthenticated(false);
        setUserBadges([]);
        setLoading(false);
        return;
      }

      setAuthenticated(true);

      const { data, error } = await supabase
        .from('user_badges')
        .select('badge_code, unlocked_at')
        .eq('user_id', user.id);

      if (error) {
        console.error('Erreur chargement page badges :', error);
        setErrorMessage("Impossible de charger les badges pour le moment.");
        setUserBadges([]);
        setLoading(false);
        return;
      }

      setUserBadges((data as UserBadge[] | null) || []);
      setLoading(false);
    };

    loadBadges();
  }, []);

  const unlockedBadgeCodes = useMemo(() => getUnlockedBadgeCodes(userBadges), [userBadges]);
  const unlockedCount = unlockedBadgeCodes.size;

  const orderedBadges = useMemo(() => {
    return [...BADGES].sort((left, right) => {
      const leftUnlocked = unlockedBadgeCodes.has(left.code) ? 1 : 0;
      const rightUnlocked = unlockedBadgeCodes.has(right.code) ? 1 : 0;

      if (leftUnlocked !== rightUnlocked) {
        return rightUnlocked - leftUnlocked;
      }

      return left.name.localeCompare(right.name, 'fr');
    });
  }, [unlockedBadgeCodes]);

  if (loading) {
    return (
      <AppShell>
        <div className="badges-page">
          <section className="card badges-hero-card">
            <h1>Badges</h1>
            <p>Chargement de ta collection...</p>
          </section>
        </div>
      </AppShell>
    );
  }

  if (!authenticated) {
    return (
      <AppShell>
        <div className="badges-page">
          <section className="card badges-hero-card">
            <span className="section-kicker">Badges</span>
            <h1>Collection Actyv</h1>
            <p>Connecte-toi pour voir les badges debloques dans ton espace.</p>
            <div className="badges-hero-actions">
              <Link href="/login" className="button primary">
                Se connecter
              </Link>
              <Link href="/profile" className="button ghost">
                Retour au profil
              </Link>
            </div>
          </section>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="badges-page">
        <section className="card badges-hero-card">
          <div className="badges-hero-copy">
            <span className="section-kicker">Badges</span>
            <h1>Collection Actyv</h1>
            <p>Retrouve tous tes badges debloques et les prochains objectifs a aller chercher.</p>
          </div>

          <div className="badges-hero-stats">
            <div className="badges-stat-chip">
              <span>Debloques</span>
              <strong>
                {unlockedCount} / {BADGES.length}
              </strong>
            </div>
            <div className="badges-stat-chip badges-stat-chip--muted">
              <span>Restants</span>
              <strong>{Math.max(BADGES.length - unlockedCount, 0)}</strong>
            </div>
          </div>
        </section>

        {errorMessage ? (
          <section className="card badges-state-card">
            <strong>Erreur</strong>
            <p>{errorMessage}</p>
          </section>
        ) : null}

        {unlockedCount === 0 ? (
          <section className="card badges-state-card">
            <strong>Aucun badge debloque pour le moment.</strong>
            <p>Continue tes activites, seances et programmes pour lancer ta collection.</p>
          </section>
        ) : null}

        <section className="badges-collection-grid">
          {orderedBadges.map((badge) => {
            const unlocked = unlockedBadgeCodes.has(badge.code);

            return (
              <article
                key={badge.code}
                className={`badge-collection-card${unlocked ? ' badge-collection-card--unlocked' : ' badge-collection-card--locked'}`}
                style={
                  unlocked
                    ? ({ ['--badge-accent' as string]: badge.color } as CSSProperties)
                    : undefined
                }
              >
                <div className="badge-collection-card__top">
                  <span className={`badge-collection-card__status${unlocked ? ' badge-collection-card__status--unlocked' : ''}`}>
                    {unlocked ? 'Debloque' : 'Verrouille'}
                  </span>
                </div>

                <div className="badge-collection-card__copy">
                  <strong>{badge.name}</strong>
                  <span>{badge.description}</span>
                </div>

                <div className="badge-collection-card__meta">
                  <span>{getBadgeCategoryLabel(badge)}</span>
                  <span className="badge-collection-card__icon badge-collection-card__icon--meta" aria-hidden="true">
                    {renderBadgeIcon(badge.icon)}
                  </span>
                </div>
              </article>
            );
          })}
        </section>
      </div>
    </AppShell>
  );
}
