import { AppShell } from '@/components/AppShell';

export default function LeaderboardPage() {
  return (
    <AppShell>
      <section className="card stack">
        <div>
          <span className="section-kicker">Classements</span>
          <h1>Classements</h1>
          <p className="muted">
            Les classements Actyv arrivent bientot. Cette page servira de base pour les
            classements globaux et par challenge.
          </p>
        </div>

        <div className="challenge-state">
          <p>Aucun classement disponible pour le moment.</p>
        </div>
      </section>
    </AppShell>
  );
}
