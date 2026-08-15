'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { AppShell } from '@/components/AppShell';
import { useLiveTracking } from '@/hooks/useLiveTracking';
import { useScreenWakeLock } from '@/hooks/useScreenWakeLock';
import { LIVE_SPORT_CONFIG, type LiveSportConfig } from '@/lib/live-tracking/config';
import { generateDebugGpsPoint, generateDebugTrace } from '@/lib/live-tracking/debug';
import {
  formatDistanceKm,
  formatDuration,
  formatElevation,
  formatPace,
  formatSpeedKmh,
} from '@/lib/live-tracking/format';
import type { LiveActivitySport } from '@/lib/live-tracking/types';

const SPORT_OPTIONS = Object.values(LIVE_SPORT_CONFIG);

function getGpsStatusLabel(status: string) {
  switch (status) {
    case 'excellent':
      return 'GPS excellent';
    case 'good':
      return 'GPS bon';
    case 'poor':
      return 'GPS faible';
    default:
      return 'GPS en recherche';
  }
}

function getMetricLabels(config: LiveSportConfig) {
  if (config.primaryMetric === 'pace') {
    return {
      live: 'Allure',
      average: 'Allure moy.',
    };
  }

  return {
    live: 'Vitesse',
    average: 'Vitesse moy.',
  };
}

