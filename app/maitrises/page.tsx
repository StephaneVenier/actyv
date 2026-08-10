'use client';

import { useMemo, useState } from 'react';
import { AppShell } from '@/components/AppShell';
import { MasteryCard } from '@/components/MasteryCard';
import {
  MASTERY_CATEGORIES,
  getMasteriesByCategory,
  getMasteryCategorySummary,
} from '@/lib/masteries';

export default function MasteriesPage() {
  const [selectedCategoryId, setSelectedCategoryId] = useState(MASTERY_CATEGORIES[0]?.id || 'fitness');

  const selectedCategory = useMemo(
    () => MASTERY_CATEGORIES.find((category) => category.id === selectedCategoryId) || MASTERY_CATEGORIES[0],
    [selectedCategoryId]
  );
  const masteries = useMemo(() => getMasteriesByCategory(selectedCategoryId), [selectedCategoryId]);
  const categorySummary = useMemo(() => getMasteryCategorySummary(selectedCategoryId), [selectedCategoryId]);

  return (
    <AppShell>
      <div className="masteries-page">
        <section className="masteries-page-header">
          <div className="masteries-page-header__copy">
            <span className="section-kicker">Maitrises</span>
            <h1>Maitrises</h1>
            <p className="muted">Fais progresser tes competences sportives.</p>
            <p className="masteries-page-header__hint">Chaque activite te rapproche du niveau suivant.</p>
          </div>
          <button type="button" className="masteries-page-header__action" aria-label="Options maitrises" disabled>
            <span />
            <span />
            <span />
          </button>
        </section>

        <section className="masteries-category-tabs" aria-label="Categories de maitrises">
          {MASTERY_CATEGORIES.map((category) => (
            <button
              key={category.id}
              type="button"
              className={category.id === selectedCategoryId ? 'masteries-category-tab is-active' : 'masteries-category-tab'}
              onClick={() => setSelectedCategoryId(category.id)}
            >
              {category.label}
            </button>
          ))}
        </section>

        <section className="card masteries-summary-card">
          <div className="masteries-summary-card__title">
            <span className="section-kicker">{selectedCategory?.label?.toUpperCase() || 'CATEGORIE'}</span>
          </div>
          <div className="masteries-summary-card__stats">
            <div className="masteries-summary-stat">
              <strong>{categorySummary.startedCount}</strong>
              <span>maitrises commencees</span>
            </div>
            <div className="masteries-summary-stat">
              <strong>{categorySummary.earnedLevels}</strong>
              <span>niveaux gagnes</span>
            </div>
          </div>
        </section>

        <section className="masteries-list" aria-label={`Liste des maitrises ${selectedCategory?.label || ''}`}>
          {masteries.map((mastery) => (
            <MasteryCard key={mastery.id} mastery={mastery} />
          ))}
        </section>
      </div>
    </AppShell>
  );
}
