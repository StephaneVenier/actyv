import Link from 'next/link';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Confidentialité | Actyv',
  alternates: { canonical: 'https://a-ctyv.fr/legal/confidentialite' },
};

export default function ConfidentialitePage() {
  return <div className="legal-page">
    <header className="legal-page__header">
      <span className="legal-page__eyebrow">Données personnelles</span>
      <h1 className="legal-page__title">Politique de confidentialité</h1>
      <p className="legal-page__intro">Actyv est un service sportif gratuit, sans publicité ni achat intégré. Cette politique décrit les traitements de sa version V1.</p>
    </header>
    <div className="legal-stack">
      <section className="legal-copy-stack">
        <h2>Responsable et contact</h2>
        <p className="legal-copy">Le responsable du traitement est l&apos;éditeur non professionnel d&apos;Actyv, présenté dans les <Link href="/legal/mentions-legales">mentions légales</Link>. Pour toute question sur vos données : <a href="mailto:contact@a-ctyv.fr">contact@a-ctyv.fr</a>.</p>
      </section>
      <section className="legal-copy-stack">
        <h2>Compte et informations publiques</h2>
        <p className="legal-copy">Votre adresse email, votre identifiant technique (UUID) et votre pseudo servent à gérer votre compte. Supabase assure l&apos;authentification : connexion par mot de passe, confirmation email et récupération d&apos;accès. Votre mot de passe est transmis aux services d&apos;authentification ; il est aussi demandé au serveur Actyv pour confirmer une suppression de compte.</p>
        <p className="legal-copy">Le profil privé contient votre email et votre progression. Le profil public prévu par Actyv expose l&apos;UUID, le pseudo, le niveau et le total d&apos;XP, y compris sans connexion. Les challenges peuvent également utiliser des adresses email comme identifiants de participation hérités.</p>
      </section>
      <section className="legal-copy-stack">
        <h2>Activités, séances et progression</h2>
        <p className="legal-copy">Actyv traite les sports, dates, distances, durées, répétitions, charges, repos, dénivelés et autres métriques renseignées ou produites pendant vos Lives. Les séances et programmes contiennent leurs noms, descriptions, exercices, objectifs et planning. L&apos;historique conserve les séries réellement effectuées et leurs statuts pour présenter vos statistiques et votre progression.</p>
        <p className="legal-copy">Les Maîtrises, niveaux, XP et badges utilisent les contributions et événements nécessaires à leur attribution et à leur suivi. Les données sont enregistrées dans Supabase ; les calculs et affichages peuvent aussi être effectués sur votre appareil.</p>
      </section>
      <section className="legal-copy-stack">
        <h2>Localisation et parcours GPS</h2>
        <p className="legal-copy">Lors d&apos;un Live de déplacement Android, avec votre autorisation de localisation, Actyv utilise les coordonnées GPS, dates des points, altitude, précision, vitesse et direction disponibles pour suivre l&apos;activité. Le suivi peut continuer écran verrouillé ou application en arrière-plan pendant le Live, avec une notification de service.</p>
        <p className="legal-copy">Les points détaillés et l&apos;état du Live sont conservés localement dans le navigateur/WebView et dans le stockage privé Android pour reprendre après interruption et enregistrer sans réseau. Une trace simplifiée peut être enregistrée dans Supabase avec l&apos;activité personnelle. Elle sert à afficher la carte, pas à recalculer vos performances. Les activités personnelles et leurs traces sont privées dans le fonctionnement V1.</p>
      </section>
      <section id="health-connect" className="legal-copy-stack">
        <h2>Health Connect : lecture des pas uniquement</h2>
        <p className="legal-copy">Sur Android, Actyv demande uniquement la permission <code>READ_STEPS</code>. Il lit le nombre total de pas de la journée, depuis minuit dans le fuseau de votre téléphone. Il n&apos;écrit aucune donnée dans Health Connect et ne lit ni fréquence cardiaque, ni calories, ni autres données de santé.</p>
        <p className="legal-copy">Une lecture peut avoir lieu lorsque la disponibilité est vérifiée et que la permission est déjà accordée. Lorsque vous demandez la synchronisation, le total quotidien, sa date, la source Health Connect et la date de synchronisation sont enregistrés dans <code>daily_steps</code> dans Supabase. Ils servent aux statistiques, records, régularité et badges. Vous pouvez aussi saisir vos pas manuellement. Les paramètres Health Connect permettent de retirer l&apos;autorisation.</p>
      </section>
      <section className="legal-copy-stack">
        <h2>Challenges, partage et interactions</h2>
        <p className="legal-copy">Vos contributions, commentaires, likes et boosts peuvent être consultés par les utilisateurs autorisés selon le type de challenge : communauté ou privé. Ils servent aux interactions, classements et objectifs collectifs. Certaines séances et certains programmes peuvent être publiés dans la banque ou partagés par code. Évitez d&apos;inclure des informations personnelles sensibles dans les textes libres que vous partagez.</p>
      </section>
      <section className="legal-copy-stack">
        <h2>Stockage technique et sécurité</h2>
        <p className="legal-copy">Sessions d&apos;authentification, préférences, brouillons, snapshots, files d&apos;attente de synchronisation et marqueurs de suppression utilisent le stockage du navigateur/WebView ou le stockage privé Android. Ils permettent la connexion, la reprise, le fonctionnement sans réseau et la purge sécurisée. Une déconnexion ne supprime pas tous les brouillons : ils restent associés à leur propriétaire pour une reprise ultérieure.</p>
        <p className="legal-copy">Les services peuvent traiter des données techniques de requêtes et de diagnostic, notamment l&apos;adresse IP et des métadonnées HTTP. Actyv V1 n&apos;intègre pas de SDK publicitaire ou de mesure d&apos;audience. Voir la page <Link href="/legal/cookies">stockage local et cookies</Link>.</p>
      </section>
      <section className="legal-copy-stack">
        <h2>Prestataires et destinataires</h2>
        <p className="legal-copy">Supabase fournit l&apos;authentification, la base de données et le stockage des illustrations. Vercel héberge le site et les API. IONOS assure l&apos;acheminement SMTP des emails Actyv, notamment les messages d&apos;authentification et de récupération. Health Connect et les services Android nécessaires fournissent les pas et la localisation sur votre appareil.</p>
        <p className="legal-copy">Lors de l&apos;affichage d&apos;une carte, les tuiles sont demandées à OpenStreetMap. Son service peut recevoir votre IP, des métadonnées HTTP et la zone cartographique demandée. Actyv ne lui envoie pas directement votre trace complète, votre email ou vos jetons d&apos;authentification. Leaflet dessine la carte sur votre appareil.</p>
        <p className="legal-copy">Les infrastructures et traitements techniques des prestataires peuvent être situés hors de France ou de l&apos;Union européenne. Pour des précisions sur les lieux de traitement et les garanties applicables, contactez-nous. Vos données ne sont pas utilisées par Actyv pour la publicité ni revendues.</p>
      </section>
      <section className="legal-copy-stack">
        <h2>Conservation</h2>
        <p className="legal-copy">Les données métier sont conservées tant qu&apos;elles sont nécessaires au fonctionnement de votre compte ou du service, ou jusqu&apos;à leur suppression, sous réserve des contributions collectives décrites ci-dessous. La V1 ne prévoit pas de suppression automatique générale après un délai fixe.</p>
        <p className="legal-copy">Les brouillons et données hors ligne restent sur l&apos;appareil jusqu&apos;à leur nettoyage, abandon ou purge. Les préférences d&apos;exercices favoris/récents et d&apos;affichage peuvent subsister après suppression du compte. Les preuves techniques de confirmation de suppression, sans email ni UUID après suppression Auth, n&apos;ont pas d&apos;expiration automatique dans la V1. Les sauvegardes et journaux des prestataires suivent leurs propres conditions de conservation ; aucun délai chiffré unique n&apos;est annoncé ici.</p>
      </section>
      <section className="legal-copy-stack">
        <h2>Suppression définitive du compte</h2>
        <p className="legal-copy">La suppression est accessible depuis Profil. Elle supprime le compte d&apos;authentification, le profil, les activités personnelles et traces GPS, les pas enregistrés dans Actyv, les historiques personnels, les créations de séances/programmes du compte et ses données de progression. Après confirmation serveur, la purge des snapshots, files de synchronisation et GPS locaux du compte est effectuée sur l&apos;appareil concerné. Une interruption peut nécessiter une reprise ou une nouvelle vérification ; une demande non confirmée n&apos;est pas une suppression terminée.</p>
        <p className="legal-copy">Pour préserver les challenges, certaines contributions collectives subsistent sans UUID/email de l&apos;auteur : commentaires, nom d&apos;activité, type d&apos;exercice et metadata identifiantes sont retirés, tandis que les métriques et dates peuvent rester. Les challenges peuvent subsister sans créateur identifié. Les copies de programmes ou séances appartenant à d&apos;autres utilisateurs et certains textes libres collectifs peuvent subsister. Ces données ne sont pas présentées comme anonymes de manière irréversible.</p>
        <p className="legal-copy">Les données originales présentes dans Health Connect ne sont pas supprimées par Actyv. Vous pouvez les gérer dans Health Connect. Sans accès à votre compte, consultez les <Link href="/legal/suppression-compte">informations de suppression</Link> ou écrivez à <a href="mailto:contact@a-ctyv.fr">contact@a-ctyv.fr</a>.</p>
      </section>
      <section className="legal-copy-stack">
        <h2>Vos droits</h2>
        <p className="legal-copy">Vous pouvez consulter vos données et modifier votre pseudo dans Actyv. Pour exercer vos droits d&apos;accès, rectification, effacement, limitation, opposition ou portabilité lorsqu&apos;ils s&apos;appliquent, contactez <a href="mailto:contact@a-ctyv.fr">contact@a-ctyv.fr</a>, même sans accès à votre compte. Une vérification d&apos;identité proportionnée peut être nécessaire ; n&apos;envoyez jamais votre mot de passe ou vos jetons.</p>
        <p className="legal-copy">Vous pouvez adresser une réclamation à la <a href="https://www.cnil.fr/fr/adresser-une-plainte">CNIL</a>. Les fonctions optionnelles de localisation et de Health Connect peuvent être désactivées dans les paramètres de votre appareil, sans supprimer les activités déjà enregistrées.</p>
      </section>
    </div>
  </div>;
}
