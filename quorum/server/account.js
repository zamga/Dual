// Account endpoints: GET /api/me, POST /api/prefs, GET /api/export, POST /api/account/delete,
// GET /api/health.
import { maskPhone } from '../core/consent-texts.js';
import { HttpError, appendHeader, sendJson } from './http.js';
import { consentSummary, hasGrant } from './consent.js';
import { entitlementsFor, revokeAll } from './entitlements.js';
import { iso, addMs } from './util.js';
import { validTimeZone } from './messaging.js';

const PENDING_CHECKOUT_MS = 2 * 60 * 60 * 1000;

// meFor(ctx, user) -> the /api/me body for a signed-in user
export function meFor(ctx, user) {
  const { db, config } = ctx;
  const now = ctx.now();
  const phone = db.get('SELECT * FROM phone_numbers WHERE user_id = ?', user.id);
  const prefs = db.get('SELECT sms, push, email FROM channel_prefs WHERE user_id = ?', user.id) ?? { sms: 0, push: 1, email: 1 };
  const entitlements = entitlementsFor(db, user.id, now);
  let activation = 'none';
  if (entitlements.picks.active) activation = 'active';
  else {
    const cs = db.get('SELECT created_at FROM checkout_sessions WHERE user_id = ? ORDER BY created_at DESC LIMIT 1', user.id);
    const sub = db.get("SELECT status FROM subscriptions WHERE user_id = ? ORDER BY id DESC LIMIT 1", user.id);
    if (cs && new Date(cs.created_at) > addMs(now, -PENDING_CHECKOUT_MS) && (!sub || ['incomplete', 'active', 'trialing'].includes(sub.status))) activation = 'pending';
  }
  const sms = ctx.messaging.smsState(user.id);
  const push = db.get('SELECT COUNT(*) AS n FROM push_subscriptions WHERE user_id = ? AND revoked_at IS NULL', user.id).n;
  return {
    authenticated: true,
    user: {
      id: user.id,
      email: user.email,
      locale: user.locale,
      declaredCountry: user.declared_country,
      jurisdiction: user.jurisdiction,
      status: user.status,
      timeZone: user.timezone ?? null,
    },
    geo: {
      ok: user.status === 'geo_ok',
      country: user.jurisdiction,
      smsEligible: Boolean(user.jurisdiction && config.smsCountries.includes(user.jurisdiction)),
      blocked: user.status === 'geo_blocked' ? (user.blocked_reason || '').split(',').filter(Boolean) : [],
    },
    phone: phone ? { masked: maskPhone(phone.e164), country: phone.country, verified: Boolean(phone.verified_at), invalid: Boolean(phone.invalid_at) } : null,
    consents: consentSummary(db, user.id),
    entitlements: { picks: { active: entitlements.picks.active, until: entitlements.picks.until }, research_data: { active: entitlements.research_data.active, until: entitlements.research_data.until } },
    subscription: ctx.billing.subscriptionSummary(user.id),
    activation,
    prefs: { sms: Boolean(prefs.sms), push: Boolean(prefs.push), email: Boolean(prefs.email) },
    sms: { on: sms.allowed && entitlements.picks.active, reason: sms.allowed ? (entitlements.picks.active ? null : 'not_entitled') : sms.reason },
    withdrawal: ctx.billing.withdrawalInfo(user.id, now),
    pushPrompt: entitlements.picks.active && push === 0,
  };
}

