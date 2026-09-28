import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { redactPicks } from '../../server/data.js';
import { injectLiveMode } from '../../server/static.js';
import { twilioSignature } from '../../server/vendors/twilio.js';
import { makeApp, signIn, passGeo, verifyPhone, grant, readyUser, checkoutAndPay, deliver, smsTo, BASE, TWILIO_TOKEN } from './helpers.js';

const PHONE = '+38641234545';
let root;

// A private web root so these tests do not depend on the files other builders are editing.
before(() => {
  root = mkdtempSync(join(tmpdir(), 'quorum-web-'));
  mkdirSync(join(root, 'data'));
  mkdirSync(join(root, 'js'));
  writeFileSync(join(root, 'index.html'), '<!doctype html>\n<html lang="en">\n  <head>\n    <meta charset="utf-8" />\n    <title>Quorum Research</title>\n  </head>\n  <body></body>\n</html>\n');
  writeFileSync(join(root, 'js', 'app.js'), 'export {};\n');
  const pick = (no, status, extra = {}) => ({
    no, kind: 'BUY', priorNo: null, renewedAs: null, status, ticker: `TK${no.slice(-2)}`, name: `Fictional ${no} Corp`, isin: 'ZZ0000000000', figi: 'SIMABCDEFGHI',
    sector: 'Industrials', venue: 'NASDAQ (simulated)', issueDate: '2026-09-28', issueNo: 250, producedAt: '2026-09-28T13:45:02+02:00', disseminatedAt: '2026-09-28T14:00:00+02:00',
    dissemination: { price: 123.45 }, entry: { date: '2026-09-28', open: 124.1 }, exitPlanned: '2026-10-27', agreement: 3, agreeing: ['A', 'B', 'D'], thesis: { en: 'x', sl: 'y' },
    sms: { en: 'QUORUM #0055 BUY TK55', sl: 'x' }, reveal: { ticker: `TK${no.slice(-2)}`, salt: 's' }, commit: 'c'.repeat(64), seq: 10, mark: { close: 1 }, path: [[0, 0, 0]], ...extra,
  });
  const picks = [
    pick('0050', 'renewed', { renewedAs: '0053' }),
    pick('0053', 'closed', { kind: 'RENEW', priorNo: '0050' }),
    pick('0054', 'renewed', { renewedAs: '0056' }),
    pick('0055', 'closed'),
    pick('0056', 'open', { kind: 'RENEW', priorNo: '0054' }),
    pick('0057', 'open'),
  ];
  writeFileSync(join(root, 'data', 'picks.json'), JSON.stringify(picks));
  writeFileSync(join(root, 'data', 'universe.json'), JSON.stringify({ simulated: true, date: '2026-09-28', cols: ['ticker', 'A'], rows: [['TKAA', 0.9]] }));
  writeFileSync(join(root, 'data', 'meta.json'), JSON.stringify({ simulated: true, asOf: '2026-09-28' }));
});
after(() => rmSync(root, { recursive: true, force: true }));

test('the whole join flow: magic link, geofence, phone, consents, checkout, webhooks, one opt-in text', async () => {
  const t = await makeApp({ webRoot: root });
  try {
    const c = t.client();
    const anon = await c.get('/api/me');
    assert.deepEqual(anon.body, { authenticated: false });
    const user = await signIn(t, c, 'Ana@Example.si', 'en');
    assert.equal(user.email, 'ana@example.si', 'emails are normalised');
    assert.ok(t.db.get('SELECT email_verified_at FROM users').email_verified_at);
    await passGeo(c, 'SI');
    await verifyPhone(t, c, PHONE);
    await grant(c, 'terms');
    await grant(c, 'immediate_performance');
    await grant(c, 'sms');
    assert.equal(smsTo(t, PHONE).length, 0, 'not entitled yet: no opt-in text');
    await checkoutAndPay(t, c);
    const me = (await c.get('/api/me')).body;
    assert.equal(me.activation, 'active');
    assert.equal(me.sms.on, true);
    assert.equal(me.pushPrompt, true);
    const texts = smsTo(t, PHONE);
    assert.equal(texts.length, 1);
    assert.match(texts[0].body, /^QUORUM: SMS alerts ON\. Max 16 msgs\/month/);
    assert.equal(texts[0].validityPeriod, 3600);
    assert.equal(texts[0].statusCallback, `${BASE}/api/webhooks/twilio/status`);
    const token = t.db.get('SELECT token FROM unsubscribe_tokens').token;
    assert.ok(texts[0].body.includes(`qrm.si/u/${token}`));
    const welcome = t.email.outbox.find((m) => m.tag === 'WELCOME');
    assert.match(welcome.text, /Up to 16 messages a month/);
    assert.match(welcome.text, /\+386 •• ••• 45/);
    const n = t.db.get("SELECT * FROM notifications WHERE kind = 'OPT_IN'");
    assert.equal(n.status, 'sent');
    assert.match(n.idem_key, /^OPT_IN:usr_\w+:\d+$/);
  } finally {
    await t.close();
  }
});

