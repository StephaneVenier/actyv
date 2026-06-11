'use client';

import { AppShell } from '@/components/AppShell';

export default function ConfidentialitePage() {
  return (
    <AppShell>
      <div className="legal-page">
        <header className="legal-page__header">
          <span className="legal-page__eyebrow">Donnees personnelles</span>
          <h1 className="legal-page__title">Politique de confidentialite</h1>
          <p className="legal-page__intro">
            Actyv traite uniquement les donnees necessaires au fonctionnement de
            l&apos;application, a la progression sportive et a la personnalisation des
            experiences utilisateur.
          </p>
        </header>

        <div className="legal-stack">
          <section className="legal-card legal-copy-stack">
            <h2>Donnees concernees</h2>
            <p className="legal-copy">
              Selon votre utilisation d&apos;Actyv, les donnees suivantes peuvent etre
              traitees : adresse email, pseudo, avatar si renseigne, activites
              sportives saisies, challenges rejoints ou crees, seances et programmes
              realises, XP, badges, progression et donnees techniques strictement
              necessaires a la connexion et a la securite.
            </p>
          </section>

          <section className="legal-card legal-copy-stack">
            <h2>Finalites</h2>
            <p className="legal-copy">
              Ces donnees servent a creer et administrer votre compte, afficher votre
              progression, vous permettre de participer a des challenges, suivre vos
              seances et programmes, attribuer vos XP et badges, et maintenir la
              securite generale du service.
            </p>
          </section>

          <section className="legal-card legal-copy-stack">
            <h2>Base legale</h2>
            <p className="legal-copy">
              Le traitement repose principalement sur l&apos;execution du service que
              vous utilisez, l&apos;interet legitime a securiser l&apos;application et, le
              cas echeant, votre consentement lorsqu&apos;un traitement optionnel sera
              ajoute plus tard.
            </p>
          </section>

          <section className="legal-card legal-copy-stack">
            <h2>Duree de conservation</h2>
            <p className="legal-copy">
              Les donnees de compte et de progression sont conservees tant que votre
              compte est actif, puis pendant une duree raisonnable necessaire a la
              gestion du service, a la securite et aux obligations legales. Les
              durees exactes devront etre finalisees dans la politique interne de
              retention.
            </p>
          </section>

          <section className="legal-card legal-copy-stack">
            <h2>Partage et hebergement</h2>
            <p className="legal-copy">
              Les donnees sont hebergees sur l&apos;infrastructure technique utilisee par
              Actyv pour faire fonctionner le service. A date, l&apos;hebergement du site
              est assure par Vercel. Les donnees ne sont pas revendues. Elles peuvent
              etre transmises a des sous-traitants techniques uniquement quand cela
              est necessaire au fonctionnement de la plateforme.
            </p>
          </section>

          <section className="legal-card legal-copy-stack">
            <h2>Vos droits</h2>
            <p className="legal-copy">
              Vous pouvez demander l&apos;acces, la rectification, la suppression,
              l&apos;export de vos donnees ou exercer vos autres droits RGPD en ecrivant a{' '}
              <a href="mailto:contact@a-ctyv.fr">contact@a-ctyv.fr</a>. Une procedure
              de traitement des demandes devra etre formalisee avant ouverture large
              du service.
            </p>
          </section>

          <section className="legal-card legal-copy-stack">
            <h2>Integrations futures</h2>
            <p className="legal-copy">
              Les synchronisations sante ou pas quotidiens peuvent etre ajoutees plus
              tard. Elles ne sont pas considerees comme actives tant qu&apos;elles ne sont
              pas deployeees et documentees avec leur cadre de consentement.
            </p>
          </section>
        </div>
      </div>
    </AppShell>
  );
}
