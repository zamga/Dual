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
    emailTransport: env.EMAIL_TRANSPORT || 'console',
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
];
