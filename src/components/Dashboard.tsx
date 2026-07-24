'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { AppCard } from './AppCard';
import { AppModal } from './AppModal';
import { BulkAddForm } from './BulkAddForm';
import { formatRelative } from '@/lib/format';
import type { AppStatus, TrackedApp } from '@/lib/types';

type Filter = 'all' | 'published' | 'waiting' | 'removed';

const FILTERS: { key: Filter; label: string; match: (s: AppStatus) => boolean }[] = [
  { key: 'all', label: 'Все', match: () => true },
  { key: 'published', label: 'Вышедшие', match: (s) => s === 'published' },
  {
    key: 'waiting',
    label: 'Ждём',
    match: (s) => s === 'not_published' || s === 'pre_registration' || s === 'unknown',
  },
  { key: 'removed', label: 'Удалённые', match: (s) => s === 'removed' },
];

// Обычный ритм опроса, пока ничего не происходит.
const IDLE_POLL_MS = 10_000;
// Пока сервер сообщает, что обход идёт (в том числе запущенный извне, крон-
// сервисом), опрашиваем чаще — чтобы поймать момент его завершения.
const ACTIVE_POLL_MS = 3_000;
// Сколько показывать «Проверяю…», когда мы узнали о проверке постфактум
// (не застали checking=true вживую, а просто заметили, что время сменилось).
const JUST_FINISHED_FLASH_MS = 1_500;

