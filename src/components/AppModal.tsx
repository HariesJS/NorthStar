'use client';

import { useEffect, useState } from 'react';
import { StatusBadge } from './StatusBadge';
import { formatDateTime } from '@/lib/format';
import { playStoreUrl } from '@/lib/parse-links';
import { EVENT_LABELS, type AppEvent, type TrackedApp } from '@/lib/types';

const EVENT_DOT: Record<string, string> = {
  published: 'bg-green-400',
  restored: 'bg-green-400',
  removed: 'bg-red-400',
  updated: 'bg-sky-400',
  pre_registration: 'bg-amber-400',
  error: 'bg-amber-500/60',
  added: 'bg-slate-500',
};

export function AppModal({
  packageId,
  onClose,
  onChanged,
}: {
  packageId: string;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [data, setData] = useState<{ app: TrackedApp; events: AppEvent[] } | null>(null);

  useEffect(() => {
    let alive = true;
    fetch(`/api/apps/${encodeURIComponent(packageId)}`)
      .then((r) => r.json())
      .then((d) => alive && setData(d));
    return () => {
      alive = false;
    };
  }, [packageId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  async function remove() {
    await fetch(`/api/apps/${encodeURIComponent(packageId)}`, { method: 'DELETE' });
    onChanged();
    onClose();
  }

  const app = data?.app;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/70 p-4 backdrop-blur-sm sm:items-center"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl rounded-2xl border border-white/10 bg-[#0d1219] p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {!app ? (
          <p className="py-8 text-center text-slate-400">Загружаю…</p>
        ) : (
          <>
            <div className="flex items-start gap-4">
              {app.icon_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={app.icon_url}
                  alt=""
                  className="h-16 w-16 shrink-0 rounded-2xl bg-white/5 object-cover"
                />
              ) : (
                <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-white/5 text-2xl text-slate-600">
                  ?
                </div>
              )}
              <div className="min-w-0 flex-1">
                <h2 className="truncate text-xl font-semibold text-slate-50">
                  {app.title ?? app.package_id}
                </h2>
                <p className="truncate font-mono text-xs text-slate-500">
                  {app.package_id}
                </p>
                {app.developer && (
                  <p className="mt-1 text-sm text-slate-400">{app.developer}</p>
                )}
                <div className="mt-2">
                  <StatusBadge
                    status={app.status}
                    isNew={app.status === 'published' && app.seen_new === 0}
                  />
                </div>
              </div>
              <button
                onClick={onClose}
                aria-label="Закрыть"
                className="rounded-lg px-2 py-1 text-slate-500 transition hover:bg-white/5 hover:text-slate-200"
              >
                ✕
              </button>
            </div>

            <dl className="mt-6 grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
              <Row
                label="Опубликовалось"
                value={
                  app.published_at
                    ? formatDateTime(app.published_at)
                    : app.published_before_tracking
                      ? 'дата неизвестна'
                      : '—'
                }
                hint={
                  !app.published_at && app.published_before_tracking
                    ? 'приложение уже было в сторе на момент добавления — Google Play не показывает настоящую дату релиза'
                    : undefined
                }
              />
              <Row
                label="Обновилось в сторе"
                value={app.store_updated_on ?? '—'}
                hint="дата с самой страницы Google Play"
              />
              <Row
                label="Удалено из стора"
                value={formatDateTime(app.removed_at)}
                danger={!!app.removed_at}
              />
              <Row label="Последняя проверка" value={formatDateTime(app.last_checked_at)} />
            </dl>

            {app.last_error && (
              <p className="mt-4 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">
                Последняя проверка не удалась: {app.last_error}. Статус выше — с предыдущей
                успешной проверки.
              </p>
            )}

            <h3 className="mt-6 mb-2 text-sm font-medium text-slate-300">История</h3>
            <ol className="space-y-2">
              {data.events.length === 0 && (
                <li className="text-sm text-slate-500">событий пока нет</li>
              )}
              {data.events.map((ev) => (
                <li key={ev.id} className="flex items-start gap-3 text-sm">
                  <span
                    className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${
                      EVENT_DOT[ev.type] ?? 'bg-slate-500'
                    }`}
                  />
                  <span className="text-slate-200">
                    {EVENT_LABELS[ev.type] ?? ev.type}
                    {ev.detail && <span className="text-slate-500"> — {ev.detail}</span>}
                  </span>
                  <span className="ml-auto shrink-0 text-xs text-slate-500">
                    {formatDateTime(ev.created_at)}
                  </span>
                </li>
              ))}
            </ol>

            <div className="mt-6 flex items-center justify-between gap-3 border-t border-white/10 pt-4">
              <a
                href={playStoreUrl(app.package_id, app.country)}
                target="_blank"
                rel="noreferrer"
                className="text-sm text-sky-400 transition hover:text-sky-300"
              >
                Открыть в Google Play ↗
              </a>
              <button
                onClick={remove}
                className="rounded-lg px-3 py-1.5 text-sm text-red-400 transition hover:bg-red-500/10"
              >
                Убрать из отслеживания
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  hint,
  danger,
}: {
  label: string;
  value: string;
  hint?: string;
  danger?: boolean;
}) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className={`text-sm ${danger ? 'text-red-300' : 'text-slate-100'}`}>{value}</dd>
      {hint && <p className="text-xs text-slate-600">{hint}</p>}
    </div>
  );
}
