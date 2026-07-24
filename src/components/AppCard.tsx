'use client';

import { StatusBadge } from './StatusBadge';
import type { TrackedApp } from '@/lib/types';

export function AppCard({
  app,
  onOpen,
  onMarkSeen,
}: {
  app: TrackedApp;
  onOpen: () => void;
  onMarkSeen: () => void;
}) {
  const isNew = app.status === 'published' && app.seen_new === 0;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOpen();
        }
      }}
      className={`group relative cursor-pointer rounded-xl border p-4 text-left transition ${
        isNew
          ? 'northstar-new border-green-500/60 bg-green-500/[0.07]'
          : app.status === 'removed'
            ? 'border-red-500/30 bg-red-500/[0.04] hover:border-red-500/50'
            : 'border-white/10 bg-white/[0.03] hover:border-white/25'
      }`}
    >
      <div className="flex items-start gap-3">
        {app.icon_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={app.icon_url}
            alt=""
            className="h-12 w-12 shrink-0 rounded-xl bg-white/5 object-cover"
            loading="lazy"
          />
        ) : (
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-white/5 text-lg text-slate-600">
            ?
          </div>
        )}

        <div className="min-w-0 flex-1">
          <p className="truncate font-medium text-slate-100">
            {app.title ?? app.package_id.split('.').slice(-1)[0]}
          </p>
          <p className="truncate font-mono text-xs text-slate-500">{app.package_id}</p>
          {app.developer && (
            <p className="mt-0.5 truncate text-xs text-slate-400">{app.developer}</p>
          )}
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between gap-2">
        <StatusBadge status={app.status} isNew={isNew} />

        {isNew && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onMarkSeen();
            }}
            className="rounded-md px-2 py-1 text-xs text-green-200/80 transition hover:bg-green-500/15 hover:text-green-100"
          >
            прочитано
          </button>
        )}
      </div>

      {app.last_error && (
        <p className="mt-2 truncate text-xs text-amber-400/80" title={app.last_error}>
          последняя проверка не удалась: {app.last_error}
        </p>
      )}
    </div>
  );
}
