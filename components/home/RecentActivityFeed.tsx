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

type RecentActivityFeedProps = {
  loading: boolean;
  items: RecentActivityItem[];
};

const FEED_ACCENT_LABELS: Record<RecentActivityItem['accent'], string> = {
  sport: 'ACT',
  workout: 'FIT',
  mastery: 'XP',
};

export function RecentActivityFeed({ loading, items }: RecentActivityFeedProps) {
  return (
    <section className="card home-recent-feed">
      <div className="home-recent-feed__header">
        <div>
          <span className="section-kicker">Mon activite recente</span>
          <h2>MON ACTIVITE RECENTE</h2>
        </div>

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
    </section>
  );
}
