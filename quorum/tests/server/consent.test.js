import { test } from 'node:test';
import assert from 'node:assert/strict';
import { consentHash, consentVersion } from '../../core/consent-texts.js';
import { makeApp, signIn, passGeo, verifyPhone, consentBody, BASE } from './helpers.js';

async function signedIn(t, email = 'consent@example.si') {
  const c = t.client();
  await signIn(t, c, email);
  await passGeo(c, 'SI');
  return c;
}

test('a matching grant is stored append-only with hash, version, IP, user agent, page URL, locale and channel', async () => {
  const t = await makeApp();
  try {
    const c = await signedIn(t);
    const body = await consentBody('terms', 'sl');
    const r = await c.post('/api/consent', body, { headers: { 'user-agent': 'QuorumTest/1.0', 'x-forwarded-for': '198.51.100.7' } });
    assert.equal(r.status, 200);
    assert.equal(r.body.consent.sha256, await consentHash('terms', 'sl'));
    const row = t.db.get('SELECT * FROM consent_events');
    assert.equal(row.kind, 'terms');
    assert.equal(row.action, 'grant');
    assert.equal(row.text_version, consentVersion('terms'));
    assert.equal(row.text_sha256, await consentHash('terms', 'sl'));
    assert.equal(row.user_agent, 'QuorumTest/1.0');
    assert.equal(row.ip, '127.0.0.1', 'X-Forwarded-For is ignored without TRUST_PROXY');
    assert.equal(row.page_url, `${BASE}/#join`);
    assert.equal(row.locale, 'sl');
    assert.equal(row.channel, 'web');
    assert.ok(row.created_at);
    assert.throws(() => t.db.run('UPDATE consent_events SET text_sha256 = ?', 'x'), /append-only/);
  } finally {
    await t.close();
  }
});

test('the server recomputes the hash: a mismatch is refused with 409 and nothing is stored', async () => {
  const t = await makeApp();
  try {
    const c = await signedIn(t);
    const good = await consentBody('terms', 'en');
    const tampered = await c.post('/api/consent', { ...good, sha256: 'f'.repeat(64) });
    assert.equal(tampered.status, 409);
    assert.equal(tampered.body.error, 'consent_text_mismatch');
    assert.equal(tampered.body.current.sha256, await consentHash('terms', 'en'));
    const oldVersion = await c.post('/api/consent', { ...good, version: 'v0' });
    assert.equal(oldVersion.status, 409);
    const otherLocale = await c.post('/api/consent', { ...good, locale: 'sl' }); // English hash, Slovene locale
    assert.equal(otherLocale.status, 409);
    assert.equal(t.db.get('SELECT COUNT(*) AS n FROM consent_events').n, 0);
  } finally {
    await t.close();
  }
});

test('validation: unknown kind, bad action, bad locale, bad hash format, wrong content type, no session', async () => {
  const t = await makeApp();
  try {
    const c = await signedIn(t);
    const good = await consentBody('terms', 'en');
    assert.equal((await c.post('/api/consent', { ...good, kind: 'marketing' })).body.error, 'invalid_kind');
    assert.equal((await c.post('/api/consent', { ...good, action: 'maybe' })).body.error, 'invalid_action');
    assert.equal((await c.post('/api/consent', { ...good, locale: 'de' })).body.error, 'invalid_locale');
    assert.equal((await c.post('/api/consent', { ...good, sha256: 'xyz' })).body.error, 'invalid_sha256');
    const form = await c.request('POST', '/api/consent', { form: { kind: 'terms' } });
    assert.equal(form.status, 415);
    const anon = t.client();
    assert.equal((await anon.post('/api/consent', good)).status, 401);
  } finally {
    await t.close();
  }
});

test('SMS consent needs a verified phone; a repeated identical grant is not re-recorded', async () => {
  const t = await makeApp();
  try {
    const c = await signedIn(t);
    const sms = await consentBody('sms', 'en');
    const early = await c.post('/api/consent', sms);
    assert.equal(early.status, 409);
    assert.equal(early.body.error, 'phone_not_verified');
    await verifyPhone(t, c, '+38641234545');
    const first = await c.post('/api/consent', sms);
    assert.equal(first.status, 200);
    assert.equal(first.body.duplicate, false);
    const again = await c.post('/api/consent', sms);
    assert.equal(again.body.duplicate, true);
    assert.equal(t.db.get("SELECT COUNT(*) AS n FROM consent_events WHERE kind = 'sms'").n, 1);
    assert.equal(t.db.get('SELECT sms FROM channel_prefs').sms, 1);
  } finally {
    await t.close();
  }
});

test('revoking SMS consent through /api/consent is an opt-out (revoke row plus opt_outs row)', async () => {
  const t = await makeApp();
  try {
    const c = await signedIn(t);
    await verifyPhone(t, c, '+38641234545');
    await c.post('/api/consent', await consentBody('sms', 'en'));
    const r = await c.post('/api/consent', { kind: 'sms', action: 'revoke', locale: 'en', pageUrl: `${BASE}/#account` });
    assert.equal(r.status, 200);
    const rows = t.db.all("SELECT action, text_version, channel FROM consent_events WHERE kind = 'sms' ORDER BY id");
    assert.deepEqual(rows.map((x) => x.action), ['grant', 'revoke']);
    assert.equal(rows[1].text_version, 'v3', 'the revoke names the version it withdraws');
    assert.equal(t.db.get('SELECT source FROM opt_outs').source, 'account');
    assert.equal(t.db.get('SELECT sms FROM channel_prefs').sms, 0);
  } finally {
    await t.close();
  }
});

test('changing to a new number withdraws the SMS consent (it named the old number); re-consent earns one new opt-in', async () => {
  const { readyUser, checkoutAndPay, smsTo, grant: grantKind } = await import('./helpers.js');
  const t = await makeApp();
  try {
    const { client } = await readyUser(t);
    await checkoutAndPay(t, client);
    assert.equal(smsTo(t, '+38641234545', 'OPT_IN').length, 1);
    const s = await client.post('/api/phone/start', { e164: '+38641234599' });
    assert.equal(s.status, 200);
    assert.equal(s.body.smsConsentReset, true);
    assert.equal(t.db.get("SELECT action FROM consent_events WHERE kind = 'sms' ORDER BY id DESC LIMIT 1").action, 'revoke');
    await client.post('/api/phone/check', { e164: '+38641234599', code: t.sms.lastCode('+38641234599') });
    assert.equal(smsTo(t, '+38641234599').length, 0, 'no text to the new number before a new consent');
    await grantKind(client, 'sms');
    assert.equal(smsTo(t, '+38641234599', 'OPT_IN').length, 1);
    const me = await client.get('/api/me');
    assert.equal(me.body.phone.masked, '+386 •• ••• 99');
    assert.equal(me.body.sms.on, true);
  } finally {
    await t.close();
  }
});
