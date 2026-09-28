#!/usr/bin/env node
// npm run demo:day — one simulated issue day, end to end through the real HTTP server with the
// console SMS and email transports and an in-memory Stripe emulator. Nothing leaves this machine.
//
// Part 1 (subscription and SMS backbone): fictional subscribers join through the API (magic
// link, geofence, Lookup + Verify, consent, Checkout, signed webhooks incl. a duplicate and an
// out-of-order delivery), get exactly one opt-in text, delivery receipts come back signed, one
// subscriber opts out with one tap, one withdraws within 14 days.
// Part 2 plugs the issue itself in through ctx.hooks.runIssueDay (seal -> publish -> fan-out).
//
// Flags: --verbose (server logs), --json (machine-readable outbox), --date YYYY-MM-DD
import { performance } from 'node:perf_hooks';
import { createApp } from '../server/index.js';
import { loadConfig } from '../server/config.js';
import { openDb } from '../server/db.js';
import { createLogger } from '../server/util.js';
import { createConsoleSms, twilioSignature } from '../server/vendors/twilio.js';
import { createConsoleEmail } from '../server/vendors/email.js';
import { createStripe, stripeSignatureHeader } from '../server/vendors/stripe.js';
import { createFakeStripe } from '../server/dev/fake-stripe.js';
import { consentHash, consentVersion, maskPhone } from '../core/consent-texts.js';
import { analyze } from '../core/gsm7.js';
import { validateSms } from '../core/sms-templates.js';
import { issueSlot } from '../core/calendar.js';

const args = process.argv.slice(2);
const flag = (f) => args.includes(f);
const opt = (f, d) => (args.includes(f) ? args[args.indexOf(f) + 1] : d);
const DATE = opt('--date', '2026-09-28');
const t0 = performance.now();

// Fictional people only (fictional: true); example.* addresses; numbers in national test-like ranges.
const PEOPLE = [
  { name: 'Ana Kovač', email: 'ana.kovac@example.si', country: 'SI', ip: 'SI', e164: '+38641000101', locale: 'sl', tier: 'signal', interval: 'month', sms: true, fictional: true },
  { name: 'Lukas Berger', email: 'lukas.berger@example.at', country: 'AT', ip: 'AT', e164: '+436641000102', locale: 'en', tier: 'research', interval: 'year', sms: true, fictional: true },
  { name: 'Marta Horvat', email: 'marta.horvat@example.hr', country: 'HR', ip: 'HR', e164: '+385911000103', locale: 'en', tier: 'signal', interval: 'month', sms: true, fictional: true },
  { name: 'Claire Dubois', email: 'claire.dubois@example.fr', country: 'FR', ip: 'FR', e164: null, locale: 'en', tier: 'signal', interval: 'month', sms: false, fictional: true },
];
const REFUSED = [
  { name: 'Jordan Miles', email: 'jordan.miles@example.com', country: 'US', ip: 'US', why: 'excluded country', fictional: true },
  { name: 'Tine Zupan', email: 'tine.zupan@example.si', country: 'SI', ip: 'GB', why: 'IP country disagrees', fictional: true },
  { name: 'Eva Novak', email: 'eva.novak@example.si', country: 'SI', ip: 'SI', e164: '+38612000000', why: 'landline', fictional: true },
];

const slot = issueSlot(DATE);
const clock = { t: new Date(slot.publishAtUtc).getTime() - 30 * 60_000 }; // 13:30 Ljubljana on the issue day
const now = () => new Date(clock.t);
const tick = (ms = 1000) => {
  clock.t += ms;
};

const quiet = createLogger({ quiet: !flag('--verbose') });
const BASE = 'https://qrm.si';
const WHSEC = 'whsec_demo_day';
const TW_TOKEN = 'demo-day-twilio-token';
const PRICES = { signal: { month: 'price_signal_m', year: 'price_signal_y' }, research: { month: 'price_research_m', year: 'price_research_y' } };

