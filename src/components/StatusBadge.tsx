import { STATUS_LABELS, type AppStatus } from '@/lib/types';

const STYLES: Record<AppStatus, string> = {
  published: 'bg-green-500/15 text-green-300 ring-green-500/40',
  pre_registration: 'bg-amber-500/15 text-amber-300 ring-amber-500/40',
  not_published: 'bg-slate-500/15 text-slate-300 ring-slate-500/40',
  unknown: 'bg-slate-500/10 text-slate-400 ring-slate-600/40',
  removed: 'bg-red-500/15 text-red-300 ring-red-500/40',
};

export function StatusBadge({
  status,
  isNew = false,
}: {
  status: AppStatus;
  isNew?: boolean;
}) {
  if (isNew) {
    return (
      <span className="inline-flex items-center rounded-full bg-green-500 px-2.5 py-0.5 text-xs font-bold tracking-wide text-green-950 ring-1 ring-green-300">
        ВЫШЛО
      </span>
    );
  }
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${STYLES[status]}`}
    >
      {STATUS_LABELS[status]}
    </span>
  );
}
