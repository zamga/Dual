// Abuse and privacy hardening of the live server: per-prefix rate limits, global budgets, malformed
// paths, production start-up checks, self-hosted fonts, cached data responses and the ledger CSV,
// browser-bound sign-in links, push subscription limits and interrupted sends.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync, utimesSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { ledgerCsv } from '../../core/ledger.js';
import { rateKey, createRateLimiter } from '../../server/http.js';
import { loadConfig } from '../../server/config.js';
import { productionProblems } from '../../server/index.js';
import { selfHostFonts } from '../../server/fonts.js';
import { generateVapidKeys } from '../../server/vendors/push.js';
import { makeApp, makeClient, readyUser, checkoutAndPay } from './helpers.js';

const WEB_INDEX = readFileSync(new URL('../../web/index.html', import.meta.url), 'utf8');
let root;

before(() => {
  root = mkdtempSync(join(tmpdir(), 'quorum-hard-'));
  mkdirSync(join(root, 'data'));
  // the real shell's <head> (with its Google Fonts links), so the live-mode rewrite is tested on it
  writeFileSync(join(root, 'index.html'), WEB_INDEX);
  writeFileSync(join(root, 'data', 'meta.json'), JSON.stringify({ simulated: true, asOf: '2026-09-28' }));
  writeFileSync(join(root, 'data', 'picks.json'), JSON.stringify([{ no: '0001', status: 'open', ticker: 'ABCD', commit: 'c'.repeat(64) }]));
  const entries = [
    { seq: 0, type: 'METHODOLOGY', issueDate: '2025-10-01', at: '2025-10-01T08:00:00+02:00', body: { version: '1.0', note: 'a "quoted", comma' }, prevHash: '0'.repeat(64), hash: 'a'.repeat(64) },
    { seq: 1, type: 'ISSUE', issueDate: '2025-10-01', at: '2025-10-01T14:00:00+02:00', body: { issueNo: 1, buys: [] }, prevHash: 'a'.repeat(64), hash: 'b'.repeat(64) },
  ];
  writeFileSync(join(root, 'data', 'ledger.json'), JSON.stringify({ simulated: true, genesis: '0'.repeat(64), entries, anchors: [] }));
});
after(() => rmSync(root, { recursive: true, force: true }));

const pushKeys = (n) => ({ p256dh: generateVapidKeys().publicKey, auth: Buffer.alloc(16, n).toString('base64url') });

test('rate keys: IPv4 per address, IPv6 per /64 (or /56); the limiter map is bounded', () => {
  assert.equal(rateKey('203.0.113.9'), '203.0.113.9');
  assert.equal(rateKey('2001:db8:1:2::a'), '2001:db8:1:2::/64');
  assert.equal(rateKey('2001:db8:1:2:ffff:ffff:ffff:1'), '2001:db8:1:2::/64');
  assert.equal(rateKey('[2001:DB8:1:2::7]'), '2001:db8:1:2::/64');
  assert.notEqual(rateKey('2001:db8:1:3::a'), rateKey('2001:db8:1:2::a'));
  assert.equal(rateKey('2001:db8:1:3::a', 56), rateKey('2001:db8:1:ff::1', 56));
  assert.equal(rateKey('2001:db8:1:2ff::1', 56), '2001:db8:1:200::/56');
  assert.equal(rateKey('2001:db8:1:3::a', 56), '2001:db8:1:0::/56');
  assert.equal(rateKey('::1'), '0:0:0:0::/64');
  assert.equal(rateKey('fe80::1%eth0'), 'fe80:0:0:0::/64');
  assert.equal(rateKey('not an address'), 'not an address');
  let t = 0;
  const rl = createRateLimiter({ clock: () => new Date(t), maxKeys: 100 });
  for (let i = 0; i < 1000; i++) rl.take('b', `k${i}`, { capacity: 1, windowMs: 60_000 });
  assert.ok(rl.size() <= 100, `bounded (${rl.size()})`);
  // the most recently used survive; the oldest idle ones went first
  assert.equal(rl.take('b', 'k999', { capacity: 1, windowMs: 60_000 }).ok, false);
});

