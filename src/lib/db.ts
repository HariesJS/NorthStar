import { Pool, type PoolClient } from 'pg';

/**
 * Строка подключения. Vercel Postgres прокидывает POSTGRES_URL автоматически;
 * локально/на других хостингах используем DATABASE_URL. SSL нужен почти всем
 * облачным Postgres, но не локальному — определяем по хосту.
 */
const CONNECTION_STRING =
  process.env.POSTGRES_URL ?? process.env.DATABASE_URL ?? '';

function needsSsl(conn: string): boolean {
  if (/sslmode=disable/.test(conn)) return false;
  if (/localhost|127\.0\.0\.1|\/tmp/.test(conn)) return false;
  return true;
}

// В dev Next перезагружает модули на каждое изменение — без кеша в globalThis
// на каждый reload открывался бы новый пул соединений.
const globalForDb = globalThis as unknown as {
  __northstarPool?: Pool;
  __northstarReady?: Promise<void>;
};

function pool(): Pool {
  if (!CONNECTION_STRING) {
    throw new Error(
      'Не задана строка подключения к базе: укажите POSTGRES_URL или DATABASE_URL',
    );
  }
  return (globalForDb.__northstarPool ??= new Pool({
    connectionString: CONNECTION_STRING,
    ssl: needsSsl(CONNECTION_STRING) ? { rejectUnauthorized: false } : undefined,
    max: 5,
  }));
}

async function migrate(client: PoolClient) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS apps (
      package_id       TEXT PRIMARY KEY,
      title            TEXT,
      developer        TEXT,
      icon_url         TEXT,
      status           TEXT NOT NULL DEFAULT 'unknown',
      store_updated_on TEXT,
      published_at     TIMESTAMPTZ,
      removed_at       TIMESTAMPTZ,
      last_checked_at  TIMESTAMPTZ,
      last_error       TEXT,
      seen_new         INTEGER NOT NULL DEFAULT 0,
      country          TEXT NOT NULL DEFAULT 'US',
      created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
      published_before_tracking INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS events (
      id          BIGSERIAL PRIMARY KEY,
      package_id  TEXT NOT NULL REFERENCES apps(package_id) ON DELETE CASCADE,
      type        TEXT NOT NULL,
      from_status TEXT,
      to_status   TEXT,
      detail      TEXT,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE INDEX IF NOT EXISTS idx_events_pkg ON events(package_id, created_at DESC);

    CREATE TABLE IF NOT EXISTS meta (
      key   TEXT PRIMARY KEY,
      value TEXT
    );

    -- Получатели Telegram-уведомлений: личные чаты (нажали /start) и группы
    -- (бота туда добавили). chat_id у групп отрицательный, поэтому TEXT.
    CREATE TABLE IF NOT EXISTS subscribers (
      chat_id     TEXT PRIMARY KEY,
      type        TEXT NOT NULL,      -- private | group | supergroup | channel
      title       TEXT,               -- @username или название группы, для ориентира
      active      INTEGER NOT NULL DEFAULT 1,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
}

/** Схема создаётся один раз за жизнь процесса, до первого запроса. */
function ready(): Promise<void> {
  return (globalForDb.__northstarReady ??= (async () => {
    const client = await pool().connect();
    try {
      await migrate(client);
    } finally {
      client.release();
    }
  })());
}

export async function query<T = unknown>(
  text: string,
  params: unknown[] = [],
): Promise<T[]> {
  await ready();
  const res = await pool().query(text, params);
  return res.rows as T[];
}

export async function queryOne<T = unknown>(
  text: string,
  params: unknown[] = [],
): Promise<T | undefined> {
  const rows = await query<T>(text, params);
  return rows[0];
}

/** Транзакция: колбэк получает клиента, всё внутри — атомарно. */
export async function transaction<T>(
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  await ready();
  const client = await pool().connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export function nowIso(): string {
  return new Date().toISOString();
}

export async function getMeta(key: string): Promise<string | null> {
  const row = await queryOne<{ value: string | null }>(
    'SELECT value FROM meta WHERE key = $1',
    [key],
  );
  return row?.value ?? null;
}

export async function setMeta(key: string, value: string): Promise<void> {
  await query(
    `INSERT INTO meta (key, value) VALUES ($1, $2)
     ON CONFLICT (key) DO UPDATE SET value = excluded.value`,
    [key, value],
  );
}
