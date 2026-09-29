# Quorum: operations

How to configure, run and look after the server (`server/`). The product rules live in `docs/BRIEF.md`; the interfaces in `docs/ARCHITECTURE.md`. Items marked UNVERIFIED must be checked against the vendor's current documentation before launch (brief: verification rule).

## 1. What runs

One Node process (`node server/index.js`, Node >= 22.13) with one SQLite database (`node:sqlite`, WAL mode). It serves the site from `web/` in live mode, the public data files under `/data/*.json` (redacted by entitlement), the JSON API under `/api/*`, the one-tap opt-out page `/u/<token>`, and the short links `/p/<no>`, `/help`, `/account` used in texts. Node prints an `ExperimentalWarning` for SQLite at start; that is expected.

Transports: SMS through Twilio (`SMS_TRANSPORT=twilio`) or the console twin (default); email through Postmark (`EMAIL_TRANSPORT=postmark`) or the console transport (logs every message, including sign-in links); Web Push through VAPID (`PUSH_TRANSPORT=webpush`) or the console twin. Stripe is always the real REST API when `STRIPE_SECRET_KEY` is set; without it checkout answers 503.

The same process runs the daily pipeline (brief §4.3) when `SCHEDULER=on`: `server/scheduler.js` fires the slots, `server/publisher.js` writes candidates, seals and publishes, `server/explainer.js` calls Claude (Anthropic) for the news veto and the theses, `server/notifier.js` fans out, `server/receipts.js` handles delivery receipts, `server/anchor.js` anchors the day, `server/admin.js` is the approver console (`/admin`). Everything shown to users is a simulation of fictional companies; the persons in the data are fictional (`persons.fictional = 1`).

