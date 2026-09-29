// Test harness for server tests: an app on an ephemeral port with an in-memory DB, a settable
// clock, console SMS and email transports, and the fake Stripe as the injected fetch.
import { loadConfig } from '../../server/config.js';
import { openDb } from '../../server/db.js';
import { createApp } from '../../server/index.js';
import { createConsoleSms } from '../../server/vendors/twilio.js';
import { createConsoleEmail } from '../../server/vendors/email.js';
import { createConsolePush } from '../../server/vendors/push.js';
import { createConsolePager } from '../../server/alerts.js';
import { createStripe } from '../../server/vendors/stripe.js';
import { createFakeStripe } from '../../server/dev/fake-stripe.js';
import { consentHash, consentVersion } from '../../core/consent-texts.js';
import { createLogger } from '../../server/util.js';

export const BASE = 'https://quorum.test';
export const WHSEC = 'whsec_test_secret';
export const TWILIO_TOKEN = 'test-auth-token';
export const PRICES = {
  signal: { month: 'price_signal_m', year: 'price_signal_y' },
  research: { month: 'price_research_m', year: 'price_research_y' },
};

// makeApp({ now, config, db, webRoot, anthropic, engineSource, fetch }) -> harness. The clock only
// moves when a test moves it; sleep() advances it (so paced sends take virtual time, not real time).
export async function makeApp({ now = '2026-09-28T10:00:00Z', config = {}, db, webRoot, anthropic = null, engineSource = null, fetch } = {}) {
  const clock = { t: new Date(now).getTime() };
  const clockFn = () => new Date(clock.t);
  const log = createLogger({ quiet: true });
  const cfg = loadConfig(
    {},
    {
      dbPath: ':memory:',
      publicBaseUrl: BASE,
      ipCountryHeader: 'x-test-country',
      geoRequireIp: true,
      outboxIntervalMs: 0,
      sessionSecret: 'test-session-secret',
      twilio: { authToken: TWILIO_TOKEN },
      stripe: { secretKey: 'sk_test_fake', webhookSecret: WHSEC, prices: PRICES },
      // Tests never touch the network: no anchoring calendars unless a test injects a fixture fetch.
      anchor: { otsCalendars: [], rfc3161Url: '' },
      ...config,
    },
  );
  const fake = createFakeStripe({ now: clockFn, prices: PRICES });
  const sms = createConsoleSms({ log, authToken: TWILIO_TOKEN, clock: clockFn });
  const email = createConsoleEmail({ log, clock: clockFn });
  const stripe = createStripe({ secretKey: cfg.stripe.secretKey, webhookSecret: WHSEC, fetch: fake.fetch });
  const push = createConsolePush({ log, clock: clockFn });
  const pager = createConsolePager({ log });
  const sleep = async (ms) => {
    clock.t += ms;
  };
  const noNetwork = async (url) => {
    throw new Error(`test tried to reach the network: ${url}`);
  };
  const app = createApp({
    db: db ?? openDb(':memory:'),
    config: cfg,
    transports: { sms, email, stripe, push, pager, anthropic, engineSource },
    clock: clockFn,
    log,
    webRoot,
    sleep,
    fetch: fetch ?? noNetwork,
  });
  const url = await app.listen(0, '127.0.0.1');
  return {
    app,
    ctx: app.ctx,
    db: app.ctx.db,
    url,
    fake,
    sms,
    email,
    push,
    pager,
    clock,
    advance(ms) {
      clock.t += ms;
    },
    setNow(iso) {
      clock.t = new Date(iso).getTime();
    },
    client: (opts) => makeClient(url, opts),
    close: () => app.close(),
  };
}

// A tiny HTTP client with a cookie jar. Sends x-test-country (the trusted IP-country header).
export function makeClient(url, { country = 'SI' } = {}) {
  const jar = new Map();
  async function request(method, path, { json, form, body, headers = {}, redirect = 'manual' } = {}) {
    const h = { ...headers };
    if (country && !('x-test-country' in h)) h['x-test-country'] = country;
    if (jar.size) h.cookie = [...jar].map(([k, v]) => `${k}=${v}`).join('; ');
    let payload = body;
    if (json !== undefined) {
      payload = JSON.stringify(json);
      h['content-type'] ??= 'application/json';
    } else if (form !== undefined) {
      payload = new URLSearchParams(form).toString();
      h['content-type'] ??= 'application/x-www-form-urlencoded';
    }
    const res = await fetch(url + path, { method, headers: h, body: payload, redirect });
    for (const c of res.headers.getSetCookie()) {
      const [pair, ...attrs] = c.split(';');
      const i = pair.indexOf('=');
      const k = pair.slice(0, i).trim();
      const v = pair.slice(i + 1).trim();
      if (/max-age=0/i.test(attrs.join(';')) || v === '') jar.delete(k);
      else jar.set(k, v);
    }
    const text = await res.text();
    let data = text;
    if ((res.headers.get('content-type') || '').includes('application/json') && text) data = JSON.parse(text);
    return { status: res.status, headers: res.headers, body: data, text };
  }
  return {
    jar,
    request,
    get: (p, o) => request('GET', p, o),
    post: (p, json, o = {}) => request('POST', p, { json, ...o }),
    setCountry(c) {
      country = c;
    },
  };
}

