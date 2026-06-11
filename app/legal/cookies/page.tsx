'use client';

import { AppShell } from '@/components/AppShell';

export default function CookiesPage() {
  return (
    <AppShell>
      <div className="legal-page">
        <header className="legal-page__header">
          <span className="legal-page__eyebrow">Cookies et traceurs</span>
          <h1 className="legal-page__title">Gestion des cookies</h1>
          <p className="legal-page__intro">
            Cette page explique les cookies et traceurs utilises par Actyv au stade
            actuel du produit.
          </p>
        </header>

        <div className="legal-stack">
          <section className="legal-card legal-copy-stack">
            <h2>Cookies necessaires</h2>
            <p className="legal-copy">
              Actyv utilise en priorite des mecanismes techniques indispensables au
              fonctionnement du service, notamment pour l&apos;authentification, la
              gestion de session, la securite et le maintien de vos preferences
              essentielles.
            </p>
          </section>

          <section className="legal-card legal-copy-stack">
            <h2>Pas de cookies non essentiels declares a ce stade</h2>
            <p className="legal-copy">
              A ce stade, aucun cookie publicitaire ou analytique non essentiel n&apos;est
              annonce dans Actyv. Si des outils de mesure d&apos;audience ou de marketing
              sont ajoutes plus tard, un mecanisme de consentement adapte devra etre
              mis en place avant leur activation.
            </p>
          </section>

          <section className="legal-card legal-copy-stack">
            <h2>Que se passera plus tard ?</h2>
            <p className="legal-copy">
              Si Actyv integre ulterieurement des services d&apos;analyse, de personnalisation
              avancee ou d&apos;autres traceurs optionnels, cette page sera mise a jour et
              un bandeau de consentement sera ajoute avant depot des cookies non
              essentiels.
            </p>
          </section>

          <section className="legal-card legal-copy-stack">
            <h2>Contact</h2>
            <p className="legal-copy">
              Pour toute question relative aux cookies ou au traitement des donnees,
              vous pouvez ecrire a{' '}
              <a href="mailto:contact@a-ctyv.fr">contact@a-ctyv.fr</a>.
            </p>
          </section>
        </div>
      </div>
    </AppShell>
  );
}
