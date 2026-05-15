'use client';

import Link from 'next/link';
import { AppShell } from '@/components/AppShell';

export default function NewSessionPlaceholderPage() {
  return (
    <AppShell>
      <div className="placeholder-page">
        <section className="card placeholder-card">
          <span className="section-kicker">Seances</span>
          <h1>Creer une seance</h1>
          <p className="muted">
            Cette creation rapide arrive bientot. En attendant, tu peux continuer a creer des
            challenges et ajouter tes activites.
          </p>

          <div className="placeholder-actions">
            <Link href="/activities/new" className="button primary">
              Ajouter une activite
            </Link>
            <Link href="/leaderboard" className="button ghost">
              Voir les classements
            </Link>
          </div>
        </section>
      </div>
    </AppShell>
  );
}
