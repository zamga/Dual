import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderSms, validateSms } from '../../core/sms-templates.js';
import { ensureUnsubscribeToken, TOKEN_RE, TOKEN_LENGTH } from '../../server/tokens.js';
import { openDb } from '../../server/db.js';
import { makeApp, readyUser, checkoutAndPay, smsTo, grant } from './helpers.js';

const PHONE = '+38641234545';

async function subscribed(t, opts) {
  const u = await readyUser(t, opts);
  await checkoutAndPay(t, u.client);
  const token = t.db.get('SELECT token FROM unsubscribe_tokens WHERE user_id = ?', u.user.id).token;
  return { ...u, token };
}

const counts = (t) => ({
  optOuts: t.db.get('SELECT COUNT(*) AS n FROM opt_outs').n,
  revokes: t.db.get("SELECT COUNT(*) AS n FROM consent_events WHERE kind = 'sms' AND action = 'revoke'").n,
});

test('tokens: new ones are 8 base62 characters (earlier 6-character ones stay valid), one per user, unique', () => {
  const db = openDb(':memory:');
  const now = new Date('2026-09-28T10:00:00Z').toISOString();
  for (const id of ['usr_a', 'usr_b', 'usr_c']) db.run('INSERT INTO users (id, email, created_at, updated_at) VALUES (?, ?, ?, ?)', id, `${id}@x.si`, now, now);
  const a = ensureUnsubscribeToken(db, 'usr_a');
  assert.equal(TOKEN_LENGTH, 8);
  assert.match(a, /^[0-9A-Za-z]{8}$/);
  assert.ok(TOKEN_RE.test(a));
  assert.ok(TOKEN_RE.test('Zz9Zz9'), 'a 6-character token already sent in a text still works');
  // The longest template still fits one GSM-7 segment with an 8-character token.
  for (const kind of ['BUY', 'RENEW', 'CLOSE', 'OPT_IN']) {
    for (const locale of ['en', 'sl']) {
      const text = renderSms(kind, locale, { no: '99999', ticker: 'WWWWW', issueDate: '2026-10-23', entryDate: '2026-10-23', exitDate: '2026-11-23', agreement: 4, token: 'Z'.repeat(TOKEN_LENGTH) });
      assert.ok(validateSms(text).ok, `${kind} ${locale}: ${text.length}`);
    }
  }
  assert.equal(ensureUnsubscribeToken(db, 'usr_a'), a, 'stable per user');
  // A generator that collides first must still give usr_b a different token.
  const seq = [a, a, 'Zz9Zz9'];
  const b = ensureUnsubscribeToken(db, 'usr_b', new Date(), () => seq.shift());
  assert.equal(b, 'Zz9Zz9');
  assert.throws(() => db.run("INSERT INTO unsubscribe_tokens (token, user_id, created_at) VALUES ('abc12', 'usr_c', ?)", now), /CHECK/);
  db.close();
});

