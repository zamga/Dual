// The outbox. Every SMS and notification email is a `notifications` row, persisted with a unique
// idempotency key BEFORE the provider is called; dispatch() claims queued rows and sends them.
// Part 2's notifier fans picks out through queue() with idemKey `${recId}:${userId}:${channel}`.
import { renderSms, validateSms } from '../core/sms-templates.js';
import { consentText, maskPhone } from '../core/consent-texts.js';
import { COUNTRY_TZ } from './geofence.js';
import { latestConsent } from './consent.js';
import { isEntitled } from './entitlements.js';
import { ensureUnsubscribeToken } from './tokens.js';
import { iso, sha256, quietHoursNextAllowed, addMs } from './util.js';
import { TwilioError } from './vendors/twilio.js';

const MAX_ATTEMPTS = 5;

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
  function queue({ userId, channel, kind, to, body, subject = null, idemKey, recId = null, notBefore = null, country = null }) {
    if (!idemKey) throw new Error('messaging.queue: idemKey is required');
    const now = ctx.now();
    let nb = notBefore ? iso(notBefore) : null;
    if (channel === 'sms') {
      const tz = COUNTRY_TZ[country] || COUNTRY_TZ.SI;
      const next = quietHoursNextAllowed(nb ? new Date(nb) : now, tz, config.quietHours);
      if (next) nb = iso(next);
    }
    const r = db.run(
      `INSERT INTO notifications (idem_key, rec_id, user_id, channel, kind, to_addr, subject, body, body_sha256, status, not_before, queued_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'queued', ?, ?, ?) ON CONFLICT DO NOTHING`,
      idemKey,
      recId,
      userId,
      channel,
      kind,
      to,
      subject,
      body,
      sha256(body),
      nb,
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
      const country = db.get('SELECT country FROM phone_numbers WHERE user_id = ?', row.user_id)?.country;
      const next = quietHoursNextAllowed(now, COUNTRY_TZ[country] || COUNTRY_TZ.SI, config.quietHours);
      if (next) {
        finish(row.id, { not_before: iso(next) });
        return { id: row.id, skipped: 'quiet_hours' };
      }
      const v = validateSms(row.body);
      if (!v.ok) {
        finish(row.id, { status: 'failed', error_code: 'template_invalid' });
        ctx.log.error(`[messaging] refusing to send notification ${row.id}: ${v.errors.join('; ')}`);
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
      // push is part 2 (notifier)
      finish(row.id, { status: 'queued' });
      return { id: row.id, skipped: 'channel_not_implemented' };
    } catch (e) {
      const attempts = db.get('SELECT attempts FROM notifications WHERE id = ?', row.id)?.attempts ?? MAX_ATTEMPTS;
      const permanent = e instanceof TwilioError && e.status >= 400 && e.status < 500 && e.status !== 429;
      if (permanent || attempts >= MAX_ATTEMPTS) {
        finish(row.id, { status: 'failed', error_code: String(e.code ?? e.status ?? 'error') });
      } else {
        finish(row.id, { status: 'queued', not_before: iso(addMs(ctx.now(), 30_000 * 2 ** attempts)), error_code: String(e.code ?? e.status ?? 'error') });
      }
      ctx.log.warn(`[messaging] notification ${row.id} (${row.channel} ${row.kind}) failed: ${e.message}`);
      return { id: row.id, error: e.message };
    }
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