test('one IPv6 /64 is one client for the rate limits', async () => {
  const t = await makeApp({ webRoot: root, config: { trustProxy: 1 } });
  try {
    const c = t.client();
    const statuses = {};
    for (let i = 0; i < 35; i++) {
      const r = await c.get(`/u/Guess${String(i).padStart(3, '0')}`, { headers: { 'x-forwarded-for': `2001:db8:1:2::${(i + 1).toString(16)}` } });
      statuses[r.status] = (statuses[r.status] ?? 0) + 1;
    }
    assert.deepEqual(statuses, { 200: 30, 429: 5 }, 'optout allows 30 a minute per /56');
    assert.equal((await c.get('/u/Other0001', { headers: { 'x-forwarded-for': '2001:db8:9::1' } })).status, 200, 'another prefix has its own bucket');
  } finally {
    await t.close();
  }
});

test('global budgets: all clients together; past one the route refuses (or only pages) and on-call is paged once', async () => {
  const t = await makeApp({ webRoot: root, config: { globalLimits: { authEmails: { capacity: 2, windowMs: 60_000 }, unknownOptOutTokens: { capacity: 2, windowMs: 600_000 } } } });
  try {
    for (const [i, ip] of ['198.51.100.1', '198.51.100.2', '198.51.100.3', '198.51.100.4'].entries()) {
      const r = await makeClient(t.url).post('/api/auth/magic', { email: `flood${i}@example.si` }, { headers: { 'x-forwarded-for': ip } });
      assert.equal(r.status, i < 2 ? 202 : 429, `request ${i}`);
    }
    assert.equal(t.email.outbox.filter((m) => m.tag === 'MAGIC_LINK').length, 2);
    // unknown opt-out tokens: the answer stays the same (no oracle), on-call hears about the scan
    const pages = [];
    for (let i = 0; i < 4; i++) pages.push((await t.client().get(`/u/Scan${i}000`)).status);
    assert.deepEqual(pages, [200, 200, 200, 200]);
    const alerts = t.pager.pages.filter((p) => p.kind === 'global_budget').map((p) => p.message);
    assert.equal(alerts.length, 2);
    assert.match(alerts[0], /authEmails/);
    assert.match(alerts[1], /unknownOptOutTokens/);
  } finally {
    await t.close();
  }
});

test('a malformed %-escape in a path parameter is a 400, not a 500 with a stack trace in the log', async () => {
  const t = await makeApp({ webRoot: root });
  const errors = [];
  t.ctx.log.error = (...a) => errors.push(a.join(' '));
  try {
    for (const path of ['/u/%E0%A4%A', '/data/%', '/p/%zz']) {
      const r = await t.client().get(path);
      assert.deepEqual([r.status, r.body.error], [400, 'bad_request'], path);
    }
    assert.deepEqual(errors, []);
  } finally {
    await t.close();
  }
});

test('production start-up refuses weak or unsafe settings', () => {
  const env = { NODE_ENV: 'production', SESSION_SECRET: 's'.repeat(40), PUBLIC_BASE_URL: 'https://qrm.example', SMS_TRANSPORT: 'twilio', TWILIO_ACCOUNT_SID: 'AC1', TWILIO_AUTH_TOKEN: 't', ADMIN_TOKEN: 'a'.repeat(43) };
  assert.deepEqual(productionProblems(loadConfig(env)), []);
  assert.deepEqual(productionProblems(loadConfig({ ...env, NODE_ENV: '' , SMS_TRANSPORT: '' })), [], 'development is not checked');
  const problems = (over) => productionProblems(loadConfig({ ...env, ...over })).join(' | ');
  assert.match(problems({ SMS_TRANSPORT: '' }), /SMS_TRANSPORT=twilio is required/);
  assert.equal(problems({ SMS_TRANSPORT: '', ALLOW_CONSOLE_SMS: '1' }), '', 'a staging host may opt in');
  assert.match(problems({ ADMIN_TOKEN: 'admin' }), /ADMIN_TOKEN must be at least 32/);
  assert.equal(problems({ ADMIN_TOKEN: '' }), '', 'no token: the console is off');
  assert.match(problems({ SESSION_SECRET: 'short' }), /SESSION_SECRET must be at least 32 bytes/);
  assert.match(problems({ SESSION_SECRET: '' }), /SESSION_SECRET is required/);
  assert.match(problems({ PUBLIC_BASE_URL: 'http://qrm.example' }), /PUBLIC_BASE_URL must be https/);
});

