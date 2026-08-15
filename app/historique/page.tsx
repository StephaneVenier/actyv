import Link from 'next/link';
import { AppShell } from '@/components/AppShell';

export default function HistoriquePage() {
  return (
    <AppShell>
      <div className="page-shell">
        <section className="card profile-history-card">
          <div className="profile-history-card__header">
            <div>
              <span className="section-kicker">Historique</span>
              <h1>Historique</h1>
            </div>
          </div>

          <div className="profile-history-list">
            <div className="profile-history-item">
              <div className="profile-history-item__top">
                <strong>Cette page arrive juste apres.</strong>
              </div>
              <span>
                Le nouveau flux complet de ton activite Actyv sera detaille ici dans le prochain patch.
              </span>
            </div>

            <Link href="/" className="profile-history-item">
              <div className="profile-history-item__top">
                <strong>Retour a l&apos;accueil</strong>
              </div>
              <span>Retrouve le dashboard compact et les 5 derniers evenements.</span>
            </Link>
          </div>
        </section>
      </div>
    </AppShell>
  );
}
