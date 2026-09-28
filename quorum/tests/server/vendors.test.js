import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import {
  createStripe,
  verifyStripeSignature,
  stripeSignatureHeader,
  StripeSignatureError,
  StripeError,
  encodeForm,
  subscriptionPeriod,
  invoiceSubscriptionId,
  STRIPE_API_VERSION,
} from '../../server/vendors/stripe.js';
import { createTwilio, createConsoleSms, twilioSignature, validateTwilioSignature, TwilioError } from '../../server/vendors/twilio.js';
import { decodeForm } from '../../server/dev/fake-stripe.js';

// A fetch that records requests and answers from a handler.
function recorder(handler) {
  const calls = [];
  const fetch = async (url, init = {}) => {
    const u = new URL(url);
    const call = { url: u, method: init.method || 'GET', headers: init.headers || {}, body: init.body ?? null };
    calls.push(call);
    const [status, body] = handler(call);
    return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  };
  return { fetch, calls };
}

// ------------------------------------------------------------------ Stripe
const SECRET = 'whsec_unit';
const EVENT = JSON.stringify({ id: 'evt_1', type: 'invoice.paid', data: { object: {} } });

test('stripe signature: valid', () => {
  const h = stripeSignatureHeader(SECRET, EVENT, 1_800_000_000);
  const e = verifyStripeSignature(Buffer.from(EVENT), h, SECRET, { nowSec: 1_800_000_100 });
  assert.equal(e.id, 'evt_1');
});

test('stripe signature: tampered body, tampered signature, wrong secret -> mismatch', () => {
  const h = stripeSignatureHeader(SECRET, EVENT, 1_800_000_000);
  const opts = { nowSec: 1_800_000_000 };
  const tampered = EVENT.replace('invoice.paid', 'invoice.paix');
  assert.throws(() => verifyStripeSignature(tampered, h, SECRET, opts), (e) => e instanceof StripeSignatureError && e.reason === 'mismatch');
  const badSig = h.replace(/v1=(.)/, (m, c) => `v1=${c === 'a' ? 'b' : 'a'}`);
  assert.throws(() => verifyStripeSignature(EVENT, badSig, SECRET, opts), (e) => e.reason === 'mismatch');
  assert.throws(() => verifyStripeSignature(EVENT, h, 'whsec_other', opts), (e) => e.reason === 'mismatch');
});

test('stripe signature: stale and future timestamps beyond 300 s are refused', () => {
  const h = stripeSignatureHeader(SECRET, EVENT, 1_800_000_000);
  assert.throws(() => verifyStripeSignature(EVENT, h, SECRET, { nowSec: 1_800_000_301 }), (e) => e.reason === 'stale');
  assert.throws(() => verifyStripeSignature(EVENT, h, SECRET, { nowSec: 1_799_999_699 }), (e) => e.reason === 'stale');
  assert.doesNotThrow(() => verifyStripeSignature(EVENT, h, SECRET, { nowSec: 1_800_000_300 }));
});

test('stripe signature: missing / malformed headers, and any matching v1 of several', () => {
  assert.throws(() => verifyStripeSignature(EVENT, undefined, SECRET), (e) => e.reason === 'missing');
  assert.throws(() => verifyStripeSignature(EVENT, 'v1=abc', SECRET), (e) => e.reason === 'malformed');
  const t = 1_800_000_000;
  const good = createHmac('sha256', SECRET).update(`${t}.${EVENT}`).digest('hex');
  const header = `t=${t},v1=${'0'.repeat(64)},v1=${good},v0=zzz`;
  assert.equal(verifyStripeSignature(EVENT, header, SECRET, { nowSec: t }).id, 'evt_1');
});

test('stripe form encoding round-trips nested objects and arrays', () => {
  const enc = encodeForm({ mode: 'subscription', line_items: [{ price: 'p', quantity: 1 }], automatic_tax: { enabled: true }, expand: ['a'], skip: null });
  assert.equal(decodeURIComponent(enc), 'mode=subscription&line_items[0][price]=p&line_items[0][quantity]=1&automatic_tax[enabled]=true&expand[0]=a');
  assert.deepEqual(decodeForm(enc), { mode: 'subscription', line_items: [{ price: 'p', quantity: '1' }], automatic_tax: { enabled: 'true' }, expand: ['a'] });
});

