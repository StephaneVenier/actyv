import { AppShell } from '@/components/AppShell';
import { ActivityDetailClient } from './ActivityDetailClient';

export default async function ActivityDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <AppShell><ActivityDetailClient activityId={id} /></AppShell>;
}
