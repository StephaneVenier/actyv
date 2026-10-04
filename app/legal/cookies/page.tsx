import Link from 'next/link';
import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Stockage local et cookies | Actyv' };

export default function CookiesPage() {
  return <div className="legal-page">
    <header className="legal-page__header">
      <span className="legal-page__eyebrow">Fonctionnement technique</span>
      <h1 className="legal-page__title">Stockage local et cookies</h1>
      <p className="legal-page__intro">Actyv utilise principalement le stockage technique du navigateur ou de la WebView Android pour faire fonctionner le service.</p>
    </header>
    <div className="legal-stack">
      <section className="legal-copy-stack">
        <h2>Authentification et sécurité</h2>
        <p className="legal-copy">Le stockage local conserve les informations de session nécessaires à la connexion. Un stockage de session temporaire sert notamment à la récupération du mot de passe et aux notifications. Les marqueurs de suppression permettent de vérifier et reprendre un nettoyage interrompu ; ils ne doivent pas être confondus avec une suppression définitivement réussie.</p>
      </section>
      <section className="legal-copy-stack">
        <h2>Reprise, synchronisation et préférences</h2>
        <p className="legal-copy">Les snapshots de séances et de Lives, les points GPS et les files d&apos;attente de synchronisation permettent la reprise après interruption et l&apos;enregistrement sans réseau. Sur Android, le service GPS utilise aussi des fichiers privés et des préférences natives. Les préférences d&apos;affichage et les exercices favoris/récents sont mémorisés sur l&apos;appareil.</p>
      </section>
      <section className="legal-copy-stack">
        <h2>Conservation et nettoyage</h2>
        <p className="legal-copy">La déconnexion retire la session mais peut conserver des brouillons associés au compte pour une reprise. La suppression confirmée déclenche une purge ciblée des données sensibles locales du compte. Les préférences d&apos;exercices et d&apos;affichage peuvent rester ; elles ne contiennent pas les performances réalisées.</p>
        <p className="legal-copy">Vous pouvez effacer les données du site dans votre navigateur ou celles de l&apos;application dans Android. Cela peut supprimer des Lives et activités non synchronisés et empêcher leur récupération. Le stockage local n&apos;a pas de délai d&apos;expiration général codé dans la V1.</p>
      </section>
      <section className="legal-copy-stack">
        <h2>Publicité et services tiers</h2>
        <p className="legal-copy">Aucun SDK publicitaire, SDK de mesure d&apos;audience ou cookie publicitaire non essentiel n&apos;est intégré à la V1. Cela ne signifie pas qu&apos;aucun tiers ne traite de données techniques : hébergement, authentification, emails et tuiles cartographiques impliquent des échanges réseau décrits dans la <Link href="/legal/confidentialite">politique de confidentialité</Link>.</p>
        <p className="legal-copy">Pour toute question : <a href="mailto:contact@a-ctyv.fr">contact@a-ctyv.fr</a>.</p>
      </section>
    </div>
  </div>;
}
