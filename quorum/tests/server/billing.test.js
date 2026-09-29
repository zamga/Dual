import { test } from 'node:test';
import assert from 'node:assert/strict';
import { entitlementUntil } from '../../server/billing.js';
import { isEntitled } from '../../server/entitlements.js';
import { makeApp, readyUser, checkoutAndPay, deliver, smsTo, signIn, passGeo, grant } from './helpers.js';

const DAY = 86_400_000;

async function hook(t, events) {
  const c = t.client();
  const out = [];
  for (const e of events) {
    const r = await deliver(t, c, e);
    assert.equal(r.status, 200, `${e.type}: ${r.text}`);
    out.push(r.body);
  }
  return out;
}

const entitled = (t, userId, feature = 'picks') => isEntitled(t.db, userId, feature, t.ctx.now());
const subRow = (t) => t.db.get('SELECT * FROM subscriptions');

test('entitlementUntil: the rule table', () => {
  const cpe = '2026-10-28T10:00:00.000Z';
  const base = { first_paid_at: '2026-09-28T10:00:00.000Z', current_period_end: cpe, status: 'active', cancel_at_period_end: 0 };
  const cfg = { graceDays: 3, failedPaymentSuspendDays: 7 };
  assert.equal(entitlementUntil(base, cfg).toISOString(), '2026-10-31T10:00:00.000Z');
  assert.equal(entitlementUntil({ ...base, cancel_at_period_end: 1 }, cfg).toISOString(), cpe);
  assert.equal(entitlementUntil({ ...base, first_paid_at: null }, cfg), null, 'nothing before a paid invoice');
  assert.equal(entitlementUntil({ ...base, status: 'past_due', payment_failed_at: '2026-10-01T00:00:00.000Z' }, cfg).toISOString(), '2026-10-08T00:00:00.000Z');
  assert.equal(entitlementUntil({ ...base, status: 'past_due', payment_failed_at: '2026-10-30T00:00:00.000Z' }, cfg).toISOString(), '2026-10-31T10:00:00.000Z');
  for (const status of ['canceled', 'incomplete', 'incomplete_expired', 'paused']) assert.equal(entitlementUntil({ ...base, status }, cfg), null, status);
  for (const flag of ['disputed_at', 'withdrawn_at', 'geo_mismatch_at']) assert.equal(entitlementUntil({ ...base, [flag]: base.first_paid_at }, cfg), null, flag);
});

test('webhook signatures over HTTP: tampered and stale deliveries are refused and not recorded', async () => {
  const t = await makeApp();
  try {
    const c = t.client();
    const e = t.fake.event('invoice.paid', { id: 'in_x', object: 'invoice' });
    const d = t.fake.delivery(e, 'whsec_test_secret', Math.floor(t.clock.t / 1000));
    const tampered = await c.request('POST', '/api/webhooks/stripe', { body: d.body.replace('in_x', 'in_y'), headers: d.headers });
    assert.equal(tampered.status, 400);
    assert.deepEqual(tampered.body, { error: 'invalid_signature', reason: 'mismatch' });
    const stale = await deliver(t, c, e, { ts: Math.floor(t.clock.t / 1000) - 301 });
    assert.equal(stale.status, 400);
    assert.equal(stale.body.reason, 'stale');
    const unsigned = await c.request('POST', '/api/webhooks/stripe', { body: d.body, headers: { 'content-type': 'application/json' } });
    assert.equal(unsigned.status, 400);
    assert.equal(t.db.get('SELECT COUNT(*) AS n FROM processed_events').n, 0);
    const ok = await deliver(t, c, e);
    assert.equal(ok.status, 200);
    assert.equal(t.db.get('SELECT COUNT(*) AS n FROM processed_events').n, 1);
  } finally {
    await t.close();
  }
});

