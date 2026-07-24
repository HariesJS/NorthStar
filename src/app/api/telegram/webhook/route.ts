import { NextResponse } from 'next/server';
import {
  addSubscriber,
  deactivateSubscriber,
  sendMessage,
  type ChatType,
} from '@/lib/telegram';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// Минимальная форма Telegram Update — только используемые поля.
interface TgChat {
  id: number;
  type: ChatType;
  title?: string;
  username?: string;
}
interface TgUpdate {
  message?: { chat: TgChat; text?: string; from?: { username?: string } };
  my_chat_member?: {
    chat: TgChat;
    new_chat_member: { status: string };
  };
}

function chatLabel(chat: TgChat, fromUsername?: string): string | null {
  return chat.title ?? (chat.username ? `@${chat.username}` : null) ??
    (fromUsername ? `@${fromUsername}` : null);
}

export async function POST(request: Request) {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  // Telegram присылает секрет этим заголовком (задаётся при setWebhook).
  if (
    secret &&
    request.headers.get('x-telegram-bot-api-secret-token') !== secret
  ) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  let update: TgUpdate;
  try {
    update = (await request.json()) as TgUpdate;
  } catch {
    return NextResponse.json({ ok: true }); // мусор — просто игнорируем
  }

  try {
    await handleUpdate(update, request);
  } catch {
    // Никогда не отвечаем не-200: иначе Telegram будет бесконечно ретраить.
  }
  return NextResponse.json({ ok: true });
}

async function handleUpdate(update: TgUpdate, request: Request) {
  // Бота добавили/удалили из чата — приходит всегда, даже при включённом
  // privacy mode, поэтому это надёжный способ поймать добавление в группу.
  if (update.my_chat_member) {
    const { chat, new_chat_member } = update.my_chat_member;
    const status = new_chat_member.status;
    if (status === 'member' || status === 'administrator') {
      await addSubscriber(chat.id, chat.type, chatLabel(chat));
    } else if (status === 'left' || status === 'kicked') {
      await deactivateSubscriber(chat.id);
    }
    return;
  }

  const msg = update.message;
  if (!msg?.text) return;
  const text = msg.text.trim();
  const chat = msg.chat;

  // Команды могут прийти как «/start» и как «/start@ИмяБота» в группах.
  const command = text.split(/\s+/)[0].split('@')[0].toLowerCase();

  if (command === '/start') {
    await addSubscriber(chat.id, chat.type, chatLabel(chat, msg.from?.username));
    const siteUrl = originFromRequest(request);
    // web_app-кнопка (открывает Mini App) допустима только в личных чатах.
    const button =
      siteUrl && chat.type === 'private'
        ? { text: '📱 Открыть North Star', url: siteUrl, kind: 'web_app' as const }
        : undefined;
    await sendMessage(
      String(chat.id),
      [
        '👋 Готово! Буду присылать сюда сообщение, когда отслеживаемое приложение',
        'выйдет в Google Play.',
        '',
        'Открыть список приложений — кнопка меню бота или кнопка ниже.',
      ].join('\n'),
      button ? { button } : {},
    );
  } else if (command === '/stop') {
    await deactivateSubscriber(chat.id);
    await sendMessage(String(chat.id), 'Отписал. Вернуться — команда /start.');
  }
}

function originFromRequest(request: Request): string | null {
  const host = request.headers.get('host');
  if (!host) return null;
  const proto = request.headers.get('x-forwarded-proto') ?? 'https';
  return `${proto}://${host}`;
}
