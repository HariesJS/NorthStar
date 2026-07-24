import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

const DB_PATH =
  process.env.NORTHSTAR_DB ?? path.join(process.cwd(), 'data', 'northstar.db');

function migrate(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS apps (
      package_id       TEXT PRIMARY KEY,
      title            TEXT,
      developer        TEXT,
      icon_url         TEXT,
      status           TEXT NOT NULL DEFAULT 'unknown',
      store_updated_on TEXT,
      published_at     TEXT,
      removed_at       TEXT,
      last_checked_at  TEXT,
      last_error       TEXT,
      seen_new         INTEGER NOT NULL DEFAULT 0,
      country          TEXT NOT NULL DEFAULT 'US',
      created_at       TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS events (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      package_id  TEXT NOT NULL REFERENCES apps(package_id) ON DELETE CASCADE,
      type        TEXT NOT NULL,
      from_status TEXT,
      to_status   TEXT,
      detail      TEXT,
      created_at  TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_events_pkg ON events(package_id, created_at DESC);

    -- одна строка служебного состояния: когда последний раз отработал полный обход
    CREATE TABLE IF NOT EXISTS meta (
      key   TEXT PRIMARY KEY,
      value TEXT
    );
  `);

  // Google Play не отдаёт настоящую дату первого релиза — если приложение
  // оказалось опубликовано уже на первой же проверке, published_at не может
  // быть точной, и это отмечается этим флагом (см. checker.ts).
  ensureColumn(db, 'apps', 'published_before_tracking', 'INTEGER NOT NULL DEFAULT 0');
}

function ensureColumn(db: Database.Database, table: string, column: string, ddl: string) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  if (!cols.some((c) => c.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${ddl}`);
  }
}

function open(): Database.Database {
  mkdirSync(path.dirname(DB_PATH), { recursive: true });
  const db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  migrate(db);
  return db;
}

// В dev-режиме Next перезагружает модули на каждое изменение — без кеша в globalThis
// накапливались бы открытые хендлы к одному файлу БД.
const globalForDb = globalThis as unknown as { __northstarDb?: Database.Database };
export const db: Database.Database = (globalForDb.__northstarDb ??= open());

export function nowIso(): string {
  return new Date().toISOString();
}

export function getMeta(key: string): string | null {
  const row = db.prepare('SELECT value FROM meta WHERE key = ?').get(key) as
    | { value: string | null }
    | undefined;
  return row?.value ?? null;
}

export function setMeta(key: string, value: string): void {
  db.prepare(
    'INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
  ).run(key, value);
}
