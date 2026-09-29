import { test } from 'node:test';
import assert from 'node:assert/strict';
import { twilioSignature } from '../../server/vendors/twilio.js';
import { nextStatus } from '../../server/receipts.js';
import { pipelineApp, sealDay, subscriber } from './pipeline.js';
import { BASE, TWILIO_TOKEN, smsTo } from './helpers.js';

const URL_ = `${BASE}/api/webhooks/twilio/status`;

async function callback(t, m, status, errorCode = null, { sign = true } = {}) {
  const params = { MessageSid: m.sid, MessageStatus: status, To: m.to, From: 'QUORUM', AccountSid: 'ACtest', ApiVersion: '2010-04-01' };
  if (errorCode) params.ErrorCode = errorCode;
  const r = await t.client().request('POST', '/api/webhooks/twilio/status', { form: params, headers: { 'x-twilio-signature': sign ? twilioSignature(TWILIO_TOKEN, URL_, params) : 'bad' } });
  return r.status;
}

async function dayWithTexts(t, people) {
  t.local('19:00', '2025-11-03');
  const users = [];
  for (const p of people) users.push(await subscriber(t, p));
  await sealDay(t);
  t.local('14:00');
  await t.pub.publish(t.input.date);
  await t.ctx.notifier.deliverIssue(t.input.date);
  return users;
}

test('status only moves forward: queued -> sending -> sent -> delivered; failed and undelivered are final', () => {
  assert.equal(nextStatus('sent', 'delivered'), 'delivered');
  assert.equal(nextStatus('sent', 'sending'), null);
  assert.equal(nextStatus('sent', 'queued'), null);
  assert.equal(nextStatus('delivered', 'sent'), null);
  assert.equal(nextStatus('delivered', 'failed'), null);
  assert.equal(nextStatus('undelivered', 'delivered'), null);
  assert.equal(nextStatus('failed', 'delivered'), null);
  assert.equal(nextStatus('sending', 'sent'), 'sent');
  assert.equal(nextStatus('sent', 'undelivered'), 'undelivered');
  assert.equal(nextStatus('sent', 'nonsense'), null);
});

test('receipts over HTTP: signature checked, forward-only, raw events kept with the number hashed', async () => {
  const t = await pipelineApp();
  try {
    await dayWithTexts(t, [{ email: 'a@example.si', e164: '+38641000001' }]);
    const m = smsTo(t, '+38641000001').find((x) => x.body.startsWith('QUORUM #0011'));
    assert.equal(await callback(t, m, 'delivered', null, { sign: false }), 403);
    assert.equal(await callback(t, m, 'sent'), 204);
    assert.equal(await callback(t, m, 'delivered'), 204);
    assert.equal(await callback(t, m, 'sent'), 204);
    assert.equal(await callback(t, m, 'undelivered', '30003'), 204);
    const row = t.db.get('SELECT status, delivered_at, error_code FROM notifications WHERE provider_sid = ?', m.sid);
    assert.equal(row.status, 'delivered');
    assert.ok(row.delivered_at);
    assert.equal(row.error_code, null, 'a late error on a final status changes nothing');
    const ev = t.db.all('SELECT payload FROM delivery_events WHERE provider_sid = ?', m.sid);
    assert.equal(ev.length, 4);
    for (const e of ev) {
      assert.ok(!e.payload.includes('+38641000001'));
      assert.match(JSON.parse(e.payload).To, /^sha256:[0-9a-f]{64}$/);
    }
  } finally {
    await t.close();
  }
});

test('21610: the user is opted out of all SMS (source twilio), queued texts are cancelled, no confirmation text', async () => {
  const t = await pipelineApp();
  try {
    const [a] = await dayWithTexts(t, [{ email: 'a@example.si', e164: '+38641000001' }]);
    const texts = smsTo(t, '+38641000001').filter((x) => x.body.startsWith('QUORUM #'));
    assert.equal(await callback(t, texts[0], 'failed', '21610'), 204);
    assert.deepEqual(t.db.get('SELECT channel, source FROM opt_outs WHERE user_id = ?', a.user.id), { channel: 'sms', source: 'twilio' });
    assert.equal(t.db.get("SELECT action, channel FROM consent_events WHERE user_id = ? AND kind = 'sms' ORDER BY id DESC LIMIT 1", a.user.id).action, 'revoke');
    assert.equal(smsTo(t, '+38641000001', 'OPT_OUT').length, 0);
    const q = t.ctx.messaging.queue({ userId: a.user.id, channel: 'sms', kind: 'BUY', to: '+38641000001', body: texts[0].body, idemKey: 'later' });
    await t.ctx.messaging.dispatch([q.id]);
    assert.equal(t.db.get('SELECT status FROM notifications WHERE id = ?', q.id).status, 'cancelled');
    assert.equal(await callback(t, texts[1], 'failed', '21610'), 204, 'a second 21610 is harmless');
    assert.equal(t.db.get('SELECT COUNT(*) AS n FROM opt_outs WHERE user_id = ?', a.user.id).n, 1);
  } finally {
    await t.close();
  }
});

