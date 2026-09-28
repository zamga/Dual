// SQLite through node:sqlite (DatabaseSync). One connection per process; every write path is
// synchronous, so a transaction never spans an await.
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
export const SCHEMA_PATH = join(HERE, 'schema.sql');
// Migrations for databases created by an earlier schema.sql. A fresh database is created from the
// current schema.sql and marked with the latest id; an older one runs every migration above its id.
// Append here (never edit or reorder): { id: 2, sql: 'ALTER TABLE ... ADD COLUMN ...' }.
export const MIGRATIONS = [];
export const SCHEMA_VERSION = String(Math.max(1, ...MIGRATIONS.map((m) => m.id)));

export const APPEND_ONLY_TABLES = [
  'consent_events',
  'recommendations',
  'ledger_entries',
  'processed_events',
  'delivery_events',
  'opt_outs',
  'access_log',
];

// openDb(path = ':memory:') -> Db. Applies schema.sql (idempotent) and pragmas.
export function openDb(path = ':memory:') {
  const raw = new DatabaseSync(path);
  if (path !== ':memory:') raw.exec('PRAGMA journal_mode = WAL');
  raw.exec('PRAGMA foreign_keys = ON');
  raw.exec('PRAGMA busy_timeout = 5000');
  const fresh = !raw.prepare("SELECT 1 AS x FROM sqlite_master WHERE type = 'table' AND name = 'schema_meta'").get();
  raw.exec(readFileSync(SCHEMA_PATH, 'utf8'));
  const setVersion = raw.prepare('INSERT INTO schema_meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value');
  if (fresh) {
    setVersion.run('schema_version', SCHEMA_VERSION);
  } else {
    const current = Number(raw.prepare("SELECT value FROM schema_meta WHERE key = 'schema_version'").get()?.value ?? 1);
    for (const m of MIGRATIONS.filter((x) => x.id > current).sort((a, b) => a.id - b.id)) {
      raw.exec('BEGIN IMMEDIATE');
      try {
        raw.exec(m.sql);
        setVersion.run('schema_version', String(m.id));
        raw.exec('COMMIT');
      } catch (e) {
        raw.exec('ROLLBACK');
        throw e;
      }
    }
  }
  return wrap(raw);
}

function wrap(raw) {
  const cache = new Map();
  let depth = 0;
  const stmt = (sql) => {
    let s = cache.get(sql);
    if (!s) {
      s = raw.prepare(sql);
      cache.set(sql, s);
    }
    return s;
  };
  const db = {
    raw,
    // get(sql, ...params) -> row | undefined
    get: (sql, ...params) => clean(stmt(sql).get(...params)),
    // all(sql, ...params) -> rows
    all: (sql, ...params) => stmt(sql).all(...params).map(clean),
    // run(sql, ...params) -> { changes, lastInsertRowid }
    run: (sql, ...params) => {
      const r = stmt(sql).run(...params);
      return { changes: Number(r.changes), lastInsertRowid: Number(r.lastInsertRowid) };
    },
    exec: (sql) => raw.exec(sql),
    // tx(fn) runs fn synchronously inside a transaction (savepoints when nested) and returns its value.
    tx(fn) {
      const name = `sp${depth}`;
      if (depth === 0) raw.exec('BEGIN IMMEDIATE');
      else raw.exec(`SAVEPOINT ${name}`);
      depth++;
      try {
        const out = fn(db);
        if (out && typeof out.then === 'function') throw new Error('db.tx: the callback must be synchronous');
        depth--;
        if (depth === 0) raw.exec('COMMIT');
        else raw.exec(`RELEASE ${name}`);
        return out;
      } catch (e) {
        depth--;
        if (depth === 0) raw.exec('ROLLBACK');
        else raw.exec(`ROLLBACK TO ${name}; RELEASE ${name}`);
        throw e;
      }
    },
    tables: () => raw.prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name").all().map((r) => r.name),
    close: () => {
      cache.clear();
      raw.close();
    },
    // Settings (key/value), e.g. the SMS pause switch part 2 flips on a 30007 spike.
    getSetting: (key, fallback = null) => stmt('SELECT value FROM settings WHERE key = ?').get(key)?.value ?? fallback,
    setSetting: (key, value, at = new Date().toISOString()) =>
      stmt('INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at').run(
        key,
        String(value),
        at,
      ),
  };
  return db;
}

// node:sqlite returns null-prototype objects; give callers plain ones.
function clean(row) {
  return row ? { ...row } : row;
}

export function isAppendOnlyError(e) {
  return /append-only/.test(String(e?.message));
}

export function isUniqueError(e) {
  return /UNIQUE constraint failed/.test(String(e?.message));
}
