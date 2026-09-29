// The outbox. Every SMS, push and email is a `notifications` row, persisted with a unique
// idempotency key BEFORE the provider is called; dispatch() claims queued rows and sends them.
// The notifier (server/notifier.js) fans picks out through queue() with idemKey
// `${recId}:${userId}:${channel}`.
import { renderSms, validateSms } from '../core/sms-templates.js';
import { consentText, maskPhone } from '../core/consent-texts.js';
import { COUNTRY_TZ } from './geofence.js';
import { latestConsent } from './consent.js';
import { isEntitled } from './entitlements.js';
import { ensureUnsubscribeToken } from './tokens.js';
import { iso, sha256, quietHoursNextAllowed, addMs } from './util.js';

const MAX_ATTEMPTS = 5;

export function validTimeZone(tz) {
  if (typeof tz !== 'string' || !tz || tz.length > 64) return false;
  try {
    new Intl.DateTimeFormat('en', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

// recipientZone(db, userId) -> IANA zone for recipient-local quiet hours: the zone the user set in
// their account, else the phone number's country, else Ljubljana.
export function recipientZone(db, userId, country = null) {
  const u = db.get('SELECT timezone FROM users WHERE id = ?', userId);
  if (u?.timezone && validTimeZone(u.timezone)) return u.timezone;
  const cc = country ?? db.get('SELECT country FROM phone_numbers WHERE user_id = ?', userId)?.country;
  return COUNTRY_TZ[cc] || COUNTRY_TZ.SI;
}

// A provider error is permanent when the provider answered 4xx other than 429 (bad number, bad
// request, unknown subscription): retrying cannot help.
function isPermanent(e) {
  const s = Number(e?.status);
  return Number.isInteger(s) && s >= 400 && s < 500 && s !== 429 && s !== 408;
}

export function createMessaging(ctx) {
  const { db, config } = ctx;
  const statusCallback = `${config.publicBaseUrl}/api/webhooks/twilio/status`;

  // smsState(userId) -> { allowed, reason, phone, prefs, grant }. The recipient rule of brief §4.4
  // minus entitlement and quiet hours: SMS consent granted (and not revoked since), channel on,
  // phone verified and valid, phone country in the SMS countries.
  function smsState(userId) {
    const user = db.get('SELECT id, status, locale FROM users WHERE id = ?', userId);
    if (!user || user.status === 'deleted') return { allowed: false, reason: 'no_user' };
    const grant = latestConsent(db, userId, 'sms');
    if (grant?.action !== 'grant') return { allowed: false, reason: 'no_consent' };
    const prefs = db.get('SELECT sms FROM channel_prefs WHERE user_id = ?', userId);
    if (!prefs?.sms) return { allowed: false, reason: 'channel_off', grant };
    const phone = db.get('SELECT * FROM phone_numbers WHERE user_id = ?', userId);
    if (!phone?.verified_at) return { allowed: false, reason: 'phone_unverified', grant };
    if (phone.invalid_at) return { allowed: false, reason: 'phone_invalid', grant };
    if (!config.smsCountries.includes(phone.country)) return { allowed: false, reason: 'sms_country', grant };
    return { allowed: true, reason: null, phone, grant, user };
  }

  // queue({ userId, channel, kind, to, body, subject?, idemKey, recId?, notBefore? }) -> { id, created }
  // Synchronous, so it can run inside the caller's transaction. SMS rows outside recipient-local
  // quiet hours get not_before = the next 08:00 local.
  function queue({ userId, channel, kind, to, body, subject = null, idemKey, recId = null, notBefore = null, country = null, timeZone = null, expiresAt = null, status = 'queued', errorCode = null }) {
    if (!idemKey) throw new Error('messaging.queue: idemKey is required');
    const now = ctx.now();
    let nb = notBefore ? iso(notBefore) : null;
    if (channel === 'sms' && status === 'queued') {
      const tz = timeZone ?? recipientZone(db, userId, country);
      const next = quietHoursNextAllowed(nb ? new Date(nb) : now, tz, config.quietHours);
      if (next) nb = iso(next);
    }
    const r = db.run(
      `INSERT INTO notifications (idem_key, rec_id, user_id, channel, kind, to_addr, subject, body, body_sha256, status, error_code, not_before, expires_at, queued_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT DO NOTHING`,
      idemKey,
      recId,
      userId,
      channel,
      kind,
      to,
      subject,
      body,
      sha256(body),
      status,
      errorCode,
      nb,
      expiresAt ? iso(expiresAt) : null,
      iso(now),
      iso(now),
    );
    if (r.changes === 1) return { id: r.lastInsertRowid, created: true };
    const existing = db.get('SELECT id FROM notifications WHERE idem_key = ?', idemKey);
    return { id: existing?.id ?? null, created: false };
  }

  function claim(id) {
    return db.run("UPDATE notifications SET status = 'sending', attempts = attempts + 1, updated_at = ? WHERE id = ? AND status = 'queued'", iso(ctx.now()), id).changes === 1;
  }

  function finish(id, fields) {
    const sets = Object.keys(fields).map((k) => `${k} = ?`);
    db.run(`UPDATE notifications SET ${sets.join(', ')}, updated_at = ? WHERE id = ?`, ...Object.values(fields), iso(ctx.now()), id);
  }

  async function sendOne(row) {
    const now = ctx.now();
    if (row.status !== 'queued') return { id: row.id, skipped: row.status };
    // A pick text is never sent after its validity (the US open of the issue day): no late texts.
    if (row.expires_at && new Date(row.expires_at) <= now) {
      finish(row.id, { status: 'cancelled', error_code: 'expired' });
      return { id: row.id, cancelled: 'expired' };
    }
    if (row.not_before && new Date(row.not_before) > now) return { id: row.id, skipped: 'not_before' };
    if (row.channel === 'sms') {
      if (db.getSetting('sms_paused') === '1') return { id: row.id, skipped: 'sms_paused' };
      // One opt-out applies to every SMS immediately, including rows queued before it.
      if (row.kind !== 'OPT_OUT') {
        const st = smsState(row.user_id);
        if (!st.allowed || st.phone.e164 !== row.to_addr) {
          finish(row.id, { status: 'cancelled', error_code: st.reason || 'number_changed' });
          return { id: row.id, cancelled: st.reason || 'number_changed' };
        }
      }
      if (!row.to_addr) {
        finish(row.id, { status: 'cancelled', error_code: 'no_recipient' });
        return { id: row.id, cancelled: 'no_recipient' };
      }
      // Quiet hours are checked again at send time (retries and late dispatch runs).
      const next = quietHoursNextAllowed(now, recipientZone(db, row.user_id), config.quietHours);
      if (next) {
        if (row.expires_at && next >= new Date(row.expires_at)) {
          finish(row.id, { status: 'cancelled', error_code: 'quiet_hours' });
          return { id: row.id, cancelled: 'quiet_hours' };
        }
        finish(row.id, { not_before: iso(next) });
        return { id: row.id, skipped: 'quiet_hours' };
      }
      const v = validateSms(row.body);
      if (!v.ok) {
        finish(row.id, { status: 'failed', error_code: 'template_invalid' });
        ctx.log.error(`[messaging] refusing to send notification ${row.id}: ${v.errors.join('; ')}`);
        ctx.alerts?.raise('sms_template_invalid', `Blocked ${row.kind} text ${row.id}: ${v.errors.join('; ')}`, { severity: 'page', dedupeKey: `template:${row.kind}:${row.rec_id ?? ''}` });
        return { id: row.id, failed: 'template_invalid' };
      }
    }
    if (!claim(row.id)) return { id: row.id, skipped: 'claimed' };
    try {
      if (row.channel === 'sms') {
        const r = await ctx.sms.sendMessage({ to: row.to_addr, body: row.body, statusCallback });
        finish(row.id, { status: 'sent', provider_sid: r.sid, sent_at: iso(ctx.now()) });
        return { id: row.id, sent: true, sid: r.sid };
      }
      if (row.channel === 'email') {
        if (!row.to_addr) {
          finish(row.id, { status: 'cancelled', error_code: 'no_recipient' });
          return { id: row.id, cancelled: 'no_recipient' };
        }
        const r = await ctx.email.send({ to: row.to_addr, subject: row.subject, text: row.body, tag: row.kind });
        finish(row.id, { status: 'sent', provider_sid: r?.id ?? null, sent_at: iso(ctx.now()) });
        return { id: row.id, sent: true, sid: r?.id ?? null };
      }
      if (row.channel === 'push') return await sendPush(row);
      finish(row.id, { status: 'failed', error_code: 'unknown_channel' });
      return { id: row.id, failed: 'unknown_channel' };
    } catch (e) {
      const attempts = db.get('SELECT attempts FROM notifications WHERE id = ?', row.id)?.attempts ?? MAX_ATTEMPTS;
      const permanent = isPermanent(e);
      if (permanent || attempts >= MAX_ATTEMPTS) {
        finish(row.id, { status: 'failed', error_code: String(e.code ?? e.status ?? 'error') });
      } else {
        finish(row.id, { status: 'queued', not_before: iso(addMs(ctx.now(), 30_000 * 2 ** attempts)), error_code: String(e.code ?? e.status ?? 'error') });
      }
      ctx.log.warn(`[messaging] notification ${row.id} (${row.channel} ${row.kind}) failed: ${e.message}`);
      return { id: row.id, error: e.message };
    }
  }

  // Web Push to every live subscription of the user (one notification row per user and item).
  // 404/410 revokes that subscription; the row is sent when at least one device accepted it.
  async function sendPush(row) {
    if (!ctx.push) {
      finish(row.id, { status: 'queued' });
      return { id: row.id, skipped: 'no_push_transport' };
    }
    const subs = db.all('SELECT id, endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = ? AND revoked_at IS NULL ORDER BY id', row.user_id);
    if (!subs.length) {
      finish(row.id, { status: 'cancelled', error_code: 'no_subscription' });
      return { id: row.id, cancelled: 'no_subscription' };
    }
    let sent = 0;
    let gone = 0;
    let lastError = null;
    const ids = [];
    for (const s of subs) {
      try {
        const r = await ctx.push.send({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, row.body, { ttl: 3600, urgency: 'normal' });
        if (r.gone) {
          gone++;
          db.run('UPDATE push_subscriptions SET revoked_at = COALESCE(revoked_at, ?) WHERE id = ?', iso(ctx.now()), s.id);
        } else {
          sent++;
          if (r.id) ids.push(r.id);
        }
      } catch (e) {
        lastError = e;
      }
    }
    if (sent > 0) {
      finish(row.id, { status: 'sent', provider_sid: ids[0] ?? `push:${sent}/${subs.length}`, sent_at: iso(ctx.now()) });
      return { id: row.id, sent: true, devices: sent };
    }
    if (gone === subs.length) {
      finish(row.id, { status: 'cancelled', error_code: 'subscription_gone' });
      return { id: row.id, cancelled: 'subscription_gone' };
    }
    throw lastError ?? new Error('push: no device accepted the message');
  }

  // dispatch(ids) -> results; sends the given queued rows that are due.
  async function dispatch(ids = []) {
    const results = [];
    for (const id of ids) {
      if (id == null) continue;
      const row = db.get('SELECT * FROM notifications WHERE id = ?', id);
      if (row) results.push(await sendOne(row));
    }
    return results;
  }

  // dispatchDue({ limit }) -> results; every queued row that is due (retries, quiet-hours holds).
  async function dispatchDue({ limit = 200, channel = null } = {}) {
    const now = iso(ctx.now());
    const rows = db.all(
      `SELECT id FROM notifications WHERE status = 'queued' AND (not_before IS NULL OR not_before <= ?) ${channel ? 'AND channel = ?' : ''} ORDER BY id LIMIT ?`,
      ...(channel ? [now, channel, limit] : [now, limit]),
    );
    return dispatch(rows.map((r) => r.id));
  }

  // maybeSendOptIn(userId) -> { queued: boolean, reason }
  // Brief §4.2 step 8: entitled AND SMS consent granted AND verified phone -> one OPT_IN text per
  // consent grant (idempotency key OPT_IN:<user>:<grant id>), plus one welcome email per user.
  async function maybeSendOptIn(userId) {
    const now = ctx.now();
    if (!isEntitled(db, userId, 'picks', now)) return { queued: false, reason: 'not_entitled' };
    const st = smsState(userId);
    if (!st.allowed) return { queued: false, reason: st.reason };
    const locale = st.user.locale === 'sl' ? 'sl' : 'en';
    const ids = [];
    let created = false;
    db.tx(() => {
      const token = ensureUnsubscribeToken(db, userId, now);
      const body = renderSms('OPT_IN', locale, { token });
      const q = queue({ userId, channel: 'sms', kind: 'OPT_IN', to: st.phone.e164, body, idemKey: `OPT_IN:${userId}:${st.grant.id}`, country: st.phone.country });
      created = q.created;
      if (q.created) ids.push(q.id);
      const email = db.get('SELECT email FROM users WHERE id = ?', userId)?.email;
      if (email) {
        const w = queue({
          userId,
          channel: 'email',
          kind: 'WELCOME',
          to: email,
          subject: locale === 'sl' ? 'Dobrodošli v Quorumu' : 'Welcome to Quorum',
          body: welcomeEmail(locale, st.phone.e164, config),
          idemKey: `WELCOME:${userId}`,
        });
        if (w.created) ids.push(w.id);
      }
    });
    if (ids.length) await dispatch(ids);
    return { queued: created, reason: created ? null : 'already_sent' };
  }

  // queueEmail + dispatch in one step, for billing and account emails.
  async function sendEmail({ userId, kind, subject, body, idemKey }) {
    const email = db.get('SELECT email FROM users WHERE id = ?', userId)?.email;
    if (!email) return { queued: false };
    const q = queue({ userId, channel: 'email', kind, to: email, subject, body, idemKey });
    if (q.created) await dispatch([q.id]);
    return { queued: q.created, id: q.id };
  }

  return { smsState, queue, dispatch, dispatchDue, maybeSendOptIn, sendEmail, statusCallback };
}

function welcomeEmail(locale, e164, config) {
  const terms = consentText('sms', locale, { phone: maskPhone(e164) });
  if (locale === 'sl') {
    return [
      'Dobrodošli v Quorumu.',
      '',
      'SMS-obvestila so vklopljena. Pogoji, ki ste jih sprejeli:',
      terms,
      '',
      `Izbire in izhode prejmete tudi po e-pošti in s potisnimi obvestili. Potisna obvestila vklopite v računu: ${config.publicBaseUrl}/#account`,
      `Odjava od SMS: povezava v vsakem sporočilu ali ${config.publicBaseUrl}/#account`,
      '',
      'Quorum objavlja splošne raziskave. To ni osebno investicijsko svetovanje.',
    ].join('\n');
  }
  return [
    'Welcome to Quorum.',
    '',
    'Text alerts are on. The terms you agreed to:',
    terms,
    '',
    `You also get every pick and exit by email and push. Switch on push in your account: ${config.publicBaseUrl}/#account`,
    `To stop texts: the link in every message, or ${config.publicBaseUrl}/#account`,
    '',
    'Quorum publishes general research. It is not personal investment advice.',
  ].join('\n');
}
