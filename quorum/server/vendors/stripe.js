// Stripe over plain fetch (REST, form-encoded, Bearer auth, pinned API version) and webhook
// signature verification. Only the calls Quorum needs.
import { createHmac, timingSafeEqual } from 'node:crypto';

export const STRIPE_API_VERSION = '2026-08-26.dahlia';
export const STRIPE_BASE = 'https://api.stripe.com';

export class StripeError extends Error {
  constructor(status, body) {
    super(body?.error?.message || `Stripe HTTP ${status}`);
    this.name = 'StripeError';
    this.status = status;
    this.type = body?.error?.type ?? null;
    this.code = body?.error?.code ?? null;
    this.body = body;
  }
}

export class StripeSignatureError extends Error {
  constructor(reason) {
    super(`Stripe signature: ${reason}`);
    this.name = 'StripeSignatureError';
    this.reason = reason; // missing | malformed | mismatch | stale
  }
}

// encodeForm({ a: { b: 1 }, list: [{ price: 'x' }], expand: ['y'] }) -> 'a[b]=1&list[0][price]=x&expand[0]=y'
export function encodeForm(obj) {
  const out = new URLSearchParams();
  const walk = (prefix, v) => {
    if (v == null) return;
    if (Array.isArray(v)) v.forEach((item, i) => walk(`${prefix}[${i}]`, item));
    else if (typeof v === 'object') for (const [k, x] of Object.entries(v)) walk(prefix ? `${prefix}[${k}]` : k, x);
    else out.append(prefix, String(v));
  };
  walk('', obj);
  return out.toString();
}

// stripeSignatureHeader(secret, rawBody, t) -> 't=...,v1=...' (for tests and the local emulator)
export function stripeSignatureHeader(secret, rawBody, t = Math.floor(Date.now() / 1000)) {
  const mac = createHmac('sha256', secret).update(`${t}.`).update(Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(rawBody)).digest('hex');
  return `t=${t},v1=${mac}`;
}

// verifyStripeSignature(rawBody: Buffer|string, header, secret, { toleranceSec = 300, nowSec }) -> event
// Throws StripeSignatureError. Accepts any matching v1 (Stripe sends several during secret rolls).
export function verifyStripeSignature(rawBody, header, secret, { toleranceSec = 300, nowSec = Math.floor(Date.now() / 1000) } = {}) {
  if (!secret) throw new StripeSignatureError('no webhook secret configured');
  if (!header) throw new StripeSignatureError('missing');
  let t = null;
  const v1 = [];
  for (const part of String(header).split(',')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    const k = part.slice(0, i).trim();
    const v = part.slice(i + 1).trim();
    if (k === 't') t = Number(v);
    else if (k === 'v1') v1.push(v);
  }
  if (!Number.isInteger(t) || v1.length === 0) throw new StripeSignatureError('malformed');
  const raw = Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(String(rawBody));
  const expected = createHmac('sha256', secret).update(`${t}.`).update(raw).digest();
  const match = v1.some((sig) => {
    if (!/^[0-9a-f]{64}$/i.test(sig)) return false;
    const given = Buffer.from(sig, 'hex');
    return given.length === expected.length && timingSafeEqual(given, expected);
  });
  if (!match) throw new StripeSignatureError('mismatch');
  if (Math.abs(nowSec - t) > toleranceSec) throw new StripeSignatureError('stale');
  let event;
  try {
    event = JSON.parse(raw.toString('utf8'));
  } catch {
    throw new StripeSignatureError('malformed');
  }
  if (!event || typeof event.id !== 'string' || typeof event.type !== 'string') throw new StripeSignatureError('malformed');
  return event;
}

// Subscription fields moved in 2025-03-31.basil: the period now lives on the subscription items
// and an invoice names its subscription under parent.subscription_details. These read both shapes.
export function subscriptionPeriod(sub) {
  const item = sub?.items?.data?.[0];
  return {
    start: item?.current_period_start ?? sub?.current_period_start ?? null,
    end: item?.current_period_end ?? sub?.current_period_end ?? null,
  };
}

export function invoiceSubscriptionId(invoice) {
  const s = invoice?.parent?.subscription_details?.subscription ?? invoice?.subscription ?? null;
  return typeof s === 'object' && s ? s.id : s;
}

export function subscriptionPrice(sub) {
  const price = sub?.items?.data?.[0]?.price;
  return { id: price?.id ?? null, interval: price?.recurring?.interval ?? null, lookupKey: price?.lookup_key ?? null };
}

