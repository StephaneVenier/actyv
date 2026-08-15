'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import {
  formatHistoryMonthLabel,
  formatHistoryNumber,
  formatHistoryDistanceValue,
  getHistoryMonthKey,
  loadHistoryWindow,
  normalizeHistoryText,
  type HistoryEvent,
  type HistoryEventType,
} from '@/lib/history';
import { supabase } from '@/lib/supabase';

type HistoryFilterType = 'all' | HistoryEventType;

type HistoryState = {
  loading: boolean;
  loadingMore: boolean;
  authRequired: boolean;
  errorMessage: string;
  events: HistoryEvent[];
  hasMore: boolean;
};

type HistoryMonthGroup = {
  key: string;
  label: string;
  events: HistoryEvent[];
  summary: string;
};

const HISTORY_TYPE_FILTERS: Array<{ value: HistoryFilterType; label: string }> = [
  { value: 'all', label: 'Tous' },
  { value: 'activity', label: 'Activites' },
  { value: 'session', label: 'Seances' },
  { value: 'mastery', label: 'Maitrises' },
];

const MONTH_OPTIONS = [
  { value: 'all', label: 'Tous les mois' },
  { value: '01', label: 'Janvier' },
  { value: '02', label: 'Fevrier' },
  { value: '03', label: 'Mars' },
  { value: '04', label: 'Avril' },
  { value: '05', label: 'Mai' },
  { value: '06', label: 'Juin' },
  { value: '07', label: 'Juillet' },
  { value: '08', label: 'Aout' },
  { value: '09', label: 'Septembre' },
  { value: '10', label: 'Octobre' },
  { value: '11', label: 'Novembre' },
  { value: '12', label: 'Decembre' },
] as const;

const HISTORY_MONTH_WINDOW = 3;

function addMonths(date: Date, amount: number) {
  return new Date(date.getFullYear(), date.getMonth() + amount, 1);
}

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function getHistoryWindowBounds(monthsLoaded: number) {
  const now = new Date();
  const currentMonthStart = startOfMonth(now);
  const start = addMonths(currentMonthStart, -(monthsLoaded - 1));
  const end = addMonths(currentMonthStart, 1);

  return {
    startInclusiveIso: start.toISOString(),
    endExclusiveIso: end.toISOString(),
    currentMonthKey: getHistoryMonthKey(now.toISOString()),
  };
}

function buildMonthSummary(events: HistoryEvent[]) {
  const activityEvents = events.filter((event) => event.type === 'activity');
  const totalDistance = activityEvents.reduce((sum, event) => {
    const distance = Number(event.distanceKm || 0);
    return sum + (Number.isFinite(distance) ? distance : 0);
  }, 0);

  if (activityEvents.length > 0 && totalDistance > 0) {
    return `${formatHistoryNumber(activityEvents.length)} activite${activityEvents.length > 1 ? 's' : ''} • ${formatHistoryDistanceValue(totalDistance)} km`;
  }

  return `${formatHistoryNumber(events.length)} evenement${events.length > 1 ? 's' : ''}`;
}

function createMonthGroups(events: HistoryEvent[], currentMonthKey: string, includeCurrentEmptyMonth: boolean) {
  const grouped = new Map<string, HistoryEvent[]>();

  events.forEach((event) => {
    const key = getHistoryMonthKey(event.timestamp);
    const current = grouped.get(key) || [];
    current.push(event);
    grouped.set(key, current);
  });

  if (includeCurrentEmptyMonth && !grouped.has(currentMonthKey)) {
    grouped.set(currentMonthKey, []);
  }

  return Array.from(grouped.entries())
    .sort((left, right) => right[0].localeCompare(left[0]))
    .map(([key, monthEvents]) => ({
      key,
      label: formatHistoryMonthLabel(key),
      events: monthEvents,
      summary: buildMonthSummary(monthEvents),
    }));
}

function getDefaultHistoryState(): HistoryState {
  return {
    loading: true,
    loadingMore: false,
    authRequired: false,
    errorMessage: '',
    events: [],
    hasMore: false,
  };
}

function HistoryEventRow({ event }: { event: HistoryEvent }) {
  const className = `home-recent-row history-entry-row home-recent-row--${event.accent}`;
  const content = (
    <>
      <div className="home-recent-row__icon history-entry-row__icon" aria-hidden="true">
        <span>{event.badgeLabel.slice(0, 3).toUpperCase()}</span>
      </div>

      <div className="home-recent-row__copy">
        <div className="home-recent-row__topline">
          <strong>{event.title}</strong>
          <span>{event.metaLabel}</span>
        </div>

        <p>{event.subtitle}</p>
      </div>

      <div className="home-recent-row__aside">
        <small>{event.badgeLabel}</small>
        {event.href ? <span aria-hidden="true">›</span> : <span className="history-entry-row__dot" aria-hidden="true">•</span>}
      </div>
    </>
  );

  if (event.href) {
    return (
      <Link href={event.href} className={className}>
        {content}
      </Link>
    );
  }

  return <article className={`${className} history-entry-row--static`}>{content}</article>;
}