test('stripe checkout session request: version header, auth, subscription mode and compliance params', async () => {
  const r = recorder(() => [200, { id: 'cs_1', url: 'https://checkout.stripe.test/cs_1' }]);
  const s = createStripe({ secretKey: 'sk_test_x', webhookSecret: SECRET, fetch: r.fetch });
  const out = await s.createCheckoutSession({ userId: 'usr_1', email: 'a@b.si', priceId: 'price_sig', tier: 'signal', interval: 'month', locale: 'sl', successUrl: 'https://q/#join', cancelUrl: 'https://q/#pricing' });
  assert.equal(out.id, 'cs_1');
  const c = r.calls[0];
  assert.equal(c.method, 'POST');
  assert.equal(c.url.href, 'https://api.stripe.com/v1/checkout/sessions');
  assert.equal(c.headers['stripe-version'], '2026-08-26.dahlia');
  assert.equal(STRIPE_API_VERSION, '2026-08-26.dahlia');
  assert.equal(c.headers.authorization, 'Bearer sk_test_x');
  assert.equal(c.headers['content-type'], 'application/x-www-form-urlencoded');
  const p = decodeForm(c.body);
  assert.equal(p.mode, 'subscription');
  assert.equal(p.client_reference_id, 'usr_1');
  assert.equal(p.automatic_tax.enabled, 'true');
  assert.equal(p.tax_id_collection.enabled, 'true');
  assert.equal(p.consent_collection.terms_of_service, 'required');
  assert.equal(p.billing_address_collection, 'required');
  assert.equal(p.line_items[0].price, 'price_sig');
  assert.equal(p.customer_email, 'a@b.si');
  assert.equal(p.locale, 'sl');
  assert.equal(p.subscription_data.metadata.user_id, 'usr_1');
});

test('stripe calls: retrieve expands the payment method, refund and cancel carry idempotency keys, errors map', async () => {
  const r = recorder((c) => {
    if (c.url.pathname === '/v1/refunds') return [200, { id: 're_1' }];
    if (c.url.pathname === '/v1/subscriptions/sub_missing') return [404, { error: { type: 'invalid_request_error', code: 'resource_missing', message: 'No such subscription' } }];
    return [200, { id: 'x' }];
  });
  const s = createStripe({ secretKey: 'sk_test_x', fetch: r.fetch });
  await s.retrieveSubscription('sub_1');
  assert.equal(r.calls[0].url.pathname, '/v1/subscriptions/sub_1');
  assert.equal(decodeURIComponent(r.calls[0].url.search), '?expand[0]=default_payment_method');
  await s.refund({ paymentIntent: 'pi_1', metadata: { withdrawal_id: '7' } }, { idempotencyKey: 'withdrawal-7-refund' });
  assert.equal(r.calls[1].headers['idempotency-key'], 'withdrawal-7-refund');
  assert.equal(decodeForm(r.calls[1].body).payment_intent, 'pi_1');
  await s.cancelSubscription('sub_1', { idempotencyKey: 'k' });
  assert.equal(r.calls[2].method, 'DELETE');
  await s.createPortalSession({ customerId: 'cus_1', returnUrl: 'https://q/#account' });
  assert.equal(r.calls[3].url.pathname, '/v1/billing_portal/sessions');
  await assert.rejects(() => s.retrieveSubscription('sub_missing'), (e) => e instanceof StripeError && e.status === 404 && e.code === 'resource_missing');
  const unconfigured = createStripe({ fetch: r.fetch });
  await assert.rejects(() => unconfigured.retrieveSubscription('sub_1'), (e) => e.status === 503);
});

test('stripe dahlia shapes: period on items, invoice parent subscription', () => {
  assert.deepEqual(subscriptionPeriod({ items: { data: [{ current_period_start: 1, current_period_end: 2 }] } }), { start: 1, end: 2 });
  assert.deepEqual(subscriptionPeriod({ current_period_start: 3, current_period_end: 4 }), { start: 3, end: 4 });
  assert.equal(invoiceSubscriptionId({ parent: { subscription_details: { subscription: 'sub_9' } } }), 'sub_9');
  assert.equal(invoiceSubscriptionId({ subscription: 'sub_old' }), 'sub_old');
});

// ------------------------------------------------------------------ Twilio
const TOKEN = '12345';
const URL_ = 'https://mycompany.com/myapp.php?foo=1&bar=2';
const PARAMS = { CallSid: 'CA1234567890ABCDE', Caller: '+12349013030', Digits: '1234', From: '+12349013030', To: '+18005551212' };

test('twilio signature: the documented example, tampered params, wrong URL, missing header', () => {
  // Twilio's published example (docs: "Validating Signatures from Twilio").
  assert.equal(twilioSignature(TOKEN, URL_, PARAMS), '0/KCTR6DLpKmkAf8muzZqo1nDgQ=');
  assert.equal(validateTwilioSignature(TOKEN, URL_, PARAMS, '0/KCTR6DLpKmkAf8muzZqo1nDgQ='), true);
  assert.equal(validateTwilioSignature(TOKEN, URL_, { ...PARAMS, Digits: '9999' }, '0/KCTR6DLpKmkAf8muzZqo1nDgQ='), false);
  assert.equal(validateTwilioSignature(TOKEN, URL_.replace('foo=1', 'foo=2'), PARAMS, '0/KCTR6DLpKmkAf8muzZqo1nDgQ='), false);
  assert.equal(validateTwilioSignature('other', URL_, PARAMS, '0/KCTR6DLpKmkAf8muzZqo1nDgQ='), false);
  assert.equal(validateTwilioSignature(TOKEN, URL_, PARAMS, undefined), false);
});

