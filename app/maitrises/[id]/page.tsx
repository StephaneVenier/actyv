'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { AppShell } from '@/components/AppShell';
import { getMasteryById, getMasteryProgressPercent } from '@/lib/masteries';

function formatMasteryValue(value: number, unit: string) {
  return `${new Intl.NumberFormat('fr-FR', {
    maximumFractionDigits: unit === 'km' ? 1 : 0,
  }).format(value)} ${unit}`;
}

export default function MasteryDetailPage() {
  const params = useParams();
  const masteryId = Array.isArray(params?.id) ? params.id[0] : params?.id || '';
  const mastery = masteryId ? getMasteryById(masteryId) : null;

  if (!mastery) {
    return (
      <AppShell>
        <div className="masteries-page">
          <section className="card masteries-hero-card">
            <div className="masteries-hero-card__copy">
              <span className="section-kicker">Maitrises</span>
              <h1>Maitrise introuvable</h1>
              <p className="muted">Cette fiche prototype n&apos;existe pas encore.</p>
            </div>
            <div className="masteries-detail-actions">
              <Link href="/maitrises" className="button primary">
                Retour aux maitrises
              </Link>
            </div>
          </section>
        </div>
      </AppShell>
    );
  }

  const progressPercent = getMasteryProgressPercent(mastery);
  const remainingValue = Math.max(mastery.nextLevelTarget - mastery.currentValue, 0);

  return (
    <AppShell>
      <div className="masteries-page">
        <section className="card masteries-hero-card mastery-detail-hero">
          <div className="masteries-hero-card__copy">
            <span className="section-kicker">Maitrise</span>
            <h1>{mastery.name}</h1>
            <p className="muted">Niveau {mastery.level}</p>
          </div>

          <div className="mastery-detail-progress">
            <div className="mastery-detail-progress__top">
              <strong>{formatMasteryValue(mastery.currentValue, mastery.unit)}</strong>
              <span>{formatMasteryValue(mastery.nextLevelTarget, mastery.unit)}</span>
            </div>
            <div className="progress-bar mastery-card__bar" aria-hidden="true">
              <span className="progress-fill" style={{ width: `${progressPercent}%` }} />
            </div>
            <p className="mastery-detail-progress__hint">
              Encore {formatMasteryValue(remainingValue, mastery.unit)} pour atteindre le niveau {mastery.level + 1}.
            </p>
            <p className="mastery-detail-progress__reward">Prochaine recompense : +{mastery.nextRewardXp} XP</p>
          </div>

          <div className="masteries-detail-actions">
            <Link href="/maitrises" className="button ghost">
              Retour aux maitrises
            </Link>
            <button type="button" className="button primary" disabled>
              Ajouter une performance
            </button>
          </div>
          <p className="mastery-detail-locked-note">Bientot disponible</p>
        </section>

        <section className="mastery-detail-stats">
          <article className="card mastery-detail-stat-card">
            <span>Total realise</span>
            <strong>{formatMasteryValue(mastery.totalValue, mastery.unit)}</strong>
          </article>
          <article className="card mastery-detail-stat-card">
            <span>15 derniers jours</span>
            <strong>{formatMasteryValue(mastery.last15DaysValue, mastery.unit)}</strong>
          </article>
          <article className="card mastery-detail-stat-card">
            <span>Meilleure seance</span>
            <strong>{formatMasteryValue(mastery.bestSessionValue, mastery.unit)}</strong>
          </article>
        </section>
      </div>
    </AppShell>
  );
}

