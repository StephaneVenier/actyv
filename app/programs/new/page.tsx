'use client';

import Link from 'next/link';
import { AppShell } from '@/components/AppShell';

export default function NewProgramPlaceholderPage() {
  return (
    <AppShell>
      <div className="placeholder-page">
        <section className="card placeholder-card">
          <span className="section-kicker">Programmes</span>
          <h1>Creer un programme</h1>
          <p className="muted">
            Cette brique V1 est encore en preparation. On garde ici un point d'entree propre pour
            la suite, sans lancer le vrai systeme tout de suite.
          </p>

          <div className="placeholder-actions">
            <Link href="/challenges" className="button primary">
              Voir les challenges
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