// exportFor(ctx, userId) -> every row we hold about the user, as JSON (GDPR Art. 15 and 20)
export function exportFor(ctx, userId) {
  const { db } = ctx;
  const user = db.get('SELECT * FROM users WHERE id = ?', userId);
  const q = (sql, ...p) => db.all(sql, ...p);
  const notifications = q('SELECT * FROM notifications WHERE user_id = ? ORDER BY id', userId);
  const sids = notifications.map((n) => n.provider_sid).filter(Boolean);
  const delivery = sids.length ? q(`SELECT * FROM delivery_events WHERE provider_sid IN (${sids.map(() => '?').join(',')}) ORDER BY id`, ...sids) : [];
  const needles = [userId, user?.stripe_customer_id].filter(Boolean);
  const events = needles.length
    ? q(`SELECT id, provider, event_id, type, payload, received_at FROM processed_events WHERE ${needles.map(() => 'instr(payload, ?) > 0').join(' OR ')} ORDER BY id`, ...needles).map((e) => ({
        ...e,
        payload: safeJson(e.payload),
      }))
    : [];
  return {
    exportedAt: iso(ctx.now()),
    format: 'quorum-export/1',
    user,
    sessions: q('SELECT id, created_at, expires_at, revoked_at, ip, user_agent FROM sessions WHERE user_id = ? ORDER BY created_at', userId),
    signInLinks: q('SELECT created_at, expires_at, used_at, ip, locale FROM magic_links WHERE user_id = ? ORDER BY created_at', userId),
    geoChecks: q('SELECT * FROM geo_checks WHERE user_id = ? ORDER BY id', userId),
    phoneNumbers: q('SELECT * FROM phone_numbers WHERE user_id = ?', userId),
    consentEvents: q('SELECT * FROM consent_events WHERE user_id = ? ORDER BY id', userId),
    channelPrefs: q('SELECT * FROM channel_prefs WHERE user_id = ?', userId),
    pushSubscriptions: q('SELECT id, endpoint, created_at, revoked_at FROM push_subscriptions WHERE user_id = ?', userId),
    unsubscribeTokens: q('SELECT * FROM unsubscribe_tokens WHERE user_id = ?', userId),
    checkoutSessions: q('SELECT * FROM checkout_sessions WHERE user_id = ? ORDER BY created_at', userId),
    subscriptions: q('SELECT * FROM subscriptions WHERE user_id = ? ORDER BY id', userId),
    entitlements: q('SELECT * FROM entitlements WHERE user_id = ?', userId),
    withdrawals: q('SELECT * FROM withdrawals WHERE user_id = ? ORDER BY id', userId),
    notifications,
    deliveryEvents: delivery.map((d) => ({ ...d, payload: safeJson(d.payload) })),
    optOuts: q('SELECT * FROM opt_outs WHERE user_id = ? ORDER BY id', userId),
    billingEvents: events,
  };
}

function safeJson(s) {
  try {
    return JSON.parse(s);
  } catch {
    return s;
  }
}

// deleteAccount(ctx, userId, { ip }) -> summary. Anonymises the user; keeps the append-only
// compliance rows (consent_events, opt_outs, processed_events, delivery_events, access_log) and
// billing records the law requires, which then point at an anonymised user id.
export async function deleteAccount(ctx, userId, { ip = null } = {}) {
  const { db } = ctx;
  await ctx.billing.cancelAllForDeletion(userId); // throws if Stripe is down: we never stop tracking a live subscription
  await ctx.optout.optOutSms(userId, { source: 'deletion', channel: 'account', ip, confirm: false });
  const now = iso(ctx.now());
  db.tx(() => {
    revokeAll(db, userId, 'deleted', ctx.now());
    db.run('UPDATE sessions SET revoked_at = COALESCE(revoked_at, ?) WHERE user_id = ?', now, userId);
    db.run('DELETE FROM magic_links WHERE user_id = ?', userId);
    db.run('DELETE FROM geo_checks WHERE user_id = ?', userId);
    db.run('DELETE FROM phone_numbers WHERE user_id = ?', userId);
    db.run('DELETE FROM channel_prefs WHERE user_id = ?', userId);
    db.run('DELETE FROM push_subscriptions WHERE user_id = ?', userId);
    db.run('DELETE FROM unsubscribe_tokens WHERE user_id = ?', userId);
    db.run("UPDATE notifications SET status = CASE WHEN status = 'queued' THEN 'cancelled' ELSE status END, to_addr = NULL, subject = NULL, body = NULL, updated_at = ? WHERE user_id = ?", now, userId);
    db.run(
      `UPDATE users SET email = NULL, email_verified_at = NULL, declared_country = NULL, ip_country = NULL, jurisdiction = NULL,
         blocked_reason = NULL, timezone = NULL, status = 'deleted', deleted_at = ?, updated_at = ? WHERE id = ?`,
      now,
      now,
      userId,
    );
  });
  return {
    deleted: true,
    retained: [
      { data: 'consent records (text version and hash, time, IP, user agent, page)', why: 'proof of consent, kept 5 years (brief §2.7)' },
      { data: 'opt-out records', why: 'proof that texts stopped' },
      { data: 'subscription, payment, refund and withdrawal records', why: 'accounting and tax law' },
      { data: 'delivery receipts (phone number stored only as a hash)', why: 'messaging audit' },
    ],
  };
}

