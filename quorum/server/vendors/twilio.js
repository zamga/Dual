// Twilio over plain fetch (REST, form-encoded, Basic auth): Lookup v2, Verify, Messages, and
// X-Twilio-Signature validation. createConsoleSms() has the same interface and sends nothing.
import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';
import { countryFromE164 } from '../geofence.js';

export const LOOKUP_BASE = 'https://lookups.twilio.com';
export const VERIFY_BASE = 'https://verify.twilio.com';
export const API_BASE = 'https://api.twilio.com';
export const VALIDITY_PERIOD = 3600; // brief §0: an alert is still useful for an hour

export class TwilioError extends Error {
  constructor(status, body) {
    super(body?.message || `Twilio HTTP ${status}`);
    this.name = 'TwilioError';
    this.status = status;
    this.code = body?.code ?? null; // Twilio error code, e.g. 21211 invalid 'To'
    this.body = body;
  }
}

// twilioSignature(authToken, url, params) -> base64 HMAC-SHA1 of the URL followed by every POST
// parameter name and value, sorted by name (Twilio's scheme for form-encoded webhooks).
export function twilioSignature(authToken, url, params = {}) {
  let data = url;
  for (const key of Object.keys(params).sort()) {
    const v = params[key];
    for (const item of Array.isArray(v) ? v : [v]) data += key + (item ?? '');
  }
  return createHmac('sha1', authToken).update(Buffer.from(data, 'utf8')).digest('base64');
}

export function validateTwilioSignature(authToken, url, params, signature) {
  if (!authToken || typeof signature !== 'string' || !signature) return false;
  const expected = Buffer.from(twilioSignature(authToken, url, params));
  const given = Buffer.from(signature);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

function form(params) {
  const body = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v != null && v !== '') body.append(k, String(v));
  return body;
}

// normalizeLookup(raw) -> { e164, valid, countryCode, lineType, carrier, smsPumpingRisk: {score, category, blocked}, raw }
export function normalizeLookup(raw) {
  const lti = raw?.line_type_intelligence || {};
  const risk = raw?.sms_pumping_risk || {};
  return {
    e164: raw?.phone_number ?? null,
    valid: raw?.valid === true,
    countryCode: raw?.country_code ?? null,
    lineType: lti.type ?? null,
    carrier: lti.carrier_name ?? null,
    smsPumpingRisk: {
      score: Number.isFinite(risk.sms_pumping_risk_score) ? risk.sms_pumping_risk_score : null,
      category: risk.carrier_risk_category ?? null,
      blocked: risk.number_blocked === true,
    },
    raw,
  };
}

// createTwilio({ accountSid, authToken, messagingServiceSid, verifyServiceSid, fetch, bases? })
//   -> { kind: 'twilio', lookup, verifyStart, verifyCheck, sendMessage, validateSignature, sign }
export function createTwilio({
  accountSid,
  authToken,
  messagingServiceSid,
  verifyServiceSid,
  fetch = globalThis.fetch,
  bases = {},
} = {}) {
  if (!accountSid || !authToken) throw new Error('twilio: TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN are required');
  const lookupBase = bases.lookup || LOOKUP_BASE;
  const verifyBase = bases.verify || VERIFY_BASE;
  const apiBase = bases.api || API_BASE;
  const auth = 'Basic ' + Buffer.from(`${accountSid}:${authToken}`).toString('base64');

  async function call(method, url, params) {
    const init = { method, headers: { authorization: auth, accept: 'application/json' } };
    if (params) {
      init.headers['content-type'] = 'application/x-www-form-urlencoded';
      init.body = form(params).toString();
    }
    const res = await fetch(url, init);
    const text = await res.text();
    let body = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = { message: text };
    }
    if (!res.ok) throw new TwilioError(res.status, body);
    return body;
  }

  return {
    kind: 'twilio',
    // Lookup v2 with line type intelligence and SMS pumping risk.
    async lookup(e164) {
      const url = `${lookupBase}/v2/PhoneNumbers/${encodeURIComponent(e164)}?Fields=${encodeURIComponent('line_type_intelligence,sms_pumping_risk')}`;
      try {
        return normalizeLookup(await call('GET', url));
      } catch (e) {
        if (e instanceof TwilioError && e.status === 404) return normalizeLookup({ phone_number: e164, valid: false });
        throw e;
      }
    },
    // Verify: send a one-time code by SMS in the user's locale ('sl' | 'en').
    async verifyStart(e164, locale = 'en') {
      if (!verifyServiceSid) throw new Error('twilio: TWILIO_VERIFY_SERVICE_SID is required');
      const r = await call('POST', `${verifyBase}/v2/Services/${verifyServiceSid}/Verifications`, {
        To: e164,
        Channel: 'sms',
        Locale: locale === 'sl' ? 'sl' : 'en',
      });
      return { sid: r?.sid ?? null, status: r?.status ?? 'pending' };
    },
    // Verify check: { status: 'approved' | 'pending' | 'expired', valid }
    async verifyCheck(e164, code) {
      if (!verifyServiceSid) throw new Error('twilio: TWILIO_VERIFY_SERVICE_SID is required');
      try {
        const r = await call('POST', `${verifyBase}/v2/Services/${verifyServiceSid}/VerificationCheck`, { To: e164, Code: code });
        return { status: r?.status ?? 'pending', valid: r?.valid === true || r?.status === 'approved' };
      } catch (e) {
        // 404: no pending verification (expired, already approved, or too many attempts)
        if (e instanceof TwilioError && e.status === 404) return { status: 'expired', valid: false };
        throw e;
      }
    },
    // messages.create through the Messaging Service (sender QUORUM), with a status callback and
    // a one-hour validity period.
    async sendMessage({ to, body, statusCallback, validityPeriod = VALIDITY_PERIOD }) {
      if (!messagingServiceSid) throw new Error('twilio: TWILIO_MESSAGING_SERVICE_SID is required');
      const r = await call('POST', `${apiBase}/2010-04-01/Accounts/${accountSid}/Messages.json`, {
        MessagingServiceSid: messagingServiceSid,
        To: to,
        Body: body,
        StatusCallback: statusCallback,
        ValidityPeriod: validityPeriod,
      });
      return { sid: r?.sid ?? null, status: r?.status ?? 'accepted', errorCode: r?.error_code ?? null };
    },
    validateSignature: (url, params, signature) => validateTwilioSignature(authToken, url, params, signature),
    sign: (url, params) => twilioSignature(authToken, url, params),
  };
}

