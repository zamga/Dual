import { test } from 'node:test';
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { renderSms } from '../../core/sms-templates.js';
import { generateVapidKeys } from '../../server/vendors/push.js';
import { createPacer } from '../../server/notifier.js';
import { pipelineApp, sealDay, subscriber } from './pipeline.js';
import { readyUser, BASE } from './helpers.js';

const pushKeys = (n) => ({ p256dh: generateVapidKeys().publicKey, auth: Buffer.alloc(16, n).toString('base64url') });

async function publishDay(t) {
  await sealDay(t);
  t.local('14:00');
  return t.pub.publish(t.input.date);
}

// Many entitled SMS subscribers written straight into the tables (the HTTP join is tested elsewhere).
function seedSubscribers(db, n, now = '2025-11-03T18:00:00.000Z') {
  db.tx(() => {
    for (let i = 0; i < n; i++) {
      const id = `usr_bulk${String(i).padStart(6, '0')}`;
      db.run("INSERT INTO users (id, email, email_verified_at, declared_country, jurisdiction, locale, status, created_at, updated_at) VALUES (?, ?, ?, 'SI', 'SI', ?, 'geo_ok', ?, ?)", id, `bulk${i}@example.si`, now, i % 2 ? 'sl' : 'en', now, now);
      db.run("INSERT INTO phone_numbers (user_id, e164, country, line_type, verified_at, created_at, updated_at) VALUES (?, ?, 'SI', 'mobile', ?, ?, ?)", id, `+3864${1000000 + i}`, now, now, now);
      db.run("INSERT INTO consent_events (user_id, kind, action, text_version, text_sha256, channel, created_at) VALUES (?, 'sms', 'grant', 'v3', 'x', 'web', ?)", id, now);
      db.run('INSERT INTO channel_prefs (user_id, sms, push, email, updated_at) VALUES (?, 1, 1, 1, ?)', id, now);
      db.run("INSERT INTO entitlements (user_id, feature, active_until, source, updated_at) VALUES (?, 'picks', '2026-01-01T00:00:00.000Z', 'test', ?)", id, now);
    }
  });
}

