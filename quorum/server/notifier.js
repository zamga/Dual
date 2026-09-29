// The notifier (brief §2.2, §2.5, §4.4): fan-out of BUY, CLOSE and RENEW items at 14:00 and the
// weekly Ledger email on Sunday at 18:00 (email only, no SMS).
//
// Recipients of a pick item: entitled to picks. Per channel:
//   SMS    consent granted (not revoked since) AND channel on AND phone verified and valid AND an SMS
//          country AND inside recipient-local quiet hours (08:00-21:00). A text outside quiet hours
//          is recorded as cancelled 'quiet_hours' (never sent late); pick texts expire at the US open.
//   push   every item, to every live subscription (VAPID + aes128gcm, server/vendors/push.js)
//   email  every item
// Identical content and one publish timestamp for every tier. Every row is persisted with the
// idempotency key rec_id:user_id:channel before any provider call; SMS is paced to
// config.fanout.smsPerSecond so the fan-out ends inside config.fanout.windowSec (10 minutes).
//
//   createNotifier(ctx) -> { enqueueIssue, deliverIssue, weeklyLedger, render, recipientsFor }
//   registerPushRoutes(router, ctx): GET /api/push/key, POST /api/push/subscribe, POST /api/push/unsubscribe
import { renderSms, validateSms } from '../core/sms-templates.js';
import { issueSlot, fmtDDMMYY, fmtLong, addDays } from '../core/calendar.js';
import { ensureUnsubscribeToken, TOKEN_LENGTH } from './tokens.js';
import { recipientZone } from './messaging.js';
import { HttpError } from './http.js';
import { quietHoursNextAllowed, iso } from './util.js';
import { b64u } from './vendors/push.js';

export const PICK_KINDS = ['BUY', 'CLOSE', 'RENEW'];
const KIND_SL = { BUY: 'NAKUP', CLOSE: 'ZAPRTJE', RENEW: 'PODALJSANJE' };

export const realSleep = (ms) => new Promise((r) => setTimeout(r, ms));

// createPacer({ perSecond, now, sleep }) -> wait(): resolves at evenly spaced instants.
export function createPacer({ perSecond, now, sleep = realSleep }) {
  const interval = 1000 / Math.max(0.001, perSecond);
  let next = null;
  return async function wait() {
    const t = now().getTime();
    if (next == null || next < t) next = t;
    const delay = next - t;
    next += interval;
    if (delay > 0) await sleep(delay);
  };
}

async function pool(items, concurrency, fn) {
  const results = [];
  let i = 0;
  const workers = Array.from({ length: Math.max(1, Math.min(concurrency, items.length)) }, async () => {
    while (i < items.length) {
      const k = i++;
      results[k] = await fn(items[k]);
    }
  });
  await Promise.all(workers);
  return results;
}

const stripStop = (text) => text.replace(/\s+(?:Stop|Odjava): \S+$/, '');
const ENQUEUE_CHUNK = 250;

