import { db, nowIso } from './db';
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
    published_at DESC,
    created_at DESC
`;

export function listApps(): TrackedApp[] {
  return db.prepare(`SELECT * FROM apps ${ORDER_BY}`).all() as TrackedApp[];
}

export function getApp(packageId: string): TrackedApp | undefined {
  return db.prepare('SELECT * FROM apps WHERE package_id = ?').get(packageId) as
    | TrackedApp
    | undefined;
}

export function getEvents(packageId: string): AppEvent[] {
  return db
    .prepare('SELECT * FROM events WHERE package_id = ? ORDER BY created_at DESC, id DESC')
    .all(packageId) as AppEvent[];
}

export interface AddResult {
  added: string[];
  duplicates: string[];
}

export function addApps(packageIds: string[], country = 'US'): AddResult {
  const insert = db.prepare(
    `INSERT INTO apps (package_id, status, country, created_at)
     VALUES (?, 'unknown', ?, ?)
     ON CONFLICT(package_id) DO NOTHING`,
  );
  const added: string[] = [];
  const duplicates: string[] = [];

  const tx = db.transaction((ids: string[]) => {
    for (const id of ids) {
      const info = insert.run(id, country, nowIso());
      if (info.changes > 0) {
        added.push(id);
        db.prepare(
          `INSERT INTO events (package_id, type, from_status, to_status, detail, created_at)
           VALUES (?, 'added', NULL, 'unknown', NULL, ?)`,
        ).run(id, nowIso());
      } else {
        duplicates.push(id);
      }
    }
  });
  tx(packageIds);

  return { added, duplicates };
}

export function markSeen(packageId: string): void {
  db.prepare('UPDATE apps SET seen_new = 1 WHERE package_id = ?').run(packageId);
}

export function deleteApp(packageId: string): void {
  db.prepare('DELETE FROM apps WHERE package_id = ?').run(packageId);
}