// ------------------------------------------------------------------ flows
export async function signIn(t, client, email, locale = 'en') {
  const r = await client.post('/api/auth/magic', { email, locale });
  if (r.status !== 202) throw new Error(`magic: ${r.status} ${r.text}`);
  const msg = [...t.email.outbox].reverse().find((m) => m.to === email.toLowerCase() && m.tag === 'MAGIC_LINK');
  const link = new URL(msg.link);
  const cb = await client.get(link.pathname + link.search);
  if (cb.status !== 303) throw new Error(`callback: ${cb.status}`);
  const me = await client.get('/api/me');
  return me.body.user;
}

export async function passGeo(client, country = 'SI') {
  const r = await client.post('/api/join/geo', { declaredCountry: country });
  if (r.status !== 200) throw new Error(`geo: ${r.status} ${r.text}`);
  return r.body;
}

export async function verifyPhone(t, client, e164, locale = 'en') {
  const s = await client.post('/api/phone/start', { e164, locale });
  if (s.status !== 200) throw new Error(`phone/start: ${s.status} ${s.text}`);
  const code = t.sms.lastCode(e164);
  const c = await client.post('/api/phone/check', { e164, code });
  if (c.status !== 200) throw new Error(`phone/check: ${c.status} ${c.text}`);
  return c.body;
}

export async function consentBody(kind, locale = 'en', action = 'grant') {
  return { kind, action, version: consentVersion(kind), sha256: await consentHash(kind, locale), pageUrl: `${BASE}/#join`, locale };
}

export async function grant(client, kind, locale = 'en') {
  const r = await client.post('/api/consent', await consentBody(kind, locale));
  if (r.status !== 200) throw new Error(`consent ${kind}: ${r.status} ${r.text}`);
  return r.body;
}

// deliver(t, client, event, { t: unixSeconds, secret }) -> response of POST /api/webhooks/stripe
export async function deliver(t, client, event, { ts, secret = WHSEC } = {}) {
  const d = t.fake.delivery(event, secret, ts ?? Math.floor(t.clock.t / 1000));
  return client.request('POST', '/api/webhooks/stripe', { body: d.body, headers: d.headers });
}

// checkoutAndPay(t, client, { tier, interval, cardCountry, deliverEvents }) -> { session, subscription, invoice, events }
export async function checkoutAndPay(t, client, { tier = 'signal', interval = 'month', cardCountry = 'SI', deliverEvents = true } = {}) {
  const r = await client.post('/api/checkout', { tier, interval });
  if (r.status !== 200) throw new Error(`checkout: ${r.status} ${r.text}`);
  const done = t.fake.completeCheckout(r.body.id, { cardCountry });
  if (deliverEvents) {
    const hook = t.client();
    for (const e of done.events) {
      const w = await deliver(t, hook, e);
      if (w.status !== 200) throw new Error(`webhook ${e.type}: ${w.status} ${w.text}`);
    }
  }
  return done;
}

// A user who is signed in, inside the geofence, has a verified SI phone and has accepted terms.
export async function readyUser(t, { email = 'ana@example.si', e164 = '+38641234545', locale = 'en', sms = true } = {}) {
  const client = t.client();
  const user = await signIn(t, client, email, locale);
  await passGeo(client, 'SI');
  await verifyPhone(t, client, e164, locale);
  await grant(client, 'terms', locale);
  await grant(client, 'immediate_performance', locale);
  if (sms) await grant(client, 'sms', locale);
  return { client, user };
}

export function smsTo(t, e164, kind) {
  const re = { OPT_IN: /^QUORUM: SMS (alerts ON|obvestila VKLOPLJENA)/, OPT_OUT: /^QUORUM: SMS (alerts OFF|obvestila IZKLOPLJENA)/ }[kind];
  return t.sms.outbox.filter((m) => m.to === e164 && (!kind || (re ? re.test(m.body) : m.body.includes(kind))));
}
