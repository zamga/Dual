// Twilio delivery receipts (brief §4.4). server/twilio-status.js validates X-Twilio-Signature and
// stores the raw callback append-only (delivery_events, phone number hashed); this module is the
// ctx.hooks.onTwilioStatus it then calls:
//   - status only moves forward: queued -> sending -> sent -> delivered; failed / undelivered are final
//   - 21610 (recipient blocked us)            -> the user is opted out of SMS (source 'twilio')
//   - repeated 30003 / 30005 / 30006          -> the number is marked invalid and the user is emailed
//   - 30007 (carrier filtering) above 2 % of the SMS sent in the last 10 minutes -> the SMS channel is
//     paused (settings.sms_paused) and on-call is paged; push and email continue
//
//   createReceipts(ctx) -> { onStatus({ sid, status, errorCode, params }), resumeSms({ by }) }
import { iso } from './util.js';

// Our notification statuses in the order they may be reached.
export const RANK = { queued: 0, sending: 1, sent: 2, delivered: 3, undelivered: 3, failed: 3, cancelled: 3 };
const FINAL = new Set(['delivered', 'undelivered', 'failed', 'cancelled']);
// Twilio MessageStatus -> ours
const FROM_TWILIO = { accepted: 'queued', scheduled: 'queued', queued: 'queued', sending: 'sending', sent: 'sent', delivered: 'delivered', read: 'delivered', undelivered: 'undelivered', failed: 'failed', canceled: 'cancelled' };

// nextStatus(current, incoming) -> the status to store, or null when it would move backwards.
export function nextStatus(current, incoming) {
  if (!(incoming in RANK)) return null;
  if (FINAL.has(current)) return null;
  return RANK[incoming] > (RANK[current] ?? -1) ? incoming : null;
}

