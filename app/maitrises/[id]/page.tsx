'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { AppShell } from '@/components/AppShell';
import { MasteryIcon } from '@/components/MasteryIcon';
import {
  formatMasteryProgressLabel,
  formatMasteryValue,
  getMasteryById,
  getMasteryInfoCopy,
  getMasteryProgressPercent,
  getMasteryUnitLabel,
} from '@/lib/masteries';

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
  const remainingUnitLabel = getMasteryUnitLabel(mastery.unit, remainingValue);

  return (
    <AppShell>
      <div className="masteries-page">
        <section className="card masteries-detail-shell">
          <div className="masteries-detail-shell__topbar">
            <Link href="/maitrises" className="masteries-detail-shell__back" aria-label="Retour aux maitrises">
              &larr;
            </Link>
            <div className="masteries-detail-shell__actions">
              <button type="button" className="masteries-detail-shell__icon-button" aria-label="Favori" disabled>
                &#9734;
              </button>
              <button type="button" className="masteries-detail-shell__icon-button" aria-label="Plus d'options" disabled>
                &#8942;
              </button>
            </div>
          </div>

          <div className="masteries-detail-shell__hero">
            <span className="mastery-detail-shell__icon-wrap">
              <MasteryIcon categoryId={mastery.categoryId} className="mastery-icon mastery-icon--hero" />
            </span>
            <div className="masteries-hero-card__copy masteries-hero-card__copy--detail">
              <h1>{mastery.name}</h1>
              <p className="mastery-detail-shell__level">Niveau {mastery.level}</p>
            </div>
          </div>

          <div className="mastery-detail-progress mastery-detail-progress--hero">
            <div className="mastery-detail-progress__top">
              <strong>{formatMasteryProgressLabel(mastery)}</strong>
              <span>{Math.round(progressPercent)}%</span>
            </div>
            <div className="progress-bar mastery-card__bar" aria-hidden="true">
              <span className="progress-fill" style={{ width: `${progressPercent}%` }} />
            </div>
          </div>

          <div className="card mastery-detail-reward-card">
            <div className="mastery-detail-reward-card__block">
              <span className="mastery-detail-reward-card__icon">&#9733;</span>
              <div>
                <strong>Encore {formatMasteryValue(remainingValue, mastery.unit)}</strong>
                <span>pour atteindre le niveau {mastery.level + 1} en {remainingUnitLabel}</span>
              </div>
            </div>
            <div className="mastery-detail-reward-card__divider" aria-hidden="true" />
            <div className="mastery-detail-reward-card__block mastery-detail-reward-card__block--reward">
              <span>Prochaine recompense</span>
              <strong>+{mastery.nextRewardXp} XP</strong>
            </div>
          </div>

          <div className="card mastery-detail-stats-card">
            <div className="mastery-detail-stat-row">
              <span className="mastery-detail-stat-row__icon">&Sigma;</span>
              <span>Total realise</span>
              <strong>
                {formatMasteryValue(mastery.totalValue, mastery.unit)} {getMasteryUnitLabel(mastery.unit, mastery.totalValue)}
              </strong>
            </div>
            <div className="mastery-detail-stat-row">
              <span className="mastery-detail-stat-row__icon">&#9719;</span>
              <span>15 derniers jours</span>
              <strong>
                {formatMasteryValue(mastery.last15DaysValue, mastery.unit)}{' '}
                {getMasteryUnitLabel(mastery.unit, mastery.last15DaysValue)}
              </strong>
            </div>
            <div className="mastery-detail-stat-row">
              <span className="mastery-detail-stat-row__icon">&#8962;</span>
              <span>Meilleure seance</span>
              <strong>
                {formatMasteryValue(mastery.bestSessionValue, mastery.unit)}{' '}
                {getMasteryUnitLabel(mastery.unit, mastery.bestSessionValue)}
              </strong>
            </div>
          </div>

          <div className="mastery-detail-action-card">
            <button type="button" className="button mastery-detail-action-card__button" disabled>
              <span className="mastery-detail-action-card__plus" aria-hidden="true">
                +
              </span>
              Ajouter une performance
            </button>
            <p className="mastery-detail-locked-note">Bientot disponible</p>
          </div>

          <div className="card mastery-detail-info-card">
            <span className="mastery-detail-info-card__icon" aria-hidden="true">
              i
            </span>
            <p>{getMasteryInfoCopy(mastery)}</p>
          </div>
        </section>
      </div>
    </AppShell>
  );
}
