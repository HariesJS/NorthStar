import { db, nowIso, setMeta } from './db';
import { checkPackage, type CheckResult } from './playstore';
import type { AppStatus, EventType, TrackedApp } from './types';

const CONCURRENCY = 6;
const RETRY_DELAY_MS = 2_000;

export interface CheckSummary {
  checked: number;
  published: number;
  removed: number;
  errors: number;
  finishedAt: string;
}

function logEvent(
  packageId: string,
  type: EventType,
  from: AppStatus | null,
  to: AppStatus | null,
  detail: string | null = null,
) {
  db.prepare(
    `INSERT INTO events (package_id, type, from_status, to_status, detail, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(packageId, type, from, to, detail, nowIso());
}

/**
 * Применение результата проверки к записи.
 *
 * Главное правило: результат `error` НИКОГДА не меняет статус. Иначе один
 * сетевой таймаут превратил бы вышедшее приложение обратно в «не опубликовано».
 */
function applyResult(app: TrackedApp, result: CheckResult): 'published' | 'removed' | 'error' | null {
  const now = nowIso();
  const from = app.status;

  if (result.kind === 'error') {
    db.prepare(
      'UPDATE apps SET last_checked_at = ?, last_error = ? WHERE package_id = ?',
    ).run(now, result.message, app.package_id);
    logEvent(app.package_id, 'error', from, from, result.message);
    return 'error';
  }

  if (result.kind === 'absent') {
    // 404 сам по себе не отличает «ещё не вышло» от «забанили» —
    // различие даёт наша история статусов.
    const wasVisible = from === 'published' || from === 'pre_registration';
    // Уже удалённое остаётся удалённым: следующий 404 — не «никогда не выходило»,
    // иначе факт бана терялся бы на первой же повторной проверке.
    const to: AppStatus = wasVisible || from === 'removed' ? 'removed' : 'not_published';

    db.prepare(
      `UPDATE apps
         SET status = ?, last_checked_at = ?, last_error = NULL,
             removed_at = CASE
               WHEN ? = 'removed' AND removed_at IS NULL THEN ?
               ELSE removed_at END
       WHERE package_id = ?`,
    ).run(to, now, to, now, app.package_id);

    if (wasVisible) {
      logEvent(app.package_id, 'removed', from, to);
      return 'removed';
    }
    // unknown -> not_published: это не событие, а просто первая проверка
    return null;
  }

  // Страница есть: published или pre_registration
  const to: AppStatus = result.kind;
  const becamePublished = to === 'published' && from !== 'published';
  const wasRemoved = from === 'removed';
  // from === 'unknown' значит это самая первая проверка приложения — мы не
  // застали момент выхода, а значит не знаем настоящую дату релиза (Google
  // Play её не показывает, только «Updated on» — дату последнего обновления).
  const firstEverCheck = from === 'unknown';

  db.prepare(
    `UPDATE apps
        SET status = @status,
            title = COALESCE(@title, title),
            developer = COALESCE(@developer, developer),
            icon_url = COALESCE(@iconUrl, icon_url),
            store_updated_on = COALESCE(@storeUpdatedOn, store_updated_on),
            published_at = CASE
              WHEN @status = 'published' AND published_at IS NULL AND @firstEverCheck = 0
                THEN @now
              ELSE published_at END,
            published_before_tracking = CASE
              WHEN @status = 'published' AND @firstEverCheck = 1 THEN 1
              ELSE published_before_tracking END,
            removed_at = CASE WHEN @status = 'published' THEN NULL ELSE removed_at END,
            seen_new = CASE WHEN @becamePublished = 1 THEN 0 ELSE seen_new END,
            last_checked_at = @now,
            last_error = NULL
      WHERE package_id = @packageId`,
  ).run({
    status: to,
    title: result.title,
    developer: result.developer,
    iconUrl: result.iconUrl,
    storeUpdatedOn: result.storeUpdatedOn,
    firstEverCheck: firstEverCheck ? 1 : 0,
    becamePublished: becamePublished ? 1 : 0,
    now,
    packageId: app.package_id,
  });

  if (becamePublished) {
    logEvent(
      app.package_id,
      wasRemoved ? 'restored' : 'published',
      from,
      to,
      firstEverCheck
        ? 'уже было в сторе на момент добавления — точная дата выхода неизвестна'
        : null,
    );
    return 'published';
  }
  if (to === 'pre_registration' && from !== 'pre_registration') {
    logEvent(app.package_id, 'pre_registration', from, to);
    return null;
  }
  // Уже было published — интересна только смена даты обновления в сторе
  if (
    to === 'published' &&
    result.storeUpdatedOn &&
    app.store_updated_on &&
    result.storeUpdatedOn !== app.store_updated_on
  ) {
    logEvent(
      app.package_id,
      'updated',
      from,
      to,
      `${app.store_updated_on} → ${result.storeUpdatedOn}`,
    );
  }
  return null;
}

async function checkOne(app: TrackedApp): Promise<CheckResult> {
  const first = await checkPackage(app.package_id, app.country);
  if (first.kind !== 'error') return first;
  // Одна повторная попытка: 429 и 5xx у Play Store обычно кратковременные
  await sleep(RETRY_DELAY_MS);
  return checkPackage(app.package_id, app.country);
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Полный обход. Если передан packageIds — проверяются только они
 * (используется при добавлении новых, чтобы не ждать следующего тика).
 */
export async function runCheck(packageIds?: string[]): Promise<CheckSummary> {
  const apps = packageIds?.length
    ? (db
        .prepare(
          `SELECT * FROM apps WHERE package_id IN (${packageIds.map(() => '?').join(',')})`,
        )
        .all(...packageIds) as TrackedApp[])
    : (db.prepare('SELECT * FROM apps').all() as TrackedApp[]);

  const summary: CheckSummary = {
    checked: 0,
    published: 0,
    removed: 0,
    errors: 0,
    finishedAt: nowIso(),
  };

  let cursor = 0;
  async function worker() {
    while (cursor < apps.length) {
      const app = apps[cursor++];
      // джиттер, чтобы 50 запросов не уходили ровным залпом
      await sleep(300 + Math.floor(Math.random() * 500));
      const result = await checkOne(app);
      const outcome = applyResult(app, result);
      summary.checked += 1;
      if (outcome === 'published') summary.published += 1;
      if (outcome === 'removed') summary.removed += 1;
      if (outcome === 'error') summary.errors += 1;
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, apps.length) }, () => worker()),
  );

  summary.finishedAt = nowIso();
  // Полный обход отмечаем как «последняя проверка», выборочный — нет:
  // иначе добавление одного приложения сбрасывало бы таймер на UI.
  if (!packageIds?.length) setMeta('last_full_check_at', summary.finishedAt);
  return summary;
}

const globalForRun = globalThis as unknown as {
  __northstarRun?: Promise<CheckSummary>;
};

/**
 * Полный обход без наложений: если проверка уже идёт (например, сработал
 * планировщик, а пользователь нажал «Проверить сейчас»), второй запуск
 * не стартует, а дожидается результата первого.
 */
export function runCheckExclusive(): Promise<CheckSummary> {
  if (globalForRun.__northstarRun) return globalForRun.__northstarRun;

  const run = runCheck().finally(() => {
    globalForRun.__northstarRun = undefined;
  });
  globalForRun.__northstarRun = run;
  return run;
}