// Console twin. Lookup is derived from the number so every rejection path can be exercised:
// national numbers ending 0000 are landlines, 9999 non-fixed VoIP, 6666 high SMS-pumping risk,
// 5555 invalid. Verify codes are random and logged (lastCode(e164) returns them for tests).
export function createConsoleSms({ log = console, authToken = 'console-auth-token', idPrefix = 'SMconsole', clock = () => new Date() } = {}) {
  const codes = new Map();
  const outbox = [];
  let n = 0;
  const say = (msg) => (log.info ? log.info(msg) : log.log?.(msg));
  return {
    kind: 'console',
    outbox,
    async lookup(e164) {
      const cc = countryFromE164(e164);
      const tail = String(e164).slice(-4);
      const valid = Boolean(cc) && /^\+\d{8,15}$/.test(e164) && tail !== '5555';
      const type = tail === '0000' ? 'landline' : tail === '9999' ? 'nonFixedVoip' : 'mobile';
      const high = tail === '6666';
      return normalizeLookup({
        phone_number: e164,
        valid,
        country_code: cc,
        line_type_intelligence: { type, carrier_name: 'Console Mobile' },
        sms_pumping_risk: { carrier_risk_category: high ? 'high' : 'low', sms_pumping_risk_score: high ? 91 : 3, number_blocked: false },
      });
    },
    async verifyStart(e164, locale = 'en') {
      const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
      codes.set(e164, { code, attempts: 0 });
      say(`[sms:console] Verify code for ${e164} (${locale}): ${code}`);
      return { sid: `VEconsole${++n}`, status: 'pending' };
    },
    async verifyCheck(e164, code) {
      const entry = codes.get(e164);
      if (!entry) return { status: 'expired', valid: false };
      entry.attempts++;
      if (entry.code === String(code)) {
        codes.delete(e164);
        return { status: 'approved', valid: true };
      }
      if (entry.attempts >= 5) codes.delete(e164);
      return { status: 'pending', valid: false };
    },
    async sendMessage({ to, body, statusCallback, validityPeriod = VALIDITY_PERIOD }) {
      const sid = `${idPrefix}${String(++n).padStart(6, '0')}`;
      outbox.push({ sid, to, body, statusCallback, validityPeriod, at: clock().toISOString() });
      say(`[sms:console] ${sid} to ${to}: ${body}`);
      return { sid, status: 'accepted', errorCode: null };
    },
    validateSignature: (url, params, signature) => validateTwilioSignature(authToken, url, params, signature),
    sign: (url, params) => twilioSignature(authToken, url, params),
    lastCode: (e164) => codes.get(e164)?.code ?? null,
  };
}