test('opt-in text exactly once, whatever the order: pay first, then phone and consent', async () => {
  const t = await makeApp({ webRoot: root });
  try {
    const c = t.client();
    await signIn(t, c, 'order@example.si');
    await passGeo(c, 'SI');
    await grant(c, 'terms');
    await grant(c, 'immediate_performance');
    const done = await checkoutAndPay(t, c);
    assert.equal(smsTo(t, PHONE).length, 0, 'entitled but no phone and no SMS consent');
    await verifyPhone(t, c, PHONE);
    assert.equal(smsTo(t, PHONE).length, 0, 'phone verified but no SMS consent');
    await grant(c, 'sms');
    assert.equal(smsTo(t, PHONE, 'OPT_IN').length, 1);
    // Everything that could re-trigger it: duplicate events, a renewal, re-verification, the same consent.
    const h = t.client();
    for (const e of done.events) await deliver(t, h, e);
    await Promise.all(t.fake.renew(done.subscription.id).events.map((e) => deliver(t, h, e)));
    await c.post('/api/phone/check', { e164: PHONE, code: '123456' });
    await grant(c, 'sms');
    await c.post('/api/prefs', { sms: true });
    assert.equal(smsTo(t, PHONE, 'OPT_IN').length, 1);
    assert.equal(t.db.get("SELECT COUNT(*) AS n FROM notifications WHERE kind = 'OPT_IN'").n, 1);
  } finally {
    await t.close();
  }
});

test('no opt-in text for a user outside the SMS countries (FR): entitled, email and push only', async () => {
  const t = await makeApp({ webRoot: root });
  try {
    const c = t.client({ country: 'FR' });
    await signIn(t, c, 'fr@example.fr');
    const g = await passGeo(c, 'FR');
    assert.equal(g.smsEligible, false);
    await grant(c, 'terms');
    await grant(c, 'immediate_performance');
    await checkoutAndPay(t, c, { cardCountry: 'FR' });
    const me = (await c.get('/api/me')).body;
    assert.equal(me.entitlements.picks.active, true);
    assert.equal(me.sms.on, false);
    const phone = await c.post('/api/phone/start', { e164: '+33612345678' });
    assert.equal(phone.status, 422);
    assert.equal(phone.body.reasons[0].code, 'sms_unavailable');
    assert.equal(t.sms.outbox.length, 0);
  } finally {
    await t.close();
  }
});

test('magic links work once, expire after 15 minutes; logout revokes the session', async () => {
  const t = await makeApp({ webRoot: root });
  try {
    const c = t.client();
    await c.post('/api/auth/magic', { email: 'once@example.si' });
    const link = new URL(t.email.outbox.at(-1).link);
    assert.equal(link.origin, BASE);
    const first = await c.get(link.pathname + link.search);
    assert.equal(first.status, 303);
    assert.equal(first.headers.get('location'), '/#join');
    assert.match(first.headers.get('set-cookie'), /qrm_session=v1\.[^;]+; Path=\/; SameSite=Lax; Max-Age=\d+; HttpOnly; Secure/);
    assert.equal((await c.get('/api/me')).body.authenticated, true);
    const other = t.client();
    const replay = await other.get(link.pathname + link.search);
    assert.equal(replay.headers.get('set-cookie'), null, 'a used link signs nobody in');
    await other.post('/api/auth/magic', { email: 'once@example.si' });
    const late = new URL(t.email.outbox.at(-1).link);
    t.advance(15 * 60_000 + 1000);
    await other.get(late.pathname + late.search);
    assert.equal((await other.get('/api/me')).body.authenticated, false, 'expired link');
    assert.equal(t.db.get('SELECT COUNT(*) AS n FROM magic_links WHERE token_sha256 LIKE ?', `${late.searchParams.get('token')}%`).n, 0, 'only hashes are stored');
    const jar = new Map(c.jar);
    await c.post('/api/auth/logout', {});
    assert.equal((await c.get('/api/me')).body.authenticated, false);
    const stolen = t.client();
    for (const [k, v] of jar) stolen.jar.set(k, v);
    assert.equal((await stolen.get('/api/me')).body.authenticated, false, 'the old cookie is revoked server-side');
  } finally {
    await t.close();
  }
});