export function createNotifier(ctx) {
  const { db, config } = ctx;
  const base = config.publicBaseUrl;

  // ---------------------------------------------------------------- content (one version per locale)
  function smsText(item, locale, token) {
    if (item.kind === 'CLOSE') return renderSms('CLOSE', locale, { no: item.no, ticker: item.ticker, issueDate: item.issueDate, token });
    const data = { no: item.no, ticker: item.ticker, issueDate: item.issueDate, entryDate: item.entryDate ?? item.issueDate, exitDate: item.exitPlanned, agreement: item.agreement, token };
    return renderSms(item.kind, locale, data);
  }

  function render(item, locale, { token = 'XXXXXX', publishedAt } = {}) {
    const sl = locale === 'sl';
    const sms = smsText(item, locale, token);
    const line = stripStop(sms);
    const slot = issueSlot(item.issueDate);
    const label = sl ? KIND_SL[item.kind] : item.kind;
    const page = `${base}/#p-${item.no}`;
    const push = {
      title: `Quorum #${item.no} ${label} ${item.ticker}`,
      body: line,
      url: page,
      tag: `quorum-${item.no}-${item.kind}`,
      kind: item.kind,
      no: item.no,
      issueDate: item.issueDate,
      publishedAt,
      simulated: true,
    };
    const subject = `Quorum #${item.no} ${label} ${item.ticker} · ${fmtDDMMYY(item.issueDate)} 14:00 ${slot.tzLabel}`;
    const lines = [line, ''];
    if (item.kind !== 'CLOSE') {
      if (item.thesis) {
        const who = item.approver ? `${item.approver.name}${item.approver.title ? `, ${item.approver.title}` : ''}` : null;
        const drafted =
          item.drafter === 'approver'
            ? sl ? `Utemeljitev je napisal(a) ${who}.` : `Thesis written by ${who}.`
            : sl ? `To utemeljitev je iz naših modelskih podatkov pripravil model umetne inteligence, preveril(a) in odobril(a) pa jo je ${who}.` : `This explanation was drafted by an AI model from our model data and checked and approved by ${who}.`;
        lines.push(sl ? item.thesis.sl : item.thesis.en, '', drafted, '');
      }
      if (item.dissemination?.price != null) {
        lines.push(
          sl
            ? `Cena ob objavi: ${item.dissemination.price} USD (${item.dissemination.source}, ${item.dissemination.at}). Uspešnost merimo od naslednjega odprtja borze v ZDA.`
            : `Price at dissemination: ${item.dissemination.price} USD (${item.dissemination.source}, ${item.dissemination.at}). Performance is measured from the next US open.`,
        );
      }
      lines.push(sl ? `Izstop ob odprtju borze v ZDA ${fmtLong(item.exitPlanned, 'sl')}. Ciljne cene ni.` : `Exit at the US open on ${fmtLong(item.exitPlanned, 'en')}. No price target.`);
    } else {
      lines.push(sl ? `Rezultat po odprtju borze v ZDA: ${page}` : `Result after the US open: ${page}`);
    }
    lines.push(
      '',
      sl ? `Raziskovalna opomba in razkritja: ${page}` : `Research note and disclosures: ${page}`,
      sl ? `Objavljeno ${publishedAt}.` : `Published ${publishedAt}.`,
      '',
      sl ? 'Splošna raziskava, objavljena za javnost. Ni osebni nasvet. Simuliran trg, izmišljena podjetja.' : 'General research issued to the public. Not personal advice. Simulated market, fictional companies.',
      sl ? `Nastavitve obvestil: ${base}/#account` : `Notification settings: ${base}/#account`,
    );
    return { sms, push, email: { subject, text: lines.join('\n') } };
  }

  // ---------------------------------------------------------------- recipients
  function recipientsFor(now = ctx.now()) {
    return db.all(
      `SELECT u.id, u.email, u.locale, u.timezone, COALESCE(cp.sms, 0) AS pref_sms, COALESCE(cp.push, 1) AS pref_push, COALESCE(cp.email, 1) AS pref_email
       FROM users u
       JOIN entitlements e ON e.user_id = u.id AND e.feature = 'picks' AND e.active_until > ?
       LEFT JOIN channel_prefs cp ON cp.user_id = u.id
       WHERE u.status != 'deleted'
       ORDER BY u.id`,
      iso(now),
    );
  }

  // enqueueIssue({ date, items, publishedAt }) -> { recipients, rows, sms: {reasons}, plannedSmsSeconds }
  // Every row exists before deliverIssue() calls a provider. Recipients are written in chunks of
  // ENQUEUE_CHUNK users per transaction, yielding to the event loop between chunks so the server keeps
  // answering (status callbacks, the site) while a large issue is enqueued.
  async function enqueueIssue({ date, items, publishedAt }) {
    const picks = (items ?? []).filter((x) => PICK_KINDS.includes(x.kind));
    const out = { date, items: picks.length, recipients: 0, rows: { sms: 0, push: 0, email: 0 }, smsSkipped: {}, blocked: [], plannedSmsSeconds: 0 };
    if (!picks.length) return out;
    const now = ctx.now();
    const expiresAt = new Date(issueSlot(date).usOpenAt);
    // A body that fails validation blocks that item's texts for everyone and pages on-call.
    const blocked = new Set();
    for (const it of picks) {
      for (const locale of ['en', 'sl']) {
        const v = validateSms(smsText(it, locale, 'Z'.repeat(TOKEN_LENGTH)));
        if (!v.ok) {
          blocked.add(it.recId);
          out.blocked.push({ no: it.no, kind: it.kind, locale, errors: v.errors });
          ctx.alerts?.raise('sms_template_invalid', `Blocked ${it.kind} #${it.no} texts (${locale}): ${v.errors.join('; ')}`, { severity: 'page', dedupeKey: `template:${it.recId}` });
        }
      }
    }
    // Push and email content is the same for every reader of a locale: rendered once per item.
    const shared = new Map();
    const sharedFor = (it, locale) => {
      const key = `${it.recId}:${locale}`;
      if (!shared.has(key)) {
        const c = render(it, locale, { publishedAt });
        shared.set(key, { push: JSON.stringify(c.push), email: c.email });
      }
      return shared.get(key);
    };
    const users = recipientsFor(now);
    out.recipients = users.length;
    const skip = (reason) => (out.smsSkipped[reason] = (out.smsSkipped[reason] ?? 0) + 1);
    for (let k = 0; k < users.length; k += ENQUEUE_CHUNK) {
      db.tx(() => {
        for (const u of users.slice(k, k + ENQUEUE_CHUNK)) {
          const locale = u.locale === 'sl' ? 'sl' : 'en';
          const st = ctx.messaging.smsState(u.id);
          const hasPush = u.pref_push && db.get('SELECT 1 AS x FROM push_subscriptions WHERE user_id = ? AND revoked_at IS NULL LIMIT 1', u.id);
          let token = null;
          let zone = null;
          let inside = true;
          if (st.allowed) {
            token = ensureUnsubscribeToken(db, u.id, now);
            zone = recipientZone(db, u.id, st.phone.country);
            inside = quietHoursNextAllowed(now, zone, config.quietHours) == null;
          }
          for (const it of picks) {
            const content = sharedFor(it, locale);
            if (!st.allowed) skip(st.reason);
            else if (blocked.has(it.recId)) skip('template_invalid');
            else {
              const q = ctx.messaging.queue({
                userId: u.id,
                channel: 'sms',
                kind: it.kind,
                to: st.phone.e164,
                body: smsText(it, locale, token),
                idemKey: `${it.recId}:${u.id}:sms`,
                recId: it.recId,
                expiresAt,
                status: inside ? 'queued' : 'cancelled',
                errorCode: inside ? null : 'quiet_hours',
                timeZone: zone,
              });
              if (q.created) {
                if (inside) out.rows.sms++;
                else skip('quiet_hours');
              }
            }
            if (hasPush) {
              const q = ctx.messaging.queue({ userId: u.id, channel: 'push', kind: it.kind, to: null, body: content.push, idemKey: `${it.recId}:${u.id}:push`, recId: it.recId });
              if (q.created) out.rows.push++;
            }
            if (u.pref_email && u.email) {
              const q = ctx.messaging.queue({ userId: u.id, channel: 'email', kind: it.kind, to: u.email, subject: content.email.subject, body: content.email.text, idemKey: `${it.recId}:${u.id}:email`, recId: it.recId });
              if (q.created) out.rows.email++;
            }
          }
        }
      });
      if (k + ENQUEUE_CHUNK < users.length) await new Promise((r) => setImmediate(r));
    }
    out.plannedSmsSeconds = Math.round((out.rows.sms / config.fanout.smsPerSecond) * 10) / 10;
    if (out.plannedSmsSeconds > config.fanout.windowSec) {
      ctx.alerts?.raise('fanout_capacity', `${out.rows.sms} texts at ${config.fanout.smsPerSecond}/s need ${out.plannedSmsSeconds}s, more than the ${config.fanout.windowSec}s window: raise SMS_MPS with Twilio`, { severity: 'page', dedupeKey: `capacity:${date}` });
    }
    return out;
  }

  // deliverIssue(date, { sleep }) -> summary. SMS paced; push and email in parallel with it.
  async function deliverIssue(date, { sleep = ctx.sleep ?? realSleep } = {}) {
    let published = null;
    try {
      published = JSON.parse(db.get('SELECT items_json FROM issue_runs WHERE issue_date = ?', date)?.items_json ?? 'null');
    } catch {
      published = null;
    }
    const recIds = (published?.items ?? []).filter((x) => PICK_KINDS.includes(x.kind)).map((x) => x.recId);
    const startedAt = ctx.now();
    const idsFor = (channel) =>
      recIds.length
        ? db.all(`SELECT id FROM notifications WHERE channel = ? AND status = 'queued' AND rec_id IN (${recIds.map(() => '?').join(',')}) ORDER BY id`, channel, ...recIds).map((r) => r.id)
        : [];
    const sms = idsFor('sms');
    const push = idsFor('push');
    const email = idsFor('email');
    const timing = { startedAt: iso(startedAt), smsDoneAt: null, pushDoneAt: null, emailDoneAt: null };
    const wait = createPacer({ perSecond: config.fanout.smsPerSecond, now: ctx.now, sleep });
    const smsLane = (async () => {
      let stoppedBy = null;
      for (const id of sms) {
        if (db.getSetting('sms_paused') === '1') {
          stoppedBy = 'sms_paused'; // rows stay queued; they go out on resume if still valid
          break;
        }
        await wait();
        await ctx.messaging.dispatch([id]);
      }
      timing.smsDoneAt = iso(ctx.now());
      return stoppedBy;
    })();
    const pushLane = pool(push, config.fanout.pushConcurrency, (id) => ctx.messaging.dispatch([id])).then(() => (timing.pushDoneAt = iso(ctx.now())));
    const emailLane = pool(email, config.fanout.emailConcurrency, (id) => ctx.messaging.dispatch([id])).then(() => (timing.emailDoneAt = iso(ctx.now())));
    const [smsStopped] = await Promise.all([smsLane, pushLane, emailLane]);
    const finishedAt = ctx.now();
    const summary = {
      date,
      ...timing,
      finishedAt: iso(finishedAt),
      seconds: Math.round((finishedAt - startedAt) / 100) / 10,
      smsStopped,
      counts: channelCounts(recIds),
    };
    db.run('UPDATE issue_runs SET delivery_json = ?, updated_at = ? WHERE issue_date = ?', JSON.stringify(summary), iso(finishedAt), date);
    if (summary.seconds > config.fanout.windowSec) {
      ctx.alerts?.raise('fanout_slow', `The ${date} fan-out took ${summary.seconds}s (window ${config.fanout.windowSec}s)`, { severity: 'warn', dedupeKey: `slow:${date}` });
    }
    return summary;
  }

  function channelCounts(recIds) {
    const out = { sms: {}, push: {}, email: {} };
    if (!recIds.length) return out;
    for (const r of db.all(`SELECT channel, status, COUNT(*) AS n FROM notifications WHERE rec_id IN (${recIds.map(() => '?').join(',')}) GROUP BY channel, status`, ...recIds)) {
      out[r.channel][r.status] = r.n;
    }
    return out;
  }

  // ---------------------------------------------------------------- Sunday 18:00: the weekly Ledger email
  // weeklyLedger(sunday) -> { sent, recipients }. Every reader inside the geofence with a verified email
  // and email on gets it (it is part of the free Ledger tier); open picks show their ticker only to
  // readers entitled to picks.
  async function weeklyLedger(sunday, { concurrency = config.fanout.emailConcurrency } = {}) {
    const from = addDays(sunday, -6);
    const to = addDays(sunday, -1);
    const issues = db.all('SELECT * FROM issues WHERE issue_date BETWEEN ? AND ? ORDER BY issue_date', from, to);
    const issueBodies = new Map(
      db.all("SELECT issue_date, body_json FROM ledger_entries WHERE type = 'ISSUE' AND issue_date BETWEEN ? AND ? ORDER BY seq", from, to).map((r) => [r.issue_date, JSON.parse(r.body_json)]),
    );
    const closes = db.all("SELECT issue_date, body_json FROM ledger_entries WHERE type = 'CLOSE' AND issue_date BETWEEN ? AND ? ORDER BY seq", from, to).map((r) => ({ date: r.issue_date, ...JSON.parse(r.body_json) }));
    const open = openPicks();
    const stats = db.get('SELECT COUNT(*) AS n, SUM(CASE WHEN excess > 0 THEN 1 ELSE 0 END) AS wins FROM outcomes');
    const users = db.all(
      `SELECT u.id, u.email, u.locale, COALESCE(cp.email, 1) AS pref_email FROM users u LEFT JOIN channel_prefs cp ON cp.user_id = u.id
       WHERE u.status = 'geo_ok' AND u.email IS NOT NULL AND u.email_verified_at IS NOT NULL ORDER BY u.id`,
    ).filter((u) => u.pref_email);
    const now = ctx.now();
    const ids = [];
    db.tx(() => {
      for (const u of users) {
        const locale = u.locale === 'sl' ? 'sl' : 'en';
        const entitled = Boolean(db.get("SELECT 1 AS x FROM entitlements WHERE user_id = ? AND feature = 'picks' AND active_until > ?", u.id, iso(now)));
        const text = weeklyText({ locale, from, to, issues, issueBodies, closes, open, stats, entitled });
        const subject = locale === 'sl' ? `Quorum: tedenski dnevnik ${fmtLong(from, 'sl')} - ${fmtLong(to, 'sl')}` : `Quorum weekly Ledger, ${fmtLong(from, 'en')} - ${fmtLong(to, 'en')}`;
        const q = ctx.messaging.queue({ userId: u.id, channel: 'email', kind: 'WEEKLY', to: u.email, subject, body: text, idemKey: `WEEKLY:${sunday}:${u.id}` });
        if (q.created) ids.push(q.id);
      }
    });
    await pool(ids, concurrency, (id) => ctx.messaging.dispatch([id]));
    return { sunday, from, to, recipients: users.length, queued: ids.length };
  }

  function openPicks() {
    const recs = db.all("SELECT r.id, r.public_no, r.kind, r.planned_exit_date, r.sha256 FROM recommendations r WHERE r.kind IN ('BUY', 'RENEW') ORDER BY r.public_no");
    const closed = new Set(db.all("SELECT public_no FROM recommendations WHERE kind = 'CLOSE'").map((r) => r.public_no));
    const renewed = new Set(db.all("SELECT prior_rec_id FROM recommendations WHERE kind = 'RENEW' AND prior_rec_id IS NOT NULL").map((r) => r.prior_rec_id));
    return recs
      .filter((r) => !closed.has(r.public_no) && !renewed.has(r.id))
      .map((r) => {
        const e = db.get("SELECT body_json FROM ledger_entries WHERE type IN ('BUY', 'RENEW') AND json_extract(body_json, '$.no') = ?", r.public_no);
        const reveal = db.get('SELECT reveal_json FROM pick_reveals WHERE no = ?', r.public_no);
        return { no: r.public_no, kind: r.kind, exitPlanned: r.planned_exit_date, commit: e ? JSON.parse(e.body_json).commit : null, ticker: reveal ? JSON.parse(reveal.reveal_json).ticker : null };
      });
  }

  function weeklyText({ locale, from, to, issues, issueBodies, closes, open, stats, entitled }) {
    const sl = locale === 'sl';
    const L = [];
    L.push(sl ? `Tedenski dnevnik Quorum, ${fmtLong(from, 'sl')} - ${fmtLong(to, 'sl')}` : `Quorum weekly Ledger, ${fmtLong(from, 'en')} - ${fmtLong(to, 'en')}`, '');
    L.push(sl ? 'Izdaje:' : 'Issues:');
    if (!issues.length) L.push(sl ? '  Ta teden ni bilo izdaj.' : '  No issues this week.');
    for (const i of issues) {
      const b = issueBodies.get(i.issue_date) ?? {};
      const picks = [...(b.buys ?? []).map((n) => `#${n} BUY`), ...(b.renews ?? []).map((n) => `#${n} RENEW`), ...(b.closes ?? []).map((n) => `#${n} CLOSE`)];
      const what = picks.length ? picks.join(', ') : sl ? `brez kvoruma (najbližje ${i.closest_agreement}/4, ocenjenih ${i.n_scored})` : `no quorum (closest ${i.closest_agreement}/4, ${i.n_scored} scored)`;
      L.push(`  #${i.issue_no} ${fmtLong(i.issue_date, locale)}: ${what}`);
    }
    L.push('', sl ? 'Zaprte izbire:' : 'Closed picks:');
    if (!closes.length) L.push(sl ? '  Ta teden nobena.' : '  None this week.');
    for (const c of closes) {
      const pct = (x) => (x == null ? '-' : `${x >= 0 ? '+' : '-'}${Math.abs(x * 100).toFixed(1)}%`);
      L.push(`  #${c.no} ${c.reveal?.ticker ?? ''}: ${sl ? 'neto' : 'net'} ${pct(c.net)}, ${sl ? 'presežek nad indeksom' : 'excess vs benchmark'} ${pct(c.excess)}`);
    }
    L.push('', sl ? 'Odprte izbire:' : 'Open picks:');
    if (!open.length) L.push(sl ? '  Nobena.' : '  None.');
    for (const o of open) {
      const who = entitled && o.ticker ? o.ticker : `${sl ? 'zapečateno' : 'sealed'} ${String(o.commit ?? '').slice(0, 8)}`;
      L.push(`  #${o.no} ${o.kind} ${who}, ${sl ? 'izstop' : 'exit'} ${fmtLong(o.exitPlanned, locale)}`);
    }
    if (stats?.n) L.push('', sl ? `Zaprtih izbir v zapisu strežnika: ${stats.n}, nad indeksom: ${stats.wins}.` : `Closed picks on this server's record: ${stats.n}, beat the benchmark: ${stats.wins}.`);
    L.push('', sl ? `Celoten dnevnik: ${base}/#ledger` : `The full Ledger: ${base}/#ledger`);
    L.push(sl ? 'Splošna raziskava. Ni osebni nasvet. Simuliran trg, izmišljena podjetja.' : 'General research. Not personal advice. Simulated market, fictional companies.');
    L.push(sl ? `Odjava od e-pošte: ${base}/#account` : `Stop these emails: ${base}/#account`);
    return L.join('\n');
  }

  return { enqueueIssue, deliverIssue, weeklyLedger, render, recipientsFor, channelCounts };
}