test('repeated 30003/30005/30006 marks the number invalid and emails the user; one failure does not', async () => {
  const t = await pipelineApp();
  try {
    const [a, b] = await dayWithTexts(t, [{ email: 'a@example.si', e164: '+38641000001' }, { email: 'b@example.si', e164: '+38641000002' }]);
    const ta = smsTo(t, '+38641000001').filter((x) => x.body.startsWith('QUORUM #'));
    const tb = smsTo(t, '+38641000002').filter((x) => x.body.startsWith('QUORUM #'));
    // a: one unreachable, then delivered -> still valid
    await callback(t, ta[0], 'undelivered', '30003');
    await callback(t, ta[1], 'delivered');
    assert.equal(t.db.get('SELECT invalid_at FROM phone_numbers WHERE user_id = ?', a.user.id).invalid_at, null);
    // b: the two most recent texts both fail with invalid-number codes -> invalid, emailed once
    await callback(t, tb[0], 'undelivered', '30005');
    await callback(t, tb[1], 'undelivered', '30006');
    await callback(t, tb[2], 'undelivered', '30003');
    await callback(t, tb[3], 'undelivered', '30003');
    assert.ok(t.db.get('SELECT invalid_at FROM phone_numbers WHERE user_id = ?', b.user.id).invalid_at);
    const mails = t.email.outbox.filter((m) => m.to === 'b@example.si' && m.tag === 'NUMBER_INVALID');
    assert.equal(mails.length, 1);
    assert.match(mails[0].text, /ending 02/);
    assert.equal(t.ctx.messaging.smsState(b.user.id).reason, 'phone_invalid');
  } finally {
    await t.close();
  }
});

test('30007 above 2% of the texts sent in 10 minutes pauses SMS and pages on-call; push and email continue', async () => {
  const t = await pipelineApp();
  try {
    // 60 texts go out (15 subscribers x 4 items); one 30007 is 1.7%: no pause
    const people = Array.from({ length: 15 }, (_, i) => ({ email: `s${i}@example.si`, e164: `+3864120${1001 + i}` }));
    await dayWithTexts(t, people);
    const texts = t.sms.outbox.filter((m) => m.body.startsWith('QUORUM #'));
    assert.equal(texts.length, 60);
    await callback(t, texts[0], 'undelivered', '30007');
    assert.equal(t.db.getSetting('sms_paused'), null);
    // a second one is 3.3%: pause and page
    await callback(t, texts[1], 'undelivered', '30007');
    assert.equal(t.db.getSetting('sms_paused'), '1');
    assert.match(t.db.getSetting('sms_paused_reason'), /30007 spike: 2 of 60/);
    assert.equal(t.pager.pages.filter((p) => p.kind === 'sms_30007_spike').length, 1);
    await callback(t, texts[2], 'undelivered', '30007');
    assert.equal(t.pager.pages.filter((p) => p.kind === 'sms_30007_spike').length, 1, 'paged once');
    assert.equal((await t.client().get('/api/health')).body.smsPaused, true);
    // texts wait; email still goes out
    const u = t.db.get("SELECT id FROM users WHERE email = 's0@example.si'").id;
    const sms = t.ctx.messaging.queue({ userId: u, channel: 'sms', kind: 'OPT_OUT', to: '+38641201001', body: 'QUORUM: SMS alerts OFF. No more texts. Your subscription is unchanged: qrm.si/account', idemKey: 'held' });
    const mail = t.ctx.messaging.queue({ userId: u, channel: 'email', kind: 'TEST', to: 's0@example.si', subject: 's', body: 'b', idemKey: 'mail' });
    const r = await t.ctx.messaging.dispatch([sms.id, mail.id]);
    assert.deepEqual([r[0].skipped, r[1].sent], ['sms_paused', true]);
    // the spike window is 10 minutes: old errors do not count
    t.ctx.receipts.resumeSms({ by: 'test' });
    t.advance(11 * 60_000);
    assert.equal(t.ctx.receipts.checkSpike().paused, false);
  } finally {
    await t.close();
  }
});
