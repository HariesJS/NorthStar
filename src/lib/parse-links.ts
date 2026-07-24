/**
 * Package id в Android: сегменты через точку, минимум два сегмента,
 * первый начинается с буквы. Ловим и внутри URL (`?id=...`), и голым в строке.
 */
const PACKAGE_RE = /[a-zA-Z][a-zA-Z0-9_]*(?:\.[a-zA-Z0-9_]+)+/;
const ID_PARAM_RE = /[?&]id=([a-zA-Z][a-zA-Z0-9_]*(?:\.[a-zA-Z0-9_]+)+)/;

export interface ParsedLinks {
  packageIds: string[];
  /** строки, из которых не удалось вытащить package id */
  unrecognized: string[];
}

export function parseLinks(input: string): ParsedLinks {
  const packageIds: string[] = [];
  const unrecognized: string[] = [];
  const seen = new Set<string>();

  // разделители — перевод строки, запятая, точка с запятой, пробелы
  const lines = input
    .split(/[\n,;]+/)
    .map((l) => l.trim())
    .filter(Boolean);

  for (const line of lines) {
    // Сначала пробуем ?id=... — иначе в ссылке с доменом
    // "play.google.com" регулярка PACKAGE_RE зацепила бы сам домен.
    const fromParam = line.match(ID_PARAM_RE)?.[1];
    const candidate = fromParam ?? extractBare(line);

    if (!candidate) {
      unrecognized.push(line);
      continue;
    }
    if (seen.has(candidate)) continue;
    seen.add(candidate);
    packageIds.push(candidate);
  }

  return { packageIds, unrecognized };
}

/**
 * Строка без ?id= — это либо голый package id, либо мусор.
 * Голая ссылка на play.google.com без id нам не подходит, поэтому
 * такие строки отбраковываем явно.
 */
function extractBare(line: string): string | null {
  if (/^https?:\/\//i.test(line) || line.includes('/')) return null;
  const m = line.match(PACKAGE_RE);
  if (!m) return null;
  // весь токен целиком должен быть package id, а не куском фразы
  return m[0] === line ? m[0] : null;
}

export function playStoreUrl(packageId: string, country = 'US'): string {
  return `https://play.google.com/store/apps/details?id=${encodeURIComponent(
    packageId,
  )}&hl=en&gl=${country}`;
}