const config = loadConfig(
  {},
  {
    dbPath: ':memory:',
    publicBaseUrl: BASE,
    ipCountryHeader: 'x-demo-country',
    geoRequireIp: true,
    trustProxy: 1, // each fictional visitor gets its own documentation-range address via X-Forwarded-For
    outboxIntervalMs: 0,
    sessionSecret: 'demo-day-session-secret',
    twilio: { authToken: TW_TOKEN },
    stripe: { secretKey: 'sk_test_demo', webhookSecret: WHSEC, prices: PRICES },
  },
);
const fake = createFakeStripe({ now, prices: PRICES });
const sms = createConsoleSms({ log: quiet, authToken: TW_TOKEN, clock: now });
const email = createConsoleEmail({ log: quiet, clock: now });
const stripe = createStripe({ secretKey: config.stripe.secretKey, webhookSecret: WHSEC, fetch: fake.fetch });
const app = createApp({ db: openDb(':memory:'), config, transports: { sms, email, stripe }, clock: now, log: quiet });
const url = await app.listen(0, '127.0.0.1');
const ctx = app.ctx;

let visitors = 0;
function client(country) {
  const jar = new Map();
  const ip = `203.0.113.${++visitors}`;
  return async function request(method, path, { json, form, body, headers = {} } = {}) {
    const h = { 'x-demo-country': country, 'x-forwarded-for': ip, ...headers };
    if (jar.size) h.cookie = [...jar].map(([k, v]) => `${k}=${v}`).join('; ');
    let payload = body;
    if (json !== undefined) {
      payload = JSON.stringify(json);
      h['content-type'] = 'application/json';
    } else if (form !== undefined) {
      payload = new URLSearchParams(form).toString();
      h['content-type'] = 'application/x-www-form-urlencoded';
    }
    const res = await fetch(url + path, { method, headers: h, body: payload, redirect: 'manual' });
    for (const c of res.headers.getSetCookie()) {
      const [pair] = c.split(';');
      const i = pair.indexOf('=');
      jar.set(pair.slice(0, i), pair.slice(i + 1));
    }
    const text = await res.text();
    const data = (res.headers.get('content-type') || '').includes('json') && text ? JSON.parse(text) : text;
    tick(1500);
    return { status: res.status, body: data };
  };
}

const log = [];
const step = (who, what, detail = '') => log.push({ at: now().toISOString(), who, what, detail });
const expect = (cond, msg) => {
  if (!cond) throw new Error(`demo-day: ${msg}`);
};

async function signIn(req, p) {
  const m = await req('POST', '/api/auth/magic', { json: { email: p.email, locale: p.locale ?? 'en' } });
  expect(m.status === 202, `magic link for ${p.name}: ${m.status} ${JSON.stringify(m.body)}`);
  const link = new URL([...email.outbox].reverse().find((m) => m.to === p.email).link);
  await req('GET', link.pathname + link.search);
}

async function consent(req, kind, locale) {
  const r = await req('POST', '/api/consent', {
    json: { kind, action: 'grant', version: consentVersion(kind), sha256: await consentHash(kind, locale), pageUrl: `${BASE}/#join`, locale },
  });
  expect(r.status === 200, `consent ${kind}: ${JSON.stringify(r.body)}`);
}

async function webhook(event, label) {
  const body = JSON.stringify(event);
  const r = await fetch(`${url}/api/webhooks/stripe`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'stripe-signature': stripeSignatureHeader(WHSEC, body, Math.floor(clock.t / 1000)) },
    body,
  });
  const j = await r.json();
  step('stripe', `${event.type}${label ? ` (${label})` : ''}`, j.duplicate ? 'duplicate, ignored' : 'processed');
  tick(700);
  return j;
}