test('checkout: preconditions, then a Checkout Session with the compliance parameters', async () => {
  const t = await makeApp();
  try {
    const c = t.client();
    await signIn(t, c, 'buyer@example.si');
    assert.equal((await c.post('/api/checkout', { tier: 'signal', interval: 'month' })).body.error, 'geo_required');
    await passGeo(c, 'SI');
    const noTerms = await c.post('/api/checkout', { tier: 'signal', interval: 'month' });
    assert.equal(noTerms.status, 409);
    assert.deepEqual(noTerms.body.missing, ['terms', 'immediate_performance']);
    await grant(c, 'terms');
    await grant(c, 'immediate_performance');
    assert.equal((await c.post('/api/checkout', { tier: 'gold', interval: 'month' })).status, 400);
    assert.equal((await c.post('/api/checkout', { tier: 'signal', interval: 'week' })).status, 400);
    const r = await c.post('/api/checkout', { tier: 'signal', interval: 'year' });
    assert.equal(r.status, 200);
    assert.match(r.body.url, /^https:\/\/checkout\.stripe\.test\//);
    const req = t.fake.requests.find((x) => x.path === '/v1/checkout/sessions');
    assert.equal(req.params.line_items[0].price, 'price_signal_y');
    assert.equal(req.params.mode, 'subscription');
    assert.equal(req.params.automatic_tax.enabled, 'true');
    assert.equal(req.params.consent_collection.terms_of_service, 'required');
    assert.equal(req.params.success_url, 'https://quorum.test/#join');
    const me = await c.get('/api/me');
    assert.equal(me.body.activation, 'pending', 'the redirect grants nothing: Activating...');
    assert.equal(me.body.entitlements.picks.active, false);
  } finally {
    await t.close();
  }
});

test('idempotency: a duplicate event id is processed once; the opt-in text goes out once', async () => {
  const t = await makeApp();
  try {
    const { client, user } = await readyUser(t);
    const done = await checkoutAndPay(t, client);
    const again = await hook(t, done.events);
    assert.ok(again.every((b) => b.duplicate === true));
    assert.equal(t.db.get('SELECT COUNT(*) AS n FROM processed_events').n, done.events.length);
    assert.equal(entitled(t, user.id), true);
    assert.equal(smsTo(t, '+38641234545', 'OPT_IN').length, 1);
    assert.throws(() => t.db.run('DELETE FROM processed_events'), /append-only/);
  } finally {
    await t.close();
  }
});

test('out of order: invoice.paid before checkout.session.completed still grants (metadata + re-fetch)', async () => {
  const t = await makeApp();
  try {
    const { client, user } = await readyUser(t);
    const done = await checkoutAndPay(t, client, { deliverEvents: false });
    const byType = Object.fromEntries(done.events.map((e) => [e.type, e]));
    await hook(t, [byType['invoice.paid']]);
    assert.equal(entitled(t, user.id), true);
    assert.equal(t.db.get('SELECT stripe_customer_id FROM users').stripe_customer_id, done.subscription.customer);
    await hook(t, [byType['checkout.session.completed'], byType['customer.subscription.created']]);
    assert.equal(entitled(t, user.id), true);
    assert.equal(t.db.get('SELECT COUNT(*) AS n FROM subscriptions').n, 1);
    assert.equal(smsTo(t, '+38641234545', 'OPT_IN').length, 1);
  } finally {
    await t.close();
  }
});

test('out of order: without a paid invoice nothing is granted; a stale "active" update after deletion stays revoked', async () => {
  const t = await makeApp();
  try {
    const { client, user } = await readyUser(t);
    const done = await checkoutAndPay(t, client, { deliverEvents: false });
    const byType = Object.fromEntries(done.events.map((e) => [e.type, e]));
    await hook(t, [byType['checkout.session.completed'], byType['customer.subscription.created']]);
    assert.equal(entitled(t, user.id), false, 'checkout.session.completed links, invoice.paid grants');
    assert.equal(smsTo(t, '+38641234545').length, 0);
    await hook(t, [byType['invoice.paid']]);
    assert.equal(entitled(t, user.id), true);

    const staleUpdate = t.fake.update(done.subscription.id, {}); // payload says active
    const deleted = t.fake.cancelNow(done.subscription.id);
    await hook(t, [deleted]);
    assert.equal(entitled(t, user.id), false);
    await hook(t, [staleUpdate]); // arrives late; the re-fetch says canceled
    assert.equal(entitled(t, user.id), false);
    assert.equal(subRow(t).status, 'canceled');
  } finally {
    await t.close();
  }
});

test('transitions: grace of 3 days past the period end; renewal extends it', async () => {
  const t = await makeApp();
  try {
    const { client, user } = await readyUser(t);
    const done = await checkoutAndPay(t, client);
    const cpe = new Date(subRow(t).current_period_end).getTime();
    assert.equal(new Date(t.db.get("SELECT active_until FROM entitlements WHERE feature = 'picks'").active_until).getTime(), cpe + 3 * DAY);
    t.setNow(new Date(cpe + 2 * DAY).toISOString());
    assert.equal(entitled(t, user.id), true, 'inside the grace period');
    t.setNow(new Date(cpe + 3 * DAY + 1000).toISOString());
    assert.equal(entitled(t, user.id), false, 'grace over, no renewal');
    const ren = t.fake.renew(done.subscription.id);
    await hook(t, ren.events);
    assert.equal(entitled(t, user.id), true);
    assert.equal(new Date(subRow(t).current_period_end).getTime(), cpe + 30 * DAY);
  } finally {
    await t.close();
  }
});

test('transitions: cancel_at_period_end is honoured (access to the period end, no grace)', async () => {
  const t = await makeApp();
  try {
    const { client, user } = await readyUser(t);
    const done = await checkoutAndPay(t, client);
    await hook(t, [t.fake.update(done.subscription.id, { cancel_at_period_end: true })]);
    const cpe = new Date(subRow(t).current_period_end).getTime();
    assert.equal(subRow(t).cancel_at_period_end, 1);
    assert.equal(new Date(t.db.get("SELECT active_until FROM entitlements WHERE feature = 'picks'").active_until).getTime(), cpe);
    const me = await client.get('/api/me');
    assert.equal(me.body.subscription.cancelAtPeriodEnd, true);
    t.setNow(new Date(cpe - 1000).toISOString());
    assert.equal(entitled(t, user.id), true);
    t.setNow(new Date(cpe + 1000).toISOString());
    assert.equal(entitled(t, user.id), false);
  } finally {
    await t.close();
  }
});

test('transitions: a failed payment suspends alerts 7 days after the first failure; paying restores', async () => {
  const t = await makeApp();
  try {
    const { client, user } = await readyUser(t);
    const done = await checkoutAndPay(t, client);
    const cpe = new Date(subRow(t).current_period_end).getTime();
    t.setNow(new Date(cpe + 60_000).toISOString());
    const fail = t.fake.failRenewal(done.subscription.id);
    await hook(t, fail.events);
    const s = subRow(t);
    assert.equal(s.status, 'past_due');
    assert.equal(s.payment_failed_at, new Date(cpe + 60_000).toISOString());
    assert.ok(t.email.outbox.some((m) => m.tag === 'DUNNING'), 'dunning email');
    t.advance(6 * DAY);
    assert.equal(entitled(t, user.id), true, 'day 6 of dunning: still entitled');
    t.advance(DAY + 1000);
    assert.equal(entitled(t, user.id), false, 'after 7 days: suspended');
    const paid = t.fake.renew(done.subscription.id);
    await hook(t, paid.events);
    assert.equal(subRow(t).payment_failed_at, null);
    assert.equal(entitled(t, user.id), true);
    // A late payment_failed event after the recovery does not suspend again (re-fetch says active).
    await hook(t, [t.fake.event('invoice.payment_failed', fail.invoice)]);
    assert.equal(subRow(t).payment_failed_at, null);
    assert.equal(entitled(t, user.id), true);
  } finally {
    await t.close();
  }
});

test('transitions: deletion revokes; a dispute revokes and a replayed paid invoice cannot re-grant', async () => {
  const t = await makeApp();
  try {
    const { client, user } = await readyUser(t);
    const done = await checkoutAndPay(t, client);
    await hook(t, [t.fake.dispute(done.subscription.id)]);
    assert.equal(entitled(t, user.id), false);
    assert.ok(subRow(t).disputed_at);
    assert.equal(t.db.get("SELECT source FROM entitlements WHERE feature = 'picks'").source, 'dispute');
    await hook(t, [t.fake.event('invoice.paid', done.invoice)]);
    assert.equal(entitled(t, user.id), false);

    const t2 = await makeApp();
    try {
      const u2 = await readyUser(t2, { email: 'b@example.si' });
      const d2 = await checkoutAndPay(t2, u2.client);
      await hook(t2, [t2.fake.cancelNow(d2.subscription.id)]);
      assert.equal(entitled(t2, u2.user.id), false);
    } finally {
      await t2.close();
    }
  } finally {
    await t.close();
  }
});

test('research tier grants research_data; signal does not', async () => {
  const t = await makeApp();
  try {
    const { client, user } = await readyUser(t);
    await checkoutAndPay(t, client, { tier: 'research', interval: 'month' });
    assert.equal(entitled(t, user.id, 'picks'), true);
    assert.equal(entitled(t, user.id, 'research_data'), true);
    assert.equal(subRow(t).tier, 'research');
  } finally {
    await t.close();
  }
});

test('card billing country must match: mismatch means no entitlement, full refund, cancellation, plain email', async () => {
  const t = await makeApp();
  try {
    const { client, user } = await readyUser(t);
    await checkoutAndPay(t, client, { cardCountry: 'GB' });
    assert.equal(entitled(t, user.id), false);
    const s = subRow(t);
    assert.ok(s.geo_mismatch_at);
    assert.equal(s.status, 'canceled');
    const refunds = t.fake.requests.filter((r) => r.path === '/v1/refunds');
    assert.equal(refunds.length, 1);
    assert.equal(t.fake.requests.filter((r) => r.method === 'DELETE').length, 1);
    const mail = t.email.outbox.find((m) => m.tag === 'GEO_REJECT');
    assert.match(mail.text, /United Kingdom.*Slovenia/);
    assert.equal(t.db.get("SELECT stage, ok FROM geo_checks WHERE stage = 'card'").ok, 0);
    assert.equal(smsTo(t, '+38641234545', 'OPT_IN').length, 0, 'no opt-in text without entitlement');
  } finally {
    await t.close();
  }
});

test('withdrawal button within 14 days: row, full refund of the first payment, immediate cancellation', async () => {
  const t = await makeApp();
  try {
    const { client, user } = await readyUser(t);
    const done = await checkoutAndPay(t, client);
    t.advance(5 * DAY);
    const before = await client.get('/api/me');
    assert.deepEqual([before.body.withdrawal.eligible, before.body.withdrawal.fullRefund], [true, true]);
    const r = await client.post('/api/withdraw', {});
    assert.equal(r.status, 200);
    assert.equal(r.body.status, 'completed');
    assert.equal(r.body.withdrawal.fullRefund, true);
    assert.equal(r.body.withdrawal.amount, 1900);
    const refund = t.fake.requests.find((x) => x.path === '/v1/refunds');
    const pi = Object.values(t.fake.store.invoicePayments).find((p) => p.invoice === done.invoice.id).payment.payment_intent;
    assert.equal(refund.params.payment_intent, pi);
    assert.equal(refund.params.amount, undefined, 'full refund');
    assert.match(refund.headers['idempotency-key'], /^withdrawal-\d+-refund$/);
    const cancel = t.fake.requests.find((x) => x.method === 'DELETE');
    assert.equal(cancel.path, `/v1/subscriptions/${done.subscription.id}`);
    const w = t.db.get('SELECT * FROM withdrawals');
    assert.equal(w.status, 'completed');
    assert.match(w.refund_id, /^re_/);
    assert.equal(entitled(t, user.id), false, 'access ends at once');
    assert.equal(subRow(t).status, 'canceled');
    assert.ok(t.email.outbox.some((m) => m.tag === 'WITHDRAWAL'));
    const again = await client.post('/api/withdraw', {});
    assert.equal(again.status, 409);
    assert.equal(again.body.error, 'already_withdrawn');
    // Stripe's own deletion event arrives afterwards: nothing changes.
    await hook(t, [t.fake.event('customer.subscription.deleted', t.fake.subscription(done.subscription.id))]);
    assert.equal(entitled(t, user.id), false);
    assert.equal(t.fake.store.charges[Object.values(t.fake.store.paymentIntents)[0].latest_charge].refunded, true);
  } finally {
    await t.close();
  }
});

test('withdrawal after 14 days is refused with a plain message; before checkout there is nothing to withdraw', async () => {
  const t = await makeApp();
  try {
    const { client } = await readyUser(t);
    const none = await client.post('/api/withdraw', {});
    assert.equal(none.body.error, 'no_subscription');
    await checkoutAndPay(t, client);
    t.advance(14 * DAY + 60_000);
    const r = await client.post('/api/withdraw', {});
    assert.equal(r.status, 409);
    assert.equal(r.body.error, 'withdrawal_window_closed');
    assert.match(r.body.message, /cancel/);
    assert.equal(t.db.get('SELECT COUNT(*) AS n FROM withdrawals').n, 0);
  } finally {
    await t.close();
  }
});

test('withdrawal when Stripe fails: recorded, access ends, 202; a retry completes with one refund', async () => {
  const t = await makeApp();
  try {
    const { client, user } = await readyUser(t);
    await checkoutAndPay(t, client);
    t.fake.failNext('/v1/refunds', 500);
    const r = await client.post('/api/withdraw', {});
    assert.equal(r.status, 202);
    assert.equal(r.body.status, 'pending');
    assert.equal(t.db.get('SELECT status FROM withdrawals').status, 'failed');
    assert.equal(entitled(t, user.id), false);
    const retry = await client.post('/api/withdraw', {});
    assert.equal(retry.status, 200);
    assert.equal(retry.body.status, 'completed');
    assert.equal(Object.keys(t.fake.store.refunds).length, 1);
    assert.equal(t.db.get('SELECT COUNT(*) AS n FROM withdrawals').n, 1);
  } finally {
    await t.close();
  }
});

test('a second subscription withdrawn within 14 days is refunded pro rata', async () => {
  const t = await makeApp();
  try {
    const { client } = await readyUser(t);
    const first = await checkoutAndPay(t, client);
    await hook(t, [t.fake.cancelNow(first.subscription.id)]);
    t.advance(20 * DAY);
    await checkoutAndPay(t, client);
    t.advance(3 * DAY);
    const r = await client.post('/api/withdraw', {});
    assert.equal(r.status, 200);
    assert.equal(r.body.withdrawal.fullRefund, false);
    assert.equal(r.body.withdrawal.amount, Math.floor(1900 * (1 - 3 / 30)));
    const refund = t.fake.requests.find((x) => x.path === '/v1/refunds');
    assert.equal(refund.params.amount, String(Math.floor(1900 * (1 - 3 / 30))));
  } finally {
    await t.close();
  }
});

test('billing emails: 3-D Secure link, annual renewal reminder; portal session for the customer', async () => {
  const t = await makeApp();
  try {
    const { client } = await readyUser(t);
    const done = await checkoutAndPay(t, client, { interval: 'year' });
    await hook(t, [t.fake.event('invoice.payment_action_required', { ...done.invoice, id: 'in_sca', hosted_invoice_url: 'https://invoice.stripe.test/sca' })]);
    const sca = t.email.outbox.find((m) => m.tag === 'SCA');
    assert.match(sca.text, /https:\/\/invoice\.stripe\.test\/sca/);
    await hook(t, [t.fake.event('invoice.upcoming', { ...done.invoice, id: 'upcoming' })]);
    assert.ok(t.email.outbox.some((m) => m.tag === 'RENEWAL_REMINDER'));
    const p = await client.post('/api/billing/portal', {});
    assert.equal(p.status, 200);
    assert.match(p.body.url, /^https:\/\/billing\.stripe\.test\//);
    const dup = await client.post('/api/checkout', { tier: 'signal', interval: 'month' });
    assert.equal(dup.body.error, 'already_subscribed');
  } finally {
    await t.close();
  }
});

test('Stripe outage: checkout answers 503 billing_unavailable (nothing charged), then works again', async () => {
  const t = await makeApp();
  try {
    const { client } = await readyUser(t);
    t.fake.failNext('/v1/checkout/sessions', 500);
    const down = await client.post('/api/checkout', { tier: 'signal', interval: 'month' });
    assert.equal(down.status, 503);
    assert.equal(down.body.error, 'billing_unavailable');
    assert.equal(down.headers.get('retry-after'), '60');
    const up = await client.post('/api/checkout', { tier: 'signal', interval: 'month' });
    assert.equal(up.status, 200);
  } finally {
    await t.close();
  }
});