// ------------------------------------------------------------------ push subscription routes
// pushHostAllowed(hostname, hosts) -> true when the host is one of the push services (an entry
// '*.push.apple.com' matches any subdomain of push.apple.com).
export function pushHostAllowed(hostname, hosts) {
  const h = String(hostname ?? '').toLowerCase().replace(/\.$/, '');
  return hosts.some((e) => (e.startsWith('*.') ? h.endsWith(e.slice(1)) && h.length > e.length - 1 : h === e));
}

// checkPushEndpoint(endpoint, hosts) -> URL; throws HttpError 400 unless it is an https URL on a
// push service, on the default port and without credentials.
export function checkPushEndpoint(endpoint, hosts) {
  let url;
  try {
    url = new URL(String(endpoint ?? ''));
  } catch {
    throw new HttpError(400, 'invalid_endpoint', 'endpoint must be an https URL');
  }
  if (url.protocol !== 'https:' || String(endpoint).length > 1024 || url.username || url.password || (url.port && url.port !== '443')) {
    throw new HttpError(400, 'invalid_endpoint', 'endpoint must be an https URL');
  }
  if (!pushHostAllowed(url.hostname, hosts)) throw new HttpError(400, 'invalid_endpoint', 'endpoint is not on a known Web Push service');
  return url;
}

