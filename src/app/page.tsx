import { Dashboard } from '@/components/Dashboard';
import { getMeta } from '@/lib/db';
import { isCheckInProgress } from '@/lib/checker';
import { listApps } from '@/lib/repo';

export const dynamic = 'force-dynamic';

export default async function Page() {
  const [apps, lastCheck, checking] = await Promise.all([
    listApps(),
    getMeta('last_full_check_at'),
    isCheckInProgress(),
  ]);
  return (
    <Dashboard initialApps={apps} initialLastCheck={lastCheck} initialChecking={checking} />
  );
}