export function createReceipts(ctx) {
  const { db, config } = ctx;
  const rc = config.receipts;

  function applyStatus(row, incoming, errorCode) {
    const to = nextStatus(row.status, incoming);
    if (!to) return { moved: false, from: row.status, to: row.status };
    const now = iso(ctx.now());
    db.run(
      `UPDATE notifications SET status = ?, error_code = COALESCE(?, error_code), delivered_at = CASE WHEN ? = 'delivered' THEN COALESCE(delivered_at, ?) ELSE delivered_at END, updated_at = ?
       WHERE id = ? AND status = ?`,
      to,
      errorCode,
      to,
      now,
      now,
      row.id,
      row.status,
    );
    return { moved: true, from: row.status, to };
  }

  async function markInvalidIfRepeated(userId) {
    const phone = db.get('SELECT * FROM phone_numbers WHERE user_id = ?', userId);
    if (!phone || phone.invalid_at) return false;
    const last = db.all(
      "SELECT error_code FROM notifications WHERE user_id = ? AND channel = 'sms' AND to_addr = ? AND status IN ('delivered', 'undelivered', 'failed') ORDER BY COALESCE(sent_at, queued_at) DESC, id DESC LIMIT ?",
      userId,
      phone.e164,
      rc.invalidAfter,
    );
    if (last.length < rc.invalidAfter || !last.every((r) => rc.invalidCodes.includes(String(r.error_code)))) return false;
    const now = iso(ctx.now());
    db.tx(() => {
      db.run('UPDATE phone_numbers SET invalid_at = ?, updated_at = ? WHERE id = ?', now, now, phone.id);
      db.run("UPDATE notifications SET status = 'cancelled', error_code = 'phone_invalid', updated_at = ? WHERE user_id = ? AND channel = 'sms' AND status = 'queued'", now, userId);
    });
    const user = db.get('SELECT locale FROM users WHERE id = ?', userId);
    const sl = user?.locale === 'sl';
    await ctx.messaging.sendEmail({
      userId,
      kind: 'NUMBER_INVALID',
      subject: sl ? 'Quorum: SMS-ov ne moremo dostaviti' : 'Quorum: we cannot deliver texts to your number',
      body: sl
        ? `Operater je večkrat zavrnil naša SMS-obvestila na številko, ki se konča s ${phone.e164.slice(-2)}. SMS-e smo za to številko ustavili. Izbire in izhode še naprej prejemate po e-pošti in s potisnimi obvestili.\n\nŠtevilko lahko preverite ali zamenjate v računu: ${config.publicBaseUrl}/#account`
        : `Your carrier has repeatedly rejected our texts to the number ending ${phone.e164.slice(-2)}, so we have stopped texting it. You still get every pick and exit by email and push.\n\nCheck or change the number in your account: ${config.publicBaseUrl}/#account`,
      idemKey: `NUMBER_INVALID:${userId}:${phone.id}:${phone.e164}`,
    });
    ctx.alerts?.raise('number_invalid', `Number of ${userId} marked invalid after ${rc.invalidAfter} failures (${last.map((r) => r.error_code).join(', ')})`, { severity: 'info' });
    return true;
  }

  function checkSpike() {
    const now = ctx.now();
    const since = iso(new Date(now.getTime() - rc.spikeWindowMs));
    const errors = db.get('SELECT COUNT(*) AS n FROM delivery_events WHERE error_code = ? AND received_at >= ?', rc.spikeCode, since).n;
    const sends = db.get("SELECT COUNT(*) AS n FROM notifications WHERE channel = 'sms' AND sent_at >= ?", since).n;
    const ratio = errors / Math.max(sends, errors, 1);
    const spike = errors >= rc.spikeMinErrors && ratio > rc.spikeRatio;
    if (spike && db.getSetting('sms_paused') !== '1') {
      const reason = `${rc.spikeCode} spike: ${errors} of ${sends} texts sent in the last ${rc.spikeWindowMs / 60_000} minutes (${(ratio * 100).toFixed(1)}%, limit ${rc.spikeRatio * 100}%)`;
      db.setSetting('sms_paused', '1', iso(now));
      db.setSetting('sms_paused_reason', reason, iso(now));
      ctx.alerts?.raise('sms_30007_spike', `SMS paused: ${reason}. Push and email continue.`, { severity: 'page', dedupeKey: 'sms_30007_spike', detail: { errors, sends, ratio } });
      return { paused: true, errors, sends, ratio };
    }
    return { paused: false, errors, sends, ratio };
  }

  // onStatus({ sid, status, errorCode, params }) -> summary of what changed
  async function onStatus({ sid, status, errorCode, params = {} }) {
    const incoming = FROM_TWILIO[String(status ?? '').toLowerCase()] ?? null;
    const code = errorCode ? String(errorCode) : null;
    const out = { sid, status: incoming, errorCode: code, moved: false, optedOut: false, invalid: false, spike: null };
    const row = sid ? db.get('SELECT * FROM notifications WHERE provider_sid = ?', sid) : null;
    if (row && incoming) Object.assign(out, applyStatus(row, incoming, code));
    const userId = row?.user_id ?? (params.To ? db.get('SELECT user_id FROM phone_numbers WHERE e164 = ?', params.To)?.user_id : null);
    if (code === '21610' && userId) {
      const r = await ctx.optout.optOutSms(userId, { source: 'twilio', channel: 'twilio', confirm: false });
      out.optedOut = r.changed || r.alreadyOff;
    }
    if (code && rc.invalidCodes.includes(code) && userId) out.invalid = await markInvalidIfRepeated(userId);
    if (code === rc.spikeCode) out.spike = checkSpike();
    return out;
  }

  // resumeSms({ by }) -> the channel resumes; queued texts that are still valid go out on the next
  // outbox run (expired pick texts are cancelled, never sent late).
  function resumeSms({ by = 'admin' } = {}) {
    const now = iso(ctx.now());
    db.setSetting('sms_paused', '0', now);
    db.setSetting('sms_paused_reason', `resumed by ${by}`, now);
    ctx.alerts?.raise('sms_resumed', `SMS channel resumed by ${by}`, { severity: 'info' });
    return { ok: true, paused: false };
  }

  return { onStatus, resumeSms, checkSpike };
}
