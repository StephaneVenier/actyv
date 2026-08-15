import { AppShell } from '@/components/AppShell';
import { HistoryPageClient } from '@/app/historique/HistoryPageClient';

export default function HistoriquePage() {
  return (
    <AppShell>
      <HistoryPageClient />
    </AppShell>
  );
}