export default function LiveActivityPageClient() {
  const searchParams = useSearchParams();
  const debugModeEnabled = searchParams.get('debugGps') === '1';
  const [selectedSport, setSelectedSport] = useState<LiveActivitySport>('course-a-pied');

  const {
    state,
    activeDurationMs,
    summary,
    restorableSession,
    start,
    pause,
    resume,
    finish,
    reset,
    ingestGpsPoint,
    restoreSession,
    discardSession,
  } = useLiveTracking();

  useScreenWakeLock(state.status === 'running');

  const currentSport = state.status === 'idle' ? selectedSport : state.sport;
  const currentSportConfig = LIVE_SPORT_CONFIG[currentSport];
  const metricLabels = getMetricLabels(currentSportConfig);

  const primaryMetricValue = useMemo(() => {
    if (currentSportConfig.primaryMetric === 'pace') {
      return formatPace(state.currentPaceSecondsPerKm);
    }

    return formatSpeedKmh(state.currentSpeedKmh);
  }, [currentSportConfig.primaryMetric, state.currentPaceSecondsPerKm, state.currentSpeedKmh]);

  const secondaryMetricValue = useMemo(() => {
    if (currentSportConfig.primaryMetric === 'pace') {
      return formatPace(state.averagePaceSecondsPerKm);
    }

    return formatSpeedKmh(state.averageSpeedKmh);
  }, [currentSportConfig.primaryMetric, state.averagePaceSecondsPerKm, state.averageSpeedKmh]);

  const injectDebugPoints = (
    sport: LiveActivitySport,
    stepsCount: number,
    options?: Parameters<typeof generateDebugTrace>[3]
  ) => {
    const trace = generateDebugTrace(state.lastPoint, sport, stepsCount, options);
    trace.forEach((point) => ingestGpsPoint(point));
  };

  const injectSingleDebugPoint = (
    sport: LiveActivitySport,
    options?: Parameters<typeof generateDebugGpsPoint>[2]
  ) => {
    ingestGpsPoint(generateDebugGpsPoint(state.lastPoint, sport, options));
  };

  return (
    <AppShell>
      <section className="live-activity-page">
        <article className="card live-activity-shell">
          <div className="live-activity-shell__header">
            <div className="stack" style={{ gap: '0.5rem' }}>
              <span className="badge">Live</span>
              <h1 className="live-activity-shell__title">Activité Live</h1>
              <p className="live-activity-shell__subtitle">
                Prépare une vraie sortie terrain avec suivi local, chrono robuste et reprise en cas de retour dans l&apos;app.
              </p>
            </div>

            <Link href="/activities/new" className="button ghost live-activity-shell__link">
              Retour aux activités
            </Link>
          </div>

          {restorableSession && state.status === 'idle' ? (
            <section className="live-activity-restore-card">
              <div className="stack" style={{ gap: '0.35rem' }}>
                <span className="section-kicker">Session trouvée</span>
                <h2>Une activité est déjà en cours</h2>
                <p>
                  {LIVE_SPORT_CONFIG[restorableSession.state.sport].label} •{' '}
                  {formatDistanceKm(restorableSession.state.distanceM)} •{' '}
                  {formatDuration(
                    Math.max(
                      0,
                      (restorableSession.state.pausedAtMs || Date.now()) -
                        (restorableSession.state.startedAtMs || Date.now()) -
                        restorableSession.state.accumulatedPausedMs
                    )
                  )}
                </p>
              </div>

              <div className="live-activity-actions">
                <button type="button" className="button primary" onClick={restoreSession}>
                  Reprendre
                </button>
                <button
                  type="button"
                  className="button ghost"
                  onClick={() => discardSession(selectedSport)}
                >
                  Abandonner
                </button>
              </div>
            </section>
          ) : null}

          {state.status === 'idle' && (
            <section className="live-activity-idle">
              <div className="live-activity-sport-grid" role="radiogroup" aria-label="Choix du sport live">
                {SPORT_OPTIONS.map((sport) => {
                  const active = selectedSport === sport.slug;
                  return (
                    <button
                      key={sport.slug}
                      type="button"
                      className={active ? 'live-sport-chip is-active' : 'live-sport-chip'}
                      onClick={() => setSelectedSport(sport.slug)}
                      aria-pressed={active}
                    >
                      <strong>{sport.label}</strong>
                      <span>{sport.primaryMetric === 'pace' ? 'Allure' : 'Vitesse'}</span>
                    </button>
                  );
                })}
              </div>

              <div className="live-activity-actions live-activity-actions--start">
                <button
                  type="button"
                  className="button primary live-activity-start-button"
                  onClick={() => start(selectedSport)}
                >
                  Démarrer
                </button>
              </div>
            </section>
          )}

          {(state.status === 'running' || state.status === 'paused') && (
            <section className="live-activity-dashboard">
              <div className="live-activity-dashboard__status-row">
                <div className="stack" style={{ gap: '0.28rem' }}>
                  <span className="section-kicker">{LIVE_SPORT_CONFIG[state.sport].label}</span>
                  <strong className="live-activity-dashboard__status">
                    {state.status === 'paused' ? 'En pause' : 'En cours'}
                  </strong>
                </div>
                <span className={`live-gps-pill live-gps-pill--${state.gpsStatus}`}>
                  {getGpsStatusLabel(state.gpsStatus)}
                </span>
              </div>

              <div className="live-activity-dashboard__hero-metric">
                <span className="live-activity-dashboard__hero-label">Temps actif</span>
                <strong>{formatDuration(activeDurationMs)}</strong>
              </div>

              <div className="live-activity-dashboard__hero-metric">
                <span className="live-activity-dashboard__hero-label">Distance</span>
                <strong>{formatDistanceKm(state.distanceM)}</strong>
              </div>

              <div className="live-activity-metric-grid">
                <div className="live-activity-metric-card">
                  <span>{metricLabels.live}</span>
                  <strong>{primaryMetricValue}</strong>
                </div>
                <div className="live-activity-metric-card">
                  <span>{metricLabels.average}</span>
                  <strong>{secondaryMetricValue}</strong>
                </div>
                <div className="live-activity-metric-card">
                  <span>D+</span>
                  <strong>{formatElevation(state.elevationGainM)}</strong>
                </div>
              </div>

              <div className="live-activity-actions">
                {state.status === 'running' ? (
                  <button type="button" className="button primary" onClick={pause}>
                    Pause
                  </button>
                ) : (
                  <button type="button" className="button primary" onClick={resume}>
                    Reprendre
                  </button>
                )}
                <button type="button" className="button ghost" onClick={finish}>
                  Terminer
                </button>
              </div>
            </section>
          )}

          {state.status === 'finished' && summary && (
            <section className="live-activity-summary">
              <div className="stack" style={{ gap: '0.35rem' }}>
                <span className="section-kicker">Résumé local</span>
                <h2>{LIVE_SPORT_CONFIG[summary.sport].label}</h2>
              </div>

              <div className="live-activity-summary__grid">
                <div className="live-activity-metric-card">
                  <span>Distance</span>
                  <strong>{formatDistanceKm(summary.distanceM)}</strong>
                </div>
                <div className="live-activity-metric-card">
                  <span>Temps</span>
                  <strong>{formatDuration(summary.activeDurationMs)}</strong>
                </div>
                <div className="live-activity-metric-card">
                  <span>
                    {LIVE_SPORT_CONFIG[summary.sport].primaryMetric === 'pace'
                      ? 'Allure moyenne'
                      : 'Vitesse moyenne'}
                  </span>
                  <strong>
                    {LIVE_SPORT_CONFIG[summary.sport].primaryMetric === 'pace'
                      ? formatPace(summary.averagePaceSecondsPerKm)
                      : formatSpeedKmh(summary.averageSpeedKmh)}
                  </strong>
                </div>
                <div className="live-activity-metric-card">
                  <span>D+</span>
                  <strong>{formatElevation(summary.elevationGainM)}</strong>
                </div>
                <div className="live-activity-metric-card">
                  <span>D-</span>
                  <strong>-{Math.max(0, Math.round(summary.elevationLossM))} m</strong>
                </div>
                <div className="live-activity-metric-card">
                  <span>Points GPS</span>
                  <strong>{summary.pointCount}</strong>
                </div>
              </div>

              <div className="live-activity-actions">
                <button type="button" className="button primary" onClick={() => reset(selectedSport)}>
                  Nouvelle activité
                </button>
                <button type="button" className="button ghost" onClick={() => reset(selectedSport)}>
                  Effacer
                </button>
              </div>
            </section>
          )}

          {debugModeEnabled && (
            <section className="live-debug-panel">
              <div className="stack" style={{ gap: '0.35rem' }}>
                <span className="section-kicker">Mode debug GPS</span>
                <h2>Simulation locale</h2>
                <p>
                  Injecte des points cohérents pour tester le moteur sans plugin Android ni réseau.
                </p>
              </div>

              <div className="live-debug-panel__grid">
                <button
                  type="button"
                  className="button ghost"
                  onClick={() => injectSingleDebugPoint(currentSport)}
                >
                  Injecter 1 point
                </button>
                <button
                  type="button"
                  className="button ghost"
                  onClick={() => injectDebugPoints(currentSport, 6)}
                >
                  Simuler {LIVE_SPORT_CONFIG[currentSport].primaryMetric === 'pace' ? 'CAP' : 'Vélo'} × 6
                </button>
                <button
                  type="button"
                  className="button ghost"
                  onClick={() =>
                    injectDebugPoints(currentSport, 4, {
                      stationary: true,
                    })
                  }
                >
                  Simuler arrêt / dérive faible
                </button>
                <button
                  type="button"
                  className="button ghost"
                  onClick={() =>
                    injectSingleDebugPoint(currentSport, {
                      accuracy: 55,
                    })
                  }
                >
                  Mauvaise accuracy
                </button>
                <button
                  type="button"
                  className="button ghost"
                  onClick={() =>
                    injectDebugPoints('course-a-pied', 8, {
                      altitudeDeltaMultiplier: 1.4,
                    })
                  }
                >
                  Simuler CAP vallonné
                </button>
                <button
                  type="button"
                  className="button ghost"
                  onClick={() => injectDebugPoints('velo', 8)}
                >
                  Simuler Vélo × 8
                </button>
              </div>
            </section>
          )}
        </article>
      </section>
    </AppShell>
  );
}