export function registerPushRoutes(router, ctx) {
  const { db, config } = ctx;
  router.add('GET', '/api/push/key', async () => ({ publicKey: ctx.push?.publicKey ?? null, transport: ctx.push?.kind ?? null }));

  router.add(
    'POST',
    '/api/push/subscribe',
    async (req, res, { body, user }) => {
      const endpoint = String(body?.endpoint ?? '');
      const p256dh = String(body?.keys?.p256dh ?? '');
      const auth = String(body?.keys?.auth ?? '');
      checkPushEndpoint(endpoint, config.push.hosts);
      const k = b64u.dec(p256dh);
      if (k.length !== 65 || k[0] !== 4) throw new HttpError(400, 'invalid_key', 'keys.p256dh must be an uncompressed P-256 public key');
      if (b64u.dec(auth).length !== 16) throw new HttpError(400, 'invalid_key', 'keys.auth must be 16 bytes');
      const now = iso(ctx.now());
      let revoked = 0;
      db.tx(() => {
        db.run(
          `INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth, created_at) VALUES (?, ?, ?, ?, ?)
           ON CONFLICT(endpoint) DO UPDATE SET user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth, created_at = excluded.created_at, revoked_at = NULL`,
          user.id,
          endpoint,
          p256dh,
          auth,
          now,
        );
        // At most config.push.maxPerUser live devices per user: the oldest are revoked first.
        const live = db.all('SELECT id FROM push_subscriptions WHERE user_id = ? AND revoked_at IS NULL ORDER BY created_at DESC, id DESC', user.id);
        for (const r of live.slice(Math.max(1, config.push.maxPerUser))) {
          revoked += db.run('UPDATE push_subscriptions SET revoked_at = ? WHERE id = ?', now, r.id).changes;
        }
      });
      return { ok: true, revokedOldest: revoked };
    },
    { auth: true, accepts: ['json'] },
  );

  router.add(
    'POST',
    '/api/push/unsubscribe',
    async (req, res, { body, user }) => {
      const r = db.run('UPDATE push_subscriptions SET revoked_at = COALESCE(revoked_at, ?) WHERE user_id = ? AND endpoint = ?', iso(ctx.now()), user.id, String(body?.endpoint ?? ''));
      return { ok: true, removed: r.changes };
    },
    { auth: true, accepts: ['json'] },
  );
}
