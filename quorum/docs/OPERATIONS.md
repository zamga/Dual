# Quorum: operations

How to configure, run and look after the server (`server/`). The product rules live in `docs/BRIEF.md`; the interfaces in `docs/ARCHITECTURE.md`. Items marked UNVERIFIED must be checked against the vendor's current documentation before launch (brief: verification rule).

## 1. What runs

One Node process (`node server/index.js`, Node >= 22.13) with one SQLite database (`node:sqlite`, WAL mode). It serves the site from `web/` in live mode, the public data files under `/data/*.json` (redacted by entitlement), the JSON API under `/api/*`, the one-tap opt-out page `/u/<token>`, and the short links `/p/<no>`, `/help`, `/account` used in texts. Node prints an `ExperimentalWarning` for SQLite at start; that is expected.

Transports: SMS through Twilio (`SMS_TRANSPORT=twilio`) or the console twin (default), email through the console transport (logs every message, including sign-in links). Stripe is always the real REST API when `STRIPE_SECRET_KEY` is set; without it checkout answers 503.

```sh
npm run server                     # console transports, ./quorum.db, http://localhost:8787
npm run demo:day                   # one simulated day end to end, in memory (no network)
node --test "tests/server/**/*.test.js"
```

## 2. Environment variables

| Variable | Default | Notes |
|---|---|---|
| `NODE_ENV` | | `production` makes `SESSION_SECRET` mandatory and turns `GEO_REQUIRE_IP` on by default |
| `PORT` / `HOST` | `8787` / `127.0.0.1` | Use `HOST=0.0.0.0` behind a proxy or in a container |
| `DB_PATH` | `quorum.db` | SQLite file. `:memory:` for throwaway runs |
| `PUBLIC_BASE_URL` | `http://localhost:$PORT` | The exact public origin. Used for sign-in links, Checkout return URLs, the Twilio status-callback URL **and its signature check** (Twilio signs the URL it called). `https://` turns on HSTS and `Secure` cookies |
| `LINK_BASE` | `https://qrm.si` | The short link domain printed in texts (templates in `core/sms-templates.js` use `qrm.si`) |
| `WEB_ROOT` | `../web` | Static site root |
| `SMS_TRANSPORT` | `console` | `twilio` for real sends |
| `EMAIL_TRANSPORT` | `console` | Only `console` exists in part 1 (see Known gaps) |
| `EMAIL_FROM`, `SUPPORT_EMAIL` | `Quorum <hello@qrm.si>`, `support@qrm.si` | |
| `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN` | | Basic auth for REST and the key for `X-Twilio-Signature` |
| `TWILIO_MESSAGING_SERVICE_SID` | | `MG…`; the service holds the `QUORUM` sender |
| `TWILIO_VERIFY_SERVICE_SID` | | `VA…` |
| `TWILIO_PUMPING_RISK_MAX` | `75` | Lookup `sms_pumping_risk_score` at or above this is refused (category `high` and blocked numbers always are) |
| `STRIPE_SECRET_KEY` | | `sk_live_…` / `sk_test_…`. Requests pin `Stripe-Version: 2026-08-26.dahlia` |
| `STRIPE_WEBHOOK_SECRET` | | `whsec_…` of the endpoint below; 300 s tolerance |
| `STRIPE_PRICE_SIGNAL_M`, `STRIPE_PRICE_SIGNAL_Y` | | Price IDs, €19 / month and €190 / year |
| `STRIPE_PRICE_RESEARCH_M`, `STRIPE_PRICE_RESEARCH_Y` | | €39 / €390. Leave empty until Gate R passes |
| `RESEARCH_TIER` | on | `off` refuses Research checkouts |
| `ANTHROPIC_API_KEY`, `EXPLAINER_MODEL` | none (explainer off until both are set; set the pinned Claude model id) | Explainer (part 2) |
| `SESSION_SECRET` | random per process | HMAC key for session cookies. 32+ random bytes. Changing it signs everyone out |
| `SESSION_TTL_DAYS`, `MAGIC_LINK_TTL_MIN` | `30`, `15` | |
| `ADMIN_TOKEN` | | Admin console (part 2) |
| `SMS_COUNTRIES` | `SI,AT,DE,HR,IT` | Countries whose mobile numbers may receive texts |
| `SCHEDULER` | `off` | Daily pipeline (part 2) |
| `IP_COUNTRY_HEADER` | empty | Request header a **trusted** edge sets with the client country, e.g. `cf-ipcountry`. Empty means the IP country is unknown |
| `GEO_REQUIRE_IP` | `true` in production | Refuse signups whose IP country is unknown |
| `TRUST_PROXY` | `0` | Number of proxies whose `X-Forwarded-For` entry is trusted for the client IP (rate limits, consent records) |
| `OUTBOX_INTERVAL_MS` | `30000` | How often queued texts and emails that are due (quiet-hours holds, retries) are sent |

