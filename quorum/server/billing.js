// Billing (brief §4.2 steps 5-7, §4.4, §6). Stripe is the payment system; our entitlements are
// derived from Stripe's current state, never from a redirect or from the order events arrive in.
//   - every webhook is verified, deduplicated on event.id (processed_events) and re-fetches the subscription
//   - entitlement runs to current_period_end + 3 days (no grace once cancel_at_period_end is set)
//   - a failed payment suspends alerts 7 days after the first failure
//   - a dispute, a withdrawal or a card-country mismatch revokes at once
//   - the EU withdrawal button: withdrawals row, Stripe refund, immediate cancellation
import { HttpError, sendJson } from './http.js';
import { StripeError, StripeSignatureError, subscriptionPeriod, invoiceSubscriptionId, subscriptionPrice } from './vendors/stripe.js';
import { hasGrant } from './consent.js';
import { TIER_FEATURES, FEATURES, setEntitlement, entitlementsFor } from './entitlements.js';
import { reason, normalizeCountry, evaluateGeo } from './geofence.js';
import { iso, fromUnix, DAY_MS } from './util.js';
import { isUniqueError } from './db.js';

const TIERS = ['signal', 'research'];
const INTERVALS = ['month', 'year'];
const LIVE_STATUSES = ['active', 'trialing', 'past_due', 'unpaid'];

// entitlementUntil(subRow, config) -> Date | null. Pure: the rule table of brief §4.4 and §6.
export function entitlementUntil(sub, { graceDays = 3, failedPaymentSuspendDays = 7 } = {}) {
  if (!sub || !sub.first_paid_at) return null; // no entitlement before a paid invoice
  if (sub.disputed_at || sub.withdrawn_at || sub.geo_mismatch_at) return null;
  if (!sub.current_period_end) return null;
  const cpe = new Date(sub.current_period_end).getTime();
  const grace = graceDays * DAY_MS;
  switch (sub.status) {
    case 'active':
    case 'trialing':
      return new Date(sub.cancel_at_period_end ? cpe : cpe + grace);
    case 'past_due':
    case 'unpaid': {
      let until = cpe + grace;
      if (sub.payment_failed_at) until = Math.min(until, new Date(sub.payment_failed_at).getTime() + failedPaymentSuspendDays * DAY_MS);
      return new Date(until);
    }
    default:
      // canceled, incomplete, incomplete_expired, paused
      return null;
  }
}

