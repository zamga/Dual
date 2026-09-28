import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TwilioError } from '../../server/vendors/twilio.js';
import { quietHoursNextAllowed } from '../../server/util.js';
import { makeApp, readyUser, checkoutAndPay, smsTo } from './helpers.js';

const PHONE = '+38641234545';

test('quiet hours: 08:00-21:00 recipient-local, across the DST change', () => {
  const tz = 'Europe/Ljubljana';
  assert.equal(quietHoursNextAllowed(new Date('2026-09-28T12:00:00Z'), tz), null, '14:00 CEST');
  assert.equal(quietHoursNextAllowed(new Date('2026-09-28T19:00:00Z'), tz).toISOString(), '2026-09-29T06:00:00.000Z', '21:00 CEST is quiet');
  assert.equal(quietHoursNextAllowed(new Date('2026-09-28T05:59:00Z'), tz).toISOString(), '2026-09-28T06:00:00.000Z', '07:59 CEST');
  assert.equal(quietHoursNextAllowed(new Date('2026-10-24T21:00:00Z'), tz).toISOString(), '2026-10-25T07:00:00.000Z', 'CET after the change');
  assert.equal(quietHoursNextAllowed(new Date('2026-10-27T13:00:00Z'), tz), null, '14:00 CET');
});

test('outbox: the row exists before the provider call; transient errors retry, 4xx fails, 429 retries', async () => {
  const t = await makeApp();
  try {
    const { user } = await readyUser(t, { sms: false });
    const real = t.ctx.sms.sendMessage;
    const seen = [];
    let mode = 'network';
    t.ctx.sms.sendMessage = async (m) => {
      seen.push(t.db.get('SELECT status FROM notifications WHERE to_addr = ? ORDER BY id DESC LIMIT 1', m.to).status);
      if (mode === 'network') throw new Error('ECONNRESET');
      if (mode === '429') throw new TwilioError(429, { code: 20429, message: 'Too Many Requests' });
      if (mode === '400') throw new TwilioError(400, { code: 21211, message: "Invalid 'To' Phone Number" });
      return real(m);
    };
    const q = (key) => t.ctx.messaging.queue({ userId: user.id, channel: 'sms', kind: 'OPT_OUT', to: PHONE, body: 'QUORUM: SMS alerts OFF. No more texts. Your subscription is unchanged: qrm.si/account', idemKey: key, country: 'SI' });
    const a = q('test:a');
    assert.equal(q('test:a').created, false, 'idempotency key');
    await t.ctx.messaging.dispatch([a.id]);
    assert.deepEqual(seen, ['sending'], 'persisted and claimed before the call');
    let row = t.db.get('SELECT * FROM notifications WHERE id = ?', a.id);
    assert.equal(row.status, 'queued');
    assert.ok(new Date(row.not_before) > t.ctx.now(), 'backoff');
    t.advance(120_000);
    mode = '429';
    await t.ctx.messaging.dispatchDue();
    assert.equal(t.db.get('SELECT status FROM notifications WHERE id = ?', a.id).status, 'queued');
    t.advance(600_000);
    mode = 'ok';
    await t.ctx.messaging.dispatchDue();
    row = t.db.get('SELECT * FROM notifications WHERE id = ?', a.id);
    assert.equal(row.status, 'sent');
    assert.equal(row.attempts, 3);
    const b = q('test:b');
    mode = '400';
    await t.ctx.messaging.dispatch([b.id]);
    row = t.db.get('SELECT * FROM notifications WHERE id = ?', b.id);
    assert.deepEqual([row.status, row.error_code], ['failed', '21211']);
  } finally {
    await t.close();
  }
});

test('outbox: never sends a text that breaks the SMS rules; the pause switch holds texts', async () => {
  const t = await makeApp();
  try {
    const { user } = await readyUser(t);
    const bad = t.ctx.messaging.queue({ userId: user.id, channel: 'sms', kind: 'OPT_OUT', to: PHONE, body: 'QUORUM: act now, see bit.ly/x', idemKey: 'bad', country: 'SI' });
    const r = await t.ctx.messaging.dispatch([bad.id]);
    assert.equal(r[0].failed, 'template_invalid');
    assert.equal(t.sms.outbox.length, 0);
    t.db.setSetting('sms_paused', '1');
    const paused = await readyUser(t, { email: 'p@example.si', e164: '+38641234547' });
    await checkoutAndPay(t, paused.client);
    assert.equal(t.sms.outbox.length, 0, 'paused');
    assert.equal(t.db.get("SELECT status FROM notifications WHERE kind = 'OPT_IN'").status, 'queued');
    t.db.setSetting('sms_paused', '0');
    await t.ctx.messaging.dispatchDue();
    assert.equal(smsTo(t, '+38641234547', 'OPT_IN').length, 1);
  } finally {
    await t.close();
  }
});
