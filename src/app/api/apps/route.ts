import { NextResponse } from 'next/server';
import { getMeta } from '@/lib/db';
import { addApps, listApps } from '@/lib/repo';
import { parseLinks } from '@/lib/parse-links';
import { runCheck } from '@/lib/checker';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  const [apps, lastFullCheckAt] = await Promise.all([
    listApps(),
    getMeta('last_full_check_at'),
  ]);
  return NextResponse.json({ apps, lastFullCheckAt });
}

export async function POST(request: Request) {
  const body = (await request.json()) as { text?: string };
  const text = body.text ?? '';
  const { packageIds, unrecognized } = parseLinks(text);

  if (packageIds.length === 0) {
    return NextResponse.json(
      { added: [], duplicates: [], unrecognized, error: 'Не найдено ни одного package id' },
      { status: 400 },
    );
  }

  const { added, duplicates } = await addApps(packageIds);

  // Новые проверяем сразу, чтобы не ждать следующего тика планировщика
  if (added.length > 0) {
    await runCheck(added);
  }

  return NextResponse.json({
    added,
    duplicates,
    unrecognized,
    apps: await listApps(),
  });
}