test('fan-out: recipients per brief §4.4, identical content, rows persisted first, paced texts with validity and callback', async () => {
  const t = await pipelineApp({ config: { fanout: { smsPerSecond: 2 } } });
  try {
    t.local('19:00', '2025-11-03');
    const a = await subscriber(t, { email: 'a@example.si', e164: '+38641000001' });
    const b = await subscriber(t, { email: 'b@example.si', e164: '+38641000002', locale: 'sl' });
    await subscriber(t, { email: 'c@example.si', e164: '+38641000003', sms: false });
    const out = await subscriber(t, { email: 'd@example.si', e164: '+38641000004' });
    const tokyo = await subscriber(t, { email: 'e@example.si', e164: '+38641000005' });
    await readyUser(t, { email: 'f@example.si', e164: '+38641000006' }); // consented, never paid: not entitled
    const quietMail = await subscriber(t, { email: 'g@example.si', e164: '+38641000007' });
    assert.equal((await out.client.post('/api/prefs', { sms: false })).status, 200);
    assert.equal((await tokyo.client.post('/api/prefs', { timeZone: 'Asia/Tokyo' })).status, 200);
    assert.equal((await tokyo.client.post('/api/prefs', { timeZone: 'Mars/Olympus' })).status, 400);
    assert.equal((await quietMail.client.post('/api/prefs', { email: false })).status, 200);
    for (const n of [1, 2]) assert.equal((await a.client.post('/api/push/subscribe', { endpoint: `https://fcm.googleapis.com/fcm/send/a${n}`, keys: pushKeys(n) })).status, 200);
    assert.equal((await b.client.post('/api/push/subscribe', { endpoint: 'http://push.example.net/insecure', keys: pushKeys(3) })).status, 400);
    // only the browsers' push services: never this server, its network or the cloud metadata address
    for (const endpoint of ['https://127.0.0.1:8787/api/admin/sms', 'https://169.254.169.254/latest/meta-data/', 'https://10.0.0.5/internal', 'https://localhost/x', 'https://push.example.net/b', 'https://fcm.googleapis.com.evil.example/x', 'https://user:pw@fcm.googleapis.com/x', 'https://fcm.googleapis.com:8443/x']) {
      const r = await b.client.post('/api/push/subscribe', { endpoint, keys: pushKeys(3) });
      assert.deepEqual([r.status, r.body.error], [400, 'invalid_endpoint'], endpoint);
    }
    assert.equal((await b.client.post('/api/push/subscribe', { endpoint: 'https://web.push.apple.com/QK1/b', keys: pushKeys(3) })).status, 200);
    assert.equal((await b.client.post('/api/push/unsubscribe', { endpoint: 'https://web.push.apple.com/QK1/b' })).body.removed, 1);
    assert.equal((await b.client.post('/api/push/subscribe', { endpoint: 'https://fcm.googleapis.com/fcm/send/b', keys: { p256dh: 'AAAA', auth: 'BBBB' } })).status, 400);
    const before = t.sms.outbox.length;

    const p = await publishDay(t);
    const items = p.items;
    assert.deepEqual(items.map((x) => `${x.kind}#${x.no}`), ['RENEW#0010', 'BUY#0011', 'BUY#0012', 'CLOSE#0006']);
    assert.deepEqual(p.notify.rows, { sms: 12, push: 4, email: 20 });
    assert.equal(p.notify.recipients, 6, 'entitled users only');
    assert.equal(p.notify.smsSkipped.quiet_hours, 4, '14:00 in Ljubljana is 22:00 in Tokyo');
    assert.equal(p.notify.smsSkipped.no_consent, 4 * 2, 'opted out (consent revoked), and never consented');

    // every row exists before the first provider call
    const total = t.db.get('SELECT COUNT(*) AS n FROM notifications WHERE rec_id IS NOT NULL').n;
    let seenAtFirstCall = null;
    const send = t.sms.sendMessage;
    t.sms.sendMessage = async (m) => {
      seenAtFirstCall ??= { rows: t.db.get('SELECT COUNT(*) AS n FROM notifications WHERE rec_id IS NOT NULL').n, status: t.db.get('SELECT status FROM notifications WHERE to_addr = ? AND body = ?', m.to, m.body).status };
      return send(m);
    };
    const d = await t.ctx.notifier.deliverIssue(t.input.date);
    assert.deepEqual(seenAtFirstCall, { rows: total, status: 'sending' });
    assert.deepEqual(d.counts.sms, { sent: 12, cancelled: 4 });
    assert.deepEqual(d.counts.push, { sent: 4 });
    assert.deepEqual(d.counts.email, { sent: 20 });
    assert.equal(d.seconds, 5.5, '12 texts at 2 per second');
    const texts = t.sms.outbox.slice(before);
    for (let i = 1; i < texts.length; i++) assert.ok(new Date(texts[i].at) - new Date(texts[i - 1].at) >= 500, 'paced');
    for (const m of texts) {
      assert.equal(m.validityPeriod, 3600);
      assert.equal(m.statusCallback, `${BASE}/api/webhooks/twilio/status`);
    }
    // identical content for every recipient (only the personal stop link differs) and one timestamp
    const rows = t.db.all("SELECT n.*, u.locale FROM notifications n JOIN users u ON u.id = n.user_id WHERE n.rec_id IS NOT NULL AND n.status != 'cancelled'");
    for (const it of items) {
      for (const ch of ['sms', 'email']) {
        for (const loc of ['en', 'sl']) {
          const bodies = new Set(rows.filter((r) => r.rec_id === it.recId && r.channel === ch && r.locale === loc).map((r) => r.body.replace(/qrm\.si\/u\/\w+/g, 'qrm.si/u/TOKEN')));
          assert.ok(bodies.size <= 1, `${ch} ${loc} ${it.kind} identical for every tier`);
        }
      }
      for (const r of rows.filter((x) => x.rec_id === it.recId && x.channel === 'push')) assert.equal(JSON.parse(r.body).publishedAt, '2025-11-04T14:00:00+01:00');
      for (const r of rows.filter((x) => x.rec_id === it.recId)) assert.equal(r.idem_key, `${it.recId}:${r.user_id}:${r.channel}`);
    }
    const buy = texts.find((m) => m.to === '+38641000001' && m.body.includes('BUY KRST'));
    assert.equal(buy.body, renderSms('BUY', 'en', { no: '0011', ticker: 'KRST', issueDate: '2025-11-04', entryDate: '2025-11-04', exitDate: '2025-12-04', agreement: 3, token: t.db.get('SELECT token FROM unsubscribe_tokens WHERE user_id = ?', a.user.id).token }));
    assert.ok(texts.some((m) => m.body.startsWith('QUORUM #0006 ZAPRTJE ORBL')), 'Slovene CLOSE');
    assert.ok(!texts.some((m) => ['+38641000004', '+38641000005', '+38641000006', '+38641000003'].includes(m.to)));
    const mail = t.email.outbox.find((m) => m.to === 'a@example.si' && m.tag === 'BUY');
    assert.match(mail.subject, /^Quorum #0011 BUY KRST · 04\.11\.25 14:00 CET$/);
    assert.match(mail.text, /drafted by an AI model from our model data and checked and approved by Maja Vrhovnik, Head of Research/);
    assert.match(mail.text, /Price at dissemination: 87\.95 USD \(SIM last close, 2025-11-03T16:00:00-05:00\)/);
    assert.match(mail.text, /Not personal advice/);
    assert.equal(t.push.outbox.filter((m) => m.endpoint.startsWith('https://fcm.googleapis.com/fcm/send/a')).length, 8, 'both devices, every item');
    // idempotent: a second enqueue creates nothing
    const again = await t.ctx.notifier.enqueueIssue({ date: t.input.date, items, publishedAt: p.publishedAt });
    assert.deepEqual(again.rows, { sms: 0, push: 0, email: 0 });
  } finally {
    await t.close();
  }
});

test('SMS paused at 14:00: push and email go out; held pick texts are never sent after the US open', async () => {
  const t = await pipelineApp();
  try {
    t.local('19:00', '2025-11-03');
    await subscriber(t, { email: 'a@example.si', e164: '+38641000001' });
    await publishDay(t);
    t.db.setSetting('sms_paused', '1');
    const d = await t.ctx.notifier.deliverIssue(t.input.date);
    assert.equal(d.smsStopped, 'sms_paused');
    assert.deepEqual([d.counts.sms, d.counts.email], [{ queued: 4 }, { sent: 4 }]);
    t.local('15:31');
    t.db.setSetting('sms_paused', '0');
    await t.ctx.messaging.dispatchDue();
    assert.deepEqual(t.db.all("SELECT status, error_code FROM notifications WHERE channel = 'sms' AND rec_id IS NOT NULL GROUP BY status, error_code"), [{ status: 'cancelled', error_code: 'expired' }]);
    assert.equal(t.sms.outbox.filter((m) => m.body.startsWith('QUORUM #')).length, 0);
  } finally {
    await t.close();
  }
});

test('a text that fails validateSms blocks that item for everyone and pages on-call; other channels continue', async () => {
  const t = await pipelineApp();
  try {
    await sealDay(t);
    t.local('14:00');
    const p = await t.pub.publish(t.input.date); // nobody subscribed yet: nothing enqueued
    t.local('14:00');
    await subscriber(t, { email: 'a@example.si', e164: '+38641000001' });
    const bad = p.items.map((x) => (x.no === '0011' ? { ...x, ticker: 'NOW' } : x));
    const r = await t.ctx.notifier.enqueueIssue({ date: t.input.date, items: bad, publishedAt: p.publishedAt });
    assert.deepEqual(r.blocked.map((x) => [x.no, x.locale]), [['0011', 'en'], ['0011', 'sl']]);
    assert.match(r.blocked[0].errors.join(), /forbidden word: "now"/);
    assert.equal(r.rows.sms, 3);
    assert.equal(r.rows.email, 4);
    assert.ok(t.pager.pages.some((x) => x.kind === 'sms_template_invalid'));
  } finally {
    await t.close();
  }
});

test('pacing and capacity: 400 subscribers x 4 items at 10/s end inside the 10-minute window; too slow a rate pages', async () => {
  const t = await pipelineApp({ config: { fanout: { smsPerSecond: 10 } } });
  try {
    seedSubscribers(t.db, 400);
    await sealDay(t);
    t.local('14:00');
    const w0 = performance.now();
    const p = await t.pub.publish(t.input.date);
    const w1 = performance.now();
    const d = await t.ctx.notifier.deliverIssue(t.input.date);
    const w2 = performance.now();
    assert.equal(p.notify.rows.sms, 1600);
    assert.equal(p.notify.plannedSmsSeconds, 160);
    assert.equal(d.counts.sms.sent, 1600);
    assert.ok(d.seconds >= 159.9 && d.seconds <= 600, `virtual fan-out ${d.seconds}s`);
    assert.equal(d.smsDoneAt, '2025-11-04T13:02:39.900Z');
    t.ctx.log.info(`[measure] enqueue 1600 texts + 1600 emails: ${Math.round(w1 - w0)} ms; paced delivery (virtual ${d.seconds}s): ${Math.round(w2 - w1)} ms wall`);
    const slow = await pipelineApp({ config: { fanout: { smsPerSecond: 1 } } });
    try {
      seedSubscribers(slow.db, 160);
      await sealDay(slow);
      slow.local('14:00');
      const q = await slow.pub.publish(slow.input.date);
      assert.equal(q.notify.plannedSmsSeconds, 640);
      assert.ok(slow.pager.pages.some((x) => x.kind === 'fanout_capacity'));
    } finally {
      await slow.close();
    }
  } finally {
    await t.close();
  }
});

test('createPacer spaces calls evenly and never bursts to catch up', async () => {
  let now = 0;
  const waits = [];
  const wait = createPacer({ perSecond: 4, now: () => new Date(now), sleep: async (ms) => { waits.push(ms); now += ms; } });
  for (let i = 0; i < 4; i++) await wait();
  assert.deepEqual(waits, [250, 250, 250]);
  now += 10_000; // a long provider call
  await wait();
  await wait();
  assert.deepEqual(waits, [250, 250, 250, 250], 'after a stall the next slot starts from now');
});

test('weekly Ledger email (Sunday 18:00): every verified reader, no SMS, sealed picks stay sealed for free readers', async () => {
  const t = await pipelineApp();
  try {
    t.local('19:00', '2025-11-03');
    const paid = await subscriber(t, { email: 'paid@example.si', e164: '+38641000001' });
    await readyUser(t, { email: 'free@example.si', e164: '+38641000002', sms: false });
    await publishDay(t);
    await t.ctx.notifier.deliverIssue(t.input.date);
    t.local('15:31');
    await t.pub.recordOpens(t.input.date, t.input.marketData);
    const smsBefore = t.db.get("SELECT COUNT(*) AS n FROM notifications WHERE channel = 'sms'").n;
    t.local('18:00', '2025-11-09');
    const r = await t.ctx.notifier.weeklyLedger('2025-11-09');
    assert.deepEqual([r.from, r.to, r.recipients, r.queued], ['2025-11-03', '2025-11-08', 2, 2]);
    const paidMail = t.email.outbox.find((m) => m.tag === 'WEEKLY' && m.to === 'paid@example.si');
    const freeMail = t.email.outbox.find((m) => m.tag === 'WEEKLY' && m.to === 'free@example.si');
    assert.match(paidMail.subject, /^Quorum weekly Ledger, 3 Nov 2025 - 8 Nov 2025$/);
    assert.match(paidMail.text, /#8 4 Nov 2025: #0011 BUY, #0012 BUY, #0010 RENEW, #0006 CLOSE/);
    assert.match(paidMail.text, /#0006 ORBL: net \+4\.8%, excess vs benchmark \+3\.6%/);
    assert.match(paidMail.text, /#0011 BUY KRST, exit 4 Dec 2025/);
    assert.match(freeMail.text, /#0011 BUY sealed [0-9a-f]{8}, exit 4 Dec 2025/);
    assert.ok(!freeMail.text.includes('KRST'), 'no ticker of an open pick for a free reader');
    assert.equal(t.db.get("SELECT COUNT(*) AS n FROM notifications WHERE channel = 'sms'").n, smsBefore, 'no SMS');
    assert.equal((await t.ctx.notifier.weeklyLedger('2025-11-09')).queued, 0, 'once per week per reader');
    assert.ok(paid.user.id);
  } finally {
    await t.close();
  }
});

test('push: a gone subscription (410) is revoked; the row is sent when another device accepted it', async () => {
  const t = await pipelineApp();
  try {
    t.local('19:00', '2025-11-03');
    const a = await subscriber(t, { email: 'a@example.si', e164: '+38641000001', sms: false });
    await a.client.post('/api/push/subscribe', { endpoint: 'https://fcm.googleapis.com/fcm/send/old', keys: pushKeys(1) });
    await a.client.post('/api/push/subscribe', { endpoint: 'https://fcm.googleapis.com/fcm/send/new', keys: pushKeys(2) });
    const calls = [];
    t.ctx.push = { kind: 'stub', send: async (s) => (calls.push(s.endpoint), s.endpoint.endsWith('/old') ? { ok: false, status: 410, gone: true } : { ok: true, status: 201, gone: false, id: 'm1' }) };
    await publishDay(t);
    const d = await t.ctx.notifier.deliverIssue(t.input.date);
    assert.deepEqual(d.counts.push, { sent: 4 });
    assert.ok(t.db.get("SELECT revoked_at FROM push_subscriptions WHERE endpoint = 'https://fcm.googleapis.com/fcm/send/old'").revoked_at);
    const tried = calls.filter((x) => x.endsWith('/old')).length;
    assert.ok(tried >= 1 && tried <= 4, 'tried at most once per item already in flight');
    await t.ctx.messaging.dispatch([t.ctx.messaging.queue({ userId: a.user.id, channel: 'push', kind: 'TEST', to: null, body: JSON.stringify({ title: 't' }), idemKey: 'push-after-revoke' }).id]);
    assert.equal(calls.filter((x) => x.endsWith('/old')).length, tried, 'never tried again once gone');
    const r = await a.client.post('/api/push/unsubscribe', { endpoint: 'https://fcm.googleapis.com/fcm/send/new' });
    assert.equal(r.body.removed, 1);
    assert.equal((await a.client.get('/api/push/key')).status, 200);
  } finally {
    await t.close();
  }
});
