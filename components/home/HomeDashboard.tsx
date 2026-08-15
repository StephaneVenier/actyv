import Link from 'next/link';
import type { Route } from 'next';
import type { CSSProperties } from 'react';

export type HomeDashboardStat = {
  icon: string;
  label: string;
  value: string;
  hint?: string | null;
  href: Route;
};

type HomeDashboardProps = {
  loading: boolean;
  level: number;
  totalXp: number;
  progressPercent: number;
  currentThreshold: number;
  nextThreshold: number;
  xpToNextLevel: number;
  stats: HomeDashboardStat[];
};

function formatNumber(value: number) {
  return new Intl.NumberFormat('fr-FR').format(Math.max(0, Math.round(value)));
}

function formatPercent(value: number) {
  return `${new Intl.NumberFormat('fr-FR', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(Math.max(0, Math.round(value)))} %`;
}

type RingStyle = CSSProperties & {
  '--dashboard-progress'?: string;
};

export function HomeDashboard({
  loading,
  level,
  totalXp,
  progressPercent,
  currentThreshold,
  nextThreshold,
  xpToNextLevel,
  stats,
}: HomeDashboardProps) {
  const progressStyle: RingStyle = {
    '--dashboard-progress': `${Math.max(0, Math.min(100, progressPercent))}%`,
  };

  return (
    <section className="home-dashboard-main">
      <article className="card home-dashboard-summary">
        <div className="home-dashboard-summary__header">
          <span className="section-kicker home-dashboard-summary__kicker">ACTYV DASHBOARD</span>
        </div>

        <div className="home-dashboard-summary__body">
          <div className="home-dashboard-summary__ring-wrap">
            <div className="home-dashboard-summary__ring" style={progressStyle}>
              <div className="home-dashboard-summary__ring-inner">
                <strong>{loading ? '--' : formatPercent(progressPercent)}</strong>
                <span>du niveau</span>
              </div>
            </div>
          </div>

          <div className="home-dashboard-summary__main">
            <div className="home-dashboard-summary__level-row">
              <strong>{loading ? 'Chargement...' : `Niveau ${level}`}</strong>
            </div>

            <div className="home-dashboard-summary__xp-row">
              <strong>{loading ? '...' : `${formatNumber(totalXp)} XP`}</strong>
            </div>

            <div className="progress-bar home-dashboard-summary__bar" aria-hidden="true">
              <div style={{ width: `${Math.max(0, Math.min(100, progressPercent))}%` }} />
            </div>

            <span className="home-dashboard-summary__progress-copy">
              {loading ? 'Chargement...' : `${formatNumber(currentThreshold)} / ${formatNumber(nextThreshold)} XP`}
            </span>
          </div>

          <div className="home-dashboard-summary__aside">
            <div className="home-dashboard-summary__meta">
              <strong>{loading ? '--' : `${formatNumber(xpToNextLevel)} XP`}</strong>
              <span>avant le niveau suivant</span>
            </div>
          </div>
        </div>

        <div className="home-dashboard-stats-grid">
          {stats.map((stat) => (
            <Link key={stat.label} href={stat.href} className="home-dashboard-stat-card">
              <div className="home-dashboard-stat-card__top">
                <span className="home-dashboard-stat-card__icon" aria-hidden="true">
                  {stat.icon}
                </span>
                <small>{stat.label}</small>
              </div>
              <strong>{loading ? '...' : stat.value}</strong>
              {stat.hint ? <span>{stat.hint}</span> : null}
            </Link>
          ))}
        </div>
      </article>
    </section>
  );
}
