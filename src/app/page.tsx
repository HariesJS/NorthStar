import { Dashboard } from '@/components/Dashboard';
import { getMeta } from '@/lib/db';
import { listApps } from '@/lib/repo';

export const dynamic = 'force-dynamic';

export default function Page() {
  return (
    <Dashboard initialApps={listApps()} initialLastCheck={getMeta('last_full_check_at')} />
  );
}
