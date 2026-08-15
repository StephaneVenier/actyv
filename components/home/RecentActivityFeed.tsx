import Link from 'next/link';
import type { Route } from 'next';

export type RecentActivityItem = {
  id: string;
  href: Route;
  kind: 'activity' | 'workout' | 'mastery';
  title: string;
  subtitle: string;
  metaLabel: string;
  timestamp: string;
  accent: 'sport' | 'workout' | 'mastery';
  badgeLabel: string;
};

export type MonthlySummaryItem = {
  label: string;
  value: string;
  unit?: string | null;
};

type RecentActivityFeedProps = {
  loading: boolean;
  items: RecentActivityItem[];
  monthlySummary: MonthlySummaryItem[];
};

const FEED_ACCENT_LABELS: Record<RecentActivityItem['accent'], string> = {
  sport: 'ACT',
  workout: 'FIT',
  mastery: 'XP',
};

export function RecentActivityFeed({ loading, items, monthlySummary }: RecentActivityFeedProps) {
  return (
    <section className="card home-recent-feed">
      <div className="home-recent-feed__header">
        <h2>MON ACTIVITE RECENTE</h2>

        <Link href="/historique" className="home-recent-feed__link">
          Voir tout
        </Link>
      </div>

      {loading ? (
        <div className="home-recent-feed__empty">
          <p>Chargement de ton activite recente...</p>
        </div>
      ) : items.length === 0 ? (
        <div className="home-recent-feed__empty">
          <p>Aucune activite recente</p>
          <span>Tes prochaines activites et seances apparaitront ici.</span>
        </div>
      ) : (
        <div className="home-recent-feed__list">
          {items.map((item) => (
            <Link key={item.id} href={item.href} className={`home-recent-row home-recent-row--${item.accent}`}>
              <div className="home-recent-row__icon" aria-hidden="true">
                <span>{FEED_ACCENT_LABELS[item.accent]}</span>
              </div>

              <div className="home-recent-row__copy">
                <div className="home-recent-row__topline">
                  <strong>{item.title}</strong>
                  <span>{item.metaLabel}</span>
                </div>

                <p>{item.subtitle}</p>
              </div>

              <div className="home-recent-row__aside">
                <small>{item.badgeLabel}</small>
                <span aria-hidden="true">›</span>
              </div>
            </Link>
          ))}
        </div>
      )}

      <Link href="/historique" className="button ghost home-recent-feed__cta">
        Voir tout l&apos;historique
      </Link>

      <div className="home-month-summary">
        <div className="home-month-summary__header">
          <h3>RÉSUMÉ DU MOIS</h3>
        </div>

        <div className="home-month-summary__grid">
          {monthlySummary.map((item) => (
            <div key={item.label} className="home-month-summary__item">
              <div className="home-month-summary__value-row">
                <strong>{loading ? '...' : item.value}</strong>
                {item.unit ? <span>{item.unit}</span> : null}
              </div>
              <small>{item.label}</small>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
