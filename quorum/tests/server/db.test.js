import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb, APPEND_ONLY_TABLES, SCHEMA_VERSION, MIGRATIONS } from '../../server/db.js';

// Brief §4.5 tables plus ledger_entries.
const BRIEF_TABLES = [
  'users', 'phone_numbers', 'consent_events', 'channel_prefs', 'push_subscriptions', 'unsubscribe_tokens',
  'subscriptions', 'entitlements', 'processed_events', 'withdrawals',
  'instruments', 'ticker_history', 'universe_snapshots', 'consensus_snapshots',
  'signal_scores', 'vetoes', 'candidates', 'model_versions', 'methodology_versions', 'experiments',
  'issues', 'recommendations', 'persons', 'explanations', 'price_marks', 'outcomes', 'ledger_anchors',
  'notifications', 'delivery_events', 'opt_outs', 'access_log', 'staff_trade_requests', 'disclosure_texts',
  'ledger_entries',
];

const now = '2026-09-28T10:00:00.000Z';

function seed(db) {
  db.run("INSERT INTO users (id, email, created_at, updated_at) VALUES ('usr_1', 'a@b.si', ?, ?)", now, now);
  db.run("INSERT INTO consent_events (user_id, kind, action, text_version, text_sha256, channel, created_at) VALUES ('usr_1', 'sms', 'grant', 'v3', 'ab', 'web', ?)", now);
  db.run(
    "INSERT INTO recommendations (public_no, kind, canonical_json, sha256, prev_sha256, created_at) VALUES ('0001', 'BUY', '{}', 'h1', 'h0', ?)",
    now,
  );
  db.run("INSERT INTO ledger_entries (seq, type, issue_date, at, body_json, prev_hash, hash, created_at) VALUES (0, 'METHODOLOGY', '2025-10-01', ?, '{}', '00', 'aa', ?)", now, now);
  db.run("INSERT INTO processed_events (provider, event_id, type, payload, received_at) VALUES ('stripe', 'evt_1', 'x', '{}', ?)", now);
  db.run("INSERT INTO delivery_events (provider, provider_sid, status, payload, received_at) VALUES ('twilio', 'SM1', 'sent', '{}', ?)", now);
  db.run("INSERT INTO opt_outs (user_id, channel, source, created_at) VALUES ('usr_1', 'sms', 'link', ?)", now);
  db.run("INSERT INTO access_log (actor, action, object_type, object_id, created_at) VALUES ('p1', 'view', 'candidates', '2026-09-28', ?)", now);
}

test('schema has every brief §4.5 table and ledger_entries; opening twice is idempotent', () => {
  const db = openDb(':memory:');
  const tables = db.tables();
  for (const t of BRIEF_TABLES) assert.ok(tables.includes(t), `missing table ${t}`);
  const again = openDb(':memory:');
  assert.equal(again.get("SELECT value FROM schema_meta WHERE key = 'schema_version'").value, SCHEMA_VERSION);
  assert.equal(SCHEMA_VERSION, '2');
  for (const t of ['issue_runs', 'pick_reveals', 'approver_signoffs', 'scheduler_runs', 'ops_alerts']) assert.ok(tables.includes(t), `missing table ${t}`);
  again.close();
  db.close();
});

test('append-only tables reject UPDATE and DELETE with "append-only", accept INSERT', () => {
  const db = openDb(':memory:');
  seed(db);
  assert.deepEqual(APPEND_ONLY_TABLES.sort(), ['access_log', 'consent_events', 'delivery_events', 'ledger_entries', 'opt_outs', 'processed_events', 'recommendations']);
  for (const table of APPEND_ONLY_TABLES) {
    const count = db.get(`SELECT COUNT(*) AS n FROM ${table}`).n;
    assert.equal(count, 1, `${table} seeded`);
    assert.throws(() => db.run(`UPDATE ${table} SET rowid = rowid`), /append-only/, `${table} UPDATE`);
    assert.throws(() => db.run(`DELETE FROM ${table}`), /append-only/, `${table} DELETE`);
    assert.equal(db.get(`SELECT COUNT(*) AS n FROM ${table}`).n, 1, `${table} unchanged`);
  }
  // Mutable tables stay mutable.
  db.run("UPDATE users SET locale = 'sl' WHERE id = 'usr_1'");
  assert.equal(db.get("SELECT locale FROM users WHERE id = 'usr_1'").locale, 'sl');
  db.close();
});

