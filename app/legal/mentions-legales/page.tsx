import Link from 'next/link';
import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Mentions légales | Actyv' };

export default function MentionsLegalesPage() {
  return <div className="legal-page">
    <header className="legal-page__header">
      <span className="legal-page__eyebrow">Informations légales</span>
      <h1 className="legal-page__title">Mentions légales</h1>
      <p className="legal-page__intro">Actyv, accessible sur https://a-ctyv.fr, est un service sportif édité à titre non professionnel, entièrement gratuit, sans publicité et sans achat intégré.</p>
    </header>
    <div className="legal-stack">
      <section className="legal-copy-stack">
        <h2>Éditeur et contact</h2>
        <p className="legal-copy">L&apos;éditeur non professionnel d&apos;Actyv a choisi de préserver son anonymat public dans le cadre de l&apos;article 1-1, II de la loi pour la confiance dans l&apos;économie numérique. Les éléments d&apos;identification requis ont été communiqués à son hébergeur.</p>
        <p className="legal-copy">Contact du service et du responsable du traitement des données : <a href="mailto:contact@a-ctyv.fr">contact@a-ctyv.fr</a>.</p>
      </section>
      <section className="legal-copy-stack">
        <h2>Hébergement</h2>
        <p className="legal-copy">Le site public et ses API sont hébergés par Vercel Inc., 440 N Barranca Ave #4133, Covina, CA 91723, États-Unis. Informations du prestataire : <a href="https://vercel.com/legal">vercel.com/legal</a>.</p>
        <p className="legal-copy">Supabase fournit l&apos;authentification, la base de données et le stockage. IONOS assure l&apos;acheminement SMTP des emails. Le rôle des services techniques et cartographiques est décrit dans la <Link href="/legal/confidentialite">politique de confidentialité</Link>.</p>
      </section>
      <section className="legal-copy-stack">
        <h2>Crédits</h2>
        <p className="legal-copy">Exercise data by <a href="https://repdb.co">RepDB (repdb.co)</a>. Certaines illustrations proviennent du dataset free tier RepDB et sont intégrées avec attribution conformément à sa licence. Les cartes utilisent les données et tuiles OpenStreetMap, avec l&apos;attribution affichée sur la carte.</p>
      </section>
      <section className="legal-copy-stack">
        <h2>Données et demandes</h2>
        <p className="legal-copy">Les demandes relatives au service ou à vos données peuvent être adressées à <a href="mailto:contact@a-ctyv.fr">contact@a-ctyv.fr</a>, sans connexion à Actyv. Consultez les <Link href="/legal/suppression-compte">informations pour demander la suppression du compte</Link> et la page <Link href="/legal/cookies">stockage local et cookies</Link>.</p>
      </section>
    </div>
  </div>;
}
