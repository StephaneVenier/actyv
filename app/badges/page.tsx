'use client';

import type { CSSProperties } from 'react';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { AppShell } from '@/components/AppShell';
import { BADGES, getUnlockedBadgeCodes } from '@/lib/badges';
import type { BadgeDefinition, UserBadge } from '@/lib/badges';
import { supabase } from '@/lib/supabase';

function getBadgeIconToken(badge: BadgeDefinition) {
  const tokens: Record<BadgeDefinition['code'], string> = {
    premier_pas: 'FP',
    actyv_regulier: 'A5',
    actyv_motive: 'A10',
    challenger: 'CH',
    collectif: 'CO',
    distance_10_km: '10',
    distance_50_km: '50',
    boosteur: 'UP',
    premiere_seance_terminee: 'S1',
    cinq_seances_terminees: 'S5',
    dix_seances_terminees: 'S10',
    premier_programme_cree: 'P1',
    premier_programme_termine: 'PT',
    programme_partage: 'SH',
  };

  return tokens[badge.code] || badge.icon.slice(0, 2).toUpperCase();
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
                  <span className="badge-collection-card__icon" aria-hidden="true">
                    {getBadgeIconToken(badge)}
                  </span>
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
                  <span>{badge.icon}</span>
                </div>
              </article>
            );
          })}
        </section>
      </div>
    </AppShell>
  );
}