Only the edge may set `IP_COUNTRY_HEADER`; strip it from client requests at the proxy, or the geofence can be spoofed.

## 3. Vendor setup

### Twilio (SMS, Verify, Lookup)

1. **Account and region.** Use a dedicated sub-account for Quorum. The module calls the default (US1) REST hosts; if data residency in Ireland (IE1) is required, the hosts change (UNVERIFIED which products IE1 covers) and `createTwilio({ bases })` takes them.
2. **Alphanumeric sender `QUORUM`.** Add it to the Messaging Service's sender pool. Alphanumeric senders are one-way: STOP/HELP replies never arrive, which is why every text carries `qrm.si/u/<token>`. Per-country rules for SI, AT, DE, HR and IT (pre-registration, allowed content) are UNVERIFIED; check each country page before go-live.
3. **Slovenia Letter of Authorization.** Slovenia requires an LOA for financial content (brief §2.6). Request it through Twilio support before go-live with: sender ID `QUORUM`; Quorum Research d.o.o., Ljubljana; use case "subscriber notifications of published research issues, no marketing"; sample messages (every template of `core/sms-templates.js` in EN and SL; `npm run check:sms` prints the worst cases); the only link domain `qrm.si`; expected volume (at most 16 messages per subscriber per month). Launch gate L fails without it.
4. **Messaging Service.** Sender pool: `QUORUM` only. Status callback: set per message by the server (`PUBLIC_BASE_URL/api/webhooks/twilio/status`). Keep Twilio link shortening off so links go out exactly as written; register `qrm.si` as the service's link domain and list it as the only URL in carrier registrations ("qrm.si whitelisted"). The validity period (3,600 s) is sent with every message. Put the SID in `TWILIO_MESSAGING_SERVICE_SID`.
5. **Verify service.** Code length 6, SMS channel only (voice, email and WhatsApp off). Turn **Fraud Guard** on (maximum protection). **Geo permissions**: allow SMS to SI, AT, DE, HR and IT only. The server passes `Locale=sl|en`. Put the SID in `TWILIO_VERIFY_SERVICE_SID`.
6. **Lookup v2.** Enable the Line Type Intelligence and SMS Pumping Risk packages (both billed per lookup). The server refuses landlines, fixed and non-fixed VoIP, other non-mobile types, blocked numbers, category `high`, and scores at or above `TWILIO_PUMPING_RISK_MAX`.
7. **Opt-outs.** Twilio's opt-out list cannot be queried; our `opt_outs` and `consent_events` tables are the source of truth. Error 21610 on a status callback marks the user opted out (part 2).
8. **Prices.** Pull Slovenian and neighbouring SMS prices from the Pricing API and get a written quote (UNVERIFIED).

### Stripe (Checkout, Billing, Customer Portal, Tax)

