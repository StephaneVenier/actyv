import { Suspense } from 'react';
import NewActivityPageClient from './NewActivityPageClient';

export default function Page() {
  return (
    <Suspense fallback={<div style={{ padding: '2rem' }}>Chargement...</div>}>
      <NewActivityPageClient />
    </Suspense>
  );
}