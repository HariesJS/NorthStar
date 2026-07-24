/**
 * Планировщик проверок.
 *
 * Здесь сознательно нет ни одного импорта серверного кода: instrumentation
 * компилируется в том числе для edge-рантайма, где нет ни `node:fs`, ни
 * нативного better-sqlite3. Поэтому тик просто дёргает свой же HTTP-эндпоинт
 * /api/check — он уже выполняется в node-рантайме.
 *
 * Бонус: при переезде на хостинг без фоновых процессов (Vercel) этот файл
 * удаляется, а тот же эндпоинт начинает дёргать внешний cron.
 */

const INTERVAL_MS = 15 * 60 * 1000;
const FIRST_RUN_DELAY_MS = 5_000;

const g = globalThis as unknown as { __northstarTimer?: NodeJS.Timeout };

export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  // В dev Next перезагружает модули — без этой проверки таймеры множились бы
  if (g.__northstarTimer) return;

  const port = process.env.PORT ?? '3000';
  const url = `http://127.0.0.1:${port}/api/check`;
  const token = process.env.NORTHSTAR_CHECK_TOKEN;

  const tick = async () => {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: token ? { 'x-northstar-token': token } : undefined,
      });
      if (!res.ok) {
        console.error(`[northstar] проверка вернула HTTP ${res.status}`);
        return;
      }
      const { summary } = (await res.json()) as {
        summary?: { checked: number; published: number; removed: number; errors: number };
      };
      if (summary) {
        console.log(
          `[northstar] проверено ${summary.checked}, вышло ${summary.published}, ` +
            `удалено ${summary.removed}, ошибок ${summary.errors}`,
        );
      }
    } catch (err) {
      console.error('[northstar] проверка не запустилась:', err);
    }
  };

  setTimeout(tick, FIRST_RUN_DELAY_MS);
  g.__northstarTimer = setInterval(tick, INTERVAL_MS);
  console.log('[northstar] планировщик запущен: проверка каждые 15 минут');
}