test('the triggers also exist on a file database reopened from disk', async () => {
  const { mkdtempSync, rmSync } = await import('node:fs');
  const { join } = await import('node:path');
  const { tmpdir } = await import('node:os');
  const dir = mkdtempSync(join(tmpdir(), 'quorum-db-'));
  try {
    const path = join(dir, 'q.db');
    const a = openDb(path);
    seed(a);
    a.close();
    const b = openDb(path);
    assert.throws(() => b.run('DELETE FROM consent_events'), /append-only/);
    b.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('tx commits, rolls back on throw, supports nesting, and refuses async callbacks', () => {
  const db = openDb(':memory:');
  db.run("INSERT INTO users (id, email, created_at, updated_at) VALUES ('usr_a', 'a@x.si', ?, ?)", now, now);
  assert.throws(() =>
    db.tx(() => {
      db.run("UPDATE users SET locale = 'sl' WHERE id = 'usr_a'");
      throw new Error('boom');
    }),
  );
  assert.equal(db.get("SELECT locale FROM users WHERE id = 'usr_a'").locale, 'en');
  db.tx(() => {
    db.run("UPDATE users SET locale = 'sl' WHERE id = 'usr_a'");
    assert.throws(() =>
      db.tx(() => {
        db.run("UPDATE users SET email = 'b@x.si' WHERE id = 'usr_a'");
        throw new Error('inner');
      }),
    );
  });
  const row = db.get("SELECT locale, email FROM users WHERE id = 'usr_a'");
  assert.equal(row.locale, 'sl');
  assert.equal(row.email, 'a@x.si');
  assert.throws(() => db.tx(async () => {}), /synchronous/);
  db.close();
});

test('notifications are unique per (rec_id, user_id, channel) and per idempotency key', () => {
  const db = openDb(':memory:');
  seed(db);
  const ins = (key, rec) =>
    db.run(
      "INSERT INTO notifications (idem_key, rec_id, user_id, channel, kind, body_sha256, queued_at, updated_at) VALUES (?, ?, 'usr_1', 'sms', 'BUY', 'h', ?, ?)",
      key,
      rec,
      now,
      now,
    );
  ins('1:usr_1:sms', 1);
  assert.throws(() => ins('other-key', 1), /UNIQUE/);
  assert.throws(() => ins('1:usr_1:sms', null), /UNIQUE/);
  db.close();
});

test('a part 1 database (schema version 1) is migrated to version 2 in place', async () => {
  const { mkdtempSync, rmSync, readFileSync } = await import('node:fs');
  const { join } = await import('node:path');
  const { tmpdir } = await import('node:os');
  const { DatabaseSync } = await import('node:sqlite');
  const dir = mkdtempSync(join(tmpdir(), 'quorum-mig-'));
  try {
    // The part 1 schema, as committed in stage 1.
    const v1 = readFileSync(join(import.meta.dirname, 'fixtures', 'schema-v1.sql'), 'utf8');
    const path = join(dir, 'old.db');
    const raw = new DatabaseSync(path);
    raw.exec(v1);
    raw.exec("INSERT INTO schema_meta (key, value) VALUES ('schema_version', '1')");
    raw.exec("INSERT INTO users (id, email, created_at, updated_at) VALUES ('usr_old', 'old@example.si', 'x', 'x')");
    raw.close();
    const db = openDb(path);
    assert.equal(db.get("SELECT value FROM schema_meta WHERE key = 'schema_version'").value, '2');
    const cols = (t) => db.all(`PRAGMA table_info(${t})`).map((c) => c.name);
    for (const c of ['kind', 'prior_no', 'public_no', 'payload_json', 'thesis_status', 'veto_scan', 'status_reason']) assert.ok(cols('candidates').includes(c), `candidates.${c}`);
    for (const c of ['candidate_id', 'purpose', 'attempt', 'outcome', 'drafter', 'prompt', 'error']) assert.ok(cols('explanations').includes(c), `explanations.${c}`);
    assert.ok(cols('notifications').includes('expires_at'));
    assert.ok(cols('users').includes('timezone'));
    assert.equal(db.get("SELECT email FROM users WHERE id = 'usr_old'").email, 'old@example.si', 'data kept');
    assert.ok(MIGRATIONS.some((m) => m.id === 2));
    db.close();
    const again = openDb(path);
    assert.equal(again.get("SELECT value FROM schema_meta WHERE key = 'schema_version'").value, '2', 'reopening does not migrate twice');
    again.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
