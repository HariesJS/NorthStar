import { NextResponse } from 'next/server';
import { deleteApp, getApp, getEvents, markSeen } from '@/lib/repo';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ pkg: string }> };

export async function GET(_request: Request, { params }: Ctx) {
  const { pkg } = await params;
  const app = getApp(pkg);
  if (!app) return NextResponse.json({ error: 'Не найдено' }, { status: 404 });
  return NextResponse.json({ app, events: getEvents(pkg) });
}

export async function PATCH(_request: Request, { params }: Ctx) {
  const { pkg } = await params;
  if (!getApp(pkg)) return NextResponse.json({ error: 'Не найдено' }, { status: 404 });
  markSeen(pkg);
  return NextResponse.json({ app: getApp(pkg) });
}

export async function DELETE(_request: Request, { params }: Ctx) {
  const { pkg } = await params;
  deleteApp(pkg);
  return NextResponse.json({ ok: true });
}