```sh
npm run server                     # console transports, ./quorum.db, http://localhost:8787
npm run demo:day                   # one complete issue day end to end, in memory (no network)
node --test "tests/server/**/*.test.js"
node server/scheduler.js 2026-10-27  # print a day's slot times in Ljubljana and UTC
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
| `EMAIL_TRANSPORT` | `console` | `postmark` sends through the Postmark REST API (below) |
| `POSTMARK_SERVER_TOKEN`, `POSTMARK_MESSAGE_STREAM`, `POSTMARK_BASE_URL` | none, `outbound`, `https://api.postmarkapp.com` | Server token of the transactional stream; plain text, no open or link tracking |
| `PUSH_TRANSPORT` | `console` | `webpush` sends Web Push (VAPID, aes128gcm) |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | none, none, `mailto:support@qrm.si` | base64url P-256 key pair (65-byte public, 32-byte private); the public key is served at `GET /api/push/key` |
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
| `ANTHROPIC_API_KEY`, `EXPLAINER_MODEL` | none | The explainer (Claude, Anthropic) runs only when both are set. `EXPLAINER_MODEL` is the pinned model id, written nowhere else; change it only with a methodology changelog entry. Without them every candidate goes to the approver to write |
| `SESSION_SECRET` | random per process | HMAC key for session cookies. 32+ random bytes. Changing it signs everyone out |
| `SESSION_TTL_DAYS`, `MAGIC_LINK_TTL_MIN` | `30`, `15` | |
| `ADMIN_TOKEN` | | Approver console `/admin` and `/api/admin/*`. Empty means the console is off (404). 32+ random bytes |
| `SMS_COUNTRIES` | `SI,AT,DE,HR,IT` | Countries whose mobile numbers may receive texts |
| `SCHEDULER` | `off` | `on` runs the daily timetable (section 5) in this process. Run exactly one instance with it on |
| `ENGINE_DAY_DIR` | none | Where the engine drops `<YYYY-MM-DD>.json` (the day's output, engine or publisher shape) before 06:00 and optionally `<YYYY-MM-DD>.market.json` (US opens) before the open |
| `SMS_MPS` | `10` | Texts per second in the 14:00 fan-out (the Messaging Service's confirmed throughput, UNVERIFIED). The fan-out must end in 600 s: `SMS_MPS` >= texts / 600, e.g. 5,000 subscribers x 4 items needs 34 |
| `PUSH_CONCURRENCY`, `EMAIL_CONCURRENCY` | `8`, `4` | Parallel push and email sends during the fan-out |
| `INVALID_NUMBER_AFTER` | `2` | Consecutive 30003/30005/30006 failures that mark a number invalid |
| `SPIKE_30007_RATIO`, `SPIKE_30007_MIN` | `0.02`, `1` | 30007 share of the texts sent in 10 minutes above which SMS pauses (and at least this many 30007s) |
| `OTS_CALENDARS` | the a/b OpenTimestamps pools and Eternity Wall | Comma-separated https calendar URLs; `off` disables |
| `RFC3161_URL` | none | RFC 3161 time-stamping authority (a qualified eIDAS TSA is the target; UNVERIFIED which) |
| `PAGER_WEBHOOK_URL` | none | On-call pages are POSTed here as JSON (and always logged and stored in `ops_alerts`) |
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
7. **Opt-outs.** Twilio's opt-out list cannot be queried; our `opt_outs` and `consent_events` tables are the source of truth. Error 21610 on a status callback marks the user opted out (`server/receipts.js`).
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

### Claude (Anthropic): the explainer

1. **What it may do** (brief §3.3): the 48-hour negative-news veto and drafting the EN/SL thesis from the factor JSON. It never picks, ranks or changes a pick; a flag can only remove a candidate. Pick a plan with EU data-processing terms and a documented training cutoff (brief §3.3, UNVERIFIED which).
2. **Pinning.** Set `EXPLAINER_MODEL` to the pinned model id; the code has no default and no id of its own. Changing it is a methodology change (changelog entry, ledger METHODOLOGY record). Requests use structured output (Zod schema), adaptive thinking, effort `medium`, `max_tokens` 8000 and the server-side fallback beta (`fallbacks: "default"`), through `client.beta.messages.parse` of the installed `@anthropic-ai/sdk`.
3. **Logging.** Every prompt (system + input JSON) and output is stored in `explanations` with `prompt_sha256`, `output_sha256`, `llm_model`, `validator_passed`, `outcome` (passed, validator_failed, refused, parse_failed, rate_limited, api_error, flagged, clear) and the approver who approved it.
4. **Failure handling.** A draft that fails `core/numeric-validator.js` or the wording check (no "you"/"should", advice, targets or predictions) is regenerated once, then handed to the approver. A refusal (`stop_reason: "refusal"`, `stop_details` logged) counts as a failed draft. SDK errors are caught by class (`RateLimitError`, `APIConnectionError`, `APIError`, ...): the SDK has already retried, so the candidate goes straight to the approver.

### Web Push (VAPID)

Generate the key pair once and keep the private key secret (rotating it invalidates every browser subscription):
```sh
node --input-type=module -e "import { generateVapidKeys } from './server/vendors/push.js'; console.log(generateVapidKeys())"
```
Set `PUSH_TRANSPORT=webpush`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` (a `mailto:` the push services can reach). The PWA reads the public key from `GET /api/push/key` and posts its `PushSubscription` to `POST /api/push/subscribe`. Push messages carry TTL 3600 (the SMS validity); a 404/410 from the push service revokes that subscription.

### Postmark (email, EU)

Transactional server with a plain-text template-free stream; sender signature `hello@qrm.si` (SPF, DKIM, return-path on `qrm.si`). Set `EMAIL_TRANSPORT=postmark` and `POSTMARK_SERVER_TOKEN`. Tracking is off (no pixels, no link rewriting). Postmark's EU data residency is UNVERIFIED; if it is not offered, the transport interface (`send({to, subject, text, tag})`) takes another provider with the same shape.

### Anchoring (OpenTimestamps, RFC 3161)

At 23:59 UTC the Merkle root of the day's ledger entries is POSTed to each `OTS_CALENDARS` calendar (`/digest`, 32 bytes) and, when `RFC3161_URL` is set, sent as a DER `TimeStampReq` (SHA-256 imprint, random nonce, certReq). `ledger_anchors.ots_proof` keeps each calendar's answer and a detached `.ots` file (base64) that `ots upgrade` / `ots verify` can finish once Bitcoin confirms; `ledger_anchors.rfc3161_token` keeps the request and the TSA reply after checking status, imprint and nonce. Verify a reply offline with the TSA certificate: `openssl ts -verify -in reply.tsr -digest <root> -CAfile tsa.pem`.

### Edge

Terminate TLS at the edge, set `PUBLIC_BASE_URL=https://…`, `TRUST_PROXY=1`, `IP_COUNTRY_HEADER` to the edge's country header, and strip that header from incoming client requests. Point `qrm.si` at the same server (the short links redirect into the site). Host in the EU.

## 4. How the backbone behaves

- **Join:** magic link (15 min, single use, only the SHA-256 stored) → `POST /api/join/geo` (IP + declared country) → `POST /api/phone/start` (Lookup, then Verify in the user's locale) → `POST /api/phone/check` → consents (`POST /api/consent`, hash recomputed from `core/consent-texts.js`) → `POST /api/checkout` → webhooks grant the entitlement.
- **Entitlement** = paid invoice seen, then `current_period_end` + 3 days (no grace after `cancel_at_period_end`); suspended 7 days after the first failed payment; revoked at once by `customer.subscription.deleted`, a dispute, a withdrawal or a card-country mismatch. Every webhook re-fetches the subscription and is deduplicated on `event.id`.
- **Texts:** every text is a `notifications` row with a unique idempotency key, written before the provider call. Sends only 08:00–21:00 recipient-local; outside that window a text waits (`not_before`). The opt-in text goes out once per SMS consent grant when the user is entitled, consented and verified. An opt-out cancels queued texts at once.
- **Pick fan-out:** at 14:00 every entitled user gets each BUY, CLOSE and RENEW by email and push, and by SMS when consent is granted, the channel is on, the phone is verified and valid, the number is in an SMS country and it is 08:00–21:00 where the recipient is (the zone the user set in their account, else the phone's country). A text outside those hours is recorded `cancelled / quiet_hours` and never sent later; pick texts expire at the US open of the issue day (`expires_at`). Content and the publish time are identical for every tier.
- **Withdrawal button** (`POST /api/withdraw`, 14 days from the first payment): `withdrawals` row, access ends, Stripe refund (full on the first subscription, pro rata otherwise), immediate cancellation, confirmation email.
- **Account deletion** cancels billing, opts out, deletes identity rows and scrubs message bodies and addresses; `consent_events`, `opt_outs`, `processed_events`, `delivery_events`, `access_log`, subscriptions and withdrawals stay (append-only or required by law) and point at an anonymised user id.

## 5. The daily runbook (Europe/Ljubljana, US trading days)

The scheduler (`SCHEDULER=on`) runs each slot once (`scheduler_runs`, unique per date and slot). Slot times come from `core/calendar.js` every day, so the weeks when the EU and US clocks change on different dates (US open 14:30 instead of 15:30) need nothing.

| Time | Slot | What happens | What to check |
|---|---|---|---|
| 06:00 | `candidates` | `ENGINE_DAY_DIR/<date>.json` becomes `candidates` rows (every read and write in `access_log`) | Page `engine_output_missing`: the slot retries every 5 minutes until 13:40 |
| 11:30 | `explain` | Claude: 48-hour news scan (a flag removes the candidate, `vetoed_llm`), EN/SL thesis drafts, validator, one regeneration | `explanations.outcome`; candidates with `thesis_status = handoff` need the approver |
| 12:00–13:40 | approver | `/admin`: the named approver (or the deputy) reads each candidate, its thesis and news, removes with a written reason, writes any handed-off thesis, and **signs off** | Nothing is issued without a sign-off |
| 13:40 | `review` | Review closes: no sign-off → every candidate "no_approver"; no validated thesis → removed and counted | |
| 13:45 | `seal` | BUY/RENEW ledger entries: canonical JSON (RFC 8785), SHA-256, previous hash, `producedAt`, the commit of a salted reveal | `/api/status`, `ledger_entries` |
| 14:00:00 | `publish` | ISSUE entry, `recommendations` (production and dissemination times, price with source and time), notifications written, then paced SMS with push and email in parallel | Fan-out must end by 14:10: `issue_runs.delivery_json`, `/api/status` |
| US open + 1 min | `marks` | Entry opens; exits: CLOSE entries reveal the sealed pick (checked against its commit), `outcomes` | Page `reveal_mismatch` never happens silently |
| 23:59 UTC | `anchor` | Merkle root → `ledger_anchors`, OpenTimestamps, RFC 3161 | Alert `anchor_failed` |
| Sunday 18:00 | `weekly` | Weekly Ledger email to every verified reader (no SMS) | |

**The approver's steps.** Open `https://<host>/admin`, sign in with the admin token, choose the issue date and "Acting as" (your own name), read every candidate, remove any with a written reason (removal only: there is no add and no substitute), write the thesis of any candidate marked `handoff` (the numeric validator and the wording check apply), and press **Sign off the review** before 13:40. Every view is logged. The JSON API does the same with `Authorization: Bearer <ADMIN_TOKEN>`: `GET /api/admin/candidates`, `POST /api/admin/veto {candidateId, reason, personId}`, `POST /api/admin/thesis {candidateId, en, sl, personId}`, `POST /api/admin/signoff {personId}`.

**Staff pre-clearance** (brief §2.9): staff, founders and families trade funds and ETFs only. Every intended trade is logged in the console ("Staff pre-clearance") or `POST /api/admin/preclearance {personId, instrument, instrumentType, side}`: funds and ETFs are cleared, single stocks refused, every request kept in `staff_trade_requests` and `access_log`.

**Status and health.** `GET /api/status` (public, counts only): the latest issue, delivery counts per channel, the fan-out time, whether SMS is paused, the latest anchor. `GET /api/health` for the load balancer. `SELECT * FROM ops_alerts ORDER BY id DESC LIMIT 20` for recent alerts.

## 6. Failure playbooks

**Approver absent.** The deputy signs in to `/admin` as themselves (never on someone else's behalf: every action is attributed) and signs off. If neither the approver nor the deputy can review by 13:40, do nothing: the candidates are logged "unissued (no approver)", RENEW candidates close their pick instead, and the issue still publishes at 14:00 with `unissued` counted in the ISSUE entry. A missed approval means no pick, never an unapproved one.

**Explainer down or refusing.** Candidates arrive in the console with `thesis_status = handoff` (and `veto_scan = unavailable` when the scan failed: read the news yourself). Write the theses by hand or remove the candidates. Check `explanations.outcome` and `error` for the reason (rate limit, connection, refusal with `stop_details`). Do not switch `EXPLAINER_MODEL` during the day.

**Twilio 30007 spike** (carrier filtering). The server pauses SMS by itself when 30007s exceed 2 % of the texts sent in the last 10 minutes and pages on-call (`sms_30007_spike`); push and email continue; queued texts wait. Then: (1) check Twilio's error log and the Messaging Service insights for the affected country and carrier; (2) compare the texts with the LOA and registered samples (a template change, a new link or a new sender are the usual causes); (3) open a Twilio support case with the error samples; (4) resume only when the cause is known, from the console ("Resume SMS") or `POST /api/admin/sms {"paused": false}`. Pick texts still queued after the US open are cancelled as `expired`, never sent late. If a carrier keeps filtering, stop SMS for that country (`SMS_COUNTRIES`) and use the Infobip failover (brief §2.6, UNVERIFIED).

**21610 and invalid numbers.** 21610 opts the user out of SMS at once (`opt_outs.source = twilio`, no confirmation text). Two consecutive 30003/30005/30006 failures mark the number invalid and email the user; they fix it by verifying a number again in the account.

**Stripe outage.** Nothing on the issue path depends on Stripe: entitlements are local and run to `current_period_end` + 3 days, so subscribers keep their alerts. Checkout and the billing portal answer 503 `billing_unavailable` with `Retry-After` (nothing is charged; new subscribers retry later); webhooks fail and Stripe retries them for up to 3 days, deduplicated on `event.id` when they arrive; withdrawals are stored as `failed` and are retried from the button (the refund still has to happen within 14 days); account deletion refuses rather than leave a live subscription. After the outage: check the Dashboard's webhook log for events still failing and resend them.

**Clock and DST.** The host clock must be NTP-synchronised (the 14:00:00 publish, Stripe's 300 s signature tolerance, the 13:40 review cut-off). Slot times are computed per day from IANA zones (`Europe/Ljubljana`, `America/New_York`) in Node's ICU data, not from the host time zone: after an OS or Node update run `node server/scheduler.js <dates>` around the next clock changes and compare with section 5 (EU: last Sundays of March and October; US: second Sunday of March, first Sunday of November). A clock that jumps forward past a slot is handled like downtime (below); a clock that jumps back never runs a slot twice.

**Server down over a slot (never caught up into a text).** When the process comes back, each slot that passed is handled once: candidates and explain run late until 13:40; a missed seal (after 13:59:59) seals nothing and the day's candidates are logged unissued; a missed publish (after 14:10) publishes the web issue with its real time and `late: true` and sends **no** texts, push or email (`issue_late` is paged); marks and the anchor run late. Decide by hand whether subscribers need an email about a late issue; never send a pick text after the slot.

**Engine output missing.** Paged at 06:00 (`engine_output_missing`), retried every 5 minutes. If it never arrives, the issue publishes at 14:00 with no picks and `engineOutput: "missing"` in the ISSUE entry.

**A reveal that does not match its commit.** The CLOSE entry is not written and on-call is paged (`reveal_mismatch`). Never "fix" the commit: find the correct salted reveal (`pick_reveals`, or the engine's record); if it is lost, publish a CORRECTION entry explaining it.

## 7. Other operations

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

**Pause all texts** by hand (carrier trouble): the console's "Pause SMS", `POST /api/admin/sms {"paused": true}`, or
```sql
INSERT INTO settings (key, value, updated_at) VALUES ('sms_paused', '1', datetime('now'))
  ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at;
```
Queued texts wait; push and email continue. Resume from the console; the outbox sends what is still due and cancels pick texts past their validity (`expired`).

**Opt-out by email or support.** Record it with the same code path the link uses:
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

## 8. Known gaps

- The admin console is protected by one shared `ADMIN_TOKEN` plus the person the approver names; the brief asks for SSO with hardware-key 2FA per person. Put `/admin` behind the company SSO proxy until that exists.
- OpenTimestamps proofs are stored as the calendars' pending answers; upgrading them to Bitcoin-confirmed proofs is done offline with the `ots` client on the stored `.ots` file. RFC 3161 replies are checked for status, imprint and nonce, not for the TSA's CMS signature (verify with `openssl ts -verify`).
- Postmark calls go one message per request at `EMAIL_CONCURRENCY`; above a few thousand subscribers per issue switch the fan-out to Postmark's batch endpoint.
- The weekly email's statistics cover what this server published (its `outcomes`), not the engine's full sealed record.
- Rate limits are in memory per process; run one instance (the scheduler must also run in exactly one).
- The sign-in callback is a GET that consumes the link; aggressive email link scanners can burn it (the user asks for a new link).