export function createBilling(ctx) {
  const { db, config } = ctx;
  const stripe = () => ctx.stripe;

  function tierFromRemote(remote) {
    const t = remote?.metadata?.tier;
    if (TIERS.includes(t)) return t;
    const priceId = subscriptionPrice(remote).id;
    for (const tier of TIERS) for (const i of INTERVALS) if (config.stripe.prices[tier][i] && config.stripe.prices[tier][i] === priceId) return tier;
    return 'signal';
  }

  function billingCountry(remote) {
    const pm = remote?.default_payment_method;
    if (!pm || typeof pm !== 'object') return null;
    return normalizeCountry(pm.billing_details?.address?.country ?? pm.card?.country ?? null);
  }

  // Resolve the user a Stripe object belongs to.
  function resolveUser({ remote, object, customerId }) {
    const ids = [remote?.metadata?.user_id, object?.client_reference_id, object?.metadata?.user_id].filter(Boolean);
    for (const id of ids) {
      const u = db.get('SELECT * FROM users WHERE id = ?', id);
      if (u) return u;
    }
    const cust = customerId ?? (typeof remote?.customer === 'string' ? remote.customer : remote?.customer?.id);
    if (cust) {
      const u = db.get('SELECT * FROM users WHERE stripe_customer_id = ?', cust);
      if (u) return u;
    }
    if (remote?.id) {
      const s = db.get('SELECT user_id FROM subscriptions WHERE stripe_subscription_id = ?', remote.id);
      if (s) return db.get('SELECT * FROM users WHERE id = ?', s.user_id);
    }
    return null;
  }

  // Upsert the subscriptions row from a re-fetched Stripe subscription. Synchronous (inside a tx).
  function upsertSubscription(user, remote, event, now) {
    const period = subscriptionPeriod(remote);
    const price = subscriptionPrice(remote);
    const customer = typeof remote.customer === 'string' ? remote.customer : remote.customer?.id ?? null;
    const row = {
      stripe_customer_id: customer,
      tier: tierFromRemote(remote),
      interval: price.interval,
      status: remote.status,
      current_period_start: fromUnix(period.start),
      current_period_end: fromUnix(period.end),
      cancel_at_period_end: remote.cancel_at_period_end ? 1 : 0,
      canceled_at: fromUnix(remote.canceled_at),
      ended_at: fromUnix(remote.ended_at),
      billing_country: billingCountry(remote),
      last_event_id: event?.id ?? null,
      last_event_created: event?.created ?? null,
      updated_at: iso(now),
    };
    const existing = db.get('SELECT * FROM subscriptions WHERE stripe_subscription_id = ?', remote.id);
    if (existing) {
      // Keep the newest event id for audit; the state itself always comes from the re-fetch.
      if (existing.last_event_created != null && event?.created != null && event.created < existing.last_event_created) {
        row.last_event_id = existing.last_event_id;
        row.last_event_created = existing.last_event_created;
      }
      if (!row.billing_country) row.billing_country = existing.billing_country;
      const keys = Object.keys(row);
      db.run(`UPDATE subscriptions SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`, ...keys.map((k) => row[k]), existing.id);
      return db.get('SELECT * FROM subscriptions WHERE id = ?', existing.id);
    }
    const keys = ['user_id', 'stripe_subscription_id', 'created_at', ...Object.keys(row)];
    const vals = [user.id, remote.id, iso(now), ...Object.values(row)];
    db.run(`INSERT INTO subscriptions (${keys.join(', ')}) VALUES (${keys.map(() => '?').join(', ')})`, ...vals);
    return db.get('SELECT * FROM subscriptions WHERE stripe_subscription_id = ?', remote.id);
  }

  // recomputeEntitlements(userId) -> { picks: Date|null, research_data: Date|null }. Synchronous.
  // The best grant across the user's subscriptions wins; a feature with no grant ends now.
  function recomputeEntitlements(userId, now = ctx.now()) {
    const subs = db.all('SELECT * FROM subscriptions WHERE user_id = ?', userId);
    const best = Object.fromEntries(FEATURES.map((f) => [f, { until: null, source: null }]));
    for (const s of subs) {
      const until = entitlementUntil(s, config.billing);
      if (!until) continue;
      for (const f of TIER_FEATURES[s.tier] ?? []) {
        if (!best[f].until || until > best[f].until) best[f] = { until, source: `stripe:${s.stripe_subscription_id}` };
      }
    }
    for (const f of FEATURES) {
      const row = db.get('SELECT active_until FROM entitlements WHERE user_id = ? AND feature = ?', userId, f);
      if (best[f].until) {
        setEntitlement(db, userId, f, best[f].until, best[f].source, now);
      } else if (row) {
        // End it now (or keep an earlier end), with the reason the last subscription gives.
        const s = subs.find((x) => TIER_FEATURES[x.tier]?.includes(f)) ?? subs[0];
        const why = s?.disputed_at ? 'dispute' : s?.withdrawn_at ? 'withdrawal' : s?.geo_mismatch_at ? 'geofence' : `stripe:${s?.stripe_subscription_id ?? 'none'}`;
        const ends = row.active_until && new Date(row.active_until) < now ? row.active_until : iso(now);
        setEntitlement(db, userId, f, ends, why, now);
      }
    }
    return Object.fromEntries(FEATURES.map((f) => [f, best[f].until]));
  }

  // ------------------------------------------------------------------ webhooks
  // handleEvent(event) -> { duplicate, type, userId }. Throws on transient failures (Stripe retries).
  async function handleEvent(event) {
    if (db.get("SELECT 1 AS x FROM processed_events WHERE provider = 'stripe' AND event_id = ?", event.id)) {
      return { duplicate: true, type: event.type };
    }
    const obj = event.data?.object ?? {};
    let subId = null;
    let customerId = null;
    let dispute = null;
    switch (event.type) {
      case 'checkout.session.completed':
        if (obj.mode === 'subscription') subId = typeof obj.subscription === 'string' ? obj.subscription : obj.subscription?.id;
        customerId = typeof obj.customer === 'string' ? obj.customer : obj.customer?.id ?? null;
        break;
      case 'invoice.paid':
      case 'invoice.payment_failed':
      case 'invoice.payment_action_required':
      case 'invoice.upcoming':
        subId = invoiceSubscriptionId(obj);
        customerId = typeof obj.customer === 'string' ? obj.customer : null;
        break;
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted':
      case 'customer.subscription.paused':
      case 'customer.subscription.resumed':
        subId = obj.id;
        break;
      case 'charge.dispute.created': {
        const chargeId = typeof obj.charge === 'string' ? obj.charge : obj.charge?.id;
        const charge = chargeId ? await stripe().retrieveCharge(chargeId) : null;
        customerId = typeof charge?.customer === 'string' ? charge.customer : charge?.customer?.id ?? null;
        dispute = { id: obj.id, chargeId, amount: obj.amount, reason: obj.reason };
        break;
      }
      default:
        break;
    }

    let remote = null;
    if (subId) {
      try {
        remote = await stripe().retrieveSubscription(subId); // always re-fetch
      } catch (e) {
        if (!(e instanceof StripeError && e.status === 404)) throw e;
      }
    }

    const now = ctx.now();
    const effects = [];
    let userId = null;
    try {
      db.tx(() => {
        db.run(
          'INSERT INTO processed_events (provider, event_id, type, payload, received_at) VALUES (?, ?, ?, ?, ?)',
          'stripe',
          event.id,
          event.type,
          JSON.stringify(event),
          iso(now),
        );
        const user = resolveUser({ remote, object: obj, customerId });
        if (!user) {
          ctx.log.warn(`[billing] ${event.type} ${event.id}: no matching user`);
          return;
        }
        userId = user.id;
        if (customerId && !user.stripe_customer_id && !db.get('SELECT id FROM users WHERE stripe_customer_id = ?', customerId)) {
          db.run('UPDATE users SET stripe_customer_id = ?, updated_at = ? WHERE id = ?', customerId, iso(now), user.id);
        }
        if (event.type === 'checkout.session.completed') {
          db.run('UPDATE checkout_sessions SET completed_at = COALESCE(completed_at, ?) WHERE id = ?', iso(now), obj.id);
        }

        let sub = remote ? upsertSubscription(user, remote, event, now) : null;
        if (sub) {
          const patch = {};
          if (event.type === 'invoice.paid' && !sub.first_paid_at && (obj.amount_paid ?? 0) >= 0) {
            patch.first_paid_at = fromUnix(obj.status_transitions?.paid_at) ?? iso(now);
            patch.first_invoice_id = obj.id;
            patch.first_amount_paid = obj.amount_paid ?? null;
            patch.currency = obj.currency ?? null;
          }
          if (sub.status === 'active' || sub.status === 'trialing') {
            if (sub.payment_failed_at) patch.payment_failed_at = null;
          } else if ((sub.status === 'past_due' || sub.status === 'unpaid') && !sub.payment_failed_at) {
            patch.payment_failed_at = event.type === 'invoice.payment_failed' ? fromUnix(event.created) ?? iso(now) : iso(now);
          }
          // Card billing country must match the agreed country (brief §2.1).
          if (!sub.geo_mismatch_at && sub.billing_country && user.jurisdiction && sub.billing_country !== user.jurisdiction && LIVE_STATUSES.includes(sub.status)) {
            patch.geo_mismatch_at = iso(now);
            const geo = evaluateGeo({ declaredCountry: user.jurisdiction, cardCountry: sub.billing_country, ipCountry: user.ip_country }, { smsCountries: config.smsCountries });
            db.run(
              `INSERT INTO geo_checks (user_id, stage, ip_country, declared_country, card_country, ok, reasons_json, created_at) VALUES (?, 'card', ?, ?, ?, 0, ?, ?)`,
              user.id,
              user.ip_country,
              user.jurisdiction,
              sub.billing_country,
              JSON.stringify(geo.reasons.map((r) => r.code)),
              iso(now),
            );
            effects.push({ kind: 'geo_reject', subId: sub.id, user });
          } else if (sub.geo_mismatch_at && !sub.geo_refund_id && event.type === 'invoice.paid') {
            effects.push({ kind: 'geo_reject', subId: sub.id, user }); // the payment arrived after the mismatch was seen
          }
          const keys = Object.keys(patch);
          if (keys.length) {
            db.run(`UPDATE subscriptions SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`, ...keys.map((k) => patch[k]), sub.id);
            sub = db.get('SELECT * FROM subscriptions WHERE id = ?', sub.id);
          }
        }

        if (dispute) {
          db.run('UPDATE subscriptions SET disputed_at = COALESCE(disputed_at, ?), updated_at = ? WHERE user_id = ?', iso(now), iso(now), user.id);
          ctx.log.warn(`[billing] dispute ${dispute.id} on ${dispute.chargeId} for ${user.id}: entitlement revoked, case needs review`);
        }

        recomputeEntitlements(user.id, now);

        if (event.type === 'invoice.payment_failed') effects.push({ kind: 'dunning', invoice: obj });
        if (event.type === 'invoice.payment_action_required') effects.push({ kind: 'sca', invoice: obj });
        if (event.type === 'invoice.upcoming' && sub?.interval === 'year') effects.push({ kind: 'renewal', invoice: obj, sub });
        effects.push({ kind: 'optin' });
      });
    } catch (e) {
      if (isUniqueError(e)) return { duplicate: true, type: event.type };
      throw e;
    }

    if (userId) await runEffects(userId, effects);
    return { duplicate: false, type: event.type, userId };
  }

  async function runEffects(userId, effects) {
    const user = db.get('SELECT * FROM users WHERE id = ?', userId);
    const sl = user?.locale === 'sl';
    for (const fx of effects) {
      try {
        if (fx.kind === 'optin') await ctx.messaging.maybeSendOptIn(userId);
        else if (fx.kind === 'dunning') {
          await ctx.messaging.sendEmail({
            userId,
            kind: 'DUNNING',
            idemKey: `DUNNING:${fx.invoice.id}:${fx.invoice.attempt_count ?? 0}`,
            subject: sl ? 'Plačilo za Quorum ni uspelo' : 'Your Quorum payment did not go through',
            body: sl
              ? `Plačila za naročnino nismo mogli izvesti. Posodobite način plačila: ${config.publicBaseUrl}/#account\nČe plačilo ne uspe v 7 dneh, začasno ustavimo obvestila.`
              : `We could not take the payment for your subscription. Update your payment method: ${config.publicBaseUrl}/#account\nIf the payment still fails after 7 days, alerts are paused.`,
          });
        } else if (fx.kind === 'sca') {
          const link = fx.invoice.hosted_invoice_url || `${config.publicBaseUrl}/#account`;
          await ctx.messaging.sendEmail({
            userId,
            kind: 'SCA',
            idemKey: `SCA:${fx.invoice.id}`,
            subject: sl ? 'Potrdite plačilo za Quorum' : 'Confirm your Quorum payment',
            body: sl ? `Vaša banka zahteva potrditev plačila (3-D Secure). Potrdite ga tukaj: ${link}` : `Your bank needs you to confirm this payment (3-D Secure). Confirm it here: ${link}`,
          });
        } else if (fx.kind === 'renewal') {
          await ctx.messaging.sendEmail({
            userId,
            kind: 'RENEWAL_REMINDER',
            idemKey: `RENEWAL:${fx.sub.stripe_subscription_id}:${fx.sub.current_period_end}`,
            subject: sl ? 'Vaša letna naročnina Quorum se obnovi čez 7 dni' : 'Your annual Quorum subscription renews in 7 days',
            body: sl
              ? `Letna naročnina se samodejno obnovi ${fx.sub.current_period_end?.slice(0, 10)}. Prekličete jo lahko z enim klikom: ${config.publicBaseUrl}/#account`
              : `Your annual subscription renews on ${fx.sub.current_period_end?.slice(0, 10)}. You can cancel in one click: ${config.publicBaseUrl}/#account`,
          });
        } else if (fx.kind === 'geo_reject') {
          await geoReject(fx.subId);
        }
      } catch (e) {
        ctx.log.error(`[billing] effect ${fx.kind} for ${userId} failed: ${e.message}`);
      }
    }
  }

  // Card country disagreed with the agreed country: refund in full, cancel, tell the user why.
  async function geoReject(subRowId) {
    const sub = db.get('SELECT * FROM subscriptions WHERE id = ?', subRowId);
    if (!sub) return;
    const user = db.get('SELECT * FROM users WHERE id = ?', sub.user_id);
    if (sub.first_invoice_id && !sub.geo_refund_id) {
      const refund = await refundInvoice(sub.first_invoice_id, { idempotencyKey: `geo-${sub.id}-refund`, metadata: { reason: 'geofence', user_id: sub.user_id } });
      db.run('UPDATE subscriptions SET geo_refund_id = ?, updated_at = ? WHERE id = ?', refund.id, iso(ctx.now()), sub.id);
    }
    if (!['canceled', 'incomplete_expired'].includes(sub.status)) {
      const c = await stripe().cancelSubscription(sub.stripe_subscription_id, { idempotencyKey: `geo-${sub.id}-cancel` });
      db.run('UPDATE subscriptions SET status = ?, ended_at = ?, updated_at = ? WHERE id = ?', c?.status ?? 'canceled', fromUnix(c?.ended_at) ?? iso(ctx.now()), iso(ctx.now()), sub.id);
    }
    const r = reason('card_mismatch', { declared: user.jurisdiction, card: sub.billing_country });
    await ctx.messaging.sendEmail({
      userId: sub.user_id,
      kind: 'GEO_REJECT',
      idemKey: `GEO_REJECT:${sub.id}`,
      subject: user.locale === 'sl' ? 'Naročnine nismo mogli aktivirati' : 'We could not activate your subscription',
      body: user.locale === 'sl' ? r.sl : r.en,
    });
  }

  // refundInvoice(invoiceId, { amount?, idempotencyKey, metadata }) -> refund
  async function refundInvoice(invoiceId, { amount, idempotencyKey, metadata }) {
    const payments = await stripe().listInvoicePayments(invoiceId);
    const paid = (payments?.data ?? []).find((p) => p.status === 'paid' && p.payment?.payment_intent) ?? (payments?.data ?? []).find((p) => p.payment?.payment_intent);
    const pi = typeof paid?.payment?.payment_intent === 'string' ? paid.payment.payment_intent : paid?.payment?.payment_intent?.id;
    if (!pi) throw new Error(`no payment intent found for invoice ${invoiceId}`);
    return stripe().refund({ paymentIntent: pi, amount, metadata }, { idempotencyKey });
  }

  // ------------------------------------------------------------------ withdrawal (EU button)
  // withdraw(userId, { ip, userAgent }) -> { status, withdrawal }
  async function withdraw(userId, { ip = null, userAgent = null } = {}) {
    const now = ctx.now();
    const paidSubs = db.all('SELECT * FROM subscriptions WHERE user_id = ? AND first_paid_at IS NOT NULL ORDER BY first_paid_at ASC, id ASC', userId);
    if (!paidSubs.length) throw new HttpError(409, 'no_subscription', 'There is no paid subscription to withdraw from.');
    const sub = paidSubs[paidSubs.length - 1];
    let w = db.get('SELECT * FROM withdrawals WHERE subscription_id = ? ORDER BY id DESC LIMIT 1', sub.id);
    if (w?.status === 'completed') throw new HttpError(409, 'already_withdrawn', 'You have already withdrawn from this subscription.', { withdrawal: publicWithdrawal(w) });
    if (!w) {
      const deadline = new Date(sub.first_paid_at).getTime() + config.billing.withdrawalDays * DAY_MS;
      if (now.getTime() > deadline) {
        throw new HttpError(409, 'withdrawal_window_closed', 'The 14-day withdrawal period has ended. You can still cancel at any time; access continues to the end of the paid period.', {
          deadline: iso(new Date(deadline)),
        });
      }
      const first = paidSubs[0].id === sub.id;
      let amount = null; // null = full refund
      if (!first && sub.first_amount_paid != null && sub.current_period_start && sub.current_period_end) {
        // Not the first subscription: refund the unused share (the consumer asked for immediate performance).
        const start = new Date(sub.current_period_start).getTime();
        const len = new Date(sub.current_period_end).getTime() - start;
        const used = Math.min(1, Math.max(0, (now.getTime() - start) / len));
        amount = Math.floor(sub.first_amount_paid * (1 - used));
      }
      db.tx(() => {
        const id = db.run(
          `INSERT INTO withdrawals (user_id, subscription_id, requested_at, refund_amount, currency, full_refund, status, ip, user_agent)
           VALUES (?, ?, ?, ?, ?, ?, 'requested', ?, ?)`,
          userId,
          sub.id,
          iso(now),
          amount ?? sub.first_amount_paid,
          sub.currency,
          amount == null ? 1 : 0,
          ip,
          userAgent ? String(userAgent).slice(0, 512) : null,
        ).lastInsertRowid;
        // The withdrawal takes effect when the consumer states it: access ends now.
        db.run('UPDATE subscriptions SET withdrawn_at = ?, updated_at = ? WHERE id = ?', iso(now), iso(now), sub.id);
        recomputeEntitlements(userId, now);
        w = db.get('SELECT * FROM withdrawals WHERE id = ?', id);
      });
    }
    // Stripe steps; idempotency keys make a retry (a second press, or the runbook) safe.
    try {
      if (!w.refund_id) {
        const refund = await refundInvoice(sub.first_invoice_id, {
          amount: w.full_refund ? undefined : w.refund_amount,
          idempotencyKey: `withdrawal-${w.id}-refund`,
          metadata: { withdrawal_id: String(w.id), user_id: userId },
        });
        db.run("UPDATE withdrawals SET refund_id = ?, refund_amount = COALESCE(?, refund_amount), status = 'refunded', error = NULL WHERE id = ?", refund.id, refund.amount ?? null, w.id);
      }
      const c = await stripe().cancelSubscription(sub.stripe_subscription_id, { idempotencyKey: `withdrawal-${w.id}-cancel` });
      const done = ctx.now();
      db.tx(() => {
        db.run("UPDATE withdrawals SET status = 'completed', completed_at = ?, error = NULL WHERE id = ?", iso(done), w.id);
        db.run('UPDATE subscriptions SET status = ?, canceled_at = COALESCE(canceled_at, ?), ended_at = ?, updated_at = ? WHERE id = ?', c?.status ?? 'canceled', iso(done), fromUnix(c?.ended_at) ?? iso(done), iso(done), sub.id);
      });
    } catch (e) {
      db.run("UPDATE withdrawals SET status = 'failed', error = ? WHERE id = ?", String(e.message).slice(0, 500), w.id);
      ctx.log.error(`[billing] withdrawal ${w.id} for ${userId} needs attention: ${e.message}`);
      w = db.get('SELECT * FROM withdrawals WHERE id = ?', w.id);
      return { status: 'pending', withdrawal: publicWithdrawal(w) };
    }
    w = db.get('SELECT * FROM withdrawals WHERE id = ?', w.id);
    const user = db.get('SELECT locale FROM users WHERE id = ?', userId);
    const sl = user?.locale === 'sl';
    const amountText = w.refund_amount != null ? `${(w.refund_amount / 100).toFixed(2)} ${String(w.currency || 'eur').toUpperCase()}` : '';
    await ctx.messaging.sendEmail({
      userId,
      kind: 'WITHDRAWAL',
      idemKey: `WITHDRAWAL:${w.id}`,
      subject: sl ? 'Odstop od naročnine Quorum je potrjen' : 'Your withdrawal from Quorum is confirmed',
      body: sl
        ? `Odstop je potrjen. Naročnina je preklicana in vračilo ${amountText} je na poti na vašo kartico (običajno 5-10 dni).`
        : `Your withdrawal is confirmed. The subscription is cancelled and a refund of ${amountText} is on its way to your card (usually 5-10 days).`,
    });
    return { status: 'completed', withdrawal: publicWithdrawal(w) };
  }

  function publicWithdrawal(w) {
    return w && { id: w.id, status: w.status, requestedAt: w.requested_at, completedAt: w.completed_at, refundId: w.refund_id, amount: w.refund_amount, currency: w.currency, fullRefund: Boolean(w.full_refund) };
  }

  // withdrawalInfo(userId) -> { eligible, deadline, fullRefund } for /api/me
  function withdrawalInfo(userId, now = ctx.now()) {
    const paidSubs = db.all('SELECT * FROM subscriptions WHERE user_id = ? AND first_paid_at IS NOT NULL ORDER BY first_paid_at ASC, id ASC', userId);
    if (!paidSubs.length) return { eligible: false, deadline: null, fullRefund: false };
    const sub = paidSubs[paidSubs.length - 1];
    const deadline = new Date(new Date(sub.first_paid_at).getTime() + config.billing.withdrawalDays * DAY_MS);
    const done = db.get("SELECT 1 AS x FROM withdrawals WHERE subscription_id = ? AND status = 'completed'", sub.id);
    return { eligible: !done && !sub.withdrawn_at && now <= deadline, deadline: iso(deadline), fullRefund: paidSubs[0].id === sub.id };
  }

  function subscriptionSummary(userId) {
    const s = db.get(
      `SELECT * FROM subscriptions WHERE user_id = ? ORDER BY CASE WHEN status IN ('active','trialing','past_due','unpaid') THEN 0 ELSE 1 END, id DESC LIMIT 1`,
      userId,
    );
    if (!s) return null;
    return {
      tier: s.tier,
      interval: s.interval,
      status: s.status,
      currentPeriodEnd: s.current_period_end,
      cancelAtPeriodEnd: Boolean(s.cancel_at_period_end),
      paymentFailedAt: s.payment_failed_at,
      withdrawnAt: s.withdrawn_at,
    };
  }

  // Account deletion: stop billing at once (no refund here; the withdrawal button refunds).
  async function cancelAllForDeletion(userId) {
    const subs = db.all("SELECT * FROM subscriptions WHERE user_id = ? AND status NOT IN ('canceled', 'incomplete_expired')", userId);
    for (const s of subs) {
      const c = await stripe().cancelSubscription(s.stripe_subscription_id, { idempotencyKey: `delete-${s.id}-cancel` });
      db.run('UPDATE subscriptions SET status = ?, canceled_at = COALESCE(canceled_at, ?), ended_at = ?, updated_at = ? WHERE id = ?', c?.status ?? 'canceled', iso(ctx.now()), fromUnix(c?.ended_at) ?? iso(ctx.now()), iso(ctx.now()), s.id);
    }
    return subs.length;
  }

  return { handleEvent, recomputeEntitlements, withdraw, withdrawalInfo, subscriptionSummary, cancelAllForDeletion, refundInvoice };
}