// createStripe({ secretKey, webhookSecret, fetch, apiVersion, baseUrl, toleranceSec })
export function createStripe({
  secretKey,
  webhookSecret,
  fetch = globalThis.fetch,
  apiVersion = STRIPE_API_VERSION,
  baseUrl = STRIPE_BASE,
  toleranceSec = 300,
} = {}) {
  async function call(method, path, params, { idempotencyKey } = {}) {
    if (!secretKey) throw new StripeError(503, { error: { message: 'STRIPE_SECRET_KEY is not configured', type: 'config' } });
    const headers = {
      authorization: `Bearer ${secretKey}`,
      'stripe-version': apiVersion,
      accept: 'application/json',
    };
    let url = `${baseUrl}${path}`;
    const init = { method, headers };
    if (params && (method === 'GET' || method === 'DELETE')) {
      const q = encodeForm(params);
      if (q) url += `?${q}`;
    } else if (params) {
      headers['content-type'] = 'application/x-www-form-urlencoded';
      init.body = encodeForm(params);
    }
    if (idempotencyKey) headers['idempotency-key'] = idempotencyKey;
    const res = await fetch(url, init);
    const text = await res.text();
    let body = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = { error: { message: text } };
    }
    if (!res.ok) throw new StripeError(res.status, body);
    return body;
  }

  return {
    apiVersion,
    call,
    // Checkout Session for a subscription. Prices are tax-inclusive EUR (Stripe Tax computes VAT).
    createCheckoutSession({ userId, email, customerId, priceId, tier, interval, locale = 'en', successUrl, cancelUrl }) {
      const params = {
        mode: 'subscription',
        client_reference_id: userId,
        line_items: [{ price: priceId, quantity: 1 }],
        automatic_tax: { enabled: true },
        tax_id_collection: { enabled: true },
        consent_collection: { terms_of_service: 'required' },
        billing_address_collection: 'required',
        payment_method_collection: 'always',
        allow_promotion_codes: false,
        locale: locale === 'sl' ? 'sl' : 'en',
        success_url: successUrl,
        cancel_url: cancelUrl,
        metadata: { user_id: userId, tier, interval },
        subscription_data: { metadata: { user_id: userId, tier, interval } },
      };
      if (customerId) {
        params.customer = customerId;
        // tax_id_collection with an existing customer needs Checkout to be allowed to update it.
        params.customer_update = { name: 'auto', address: 'auto' };
      } else if (email) {
        params.customer_email = email;
      }
      return call('POST', '/v1/checkout/sessions', params);
    },
    // Always re-fetch: events can arrive out of order. The payment method gives the card country.
    retrieveSubscription(id) {
      return call('GET', `/v1/subscriptions/${encodeURIComponent(id)}`, { expand: ['default_payment_method'] });
    },
    createPortalSession({ customerId, returnUrl, locale = 'en' }) {
      return call('POST', '/v1/billing_portal/sessions', { customer: customerId, return_url: returnUrl, locale: locale === 'sl' ? 'sl' : 'en' });
    },
    // The payments of an invoice (InvoicePayment objects); payment.payment_intent is what gets refunded.
    listInvoicePayments(invoiceId) {
      return call('GET', '/v1/invoice_payments', { invoice: invoiceId, limit: 10 });
    },
    retrieveInvoice(id) {
      return call('GET', `/v1/invoices/${encodeURIComponent(id)}`);
    },
    retrieveCharge(id) {
      return call('GET', `/v1/charges/${encodeURIComponent(id)}`);
    },
    // refund({ paymentIntent, amount?, metadata }, { idempotencyKey })
    refund({ paymentIntent, amount, metadata }, { idempotencyKey } = {}) {
      return call('POST', '/v1/refunds', { payment_intent: paymentIntent, amount, reason: 'requested_by_customer', metadata }, { idempotencyKey });
    },
    // Immediate cancellation (the withdrawal button and account deletion). No proration invoice.
    cancelSubscription(id, { idempotencyKey } = {}) {
      return call('DELETE', `/v1/subscriptions/${encodeURIComponent(id)}`, { invoice_now: false, prorate: false }, { idempotencyKey });
    },
    verifyWebhook(rawBody, header, { nowSec } = {}) {
      return verifyStripeSignature(rawBody, header, webhookSecret, { toleranceSec, nowSec });
    },
  };
}