test('GET /u/:token shows a confirmation page and changes nothing', async () => {
  const t = await makeApp();
  try {
    const { token } = await subscribed(t);
    const before = counts(t);
    const anon = t.client();
    for (let i = 0; i < 3; i++) {
      const r = await anon.get(`/u/${token}`);
      assert.equal(r.status, 200);
      assert.match(r.headers.get('content-type'), /text\/html/);
      assert.equal(r.headers.get('referrer-policy'), 'no-referrer');
      assert.match(r.text, /<form method="post" action="\/u\//);
      assert.match(r.text, /Stop text alerts/);
      assert.doesNotMatch(r.text, /<script/);
    }
    assert.deepEqual(counts(t), before);
    assert.equal(t.db.get('SELECT sms FROM channel_prefs').sms, 1);
    assert.equal(t.db.get('SELECT used_at FROM unsubscribe_tokens').used_at, null);
    assert.equal(smsTo(t, PHONE, 'OPT_OUT').length, 0);
    // No validity oracle: an unknown or malformed token gets the very same page.
    const page = (await anon.get(`/u/${token}`)).text;
    for (const other of ['NoSuch12', 'abc']) {
      const r = await anon.get(`/u/${other}`);
      assert.equal(r.status, 200);
      assert.equal(r.text, page.replaceAll(token, other));
    }
  } finally {
    await t.close();
  }
});

test('POST /u/:token: one tap opts out of all SMS and sends exactly one confirmation', async () => {
  const t = await makeApp();
  try {
    const { token, user } = await subscribed(t);
    const anon = t.client({ country: null });
    const r = await anon.request('POST', `/u/${token}`, { form: {} });
    assert.equal(r.status, 200);
    assert.match(r.text, /Text alerts are off/);
    // Repeated taps, a JSON call from the web page, and an empty POST change nothing more.
    await anon.request('POST', `/u/${token}`, { form: {} });
    const j = await anon.request('POST', `/u/${token}`, { json: {} });
    assert.equal(j.body.smsOff, true);
    assert.equal(j.body.changed, false);
    await anon.request('POST', `/u/${token}`);
    assert.deepEqual(counts(t), { optOuts: 1, revokes: 1 });
    assert.equal(t.db.get('SELECT source FROM opt_outs').source, 'link');
    assert.equal(t.db.get("SELECT channel FROM consent_events WHERE action = 'revoke'").channel, 'sms_link');
    assert.equal(t.db.get('SELECT sms FROM channel_prefs').sms, 0);
    assert.ok(t.db.get('SELECT used_at FROM unsubscribe_tokens').used_at);
    const conf = smsTo(t, PHONE, 'OPT_OUT');
    assert.equal(conf.length, 1);
    assert.equal(conf[0].body, renderSms('OPT_OUT', 'en', {}));
    assert.ok(validateSms(conf[0].body).ok);
    assert.equal(t.db.get("SELECT COUNT(*) AS n FROM notifications WHERE kind = 'OPT_OUT'").n, 1);
    // The subscription is unchanged.
    const me = await (await readyClient(t, user)).get('/api/me');
    assert.equal(me.body.entitlements.picks.active, true);
    assert.equal(me.body.sms.on, false);
    // Tapping again says there is nothing more to do, exactly as an unknown link does (no oracle).
    const again = await anon.request('POST', `/u/${token}`, { form: {} });
    assert.match(again.text, /Nothing more to do/);
    const unknown = await anon.request('POST', '/u/NoSuch12', { form: {} });
    assert.equal(unknown.status, 200);
    assert.equal(unknown.text, again.text);
    assert.deepEqual((await anon.request('POST', '/u/NoSuch12', { json: {} })).body, j.body);
  } finally {
    await t.close();
  }
});

// The session of the user created by readyUser lives on its own client; reuse it via a new sign-in.
async function readyClient(t, user) {
  const { signIn } = await import('./helpers.js');
  const c = t.client();
  await signIn(t, c, user.email);
  return c;
}

test('an opt-out applies at once to texts already queued (quiet-hours hold) and to later sends', async () => {
  // 22:30 in Ljubljana: the opt-in text is held until 08:00.
  const t = await makeApp({ now: '2026-09-28T20:30:00Z' });
  try {
    const { token } = await subscribed(t);
    const held = t.db.get("SELECT status, not_before FROM notifications WHERE kind = 'OPT_IN'");
    assert.equal(held.status, 'queued');
    assert.equal(held.not_before, '2026-09-29T06:00:00.000Z', '08:00 CEST next morning');
    assert.equal(smsTo(t, PHONE).length, 0, 'nothing sent in quiet hours');
    await t.client().request('POST', `/u/${token}`, { form: {} });
    t.setNow('2026-09-29T06:00:00Z');
    const results = await t.ctx.messaging.dispatchDue();
    assert.equal(results[0].cancelled, 'no_consent');
    assert.equal(t.db.get("SELECT status FROM notifications WHERE kind = 'OPT_IN'").status, 'cancelled');
    assert.equal(smsTo(t, PHONE).length, 0, 'never texted: no opt-in, and no opt-out confirmation either');
  } finally {
    await t.close();
  }
});

test('quiet hours: a held opt-in text goes out at 08:00 local', async () => {
  const t = await makeApp({ now: '2026-09-28T19:30:00Z' }); // 21:30 CEST
  try {
    await subscribed(t);
    assert.equal(smsTo(t, PHONE).length, 0);
    t.setNow('2026-09-29T05:59:00Z');
    assert.equal((await t.ctx.messaging.dispatchDue()).length, 0);
    t.setNow('2026-09-29T06:00:00Z');
    await t.ctx.messaging.dispatchDue();
    assert.equal(smsTo(t, PHONE, 'OPT_IN').length, 1);
  } finally {
    await t.close();
  }
});

test('account toggle: prefs sms=false is the same one opt-out; switching back on needs a new consent', async () => {
  const t = await makeApp();
  try {
    const { client } = await subscribed(t);
    const off = await client.post('/api/prefs', { sms: false });
    assert.equal(off.status, 200);
    assert.equal(off.body.prefs.sms, false);
    assert.equal(t.db.get('SELECT source FROM opt_outs').source, 'account');
    assert.equal(smsTo(t, PHONE, 'OPT_OUT').length, 1);
    const on = await client.post('/api/prefs', { sms: true });
    assert.equal(on.status, 409);
    assert.equal(on.body.error, 'consent_required');
    // A fresh consent grant turns texts back on and earns one new opt-in text (once per grant).
    await grant(client, 'sms');
    assert.equal(smsTo(t, PHONE, 'OPT_IN').length, 2);
    await grant(client, 'sms');
    assert.equal(smsTo(t, PHONE, 'OPT_IN').length, 2);
    const email = await client.post('/api/prefs', { email: false, push: true });
    assert.equal(email.body.prefs.email, false);
    assert.equal(t.db.get("SELECT COUNT(*) AS n FROM opt_outs WHERE channel = 'email'").n, 1);
    assert.equal((await client.post('/api/prefs', { sms: 'yes' })).status, 400);
  } finally {
    await t.close();
  }
});

test('the opt-out confirmation respects Slovene locale and is a valid one-segment GSM-7 text', async () => {
  const t = await makeApp();
  try {
    const { token } = await subscribed(t, { locale: 'sl', email: 'sl@example.si' });
    const optIn = smsTo(t, PHONE, 'OPT_IN')[0].body;
    assert.match(optIn, /^QUORUM: SMS obvestila VKLOPLJENA/);
    assert.ok(optIn.endsWith(`Odjava: qrm.si/u/${token}`));
    assert.ok(validateSms(optIn).ok);
    const page = await t.client().get(`/u/${token}`);
    assert.match(page.text, /lang="sl"/);
    await t.client().request('POST', `/u/${token}`, { form: {} });
    const off = smsTo(t, PHONE, 'OPT_OUT');
    assert.equal(off.length, 1);
    assert.equal(off[0].body, renderSms('OPT_OUT', 'sl', {}));
  } finally {
    await t.close();
  }
});
