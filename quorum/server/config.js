// Server configuration from the environment. Everything the server reads from process.env is read
// here and nowhere else, so docs/OPERATIONS.md can list it from one place.
import { randomBytes } from 'node:crypto';

const DAY = 86_400_000;

function list(value, fallback) {
  const raw = value == null || value === '' ? fallback : value;
  return String(raw)
    .split(',')
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);
}

function urls(value, fallback) {
  const raw = value == null || value === '' ? fallback : value;
  if (/^(off|none|0)$/i.test(String(raw))) return [];
  return String(raw)
    .split(',')
    .map((s) => s.trim().replace(/\/+$/, ''))
    .filter((s) => /^https:\/\//.test(s));
}

function num(value, fallback) {
  const n = Number(value);
  return value != null && value !== '' && Number.isFinite(n) ? n : fallback;
}

function bool(value, fallback = false) {
  if (value == null || value === '') return fallback;
  return /^(1|true|on|yes)$/i.test(String(value));
}

function int(value, fallback) {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) ? n : fallback;
}

// loadConfig(env = process.env, overrides = {}) -> frozen config object.
// `overrides` is merged last (shallow per section) and is how tests and scripts configure the app.
export function loadConfig(env = process.env, overrides = {}) {
  const port = int(env.PORT, 8787);
  const publicBaseUrl = (env.PUBLIC_BASE_URL || `http://localhost:${port}`).replace(/\/+$/, '');
  const production = env.NODE_ENV === 'production';
  let sessionSecret = env.SESSION_SECRET || '';
  let sessionSecretGenerated = false;
  if (!sessionSecret) {
    // Development only: a per-process secret (sessions do not survive a restart). index.js refuses
    // to start in production without SESSION_SECRET.
    sessionSecret = randomBytes(32).toString('base64url');
    sessionSecretGenerated = true;
  }

  const base = {
    production,
    port,
    host: env.HOST || '127.0.0.1',
    dbPath: env.DB_PATH || 'quorum.db',
    publicBaseUrl,
    linkBase: (env.LINK_BASE || 'https://qrm.si').replace(/\/+$/, ''),
    webRoot: env.WEB_ROOT || null, // default resolved in index.js (../web)
    smsTransport: env.SMS_TRANSPORT === 'twilio' ? 'twilio' : 'console',
    emailTransport: env.EMAIL_TRANSPORT === 'postmark' ? 'postmark' : 'console',
    postmark: {
      serverToken: env.POSTMARK_SERVER_TOKEN || '',
      messageStream: env.POSTMARK_MESSAGE_STREAM || 'outbound',
      baseUrl: (env.POSTMARK_BASE_URL || 'https://api.postmarkapp.com').replace(/\/+$/, ''),
    },
    // Web Push (VAPID, RFC 8292). PUSH_TRANSPORT=webpush needs the key pair; console records pushes.
    pushTransport: env.PUSH_TRANSPORT === 'webpush' ? 'webpush' : 'console',
    vapid: {
      publicKey: env.VAPID_PUBLIC_KEY || '',
      privateKey: env.VAPID_PRIVATE_KEY || '',
      subject: env.VAPID_SUBJECT || 'mailto:support@qrm.si',
    },
    emailFrom: env.EMAIL_FROM || 'Quorum <hello@qrm.si>',
    supportEmail: env.SUPPORT_EMAIL || 'support@qrm.si',
    twilio: {
      accountSid: env.TWILIO_ACCOUNT_SID || '',
      authToken: env.TWILIO_AUTH_TOKEN || '',
      messagingServiceSid: env.TWILIO_MESSAGING_SERVICE_SID || '',
      verifyServiceSid: env.TWILIO_VERIFY_SERVICE_SID || '',
      // Lookup v2 sms_pumping_risk: reject at or above this score, or category "high".
      pumpingRiskMax: int(env.TWILIO_PUMPING_RISK_MAX, 75),
    },
    stripe: {
      secretKey: env.STRIPE_SECRET_KEY || '',
      webhookSecret: env.STRIPE_WEBHOOK_SECRET || '',
      apiVersion: '2026-08-26.dahlia',
      prices: {
        signal: { month: env.STRIPE_PRICE_SIGNAL_M || '', year: env.STRIPE_PRICE_SIGNAL_Y || '' },
        research: { month: env.STRIPE_PRICE_RESEARCH_M || '', year: env.STRIPE_PRICE_RESEARCH_Y || '' },
      },
      toleranceSec: 300,
    },
    anthropicApiKey: env.ANTHROPIC_API_KEY || '',
    explainerModel: env.EXPLAINER_MODEL || '', // the pinned Claude model id; the explainer stays off until it is set
    sessionSecret,
    sessionSecretGenerated,
    sessionTtlMs: int(env.SESSION_TTL_DAYS, 30) * DAY,
    magicLinkTtlMs: int(env.MAGIC_LINK_TTL_MIN, 15) * 60_000,
    adminToken: env.ADMIN_TOKEN || '',
    // Pick fan-out: SMS paced to this many messages per second (the Messaging Service's confirmed
    // throughput, UNVERIFIED until Twilio quotes it); the whole 14:00 fan-out must end inside the window.
    fanout: {
      smsPerSecond: num(env.SMS_MPS, 10),
      windowSec: 600,
      pushConcurrency: int(env.PUSH_CONCURRENCY, 8),
      emailConcurrency: int(env.EMAIL_CONCURRENCY, 4),
    },
    // Delivery receipts (brief §4.4).
    receipts: {
      invalidCodes: ['30003', '30005', '30006'],
      invalidAfter: int(env.INVALID_NUMBER_AFTER, 2), // this many consecutive failures with those codes
      spikeCode: '30007',
      spikeWindowMs: 10 * 60_000,
      spikeRatio: num(env.SPIKE_30007_RATIO, 0.02), // pause SMS when 30007s exceed this share of sends
      spikeMinErrors: int(env.SPIKE_30007_MIN, 1),
    },
    // Daily anchoring: OpenTimestamps calendars (OTS_CALENDARS=off to disable) and an RFC 3161 TSA.
    anchor: {
      otsCalendars: urls(env.OTS_CALENDARS, 'https://a.pool.opentimestamps.org,https://b.pool.opentimestamps.org,https://a.pool.eternitywall.com'),
      rfc3161Url: env.RFC3161_URL || '',
    },
    // On-call pages go to this webhook (JSON POST) as well as the log and the ops_alerts table.
    pagerWebhookUrl: env.PAGER_WEBHOOK_URL || '',
    // Where the engine drops its daily output (<dir>/<YYYY-MM-DD>.json) before 06:00 Ljubljana.
    engineDayDir: env.ENGINE_DAY_DIR || '',
    smsCountries: list(env.SMS_COUNTRIES, 'SI,AT,DE,HR,IT'),
    scheduler: env.SCHEDULER === 'on' ? 'on' : 'off',
    // Geofence: the request header a trusted edge sets with the client's ISO country (for example
    // "cf-ipcountry" behind Cloudflare). Empty means the IP country is unknown.
    ipCountryHeader: (env.IP_COUNTRY_HEADER || '').toLowerCase(),
    // Reject signups when the IP country is unknown. On in production (set the header above).
    geoRequireIp: bool(env.GEO_REQUIRE_IP, production),
    // Number of reverse proxies in front of the server whose X-Forwarded-For we trust (0 = none).
    trustProxy: int(env.TRUST_PROXY, 0),
    billing: {
      graceDays: 3, // entitlement runs to current_period_end + 3 days
      failedPaymentSuspendDays: 7, // alerts suspended 7 days after the first failed payment
      withdrawalDays: 14, // EU withdrawal right; full refund on the first subscription
    },
    // Recipient-local quiet hours for SMS: sends only between these hours.
    quietHours: { start: '08:00', end: '21:00' },
    // How often the server retries queued messages that are due (0 = off; tests call dispatch).
    outboxIntervalMs: int(env.OUTBOX_INTERVAL_MS, 30_000),
    bodyLimits: { json: 16 * 1024, stripe: 512 * 1024, twilio: 64 * 1024, form: 8 * 1024 },
    // Per-IP token buckets: capacity requests, refilled evenly over windowMs.
    rateLimits: {
      api: { capacity: 300, windowMs: 60_000 },
      data: { capacity: 240, windowMs: 60_000 },
      authMagic: { capacity: 5, windowMs: 15 * 60_000 },
      authMagicEmail: { capacity: 3, windowMs: 15 * 60_000 },
      authCallback: { capacity: 20, windowMs: 15 * 60_000 },
      phoneStart: { capacity: 5, windowMs: 60 * 60_000 },
      phoneStartUser: { capacity: 3, windowMs: 60 * 60_000 },
      phoneCheck: { capacity: 10, windowMs: 10 * 60_000 },
      optout: { capacity: 30, windowMs: 60_000 },
      account: { capacity: 10, windowMs: 60 * 60_000 },
      webhook: { capacity: 1200, windowMs: 60_000 },
      admin: { capacity: 120, windowMs: 60_000 },
      adminLogin: { capacity: 10, windowMs: 15 * 60_000 },
      status: { capacity: 120, windowMs: 60_000 },
    },
    researchTier: env.RESEARCH_TIER !== 'off',
  };

  return deepFreeze(merge(base, overrides));
}