// Routes: POST /api/checkout, POST /api/webhooks/stripe, POST /api/withdraw, POST /api/billing/portal
export function registerBillingRoutes(router, ctx) {
  const { db, config } = ctx;

  router.add(
    'POST',
    '/api/checkout',
    async (req, res, { body, user }) => {
      const tier = body?.tier;
      const interval = body?.interval ?? 'month';
      if (!TIERS.includes(tier)) throw new HttpError(400, 'invalid_tier', 'tier must be signal or research');
      if (!INTERVALS.includes(interval)) throw new HttpError(400, 'invalid_interval', 'interval must be month or year');
      if (tier === 'research' && !config.researchTier) throw new HttpError(409, 'tier_unavailable', 'The Research tier is not open yet.');
      if (user.status !== 'geo_ok' || !user.jurisdiction) throw new HttpError(409, 'geo_required', 'Confirm your country first.');
      const missing = ['terms', 'immediate_performance'].filter((k) => !hasGrant(db, user.id, k));
      if (missing.length) throw new HttpError(409, 'consent_required', 'Accept the terms first.', { missing });
      const ent = entitlementsFor(db, user.id, ctx.now());
      const live = db.get("SELECT 1 AS x FROM subscriptions WHERE user_id = ? AND status IN ('active','trialing','past_due','unpaid') AND withdrawn_at IS NULL AND disputed_at IS NULL", user.id);
      if (ent.picks.active && live) throw new HttpError(409, 'already_subscribed', 'You already have a subscription. Change it from your account.');
      const priceId = config.stripe.prices[tier]?.[interval];
      if (!priceId || !config.stripe.secretKey) throw new HttpError(503, 'billing_unavailable', 'Payments are not configured on this server.');
      const session = await ctx.stripe.createCheckoutSession({
        userId: user.id,
        email: user.email,
        customerId: user.stripe_customer_id,
        priceId,
        tier,
        interval,
        locale: user.locale,
        successUrl: `${config.publicBaseUrl}/#join`,
        cancelUrl: `${config.publicBaseUrl}/#pricing`,
      });
      db.run('INSERT INTO checkout_sessions (id, user_id, tier, interval, created_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(id) DO NOTHING', session.id, user.id, tier, interval, iso(ctx.now()));
      return { url: session.url, id: session.id };
    },
    { auth: true, accepts: ['json'] },
  );

  router.add(
    'POST',
    '/api/webhooks/stripe',
    async (req, res, { raw }) => {
      let event;
      try {
        event = ctx.stripe.verifyWebhook(raw, req.headers['stripe-signature'], { nowSec: Math.floor(ctx.now().getTime() / 1000) });
      } catch (e) {
        if (e instanceof StripeSignatureError) return sendJson(res, 400, { error: 'invalid_signature', reason: e.reason });
        throw e;
      }
      const r = await ctx.billing.handleEvent(event);
      return { received: true, duplicate: r.duplicate };
    },
    { raw: true, limit: 'stripe', rate: 'webhook', csrf: false },
  );

  router.add(
    'POST',
    '/api/withdraw',
    async (req, res, { user, ip }) => {
      const r = await ctx.billing.withdraw(user.id, { ip, userAgent: req.headers['user-agent'] });
      if (r.status !== 'completed') {
        return sendJson(res, 202, { ok: true, status: 'pending', withdrawal: r.withdrawal, message: 'Your withdrawal is recorded and access has ended. The refund needs a manual step; we will complete it within 14 days.' });
      }
      return { ok: true, status: 'completed', withdrawal: r.withdrawal };
    },
    { auth: true, accepts: ['json'], rate: 'account' },
  );

  router.add(
    'POST',
    '/api/billing/portal',
    async (req, res, { user }) => {
      if (!user.stripe_customer_id) throw new HttpError(409, 'no_customer', 'There is no billing account yet.');
      const s = await ctx.stripe.createPortalSession({ customerId: user.stripe_customer_id, returnUrl: `${config.publicBaseUrl}/#account`, locale: user.locale });
      return { url: s.url };
    },
    { auth: true, accepts: ['json'] },
  );
}
