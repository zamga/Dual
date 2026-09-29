#!/usr/bin/env node
// npm run demo:day — one complete issue day, end to end, through the real server modules: the HTTP
// API, the publisher, the explainer (with a fake Claude client), the approver console API, the
// scheduler slots, the paced notifier, signed Twilio status callbacks, the one-tap opt-out and the
// daily Merkle anchor. Console SMS, push and email transports and an in-memory Stripe emulator:
// nothing leaves this machine.
//
// The day is a replay of one issue of the engine's sealed record (by default the first day with two
// BUY candidates and an exit, else two BUY candidates and a RENEW or an exit, so one BUY can be vetoed
// and each SMS subscriber still gets two texts). The ledger before that day is imported from
// web/data/ledger.json, so the day's entries continue the real chain, and any exits reveal picks
// whose commits were sealed 21 trading days earlier. Everything is simulated: fictional companies,
// fictional people (fictional: true).
//
// Flags: --verbose (server logs), --json (machine-readable result), --date YYYY-MM-DD (another day of
// the sealed record that has candidates)
import { readFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { createApp } from '../server/index.js';
import { loadConfig } from '../server/config.js';
import { openDb } from '../server/db.js';
import { createLogger } from '../server/util.js';
import { createConsoleSms, twilioSignature } from '../server/vendors/twilio.js';
import { createConsoleEmail } from '../server/vendors/email.js';
import { createConsolePush, generateVapidKeys } from '../server/vendors/push.js';
import { createConsolePager } from '../server/alerts.js';
import { createStripe, stripeSignatureHeader } from '../server/vendors/stripe.js';
import { createFakeStripe } from '../server/dev/fake-stripe.js';
import { adaptEngineDay } from '../server/publisher.js';
import { consentHash, consentVersion, maskPhone } from '../core/consent-texts.js';
import { analyze } from '../core/gsm7.js';
import { validateSms } from '../core/sms-templates.js';
import { issueSlot, prevTradingDay, formatInZone, zonedToInstant, LJUBLJANA } from '../core/calendar.js';
import { verifyChain } from '../core/ledger.js';

const args = process.argv.slice(2);
const flag = (f) => args.includes(f);
const opt = (f, d) => (args.includes(f) ? args[args.indexOf(f) + 1] : d);
const DATE_ARG = opt('--date', null);
const t0 = performance.now();
const DATA = new URL('../web/data/', import.meta.url);
const load = (name) => JSON.parse(readFileSync(new URL(`${name}.json`, DATA), 'utf8'));

// ---------------------------------------------------------------- the engine's output for the day
const meta = load('meta');
const issues = load('issues');
const picks = load('picks');
const ledger = load('ledger');
// Default: the first day with two new picks and an exit; else two new picks and a RENEW (one pick is
// vetoed and every SMS subscriber still gets two texts); else a new pick and an exit; else a new pick.
const suits = (x) => x.buys.length >= 2 && x.closes.length >= 1;
const almost = (x) => x.buys.length >= 2 && x.closes.length + (x.renews?.length ?? 0) >= 1;
const issue = DATE_ARG
  ? issues.find((x) => x.date === DATE_ARG)
  : issues.find(suits) ?? issues.find(almost) ?? issues.find((x) => x.buys.length >= 1 && x.closes.length >= 1) ?? issues.find((x) => x.buys.length >= 1);
if (!issue) throw new Error(`demo-day: ${DATE_ARG} is not an issue of the sealed record`);
const DATE = issue.date;
// Fictional headlines for the 48-hour news scan (the engine's news stand-in has no text of its own).
const news = {};
for (const no of issue.buys) {
  const p = picks.find((x) => x.no === no);
  news[p.ticker] = [
    { id: 'n1', at: `${prevTradingDay(DATE)}T21:05:00Z`, source: 'Simulated Wire', headline: `${p.name} schedules its quarterly results call (fictional company)` },
    { id: 'n2', at: `${prevTradingDay(DATE)}T13:40:00Z`, source: 'Simulated Wire', headline: `${p.name} opens a distribution centre (fictional company)` },
  ];
}
const input = adaptEngineDay({ issue, picks, persons: meta.persons, news, modelVersion: meta.modelVersion, topPct: meta.rule?.topPct ?? 0.95 });
// The approver removes the last BUY candidate, but never the only one (the day must still issue a pick).
const buyCandidates = input.candidates.filter((c) => c.status === 'candidate' && c.kind === 'BUY');
const toVeto = buyCandidates.length >= 2 ? buyCandidates.at(-1) : null;

// ---------------------------------------------------------------- fake Claude client
// Returns the engine's template thesis; the first draft for the first candidate quotes a number that
// is not in the data, so the validator rejects it and the one regeneration passes.
const byKey = new Map(picks.map((p) => [`${p.ticker}|${p.issueDate}`, p]));
let calls = 0;
const firstTicker = input.candidates.find((c) => c.status === 'candidate')?.ticker;
const drafts = new Map();
const fakeClaude = {
  beta: {
    messages: {
      parse: async (params) => {
        calls++;
        const data = JSON.parse(params.messages[0].content);
        let out;
        if (Array.isArray(data.items)) {
          out = { material_negative: false, category: 'none', item_ids: [], reason: 'The items are routine company announcements; nothing material and negative.' };
        } else {
          const p = byKey.get(`${data.ticker}|${data.issueDate}`);
          const n = (drafts.get(data.ticker) ?? 0) + 1;
          drafts.set(data.ticker, n);
          out = { en: p.thesis.en, sl: p.thesis.sl };
          if (data.ticker === firstTicker && n === 1) out = { en: `${p.thesis.en} Shares rose 12.5% last quarter.`, sl: p.thesis.sl };
        }
        return { stop_reason: 'end_turn', stop_details: null, content: [{ type: 'text', text: JSON.stringify(out) }], parsed_output: out };
      },
    },
  },
};

// ---------------------------------------------------------------- the app, on a fake clock
const slot = issueSlot(DATE);
const eve = prevTradingDay(DATE);
const clock = { t: zonedToInstant(eve, '19:00', LJUBLJANA).getTime() };
const now = () => new Date(clock.t);
const tick = (ms = 1000) => {
  clock.t += ms;
};
const setLocal = (date, time) => {
  clock.t = Math.max(clock.t, zonedToInstant(date, time, LJUBLJANA).getTime());
};
const local = (d = now()) => formatInZone(d, LJUBLJANA);

const quiet = createLogger({ quiet: !flag('--verbose') });
const BASE = 'https://qrm.si';
const WHSEC = 'whsec_demo_day';
const TW_TOKEN = 'demo-day-twilio-token';
const ADMIN = 'demo-admin-token';
const PRICES = { signal: { month: 'price_signal_m', year: 'price_signal_y' }, research: { month: 'price_research_m', year: 'price_research_y' } };
const vapid = generateVapidKeys();
const config = loadConfig(
  {},
  {
    dbPath: ':memory:',
    publicBaseUrl: BASE,
    ipCountryHeader: 'x-demo-country',
    geoRequireIp: true,
    trustProxy: 1,
    outboxIntervalMs: 0,
    sessionSecret: 'demo-day-session-secret',
    adminToken: ADMIN,
    anthropicApiKey: 'demo-key-not-used',
    explainerModel: 'demo-fake-client',
    twilio: { authToken: TW_TOKEN },
    stripe: { secretKey: 'sk_test_demo', webhookSecret: WHSEC, prices: PRICES },
    vapid: { publicKey: vapid.publicKey, privateKey: vapid.privateKey, subject: 'mailto:ops@qrm.si' },
    fanout: { smsPerSecond: 2 }, // slow on purpose, so the pacing shows in the timeline
    // A handful of texts: one 30007 is enough to show the automatic pause (production needs at least
    // 5 distinct filtered texts, SPIKE_30007_MIN, and more than 2% of the texts sent in 10 minutes).
    receipts: { spikeMinErrors: 1 },
    anchor: { otsCalendars: [], rfc3161Url: '' }, // offline: the Merkle root is computed and stored, not submitted
  },
);
const fake = createFakeStripe({ now, prices: PRICES });
const sms = createConsoleSms({ log: quiet, authToken: TW_TOKEN, clock: now });
const email = createConsoleEmail({ log: quiet, clock: now, max: 2000 });
const push = createConsolePush({ log: quiet, clock: now, publicKey: vapid.publicKey });
const pager = createConsolePager({ log: quiet });
const stripe = createStripe({ secretKey: config.stripe.secretKey, webhookSecret: WHSEC, fetch: fake.fetch });
const engineSource = { getDay: async (d) => (d === DATE ? input : null), getMarketData: async (d) => (d === DATE ? input.marketData : null) };
const app = createApp({
  db: openDb(':memory:'),
  config,
  transports: { sms, email, stripe, push, pager, anthropic: fakeClaude, engineSource },
  clock: now,
  log: quiet,
  sleep: async (ms) => tick(ms),
  fetch: async (u) => {
    throw new Error(`demo-day never calls the network (${u})`);
  },
});
const url = await app.listen(0, '127.0.0.1');
const ctx = app.ctx;

// ---------------------------------------------------------------- helpers
const log = [];
const step = (who, what, detail = '', at = now()) => log.push({ at: at.toISOString(), local: local(at).time, date: local(at).date, who, what, detail });
const expect = (cond, msg) => {
  if (!cond) throw new Error(`demo-day: ${msg}`);
};
let visitors = 0;
function client(country) {
  const jar = new Map();
  const ip = `203.0.113.${++visitors}`;
  return async function request(method, path, { json, form, headers = {} } = {}) {
    const h = { 'x-demo-country': country, 'x-forwarded-for': ip, ...headers };
    if (jar.size) h.cookie = [...jar].map(([k, v]) => `${k}=${v}`).join('; ');
    let payload;
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
const admin = async (method, path, json) => {
  const res = await fetch(url + path, { method, headers: { authorization: `Bearer ${ADMIN}`, ...(json ? { 'content-type': 'application/json' } : {}) }, body: json ? JSON.stringify(json) : undefined });
  tick(2000);
  return { status: res.status, body: await res.json() };
};
async function signIn(req, p) {
  const m = await req('POST', '/api/auth/magic', { json: { email: p.email, locale: p.locale ?? 'en' } });
  expect(m.status === 202, `magic link for ${p.name}: ${m.status}`);
  const link = new URL([...email.outbox].reverse().find((x) => x.to === p.email).link);
  await req('GET', link.pathname + link.search);
}
async function consent(req, kind, locale) {
  const r = await req('POST', '/api/consent', { json: { kind, action: 'grant', version: consentVersion(kind), sha256: await consentHash(kind, locale), pageUrl: `${BASE}/#join`, locale } });
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
  if (label) step('stripe', `${event.type} (${label})`, j.duplicate ? 'duplicate, ignored' : 'processed');
  tick(700);
  return j;
}
const statusUrl = `${BASE}/api/webhooks/twilio/status`;
async function receipt(m, status, errorCode = null) {
  const params = { MessageSid: m.sid, MessageStatus: status, To: m.to, From: 'QUORUM', AccountSid: 'ACdemo', ApiVersion: '2010-04-01' };
  if (errorCode) params.ErrorCode = errorCode;
  const r = await fetch(statusUrl.replace(BASE, url), {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', 'x-twilio-signature': twilioSignature(TW_TOKEN, statusUrl, params) },
    body: new URLSearchParams(params).toString(),
  });
  expect(r.status === 204, `status callback ${r.status}`);
  tick(300);
}
// Runs the scheduler at a slot time and logs each slot at the time it started, with what it did.
async function runSlot(time, label) {
  const [hh, mm] = time.split(':');
  setLocal(DATE, `${hh}:${mm}:00`);
  const started = now();
  const done = await ctx.scheduler.tick(started);
  for (const d of done) {
    const row = ctx.db.get('SELECT detail FROM scheduler_runs WHERE issue_date = ? AND slot = ?', d.date, d.slot);
    step('scheduler', `${d.slot}: ${d.status}`, [label, describe(d.slot, row?.detail)].filter(Boolean).join('\n' + ' '.repeat(42)), started);
  }
  return done;
}
function describe(slotName, detail) {
  let j;
  try {
    j = JSON.parse(detail);
  } catch {
    return detail;
  }
  if (slotName === 'candidates') return `${j.written} candidates written (${Object.entries(j.statuses).map(([k, v]) => `${k} ${v}`).join(', ')}); access logged`;
  if (slotName === 'explain') return `${j.scanned} news scans (${j.flagged} flagged, ${j.needsReview ?? 0} left for the approver to read), ${j.drafted} theses drafted, ${j.handoff} handed to the approver`;
  if (slotName === 'review') return `signed off by ${j.approver ?? 'nobody'}; unissued (no approver) ${j.noApprover}; removed with the news unread ${j.newsUnreviewed ?? 0}; removed for lack of a thesis ${j.noThesis}`;
  if (slotName === 'seal') return j.sealed.map((x) => `${x.kind} #${x.no} seq ${x.seq} commit ${x.commit.slice(0, 12)}… produced ${x.producedAt}`).join('; ') || 'nothing to seal';
  if (slotName === 'publish') return `ISSUE #${j.issueNo}: ${j.items} items; SMS ${JSON.stringify(j.delivery?.sms ?? {})}`;
  if (slotName === 'marks') return [`${j.entries} entry price(s)`, ...j.closes.map((c) => `CLOSE #${c.no} ${c.written ? `written (excess ${(c.excess * 100).toFixed(2)}%)` : c.reason}`)].join('; ');
  return '';
}

// Fictional subscribers (fictional: true). Numbers are in national test-like ranges.
const PEOPLE = [
  { key: 'ana', name: 'Ana Kovač', email: 'ana.kovac@example.si', country: 'SI', e164: '+38641000101', locale: 'sl', tier: 'signal', interval: 'month', sms: true, pushDevice: true, fictional: true },
  { key: 'lukas', name: 'Lukas Berger', email: 'lukas.berger@example.at', country: 'AT', e164: '+436641000102', locale: 'en', tier: 'research', interval: 'year', sms: true, pushDevice: true, fictional: true },
  { key: 'marta', name: 'Marta Horvat', email: 'marta.horvat@example.hr', country: 'HR', e164: '+385911000103', locale: 'en', tier: 'signal', interval: 'month', sms: true, fictional: true },
  { key: 'claire', name: 'Claire Dubois', email: 'claire.dubois@example.fr', country: 'FR', e164: null, locale: 'en', tier: 'signal', interval: 'month', sms: false, pushDevice: true, fictional: true },
  { key: 'jonas', name: 'Jonas Weber', email: 'jonas.weber@example.de', country: 'DE', e164: '+4915100000104', locale: 'en', tier: 'signal', interval: 'month', sms: true, optOutBefore: true, fictional: true },
  { key: 'petra', name: 'Petra Zupančič', email: 'petra.zupancic@example.si', country: 'SI', e164: '+38631000105', locale: 'sl', tier: 'signal', interval: 'month', sms: false, unverified: true, fictional: true },
  { key: 'matteo', name: 'Matteo Rossi', email: 'matteo.rossi@example.it', country: 'IT', e164: '+393401000106', locale: 'en', tier: 'signal', interval: 'month', sms: true, timeZone: 'Asia/Tokyo', fictional: true },
];
const REFUSED = [{ name: 'Sara Kranjc', email: 'sara.kranjc@example.si', country: 'SI', e164: '+12025550143', why: 'US number', fictional: true }];
const ids = {};

try {
  // ============================================================ the evening before: subscribers join
  await ctx.publisher.importLedger(ledger.entries.filter((e) => e.issueDate < DATE));
  step('ledger', `sealed record imported up to ${eve}`, `${ledger.entries.filter((e) => e.issueDate < DATE).length} entries, chain verified; today continues it`);
  const sessions = {};
  for (const [i, p] of PEOPLE.entries()) {
    const req = client(p.country);
    sessions[p.key] = req;
    await signIn(req, p);
    const g = await req('POST', '/api/join/geo', { json: { declaredCountry: p.country } });
    expect(g.status === 200, `geo for ${p.name}`);
    if (p.e164) {
      const s = await req('POST', '/api/phone/start', { json: { e164: p.e164, locale: p.locale } });
      expect(s.status === 200, `phone/start ${p.name}: ${JSON.stringify(s.body)}`);
      if (!p.unverified) {
        const c = await req('POST', '/api/phone/check', { json: { e164: p.e164, code: sms.lastCode(p.e164) } });
        expect(c.status === 200, `phone/check ${p.name}`);
      }
    }
    await consent(req, 'terms', p.locale);
    await consent(req, 'immediate_performance', p.locale);
    if (p.sms) await consent(req, 'sms', p.locale);
    const co = await req('POST', '/api/checkout', { json: { tier: p.tier, interval: p.interval } });
    expect(co.status === 200, `checkout ${p.name}: ${JSON.stringify(co.body)}`);
    const done = fake.completeCheckout(co.body.id, { cardCountry: p.country });
    const byType = Object.fromEntries(done.events.map((e) => [e.type, e]));
    if (i === 1) {
      await webhook(byType['invoice.paid'], 'arrives before the checkout completion');
      await webhook(byType['checkout.session.completed']);
      await webhook(byType['customer.subscription.created']);
    } else for (const e of done.events) await webhook(e);
    if (i === 0) await webhook(byType['invoice.paid'], 'Stripe retries the same event');
    if (p.pushDevice) {
      const k = generateVapidKeys(); // stands in for the browser's own P-256 key pair
      // An endpoint on a real push service host (only those are accepted); the console transport sends nothing.
      const r = await req('POST', '/api/push/subscribe', { json: { endpoint: `https://fcm.googleapis.com/fcm/send/demo-${p.key}`, keys: { p256dh: k.publicKey, auth: Buffer.alloc(16, i + 1).toString('base64url') } } });
      expect(r.status === 200, `push subscribe ${p.name}`);
    }
    if (p.timeZone) {
      const r = await req('POST', '/api/prefs', { json: { timeZone: p.timeZone } });
      expect(r.status === 200, `prefs ${p.name}: ${JSON.stringify(r.body)}`);
    }
    ids[p.key] = ctx.db.get('SELECT id FROM users WHERE email = ?', p.email).id;
    const what = [
      `${p.tier}/${p.interval}`,
      p.sms ? (p.unverified ? 'SMS not possible: phone never verified' : 'SMS on') : p.unverified ? 'phone never verified' : 'no SMS (not an SMS country)',
      p.pushDevice ? 'push device' : null,
      p.timeZone ? `account time zone ${p.timeZone}` : null,
    ].filter(Boolean);
    step(p.name, `joined (${p.country})`, what.join('; '));
    if (p.optOutBefore) {
      const token = ctx.db.get('SELECT token FROM unsubscribe_tokens WHERE user_id = ?', ids[p.key]).token;
      await client(p.country)('POST', `/u/${token}`, { form: {} });
      step(p.name, `taps qrm.si/u/${token} before the issue`, 'SMS off; subscription, push and email unchanged');
    }
  }
  for (const p of REFUSED) {
    const req = client(p.country);
    await signIn(req, p);
    await req('POST', '/api/join/geo', { json: { declaredCountry: p.country } });
    const s = await req('POST', '/api/phone/start', { json: { e164: p.e164, locale: 'en' } });
    expect(s.status === 422, `US number must be refused, got ${s.status}`);
    step(p.name, `phone refused at signup (${p.why})`, s.body.reasons.map((r) => r.en).join(' '));
  }

  // ============================================================ the issue day
  await runSlot('06:00', `engine output: ${input.candidates.filter((c) => c.status === 'candidate').length} candidates, ${input.closes.length} exits, ${input.nScored} stocks scored`);
  await runSlot('11:30', 'Claude (fake client): 48-hour news scan and EN/SL theses');
  const drafted = ctx.db.all("SELECT candidate_id, attempt, lang, outcome, error FROM explanations WHERE purpose = 'thesis' ORDER BY id");
  for (const d of drafted.filter((x) => x.lang === 'en')) step('explainer', `candidate ${d.candidate_id} draft ${d.attempt}: ${d.outcome}`, d.error ?? 'every number is in the factor data');

  setLocal(DATE, '12:05');
  const view = await admin('GET', '/api/admin/candidates?person=p1');
  expect(view.status === 200, 'admin candidates');
  step('Maja Vrhovnik (p1, fictional)', 'opens the approver console', `${view.body.candidates.length} candidates; the view is logged in access_log`);
  if (toVeto) {
    const c = view.body.candidates.find((x) => x.ticker === toVeto.ticker);
    const v = await admin('POST', '/api/admin/veto', { candidateId: c.id, personId: 'p1', reason: 'Second pick in the same week from this sector; I prefer to wait for the filing reconciliation.' });
    expect(v.status === 200, `veto: ${JSON.stringify(v.body)}`);
    step('Maja Vrhovnik (p1, fictional)', `removes candidate ${c.id} (${c.ticker})`, 'removal only, with a written reason; counted in the ISSUE entry');
    const add = await admin('POST', '/api/admin/veto', { candidateId: c.id, personId: 'p1', reason: 'Trying to veto the same candidate twice.' });
    expect(add.status === 409, 'second veto refused');
  }
  const so = await admin('POST', '/api/admin/signoff', { personId: 'p1' });
  expect(so.status === 200, 'signoff');
  step('Maja Vrhovnik (p1, fictional)', 'signs off the review', '');
  const pc = await admin('POST', '/api/admin/preclearance', { personId: 'p2', instrument: 'Fictional World Equity ETF', instrumentType: 'etf', side: 'buy' });
  const pc2 = await admin('POST', '/api/admin/preclearance', { personId: 'p2', instrument: toVeto?.ticker ?? 'SOME', instrumentType: 'stock', side: 'buy' });
  step('Luka Ferjančič (p2, fictional)', 'staff pre-clearance', `ETF: ${pc.body.decision}; single stock: ${pc2.body.decision}`);

  await runSlot('13:40', 'the review window closes');
  await runSlot('13:45', 'seal: canonical JSON, SHA-256, previous hash, commit of a salted reveal');
  const smsBefore = sms.outbox.length;
  await runSlot('14:00', `issue published at 14:00:00 ${slot.tzLabel}; paced fan-out`);
  const fan = JSON.parse(ctx.db.get('SELECT delivery_json FROM issue_runs WHERE issue_date = ?', DATE).delivery_json);
  const pickTexts = sms.outbox.slice(smsBefore);
  step('notifier', `fan-out ${fan.seconds}s at ${config.fanout.smsPerSecond}/s`, `SMS ${JSON.stringify(fan.counts.sms)} · push ${JSON.stringify(fan.counts.push)} · email ${JSON.stringify(fan.counts.email)}`);
  const cancelled = ctx.db.all("SELECT user_id, error_code, COUNT(*) AS n FROM notifications WHERE channel = 'sms' AND status = 'cancelled' AND rec_id IS NOT NULL GROUP BY user_id, error_code");
  for (const c of cancelled) step('notifier', `no text for ${PEOPLE.find((p) => ids[p.key] === c.user_id)?.name}`, `${c.n} x ${c.error_code} (14:00 in Ljubljana is ${formatInZone(now(), 'Asia/Tokyo').time.slice(0, 5)} in Tokyo); push and email sent`);

  // ============================================================ delivery receipts (signed)
  const marta = pickTexts.filter((m) => m.to === PEOPLE[2].e164);
  const lukas = pickTexts.filter((m) => m.to === PEOPLE[1].e164);
  for (const m of pickTexts) {
    if (m === marta[0]) {
      await receipt(m, 'failed', '21610');
      continue;
    }
    if (m === lukas[1]) {
      await receipt(m, 'undelivered', '30007');
      continue;
    }
    await receipt(m, 'sent');
    await receipt(m, 'delivered');
    await receipt(m, 'sent'); // a late duplicate: status never moves backwards
  }
  const delivered = ctx.db.get("SELECT COUNT(*) AS n FROM notifications WHERE channel = 'sms' AND status = 'delivered' AND rec_id IS NOT NULL").n;
  step('twilio', `${ctx.db.get('SELECT COUNT(*) AS n FROM delivery_events').n} signed receipts stored (no phone numbers; repeats once)`, `${delivered} delivered; late 'sent' duplicates after 'delivered' ignored (status only moves forward)`);
  const martaOff = ctx.db.get("SELECT source FROM opt_outs WHERE user_id = ? ORDER BY id DESC LIMIT 1", ids.marta);
  step('twilio', `21610 for ${PEOPLE[2].name}`, `opted out of all SMS (source ${martaOff?.source}); no confirmation text to a number that blocked us`);
  step('twilio', '30007 (carrier filtering) on one text', `SMS paused: ${ctx.db.getSetting('sms_paused') === '1'}; on-call paged: ${pager.pages.map((x) => x.kind).join(', ')}; push and email continue`);

  // ============================================================ one-tap opt-out while SMS is paused
  setLocal(DATE, '14:20');
  const ana = PEOPLE[0];
  const token = ctx.db.get('SELECT token FROM unsubscribe_tokens WHERE user_id = ?', ids.ana).token;
  const tap = client('SI');
  const page = await tap('GET', `/u/${token}`);
  await tap('POST', `/u/${token}`, { form: {} });
  await tap('POST', `/u/${token}`, { form: {} });
  const held = ctx.db.get("SELECT status FROM notifications WHERE user_id = ? AND kind = 'OPT_OUT'", ids.ana);
  step(ana.name, `opens qrm.si/u/${token} (${page.status}) and taps Stop twice`, `opted out once; confirmation text ${held?.status} while SMS is paused`);
  setLocal(DATE, '14:35');
  const resume = await admin('POST', '/api/admin/sms', { paused: false, personId: 'p1' });
  expect(resume.status === 200, 'resume');
  await ctx.messaging.dispatchDue();
  step('on-call', 'reviews the 30007 spike and resumes SMS', `queued texts still valid go out (the opt-out confirmation: ${ctx.db.get("SELECT status FROM notifications WHERE user_id = ? AND kind = 'OPT_OUT'", ids.ana).status})`);

  // ============================================================ US open, anchor
  await runSlot(slot.usOpenLocal === '15:30' ? '15:31' : '14:31', 'US open: entry prices recorded; exits reveal their sealed picks');
  clock.t = new Date(`${DATE}T23:59:00Z`).getTime();
  await ctx.scheduler.tick(now());
  const anchor = ctx.db.get('SELECT * FROM ledger_anchors WHERE date = ?', DATE);
  step('anchor', `Merkle root ${anchor.merkle_root.slice(0, 16)}… over ${anchor.row_count} entries`, 'OpenTimestamps and RFC 3161 submission are off in this offline demo (OTS_CALENDARS, RFC3161_URL)');
  const status = await (await fetch(`${url}/api/status`)).json();

  // ============================================================ checks and report
  const chain = await verifyChain(ctx.publisher.ledger());
  const today = ctx.publisher.ledger({ from: DATE }).filter((e) => e.issueDate === DATE);
  const texts = sms.outbox.map((m) => {
    const a = analyze(m.body);
    return { sid: m.sid, to: maskPhone(m.to), at: m.at, encoding: a.encoding, septets: a.septets, segments: a.segments, valid: validateSms(m.body).ok, body: m.body };
  });
  const pushes = push.outbox.map((m) => ({ id: m.id, host: new URL(m.endpoint).host, title: m.payload.title, at: m.at }));
  const emails = email.outbox.filter((m) => m.tag !== 'MAGIC_LINK').map((m) => ({ id: m.id, to: m.to, tag: m.tag, subject: m.subject }));
  const counts = Object.fromEntries(
    ['ledger_entries', 'recommendations', 'explanations', 'access_log', 'delivery_events', 'opt_outs', 'ops_alerts', 'staff_trade_requests'].map((tb) => [tb, ctx.db.get(`SELECT COUNT(*) AS n FROM ${tb}`).n]),
  );
  expect(chain.ok, `ledger chain: ${chain.reason}`);
  expect(texts.every((x) => x.valid && x.segments === 1), 'every text is one valid GSM-7 segment');
  expect(today.some((e) => e.type === 'ISSUE'), 'an ISSUE entry was published');
  expect(!pickTexts.some((m) => m.to === PEOPLE[4].e164 || m.to === PEOPLE[6].e164), 'no pick text to the opted-out or outside-quiet-hours subscriber');
  expect(pushes.length > 0 && emails.some((e) => ['BUY', 'CLOSE', 'RENEW'].includes(e.tag)), 'push and email went out');
  const elapsedMs = Math.round(performance.now() - t0);
  const result = { date: DATE, simulated: true, replayOf: { issueNo: issue.issueNo, hash: issue.hash }, steps: log, ledger: today, chain, status, sms: texts, push: pushes, emails, counts, claudeCalls: calls, elapsedMs };

  if (flag('--json')) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    const out = [];
    out.push(`Quorum demo day ${DATE}: a replay of issue #${issue.issueNo} of the sealed record`);
    out.push('Simulated market, fictional companies and people. Console transports: nothing is sent, nothing leaves this machine.');
    out.push('');
    let day = null;
    for (const s of log) {
      if (s.date !== day) {
        day = s.date;
        out.push(`-- ${day} (Europe/Ljubljana)`);
      }
      out.push(`${s.local}  ${s.who.padEnd(30)} ${s.what}${s.detail ? `\n${' '.repeat(42)}${s.detail}` : ''}`);
    }
    out.push('');
    out.push(`Ledger entries of ${DATE} (chain ${chain.ok ? 'verified' : 'BROKEN'}, ${chain.checked} entries)`);
    for (const e of today) out.push(`  #${e.seq} ${e.type.padEnd(6)} ${e.at}  ${e.hash.slice(0, 16)}…  ${e.type === 'ISSUE' ? `buys ${e.body.buys.join(',') || '-'} closes ${e.body.closes.join(',') || '-'} vetoes ${JSON.stringify(e.body.vetoes)} news scan ${JSON.stringify(e.body.newsScan ?? {})}` : e.type === 'CLOSE' ? `reveals #${e.body.no} ${e.body.reveal.ticker}, excess ${(e.body.excess * 100).toFixed(2)}%` : `#${e.body.no} commit ${e.body.commit.slice(0, 16)}…`}`);
    out.push('');
    out.push(`SMS outbox (${texts.length})`);
    for (const x of texts) out.push(`  ${x.sid} ${formatInZone(new Date(x.at), LJUBLJANA).date.slice(5)} ${formatInZone(new Date(x.at), LJUBLJANA).time} ${x.to}  ${x.encoding} ${x.septets}/160${x.valid ? '' : '  INVALID'}\n    ${x.body}`);
    out.push('');
    out.push(`Push outbox (${pushes.length})`);
    for (const p of pushes) out.push(`  ${p.id} ${formatInZone(new Date(p.at), LJUBLJANA).time} ${p.host}  ${p.title}`);
    out.push('');
    out.push(`Email outbox (${emails.length}, sign-in links not shown)`);
    for (const e of emails) out.push(`  ${e.id}  ${e.to.padEnd(27)} ${String(e.tag).padEnd(9)} ${e.subject}`);
    out.push('');
    out.push(`GET /api/status: issue #${status.issue?.issueNo} ${status.issue?.publishedAt}; sms ${JSON.stringify(status.delivery.sms)}; push ${JSON.stringify(status.delivery.push)}; email ${JSON.stringify(status.delivery.email)}; SMS paused ${status.smsChannel.paused}`);
    out.push(`Rows: ${Object.entries(counts).map(([k, v]) => `${k} ${v}`).join(', ')}; Claude calls (fake client) ${calls}`);
    out.push(`Done in ${elapsedMs} ms.`);
    console.log(out.join('\n'));
  }
} finally {
  await app.close();
}