function merge(a, b) {
  if (!b || typeof b !== 'object') return a;
  const out = { ...a };
  for (const [k, v] of Object.entries(b)) {
    if (v && typeof v === 'object' && !Array.isArray(v) && a[k] && typeof a[k] === 'object' && !Array.isArray(a[k])) {
      out[k] = merge(a[k], v);
    } else {
      out[k] = v;
    }
  }
  return out;
}

function deepFreeze(o) {
  for (const v of Object.values(o)) if (v && typeof v === 'object' && !Object.isFrozen(v)) deepFreeze(v);
  return Object.freeze(o);
}

// The environment variables the server reads, for docs and the startup banner.
export const ENV_VARS = [
  'PORT', 'HOST', 'DB_PATH', 'PUBLIC_BASE_URL', 'LINK_BASE', 'WEB_ROOT', 'NODE_ENV',
  'SMS_TRANSPORT', 'EMAIL_TRANSPORT', 'EMAIL_FROM', 'SUPPORT_EMAIL',
  'TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_MESSAGING_SERVICE_SID', 'TWILIO_VERIFY_SERVICE_SID', 'TWILIO_PUMPING_RISK_MAX',
  'STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET', 'STRIPE_PRICE_SIGNAL_M', 'STRIPE_PRICE_SIGNAL_Y', 'STRIPE_PRICE_RESEARCH_M', 'STRIPE_PRICE_RESEARCH_Y',
  'ANTHROPIC_API_KEY', 'EXPLAINER_MODEL', 'SESSION_SECRET', 'SESSION_TTL_DAYS', 'MAGIC_LINK_TTL_MIN', 'ADMIN_TOKEN',
  'SMS_COUNTRIES', 'SCHEDULER', 'IP_COUNTRY_HEADER', 'GEO_REQUIRE_IP', 'TRUST_PROXY', 'OUTBOX_INTERVAL_MS', 'RESEARCH_TIER',
  'POSTMARK_SERVER_TOKEN', 'POSTMARK_MESSAGE_STREAM', 'POSTMARK_BASE_URL', 'PUSH_TRANSPORT', 'VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY', 'VAPID_SUBJECT',
  'SMS_MPS', 'PUSH_CONCURRENCY', 'EMAIL_CONCURRENCY', 'INVALID_NUMBER_AFTER', 'SPIKE_30007_RATIO', 'SPIKE_30007_MIN',
  'OTS_CALENDARS', 'RFC3161_URL', 'PAGER_WEBHOOK_URL', 'ENGINE_DAY_DIR',
];
