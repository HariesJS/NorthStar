import { NextResponse } from 'next/server';
import { deleteApp, getApp, getEvents, markSeen } from '@/lib/repo';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type Ctx = { params: Promise<{ pkg: string }> };

export async function GET(_request: Request, { params }: Ctx) {
  const { pkg } = await params;
  const app = await getApp(pkg);
  if (!app) return NextResponse.json({ error: 'Не найдено' }, { status: 404 });
  return NextResponse.json({ app, events: await getEvents(pkg) });
}

export async function PATCH(_request: Request, { params }: Ctx) {
  const { pkg } = await params;
  if (!(await getApp(pkg)))
    return NextResponse.json({ error: 'Не найдено' }, { status: 404 });
  await markSeen(pkg);
  return NextResponse.json({ app: await getApp(pkg) });
}

export async function DELETE(_request: Request, { params }: Ctx) {
  const { pkg } = await params;
  await deleteApp(pkg);
  return NextResponse.json({ ok: true });
}