export function HistoryPageClient() {
  const [historyState, setHistoryState] = useState<HistoryState>(getDefaultHistoryState);
  const [monthsLoaded, setMonthsLoaded] = useState(HISTORY_MONTH_WINDOW);
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<HistoryFilterType>('all');
  const [sportFilter, setSportFilter] = useState('all');
  const [monthFilter, setMonthFilter] = useState('all');
  const [yearFilter, setYearFilter] = useState('all');

  useEffect(() => {
    let cancelled = false;

    async function fetchHistory() {
      const isInitial = monthsLoaded === HISTORY_MONTH_WINDOW;
      setHistoryState((current) => ({
        ...current,
        loading: isInitial,
        loadingMore: !isInitial,
        errorMessage: '',
      }));

      try {
        const {
          data: { user },
          error: authError,
        } = await supabase.auth.getUser();

        if (authError) {
          throw authError;
        }

        if (!user) {
          if (!cancelled) {
            setHistoryState({
              ...getDefaultHistoryState(),
              loading: false,
              authRequired: true,
            });
          }
          return;
        }

        const windowBounds = getHistoryWindowBounds(monthsLoaded);
        const result = await loadHistoryWindow({
          userId: user.id,
          userEmail: user.email || null,
          startInclusiveIso: windowBounds.startInclusiveIso,
          endExclusiveIso: windowBounds.endExclusiveIso,
        });

        if (!cancelled) {
          setHistoryState({
            loading: false,
            loadingMore: false,
            authRequired: false,
            errorMessage: '',
            events: result.events,
            hasMore: result.hasMore,
          });
        }
      } catch (error) {
        console.error("Erreur chargement historique Actyv :", error);
        if (!cancelled) {
          setHistoryState({
            ...getDefaultHistoryState(),
            loading: false,
            loadingMore: false,
            errorMessage: "Impossible de charger ton historique pour le moment.",
          });
        }
      }
    }

    void fetchHistory();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(() => {
      void fetchHistory();
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, [monthsLoaded]);

  const availableSports = useMemo(() => {
    return Array.from(
      new Set(
        historyState.events
          .map((event) => event.sport?.trim())
          .filter((sport): sport is string => Boolean(sport))
      )
    ).sort((left, right) => left.localeCompare(right, 'fr'));
  }, [historyState.events]);

  const availableYears = useMemo(() => {
    const years = Array.from(
      new Set(
        historyState.events.map((event) => {
          const date = new Date(event.timestamp);
          return String(date.getFullYear());
        })
      )
    ).sort((left, right) => Number(right) - Number(left));

    const currentYear = String(new Date().getFullYear());
    return years.includes(currentYear) ? years : [currentYear, ...years].filter((value, index, array) => array.indexOf(value) === index);
  }, [historyState.events]);

  const normalizedSearch = normalizeHistoryText(searchQuery);
  const filtersActive =
    normalizedSearch.length > 0 ||
    typeFilter !== 'all' ||
    sportFilter !== 'all' ||
    monthFilter !== 'all' ||
    yearFilter !== 'all';

  const filteredEvents = useMemo(() => {
    return historyState.events.filter((event) => {
      if (typeFilter !== 'all' && event.type !== typeFilter) return false;
      if (sportFilter !== 'all' && normalizeHistoryText(event.sport) !== normalizeHistoryText(sportFilter)) return false;

      const date = new Date(event.timestamp);
      const eventMonth = String(date.getMonth() + 1).padStart(2, '0');
      const eventYear = String(date.getFullYear());

      if (monthFilter !== 'all' && eventMonth !== monthFilter) return false;
      if (yearFilter !== 'all' && eventYear !== yearFilter) return false;
      if (normalizedSearch && !event.searchText.includes(normalizedSearch)) return false;
      return true;
    });
  }, [historyState.events, monthFilter, normalizedSearch, sportFilter, typeFilter, yearFilter]);

  const currentMonthKey = getHistoryWindowBounds(monthsLoaded).currentMonthKey;
  const monthGroups = useMemo<HistoryMonthGroup[]>(() => {
    return createMonthGroups(filteredEvents, currentMonthKey, !filtersActive);
  }, [currentMonthKey, filteredEvents, filtersActive]);

  const showGlobalEmpty = !historyState.loading && !historyState.authRequired && historyState.events.length === 0;
  const showFilteredEmpty = !historyState.loading && historyState.events.length > 0 && filteredEvents.length === 0;

  const handleResetFilters = () => {
    setSearchQuery('');
    setTypeFilter('all');
    setSportFilter('all');
    setMonthFilter('all');
    setYearFilter('all');
  };

  return (
    <div className="page-shell history-page-shell">
      <section className="card history-page-card">
        <div className="history-page-card__header">
          <Link href="/" className="detail-back-link">
            ← Retour a l&apos;accueil
          </Link>

          <div className="history-page-card__title">
            <span className="section-kicker">Historique</span>
            <h1>Historique</h1>
            <p>Toutes tes activites et progressions</p>
          </div>
        </div>

        <div className="history-filters">
          <label className="history-search">
            <span className="sr-only">Rechercher dans mon historique</span>
            <input
              type="search"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Rechercher dans mon historique"
            />
          </label>

          <div className="history-type-chips" role="tablist" aria-label="Filtrer l'historique par type">
            {HISTORY_TYPE_FILTERS.map((filter) => (
              <button
                key={filter.value}
                type="button"
                className={typeFilter === filter.value ? 'history-chip is-active' : 'history-chip'}
                onClick={() => setTypeFilter(filter.value)}
              >
                {filter.label}
              </button>
            ))}
          </div>

          <div className="history-selects">
            <label className="history-select">
              <span>Mois</span>
              <select value={monthFilter} onChange={(event) => setMonthFilter(event.target.value)}>
                {MONTH_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="history-select">
              <span>Annee</span>
              <select value={yearFilter} onChange={(event) => setYearFilter(event.target.value)}>
                <option value="all">Toutes les annees</option>
                {availableYears.map((year) => (
                  <option key={year} value={year}>
                    {year}
                  </option>
                ))}
              </select>
            </label>

            <label className="history-select">
              <span>Sport</span>
              <select value={sportFilter} onChange={(event) => setSportFilter(event.target.value)}>
                <option value="all">Tous les sports</option>
                {availableSports.map((sport) => (
                  <option key={sport} value={sport}>
                    {sport}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {filtersActive ? (
            <button type="button" className="history-reset-link" onClick={handleResetFilters}>
              Reinitialiser
            </button>
          ) : null}
        </div>

        {historyState.authRequired ? (
          <div className="home-recent-feed__empty history-page-card__empty">
            <p>Connecte-toi pour voir ton historique</p>
            <span>Retrouve toutes tes activites, seances et progressions dans Actyv.</span>
            <Link href="/login" className="button primary">
              Se connecter
            </Link>
          </div>
        ) : historyState.errorMessage ? (
          <div className="home-recent-feed__empty history-page-card__empty">
            <p>{historyState.errorMessage}</p>
          </div>
        ) : historyState.loading ? (
          <div className="home-recent-feed__empty history-page-card__empty">
            <p>Chargement de ton historique...</p>
            <span>On remonte le fil de tes activites Actyv.</span>
          </div>
        ) : showGlobalEmpty ? (
          <div className="home-recent-feed__empty history-page-card__empty">
            <p>Aucun historique pour le moment</p>
            <span>Tes activites, seances et progressions apparaitront ici.</span>
          </div>
        ) : showFilteredEmpty ? (
          <div className="home-recent-feed__empty history-page-card__empty">
            <p>Aucun resultat</p>
            <span>Essaie de modifier tes filtres.</span>
            <button type="button" className="button ghost" onClick={handleResetFilters}>
              Reinitialiser
            </button>
          </div>
        ) : (
          <div className="history-months">
            {monthGroups.map((group) => (
              <section key={group.key} className="history-month-group">
                <header className="history-month-group__header">
                  <h2>{group.label}</h2>
                  <span>{group.summary}</span>
                </header>

                {group.events.length === 0 ? (
                  <div className="history-month-group__empty">
                    <span>Aucun evenement pour ce mois.</span>
                  </div>
                ) : (
                  <div className="home-recent-feed__list history-month-group__list">
                    {group.events.map((event) => (
                      <HistoryEventRow key={event.id} event={event} />
                    ))}
                  </div>
                )}
              </section>
            ))}

            {historyState.hasMore ? (
              <button
                type="button"
                className="button ghost history-load-more"
                onClick={() => setMonthsLoaded((value) => value + HISTORY_MONTH_WINDOW)}
                disabled={historyState.loadingMore}
              >
                {historyState.loadingMore ? 'Chargement...' : 'Charger plus'}
              </button>
            ) : null}
          </div>
        )}
      </section>
    </div>
  );
}
