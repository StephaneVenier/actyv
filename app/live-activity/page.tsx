import { Suspense } from 'react';
import LiveActivityPageClient from './LiveActivityPageClient';

export default function LiveActivityPage() {
  return (
    <Suspense fallback={<div style={{ padding: '2rem' }}>Chargement...</div>}>
      <LiveActivityPageClient />
    </Suspense>
  );
}
