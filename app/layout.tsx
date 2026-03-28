import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'A-ctyv',
  description: 'Plateforme de défis sportifs collectifs.'
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  );
}
