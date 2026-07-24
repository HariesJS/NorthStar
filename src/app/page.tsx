import { Dashboard } from '@/components/Dashboard';
import { getMeta } from '@/lib/db';
import { listApps } from '@/lib/repo';

export const dynamic = 'force-dynamic';

export default async function Page() {
  const [apps, lastCheck] = await Promise.all([
    listApps(),
    getMeta('last_full_check_at'),
  ]);
  return <Dashboard initialApps={apps} initialLastCheck={lastCheck} />;
}
