'use client';

import Link from 'next/link';
import { useEffect, useState, type ReactNode } from 'react';
import { AppShell } from '@/components/AppShell';
import { UserLevelBadge } from '@/components/user-level-badge';
import { supabase } from '@/lib/supabase';
import { loadUserStatistics, type UserStatisticsSummary } from '@/lib/user-statistics';

function formatNumber(value: number) {
  return new Intl.NumberFormat('fr-FR', {
    maximumFractionDigits: 0,
  }).format(Math.max(0, Math.round(value || 0)));
}

function formatDistance(value: number) {
  return `${new Intl.NumberFormat('fr-FR', {
    maximumFractionDigits: 1,
  }).format(Math.max(0, value || 0))} km`;
}

function formatDuration(totalMinutes: number) {
  const normalizedMinutes = Math.max(0, Math.round(totalMinutes || 0));
  if (normalizedMinutes < 60) {
    return `${formatNumber(normalizedMinutes)} min`;
  }

  const hours = Math.floor(normalizedMinutes / 60);
  const minutes = normalizedMinutes % 60;
  return `${hours} h ${minutes > 0 ? `${minutes.toString().padStart(2, '0')} min` : ''}`.trim();
}

function formatDurationFromSeconds(totalSeconds: number) {
  return formatDuration((totalSeconds || 0) / 60);
}

function formatSteps(steps: number) {
  return `${formatNumber(steps)} pas`;
}

function formatDateLabel(dateString: string) {
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: 'short',
  });
}

function StatTile({
  label,
  value,
  helper,
}: {
  label: string;
  value: string;
  helper?: string;
}) {
  return (
    <article className="stats-metric-card">
      <span>{label}</span>
      <strong>{value}</strong>
      {helper ? <small>{helper}</small> : null}
    </article>
  );
}

function StatsSection({
  kicker,
  title,
  subtitle,
  children,
}: {
  kicker: string;
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <article className="card stats-section-card">
      <div className="stats-section-header">
        <div>
          <span className="section-kicker">{kicker}</span>
          <h2>{title}</h2>
          {subtitle ? <p className="muted">{subtitle}</p> : null}
        </div>
      </div>
      {children}
    </article>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="challenge-state challenge-state--compact">
      <p>{message}</p>
    </div>
  );
}

