import { NextResponse } from 'next/server';
import { runCheckExclusive } from '@/lib/checker';
import { listApps } from '@/lib/repo';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
// Vercel Hobby ограничивает функцию 60 секундами. Полный обход 50 приложений
// в 6 потоков укладывается с запасом.
export const maxDuration = 60;

async function handle(request: Request) {
  // Локально токен не нужен; на хостинге задаётся NORTHSTAR_CHECK_TOKEN,
  // чтобы обход не мог дёрнуть кто угодно. Внешний cron (GitHub Actions)
  // передаёт его либо заголовком, либо ?token= в URL.
  const token = process.env.NORTHSTAR_CHECK_TOKEN;
  if (token) {
    const url = new URL(request.url);
    const provided =
      request.headers.get('x-northstar-token') ??
      request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ??
      url.searchParams.get('token');
    if (provided !== token) {
      return NextResponse.json({ error: 'Недостаточно прав' }, { status: 401 });
    }
  }

  const summary = await runCheckExclusive();
  return NextResponse.json({ summary, apps: await listApps() });
}

export async function POST(request: Request) {
  return handle(request);
}

// GET разрешён, чтобы cron мог дёргать проверку простым запросом
export async function GET(request: Request) {
  return handle(request);
}
