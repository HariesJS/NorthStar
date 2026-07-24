import { query } from './db';
import { playStoreUrl } from './parse-links';

const TOKEN = process.env.TELEGRAM_BOT_TOKEN ?? '';
const API = TOKEN ? `https://api.telegram.org/bot${TOKEN}` : '';

/** Настроен ли бот. Без токена все функции — тихий no-op (локальная разработка). */
export function telegramEnabled(): boolean {
  return Boolean(TOKEN);
}

/** В HTML-режиме Telegram нужно экранировать только эти три символа. */
export function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

interface InlineButton {
  text: string;
  url: string;
  /** web_app открывает URL как Telegram Mini App (только в личных чатах);
   *  иначе обычная кнопка-ссылка, работающая где угодно. */
  kind?: 'web_app' | 'url';
}

interface SendResult {
  ok: boolean;
  /** код ошибки Telegram, если запрос дошёл, но был отклонён (403, 400, …) */
  errorCode?: number;
}

function buttonMarkup(button: InlineButton) {
  const cell =
    button.kind === 'web_app'
      ? { text: button.text, web_app: { url: button.url } }
      : { text: button.text, url: button.url };
  return { inline_keyboard: [[cell]] };
}

/**
 * Отправка сообщения. Не бросает исключений — при любой ошибке возвращает
 * { ok: false }, чтобы сбой Telegram не ломал вызывающий код (обход проверок).
 */
export async function sendMessage(
  chatId: string,
  text: string,
  opts: { button?: InlineButton } = {},
): Promise<SendResult> {
  if (!API) return { ok: false };
  try {
    const res = await fetch(`${API}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
        ...(opts.button ? { reply_markup: buttonMarkup(opts.button) } : {}),
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (res.ok) return { ok: true };
    const body = (await res.json().catch(() => ({}))) as { error_code?: number };
    return { ok: false, errorCode: body.error_code ?? res.status };
  } catch {
    return { ok: false };
  }
}

// ── Подписчики ────────────────────────────────────────────────────────────

export type ChatType = 'private' | 'group' | 'supergroup' | 'channel';

export async function addSubscriber(
  chatId: string | number,
  type: ChatType,
  title: string | null,
): Promise<void> {
  await query(
    `INSERT INTO subscribers (chat_id, type, title, active)
     VALUES ($1, $2, $3, 1)
     ON CONFLICT (chat_id)
       DO UPDATE SET active = 1, type = excluded.type, title = excluded.title`,
    [String(chatId), type, title],
  );
}

export async function deactivateSubscriber(chatId: string | number): Promise<void> {
  await query('UPDATE subscribers SET active = 0 WHERE chat_id = $1', [String(chatId)]);
}

export async function listActiveSubscribers(): Promise<string[]> {
  const rows = await query<{ chat_id: string }>(
    'SELECT chat_id FROM subscribers WHERE active = 1',
  );
  return rows.map((r) => r.chat_id);
}

// ── Уведомление о релизе ───────────────────────────────────────────────────

interface PublishedApp {
  package_id: string;
  title: string | null;
  developer: string | null;
  country: string;
}

/**
 * Разослать всем активным подписчикам сообщение о выходе приложения.
 * Каждая отправка изолирована; на 403/400 (бота заблокировали / чат удалён)
 * подписчик деактивируется. Никогда не бросает наружу.
 */
export async function notifyPublished(app: PublishedApp): Promise<void> {
  if (!API) return;
  try {
    const chatIds = await listActiveSubscribers();
    if (chatIds.length === 0) return;

    const name = escapeHtml(app.title ?? app.package_id);
    const url = playStoreUrl(app.package_id, app.country);
    const lines = [`🎉 <b>${name}</b> вышло в Google Play`];
    if (app.developer) lines.push(escapeHtml(app.developer));
    lines.push('', `<a href="${url}">Открыть в Google Play</a>`);
    const text = lines.join('\n');
    const button: InlineButton = { text: 'Открыть в Google Play', url };

    for (const chatId of chatIds) {
      const res = await sendMessage(chatId, text, { button });
      if (!res.ok && (res.errorCode === 403 || res.errorCode === 400)) {
        await deactivateSubscriber(chatId).catch(() => {});
      }
    }
  } catch {
    // сбой Telegram не должен ломать обход проверок
  }
}
