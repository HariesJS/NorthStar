import { query, queryOne, transaction, nowIso } from './db';
import type { AppEvent, TrackedApp } from './types';

/**
 * Порядок в списке: свежевышедшие (ещё не отмеченные прочитанными) наверх,
 * дальше предрегистрация, ожидающие, и удалённые в конец.
 */
const ORDER_BY = `
  ORDER BY
    CASE
      WHEN status = 'published' AND seen_new = 0 THEN 0
      WHEN status = 'published'                  THEN 1
      WHEN status = 'pre_registration'           THEN 2
      WHEN status = 'not_published'              THEN 3
      WHEN status = 'unknown'                    THEN 4
      ELSE 5
    END,
    published_at DESC NULLS LAST,
    created_at DESC
`;

/** pg отдаёт TIMESTAMPTZ как Date — приводим к ISO-строке, как ждёт остальной код. */
function iso(v: unknown): string | null {
  if (v == null) return null;
  return v instanceof Date ? v.toISOString() : String(v);
}

type AppRow = Omit<
  TrackedApp,
  'published_at' | 'removed_at' | 'last_checked_at' | 'created_at'
> & {
  published_at: Date | string | null;
  removed_at: Date | string | null;
  last_checked_at: Date | string | null;
  created_at: Date | string;
};

function toApp(row: AppRow): TrackedApp {
  return {
    ...row,
    published_at: iso(row.published_at),
    removed_at: iso(row.removed_at),
    last_checked_at: iso(row.last_checked_at),
    created_at: iso(row.created_at) as string,
  };
}

type EventRow = Omit<AppEvent, 'created_at'> & { created_at: Date | string };

export async function listApps(): Promise<TrackedApp[]> {
  const rows = await query<AppRow>(`SELECT * FROM apps ${ORDER_BY}`);
  return rows.map(toApp);
}

export async function getApp(packageId: string): Promise<TrackedApp | undefined> {
  const row = await queryOne<AppRow>('SELECT * FROM apps WHERE package_id = $1', [
    packageId,
  ]);
  return row ? toApp(row) : undefined;
}

export async function getEvents(packageId: string): Promise<AppEvent[]> {
  const rows = await query<EventRow>(
    'SELECT * FROM events WHERE package_id = $1 ORDER BY created_at DESC, id DESC',
    [packageId],
  );
  return rows.map((r) => ({ ...r, created_at: iso(r.created_at) as string }));
}

export interface AddResult {
  added: string[];
  duplicates: string[];
}

export async function addApps(
  packageIds: string[],
  country = 'US',
): Promise<AddResult> {
  const added: string[] = [];
  const duplicates: string[] = [];

  await transaction(async (client) => {
    for (const id of packageIds) {
      const res = await client.query(
        `INSERT INTO apps (package_id, status, country, created_at)
         VALUES ($1, 'unknown', $2, $3)
         ON CONFLICT (package_id) DO NOTHING`,
        [id, country, nowIso()],
      );
      if (res.rowCount && res.rowCount > 0) {
        added.push(id);
        await client.query(
          `INSERT INTO events (package_id, type, from_status, to_status, detail, created_at)
           VALUES ($1, 'added', NULL, 'unknown', NULL, $2)`,
          [id, nowIso()],
        );
      } else {
        duplicates.push(id);
      }
    }
  });

  return { added, duplicates };
}

export async function markSeen(packageId: string): Promise<void> {
  await query('UPDATE apps SET seen_new = 1 WHERE package_id = $1', [packageId]);
}

export async function deleteApp(packageId: string): Promise<void> {
  await query('DELETE FROM apps WHERE package_id = $1', [packageId]);
}