try {
  // ---------------------------------------------------------------- subscribers join
  const sessions = {};
  const subs = {};
  for (const [i, p] of PEOPLE.entries()) {
    const req = client(p.ip);
    sessions[p.email] = req;
    await signIn(req, p);
    step(p.name, 'signed in by magic link');
    const g = await req('POST', '/api/join/geo', { json: { declaredCountry: p.country } });
    expect(g.status === 200, `geo for ${p.name}`);
    step(p.name, `geofence passed (${p.country})`, g.body.smsEligible ? 'SMS country' : 'no SMS in this country: email and push');
    if (p.e164) {
      const s = await req('POST', '/api/phone/start', { json: { e164: p.e164, locale: p.locale } });
      expect(s.status === 200, `phone/start ${p.name}: ${JSON.stringify(s.body)}`);
      const c = await req('POST', '/api/phone/check', { json: { e164: p.e164, code: sms.lastCode(p.e164) } });
      expect(c.status === 200, `phone/check ${p.name}`);
      step(p.name, `phone verified ${maskPhone(p.e164)}`, 'Lookup: mobile, low pumping risk; Verify code accepted');
    }
    await consent(req, 'terms', p.locale);
    await consent(req, 'immediate_performance', p.locale);
    if (p.sms) await consent(req, 'sms', p.locale);
    step(p.name, 'consents recorded', p.sms ? 'terms, immediate performance, SMS (hash checked)' : 'terms, immediate performance');
    const co = await req('POST', '/api/checkout', { json: { tier: p.tier, interval: p.interval } });
    expect(co.status === 200, `checkout ${p.name}: ${JSON.stringify(co.body)}`);
    const me0 = await req('GET', '/api/me');
    step(p.name, `Checkout ${p.tier}/${p.interval}`, `redirect shows "${me0.body.activation}" (no entitlement on the redirect)`);
    const done = fake.completeCheckout(co.body.id, { cardCountry: p.country });
    subs[p.email] = done;
    const byType = Object.fromEntries(done.events.map((e) => [e.type, e]));
    if (i === 1) {
      // Out of order: the payment lands before the checkout completion.
      await webhook(byType['invoice.paid'], 'arrives first');
      await webhook(byType['checkout.session.completed']);
      await webhook(byType['customer.subscription.created']);
    } else {
      for (const e of done.events) await webhook(e);
    }
    if (i === 0) await webhook(byType['invoice.paid'], 'Stripe retry of the same event');
    const me = await req('GET', '/api/me');
    step(p.name, `entitled: ${me.body.entitlements.picks.active ? 'picks' : 'none'}${me.body.entitlements.research_data.active ? ' + research data' : ''}`, `until ${me.body.entitlements.picks.until}`);
  }

  // ---------------------------------------------------------------- refusals, in plain language
  for (const p of REFUSED) {
    const req = client(p.ip);
    await signIn(req, p);
    const g = await req('POST', '/api/join/geo', { json: { declaredCountry: p.country } });
    if (g.status !== 200) {
      step(p.name, `refused at the geofence (${p.why})`, g.body.reasons.map((r) => r.en).join(' '));
      continue;
    }
    const s = await req('POST', '/api/phone/start', { json: { e164: p.e164, locale: 'en' } });
    step(p.name, `phone refused (${p.why})`, s.body.reasons.map((r) => r.en).join(' '));
  }

  // ---------------------------------------------------------------- the issue itself (part 2)
  clock.t = new Date(slot.publishAtUtc).getTime();
  if (typeof ctx.hooks.runIssueDay === 'function') {
    const r = await ctx.hooks.runIssueDay({ date: DATE, now });
    step('publisher', `issue ${DATE} run by part 2`, JSON.stringify(r ?? {}));
  } else {
    step('publisher', `issue ${DATE} 14:00 ${slot.tzLabel}`, 'seal -> publish -> fan-out is part 2 (ctx.hooks.runIssueDay not registered yet)');
  }

  // ---------------------------------------------------------------- delivery receipts (signed)
  const statusUrl = `${BASE}/api/webhooks/twilio/status`;
  for (const m of sms.outbox) {
    for (const status of ['sent', 'delivered']) {
      const params = { MessageSid: m.sid, MessageStatus: status, To: m.to, From: 'QUORUM', AccountSid: 'ACdemo', ApiVersion: '2010-04-01' };
      const r = await fetch(`${url}/api/webhooks/twilio/status`, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded', 'x-twilio-signature': twilioSignature(TW_TOKEN, statusUrl, params) },
        body: new URLSearchParams(params).toString(),
      });
      expect(r.status === 204, `status callback ${r.status}`);
      tick(400);
    }
  }
  step('twilio', `${sms.outbox.length * 2} delivery receipts`, 'signature valid, stored append-only with the number hashed');

  // ---------------------------------------------------------------- one-tap opt-out
  const ana = PEOPLE[0];
  const anaId = ctx.db.get('SELECT id FROM users WHERE email = ?', ana.email).id;
  const token = ctx.db.get('SELECT token FROM unsubscribe_tokens WHERE user_id = ?', anaId).token;
  const tap = client('SI');
  const page = await tap('GET', `/u/${token}`);
  step(ana.name, `opens qrm.si/u/${token}`, `confirmation page (${page.status}), nothing changed yet`);
  await tap('POST', `/u/${token}`, { form: {} });
  await tap('POST', `/u/${token}`, { form: {} });
  step(ana.name, 'taps Stop twice', 'opted out of all SMS; one confirmation text; subscription unchanged');

  // ---------------------------------------------------------------- withdrawal within 14 days
  clock.t += 3 * 86_400_000;
  const marta = PEOPLE[2];
  const w = await sessions[marta.email]('POST', '/api/withdraw', { json: {} });
  expect(w.status === 200, `withdraw: ${JSON.stringify(w.body)}`);
  step(marta.name, 'withdrawal button (day 3)', `refund ${(w.body.withdrawal.amount / 100).toFixed(2)} ${w.body.withdrawal.currency.toUpperCase()} (${w.body.withdrawal.refundId}), subscription cancelled, access ended`);
  await webhook(fake.event('customer.subscription.deleted', fake.subscription(subs[marta.email].subscription.id)));

  // ---------------------------------------------------------------- report
  const texts = sms.outbox.map((m) => {
    const a = analyze(m.body);
    const v = validateSms(m.body);
    return { sid: m.sid, to: maskPhone(m.to), at: m.at, encoding: a.encoding, septets: a.septets, segments: a.segments, valid: v.ok, body: m.body };
  });
  const emails = email.outbox.filter((m) => m.tag !== 'MAGIC_LINK').map((m) => ({ id: m.id, to: m.to, tag: m.tag, subject: m.subject }));
  const counts = Object.fromEntries(
    ['processed_events', 'consent_events', 'opt_outs', 'delivery_events', 'withdrawals', 'geo_checks'].map((tb) => [tb, ctx.db.get(`SELECT COUNT(*) AS n FROM ${tb}`).n]),
  );
  const byStatus = ctx.db.all('SELECT channel, kind, status, COUNT(*) AS n FROM notifications GROUP BY channel, kind, status ORDER BY channel, kind');
  const optIns = texts.filter((x) => /SMS (alerts ON|obvestila VKLOPLJENA)/.test(x.body)).length;
  const optOuts = texts.filter((x) => /SMS (alerts OFF|obvestila IZKLOPLJENA)/.test(x.body)).length;
  expect(optIns === 3, `expected 3 opt-in texts, got ${optIns}`);
  expect(optOuts === 1, `expected 1 opt-out confirmation, got ${optOuts}`);
  expect(texts.every((x) => x.valid && x.segments === 1), 'every text is one valid GSM-7 segment');
  const elapsedMs = Math.round(performance.now() - t0);

  if (flag('--json')) {
    console.log(JSON.stringify({ date: DATE, simulated: true, steps: log, sms: texts, emails, counts, notifications: byStatus, elapsedMs }, null, 2));
  } else {
    const out = [];
    out.push(`Quorum demo day ${DATE} (simulated; fictional people; nothing is sent)`);
    out.push('');
    for (const s of log) out.push(`${s.at.slice(11, 19)}Z  ${s.who.padEnd(14)} ${s.what}${s.detail ? `\n                          ${s.detail}` : ''}`);
    out.push('');
    out.push(`SMS outbox (${texts.length})`);
    for (const x of texts) out.push(`  ${x.sid}  ${x.to}  ${x.encoding} ${x.septets}/160, ${x.segments} segment${x.valid ? '' : '  INVALID'}\n    ${x.body}`);
    out.push('');
    out.push(`Email outbox (${emails.length}, sign-in links not shown)`);
    for (const e of emails) out.push(`  ${e.id}  ${e.to.padEnd(26)} ${e.tag.padEnd(12)} ${e.subject}`);
    out.push('');
    out.push(`Rows: ${Object.entries(counts).map(([k, v]) => `${k} ${v}`).join(', ')}`);
    out.push(`Notifications: ${byStatus.map((r) => `${r.channel}/${r.kind}/${r.status} ${r.n}`).join(', ')}`);
    out.push(`Done in ${elapsedMs} ms.`);
    console.log(out.join('\n'));
  }
} finally {
  await app.close();
}
