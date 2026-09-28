// Consent capture (brief §2.7): append-only consent_events rows holding the SHA-256 of the exact
// versioned text the user saw. The server recomputes the hash from core/consent-texts.js and
// rejects any mismatch, so a stale or altered checkbox text can never be recorded as consent.
import { CONSENT_KINDS, consentHash, consentVersion } from '../core/consent-texts.js';
import { HttpError } from './http.js';
import { iso } from './util.js';

const ACTIONS = ['grant', 'revoke'];

export function latestConsent(db, userId, kind) {
  return db.get('SELECT * FROM consent_events WHERE user_id = ? AND kind = ? ORDER BY id DESC LIMIT 1', userId, kind);
}

export function hasGrant(db, userId, kind) {
  return latestConsent(db, userId, kind)?.action === 'grant';
}

// consentSummary(db, userId) -> { sms: {granted, version, at}, terms: {...}, immediate_performance: {...} }
export function consentSummary(db, userId) {
  const out = {};
  for (const kind of CONSENT_KINDS) {
    const row = latestConsent(db, userId, kind);
    out[kind] = { granted: row?.action === 'grant', version: row?.text_version ?? null, at: row?.created_at ?? null, current: consentVersion(kind) };
  }
  return out;
}

// recordConsent(db, {...}) -> row id. Internal: callers have already validated the text.
export function recordConsent(db, { userId, kind, action, version = null, sha256 = null, ip = null, userAgent = null, pageUrl = null, locale = null, channel, now = new Date() }) {
  return db.run(
    `INSERT INTO consent_events (user_id, kind, action, text_version, text_sha256, ip, user_agent, page_url, locale, channel, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    userId,
    kind,
    action,
    version,
    sha256,
    ip ? String(ip).slice(0, 64) : null,
    userAgent ? String(userAgent).slice(0, 512) : null,
    pageUrl ? String(pageUrl).slice(0, 2048) : null,
    locale,
    channel,
    iso(now),
  ).lastInsertRowid;
}

// checkConsentText({ kind, locale, version, sha256 }) -> Promise<{ version, sha256 }>; throws 409 on mismatch.
export async function checkConsentText({ kind, locale, version, sha256 }) {
  const expectedVersion = consentVersion(kind);
  const expectedHash = await consentHash(kind, locale);
  if (version !== expectedVersion || String(sha256).toLowerCase() !== expectedHash) {
    throw new HttpError(409, 'consent_text_mismatch', 'The consent text you saw is not the current version. Reload the page and review it again.', {
      current: { kind, locale, version: expectedVersion, sha256: expectedHash },
    });
  }
  return { version: expectedVersion, sha256: expectedHash };
}

export function validateConsentBody(body) {
  const b = body && typeof body === 'object' ? body : {};
  if (!CONSENT_KINDS.includes(b.kind)) throw new HttpError(400, 'invalid_kind', `kind must be one of ${CONSENT_KINDS.join(', ')}`);
  if (!ACTIONS.includes(b.action)) throw new HttpError(400, 'invalid_action', 'action must be grant or revoke');
  if (b.locale !== 'en' && b.locale !== 'sl') throw new HttpError(400, 'invalid_locale', 'locale must be en or sl');
  if (b.action === 'grant' || b.sha256 != null || b.version != null) {
    if (typeof b.version !== 'string' || !b.version) throw new HttpError(400, 'invalid_version', 'version is required');
    if (typeof b.sha256 !== 'string' || !/^[0-9a-f]{64}$/i.test(b.sha256)) throw new HttpError(400, 'invalid_sha256', 'sha256 must be 64 hex characters');
  }
  if (b.pageUrl != null && (typeof b.pageUrl !== 'string' || b.pageUrl.length > 2048)) throw new HttpError(400, 'invalid_page_url', 'pageUrl must be a string');
  return { kind: b.kind, action: b.action, locale: b.locale, version: b.version ?? null, sha256: b.sha256 ? b.sha256.toLowerCase() : null, pageUrl: b.pageUrl ?? null };
}

// Routes: POST /api/consent
export function registerConsentRoutes(router, ctx) {
  router.add(
    'POST',
    '/api/consent',
    async (req, res, { body, user, ip }) => {
      const c = validateConsentBody(body);
      if (c.action === 'grant' || c.sha256) await checkConsentText(c);
      const now = ctx.now();
      const common = { userId: user.id, ip, userAgent: req.headers['user-agent'], pageUrl: c.pageUrl, locale: c.locale, now };

      if (c.kind === 'sms' && c.action === 'revoke') {
        const r = await ctx.optout.optOutSms(user.id, { source: 'account', channel: 'web', ...common });
        return { ok: true, consent: { kind: 'sms', action: 'revoke', at: iso(now) }, optOut: r };
      }

      if (c.kind === 'sms' && c.action === 'grant') {
        const phone = ctx.db.get('SELECT * FROM phone_numbers WHERE user_id = ?', user.id);
        if (!phone?.verified_at || phone.invalid_at) {
          throw new HttpError(409, 'phone_not_verified', 'Verify your mobile number before switching on text alerts.');
        }
        if (!ctx.config.smsCountries.includes(phone.country)) {
          throw new HttpError(409, 'sms_unavailable', 'Text alerts are not available for this number.');
        }
      }

      const prev = latestConsent(ctx.db, user.id, c.kind);
      let id;
      let duplicate = false;
      ctx.db.tx(() => {
        if (prev && prev.action === c.action && prev.text_sha256 === c.sha256 && prev.text_version === c.version && c.action === 'grant') {
          id = prev.id;
          duplicate = true;
        } else {
          const last = c.action === 'revoke' ? latestConsent(ctx.db, user.id, c.kind) : null;
          id = recordConsent(ctx.db, {
            ...common,
            kind: c.kind,
            action: c.action,
            version: c.version ?? last?.text_version ?? null,
            sha256: c.sha256 ?? last?.text_sha256 ?? null,
            channel: 'web',
          });
        }
        if (c.kind === 'sms' && c.action === 'grant') {
          ctx.db.run(
            `INSERT INTO channel_prefs (user_id, sms, updated_at) VALUES (?, 1, ?)
             ON CONFLICT(user_id) DO UPDATE SET sms = 1, updated_at = excluded.updated_at`,
            user.id,
            iso(now),
          );
        }
      });
      let optIn = null;
      if (c.kind === 'sms' && c.action === 'grant') optIn = await ctx.messaging.maybeSendOptIn(user.id);
      return { ok: true, duplicate, consent: { id, kind: c.kind, action: c.action, version: c.version, sha256: c.sha256, at: iso(now) }, optIn };
    },
    { auth: true, accepts: ['json'], rate: 'api' },
  );
}