export default function StatsPage() {
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [summary, setSummary] = useState<UserStatisticsSummary | null>(null);

  useEffect(() => {
    let isActive = true;

    const loadStats = async () => {
      setLoading(true);
      setMessage(null);

      try {
        const {
          data: { user },
          error: userError,
        } = await supabase.auth.getUser();

        if (!isActive) return;

        if (userError || !user) {
          if (userError) {
            console.error('Erreur chargement user statistiques :', userError);
          }
          setSummary(null);
          setMessage('Connecte-toi pour voir tes statistiques.');
          return;
        }

        const result = await loadUserStatistics(user.id, user.email || null);
        if (!isActive) return;

        setSummary(result);
      } catch (error) {
        console.error('Erreur chargement statistiques :', error);
        if (!isActive) return;
        setSummary(null);
        setMessage('Impossible de charger tes statistiques pour le moment.');
      } finally {
        if (isActive) {
          setLoading(false);
        }
      }
    };

    loadStats();

    return () => {
      isActive = false;
    };
  }, []);

  if (loading) {
    return (
      <AppShell>
        <div className="stats-page">
          <section className="card stats-hero-card">
            <span className="section-kicker">Statistiques</span>
            <h1>Mes statistiques</h1>
            <p className="muted">Chargement de tes donnees d'entrainement...</p>
          </section>
        </div>
      </AppShell>
    );
  }

  if (!summary) {
    return (
      <AppShell>
        <div className="stats-page">
          <section className="card stats-hero-card">
            <div className="stats-hero-copy">
              <span className="section-kicker">Statistiques</span>
              <div className="stats-hero-title-row">
                <h1>Mes statistiques</h1>
                <UserLevelBadge level={1} />
              </div>
              <p className="muted">
                Toutes tes donnees d'entrainement, tes pas, tes programmes et tes challenges au meme endroit.
              </p>
            </div>
          </section>

          {message ? <p className="form-feedback form-feedback--error">{message}</p> : null}
          {!message ? <EmptyState message="Aucune statistique disponible pour le moment." /> : null}
        </div>
      </AppShell>
    );
  }

  const todayProgress = Math.min((summary.movement.todaySteps / 10000) * 100, 100);

  return (
    <AppShell>
      <div className="stats-page">
        <section className="card stats-hero-card">
          <div className="stats-hero-copy">
            <span className="section-kicker">Statistiques</span>
            <div className="stats-hero-title-row">
              <h1>Mes statistiques</h1>
              <UserLevelBadge level={summary.profile.level} />
            </div>
            <p className="muted">
              Vue compacte de toute ton activite Actyv. Cette page sert maintenant de base de lecture pour les
              prochains badges.
            </p>
          </div>

          <div className="stats-hero-meta">
            <div className="stats-hero-meta__chip">
              <span>XP total</span>
              <strong>{formatNumber(summary.profile.totalXp)} XP</strong>
            </div>
            <div className="stats-hero-meta__chip">
              <span>Niveau</span>
              <strong>{summary.profile.level}</strong>
            </div>
            <div className="stats-hero-meta__chip">
              <span>XP vers suivant</span>
              <strong>{formatNumber(summary.profile.nextLevelXp)} XP</strong>
            </div>
            <div className="stats-hero-meta__chip">
              <span>Jours actifs</span>
              <strong>{formatNumber(summary.overview.activeDays)}</strong>
            </div>
          </div>

          <div className="stats-hero-actions">
            <Link href="/profile" className="button ghost">
              Retour au profil
            </Link>
            <Link href="/sessions" className="button primary">
              Voir mes seances
            </Link>
          </div>
        </section>

        {message ? <p className="form-feedback form-feedback--error">{message}</p> : null}

        <StatsSection
          kicker="Vue globale"
          title="Tableau de bord"
          subtitle="Les indicateurs essentiels regroupes en un seul coup d'oeil."
        >
          <div className="stats-metric-grid">
            <StatTile label="Activites" value={formatNumber(summary.overview.totalActivities)} helper="Publiees" />
            <StatTile label="Distance" value={formatDistance(summary.overview.totalDistanceKm)} helper="Totale" />
            <StatTile label="Duree" value={formatDuration(summary.overview.totalDurationMinutes)} helper="Totale" />
            <StatTile label="Reps" value={formatNumber(summary.overview.totalReps)} helper="Activites" />
            <StatTile label="Seances" value={formatNumber(summary.sessions.completedWorkouts)} helper="Validees" />
            <StatTile
              label="Challenges"
              value={formatNumber(summary.challenges.createdChallenges + summary.challenges.joinedChallenges)}
              helper="Creees et rejoints"
            />
          </div>
        </StatsSection>

        <StatsSection
          kicker="Mouvement"
          title="Pas et activite quotidienne"
          subtitle="Les donnees Health Connect et les tendances principales."
        >
          <div className="stats-metric-grid">
            <StatTile label="Aujourd'hui" value={formatSteps(summary.movement.todaySteps)} helper="Objectif 10 000" />
            <StatTile label="Cette semaine" value={formatSteps(summary.movement.weeklySteps)} helper="Somme 7 jours" />
            <StatTile label="Ce mois-ci" value={formatSteps(summary.movement.monthlySteps)} helper="Somme mensuelle" />
            <StatTile label="Record journalier" value={formatSteps(summary.movement.bestDailySteps)} helper="Meilleure journee" />
            <StatTile label="Moyenne" value={formatSteps(summary.movement.averageDailySteps)} helper="Par jour actif" />
            <StatTile label="Sync Health Connect" value={formatNumber(summary.movement.healthConnectSyncs)} helper="Synchronisations" />
          </div>

          <div className="stats-progress-card">
            <div className="stats-progress-card__top">
              <span>Progression vers 10 000 pas</span>
              <strong>{formatNumber(todayProgress)} %</strong>
            </div>
            <div className="progress-bar stats-progress-card__bar" aria-hidden="true">
              <span className="progress-fill" style={{ width: `${todayProgress}%` }} />
            </div>
            <p className="muted">
              {summary.movement.todaySteps > 0
                ? `${formatSteps(summary.movement.todaySteps)} aujourd'hui.`
                : "Aucun pas synchronise aujourd'hui."}
            </p>
          </div>
        </StatsSection>

        <StatsSection
          kicker="Activites"
          title="Activites sportives"
          subtitle="Repartition par sport et volume global des activites."
        >
          <div className="stats-metric-grid">
            <StatTile
              label="Sport le plus pratique"
              value={summary.overview.activitiesBySport[0]?.sport || 'Aucune donnee'}
              helper="Par activite"
            />
            <StatTile label="Activites total" value={formatNumber(summary.overview.totalActivities)} helper="Toutes confondues" />
            <StatTile label="Distance totale" value={formatDistance(summary.overview.totalDistanceKm)} helper="Activites" />
            <StatTile label="Duree totale" value={formatDuration(summary.overview.totalDurationMinutes)} helper="Activites" />
          </div>

          {summary.overview.activitiesBySport.length === 0 ? (
            <EmptyState message="Aucune activite par sport pour le moment." />
          ) : (
            <div className="stats-sport-list">
              {summary.overview.activitiesBySport.slice(0, 6).map((sport) => (
                <article key={sport.sport} className="stats-sport-item">
                  <div>
                    <strong>{sport.sport}</strong>
                    <span>{formatNumber(sport.count)} activite{sport.count > 1 ? 's' : ''}</span>
                  </div>
                  <div className="stats-sport-item__meta">
                    {sport.distanceKm > 0 ? <span>{formatDistance(sport.distanceKm)}</span> : null}
                    {sport.durationMinutes > 0 ? <span>{formatDuration(sport.durationMinutes)}</span> : null}
                  </div>
                </article>
              ))}
            </div>
          )}
        </StatsSection>

        <StatsSection
          kicker="Seances"
          title="Seances et validation"
          subtitle="Creation, validation, volume et historique recent."
        >
          <div className="stats-metric-grid">
            <StatTile label="Crees" value={formatNumber(summary.sessions.createdSessions)} helper="Seances perso" />
            <StatTile label="Validees" value={formatNumber(summary.sessions.completedWorkouts)} helper="Historique" />
            <StatTile label="Duree" value={formatDuration(summary.sessions.totalWorkoutDurationMinutes)} helper="Totale" />
            <StatTile label="Volume" value={`${formatNumber(summary.sessions.totalVolumeKg)} kg`} helper="Total" />
            <StatTile label="Calories" value={`${formatNumber(summary.sessions.totalCalories)} kcal`} helper="Estimees" />
            <StatTile label="Exercices" value={formatNumber(summary.sessions.totalExercisesCompleted)} helper="Comptabilises" />
          </div>

          {summary.sessions.recentWorkouts.length === 0 ? (
            <EmptyState message="Aucune seance realisee pour le moment." />
          ) : (
            <div className="stats-workout-list">
              {summary.sessions.recentWorkouts.map((workout) => (
                <article key={workout.id} className="stats-workout-item">
                  <div className="stats-workout-item__head">
                    <strong>{workout.workoutName}</strong>
                    <span>{formatDateLabel(workout.completedAt)}</span>
                  </div>
                  <div className="stats-workout-item__meta">
                    <span>{formatDurationFromSeconds(workout.durationSeconds)}</span>
                    <span>{formatNumber(workout.completedExercises)} exercice{workout.completedExercises > 1 ? 's' : ''}</span>
                    <span>{formatNumber(workout.totalVolume)} kg</span>
                    {workout.estimatedCalories > 0 ? <span>{formatNumber(workout.estimatedCalories)} kcal</span> : null}
                  </div>
                </article>
              ))}
            </div>
          )}
        </StatsSection>

        <StatsSection
          kicker="Programmes"
          title="Programmes et progression"
          subtitle="Creation, imports et seances de programme realisees."
        >
          <div className="stats-metric-grid">
            <StatTile label="Crees" value={formatNumber(summary.programs.createdPrograms)} helper="Programmation perso" />
            <StatTile label="Rejoints" value={formatNumber(summary.programs.joinedPrograms)} helper="Depuis la banque" />
            <StatTile label="Termines" value={formatNumber(summary.programs.completedPrograms)} helper="Programme complet" />
            <StatTile label="Seances programme" value={formatNumber(summary.programs.completedProgramSessions)} helper="Realisees" />
            <StatTile label="Seances planifiees" value={formatNumber(summary.programs.totalProgramSessions)} helper="Dans tes programmes" />
          </div>
        </StatsSection>

        <StatsSection kicker="Challenges" title="Challenges" subtitle="Ce que tu as cree, rejoint et termine.">
          <div className="stats-metric-grid">
            <StatTile label="Crees" value={formatNumber(summary.challenges.createdChallenges)} helper="Challenges perso" />
            <StatTile label="Rejoints" value={formatNumber(summary.challenges.joinedChallenges)} helper="Participation" />
            <StatTile label="Termines" value={formatNumber(summary.challenges.completedChallenges)} helper="XP challenge_completed" />
          </div>
        </StatsSection>

        <StatsSection kicker="Social" title="Likes et boosts" subtitle="Les interactions sociales du compte.">
          <div className="stats-metric-grid">
            <StatTile label="Likes donnes" value={formatNumber(summary.social.likesGiven)} helper="Interactions" />
            <StatTile label="Likes recus" value={formatNumber(summary.social.likesReceived)} helper="Sur tes activites" />
            <StatTile label="Boosts donnes" value={formatNumber(summary.social.boostsGiven)} helper="Interactions" />
            <StatTile label="Boosts recus" value={formatNumber(summary.social.boostsReceived)} helper="Sur tes activites" />
          </div>
        </StatsSection>
      </div>
    </AppShell>
  );
}
