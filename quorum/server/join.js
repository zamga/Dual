// Join steps 2-3 (brief §4.2): the geofence and the phone check.
//   POST /api/join/geo    { declaredCountry }   IP country (trusted header) + declared country
//   POST /api/phone/start { e164, locale }      Lookup v2 checks, then a Verify code by SMS
//   POST /api/phone/check { e164, code }        a valid code sets phone_verified_at
import { maskPhone } from '../core/consent-texts.js';
import { HttpError } from './http.js';
import { evaluateGeo, checkLookup, normalizeCountry, normalizeE164, reason } from './geofence.js';
import { ensureUnsubscribeToken } from './tokens.js';
import { hasGrant } from './consent.js';
import { TwilioError } from './vendors/twilio.js';
import { iso, normLocale } from './util.js';

// ipCountry(req, config) -> ISO country or null. Read only from the header a trusted edge sets.
export function ipCountry(req, config) {
  if (!config.ipCountryHeader) return null;
  return normalizeCountry(req.headers[config.ipCountryHeader]);
}

function logGeo(db, { userId, stage, ip, declared, phone = null, card = null, result, now }) {
  db.run(
    `INSERT INTO geo_checks (user_id, stage, ip_country, declared_country, phone_country, card_country, ok, reasons_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    userId,
    stage,
    ip,
    declared,
    phone,
    card,
    result.ok ? 1 : 0,
    JSON.stringify(result.reasons.map((r) => r.code)),
    iso(now),
  );
}

// Verify errors in plain words: 60203 too many sends, 60202 too many checks, 60410 blocked by
// Fraud Guard / geo permissions; anything else from Twilio is a 502.
function verifyError(e) {
  if (!(e instanceof TwilioError)) return e;
  if (e.code === 60203 || e.code === 60202 || e.status === 429) {
    return new HttpError(429, 'rate_limited', 'Too many codes for this number. Wait a few minutes and try again.', { retryAfterSec: 600 });
  }
  if (e.code === 60410 || e.code === 60605 || e.code === 60200) {
    return new HttpError(422, 'phone_rejected', 'We cannot send a code to this number. Use a mobile number from your country.', { reasons: [reason('line_type_unsupported')] });
  }
  return new HttpError(502, 'sms_provider_error', 'Our SMS provider did not answer. Try again in a minute.');
}

export function registerJoinRoutes(router, ctx) {
  const { db, config } = ctx;

  router.add(
    'POST',
    '/api/join/geo',
    async (req, res, { body, user }) => {
      const declared = normalizeCountry(body?.declaredCountry);
      const ip = ipCountry(req, config);
      const now = ctx.now();
      const result = evaluateGeo({ ipCountry: ip, declaredCountry: declared }, { smsCountries: config.smsCountries, requireIp: config.geoRequireIp });
      db.tx(() => {
        logGeo(db, { userId: user.id, stage: 'join', ip, declared, result, now });
        db.run(
          'UPDATE users SET declared_country = ?, ip_country = ?, jurisdiction = ?, status = ?, blocked_reason = ?, updated_at = ? WHERE id = ?',
          declared,
          ip,
          result.ok ? declared : null,
          result.ok ? 'geo_ok' : 'geo_blocked',
          result.ok ? null : result.reasons.map((r) => r.code).join(','),
          iso(now),
          user.id,
        );
      });
      const out = { ok: result.ok, country: result.country, ipCountry: ip, smsEligible: result.ok && result.smsEligible, reasons: result.reasons, notes: result.notes };
      if (!result.ok) throw new HttpError(403, 'geofence', result.reasons[0]?.en ?? 'Not available in your country', out);
      return out;
    },
    { auth: true, accepts: ['json'] },
  );

  router.add(
    'POST',
    '/api/phone/start',
    async (req, res, { body, user, ip }) => {
      if (user.status !== 'geo_ok' || !user.jurisdiction) throw new HttpError(409, 'geo_required', 'Confirm your country first.');
      const e164 = normalizeE164(body?.e164);
      if (!e164) throw new HttpError(400, 'invalid_number', reason('invalid_number').en, { reasons: [reason('invalid_number')] });
      const locale = normLocale(body?.locale ?? user.locale);
      const perUser = ctx.rateLimiter.take('phoneStartUser', user.id, config.rateLimits.phoneStartUser);
      if (!perUser.ok) throw new HttpError(429, 'rate_limited', 'Too many codes requested. Try again later.', { retryAfterSec: perUser.retryAfterSec });

      const lookup = await ctx.sms.lookup(e164);
      const check = checkLookup(lookup, { declaredCountry: user.jurisdiction, smsCountries: config.smsCountries, pumpingRiskMax: config.twilio.pumpingRiskMax });
      const now = ctx.now();
      const phoneCountry = normalizeCountry(lookup.countryCode);
      const geo = evaluateGeo(
        { ipCountry: user.ip_country, declaredCountry: user.jurisdiction, phoneCountry },
        { smsCountries: config.smsCountries, requireIp: false },
      );
      db.tx(() => logGeo(db, { userId: user.id, stage: 'phone', ip: user.ip_country, declared: user.jurisdiction, phone: phoneCountry, result: geo, now }));
      if (!check.ok) throw new HttpError(422, 'phone_rejected', check.reasons[0].en, { reasons: check.reasons });

      const other = db.get('SELECT user_id FROM phone_numbers WHERE e164 = ? AND verified_at IS NOT NULL AND user_id != ?', e164, user.id);
      if (other) throw new HttpError(409, 'phone_in_use', reason('phone_in_use').en, { reasons: [reason('phone_in_use')] });

      // The SMS consent names the number, so a new number needs a new consent: switching numbers
      // stops texts to the old one and the account page asks again once the new one is verified.
      const prev = db.get('SELECT e164, verified_at FROM phone_numbers WHERE user_id = ?', user.id);
      let smsConsentReset = false;
      if (prev?.verified_at && prev.e164 !== e164 && hasGrant(db, user.id, 'sms')) {
        await ctx.optout.optOutSms(user.id, { source: 'account', channel: 'account', ip, userAgent: req.headers['user-agent'], confirm: false });
        smsConsentReset = true;
      }

      db.run(
        `INSERT INTO phone_numbers (user_id, e164, country, line_type, pumping_risk, pumping_score, verified_at, invalid_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, NULL, NULL, ?, ?)
         ON CONFLICT(user_id) DO UPDATE SET e164 = excluded.e164, country = excluded.country, line_type = excluded.line_type,
           pumping_risk = excluded.pumping_risk, pumping_score = excluded.pumping_score,
           verified_at = CASE WHEN phone_numbers.e164 = excluded.e164 THEN phone_numbers.verified_at ELSE NULL END,
           invalid_at = NULL, updated_at = excluded.updated_at`,
        user.id,
        e164,
        phoneCountry,
        lookup.lineType,
        lookup.smsPumpingRisk?.category ?? null,
        lookup.smsPumpingRisk?.score ?? null,
        iso(now),
        iso(now),
      );
      let v;
      try {
        v = await ctx.sms.verifyStart(e164, locale);
      } catch (e) {
        throw verifyError(e);
      }
      db.run('UPDATE phone_numbers SET verify_sid = ? WHERE user_id = ?', v.sid, user.id);
      return { ok: true, status: 'pending', masked: maskPhone(e164), country: phoneCountry, smsConsentReset };
    },
    { auth: true, accepts: ['json'], rate: 'phoneStart' },
  );

  router.add(
    'POST',
    '/api/phone/check',
    async (req, res, { body, user }) => {
      const e164 = normalizeE164(body?.e164);
      const code = String(body?.code ?? '').replace(/\s/g, '');
      if (!e164) throw new HttpError(400, 'invalid_number', reason('invalid_number').en);
      if (!/^\d{4,10}$/.test(code)) throw new HttpError(400, 'invalid_code', 'Enter the code from the text message.');
      const phone = db.get('SELECT * FROM phone_numbers WHERE user_id = ?', user.id);
      if (!phone || phone.e164 !== e164) throw new HttpError(409, 'no_pending_verification', 'Request a new code for this number first.');
      if (phone.verified_at) return { ok: true, verified: true, masked: maskPhone(e164) };
      let r;
      try {
        r = await ctx.sms.verifyCheck(e164, code);
      } catch (e) {
        throw verifyError(e);
      }
      if (!r.valid) {
        if (r.status === 'expired') throw new HttpError(410, 'code_expired', 'This code has expired. Request a new one.');
        throw new HttpError(422, 'code_invalid', 'That code is not right. Check the text message and try again.');
      }
      const now = ctx.now();
      db.tx(() => {
        db.run('UPDATE phone_numbers SET verified_at = ?, updated_at = ? WHERE user_id = ? AND e164 = ?', iso(now), iso(now), user.id, e164);
        ensureUnsubscribeToken(db, user.id, now);
      });
      const optIn = await ctx.messaging.maybeSendOptIn(user.id);
      return { ok: true, verified: true, masked: maskPhone(e164), optIn };
    },
    { auth: true, accepts: ['json'], rate: 'phoneCheck' },
  );
}
