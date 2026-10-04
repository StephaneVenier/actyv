import Image from 'next/image';
import Link from 'next/link';
import type { ReactNode } from 'react';

// Legal information must remain available even when account recovery is blocked.
export default function LegalLayout({ children }: { children: ReactNode }) {
  return <div className="legal-public">
    <header className="legal-public__nav">
      <Link href="/" aria-label="Accueil Actyv"><Image src="/images/actyv-logo.png" alt="Actyv" width={144} height={48} /></Link>
      <nav aria-label="Informations légales">
        <Link href="/legal/confidentialite">Confidentialité</Link>
        <Link href="/legal/mentions-legales">Mentions légales</Link>
        <Link href="/legal/cookies">Stockage</Link>
        <Link href="/legal/suppression-compte">Supprimer mon compte</Link>
      </nav>
    </header>
    <main>{children}</main>
  </div>;
}
