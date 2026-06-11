'use client';

import Link from 'next/link';
import { AppShell } from '@/components/AppShell';

export default function MentionsLegalesPage() {
  return (
    <AppShell>
      <div className="legal-page">
        <header className="legal-page__header">
          <span className="legal-page__eyebrow">Informations legales</span>
          <h1 className="legal-page__title">Mentions legales</h1>
          <p className="legal-page__intro">
            Cette page regroupe les principales informations d&apos;identification du
            site Actyv. Les champs encore provisoires sont clairement signales pour
            pouvoir etre completes avant mise en production definitive.
          </p>
        </header>

        <div className="legal-stack">
          <section className="legal-card">
            <dl className="legal-definition-list">
              <div className="legal-definition-list__row">
                <dt>Nom du site</dt>
                <dd>Actyv</dd>
              </div>
              <div className="legal-definition-list__row">
                <dt>Domaine</dt>
                <dd>a-ctyv.fr</dd>
              </div>
              <div className="legal-definition-list__row">
                <dt>Objet du site</dt>
                <dd>
                  Application de defis sportifs, seances, programmes et progression
                  collective.
                </dd>
              </div>
              <div className="legal-definition-list__row">
                <dt>Editeur</dt>
                <dd>A completer</dd>
              </div>
              <div className="legal-definition-list__row">
                <dt>Responsable de publication</dt>
                <dd>A completer</dd>
              </div>
              <div className="legal-definition-list__row">
                <dt>Contact</dt>
                <dd>
                  <a href="mailto:contact@a-ctyv.fr">contact@a-ctyv.fr</a>
                </dd>
              </div>
              <div className="legal-definition-list__row">
                <dt>Hebergeur</dt>
                <dd>Vercel</dd>
              </div>
            </dl>
          </section>

          <section className="legal-card legal-copy-stack">
            <h2>Complements utiles</h2>
            <p className="legal-copy">
              Les informations relatives a l&apos;editeur, au responsable de
              publication et au contact doivent etre confirmees avant publication
              commerciale ou communication externe.
            </p>
            <p className="legal-copy">
              Pour consulter les details sur le traitement des donnees et l&apos;usage
              des cookies, vous pouvez aussi lire les pages dediees ci-dessous.
            </p>
            <div className="legal-links">
              <Link href="/legal/confidentialite">Politique de confidentialite</Link>
              <Link href="/legal/cookies">Gestion des cookies</Link>
            </div>
          </section>
        </div>
      </div>
    </AppShell>
  );
}
