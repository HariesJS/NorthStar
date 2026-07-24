import { NextResponse } from 'next/server';
import { runCheckExclusive } from '@/lib/checker';
import { listApps } from '@/lib/repo';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 300;

export async function POST(request: Request) {
  // Локально токен не нужен; на хостинге задаётся NORTHSTAR_CHECK_TOKEN,
  // чтобы обход не мог дёрнуть кто угодно.
  const token = process.env.NORTHSTAR_CHECK_TOKEN;
  if (token && request.headers.get('x-northstar-token') !== token) {
    return NextResponse.json({ error: 'Недостаточно прав' }, { status: 401 });
  }

  const summary = await runCheckExclusive();
  return NextResponse.json({ summary, apps: listApps() });
}