test('live mode: fonts are served from this origin; no page links a font service', async () => {
  const t = await makeApp({ webRoot: root });
  try {
    const c = t.client();
    const page = await c.get('/');
    assert.equal(page.status, 200);
    assert.ok(page.text.includes('<link rel="stylesheet" href="/fonts/fonts.css" />'));
    assert.doesNotMatch(page.text, /googleapis|gstatic/);
    assert.match(page.text, /<meta name="quorum-mode" content="live" \/>/);
    assert.equal(selfHostFonts(page.text), page.text, 'idempotent');
    const css = await c.get('/fonts/fonts.css');
    assert.deepEqual([css.status, css.headers.get('content-type')], [200, 'text/css; charset=utf-8']);
    for (const family of ['Archivo', 'Newsreader', 'Martian Mono']) assert.ok(css.text.includes(`font-family: '${family}'`), family);
    assert.doesNotMatch(css.text, /https?:\/\//);
    const files = [...css.text.matchAll(/url\((\/fonts\/[a-z-]+\.woff2)\)/g)].map((m) => m[1]);
    assert.equal(files.length, 8);
    for (const f of new Set(files)) {
      const r = await fetch(t.url + f);
      assert.deepEqual([r.status, r.headers.get('content-type')], [200, 'font/woff2'], f);
      const b = Buffer.from(await r.arrayBuffer());
      assert.equal(b.subarray(0, 4).toString('latin1'), 'wOF2', f);
    }
    assert.equal((await c.get('/fonts/OFL-archivo.txt')).status, 200);
    assert.equal((await c.get('/fonts/..%2fconfig.js')).status, 404);
    assert.doesNotMatch((await c.get('/u/Abcdef12')).text, /googleapis|gstatic/, 'the opt-out page too');
  } finally {
    await t.close();
  }
});

test('data files: each variant serialised once, strong ETag and 304; /api/ledger.csv is the ledger page CSV', async () => {
  const t = await makeApp({ webRoot: root });
  try {
    const anon = t.client();
    const a = await anon.get('/data/picks.json');
    const etag = a.headers.get('etag');
    assert.match(etag, /^"[A-Za-z0-9_-]{27}"$/);
    assert.equal(a.body[0].sealed, true);
    const b = await anon.get('/data/picks.json', { headers: { 'if-none-match': etag } });
    assert.deepEqual([b.status, b.text], [304, '']);
    // an entitled reader gets another variant with another ETag
    const { client } = await readyUser(t);
    await checkoutAndPay(t, client);
    const full = await client.get('/data/picks.json', { headers: { 'if-none-match': etag } });
    assert.equal(full.status, 200);
    assert.equal(full.body[0].ticker, 'ABCD');
    assert.notEqual(full.headers.get('etag'), etag);
    // the serialised body is built once per file version
    const cached = await t.ctx.data.serialized('picks', 'redacted');
    assert.equal(await t.ctx.data.serialized('picks', 'redacted'), cached);
    // a new file version is picked up
    writeFileSync(join(root, 'data', 'meta.json'), JSON.stringify({ simulated: true, asOf: '2026-09-29' }));
    utimesSync(join(root, 'data', 'meta.json'), new Date(), new Date(Date.now() + 5000));
    assert.equal((await anon.get('/data/meta.json')).body.asOf, '2026-09-29');
    // the ledger as CSV, byte for byte what the page's "Copy CSV" gives from /data/ledger.json
    const csv = await anon.get('/api/ledger.csv');
    assert.equal(csv.status, 200);
    assert.equal(csv.headers.get('content-type'), 'text/csv; charset=utf-8');
    assert.equal(csv.text, ledgerCsv((await anon.get('/data/ledger.json')).body.entries));
    assert.match(csv.text, /^seq,type,issue_date,at,prev_hash,hash,body_jcs\n0,METHODOLOGY,/);
    assert.equal((await anon.get('/api/ledger.csv', { headers: { 'if-none-match': csv.headers.get('etag') } })).status, 304);
  } finally {
    await t.close();
  }
});

test('sign-in links sign in only the browser that asked; elsewhere a page that changes nothing (no login CSRF)', async () => {
  const t = await makeApp({ webRoot: root });
  try {
    const linkFor = (email) => new URL([...t.email.outbox].reverse().find((m) => m.to === email && m.tag === 'MAGIC_LINK').link);
    // the attacker asks for a link to their own account...
    const attacker = t.client();
    const asked = await attacker.post('/api/auth/magic', { email: 'attacker@evil.example' });
    assert.match(asked.headers.get('set-cookie'), /qrm_login=[A-Za-z0-9_-]{43}; Path=\/api\/auth; SameSite=Lax; Max-Age=900; HttpOnly; Secure/);
    const link = linkFor('attacker@evil.example');
    // ...and the victim's browser opens it: no session, only a question naming the account
    const victim = t.client();
    const page = await victim.get(link.pathname + link.search, { headers: { 'sec-fetch-site': 'cross-site', referer: 'https://evil.example/' } });
    assert.equal(page.status, 200);
    assert.equal(page.headers.get('set-cookie'), null);
    assert.match(page.text, /Sign in as <span class="mono">a\*\*\*@evil\.example<\/span>\?/);
    assert.match(page.text, /<form method="post" action="\/api\/auth\/callback">/);
    assert.equal((await victim.get('/api/me')).body.authenticated, false);
    assert.equal(t.db.get('SELECT used_at FROM magic_links').used_at, null, 'a mail scanner or a victim does not use the link up');
    // a cross-site form cannot press the button for them
    const token = link.searchParams.get('token');
    const forged = await victim.request('POST', '/api/auth/callback', { form: { token }, headers: { 'sec-fetch-site': 'cross-site' } });
    assert.equal(forged.status, 403);
    assert.equal((await victim.get('/api/me')).body.authenticated, false);
    // the same browser that asked is signed in directly; the binding cookie is cleared
    const own = await attacker.get(link.pathname + link.search);
    assert.equal(own.status, 303);
    assert.match(own.headers.get('set-cookie'), /qrm_session=/);
    assert.equal((await attacker.get('/api/me')).body.user.email, 'attacker@evil.example');
    assert.equal(attacker.jar.has('qrm_login'), false);
    // someone on a second device confirms on the page (same-origin POST)
    const ana = t.client();
    await ana.post('/api/auth/magic', { email: 'ana@example.si' });
    const phone = t.client();
    const l2 = linkFor('ana@example.si');
    assert.equal((await phone.request('HEAD', l2.pathname + l2.search)).status, 200);
    assert.equal((await phone.get(l2.pathname + l2.search)).status, 200);
    const confirm = await phone.request('POST', '/api/auth/callback', { form: { token: l2.searchParams.get('token') }, headers: { origin: 'https://quorum.test' } });
    assert.equal(confirm.status, 303);
    assert.equal((await phone.get('/api/me')).body.user.email, 'ana@example.si');
    assert.equal((await phone.request('POST', '/api/auth/callback', { form: { token: l2.searchParams.get('token') } })).headers.get('location'), '/#join', 'once only');
  } finally {
    await t.close();
  }
});

test('push: at most 5 live devices per user (the oldest revoked); a tarpit endpoint cannot hold the fan-out', async () => {
  const t = await makeApp({ webRoot: root, config: { push: { timeoutMs: 50 } } });
  try {
    const { client, user } = await readyUser(t, { sms: false });
    await checkoutAndPay(t, client);
    for (let i = 1; i <= 7; i++) {
      t.advance(1000);
      const r = await client.post('/api/push/subscribe', { endpoint: `https://fcm.googleapis.com/fcm/send/d${i}`, keys: pushKeys(i) });
      assert.equal(r.status, 200);
    }
    const live = t.db.all('SELECT endpoint FROM push_subscriptions WHERE user_id = ? AND revoked_at IS NULL ORDER BY id', user.id).map((r) => r.endpoint.split('/').pop());
    assert.deepEqual(live, ['d3', 'd4', 'd5', 'd6', 'd7']);
    // one device never answers (and ignores its abort signal); the others do
    t.ctx.push = { kind: 'stub', send: (s) => (s.endpoint.endsWith('/d3') ? new Promise(() => {}) : Promise.resolve({ ok: true, status: 201, gone: false, id: 'm' })) };
    const q = t.ctx.messaging.queue({ userId: user.id, channel: 'push', kind: 'TEST', to: null, body: JSON.stringify({ title: 't' }), idemKey: 'tarpit' });
    const t0 = Date.now();
    const [r] = await t.ctx.messaging.dispatch([q.id]);
    assert.ok(Date.now() - t0 < 1500, `bounded by the deadline (${Date.now() - t0} ms)`);
    assert.deepEqual([r.sent, r.devices], [true, 4]);
  } finally {
    await t.close();
  }
});

test('rows left "sending" by a stopped process: push and email queued again, a text marked failed (never sent twice)', async () => {
  const t = await makeApp({ webRoot: root });
  try {
    const { user } = await readyUser(t);
    const q = (channel, key) => t.ctx.messaging.queue({ userId: user.id, channel, kind: 'TEST', to: channel === 'email' ? 'ana@example.si' : '+38641234545', body: 'b', subject: 's', idemKey: key }).id;
    const ids = { sms: q('sms', 's1'), push: q('push', 'p1'), email: q('email', 'e1') };
    t.db.run("UPDATE notifications SET status = 'sending', updated_at = ? WHERE id IN (?, ?, ?)", t.ctx.now().toISOString(), ids.sms, ids.push, ids.email);
    assert.deepEqual(t.ctx.messaging.recoverStuck(), { requeued: 0, failed: 0 }, 'not yet: a send may still be in flight');
    t.advance(6 * 60_000);
    assert.deepEqual(t.ctx.messaging.recoverStuck(), { requeued: 2, failed: 1 });
    const st = (id) => t.db.get('SELECT status, error_code FROM notifications WHERE id = ?', id);
    assert.deepEqual([st(ids.sms), st(ids.push), st(ids.email)], [{ status: 'failed', error_code: 'interrupted' }, { status: 'queued', error_code: 'interrupted' }, { status: 'queued', error_code: 'interrupted' }]);
    assert.ok(t.db.get("SELECT 1 AS x FROM ops_alerts WHERE kind = 'send_interrupted'"));
  } finally {
    await t.close();
  }
  // on start-up every row still 'sending' is settled at once
  const { openDb } = await import('../../server/db.js');
  const db = openDb(':memory:');
  const now = '2026-09-28T10:00:00.000Z';
  db.run("INSERT INTO users (id, email, created_at, updated_at) VALUES ('usr_x', 'x@example.si', ?, ?)", now, now);
  db.run("INSERT INTO notifications (idem_key, user_id, channel, kind, body_sha256, status, queued_at, updated_at) VALUES ('k', 'usr_x', 'push', 'TEST', 'h', 'sending', ?, ?)", now, now);
  const u = await makeApp({ db, webRoot: root });
  try {
    assert.equal(u.db.get("SELECT status FROM notifications WHERE idem_key = 'k'").status, 'queued');
  } finally {
    await u.close();
  }
});