export function Dashboard({
  initialApps,
  initialLastCheck,
  initialChecking = false,
}: {
  initialApps: TrackedApp[];
  initialLastCheck: string | null;
  initialChecking?: boolean;
}) {
  const [apps, setApps] = useState(initialApps);
  const [lastCheck, setLastCheck] = useState(initialLastCheck);
  const [filter, setFilter] = useState<Filter>('all');
  const [openPkg, setOpenPkg] = useState<string | null>(null);
  // Клик по кнопке — мгновенная местная реакция, не дожидаясь опроса.
  const [manualChecking, setManualChecking] = useState(false);
  // Идёт ли обход, сообщает сам сервер. Ловит запуски извне (крон), но
  // ненадёжно: на 10 приложениях обход занимает ~3 сек, а опрос идёт раз
  // в 10 — велик шанс ни разу не попасть в это окно вживую.
  const [serverChecking, setServerChecking] = useState(initialChecking);
  // Поэтому есть и надёжный, не зависящий от удачного тайминга сигнал:
  // если при опросе видим, что lastFullCheckAt сменился с прошлого раза —
  // проверка точно только что прошла, даже если мы её не «застали».
  const [justFinished, setJustFinished] = useState(false);
  const lastSeenCheckRef = useRef(initialLastCheck);
  const isChecking = manualChecking || serverChecking || justFinished;

  // Сам по себе lastCheck меняется редко — этот тикер ничего не запрашивает,
  // а просто заставляет перерисовать текст «проверка: N сек назад», чтобы он
  // не застывал на «только что».
  const [, forceTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => forceTick((t) => t + 1), 5_000);
    return () => clearInterval(id);
  }, []);

  const refresh = useCallback(async () => {
    const res = await fetch('/api/apps', { cache: 'no-store' });
    if (!res.ok) return;
    const data = (await res.json()) as {
      apps: TrackedApp[];
      lastFullCheckAt: string | null;
      checking: boolean;
    };
    setApps(data.apps);
    setServerChecking(data.checking);

    if (data.lastFullCheckAt && data.lastFullCheckAt !== lastSeenCheckRef.current) {
      lastSeenCheckRef.current = data.lastFullCheckAt;
      setLastCheck(data.lastFullCheckAt);
      // Время сменилось — проверка прошла, независимо от того, увидели мы
      // checking=true вживую или нет. Коротко показываем «Проверяю…», чтобы
      // обновление было заметно, а не просто тихо поменяло цифры в фоне.
      setJustFinished(true);
      setTimeout(() => setJustFinished(false), JUST_FINISHED_FLASH_MS);
    }
  }, []);

  // Открытая вкладка сама подтягивает изменения — релиз видно без
  // перезагрузки. Пока сервер сообщает об активном обходе, опрос учащается,
  // чтобы не пропустить момент его завершения.
  useEffect(() => {
    const id = setInterval(refresh, serverChecking ? ACTIVE_POLL_MS : IDLE_POLL_MS);
    return () => clearInterval(id);
  }, [refresh, serverChecking]);

  async function checkNow() {
    if (isChecking) return;
    setManualChecking(true);
    try {
      const res = await fetch('/api/check', { method: 'POST' });
      if (res.ok) {
        const data = (await res.json()) as {
          apps: TrackedApp[];
          summary: { finishedAt: string };
        };
        setApps(data.apps);
        // Точное время с сервера, а не клиентское приближение — и сразу
        // синхронизируем ref, чтобы следующий опрос не решил, что время
        // «снова сменилось», и не мигнул лишний раз.
        lastSeenCheckRef.current = data.summary.finishedAt;
        setLastCheck(data.summary.finishedAt);
        setServerChecking(false);
      }
    } finally {
      setManualChecking(false);
    }
  }

  async function markSeen(pkg: string) {
    setApps((prev) =>
      prev.map((a) => (a.package_id === pkg ? { ...a, seen_new: 1 } : a)),
    );
    await fetch(`/api/apps/${encodeURIComponent(pkg)}`, { method: 'PATCH' });
  }

  const visible = apps.filter((a) => FILTERS.find((f) => f.key === filter)!.match(a.status));
  const newCount = apps.filter((a) => a.status === 'published' && a.seen_new === 0).length;

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-50">North Star</h1>
          <p className="text-sm text-slate-400">
            Отслеживание релизов в Google Play · проверка каждые 5 минут
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-slate-500">
            {isChecking ? 'идёт проверка…' : `проверка: ${formatRelative(lastCheck)}`}
          </span>
          <button
            onClick={checkNow}
            disabled={isChecking}
            className="rounded-lg border border-white/15 px-3 py-1.5 text-sm text-slate-200 transition hover:border-white/35 hover:bg-white/5 disabled:opacity-40"
          >
            {isChecking ? 'Проверяю…' : 'Проверить сейчас'}
          </button>
        </div>
      </header>

      {newCount > 0 && (
        <div className="mb-5 rounded-xl border border-green-500/40 bg-green-500/10 px-4 py-3 text-sm text-green-200">
          Вышло приложений: <b>{newCount}</b> — отмечены зелёным вверху списка.
        </div>
      )}

      <BulkAddForm onAdded={refresh} />

      <nav className="mt-6 mb-4 flex flex-wrap gap-2">
        {FILTERS.map((f) => {
          const count = apps.filter((a) => f.match(a.status)).length;
          return (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`rounded-lg px-3 py-1.5 text-sm transition ${
                filter === f.key
                  ? 'bg-white/10 text-slate-100'
                  : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'
              }`}
            >
              {f.label} <span className="text-slate-600">{count}</span>
            </button>
          );
        })}
      </nav>

      {visible.length === 0 ? (
        <p className="rounded-xl border border-dashed border-white/10 py-12 text-center text-sm text-slate-500">
          {apps.length === 0
            ? 'Пока пусто — вставьте ссылки на приложения выше.'
            : 'В этом фильтре ничего нет.'}
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((app) => (
            <AppCard
              key={app.package_id}
              app={app}
              onOpen={() => setOpenPkg(app.package_id)}
              onMarkSeen={() => markSeen(app.package_id)}
            />
          ))}
        </div>
      )}

      {openPkg && (
        <AppModal
          packageId={openPkg}
          onClose={() => setOpenPkg(null)}
          onChanged={refresh}
        />
      )}
    </main>
  );
}
