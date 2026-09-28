// An in-memory Stripe REST emulator exposed as a `fetch` function, for tests and
// scripts/demo-day.js. It implements only the calls server/vendors/stripe.js makes, in the
// 2026-08-26.dahlia shapes (period on subscription items; invoice.parent.subscription_details;
// invoice payments). Never used in production.
import { stripeSignatureHeader } from '../vendors/stripe.js';

// decodeForm('a[b]=1&list[0][price]=x') -> { a: { b: '1' }, list: [{ price: 'x' }] }
export function decodeForm(text) {
  const out = {};
  for (const [key, value] of new URLSearchParams(text)) {
    const path = key.replace(/\]/g, '').split('[');
    let o = out;
    for (let i = 0; i < path.length; i++) {
      const k = path[i];
      const last = i === path.length - 1;
      const nextIsIndex = !last && /^\d+$/.test(path[i + 1]);
      if (last) o[k] = value;
      else {
        if (o[k] == null) o[k] = nextIsIndex ? [] : {};
        o = o[k];
      }
    }
  }
  return out;
}

const PERIOD_DAYS = { month: 30, year: 365 };

export function createFakeStripe({ now = () => new Date(), prices = {}, apiVersion = '2026-08-26.dahlia' } = {}) {
  const store = { sessions: {}, customers: {}, subscriptions: {}, invoices: {}, invoicePayments: {}, paymentIntents: {}, charges: {}, refunds: {}, events: [] };
  const requests = [];
  const seq = { n: 0 };
  const id = (p) => `${p}_fake${String(++seq.n).padStart(6, '0')}`;
  const unix = () => Math.floor(now().getTime() / 1000);
  const fail = { next: null }; // failNext(path, status) makes the next matching call fail

  function priceInfo(priceId) {
    for (const [tier, byInterval] of Object.entries(prices)) {
      for (const [interval, pid] of Object.entries(byInterval || {})) if (pid === priceId) return { tier, interval };
    }
    return { tier: 'signal', interval: /_y|year/i.test(priceId) ? 'year' : 'month' };
  }

  function json(status, body) {
    return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  }
  function notFound(what) {
    return json(404, { error: { type: 'invalid_request_error', code: 'resource_missing', message: `No such ${what}` } });
  }

  function withPaymentMethod(sub) {
    const c = store.customers[sub.customer];
    const country = c?.cardCountry ?? 'SI';
    return {
      ...sub,
      default_payment_method: {
        id: c?.pm ?? 'pm_fake',
        object: 'payment_method',
        type: 'card',
        card: { brand: 'visa', country, last4: '4242' },
        billing_details: { address: { country: c?.billingCountry ?? country } },
      },
    };
  }

  function makeInvoice(sub, { paid = true, billingReason = 'subscription_cycle', amount } = {}) {
    const inv = {
      id: id('in'),
      object: 'invoice',
      customer: sub.customer,
      amount_due: amount ?? sub._amount,
      amount_paid: paid ? amount ?? sub._amount : 0,
      currency: 'eur',
      status: paid ? 'paid' : 'open',
      billing_reason: billingReason,
      attempt_count: paid ? 1 : 1,
      hosted_invoice_url: `https://invoice.stripe.test/i/${seq.n}`,
      parent: { type: 'subscription_details', subscription_details: { subscription: sub.id, metadata: sub.metadata } },
      status_transitions: { paid_at: paid ? unix() : null },
      created: unix(),
    };
    store.invoices[inv.id] = inv;
    if (paid) {
      const pi = { id: id('pi'), object: 'payment_intent', amount: inv.amount_paid, currency: 'eur', customer: sub.customer, status: 'succeeded', latest_charge: null };
      const ch = { id: id('ch'), object: 'charge', amount: inv.amount_paid, customer: sub.customer, payment_intent: pi.id, refunded: false, amount_refunded: 0 };
      pi.latest_charge = ch.id;
      store.paymentIntents[pi.id] = pi;
      store.charges[ch.id] = ch;
      const ip = { id: id('inpay'), object: 'invoice_payment', invoice: inv.id, amount_paid: inv.amount_paid, status: 'paid', is_default: true, payment: { type: 'payment_intent', payment_intent: pi.id } };
      store.invoicePayments[ip.id] = ip;
      inv._charge = ch.id;
    }
    sub.latest_invoice = inv.id;
    return inv;
  }

  function event(type, object, { created = unix() } = {}) {
    const e = { id: id('evt'), object: 'event', api_version: apiVersion, type, created, livemode: false, data: { object: JSON.parse(JSON.stringify(object)) } };
    store.events.push(e);
    return e;
  }

  async function fetch(url, init = {}) {
    const u = new URL(url);
    const method = (init.method || 'GET').toUpperCase();
    const headers = Object.fromEntries(Object.entries(init.headers || {}).map(([k, v]) => [k.toLowerCase(), v]));
    const params = method === 'GET' || method === 'DELETE' ? decodeForm(u.search.slice(1)) : decodeForm(init.body || '');
    requests.push({ method, path: u.pathname, params, headers, body: init.body ?? null });
    if (!/^Bearer sk_/.test(headers.authorization || '')) return json(401, { error: { type: 'authentication_error', message: 'Invalid API key' } });
    if (headers['stripe-version'] !== apiVersion) return json(400, { error: { type: 'invalid_request_error', message: `unexpected Stripe-Version ${headers['stripe-version']}` } });
    if (fail.next && u.pathname.startsWith(fail.next.path)) {
      const f = fail.next;
      fail.next = null;
      return json(f.status, { error: { type: 'api_error', message: 'injected failure' } });
    }
    const p = u.pathname;
    let m;
    if (method === 'POST' && p === '/v1/checkout/sessions') {
      const s = {
        id: id('cs'),
        object: 'checkout.session',
        mode: params.mode,
        url: null,
        client_reference_id: params.client_reference_id ?? null,
        customer: params.customer ?? null,
        customer_email: params.customer_email ?? null,
        metadata: params.metadata ?? {},
        subscription: null,
        status: 'open',
        payment_status: 'unpaid',
        _params: params,
      };
      s.url = `https://checkout.stripe.test/c/pay/${s.id}`;
      store.sessions[s.id] = s;
      return json(200, s);
    }
    if (method === 'GET' && (m = /^\/v1\/subscriptions\/([^/]+)$/.exec(p))) {
      const sub = store.subscriptions[m[1]];
      if (!sub) return notFound('subscription');
      const expand = [].concat(params.expand ?? []);
      return json(200, expand.includes('default_payment_method') ? withPaymentMethod(publicSub(sub)) : publicSub(sub));
    }
    if (method === 'DELETE' && (m = /^\/v1\/subscriptions\/([^/]+)$/.exec(p))) {
      const sub = store.subscriptions[m[1]];
      if (!sub) return notFound('subscription');
      if (sub.status !== 'canceled') {
        sub.status = 'canceled';
        sub.canceled_at = unix();
        sub.ended_at = unix();
      }
      return json(200, publicSub(sub));
    }
    if (method === 'POST' && p === '/v1/billing_portal/sessions') {
      if (!store.customers[params.customer]) return notFound('customer');
      return json(200, { id: id('bps'), object: 'billing_portal.session', url: `https://billing.stripe.test/p/session/${seq.n}`, customer: params.customer, return_url: params.return_url });
    }
    if (method === 'GET' && p === '/v1/invoice_payments') {
      const data = Object.values(store.invoicePayments).filter((x) => x.invoice === params.invoice);
      return json(200, { object: 'list', data, has_more: false });
    }
    if (method === 'GET' && (m = /^\/v1\/invoices\/([^/]+)$/.exec(p))) {
      const inv = store.invoices[m[1]];
      return inv ? json(200, inv) : notFound('invoice');
    }
    if (method === 'GET' && (m = /^\/v1\/charges\/([^/]+)$/.exec(p))) {
      const ch = store.charges[m[1]];
      return ch ? json(200, ch) : notFound('charge');
    }
    if (method === 'POST' && p === '/v1/refunds') {
      const key = headers['idempotency-key'];
      const prior = key && Object.values(store.refunds).find((r) => r._key === key);
      if (prior) return json(200, prior);
      const pi = store.paymentIntents[params.payment_intent];
      if (!pi) return notFound('payment_intent');
      const amount = params.amount != null ? Number(params.amount) : pi.amount;
      const ch = store.charges[pi.latest_charge];
      if (ch.amount_refunded + amount > ch.amount) return json(400, { error: { type: 'invalid_request_error', code: 'charge_already_refunded', message: 'Charge already refunded' } });
      ch.amount_refunded += amount;
      ch.refunded = ch.amount_refunded === ch.amount;
      const r = { id: id('re'), object: 'refund', amount, currency: 'eur', payment_intent: pi.id, status: 'succeeded', reason: params.reason ?? null, metadata: params.metadata ?? {}, _key: key };
      store.refunds[r.id] = r;
      return json(200, r);
    }
    return json(404, { error: { type: 'invalid_request_error', message: `fake-stripe: unhandled ${method} ${p}` } });
  }

  function publicSub(sub) {
    const { _amount, ...rest } = sub;
    return JSON.parse(JSON.stringify(rest));
  }

  function setPeriod(sub, startSec, interval) {
    const end = startSec + PERIOD_DAYS[interval] * 86400;
    sub.items.data[0].current_period_start = startSec;
    sub.items.data[0].current_period_end = end;
  }

  // completeCheckout(sessionId, { cardCountry, billingCountry, amount }) -> { session, subscription, invoice, events }
  // Simulates the customer paying: customer, active subscription, paid first invoice, and the
  // events Stripe would send (in Stripe's usual order; callers may deliver them in any order).
  function completeCheckout(sessionId, { cardCountry = 'SI', billingCountry = null, amount = null } = {}) {
    const s = store.sessions[sessionId];
    if (!s) throw new Error(`fake-stripe: no session ${sessionId}`);
    const priceId = s._params.line_items?.[0]?.price;
    const info = priceInfo(priceId);
    let cust = s.customer && store.customers[s.customer];
    if (!cust) {
      cust = { id: id('cus'), object: 'customer', email: s.customer_email, cardCountry, billingCountry: billingCountry ?? cardCountry, pm: id('pm') };
      store.customers[cust.id] = cust;
    } else {
      cust.cardCountry = cardCountry;
      cust.billingCountry = billingCountry ?? cardCountry;
    }
    const cents = amount ?? (info.tier === 'research' ? (info.interval === 'year' ? 39000 : 3900) : info.interval === 'year' ? 19000 : 1900);
    const sub = {
      id: id('sub'),
      object: 'subscription',
      customer: cust.id,
      status: 'active',
      cancel_at_period_end: false,
      canceled_at: null,
      ended_at: null,
      metadata: s._params.subscription_data?.metadata ?? {},
      items: { object: 'list', data: [{ id: id('si'), object: 'subscription_item', price: { id: priceId, recurring: { interval: info.interval } } }] },
      latest_invoice: null,
      created: unix(),
      _amount: cents,
    };
    setPeriod(sub, unix(), info.interval);
    store.subscriptions[sub.id] = sub;
    const inv = makeInvoice(sub, { billingReason: 'subscription_create' });
    s.status = 'complete';
    s.payment_status = 'paid';
    s.customer = cust.id;
    s.subscription = sub.id;
    const events = [event('customer.subscription.created', publicSub(sub)), event('invoice.paid', inv), event('checkout.session.completed', s)];
    return { session: s, subscription: publicSub(sub), invoice: inv, events };
  }

  // renew(subId) -> { invoice, events }: a new period, paid.
  function renew(subId) {
    const sub = store.subscriptions[subId];
    const interval = sub.items.data[0].price.recurring.interval;
    setPeriod(sub, sub.items.data[0].current_period_end, interval);
    sub.status = 'active';
    const inv = makeInvoice(sub);
    return { invoice: inv, events: [event('invoice.paid', inv), event('customer.subscription.updated', publicSub(sub))] };
  }

  // failRenewal(subId) -> { invoice, events }: the period advances, the invoice fails, past_due.
  function failRenewal(subId) {
    const sub = store.subscriptions[subId];
    const interval = sub.items.data[0].price.recurring.interval;
    setPeriod(sub, sub.items.data[0].current_period_end, interval);
    sub.status = 'past_due';
    const inv = makeInvoice(sub, { paid: false });
    return { invoice: inv, events: [event('invoice.payment_failed', inv), event('customer.subscription.updated', publicSub(sub))] };
  }

  function update(subId, patch) {
    Object.assign(store.subscriptions[subId], patch);
    return event('customer.subscription.updated', publicSub(store.subscriptions[subId]));
  }

  function cancelNow(subId) {
    const sub = store.subscriptions[subId];
    sub.status = 'canceled';
    sub.canceled_at = unix();
    sub.ended_at = unix();
    return event('customer.subscription.deleted', publicSub(sub));
  }

  function dispute(subId) {
    const sub = store.subscriptions[subId];
    const inv = store.invoices[sub.latest_invoice];
    const d = { id: id('dp'), object: 'dispute', charge: inv._charge, amount: inv.amount_paid, reason: 'fraudulent', status: 'needs_response' };
    return event('charge.dispute.created', d);
  }

  // delivery(event, secret, t?) -> { body, headers } exactly as Stripe would POST it
  function delivery(e, secret, t = unix()) {
    const body = JSON.stringify(e);
    return { body, headers: { 'content-type': 'application/json; charset=utf-8', 'stripe-signature': stripeSignatureHeader(secret, body, t) } };
  }

  return {
    fetch,
    store,
    requests,
    completeCheckout,
    renew,
    failRenewal,
    update,
    cancelNow,
    dispute,
    event,
    delivery,
    failNext: (path, status = 500) => {
      fail.next = { path, status };
    },
    subscription: (subId) => publicSub(store.subscriptions[subId]),
  };
}
