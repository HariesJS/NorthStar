import { playStoreUrl } from './parse-links';

const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

const TIMEOUT_MS = 20_000;

export interface StoreMeta {
  title: string | null;
  developer: string | null;
  iconUrl: string | null;
  storeUpdatedOn: string | null;
}

export type CheckResult =
  | { kind: 'absent' }
  | ({ kind: 'published' | 'pre_registration' } & StoreMeta)
  | { kind: 'error'; message: string };

/**
 * Одна проверка пакета.
 *
 * Классификация (подтверждена живыми запросами):
 *   404                                  -> страницы нет
 *   200 + «Pre-register» / PreOrder      -> предрегистрация, релиза ещё нет
 *   200                                  -> опубликовано
 *   429 / 5xx / сеть                     -> error, статус приложения НЕ меняем
 *
 * `hl=en` обязателен: подпись «Updated on» ищется по тексту, на другом языке
 * регулярка не сработает.
 */
export async function checkPackage(
  packageId: string,
  country = 'US',
): Promise<CheckResult> {
  try {
    const res = await fetch(playStoreUrl(packageId, country), {
      headers: {
        'User-Agent': USER_AGENT,
        'Accept-Language': 'en-US,en;q=0.9',
        Accept: 'text/html,application/xhtml+xml',
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: 'no-store',
    });

    if (res.status === 404) return { kind: 'absent' };

    if (!res.ok) {
      return { kind: 'error', message: `HTTP ${res.status}` };
    }

    const html = await res.text();
    const meta = parseListing(html);
    return { kind: isPreRegistration(html) ? 'pre_registration' : 'published', ...meta };
  } catch (err) {
    const message =
      err instanceof Error
        ? err.name === 'TimeoutError'
          ? 'таймаут запроса'
          : err.message
        : String(err);
    return { kind: 'error', message };
  }
}

function isPreRegistration(html: string): boolean {
  if (/Pre-?registration|Pre-?register/i.test(html)) return true;
  // Вторичный сигнал из структурированных данных: у вышедшего приложения
  // availability = InStock, у предрегистрации — PreOrder.
  return /schema\.org\/PreOrder/i.test(html);
}

interface LdJsonApp {
  name?: string;
  image?: string;
  author?: { name?: string };
}

function parseListing(html: string): StoreMeta {
  let title: string | null = null;
  let developer: string | null = null;
  let iconUrl: string | null = null;

  // ld+json — стабильные машинные данные, в отличие от обфусцированной вёрстки
  const ld = html.match(
    /<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/,
  );
  if (ld) {
    try {
      const data = JSON.parse(ld[1]) as LdJsonApp;
      title = data.name ?? null;
      iconUrl = data.image ?? null;
      developer = data.author?.name ?? null;
    } catch {
      // повреждённый JSON — не повод считать проверку неудачной,
      // статус мы уже определили по HTTP-коду
    }
  }

  if (!title) {
    // запасной вариант: «YouTube - Apps on Google Play»
    const og = html.match(/<meta property="og:title" content="([^"]*)"/);
    if (og) title = og[1].replace(/\s*-\s*Apps on Google Play\s*$/i, '').trim() || null;
  }

  return { title, developer, iconUrl, storeUpdatedOn: parseUpdatedOn(html) };
}

/**
 * Дата обновления. Якорь — текст «Updated on», а не CSS-класс:
 * классы у Google обфусцированы и меняются между сборками.
 */
function parseUpdatedOn(html: string): string | null {
  const m = html.match(/Updated on<\/div>\s*<div[^>]*>([^<]{3,40})<\/div>/);
  return m ? m[1].trim() : null;
}