test('/data redaction: sealed picks stay sealed without `picks`; universe needs `research_data`', async () => {
  const t = await makeApp({ webRoot: root });
  try {
    const anon = t.client();
    const r = await anon.get('/data/picks.json');
    assert.equal(r.status, 200);
    assert.match(r.headers.get('cache-control'), /private/);
    const byNo = Object.fromEntries(r.body.map((p) => [p.no, p]));
    assert.equal(byNo['0055'].ticker, 'TK55', 'closed picks are public');
    assert.equal(byNo['0050'].ticker, 'TK50', 'a renewed pick whose renewal closed is revealed');
    for (const no of ['0054', '0056', '0057']) {
      const p = byNo[no];
      assert.equal(p.sealed, true, no);
      for (const k of ['ticker', 'name', 'reveal', 'isin', 'figi', 'thesis', 'sms', 'agreeing', 'dissemination', 'mark', 'path']) assert.equal(p[k], null, `${no}.${k}`);
      assert.deepEqual(p.entry, { date: '2026-09-28' });
      assert.equal(p.commit, 'c'.repeat(64));
      assert.equal(p.agreement, 3);
    }
    assert.doesNotMatch(r.text, /TK57|TK56|TK54/);
    const u = await anon.get('/data/universe.json');
    assert.deepEqual(u.body.rows, []);
    assert.equal(u.body.redacted, true);
    assert.equal((await anon.get('/data/meta.json')).body.asOf, '2026-09-28');
    assert.equal((await anon.get('/data/secrets.json')).status, 404);
    assert.equal((await anon.get('/data/..%2fpackage.json')).status, 404);

    const { client } = await readyUser(t);
    await checkoutAndPay(t, client);
    const full = await client.get('/data/picks.json');
    assert.equal(full.body.find((p) => p.no === '0057').ticker, 'TK57');
    assert.deepEqual((await client.get('/data/universe.json')).body.rows, [], 'Signal has no research data');
    const r2 = await readyUser(t, { email: 'res@example.si', e164: '+38641234546' });
    await checkoutAndPay(t, r2.client, { tier: 'research' });
    assert.equal((await r2.client.get('/data/universe.json')).body.rows.length, 1);
  } finally {
    await t.close();
  }
});

test('redactPicks is a whitelist: unknown future fields are nulled too', () => {
  const [p] = redactPicks([{ no: '0001', status: 'open', ticker: 'ABCD', newField: 'secret', commit: 'x' }]);
  assert.deepEqual(p, { no: '0001', status: 'open', ticker: null, newField: null, commit: 'x', entry: null, sealed: true });
});

test('static: live-mode meta injected into index.html; no web/data or dotfiles through the static path', async () => {
  const t = await makeApp({ webRoot: root });
  try {
    const c = t.client();
    const page = await c.get('/');
    assert.equal(page.status, 200);
    assert.match(page.text, /<head>\n\s+<meta name="quorum-mode" content="live" \/>/);
    assert.equal((page.text.match(/quorum-mode/g) || []).length, 1);
    assert.match(page.headers.get('content-type'), /text\/html/);
    const js = await c.get('/js/app.js');
    assert.match(js.headers.get('content-type'), /javascript/);
    assert.equal((await c.get('/js/../../../etc/passwd')).status, 404);
    assert.equal((await c.get('/%2e%2e/%2e%2e/etc/passwd')).status, 404);
    const p = await c.get('/p/0417');
    assert.equal(p.status, 302);
    assert.equal(p.headers.get('location'), '/#p-0417');
    assert.equal((await c.get('/help')).headers.get('location'), '/#help');
    assert.equal((await c.get('/account')).headers.get('location'), '/#account');
    assert.equal(injectLiveMode('<head><meta name="quorum-mode" content="demo"></head>'), '<head><meta name="quorum-mode" content="live" /></head>');
  } finally {
    await t.close();
  }
});

test('static: the real web/index.html is served in live mode', async () => {
  const t = await makeApp();
  try {
    const page = await t.client().get('/');
    assert.equal(page.status, 200);
    assert.match(page.text, /<meta name="quorum-mode" content="live" \/>/);
  } finally {
    await t.close();
  }
});