test('twilio requests: Lookup v2 fields, Verify locale, Messages with service, callback and validity', async () => {
  const r = recorder((c) => {
    if (c.url.host === 'lookups.twilio.com') {
      return [200, { phone_number: '+38641234545', valid: true, country_code: 'SI', line_type_intelligence: { type: 'mobile', carrier_name: 'A1' }, sms_pumping_risk: { carrier_risk_category: 'low', sms_pumping_risk_score: 4, number_blocked: false } }];
    }
    if (c.url.pathname.endsWith('/Verifications')) return [201, { sid: 'VE1', status: 'pending' }];
    if (c.url.pathname.endsWith('/VerificationCheck')) return [200, { status: 'approved', valid: true }];
    if (c.url.pathname.endsWith('/Messages.json')) return [201, { sid: 'SM1', status: 'accepted' }];
    return [404, {}];
  });
  const tw = createTwilio({ accountSid: 'AC1', authToken: 'tok', messagingServiceSid: 'MG1', verifyServiceSid: 'VA1', fetch: r.fetch });
  const auth = 'Basic ' + Buffer.from('AC1:tok').toString('base64');

  const l = await tw.lookup('+38641234545');
  assert.equal(r.calls[0].url.pathname, '/v2/PhoneNumbers/%2B38641234545');
  assert.equal(r.calls[0].url.searchParams.get('Fields'), 'line_type_intelligence,sms_pumping_risk');
  assert.equal(r.calls[0].headers.authorization, auth);
  assert.deepEqual([l.valid, l.countryCode, l.lineType, l.smsPumpingRisk.category, l.smsPumpingRisk.score], [true, 'SI', 'mobile', 'low', 4]);

  await tw.verifyStart('+38641234545', 'sl');
  const v = new URLSearchParams(r.calls[1].body);
  assert.equal(r.calls[1].url.href, 'https://verify.twilio.com/v2/Services/VA1/Verifications');
  assert.deepEqual([v.get('To'), v.get('Channel'), v.get('Locale')], ['+38641234545', 'sms', 'sl']);

  const chk = await tw.verifyCheck('+38641234545', '123456');
  assert.equal(chk.valid, true);
  assert.equal(new URLSearchParams(r.calls[2].body).get('Code'), '123456');

  const m = await tw.sendMessage({ to: '+38641234545', body: 'QUORUM: test', statusCallback: 'https://q/api/webhooks/twilio/status' });
  assert.equal(m.sid, 'SM1');
  assert.equal(r.calls[3].url.href, 'https://api.twilio.com/2010-04-01/Accounts/AC1/Messages.json');
  const mp = new URLSearchParams(r.calls[3].body);
  assert.equal(mp.get('MessagingServiceSid'), 'MG1');
  assert.equal(mp.get('StatusCallback'), 'https://q/api/webhooks/twilio/status');
  assert.equal(mp.get('ValidityPeriod'), '3600');
  assert.equal(mp.get('From'), null, 'the Messaging Service picks the sender');
});

test('twilio errors: 404 on Verify check means expired; other errors throw TwilioError with the code', async () => {
  const r = recorder((c) => (c.url.pathname.endsWith('/VerificationCheck') ? [404, { code: 20404, message: 'not found' }] : [400, { code: 21211, message: "Invalid 'To' Phone Number" }]));
  const tw = createTwilio({ accountSid: 'AC1', authToken: 'tok', messagingServiceSid: 'MG1', verifyServiceSid: 'VA1', fetch: r.fetch });
  assert.deepEqual(await tw.verifyCheck('+38641234545', '1'), { status: 'expired', valid: false });
  await assert.rejects(() => tw.sendMessage({ to: '+1', body: 'x' }), (e) => e instanceof TwilioError && e.code === 21211 && e.status === 400);
});

test('console SMS transport has the same interface and simulates every Lookup outcome', async () => {
  const c = createConsoleSms({ log: { info() {} } });
  const tw = createTwilio({ accountSid: 'AC1', authToken: 'tok', fetch: async () => new Response('{}') });
  for (const k of ['lookup', 'verifyStart', 'verifyCheck', 'sendMessage', 'validateSignature', 'sign']) {
    assert.equal(typeof c[k], 'function', k);
    assert.equal(typeof tw[k], 'function', k);
  }
  assert.equal((await c.lookup('+38641234545')).lineType, 'mobile');
  assert.equal((await c.lookup('+38612340000')).lineType, 'landline');
  assert.equal((await c.lookup('+38612349999')).lineType, 'nonFixedVoip');
  assert.equal((await c.lookup('+38641236666')).smsPumpingRisk.category, 'high');
  assert.equal((await c.lookup('+38641235555')).valid, false);
  assert.equal((await c.lookup('+4915112345678')).countryCode, 'DE');
  await c.verifyStart('+38641234545', 'en');
  assert.equal((await c.verifyCheck('+38641234545', '000000x')).valid, false);
  assert.equal((await c.verifyCheck('+38641234545', c.lastCode('+38641234545'))).valid, true);
  const m = await c.sendMessage({ to: '+38641234545', body: 'hi', statusCallback: 'u' });
  assert.equal(c.outbox[0].sid, m.sid);
  assert.equal(c.outbox[0].validityPeriod, 3600);
});
