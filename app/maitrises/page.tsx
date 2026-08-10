'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { AppShell } from '@/components/AppShell';
import { MasteryCard } from '@/components/MasteryCard';
import { loadMasteriesDashboard } from '@/lib/masteries-api';
import {
  type Mastery,
  type MasteryCategory,
  getMasteriesByCategory,
} from '@/lib/masteries';
import { supabase } from '@/lib/supabase';

type MasteriesPageState = {
  categories: MasteryCategory[];
  masteries: Mastery[];
  summaries: Record<
    string,
    {
      startedCount: number;
      earnedLevels: number;
    }
  >;
};

export default function MasteriesPage() {
  const [selectedCategoryId, setSelectedCategoryId] = useState('fitness');
  const categoryTabsRef = useRef<HTMLElement | null>(null);
  const [pageState, setPageState] = useState<MasteriesPageState>({
    categories: [],
    masteries: [],
    summaries: {},
  });
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const [authRequired, setAuthRequired] = useState(false);
  const [canScrollCategoriesLeft, setCanScrollCategoriesLeft] = useState(false);
  const [canScrollCategoriesRight, setCanScrollCategoriesRight] = useState(false);

  useEffect(() => {
    let isCancelled = false;

    const loadPage = async () => {
      setLoading(true);
      setErrorMessage('');
      setAuthRequired(false);

      try {
        if (!supabase || typeof (supabase as { auth?: { getUser?: unknown } }).auth?.getUser !== 'function') {
          throw new Error('Supabase non configure pour les maitrises.');
        }

        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!user) {
          if (!isCancelled) {
            setAuthRequired(true);
            setPageState({
              categories: [],
              masteries: [],
              summaries: {},
            });
          }
          return;
        }

        const dashboard = await loadMasteriesDashboard(user.id);

        if (!isCancelled) {
          setPageState({
            categories: dashboard.categories,
            masteries: dashboard.masteries,
            summaries: dashboard.summaries,
          });

          setSelectedCategoryId((currentCategoryId) =>
            dashboard.categories.some((category) => category.id === currentCategoryId)
              ? currentCategoryId
              : dashboard.categories[0]?.id || 'fitness'
          );
        }
      } catch (error) {
        console.error('Erreur chargement maitrises :', error);

        if (!isCancelled) {
          setErrorMessage(
            'Impossible de charger les maitrises pour le moment. Verifie que la migration Supabase a bien ete appliquee.'
          );
        }
      } finally {
        if (!isCancelled) {
          setLoading(false);
        }
      }
    };

    void loadPage();

    return () => {
      isCancelled = true;
    };
  }, []);

  useEffect(() => {
    const tabsElement = categoryTabsRef.current;
    if (!tabsElement) return;

    const updateCategoryScrollState = () => {
      const maxScrollLeft = Math.max(tabsElement.scrollWidth - tabsElement.clientWidth, 0);
      setCanScrollCategoriesLeft(tabsElement.scrollLeft > 4);
      setCanScrollCategoriesRight(tabsElement.scrollLeft < maxScrollLeft - 4);
    };

    updateCategoryScrollState();
    tabsElement.addEventListener('scroll', updateCategoryScrollState, { passive: true });

    let resizeObserver: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(updateCategoryScrollState);
      resizeObserver.observe(tabsElement);
    }

    window.addEventListener('resize', updateCategoryScrollState);

    return () => {
      tabsElement.removeEventListener('scroll', updateCategoryScrollState);
      resizeObserver?.disconnect();
      window.removeEventListener('resize', updateCategoryScrollState);
    };
  }, [pageState.categories]);

  const selectedCategory = useMemo(
    () => pageState.categories.find((category) => category.id === selectedCategoryId) || pageState.categories[0] || null,
    [pageState.categories, selectedCategoryId]
  );

  const masteries = useMemo(() => {
    if (!selectedCategory) return [];
    return getMasteriesByCategory(pageState.masteries, selectedCategory.id);
  }, [pageState.masteries, selectedCategory]);

  const categorySummary = selectedCategory
    ? pageState.summaries[selectedCategory.id] || { startedCount: 0, earnedLevels: 0 }
    : { startedCount: 0, earnedLevels: 0 };

  const scrollCategoriesBy = (direction: 'left' | 'right') => {
    const tabsElement = categoryTabsRef.current;
    if (!tabsElement) return;

    const scrollAmount = Math.min(Math.max(tabsElement.clientWidth * 0.65, 180), 320);
    tabsElement.scrollBy({
      left: direction === 'left' ? -scrollAmount : scrollAmount,
      behavior: 'smooth',
    });
  };

  const handleCategoryWheel = (event: React.WheelEvent<HTMLElement>) => {
    const tabsElement = categoryTabsRef.current;
    if (!tabsElement) return;

    const maxScrollLeft = tabsElement.scrollWidth - tabsElement.clientWidth;
    if (maxScrollLeft <= 0) return;

    const horizontalDelta =
      Math.abs(event.deltaX) > 0 ? event.deltaX : event.shiftKey ? event.deltaY : 0;

    if (horizontalDelta === 0) {
      return;
    }

    const nextScrollLeft = tabsElement.scrollLeft + horizontalDelta;
    const canMove =
      (horizontalDelta < 0 && tabsElement.scrollLeft > 0) ||
      (horizontalDelta > 0 && tabsElement.scrollLeft < maxScrollLeft);

    if (!canMove) {
      return;
    }

    event.preventDefault();
    tabsElement.scrollLeft = Math.max(0, Math.min(nextScrollLeft, maxScrollLeft));
  };

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

        {authRequired ? (
          <section className="card masteries-state-card">
            <strong>Connexion requise</strong>
            <p>Connecte-toi pour retrouver tes maitrises et commencer a enregistrer tes performances.</p>
            <div className="masteries-state-card__actions">
              <Link href="/login" className="button primary">
                Se connecter
              </Link>
            </div>
          </section>
        ) : loading ? (
          <section className="card masteries-state-card">
            <strong>Chargement</strong>
            <p>Nous recuperons tes categories, tes progressions et tes niveaux en cours.</p>
          </section>
        ) : errorMessage ? (
          <section className="card masteries-state-card">
            <strong>Chargement indisponible</strong>
            <p>{errorMessage}</p>
          </section>
        ) : (
          <>
            <section className="masteries-category-tabs-shell" aria-label="Navigation des categories de maitrises">
              <button
                type="button"
                className={`masteries-category-nav masteries-category-nav--left${canScrollCategoriesLeft ? '' : ' is-hidden'}`}
                aria-label="Catégories précédentes"
                onClick={() => scrollCategoriesBy('left')}
                disabled={!canScrollCategoriesLeft}
              >
                <span aria-hidden="true">&lsaquo;</span>
              </button>

              <section
                ref={categoryTabsRef}
                className="masteries-category-tabs"
                aria-label="Categories de maitrises"
                onWheel={handleCategoryWheel}
              >
                {pageState.categories.map((category) => (
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

              <button
                type="button"
                className={`masteries-category-nav masteries-category-nav--right${canScrollCategoriesRight ? '' : ' is-hidden'}`}
                aria-label="Catégories suivantes"
                onClick={() => scrollCategoriesBy('right')}
                disabled={!canScrollCategoriesRight}
              >
                <span aria-hidden="true">&rsaquo;</span>
              </button>
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
              {masteries.length === 0 ? (
                <article className="card mastery-empty-card">
                  <strong>Aucune maitrise dans cette categorie</strong>
                  <p>Cette categorie ne contient pas encore de maitrise visible pour ton compte.</p>
                </article>
              ) : (
                masteries.map((mastery) => <MasteryCard key={mastery.id} mastery={mastery} />)
              )}
            </section>
          </>
        )}
      </div>
    </AppShell>
  );
}