test('export returns every row about the user; delete anonymises and keeps the compliance rows', async () => {
  const t = await makeApp({ webRoot: root });
  try {
    const { client, user } = await readyUser(t);
    await checkoutAndPay(t, client);
    const ex = await client.get('/api/export');
    assert.equal(ex.status, 200);
    assert.match(ex.headers.get('content-disposition'), /attachment; filename="quorum-export-usr_/);
    const d = ex.body;
    assert.equal(d.user.email, 'ana@example.si');
    assert.equal(d.consentEvents.length, 3);
    assert.equal(d.phoneNumbers[0].e164, PHONE);
    assert.equal(d.subscriptions.length, 1);
    assert.ok(d.notifications.some((n) => n.kind === 'OPT_IN'));
    assert.ok(d.billingEvents.length >= 3);
    assert.ok(d.sessions.length >= 1);
    assert.equal(d.signInLinks[0].token_sha256, undefined, 'no credential hashes in the export');

    assert.equal((await client.post('/api/account/delete', {})).status, 400, 'needs confirm: true');
    const del = await client.post('/api/account/delete', { confirm: true });
    assert.equal(del.status, 200);
    assert.equal(del.body.deleted, true);
    assert.equal((await client.get('/api/me')).body.authenticated, false);
    const u = t.db.get('SELECT * FROM users WHERE id = ?', user.id);
    assert.deepEqual([u.email, u.status, u.declared_country, u.jurisdiction], [null, 'deleted', null, null]);
    for (const table of ['phone_numbers', 'channel_prefs', 'unsubscribe_tokens', 'magic_links', 'push_subscriptions']) {
      assert.equal(t.db.get(`SELECT COUNT(*) AS n FROM ${table} WHERE user_id = ?`, user.id).n, 0, table);
    }
    assert.equal(t.db.get('SELECT COUNT(*) AS n FROM notifications WHERE to_addr IS NOT NULL OR body IS NOT NULL').n, 0);
    // Kept: consent history (plus the deletion revoke), opt-outs, billing events, the cancelled subscription.
    assert.equal(t.db.get('SELECT COUNT(*) AS n FROM consent_events WHERE user_id = ?', user.id).n, 4);
    assert.equal(t.db.get('SELECT source FROM opt_outs WHERE user_id = ?', user.id).source, 'deletion');
    assert.ok(t.db.get('SELECT COUNT(*) AS n FROM processed_events').n >= 3);
    assert.equal(t.db.get('SELECT status FROM subscriptions').status, 'canceled');
    assert.ok(t.fake.requests.some((r) => r.method === 'DELETE'));
    assert.equal(t.db.get("SELECT active_until <= ? AS ended FROM entitlements WHERE feature = 'picks'", t.ctx.now().toISOString()).ended, 1);
    assert.equal(smsTo(t, PHONE, 'OPT_OUT').length, 0, 'no confirmation text on deletion');
    // The same email can start over as a new account.
    await t.client().post('/api/auth/magic', { email: 'ana@example.si' });
    assert.equal(t.db.get("SELECT COUNT(*) AS n FROM users WHERE email = 'ana@example.si'").n, 1);
  } finally {
    await t.close();
  }
});

test('Twilio status callback stub: signature checked, raw event stored with the number hashed', async () => {
  const t = await makeApp({ webRoot: root });
  try {
    const params = { MessageSid: 'SM123', MessageStatus: 'delivered', To: PHONE, From: 'QUORUM', AccountSid: 'AC1' };
    const url = `${BASE}/api/webhooks/twilio/status`;
    const c = t.client();
    const bad = await c.request('POST', '/api/webhooks/twilio/status', { form: params, headers: { 'x-twilio-signature': 'nope' } });
    assert.equal(bad.status, 403);
    const tampered = await c.request('POST', '/api/webhooks/twilio/status', { form: { ...params, MessageStatus: 'failed' }, headers: { 'x-twilio-signature': twilioSignature(TWILIO_TOKEN, url, params) } });
    assert.equal(tampered.status, 403);
    const seen = [];
    t.ctx.hooks.onTwilioStatus = async (e) => seen.push(e);
    const ok = await c.request('POST', '/api/webhooks/twilio/status', { form: params, headers: { 'x-twilio-signature': twilioSignature(TWILIO_TOKEN, url, params) } });
    assert.equal(ok.status, 204);
    const row = t.db.get('SELECT * FROM delivery_events');
    assert.equal(row.provider_sid, 'SM123');
    assert.equal(row.status, 'delivered');
    assert.doesNotMatch(row.payload, /38641234545/);
    assert.match(row.payload, /sha256:[0-9a-f]{64}/);
    assert.equal(seen[0].sid, 'SM123');
    const json = await c.post('/api/webhooks/twilio/status', params);
    assert.equal(json.status, 415);
  } finally {
    await t.close();
  }
});

test('health reports the transports', async () => {
  const t = await makeApp({ webRoot: root });
  try {
    const h = await t.client().get('/api/health');
    assert.deepEqual([h.body.ok, h.body.db, h.body.smsTransport, h.body.emailTransport, h.body.smsPaused], [true, 'ok', 'console', 'console', false]);
  } finally {
    await t.close();
  }
});
