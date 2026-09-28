# Paid SMS alert subscription, end to end: research report (28 Sep 2026)

**How this was checked.** Every WebSearch call was already used up when this task started (200/200). The network proxy blocked twilio.com, stripe.com, ctia.org, fcc.gov, ecfr.gov, eur-lex and pisrs.si. I checked claims against sources hosted on GitHub instead:
- Twilio's own SDK source and OpenAPI specs
- Twilio's official `twilio/ai` skills repo
- Stripe's SDK source and changelog
- Telnyx's official knowledge-base mirror
- Microsoft's Azure docs repo
- Third-party dated captures of Twilio pages

Where I checked a mirror or capture, I give the canonical URL and the mirror URL. Anything I could not check is marked **UNVERIFIED**.

---

## 0. The blocking finding: US carriers do not allow stock-alert SMS

- **Telnyx forbidden list (updated 23 Jul 2026).** It lists "Securities or stock trading services, including day-trading alerts, stock tips, or real-time market signals" among business types "not supported for messaging, even if individual messages appear compliant". The rule covers 10DLC, toll-free and short code alike, and the page names no exceptions for broker-dealers or first-party account notices. [support.telnyx.com/…/14286763](https://support.telnyx.com/en/articles/14286763-forbidden-messaging-use-cases-in-the-us-and-canada-10dlc-toll-free-and-short-code) (mirror: [GitHub](https://github.com/team-telnyx/knowledge-base/blob/main/support-docs/en--articles--14286763-forbidden-messaging-use-cases-in-the-us-and-canada-10dlc-toll-free-and-short-code.md))
- **10DLC rejection code 709 (updated 8 Jul 2026).** The code is "High-Risk Financial Services" and covers "Crypto related traffic or traffic related to stock markets, trading, commodities." [support.telnyx.com/…/10547022](https://support.telnyx.com/en/articles/10547022-10dlc-carrier-error-codes-explanations)
- **Toll-free is also ruled out.** "Disallowed Content – … Stock Alerts, Cryptocurrency, Risk Investment … Not Eligible." Sources:
  - Telnyx toll-free verification guide ([mirror](https://github.com/team-telnyx/knowledge-base/blob/main/support-docs/en--articles--10729979-toll-free-verification-request-guide.md))
  - Azure SMS FAQ, "Stock alerts" in its ineligible table, dated 2023 ([mirror](https://github.com/MicrosoftDocs/azure-docs/blob/main/articles/communication-services/concepts/sms/sms-faq.md))
  - Twilio's US guidelines, which list "Stock Alerts" under toll-free and "Risk Investment Opportunities" under long code and short code. [twilio.com/en-us/guidelines/us/sms](https://www.twilio.com/en-us/guidelines/us/sms) (scraped copy: [GitHub](https://github.com/nevetsagetro/OKR-warranted/blob/main/data/raw/united_states_us.md))
- **Penalties.** T-Mobile charges $10,000 per content violation and $1,000 for program evasion. [Telnyx fees page](https://support.telnyx.com/en/articles/5634625-10dlc-fees-and-charges); [Twilio US guidelines](https://www.twilio.com/en-us/guidelines/us/sms)
- **Disguising the use case does not work.** Reviewers check the brand's website against the message samples (codes 601, 602, 603), and false use-case declarations are fined. [Telnyx codes](https://support.telnyx.com/en/articles/10547022-10dlc-carrier-error-codes-explanations)
- **Europe is different.** Telnyx's European guidelines (updated 11 Jun 2026) restrict only lottery and gambling content, not financial or stock content. [support.telnyx.com/…/6531704](https://support.telnyx.com/en/articles/6531704-european-sms-guidelines)
- **Slovenia has one extra requirement.** Per Twilio's Slovenia guidelines: "Financial organizations: Letter of Authorization (LOA) required for financial content to ensure delivery." [twilio.com/en-us/guidelines/si/sms](https://www.twilio.com/en-us/guidelines/si/sms) (copy: [GitHub](https://github.com/nevetsagetro/OKR-warranted/blob/main/data/raw/slovenia_si.md))
- **UNVERIFIED:** whether a US short code for a regulated broker-dealer or a registered adviser can get a carrier exception.

---

## 1. Twilio building blocks

### 1.1 Messaging API and Messaging Service
Checked in [twilio-node message.ts](https://github.com/twilio/twilio-node/blob/main/src/rest/api/v2010/account/message.ts).

- **Create parameters:**
  - `statusCallback`, `messagingServiceSid`, `contentSid`, `smartEncoded`, `riskCheck` (enable/disable)
  - `validityPeriod`: 1–36000 s, default 36000
  - `sendAt` with `scheduleType=fixed`
  - `shortenUrls`
  - `maxPrice` has had no effect since 2024-06-03.
- **Message statuses:** queued, sending, sent, failed, delivered, undelivered, receiving, received, accepted, scheduled, read, partially_delivered, canceled.
- **Scheduling window:** 15 minutes to 35 days ahead. It needs a Messaging Service, and scheduled messages send no status callback at creation. [twilio/ai messaging-services](https://github.com/twilio/ai/blob/main/skills/twilio/twilio-messaging-services/SKILL.md)
- **Link shortening:** needs your own branded domain; links are kept 90 days and clicks arrive through status callbacks. Public shorteners (bit.ly and similar) are filtered by carriers. [same](https://github.com/twilio/ai/blob/main/skills/twilio/twilio-messaging-services/SKILL.md); [compliance-traffic](https://github.com/twilio/ai/blob/main/skills/twilio/twilio-compliance-traffic/SKILL.md)
- **Other service features:** sticky sender, area-code geomatch, and SMS pumping protection (error 30450; free in US and Canada). [same](https://github.com/twilio/ai/blob/main/skills/twilio/twilio-messaging-services/SKILL.md)
- **Throughput** is not exposed through the API. [same](https://github.com/twilio/ai/blob/main/skills/twilio/twilio-messaging-services/SKILL.md)
- **Error codes:**
  - 30034 = message from an unregistered number; 30007 = filtered as spam ([compliance-onboarding](https://github.com/twilio/ai/blob/main/skills/twilio/twilio-compliance-onboarding/SKILL.md))
  - 21610 = recipient has opted out
  - 21614 = landline (Slovenia) ([SI guidelines](https://www.twilio.com/en-us/guidelines/si/sms))
  - Intelligent Alerts monitor 30001, 30005, 30006, 30007 and 30008.
- **Failed-message fee:** $0.001 per message ending in "failed". [Twilio US pricing, capture 2026-05-31](https://github.com/brianbolze/truffle/blob/19a1a2149899074d421f4a6a6e44dbd1134cf835/store/twilio-com/captures/2026-05-31/sms_pricing_us.md)

### 1.2 Verify (phone verification)
- **Channels:** sms, call, email, whatsapp, sna and auto. Custom codes can be 4–10 characters. Also available: `rateLimits`, per-attempt `riskCheck`, `locale`, `templateSid`, and PSD2 `amount`/`payee`. [verification.ts](https://github.com/twilio/twilio-node/blob/main/src/rest/verify/v2/service/verification.ts)
- **Fraud Guard** (geo permissions, anomaly detection, pumping protection) and `lookup_enabled` line-type checks. [twilio/ai verify](https://github.com/twilio/ai/blob/main/skills/twilio/twilio-verify-send-otp/SKILL.md)
- **Pricing:** $0.05 per successful verification, plus a channel fee on every attempt. [twilio.com/en-us/verify/pricing](https://www.twilio.com/en-us/verify/pricing) (via [research note](https://github.com/yuanboP/frugal/blob/main/research/round2/twilio.md))
- **Verify does not need your own 10DLC registration.** Two independent developer sources say so ([1](https://github.com/aerozinnovation/num/blob/main/worker/verifydiag.mjs), [2](https://github.com/yayashuxue/agent-marketplace-mcp/blob/main/docs/scenarios.md)). Not confirmed on twilio.com: **UNVERIFIED**.
- **Lookup v2 fields:** validation, line_type_intelligence, sms_pumping_risk, reassigned_number, sim_swap, line_status, identity_match, phone_number_quality_score, pre_fill. [phoneNumber.ts](https://github.com/twilio/twilio-node/blob/main/src/rest/lookups/v2/phoneNumber.ts)

### 1.3 A2P 10DLC (US long codes)
**Brand registration API** ([OpenAPI messaging v1](https://github.com/twilio/twilio-oai/blob/main/spec/json/twilio_messaging_v1.json)):
- Brand type: STANDARD or SOLE_PROPRIETOR.
- Status: PENDING, APPROVED, FAILED, IN_REVIEW, DELETION_PENDING, DELETION_FAILED, SUSPENDED.
- Identity status: SELF_DECLARED, UNVERIFIED, VERIFIED, VETTED_VERIFIED.
- Other fields: `brand_score`, `skip_automatic_sec_vet`, `russell_3000`.

**Campaign fields (`Services/{MG}/Compliance/Usa2p`):**
- `privacy_policy_url` and `terms_and_conditions_url` are required.
- `message_samples`: 2–5 samples of 20–1024 characters each.
- `description`: at least 40 characters. `message_flow`: 40–2048 characters.
- `opt_in_message`, `opt_out_message` and `help_message`: 20–320 characters each.
- Flags: `has_embedded_links`, `has_embedded_phone`, `age_gated`, `direct_lending`.
- Returned: `campaign_status` (IN_PROGRESS, VERIFIED, FAILED), `rate_limits`, `errors`.
- Use cases include ACCOUNT_NOTIFICATIONS, MARKETING, 2FA and others; there is no stock-alert use case.

**Other facts:**
- Non-US companies can register with a non-US tax ID instead of an EIN. [Twilio sender comparison](https://github.com/TheFamLee/ministryplatform-help-center/blob/main/docs/guides/twilio.md); Telnyx brand guide.
- **Fees:**
  - Brand: $4.50
  - Campaign review: $15 per submission
  - Monthly: $1.50 (low-volume mixed) to $10 (standard), billed 3 months upfront ([Telnyx fees](https://support.telnyx.com/en/articles/5634625-10dlc-fees-and-charges))
  - Secondary vetting: $12.50–41.50 ([AWS via doc, Aug 2026](https://github.com/lightningkite/service-abstractions/blob/main/docs/sms-module.md))
- **Timelines:** Twilio's own skills repo says brand approval takes minutes and campaigns 10–15 business days ([compliance-onboarding](https://github.com/twilio/ai/blob/main/skills/twilio/twilio-compliance-onboarding/SKILL.md)). Twilio's US guidelines say 7–10 business days.
- **Throughput:**
  - AT&T (per minute): 4,500 at vetting score 75–100; 2,400 at 50–74; 240 at 1–49; 75 for class T.
  - T-Mobile (per brand per day): 200k / 40k / 10k / 2k.
  - Source: [Telnyx](https://github.com/team-telnyx/knowledge-base/blob/main/wiki/support-docs/10dlc-compliance--part-3.md). Twilio's low-volume standard brand is about 2,000 per day ([compliance-onboarding](https://github.com/twilio/ai/blob/main/skills/twilio/twilio-compliance-onboarding/SKILL.md)).

### 1.4 Toll-free verification
- **API fields:**
  - `business_registration_number` / `_authority`, which accepts VAT and OTHER, so a Slovenian VAT ID works
  - `business_registration_country`
  - `opt_in_type` (WEB_FORM, VIA_TEXT, …) and `opt_in_image_urls`
  - `status` (PENDING_REVIEW, IN_REVIEW, TWILIO_APPROVED, TWILIO_REJECTED)
  - `edit_allowed` / `edit_expiration`
  - Source: [OpenAPI](https://github.com/twilio/twilio-oai/blob/main/spec/json/twilio_messaging_v1.json)
- **Timeline:** 3–5 business days per [twilio/ai](https://github.com/twilio/ai/blob/main/skills/twilio/twilio-numbers-senders/SKILL.md), but "up to 14 business days" per the US guidelines.
- **Throughput:** about 3 MPS by default. [same](https://github.com/twilio/ai/blob/main/skills/twilio/twilio-numbers-senders/SKILL.md)
- **Short code:** 10–100 MPS, 8–12 weeks to provision, $1,000 per quarter (random) or $1,500 (vanity). [pricing capture](https://github.com/brianbolze/truffle/blob/19a1a2149899074d421f4a6a6e44dbd1134cf835/store/twilio-com/captures/2026-05-31/sms_pricing_us.md)
- As covered in section 0, stock content is barred on all three US sender types.

### 1.5 EU and Slovenia sender IDs
Per [Twilio SI guidelines](https://www.twilio.com/en-us/guidelines/si/sms):
- Dynamic alphanumeric sender IDs are supported. No operator pre-registration is needed, and the sender name is shown to the recipient.
- UCS-2 is supported. Operators do not support short codes.
- Two-way SMS is not supported. Two-way only works through virtual long numbers, which take up to 3 weeks to provision.
- URLs must be whitelisted; generic URL shorteners are not supported.
- Financial content needs an LOA, as noted in section 0.

Alphanumeric sender IDs are one-way and not supported in the US or Canada. [twilio/ai numbers-senders](https://github.com/twilio/ai/blob/main/skills/twilio/twilio-numbers-senders/SKILL.md)

Other EU countries requiring pre-registration: Ireland (from 3 Jul 2025), Finland (from 4 May 2026), Norway. [Telnyx EU](https://support.telnyx.com/en/articles/6531704-european-sms-guidelines)

**Encoding:** the Slovenian letters č, š and ž are not in GSM-7. Any message containing them is sent as UCS-2, which is 70 characters per segment (67 when concatenated). This is standard GSM 03.38 knowledge.

### 1.6 Pricing
- **US (Twilio, captured 31 May 2026):**
  - SMS: $0.0083 per segment in or out, on long code, toll-free and short code.
  - Carrier fees on long code: AT&T $0.0035, T-Mobile $0.0045, Verizon $0.0045, US Cellular $0.005, others $0.004.
  - Numbers: $1.15/month (long code), $2.15/month (toll-free).
  - Source: [capture](https://github.com/brianbolze/truffle/blob/19a1a2149899074d421f4a6a6e44dbd1134cf835/store/twilio-com/captures/2026-05-31/sms_pricing_us.md)
  - Telnyx lists lower pass-through fees (Jul 2026): AT&T $0.003, T-Mobile $0.003, Verizon $0.0045. [Telnyx](https://support.telnyx.com/en/articles/5634625-10dlc-fees-and-charges)
- **Slovenia per-SMS price: UNVERIFIED.** Pull it at build time from the Pricing API, `GET pricing.twilio.com/v1/Messaging/Countries/SI`, which returns `outboundSmsPrices` per MCC/MNC and `priceUnit`. [country.ts](https://github.com/twilio/twilio-node/blob/main/src/rest/pricing/v1/messaging/country.ts)

### 1.7 STOP/HELP (Advanced Opt-Out)
- Reserved keywords that cannot be removed: stop, start, unstop, help. [Twilio docs via reference](https://www.twilio.com/docs/messaging/tutorials/advanced-opt-out)
- Default opt-out keywords: STOP, STOPALL, UNSUBSCRIBE, CANCEL, END, QUIT. REVOKE and OPTOUT were reportedly added alongside the FCC's 2025 rule ([secondary](https://github.com/bakaphp/kanvas-ecosystem-api/blob/main/src/Domains/Guild/Customers/Services/ConsentKeywordService.php); **UNVERIFIED** on twilio.com).
- Opt-outs block the number per Messaging Service or sender pool; later sends fail with 21610.
- **There is no Console or API way to query or report blocked numbers.** You must record opt-outs yourself from the inbound webhook, which carries an `OptOutType` field. ([research quoting Twilio docs](https://github.com/Skale-Club/xtimator/blob/main/.planning/phases/176-end-customer-consent-optout-quiet-hours/176-RESEARCH.md))
- Advanced Opt-Out does not act on WhatsApp. ([field report, 2026-09-06](https://github.com/josemorenoso/SushiServiceFidelitySystem/blob/main/docs/features/twilio-opt-out.md))

---

## 2. Alternatives

| Option | Facts | Notes |
|---|---|---|
| AWS End User Messaging | US: $0.00774 base + $0.00421 carrier per SMS; 10DLC number $1/month; registration $4.50; vetting $12.50–41.50; campaign $10 or $2 per month (Aug 2026) [doc](https://github.com/lightningkite/service-abstractions/blob/main/docs/sms-module.md) | Same US content ban applies |
| Telnyx | US base about $0.004 plus carrier fees; one developer reports better toll-free verification support ([Sep 2026 snapshot](https://github.com/JonLatane/rellm/blob/main/docs/sms_verification_providers.md)) | Its own policy bans stock signals (section 0) |
| Infobip, Vonage, Bird | **UNVERIFIED** (nothing retrieved) | Infobip is plausibly strong on Slovenian routes; get a quote |
| WhatsApp Business | Per-message template pricing since 1 Jul 2025; utility templates are free inside the 24-hour customer-service window ([ref](https://github.com/skills-il/developer-tools/blob/main/hebrew-chatbot-builder/references/whatsapp-business-api-guide.md)). One source says: from 1 Oct 2026, service replies are billed at the utility rate after 1,000 free per number per month; 80 MPS per number; about one message per 6 s to the same user; 250 unique conversations per day if the business is unverified ([Agenta design](https://github.com/Agenta-AI/agenta/blob/main/openspec/changes/whatsapp-channel/design.md), single source) | Whether Meta allows investment-signal content: **UNVERIFIED** |

---

## 3. Consent law

### US
- **Prior express written consent**, 47 CFR 64.1200(f)(9): a signed written agreement (an e-signature or checkbox counts), with clear and conspicuous disclosure, stating that consent is not a condition of purchase. [eCFR](https://www.ecfr.gov/current/title-47/chapter-I/subchapter-B/part-64/subpart-L/section-64.1200)
- **The one-to-one consent rule is dead.** The 11th Circuit vacated it in *Insurance Marketing Coalition v. FCC*, 127 F.4th 303 (24 Jan 2025) ([MoFo](https://www.mofo.com/resources/insights/250130-eleventh-circuit-vacates-fcc-s-tcpa-one-to-one-consent-rule)), and the FCC then repealed the text ([Womble](https://www.womblebonddickinson.com/us/insights/blogs/fcc-repeals-one-one-consent-rule-following-eleventh-circuit-decision)). Secondary sources disagree on the repeal date (July, August or September 2025).
- **Revoking consent** (FCC 24-24, in force since 11 Apr 2025) ([FCC-24-24A1](https://docs.fcc.gov/public/attachments/FCC-24-24A1.pdf)):
  - Consumers can revoke by "any reasonable means".
  - Automatically valid words: stop, quit, end, revoke, opt out, cancel, unsubscribe.
  - Revocation must be honored within 10 business days.
  - One non-marketing confirmation is allowed, sent within 5 minutes.
- **The "revoke-all" part is delayed** to 31 Jan 2027 by FCC order DA 26-12 of Jan 2026. Under it, one opt-out would cover all of a sender's unrelated messages. [DA-26-12A1](https://docs.fcc.gov/public/attachments/DA-26-12A1.pdf); [NatLawReview](https://natlawreview.com/article/portion-tcpa-global-revocation-rules-further-extended-now-effective-january-2027)
- ***McLaughlin Chiropractic v. McKesson*, 606 U.S. 146 (2025), No. 23-1226:** district courts are not bound by the FCC's reading of the TCPA, so court outcomes will vary more. [docket](https://www.supremecourt.gov/search.aspx?filename=/docket/docketfiles/html/public/23-1226.html)
- **Quiet hours:**
  - Federal: 8am–9pm at the recipient's location, for telephone solicitations.
  - Florida (FTSA): 8am–8pm ([secondary](https://github.com/beetz12/concierge-ai/blob/main/docs/compliance/regulatory-survey.md)).
  - Texas SB 140 (from 1 Sep 2025): texts now count as telephone solicitations; seller registration is required ([bill](https://capitol.texas.gov/tlodocs/89R/billtext/pdf/SB00140F.pdf); [Telnyx](https://github.com/team-telnyx/knowledge-base/blob/main/support-docs/en--articles--12141904-legal-update-texas-s-mini-tcpa-now-applies-to-texts.md)). A $200/year fee and $10,000 bond are reported ([secondary](https://github.com/gamlin-ccdocs/vicistack-docs/blob/main/docs/guides/call-center-compliance-checklist-2026.md)).
  - Twilio does not enforce quiet hours; your app must. [twilio/ai](https://github.com/twilio/ai/blob/main/skills/twilio/twilio-compliance-traffic/SKILL.md)
- **CTIA and carrier rules** ([CTIA 2023 PDF](https://api.ctia.org/wp-content/uploads/2023/05/230523-CTIA-Messaging-Principles-and-Best-Practices-FINAL.pdf); [twilio/ai](https://github.com/twilio/ai/blob/main/skills/twilio/twilio-compliance-onboarding/SKILL.md)):
  - Consent is per campaign.
  - Opt-in confirmation must include brand, frequency ("Msg frequency varies" is common), "Msg & data rates may apply", and HELP/STOP.
  - The privacy policy must say mobile opt-in data is not shared with third parties for marketing.
  - Terms must show HELP/STOP in bold.
  - **UNVERIFIED:** whether double opt-in is mandatory for web-originated consent.

### EU and Slovenia
- **ePrivacy Directive 2002/58/EC, Art. 13:** SMS marketing needs prior consent. A "soft opt-in" exists for existing customers and similar products, with an opt-out in every message. [EUR-Lex](https://eur-lex.europa.eu/eli/dir/2002/58/oj)
- **GDPR:** consent must be freely given, specific and unambiguous; you must be able to prove it (Art. 7(1)), and withdrawing must be as easy as giving it (Art. 7(3)). [GDPR](https://eur-lex.europa.eu/eli/reg/2016/679/oj)
  - Alerts that *are* the paid service can rely on contract (Art. 6(1)(b)).
  - Upsell or win-back texts need consent or the soft opt-in.
- **Slovenia:** ZEKom-2 (Ur. l. RS 130/22), Art. 226, governs unsolicited communications, and AKOS enforces it, not the Information Commissioner. [IP decision 07101-22/2023/7, MT copy](https://github.com/mnov88/eurlextract/blob/main/fast_scrape/machine_translations_md_final/MT_IP_Slovenia_-_07101-22-2023-7_34.md) The exact article text and fines are **UNVERIFIED** (pisrs.si blocked).
- **Withdrawal button:** Directive (EU) 2023/2673 adds CRD Art. 11a, a "withdrawal function" for contracts concluded online, applicable from **19 Jun 2026**. [EUR-Lex](https://eur-lex.europa.eu/eli/dir/2023/2673/oj); German §356a BGB is in force ([ref](https://github.com/An-Idea-For-Business/wwu-withdrawal-button/blob/main/docs/legal/wwu-wb-legal-reference.md)). Slovenia's transposition status is **UNVERIFIED**.

### Financial-content law that shapes the message text (UNVERIFIED legal analysis; get counsel)
- **EU MAR Art. 20 and Delegated Reg. 2016/958:** investment recommendations need disclosures (who produced it, date and time, conflicts of interest). [MAR](https://eur-lex.europa.eu/eli/reg/2014/596/oj); [2016/958](https://eur-lex.europa.eu/eli/reg_del/2016/958/oj)
- **Personalised picks** would count as MiFID investment advice, which needs an ATVP licence.
- **US:** the publisher exclusion from adviser registration (*Lowe v. SEC*, 472 U.S. 181 (1985)) requires impersonal content with "general and regular" circulation. Event-triggered alerts may not qualify.

---

## 4. Stripe Billing
- **Current SDK:** stripe-node 22.6.2 (9 Sep 2026) pins API version `2026-08-26.dahlia`. [CHANGELOG](https://github.com/stripe/stripe-node/blob/master/CHANGELOG.md) Recent changes:
  - Flexible billing mode (22.2.0)
  - `managed_payments` on Checkout Sessions and Subscriptions (22.1.0, 23 Apr 2026)
  - `Billing.FeedbackOption` for cancellation feedback (22.6.0)
- **Webhook events** (all confirmed in [stripe-go event.go](https://github.com/stripe/stripe-go/blob/master/event.go)):
  - `checkout.session.completed`, `checkout.session.async_payment_succeeded`
  - `customer.subscription.created`, `.updated`, `.deleted`, `.paused`, `.resumed`, `.trial_will_end`
  - `invoice.paid`, `invoice.payment_failed`, `invoice.payment_action_required`, `invoice.upcoming`, `invoice_payment.paid`
  - `entitlements.active_entitlement_summary.updated`
  - `charge.dispute.created`, `radar.early_fraud_warning.created`
- **SCA:** Checkout handles 3DS at signup. Off-session renewals that need authentication fire `invoice.payment_action_required` before the payment fails. [implementation note](https://github.com/Ruckus000/PropertyPro/blob/main/apps/web/src/app/api/v1/webhooks/stripe/route.ts)
- **Fees:**
  - EEA cards: 1.5% + €0.25 (Stripe Germany pricing; Slovenia **UNVERIFIED**)
  - Stripe Tax: 0.5% per transaction where you are registered ([multiple secondary](https://github.com/zaks-io/trace-flow/blob/main/specs/costs/third-party-pricing.md))
  - Billing fee: 0.5–0.7%, **UNVERIFIED**
- **Managed Payments** (Stripe as merchant of record, handling VAT): +3.5% on top of processing. [docs](https://docs.stripe.com/payments/managed-payments), [pricing](https://support.stripe.com/questions/managed-payments-pricing) (via [plan doc](https://github.com/matthiasn/lotti/blob/main/docs/implementation_plans/2026-08-07_matrix_provisioning_platform.md))
  - It does not support Connect or third-party tax integrations.
  - Whether Slovenia is eligible, and whether stock picks are an allowed category, are both **UNVERIFIED**. One applicant explicitly excluded "buy/sell signals" from its scope to pass review ([ref](https://github.com/usdimpact/usd-impact-site/blob/main/docs/operations/stripe-managed-payments-technical-prefill-2026-08-26.md)). Also check Stripe's [restricted businesses list](https://stripe.com/legal/restricted-businesses): **UNVERIFIED** for this category.
- **EU VAT** (well established; not re-fetched):
  - Consumer digital services are taxed at the customer's country rate once EU-wide cross-border B2C sales exceed €10,000 a year; below that, Slovenian VAT at 22% applies.
  - File through OSS via FURS.
  - Business customers use reverse charge; collect and validate VAT IDs with Checkout `tax_id_collection`.

---

## 5. Event flow

1. **Signup.** Create the user and record their jurisdiction (EU/SI or US) from IP plus their stated country.
2. **Phone capture and consent.** Use an unchecked checkbox with versioned disclosure text. Store in `consent_events`: text hash, timestamp, IP, user agent, page URL, locale and channel. Keep these for 5 years or more (the TCPA limitation period is 4 years).
3. **Verify the phone.**
   - Run Lookup v2 (`line_type_intelligence`, `sms_pumping_risk`) and reject landlines and high-risk numbers.
   - Start Verify with `channel=sms` and the right locale, then check the code and set `phone_verified_at`.
   - Restrict geo permissions to the countries you sell in.
4. **Pay.** Create a Checkout Session with `mode=subscription`, `client_reference_id=user_id`, `automatic_tax` on, `tax_id_collection`, and terms consent plus EU immediate-performance acknowledgement.
5. **Grant the entitlement.**
   - Verify the webhook signature and dedupe on `event.id`.
   - `checkout.session.completed` links the Stripe customer to the user.
   - `invoice.paid` (or `entitlements.active_entitlement_summary.updated`) sets the entitlement active until `current_period_end` plus a grace period.
   - Always re-fetch the subscription, because events can arrive out of order.
6. **Opt-in confirmation SMS** (EU alphanumeric sender): "BRAND: Alerts ON. Msg frequency varies. Unsubscribe: brand.si/u/{tok}". Keep it ASCII, GSM-7, and 160 characters or fewer.
7. **Alert fan-out.**
   - A model-consensus event creates an immutable, timestamped pick. Publish it on the web first.
   - Select recipients where: entitled AND sms_opt_in AND not opted_out AND phone verified AND inside the recipient's local 08:00–21:00.
   - Enqueue one job per recipient with idempotency key `pick_id:user_id`, persisted before sending.
   - Call `messages.create(messagingServiceSid, to, body, statusCallback, validityPeriod=600)` so stale alerts expire instead of arriving hours late.
   - Pace sends to sender throughput (account MPS is **UNVERIFIED**; raise it with Twilio).
8. **Delivery receipts.**
   - Validate `X-Twilio-Signature` and upsert status, only moving forward (queued → sent → delivered; failed and undelivered are final).
   - 21610 → mark opted out. Repeated 30003/30005/30006 → mark the number invalid. A spike in 30007 → pause the campaign automatically.
9. **STOP.**
   - US and two-way senders: the inbound webhook `OptOutType` updates your database. Twilio sends the one confirmation; do not send a second.
   - EU alphanumeric (no replies possible): per-user unsubscribe link token plus an account toggle, effective immediately.
   - Apply one opt-out across all channels now, ahead of the 2027 revoke-all rule.
10. **Cancel.**
    - Cancelling in the Customer Portal (`cancel_at_period_end`) fires `customer.subscription.updated`; keep access until period end.
    - `customer.subscription.deleted` revokes the entitlement and stops alerts.
    - `invoice.payment_failed` starts dunning; suspend alerts after the grace period.
    - An EU withdrawal-function click triggers refund logic.

---

## Implications for our build

1. **Launch SMS in the EU only** (Slovenia first) on a Twilio Messaging Service with an alphanumeric sender (11 characters or fewer). **Turn US SMS off at launch.** US subscribers get web push or native push plus email. Every US sender type bans stock alerts, and a violation costs $10k.
2. **Do not register a disguised 10DLC or toll-free campaign.** Carriers check the brand website against the samples (codes 601–603, 709), and the false declaration itself is fined. If US SMS matters, open a pre-sales compliance ticket with Twilio about a short code for "research publisher notifications", and budget 8–12 weeks, $1,000/quarter and a likely rejection.
3. **Ask Twilio for the Slovenia financial-content LOA before go-live,** and whitelist your own link domain (e.g. `brand.si`). No bit.ly.
4. **Use Twilio Verify plus Lookup v2 for phone verification,** with Fraud Guard on and geo permissions limited to the markets you sell in.
5. **Keep message templates ASCII-only** (no č/š/ž) so each alert is one 160-character GSM-7 segment. Example: `BRAND: Nova izbira (3/3 modeli): ASML ocena 91/100. Analiza: brand.si/p/8H2K Ni nasvet. Odjava: brand.si/u/x7` (about 110 characters). Budget one segment per alert and cap it at N alerts per week, stated in the consent text.
6. **Set `validityPeriod` to 600 s on alerts**, publish on the web before SMS, and use one timestamp for the whole batch. Disclose that delivery can lag, and ban staff trading around picks (MAR front-running exposure).
7. **Our own consent and opt-out database is the source of truth.** Twilio's opt-out list can't be queried, so capture `OptOutType` from the inbound webhook. Honour STOP at once and across channels.
8. **Enforce 08:00–21:00 recipient-local quiet hours in code.** Outside that window, send email/push immediately and suppress the SMS.
9. **Stripe setup:** Checkout (`mode=subscription`), Customer Portal, Entitlements, Stripe Tax with OSS registration, and the SDK pinned to `2026-08-26.dahlia`. Grant access on `invoice.paid` or the entitlements event, not on redirect. Ask Stripe in writing whether a stock-research subscription is allowed on standard accounts and under Managed Payments before building on MoR.
10. **Build an EU "withdraw from contract" function** (Directive 2023/2673) in the account area. The immediate-performance acknowledgement goes at checkout.
11. **Legal review before launch:** keep picks non-personalised, add MAR Art. 20 disclosure pages linked from each SMS, and check the US publisher-exclusion risk of event-triggered alerts.
12. **Open items to settle with vendors:**
    - Twilio Slovenia per-SMS price and account MPS
    - Infobip and Vonage quotes for Slovenian routes as a failover
    - Meta's WhatsApp policy on investment content