1. **Category.** Get Stripe's written confirmation that a stock-research subscription is allowed before launch; do not use Stripe Managed Payments (brief §6).
2. **Tax.** Stripe Tax on; registration in Slovenia (22% VAT) and the OSS registration once cross-border consumer sales pass €10k a year. All prices are **tax-inclusive** (`tax_behavior=inclusive`); Checkout sends `automatic_tax[enabled]=true`, `tax_id_collection[enabled]=true` and `billing_address_collection=required`.
3. **Products and prices** (EUR, recurring, tax-inclusive, no trials, no coupons):
   - Quorum Signal: €19 monthly → `STRIPE_PRICE_SIGNAL_M`; €190 yearly → `STRIPE_PRICE_SIGNAL_Y`.
   - Quorum Research: €39 monthly → `STRIPE_PRICE_RESEARCH_M`; €390 yearly → `STRIPE_PRICE_RESEARCH_Y` (Gate R).
4. **Checkout.** Set the Terms of Service and Privacy Policy URLs in the public details (required by `consent_collection[terms_of_service]=required`). Return URLs come from `PUBLIC_BASE_URL` (`/#join` shows "Activating…"; entitlement arrives only by webhook).
5. **Customer Portal.** Allow: cancel at period end (one-click), update payment method, invoice history. Disallow pausing. Return URL `PUBLIC_BASE_URL/#account`.
6. **Billing settings.** Upcoming renewal events 7 days before renewal (for the annual reminder); smart retries on; 3-D Secure confirmation emails may stay off (the server emails the hosted invoice link on `invoice.payment_action_required`).
7. **Radar (optional, defence in depth).** Block cards whose country is outside the EEA. The server already refunds and cancels a subscription whose card billing country disagrees with the agreed country.
8. **Webhook endpoint.** URL `PUBLIC_BASE_URL/api/webhooks/stripe`, API version `2026-08-26.dahlia`, events:
   `checkout.session.completed`, `invoice.paid`, `invoice.payment_failed`, `invoice.payment_action_required`, `invoice.upcoming`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `customer.subscription.paused`, `customer.subscription.resumed`, `charge.dispute.created`. Copy the signing secret to `STRIPE_WEBHOOK_SECRET`.

### Edge

Terminate TLS at the edge, set `PUBLIC_BASE_URL=https://…`, `TRUST_PROXY=1`, `IP_COUNTRY_HEADER` to the edge's country header, and strip that header from incoming client requests. Point `qrm.si` at the same server (the short links redirect into the site). Host in the EU.

## 4. How the backbone behaves

