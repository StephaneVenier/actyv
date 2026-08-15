import Link from 'next/link';
import type { Route } from 'next';
import type { CSSProperties } from 'react';

export type HomeDashboardStat = {
  label: string;
  value: string;
  hint: string;
  href: Route;
};

type HomeDashboardProps = {
  loading: boolean;
  title: string;
  subtitle: string;
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
  title,
  subtitle,
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
          <div>
            <span className="section-kicker">Actyv dashboard</span>
            <h1>{title}</h1>
          </div>
          <span className="home-dashboard-summary__eyebrow">Niveau {loading ? '...' : level}</span>
        </div>

        <div className="home-dashboard-summary__body">
          <div className="home-dashboard-summary__copy">
            <p className="home-dashboard-summary__subtitle">{subtitle}</p>

            <div className="home-dashboard-summary__level-row">
              <span>Niveau actuel</span>
              <strong>{loading ? 'Chargement...' : `Niveau ${level}`}</strong>
            </div>

            <div className="home-dashboard-summary__xp-row">
              <strong>{loading ? '...' : `${formatNumber(totalXp)} XP`}</strong>
              <span>
                {loading ? 'Chargement...' : `${formatNumber(currentThreshold)} / ${formatNumber(nextThreshold)} XP`}
              </span>
            </div>

            <div className="progress-bar home-dashboard-summary__bar" aria-hidden="true">
              <div style={{ width: `${Math.max(0, Math.min(100, progressPercent))}%` }} />
            </div>

            <div className="home-dashboard-summary__meta">
              <span>{loading ? '--' : formatPercent(progressPercent)}</span>
              <span>
                {loading ? 'Chargement...' : `${formatNumber(xpToNextLevel)} XP avant le prochain niveau`}
              </span>
            </div>
          </div>

          <div className="home-dashboard-summary__ring-wrap">
            <div className="home-dashboard-summary__ring" style={progressStyle}>
              <div className="home-dashboard-summary__ring-inner">
                <strong>{loading ? '--' : formatPercent(progressPercent)}</strong>
                <span>Progression</span>
              </div>
            </div>
          </div>
        </div>
      </article>

      <div className="home-dashboard-stats-grid">
        {stats.map((stat) => (
          <Link key={stat.label} href={stat.href} className="home-dashboard-stat-card">
            <span>{stat.label}</span>
            <strong>{loading ? '...' : stat.value}</strong>
            <small>{stat.hint}</small>
          </Link>
        ))}
      </div>
    </section>
  );
}