export function registerAccountRoutes(router, ctx) {
  const { db } = ctx;

  router.add('GET', '/api/health', async () => {
    let dbOk = true;
    try {
      db.get('SELECT 1 AS x');
    } catch {
      dbOk = false;
    }
    return {
      ok: dbOk,
      time: iso(ctx.now()),
      db: dbOk ? 'ok' : 'error',
      smsTransport: ctx.sms.kind,
      emailTransport: ctx.email.kind,
      smsPaused: db.getSetting('sms_paused') === '1',
      scheduler: ctx.config.scheduler,
    };
  });

  router.add('GET', '/api/me', async (req, res, { user }) => (user ? meFor(ctx, user) : { authenticated: false }));

  router.add(
    'POST',
    '/api/prefs',
    async (req, res, { body, user, ip }) => {
      const b = body ?? {};
      for (const k of ['sms', 'push', 'email']) {
        if (b[k] != null && typeof b[k] !== 'boolean') throw new HttpError(400, 'invalid_prefs', `${k} must be true or false`);
      }
      // timeZone: the IANA zone for recipient-local quiet hours (null clears it; the phone's country is used then)
      if (b.timeZone !== undefined) {
        if (b.timeZone !== null && !validTimeZone(b.timeZone)) throw new HttpError(400, 'invalid_time_zone', 'timeZone must be an IANA time zone such as Europe/Ljubljana');
        db.run('UPDATE users SET timezone = ?, updated_at = ? WHERE id = ?', b.timeZone, iso(ctx.now()), user.id);
      }
      const now = ctx.now();
      if (b.sms === false) {
        await ctx.optout.optOutSms(user.id, { source: 'account', channel: 'account', ip, userAgent: req.headers['user-agent'], pageUrl: b.pageUrl ?? null });
      } else if (b.sms === true && !hasGrant(db, user.id, 'sms')) {
        throw new HttpError(409, 'consent_required', 'Tick the SMS consent box to switch on text alerts.', { missing: ['sms'] });
      }
      db.tx(() => {
        const cur = db.get('SELECT * FROM channel_prefs WHERE user_id = ?', user.id) ?? { sms: 0, push: 1, email: 1 };
        const next = {
          sms: b.sms == null ? cur.sms : b.sms ? 1 : 0,
          push: b.push == null ? cur.push : b.push ? 1 : 0,
          email: b.email == null ? cur.email : b.email ? 1 : 0,
        };
        for (const ch of ['push', 'email']) {
          if (cur[ch] && !next[ch]) db.run('INSERT INTO opt_outs (user_id, channel, source, created_at) VALUES (?, ?, ?, ?)', user.id, ch, 'account', iso(now));
        }
        db.run(
          `INSERT INTO channel_prefs (user_id, sms, push, email, updated_at) VALUES (?, ?, ?, ?, ?)
           ON CONFLICT(user_id) DO UPDATE SET sms = excluded.sms, push = excluded.push, email = excluded.email, updated_at = excluded.updated_at`,
          user.id,
          next.sms,
          next.push,
          next.email,
          iso(now),
        );
      });
      if (b.sms === true) await ctx.messaging.maybeSendOptIn(user.id);
      const p = db.get('SELECT sms, push, email FROM channel_prefs WHERE user_id = ?', user.id);
      return { ok: true, prefs: { sms: Boolean(p.sms), push: Boolean(p.push), email: Boolean(p.email) } };
    },
    { auth: true, accepts: ['json'] },
  );

  router.add(
    'GET',
    '/api/export',
    async (req, res, { user }) => {
      const data = exportFor(ctx, user.id);
      return sendJson(res, 200, data, { 'content-disposition': `attachment; filename="quorum-export-${user.id}.json"` });
    },
    { auth: true, rate: 'account' },
  );

  router.add(
    'POST',
    '/api/account/delete',
    async (req, res, { body, user, ip }) => {
      if (body?.confirm !== true) throw new HttpError(400, 'confirm_required', 'Send {"confirm": true} to delete the account.');
      let r;
      try {
        r = await deleteAccount(ctx, user.id, { ip });
      } catch (e) {
        if (e instanceof HttpError) throw e;
        ctx.log.error(`[account] delete ${user.id} failed: ${e.message}`);
        throw new HttpError(502, 'delete_failed', 'We could not cancel your subscription with our payment provider, so nothing was deleted. Try again in a few minutes.');
      }
      appendHeader(res, 'set-cookie', ctx.auth.clearCookie());
      return { ok: true, ...r };
    },
    { auth: true, accepts: ['json'], rate: 'account' },
  );
}