- **Join:** magic link (15 min, single use, only the SHA-256 stored) → `POST /api/join/geo` (IP + declared country) → `POST /api/phone/start` (Lookup, then Verify in the user's locale) → `POST /api/phone/check` → consents (`POST /api/consent`, hash recomputed from `core/consent-texts.js`) → `POST /api/checkout` → webhooks grant the entitlement.
- **Entitlement** = paid invoice seen, then `current_period_end` + 3 days (no grace after `cancel_at_period_end`); suspended 7 days after the first failed payment; revoked at once by `customer.subscription.deleted`, a dispute, a withdrawal or a card-country mismatch. Every webhook re-fetches the subscription and is deduplicated on `event.id`.
- **Texts:** every text is a `notifications` row with a unique idempotency key, written before the provider call. Sends only 08:00–21:00 recipient-local; outside that window a text waits (`not_before`). The opt-in text goes out once per SMS consent grant when the user is entitled, consented and verified. An opt-out cancels queued texts at once.
- **Withdrawal button** (`POST /api/withdraw`, 14 days from the first payment): `withdrawals` row, access ends, Stripe refund (full on the first subscription, pro rata otherwise), immediate cancellation, confirmation email.
- **Account deletion** cancels billing, opts out, deletes identity rows and scrubs message bodies and addresses; `consent_events`, `opt_outs`, `processed_events`, `delivery_events`, `access_log`, subscriptions and withdrawals stay (append-only or required by law) and point at an anonymised user id.

## 5. Runbook

**Health.** `GET /api/health` → `{ ok, db, smsTransport, emailTransport, smsPaused }`. Alert when it fails or `smsPaused` is true.

**Backups.** Nightly `sqlite3 "$DB_PATH" ".backup '/backups/quorum-$(date +%F).db'"` (or `VACUUM INTO`), copied to EU object storage with object lock (brief §4.1: 5-year WORM for ledger tables). Test a restore monthly: open the copy with `openDb()` and run `PRAGMA integrity_check`.

**Stripe webhooks failing.** Check the Stripe Dashboard delivery log. 400 `invalid_signature` means the secret or `PUBLIC_BASE_URL`/proxy is wrong (or the clock is off by more than 300 s); 500 means processing failed and Stripe will retry. Resending any event is safe (deduplicated on `event.id`, state re-fetched).

**Rotating secrets.** `STRIPE_WEBHOOK_SECRET`: roll in the Dashboard (Stripe signs with both secrets for a while), deploy the new value within that window. `TWILIO_AUTH_TOKEN`: create a secondary token, deploy it, promote it. `SESSION_SECRET`: deploy a new value; everyone signs in again.

**A withdrawal answered "pending".** The row is `withdrawals.status = 'failed'` with the error; access has already ended. Pressing the button again retries (Stripe idempotency keys prevent a double refund). Otherwise refund the first invoice's payment in the Dashboard, cancel the subscription, and set the row to `completed` with the refund id. The law gives 14 days to refund.
```sql
SELECT w.id, w.user_id, w.requested_at, w.error, s.stripe_subscription_id, s.first_invoice_id
FROM withdrawals w JOIN subscriptions s ON s.id = w.subscription_id WHERE w.status != 'completed';
```

**Disputes.** `charge.dispute.created` revokes access and logs a warning. Answer the dispute in Stripe. If it is withdrawn or won and the customer should keep access, clear the flag and replay any subscription event from the Dashboard:
```sql
UPDATE subscriptions SET disputed_at = NULL WHERE stripe_subscription_id = 'sub_…';
```

**Pause all texts** (carrier trouble, 30007 spike; part 2 automates this). Queued texts wait; push and email continue:
```sql
INSERT INTO settings (key, value, updated_at) VALUES ('sms_paused', '1', datetime('now'))
  ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at;
```
Set it back to `'0'` to resume; the outbox sends what is still due. Pick alerts older than their validity should be cancelled rather than sent late (part 2 decides per issue).

**Opt-out by email or support.** Until the admin console exists (part 2), record it with the same code path the link uses:
```sh
node --input-type=module -e "
import { createApp } from './server/index.js';
const app = createApp();
const u = app.ctx.db.get('SELECT id FROM users WHERE email = ?', process.argv[1]);
console.log(await app.ctx.optout.optOutSms(u.id, { source: 'support', channel: 'support' }));
await app.close();" someone@example.com
```

**Access requests and deletion by email.** Verify the requester controls the address (send them a sign-in link). They can then use `GET /api/export` and `POST /api/account/delete` themselves.

**Geofence complaints.** Travellers see a mismatch reason; the answer is to sign up from home. `geo_checks` records each decision (codes only). Never override by hand.

**Local testing numbers** (console SMS transport): national numbers ending `0000` are landlines, `9999` non-fixed VoIP, `6666` high pumping risk, `5555` invalid; everything else is a mobile. Verify codes are printed to the log.

## 6. Known gaps (part 1)

- Only the console email transport exists; a Postmark (EU) transport plugs into `server/vendors/email.js` with the same `send()` interface.
- Push delivery, the publisher, notifier fan-out, forward-only delivery status, 21610 / 30003 / 30005 / 30006 / 30007 handling, the scheduler, the explainer and the admin console are part 2. Their seams: `ctx.messaging.queue()` (idempotency key `rec_id:user_id:channel`), `ctx.hooks.onTwilioStatus`, `ctx.hooks.runIssueDay`, the `settings` table.
- Rate limits are in memory per process; run one instance or move them to a shared store.
- The sign-in callback is a GET that consumes the link; aggressive email link scanners can burn it (the user asks for a new link).
