import Link from 'next/link';
import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Suppression du compte | Actyv' };

export default function AccountDeletionInformationPage() {
  return <div className="legal-page">
    <header className="legal-page__header">
      <span className="legal-page__eyebrow">Compte et données</span>
      <h1 className="legal-page__title">Demander la suppression du compte Actyv</h1>
      <p className="legal-page__intro">Ces informations sont accessibles sans connexion et sans installation de l&apos;application.</p>
    </header>
    <div className="legal-stack">
      <section className="legal-copy-stack">
        <h2>Depuis votre compte</h2>
        <p className="legal-copy">Connectez-vous à Actyv, ouvrez Profil puis la suppression définitive du compte. Le parcours demande une confirmation de mot de passe. Si la demande est interrompue, suivez la reprise proposée ; une erreur ou une déconnexion ne signifie pas que la suppression est terminée.</p>
      </section>
      <section className="legal-copy-stack">
        <h2>Sans accès à votre compte</h2>
        <p className="legal-copy">Écrivez à <a href="mailto:contact@a-ctyv.fr?subject=Suppression%20du%20compte%20Actyv">contact@a-ctyv.fr</a> pour demander la suppression de votre compte et des données associées. Indiquez l&apos;adresse email du compte et, si possible, écrivez depuis cette adresse. Une vérification proportionnée pourra être demandée. N&apos;envoyez jamais votre mot de passe ou de jeton d&apos;authentification.</p>
      </section>
      <section className="legal-copy-stack">
        <h2>Effets et données collectives</h2>
        <p className="legal-copy">La suppression retire le compte Auth et ses données personnelles Actyv, notamment les activités personnelles et traces GPS. Certaines contributions collectives peuvent rester sans identité structurée, ainsi que les challenges sans créateur identifié, des textes collectifs et les copies détenues par d&apos;autres utilisateurs. Les données originales Health Connect restent dans Health Connect.</p>
        <p className="legal-copy">Le nettoyage local intervient après confirmation serveur sur l&apos;appareil concerné. Les durées et exceptions sont détaillées dans la <Link href="/legal/confidentialite">politique de confidentialité</Link>.</p>
      </section>
    </div>
  </div>;
}
