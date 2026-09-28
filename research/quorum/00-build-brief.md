# Quorum: build brief v1.0

**Date:** 28 Sep 2026. **Owner:** Product lead. **Status:** These decisions are final for v1. A decision reopens only if a launch gate in §8 fails.

**Working name:** Quorum. Sender ID `QUORUM`, link domain `qrm.si`. Trademark and domain availability are UNVERIFIED; run an EUIPO search before spending money on the brand.

**Entity:** A Slovenian d.o.o. in Ljubljana.

**Verification rule:** Every item the research marked UNVERIFIED must be checked against its primary source before launch. Vendor prices need written quotes.

---

## 0. Where the reports disagree, and what we chose

| Topic | What the reports say | Decision |
|---|---|---|
| **Cadence** | Market: alert only on conviction and "never on a calendar". Regulation: publish in fixed issue slots, because under Lowe/*SEC v. Park* a publisher must have "general and regular circulation" and must not time alerts to the market. | **Both.** A web issue publishes every US trading day at 14:00 Ljubljana time, even when there is no pick. An SMS goes out only when that issue contains a pick or an exit. We publish on a calendar and text only on conviction. |
| **US customers** | Market and Regulation: register 10DLC or a short code. SMS report: US carriers ban stock-alert SMS on every sender type. Regulation: geofence the US until a US counsel opinion exists. | **No US residents at launch. No US SMS ever**, unless a carrier grants an exception in writing. US *stocks* are covered. |
| **Universe** | Market: STOXX 600 plus S&P 500 / Russell 1000, with EU stocks included in the base price. Quant: liquid US stocks only, because only US point-in-time (PIT) data is affordable. | **v1 covers liquid US stocks. v1.5 adds STOXX 600** once an EU PIT dataset passes the same validation. EU coverage is then included at no extra charge. Danelfin has a real lead on EU coverage until then. |
| **Holding period** | Market SMS example: about 3 months. Regulation example: 12 months. Quant: 21 trading days. | **21 trading days, open to open.** 5-day and 63-day outcomes are also reported. |
| **Performance price** | Regulation: the price at dissemination. Quant and Market: the next open. | **Record both.** Performance is measured from the next US open. The difference is published as the "alert gap". |
| **SMS validity period** | SMS report: `validityPeriod` 600 s. | **3,600 s.** Entry is at the US open, 90 minutes after send, so an alert is still useful for an hour. We pace sends ourselves so nothing waits in Twilio's queue. |
| **SMS format** | Market example uses "·" and "Conviction 4/5". Regulation example includes an ISIN and a reference price. | **ASCII GSM-7 only, no price in the SMS, disclosures via link, "3/4 models".** The "·" in the Market example is not in GSM-7: it forces UCS-2 encoding (70 characters per segment), so that example costs 2 segments. |
| **Homepage data** | Design: show the live stock universe as the hero. Regulation: per-stock scores count as MAR investment recommendations. | **The hero shows the most recently closed issue**, never current scores. |
| **Scrolling** | Design: Lenis "lightly at most". | **Native scroll only.** No Lenis, no scrolljacking. |
| **Opt-in confirmation** | Regulation: double opt-in. SMS report: whether it is mandatory is UNVERIFIED. | **The Twilio Verify one-time code is the confirmation step.** The opt-in SMS follows it. |

---

## 1. Positioning and the one differentiating idea

**Who it is for:** self-directed EU retail investors who buy liquid US stocks through EU brokers. Slovenia first, then Austria, Germany, Croatia and Italy. They want few, well-argued picks and proof that the picks work, not a daily feed.

**The one idea: no quorum, no text.**

Every US trading day we score about 1,300 liquid US stocks with **four independent model families**.
- A pick exists only when **at least 3 of the 4 families put a stock in their top decile** and no veto fires.
- Before a pick is sent, it is **sealed**: SHA-256 hashed, chained to the previous record, and anchored daily to a public timestamp.
- It is **scored from the next US open**, which is a price a subscriber could actually get.
- **Each model family's own record is public.**
- Most days there is no quorum, and we publish that too.

**Why nobody else does this** (gaps from the market report):

| Gap | Evidence | What we do instead |
|---|---|---|
| Picks arrive on a calendar or in a daily flood | Alpha Picks on the 1st and 15th ([SA](https://seekingalpha.com/alpha-picks/about)); Motley Fool on the 1st and 3rd Thursday; Danelfin and Zacks send daily emails | Texts only when models agree, and the rule is published |
| Headline results are backtests | Danelfin +376% (labelled backtest); Zacks hypothetical since 1988 ([disclosure](https://zacks.com/performance_disclosure)); Fool's average is dominated by one Nvidia pick ([techtimes](https://www.techtimes.com/articles/325852/20260828/motley-fool-stock-advisor-hits-964-what-that-figure-doesnt-tell-new-subscribers.htm)) | A live, hash-chained ledger with median, hit rate and every loser. Backtests are on a separate page. |
| Price pops after the pick is released | Alpha Picks complaints; Trade Ideas slippage of 20–40% | Performance measured from the next open; the alert gap is published; a liquidity floor that rises with subscriber count |
| A score with no reason attached | Danelfin: "a number, not a thesis" | Each pick has a written thesis built from the model data, plus an exit date set at entry |
| Nobody publishes per-model accuracy or how often models agree | Market report §6 | A per-family scoreboard, with 4/4 vs 3/4 vs 2/4 outcomes |
| SMS is used only by penny-stock shops | Tim Alerts, Top Stock Alerts | A research-grade SMS service. The gap exists partly because **US carriers forbid it**, so this edge is EU-specific and legal here ([Telnyx EU](https://support.telnyx.com/en/articles/6531704-european-sms-guidelines)). |
| Not EU-native | Prices in USD or GBP; no Slovene or German explanations | EUR pricing, Slovene and English at launch, German next, MAR-compliant by design |

**What we are not:**
- **Not personal advice.**
- **Not an LLM stock picker.** The NBER paper w35153 found no significant abnormal returns from GPT, Claude, Gemini or Grok picks ([NBER](https://www.nber.org/papers/w35153)).
- **Not a day-trading tipster.**
- **No auto-trading.**

**Head-to-head competitor:** Danelfin (Barcelona, raised €2M, covers 5,500+ EU stocks, runs a forward audit at [audit.danelfin.com](https://audit.danelfin.com/)).
- We win on the conviction gate, SMS delivery, a commit-reveal ledger measured from the open, per-model accuracy, and written theses.
- We lose on EU stock coverage until v1.5.

**"They get our data":** the Research tier (§6) delivers the daily full-universe dataset. The public ledger and per-model scoreboard are free to everyone.

**Taglines:** "We only text when the models agree." "Most days: no quorum."

---

## 2. Product rules

### 2.1 Who can subscribe
- **EU/EEA consumers only.** Slovenia first.
- **SMS countries at launch: SI, AT, DE, HR, IT.** Ireland, Finland and Norway need sender pre-registration, so they come later ([Telnyx EU](https://support.telnyx.com/en/articles/6531704-european-sms-guidelines)).
- **Excluded:** US, UK (RAO Art. 53 / PERG 7), Australia, and Canada until reviewed.
- **How the geofence is enforced:** IP address, declared country, phone country (from Lookup) and card billing country must all agree.

### 2.2 Issue cadence (satisfies Lowe's "general and regular circulation")
- **Daily issue at 14:00:00 Europe/Ljubljana on every US trading day.**
  - This is always before the US open: 15:30 local time, or 14:30 during the weeks when EU and US daylight-saving dates differ.
  - It publishes on the web every day. An empty issue reads "No quorum today", with the number of stocks scored and the closest agreement reached.
- **Weekly "Ledger" email on Sunday at 18:00:** open picks, closes and statistics. No SMS.
- **Signals that form between slots wait for the next slot.** No intraday texts, no price-triggered texts.
- **An SMS goes out only when the issue contains a BUY, CLOSE or RENEW.**

### 2.3 The quorum rule (the conviction gate)

1. **Eligible stocks** must pass the universe and capacity filters in §3.1.
2. **Trigger:** at least 3 of the 4 families (A trend, B fundamental momentum, C quality/value, D machine-learning ranker) place the stock in their top decile on the issue date.
3. **Vetoes:** no veto fires (see §3.2).
4. **Caps:**
   - At most **2 new picks per issue**, ranked by combined score.
   - At most **8 new picks per calendar month**.
   - At most **3 open picks per GICS sector**.
   - No re-issue of a stock within 10 trading days of its close, except via RENEW.
5. **Calibration:** thresholds are tuned on the validation period to average **3–6 picks per month**. They are then frozen per methodology version. Any change creates a new version and a public changelog entry.
6. **How conviction is shown:** only as **"3/4" or "4/4"**. No other conviction number, and no probabilities until calibration evidence is published.
7. **The human approver can only remove a pick,** with a logged reason, never add or substitute one. Vetoes are counted publicly in the ledger.

### 2.4 Holding period and exits
- **What BUY means:** "We expect the stock to beat the S&P 500 total return over the next 21 trading days, measured from the next US regular-session open. No price target." Picks are long-only.
- **Entry:** the US open on the issue day.
- **Exit:** the US open 21 trading days later. For example, a pick issued Monday 28.09.2026 exits at the open on Tuesday 27.10.2026.
- **No stop-losses and no discretionary exits.**
- **At the day-21 slot:**
  - If the stock still meets the quorum rule, we send a **RENEW**: a new linked record with a new 21-day window.
  - Otherwise we send a **CLOSE**. Both are texted.
- **Corrections** are new records. Existing records are never edited.

### 2.5 SMS content rules

**Every pick SMS must contain:**
- the brand
- the pick number
- the action and the ticker
- the dissemination date and time with its time zone
- the entry and exit rule
- the model agreement
- "Not personal advice"
- a link to the pick page, which carries the MAR disclosures under the 2016/958 proportionality clause
- a per-user unsubscribe link

**An SMS must never contain:**
- prices or targets (the page carries the price with its timestamp)
- urgency words ("now", "act", "last chance")
- return claims, or "for you"
- emojis
- any character outside GSM-7: č, š, ž, "·", "–", "€"
- link shorteners. Only our own whitelisted domain is allowed.

**Delivery rules:**
- **Every tier gets identical content with the same web publish timestamp.** The SMS is a notification of the issue. Entry is 90 minutes later, so the order of sends does not affect measured results.
- **Quiet hours of 08:00–21:00 recipient-local time are enforced in code.** The 14:00 slot always falls inside them across EU time zones, but the check stays in.
- **The consent text states the frequency: at most 16 messages a month**, covering picks and exits.

**Templates.** All are GSM-7, one segment each, counted with a script.

| Message | Text | Length (160 max) |
|---|---|---|
| BUY (EN) | `QUORUM #0417 BUY ACME 28.09.26 14:00 CEST. Entry: US open 28.09. Exit: US open 27.10. 3/4 models. Not personal advice: qrm.si/p/0417 Stop: qrm.si/u/7Kq2xZ` | 154 |
| BUY (SL, ASCII, needs native review) | `QUORUM #0417 NAKUP ACME 28.09.26 14:00 CEST. Vstop: odprtje ZDA 28.9. Izstop: 27.10. 3/4 modelov. Ni osebni nasvet: qrm.si/p/0417 Odjava: qrm.si/u/7Kq2xZ` | 153 |
| CLOSE (EN) | `QUORUM #0417 CLOSE ACME at US open 27.10.26 (21-day rule set at entry). Result: qrm.si/p/0417 Not personal advice. Stop: qrm.si/u/7Kq2xZ` | 136 |
| RENEW (EN) | `QUORUM #0431 RENEW ACME 27.10.26 14:00 CET. Still 3/4 models. New exit: US open 25.11. Not personal advice: qrm.si/p/0431 Stop: qrm.si/u/7Kq2xZ` | 143 |
| Opt-in confirmation (EN) | `QUORUM: SMS alerts ON. Max 16 msgs/month (picks + exits), 14:00 Ljubljana time on US trading days. Replies not read. Stop: qrm.si/u/7Kq2xZ Help: qrm.si/help` | 156 |
| Opt-in confirmation (SL) | `QUORUM: SMS obvestila VKLOPLJENA. Najvec 16 SMS/mesec (izbire in izhodi), ob 14:00 na dneve trgovanja v ZDA. Odgovorov ne beremo. Odjava: qrm.si/u/7Kq2xZ` | 153 |
| Opt-out confirmation (sent once) | `QUORUM: SMS alerts OFF. No more texts. Your subscription is unchanged: qrm.si/account` | 85 |

- "ACME" is a placeholder ticker.
- Tickers are up to 5 characters and pick numbers up to 5 digits. The build must fail any rendered template longer than 160 GSM-7 septets.
- The CEST/CET label follows EU daylight-saving time: summer time ends 25.10.2026.

### 2.6 Channel strategy and the stock-tip SMS restriction

> **FLAG: US stock-tip SMS is banned outright.**
> - Telnyx's forbidden list (updated 23 Jul 2026) names "stock tips, or real-time market signals" on 10DLC, toll-free and short codes, with no exceptions ([Telnyx](https://support.telnyx.com/en/articles/14286763-forbidden-messaging-use-cases-in-the-us-and-canada-10dlc-toll-free-and-short-code)).
> - 10DLC rejection code 709 covers "traffic related to stock markets" ([codes](https://support.telnyx.com/en/articles/10547022-10dlc-carrier-error-codes-explanations)).
> - Toll-free lists "Stock Alerts" as not eligible ([Twilio US](https://www.twilio.com/en-us/guidelines/us/sms)).
> - T-Mobile charges $10,000 per content violation ([fees](https://support.telnyx.com/en/articles/5634625-10dlc-fees-and-charges)).
> - Reviewers compare the website against message samples, so disguising the use case gets caught and fined.
>
> **Decision: no US SMS, and no disguised campaign.**
>
> **The EU is open:** Telnyx's EU rules restrict only lottery and gambling. **Slovenia requires a Letter of Authorization (LOA) for financial content** ([Twilio SI](https://www.twilio.com/en-us/guidelines/si/sms)). We request it before go-live.

**Channels:**
- **SMS (EU):** a Twilio Messaging Service with the alphanumeric sender `QUORUM`, and `qrm.si` whitelisted.
  - Alphanumeric senders are one-way, so **STOP and HELP keywords cannot be received.**
  - **Opt-out:** a per-user link in every message, an account toggle, and email.
  - **Help:** `qrm.si/help` plus a support email.
  - If users reply STOP to the alphanumeric sender anyway, v1.1 adds a two-way Slovenian long number (up to 3 weeks to provision).
- **Web push** (a PWA; iOS requires the user to add it to the home screen) **and email are sent for every issue item.** SMS is never the only channel.
- **WhatsApp and Telegram are deferred.** Meta's policy on investment content is UNVERIFIED, and Twilio's Advanced Opt-Out does not cover WhatsApp.
- **Failover:** get an Infobip quote for Slovenian routes and an SMS price and throughput quote from Twilio (Slovenia pricing is UNVERIFIED).

### 2.7 Consent
- **Legal basis:** the alert SMS *is* the paid service, so it rests on contract (GDPR Art. 6(1)(b)).
- **We send no marketing SMS at all** (no upsell, no win-back texts). This keeps us clear of ePrivacy Art. 13 consent for marketing.
- **Capture:** a separate, unchecked SMS checkbox with versioned text. We store the SHA-256 of the text, a timestamp, IP, user agent, page URL, locale and channel, and keep them for at least 5 years.
- **Verification:** the Verify one-time code confirms the number. The opt-in confirmation SMS follows.
- **Withdrawing consent is one tap** (GDPR Art. 7(3)).
- **One opt-out applies across all SMS immediately.**

### 2.8 Track-record policy
- **Sealed pre-launch record.** The engine runs live in production for **at least 3 months before launch**. Every issue is hashed and anchored with OpenTimestamps ([opentimestamps.org](https://opentimestamps.org)).
  - It is labelled "pre-launch sealed record (no subscribers)" and kept separate from "live since launch".
  - Launch day therefore starts with a forward record that anyone can verify, not a backtest.
- **Everything goes in the ledger:** every BUY, CLOSE, RENEW and correction, every approver veto (counted), and every methodology change.
- **How performance is measured:**
  - Entry at the next open; exit at the open on day 21.
  - Costs of 10 bps one way for companies above $10B and 25 bps for $2–10B.
  - Results in USD and EUR.
  - Benchmark: S&P 500 total return plus the sector ETF. Fama-French 5-factor plus momentum (FF5+UMD) alpha is added after 12 months.
- **Headline statistics** appear in a fixed order. They are never animated and never the largest element on a page:
  - number of picks and the "live since" date
  - hit rate against the benchmark
  - median excess return
  - mean excess return
  - worst pick
  - maximum drawdown of a "follow every pick" portfolio
  - median alert gap in bps
- **Annualised figures appear only for complete 12-month periods.** Before that, results are cumulative since inception, with the pick count beside them.
- **Per-model scoreboard:**
  - Each family's top-decile hit rate and rank information coefficient (IC).
  - 4/4 vs 3/4 picks, against a **2/4 "shadow" control set** that is published aggregated after close. This set shows whether the gate adds value.
- **Full-universe decile returns and monthly rank IC** are published for statistical breadth.
  - Proving a 55% hit rate against 50% at 2 standard errors needs about 400 picks, which takes years at our cadence (quant §4).
- **The backtest is on its own page,** labelled "HYPOTHETICAL", shaded, with the number of variants tried, the Deflated Sharpe Ratio (DSR) and the Probability of Backtest Overfitting (PBO). It never appears in the hero, in ads or in an SMS.
- **Public commit-reveal:**
  - Free visitors see open picks as number, time, hash and "sealed".
  - The ticker is revealed at close.
  - Subscribers see everything at 14:00.
- **Verification tools:** a daily Merkle root anchored with OpenTimestamps and an RFC 3161 timestamp authority, a CSV download, and in-browser hash verification.
- **Auto-generated from the ledger:** the MAR 12-month list of all recommendations and the quarterly rating distribution (100% BUY, and we say so).

### 2.9 Structural rules that keep us a publisher, not an adviser (regulation §3)

**Must hold:**
- Identical content for every tier. **Tiers differ in data breadth, never in pick timing.**

**Never build:**
- A suitability quiz, portfolio import, "picks for you", position sizing, or watchlist-triggered action alerts. MiFID Delegated Reg. 2017/565 Art. 9 makes anything "presented as suitable" a personal recommendation ([EUR-Lex](https://eur-lex.europa.eu/eli/reg_del/2017/565/oj)).
- Auto-trading, copy-trading or broker execution (the *Weiss Research* and *Terry's Tips* theory).
- Seat caps, invite-only rooms, or private chat groups with staff (these undercut "general" circulation).

**Support and any future AI assistant:**
- They explain published data only and must refuse "should *I* buy or sell?".
- All conversations are logged.
- The bot is labelled as AI (AI Act Art. 50).

**Staff and firm trading:**
- **Staff, founders and their families trade funds and ETFs only, with no single stocks.** This is stricter than the regulation report's 5-day embargo and simpler to police.
- **The firm holds no single stocks.**
- **Pre-release candidates are access-controlled and every access is logged** (CJEU [C-302/20](https://curia.europa.eu/juris/liste.jsf?num=C-302/20)).

**Payments and conflicts:**
- No issuer payments.
- No affiliate or broker referral revenue at launch.

**Social media:** founder and staff posts carry MAR "expert" disclosures and never preview picks.

---

## 3. Engine design

### 3.1 Universe and capacity
- **US common stocks** with price above $5, market cap above $2B and 60-day average daily volume (ADV) above $25M. That is about 1,200–1,500 names.
- **Capacity rule:** ADV floor = max($25M, 50 × expected subscriber flow). This keeps subscriber buying at or below 2% of ADV.
  - Expected flow = SMS subscribers × 25% follow rate × $5,000 ticket. Both inputs are assumptions, revisited quarterly.
  - Example: 10,000 subscribers means $12.5M of flow, which sets a $625M ADV floor.
- **Monitoring:** if the median alert gap exceeds 30 bps over 20 picks, the floor doubles.

### 3.2 Signals

| Family | Construction | Evidence and caveat |
|---|---|---|
| **A: Trend** | Residual (industry- and market-adjusted) 12-1 momentum, volatility-scaled | Jegadeesh-Titman ([DOI](https://doi.org/10.1111/j.1540-6261.1993.tb04702.x)); residual momentum roughly doubles risk-adjusted returns ([Blitz-Huij-Martens](https://doi.org/10.1016/j.jempfin.2011.01.003)); volatility scaling lifts Sharpe from about 0.53 to 0.97 ([Barroso-Santa-Clara](https://doi.org/10.1016/j.jfineco.2014.11.010)). **Crash switch:** when the market is in a rebound after a bear market, A's vote is suspended and the quorum needs 3 of the remaining 3 ([Daniel-Moskowitz](https://doi.org/10.1016/j.jfineco.2015.12.002)). |
| **B: Fundamental momentum** | Standardised earnings surprise (SUE) from SEC EDGAR XBRL, keyed to filing date; year-on-year change in gross profitability and earnings; analyst revision breadth **only once history exists** | **Expected to be the weakest family.** Post-earnings drift has largely vanished in large caps (Martineau, CFR 2022). Cheap APIs expose only the current consensus, so we snapshot it daily from day one. Revisions join B only after purchased PIT history validates them, or after 24 months of our own snapshots. If B's holdout IC net of costs is ≤ 0, B is replaced by an insider-cluster family. |
| **C: Quality/value** | Gross profits/assets, QMJ-style metrics, EV/EBIT, free-cash-flow yield, intangibles-adjusted book-to-market | [Novy-Marx](https://doi.org/10.1016/j.jfineco.2013.01.003); [QMJ](https://doi.org/10.1007/s11142-018-9470-2). **Value and momentum are negatively correlated** ([AMP 2013](https://doi.org/10.1111/jofi.12021)), so they are never a mandatory pair. |
| **D: ML ranker** | LightGBM ranker. 60–120 features, each rank-transformed to [-1, 1], missing values set to 0. Target: sector-relative rank of the 21-day forward return. Tree depth 3–6, averaged over many seeds. | Trees beat deep learning on tabular data ([Grinsztajn](https://arxiv.org/abs/2207.08815)); ML gains shrink sharply without microcaps ([Avramov-Cheng-Metzker](https://doi.org/10.1287/mnsc.2022.4449)); the dominant predictors are momentum, liquidity and volatility ([Gu-Kelly-Xiu](https://doi.org/10.1093/rfs/hhaa009)). |
| **Confirmation (no vote in v1)** | Opportunistic insider cluster buying, filtered per Cohen-Malloy-Pomorski | Shown on the pick page only |
| **Vetoes** | Stock is in the top days-to-cover decile (FINRA data); stock is in the top idiosyncratic-volatility decile; earnings fall within the next 3 trading days; a merger or split is pending; an LLM flags material negative news or filings in the last 48 hours | Heavily shorted stocks underperform over about 20 days ([Boehmer-Jones-Zhang](https://doi.org/10.1111/j.1540-6261.2008.01324.x)) |

- **Independence check.** The quant simulation shows that with signal correlation ρ = 0.5, a 3-agree gate yields about 15× more picks with little gain in precision.
  - We publish monthly rank correlations between families.
  - If D's correlation with any of A–C exceeds 0.5 on validation, D is retrained without that family's raw inputs.

### 3.3 What the LLM does and does not do
- **It never picks.** Its three jobs:
  1. The 48-hour negative-event veto (news, 8-Ks, guidance cuts).
  2. Drafting the thesis in EN and SL from the factor JSON. **A validator checks that every number in the text appears in the source data.** If a draft fails, the model regenerates it once; if it fails again, the approver writes the thesis.
  3. Embeddings of 10-K and 10-Q text as D features, using point-in-time dates only.
- **LLM components are backtested only on dates after the model's training cutoff,** with anonymised inputs ([Glasserman-Lin](https://arxiv.org/abs/2309.17322)). The veto is therefore validated live, during the sealed pre-launch record.
- **Operations:** the provider is chosen on EU data-processing terms and a documented training cutoff. The model version is pinned, and every prompt and output is logged.

### 3.4 Validation protocol
1. **History:** as far back as the PIT data allows (target: 2000 onward). **The last 3 years (Oct 2023 to Sep 2026) are an untouched holdout.** It is opened once, after the engine is frozen.
2. **Walk-forward:** an expanding training window with annual retraining. Each prediction uses only data from after its training cutoff.
3. **Hyperparameters:** purged k-fold cross-validation with a 21-day purge and a 1-month embargo. Combinatorial purged CV (CPCV) provides a distribution of backtest paths (López de Prado, AFML ch. 7 and 12).
4. **Every configuration tried is logged** (in MLflow). We report the [Deflated Sharpe Ratio](https://papers.ssrn.com/sol3/papers.cfm?abstract_id=2460551), [PBO](https://papers.ssrn.com/sol3/papers.cfm?abstract_id=2326253) and Harvey-Liu haircuts. The quant report computed that, with 100 zero-skill variants over 5 years, the best one would show an expected Sharpe of about 1.13.
5. **Look-ahead and survivorship controls:**
   - Fundamentals only after the SEC acceptance timestamp (Sharadar `datekey`, ARQ/ART dimensions), as first reported.
   - Historical index membership, not today's.
   - Delisted stocks included with their delisting returns (about −30% where missing, per [Shumway](https://doi.org/10.1111/j.1540-6261.1997.tb03818.x)).
   - Everything keyed on CIK or FIGI, never ticker.
6. **Ship gates.** All are measured on the holdout, net of costs. All must pass:
   - (a) Quorum picks show positive mean *and* median excess return against S&P 500 total return, with a hit rate of at least 53%.
   - (b) Quorum picks beat both the 2/4 set and every single family's top decile. **If not, the gate adds nothing and the positioning fails. We go back to research; we do not launch.**
   - (c) D beats an equal-weight composite of A–C. If not, D is dropped and the rule becomes 3 of 3 (A–C), recalibrated.
   - (d) DSR probability of at least 0.95 and PBO below 0.3.
   - (e) Pick frequency of 3–8 per month.
7. **Expectations:**
   - Consensus picks should beat the benchmark about **53–58%** of the time. **A sustained live rate above 60% is treated as a bug** (leakage) until proven otherwise.
   - Returns decay by roughly 58% after publication ([McLean-Pontiff](https://doi.org/10.1111/jofi.12365)). This is budgeted, not hoped away.
8. **Live retirement rule (pre-registered and public):** a family whose 24-month live IC is ≤ 0 is retired.

### 3.5 Data providers at launch

All prices and licence terms below are UNVERIFIED; get written quotes.

| Need | Choice | Notes |
|---|---|---|
| Research fundamentals, prices, insiders | **Nasdaq Data Link Sharadar**: SF1 (ARQ/ART), SEP including delisted stocks, SF2 (Form 4), historical S&P 500 membership ([SF1](https://data.nasdaq.com/databases/SF1)) | The best budget PIT option. Licensed for internal research. |
| Displayed fundamentals and insider data | **SEC EDGAR** XBRL `companyfacts`/`frames` and Form 4 ([API](https://www.sec.gov/search-filings/edgar-application-programming-interfaces)), at up to 10 requests/s | Public data, so it can be shown to users |
| Short interest | **FINRA**, published twice a month | Redistribution terms UNVERIFIED |
| Consensus snapshots | Intrinio (Zacks estimates) or FMP, whichever licenses internal storage | Snapshotted daily from day one |
| User-facing prices | **Intrinio web-display licence**, end-of-day and 15-minute delayed only; **Massive (formerly Polygon) business tier** as the second quote | Showing raw vendor prices to paying users counts as redistribution |
| Identifiers and attribution | OpenFIGI, CIK, the Ken French data library, JKP factors | — |
| EU v1.5 | Enterprise quote for STOXX 600 PIT fundamentals with filing dates | EODHD is not true PIT. **No EU picks on non-PIT data.** |

---

## 4. Subscription, SMS and billing architecture

### 4.1 Services (all hosted in the EU)

| Service | Technology | Job |
|---|---|---|
| `web` | Next.js on Vercel (fra1) | Marketing site, app, issue and pick pages (regenerated at 14:00:00). Webhook endpoints are thin: verify the signature, persist the raw payload, enqueue. |
| `db` | Postgres 16 on AWS RDS eu-central-1 | Ledger tables are append-only, enforced by triggers and by revoking UPDATE/DELETE. A daily WORM (write-once) export goes to S3 Object Lock in compliance mode, retained 5 years. |
| `queue` | Graphile Worker (runs on Postgres) | A transactional outbox. Idempotency keys on every job. |
| `ingest`, `engine` | Python on scheduled ECS Fargate tasks; LightGBM; MLflow | Data ingestion, scoring, vetoes, candidates, experiment logging |
| `explainer` | Worker calling the pinned LLM | Veto scan and EN/SL theses, plus the numeric validator |
| `publisher` | TypeScript worker | Seals records into the hash chain, publishes the issue, starts the notification fan-out |
| `notifier` | TypeScript worker | Twilio Messaging Service, Web Push (VAPID), email (Postmark, EU) |
| `anchor` | Nightly job | Merkle root, then OpenTimestamps and an RFC 3161 timestamp token |
| `admin` | Internal app behind SSO and hardware-key 2FA | Approver console (veto only), staff pre-clearance, access logs |
| **Vendors** | Twilio (Messaging Service, Verify, Lookup v2); Stripe (Checkout, Billing, Customer Portal, Entitlements, Tax), SDK pinned to `2026-08-26.dahlia` ([changelog](https://github.com/stripe/stripe-node/blob/master/CHANGELOG.md)); Sanity for editorial content only | Legal and consent texts live in the git repo, versioned and hashed, not in the CMS |

### 4.2 Onboarding flow
1. **Choose a tier,** then create an account (email with a passkey or magic link).
2. **Geofence check** (§2.1). A failure ends signup with a plain explanation.
3. **Phone check:**
   - Lookup v2 (`line_type_intelligence`, `sms_pumping_risk`) rejects landlines, VoIP numbers and high-risk numbers.
   - Verify sends the code by SMS in the user's locale (sl or en), with Fraud Guard on and geographic permissions limited to the SMS countries.
   - A valid code sets `phone_verified_at`.
4. **Consent screen:**
   - An unchecked SMS box.
   - Terms, plus an acknowledgement of immediate performance with notice of the withdrawal right.
   - Each consent is written as a `consent_events` row holding the text hash.
5. **Stripe Checkout** with `mode=subscription`, `client_reference_id=user_id`, `automatic_tax`, `tax_id_collection` and terms consent.
6. **The redirect shows an "Activating…" page.** **No entitlement is granted on the redirect.**
7. **Webhooks:**
   - Verify the signature and dedupe on `event.id`.
   - `checkout.session.completed` links the Stripe customer to the user.
   - `invoice.paid` sets the entitlement active until `current_period_end` plus a 3-day grace period.
   - Always re-fetch the subscription, because events can arrive out of order.
8. **When the user is entitled, has opted in to SMS and has a verified phone:** send the opt-in confirmation SMS, a welcome email with the SMS terms, and a web push prompt.

### 4.3 Daily pipeline (Ljubljana time)

| Time | Step |
|---|---|
| 22:15 (day before) | End-of-day prices ingested; open picks marked to market |
| 01:00 | EDGAR filings, Form 4 and consensus snapshot ingested (FINRA short interest when released) |
| 05:30 | Universe snapshot and capacity floor calculated |
| 06:00 | Families A–D scored; rule-based vetoes; quorum check writes `candidates` (access-controlled and logged) |
| 11:30 | LLM 48-hour veto scan; EN/SL theses drafted; numeric validator runs |
| 12:00–13:40 | Named approver reviews (veto only). With no approver and no deputy, the candidate is logged "unissued (no approver)". |
| 13:45 | **Seal:** canonical JSON (RFC 8785), SHA-256, previous hash, `production_completed_at`. The commitment hash is posted to the public ledger. |
| 14:00:00 | **Issue published.** `disseminated_at` and the dissemination price are recorded with their source and timestamp. Notifications are enqueued. |
| 14:00–14:10 | SMS paced to account throughput; push and email sent in parallel |
| 15:30 | The US open price is recorded as the entry `price_mark` |
| Day 21 | Exit open price recorded, then `outcomes` written. The RENEW or CLOSE decision goes into that day's 13:45 seal. |
| 23:59 UTC | Merkle root of the day's ledger rows, then OpenTimestamps and RFC 3161. Proof published and CSV refreshed. |

### 4.4 Fan-out, delivery receipts, opt-out and cancellation

**Recipient selection:** entitled AND SMS opted in AND not opted out AND phone verified AND inside local quiet hours.

**Sending:**
- The idempotency key `rec_id:user_id:channel` is unique. The notification row is persisted *before* the provider call.
- The call is `messages.create(messagingServiceSid, to, body, statusCallback, validityPeriod=3600)`.

**Delivery receipts:**
- Validate `X-Twilio-Signature`. Status only moves forward.
- **21610** (recipient opted out) marks the user opted out.
- Repeated **30003/30005/30006** marks the number invalid and triggers an email to the user.
- **30007** (filtered as spam) above 2% of sends within 10 minutes pauses the SMS channel and pages on-call. Push and email continue.

**Opt-out:**
- `/u/{token}` records the opt-out in one tap. It applies to all SMS immediately and sends one confirmation SMS.
- **Our own database is the source of truth,** because Twilio's opt-out list cannot be queried ([advanced opt-out](https://www.twilio.com/docs/messaging/tutorials/advanced-opt-out)).

**Cancellation and billing events:**

| Trigger | Action |
|---|---|
| Cancel in the Customer Portal | `cancel_at_period_end`; access continues until the period ends |
| `customer.subscription.deleted` | Entitlement revoked |
| `invoice.payment_failed` | Dunning emails; alerts suspended after the 7-day grace period |
| `invoice.payment_action_required` | Email with the 3-D Secure (SCA) link |
| `invoice.upcoming` | Annual renewal reminder, 7 days ahead |
| `charge.dispute.created` | Entitlement revoked; case reviewed |
| **EU withdrawal button** (Directive [2023/2673](https://eur-lex.europa.eu/eli/dir/2023/2673/oj), applies from 19 Jun 2026) | `withdrawals` row, Stripe refund, immediate cancellation |

### 4.5 Data model

| Area | Table | Key columns |
|---|---|---|
| Identity | `users` | id, email, declared_country, jurisdiction, locale, status |
| | `phone_numbers` | user_id, e164, country, line_type, pumping_risk, verified_at, invalid_at |
| | `consent_events` (append-only) | user_id, kind (sms/terms/immediate_performance/email_mkt), action (grant/revoke), text_version, text_sha256, ip, user_agent, page_url, locale, created_at |
| | `channel_prefs`, `push_subscriptions`, `unsubscribe_tokens` | sms/push/email flags; endpoint and keys; token (≥6 characters, base62), used_at |
| Billing | `subscriptions` | stripe_subscription_id, tier, status, current_period_end, cancel_at_period_end, last_event_id |
| | `entitlements` | user_id, feature (picks, research_data), active_until, source |
| | `processed_events` | provider, event_id (unique), payload, received_at |
| | `withdrawals` | subscription_id, requested_at, refund_id, status |
| Market | `instruments`, `ticker_history` | figi, isin, cik, permaticker, sector; ticker validity ranges |
| | `universe_snapshots` | date, instrument_id, price, mcap, adv60, eligible, reason |
| | `consensus_snapshots` | date, instrument_id, fiscal_period, eps_mean, n_est, n_up, n_down, source |
| Engine | `signal_scores` | date, instrument_id, family, score, pct_rank, model_version_id |
| | `vetoes`, `candidates` | type and detail; families_in_top_decile, combined_score, status (issued, vetoed_rule, vetoed_llm, vetoed_human, capped, no_approver) |
| | `model_versions`, `methodology_versions`, `experiments` | git_sha, params_hash, training_cutoff, validation_report; change summary; every configuration tried with its CV metrics |
| Ledger | `issues` | issue_date, published_at, has_pick, n_scored, closest_agreement |
| | `recommendations` (INSERT only) | public_no, kind (BUY/CLOSE/RENEW/CORRECTION), instrument_id, prior_rec_id, horizon=21, planned_exit_date, families_json, model_version_ids, methodology_version_id, explanation_id, responsible_person_ids, conflicts_snapshot, dissemination_price, price_source, price_at, production_completed_at, disseminated_at, canonical_json, sha256, prev_sha256 |
| | `persons` | full_name, job_title, role, active_from, active_to |
| | `explanations` | lang, text, source_numbers_json, validator_passed, llm_model, prompt_sha256, approved_by |
| | `price_marks`, `outcomes` | kind (entry_open, exit_open, close), price, fx_eurusd, source; gross, net, benchmark, excess, alert_gap_bps, eur_return |
| | `ledger_anchors` | date, merkle_root, ots_proof, rfc3161_token, row_count |
| Messaging | `notifications` | unique (rec_id, user_id, channel), status, provider_sid, body_sha256, queued/sent/delivered timestamps, error_code |
| | `delivery_events`, `opt_outs` | raw status callbacks; channel, source (link, account, support, twilio) |
| Compliance | `access_log`, `staff_trade_requests`, `disclosure_texts` | who viewed which pre-release object and when; pre-clearance decisions; versioned and hashed legal texts |

---

## 5. Design direction: "Colonnade"

**Concept: no lintel without columns.**

- **The architectural idea.** A lintel only stands on columns; a pick only exists on agreeing models.
- **Where it comes from:** Ljubljana's architect Jože Plečnik (the Central Market colonnade, and his unbuilt parliament for Slovenia). The quorum idea is literally an assembly. Plečnik is an inspiration for the grid, never photographed or quoted.
- **The four model families are four columns** that run through every page. When 3 of the 4 reach the top, an ultramarine **lintel** forms across them. That lintel is the brand mark, the pick moment, the SMS and the favicon.

### Palette

WCAG contrast ratios were computed.

| Token | Hex | Use | Contrast |
|---|---|---|---|
| Karst | `#E3E6E4` | Page background: cool limestone grey, deliberately not cream | — |
| Paper | `#F4F5F3` | Pick-note sheets, cards | — |
| Graphite | `#111418` | Text, primary buttons, focus ring | 14.7:1 on Karst |
| Slate | `#545C63` | Secondary text | 5.4:1 |
| Hairline | `#AEB6B9` | The four column rules and table rules (decorative only, not for text) | 1.6:1 |
| Chamber | `#0D1014` | Dark data surfaces: hero, dashboard, ledger chain | — |
| Mist | `#C9CFD2` | Text on Chamber | 12.1:1 |
| **Quorum Ultramarine** | `#1F2EE0` | **Only for a quorum:** the lintel, pick badge, SMS bubble, favicon dot. Never CTAs, links or decoration. | 6.6:1 on Karst; white on it 8.3:1 |
| Quorum Lift | `#8C96FF` | The same role on Chamber (`#1F2EE0` on Chamber is only 2.3:1, so it is not allowed there) | 7.2:1 |
| Gain / Loss | `#0B6E4F` / `#B3261E`; on dark `#4FD1A1` / `#FF8A7A` | Profit and loss only, always with a +/− sign and an arrow | 5.0 / 5.2; 10.0 / 8.3 |

**Rule: if ultramarine is on screen, the models agreed.** It is never used as a gradient.

### Type (Google Fonts)
- **Archivo** (variable, width 62–125, weight 100–900) as one family for brand and interface:
  - Headlines use compressed widths 62–70 (tall, like columns).
  - Interface and body text use width 100.
  - `font-variant-numeric: tabular-nums` is set globally.
- **Newsreader** (optical sizes 6–72) for theses, pull quotes and pick-page body, so a pick reads like a research note.
- **Martian Mono** (width 75–112.5) for tickers, ISO-8601 timestamps, hashes and every numeric table column, so alignment is guaranteed.
- **At build time, verify** the variable axes and Latin Extended coverage (č, š, ž) for all three families.
- **Not used:** Inter, Space Grotesk, Söhne.

### Layout
- **Four full-height hairline "column rules"** sit at fixed positions on every page. On hover they show the labels A, B, C, D.
  - They are the axes of every chart: the hero, the pick-page colonnade chart, the ledger's table rules and the pricing columns.
  - Headlines hang from rule 1. Body text sits between rules 1 and 3 (68 characters maximum). A metadata strip sits between rules 3 and 4.
  - On mobile, the rules become the 4-column grid with 16 px gutters.
- **The rules never re-render between routes.** The View Transitions API moves content between them, so the page feels like one continuous building.
- **Navigation is built on three questions,** borrowed from Tresmares:
  - "How does a pick happen?" (How it works, Methodology)
  - "Did it work?" (Ledger, Backtest)
  - "What do I get?" (Pricing, Join)

### Signature moment: "The Level" (hero, WebGL with OGL)

1. **Data.** The most recently closed issue that had a pick, for example "Issue #0412 · 21.08.2026 · 1,384 stocks · 1 quorum". Every eligible stock is drawn as a parallel-coordinates polyline across the four rules, with height set by each family's percentile. Tickers are hidden except the closed pick. This is real data, and none of it is a current recommendation.
2. **On load (900 ms).** The lines settle from noise into their real positions. The quorum line locks along the tops of the columns and turns ultramarine: that is the lintel.
3. **Scroll 1.** Every other line falls away, using gravity computed in the vertex shader rather than a physics engine. This follows Shopify's lesson: they dropped 3D physics for 2D because older phones struggled.
4. **Scroll 2 (Rive state machine indexed to scroll).** The lintel contracts into a text baseline and becomes the real SMS in a phone, with its real timestamp.
5. **Scroll 3.** The phone opens the link and morphs into the pick-page layout. Then the lintel extends 21 trading days to the right as the real excess return against the S&P 500 total return, drawn in Gain or Loss colour.
   - **The hero always shows the latest closed pick, win or lose.**
   - Caption: "Our latest closed pick. Whatever happened."
6. **Fallbacks:**
   - A server-rendered SVG of the same chart is the largest-contentful-paint element.
   - WebGL loads after that paint, only on GPUs of tier 2 or higher (detected with `detect-gpu`).
   - Tier 1 gets a 2D canvas with 300 lines.
   - `prefers-reduced-motion` gets the SVG with stepped states.

### Supporting data visualisations
- **Silence Calendar.** One cell per trading day since the sealed record began.
  - A hollow cell means an issue was published with no quorum. An ultramarine cell means a pick.
  - Focus text reads, for example, "28.09.26 · 1,402 scored · closest 2/4".
- **Ledger Chain** (on Chamber). Stacked issue blocks with a SHA-256 prefix, a previous-hash link and anchor status.
  - **"Verify in your browser"** recomputes the hash with WebCrypto and shows whether it matches, with a link to the OpenTimestamps proof.
- **Colonnade chart** (pick page). Four columns of family percentiles with the top-decile band shaded and the lintel drawn across the qualifying columns. Factor-driver bars sit under each column, followed by the sensitivity line.
- **Model scoreboard.** Dot plots with confidence intervals for each family and for 4/4 vs 3/4 vs 2/4. Every estimate shows its uncertainty.
- **Decile staircase.** Full-universe decile returns, with a sparkline of the monthly information coefficient.

### Micro-interactions
- Hovering any column rule reveals the family name and a one-line definition.
- Timestamps show on focus as ISO-8601 with offset, the UTC time, and "production completed" vs "first disseminated".
- **At signup, the phone field shows a live preview of the exact SMS** with a septet counter ("154/160 GSM-7"). Any character outside GSM-7 is highlighted.
- The consent checkbox shows "Text v3 · sha256 9f2c…", proof that we store exactly what the user saw.
- A header pill counts down: "Next issue 14:00 · 2h 13m". At 14:00 it switches to "No quorum today" or "Quorum: 1 pick", with an ultramarine dot.
- Hashes show 8 characters; a click copies the full hash.
- **Numbers never count up.** Value changes use a 150 ms cross-fade.
- Native cursor, no magnetic buttons. Focus is a 2 px Graphite outline with a 2 px offset. Skip links are included.

### Motion rules and budgets
- **Motion:**
  - Native scroll.
  - GSAP ScrollTrigger scrubbing for the hero only; CSS scroll-driven animations elsewhere.
  - Interface transitions of 150–400 ms on `cubic-bezier(0.2, 0, 0, 1)`.
  - No looping animations after the hero has settled.
- **Performance budgets:**

  | Metric | Target |
  |---|---|
  | Largest Contentful Paint | ≤ 2.0 s on a mid-range Android over 4G |
  | Interaction to Next Paint | ≤ 150 ms |
  | Cumulative Layout Shift | ≤ 0.05 |
  | Initial JavaScript | ≤ 170 KB gzipped |
  | WebGL chunk | ≤ 120 KB gzipped, loaded lazily |
  | Hero frame rate | ≥ 55 fps on tier-2 GPUs |

- **Accessibility:** WCAG 2.2 AA and full keyboard navigation.
- **Award thresholds:** Awwwards Mobile Excellence needs 75 or more ([criteria](https://www.awwwards.com/mobile-award/)). The Developer Award jury scores performance and accessibility ([dev award](https://www.awwwards.com/developer-award/)).

### What we borrow from award winners

| Reference | What we take |
|---|---|
| **Shopify Live Globe**, SOTD 19 Jan 2026 ([Awwwards](https://www.awwwards.com/sites/shopify-live-globe-2025), [engineering write-up](https://shopify.engineering/2025-bfcm-live-globe)) | Real data as the spectacle; switching from 3D to 2D for weaker phones |
| **Moto Finance**, Properly Studio, SOTD Sep 2026 ([Awwwards](https://www.awwwards.com/sites/moto-finance)) | One hero object carries the brand idea: our lintel |
| **Jeton**, Bürocratik, SOTD 27 Jan 2025 ([case study](https://www.awwwards.com/case-study-jeton-by-burocratik.html)) | Rive indexed to scroll; the desktop-to-phone morph used for the SMS moment |
| **Tresmares Capital**, Dgrees, SOTD 12 Jun 2026 ([Dgrees](https://dgrees.studio/works/tresmares-capital/)) | A concept derived from the name (their mountain, our quorum and colonnade); navigation by three questions; a portal for existing clients |
| **Into The Amazon**, Gladeye, SOTD 21 Apr 2025 ([Awwwards](https://www.awwwards.com/sites/into-the-amazon)) | Scroll storytelling with data visualisation; a two-colour discipline |
| **Stripe** and **Linear** | The marketing page behaves like the product (an ungated ledger and scoreboard) |
| **Robinhood Cortex methodology** ([methodology](https://www.robinhood.com/us/en/support/articles/cortex-digests-methodology)) | A public methodology page |
| **Composer** and **Koyfin** | Metric set on the ledger; draggable widgets in the Research dashboard |

### Anti-cliché check
- Not cream + serif + terracotta.
- Not near-black + acid green.
- No gradients, and no purple.
- No Inter, Space Grotesk or Söhne.
- No stock photos, bulls, coins, robots, "neural network" imagery or AI sparkle icons.
- The only imagery is data and type.

### Pages (every page in `/sl` and `/en`)
1. `/` Home: The Level, how the quorum works, Silence Calendar, ledger preview, pricing teaser, disclosures.
2. `/how-it-works`: families, vetoes, cadence, why most days are silent.
3. `/methodology` and `/methodology/changelog`: model versions, validation reports, DSR and PBO.
4. `/ledger`: all picks, the chain, in-browser verification, CSV, headline statistics, scoreboard, deciles and IC.
5. `/backtest`: labelled HYPOTHETICAL and kept separate.
6. `/issue/[date]`: every daily issue, including empty ones.
7. `/p/[no]`: the pick research note with full disclosures.
8. `/s/[ticker]`: the 12-month recommendation history for a stock.
9. `/disclosures`: the 12-month list, quarterly distribution, conflicts and trading policy, responsible persons.
10. `/pricing`.
11. `/join`: account, phone verification, consent, checkout.
12. `/app`: today's issue, open picks, channel settings.
13. `/app/research`: the Research-tier explorer, with widgets on Chamber.
14. `/account`: channels, billing portal, **withdrawal button**, data export, account deletion.
15. `/u/[token]`: one-tap SMS opt-out.
16. `/help`: SMS help and FAQ.
17. `/status`: today's delivery status per channel.
18. `/about`: named responsible persons.
19. `/legal/*`: terms, privacy, SMS terms, imprint, cookies.

### Stack, studio and award plan
- **Stack:** Next.js, OGL, GSAP, Rive, Sanity (editorial only), Vercel.
- **Studios:**
  - Pitch **Dgrees** (Tresmares) and **Bürocratik** (Jeton): EU studios with finance SOTD and Developer Award wins.
  - **a-lign studio** (Slovenia, [Awwwards](https://www.awwwards.com/sites/a-lign-studio)) is the local, lower-cost option.
  - PeachWeb (a no-code builder) cannot build the app.
- **Budget:** €60–120k and 12–16 weeks, running in parallel with the sealed pre-launch record.
- **Awards submission:**
  - Launch, fix bugs for 2–3 weeks, then submit to Awwwards (target SOTD plus the Developer and Mobile awards; finance SOTDs scored 7.3–7.6), CSSDA and FWA.
  - Enter the Webby Fintech category in the next cycle.
  - Real content only.

---

## 6. Pricing tiers

All prices are in EUR and include VAT. Every tier is available monthly. Annual billing costs 10 months' price.

| Tier | Monthly | Annual | Includes |
|---|---|---|---|
| **Ledger** | €0 | — | Public ledger (sealed open picks, closed picks revealed), daily issue headline, methodology, backtest page, per-model scoreboard, weekly email. No SMS. |
| **Signal** | **€19** | **€190** | Every BUY, CLOSE and RENEW at 14:00 by SMS (in SMS countries), push and email. Full pick pages (thesis, colonnade chart, sensitivity, disclosures), full ledger CSV. |
| **Research** | **€39** | **€390** | Everything in Signal, plus the daily full-universe dataset (about 1,300 stocks: family percentiles, quorum status, vetoes, history), screener, decile and IC dashboards, weekly factor report, CSV export for personal use (no redistribution). **Launch depends on Gate R in §8.** |

**Market anchors:**
- Danelfin: $29, $79 or $179 a month.
- Seeking Alpha Premium: $299 a year.
- Alpha Picks: $499 a year, with no monthly plan.
- Zacks: $249 a year.
- Motley Fool: $99–199 a year.

**Policies:**
- **No trial;** the free Ledger tier plays that role.
- **A 14-day full refund on a customer's first subscription,** via the withdrawal button.
- **One-click cancellation.**
- **A renewal reminder 7 days before any annual charge.**
- **No upsell emails in the first 30 days.**
- **No seat caps, countdown timers or "limited" offers.** They undercut general circulation, and the FTC fined RagingBull for comparable conduct ([FTC](https://www.ftc.gov/news-events/news/press-releases/2022/03/online-investment-site-pay-more-24-million-bogus-stock-earnings-claims-hard-cancel-subscription)).
- **One price for everyone.**

**Signal unit economics, per subscriber per month:**
- €19 including 22% Slovenian VAT is €15.57 net. Destination-country VAT through OSS applies once cross-border EU consumer sales pass €10k a year.
- Stripe costs about €0.75:
  - 1.5% + €0.25 on EEA cards
  - 0.5% for Stripe Tax
  - roughly 0.6% for Billing (UNVERIFIED)
- SMS costs about €0.80–1.90: up to 16 messages at an assumed €0.05–0.12 each. The Slovenian price is UNVERIFIED; pull it from Twilio's Pricing API.
- **Contribution: about €12.90–14.00.**
- **Do not use Stripe Managed Payments** until Stripe confirms in writing that a stock-signal subscription is an allowed category ([restricted businesses](https://stripe.com/legal/restricted-businesses)).

---

## 7. Mandatory disclosure copy

**Slovene versions ship at launch, translated and approved by counsel.** Square brackets are filled from the ledger record or company data.

**Site footer**
> Quorum Research d.o.o., [address], Ljubljana, Slovenia · Reg. no. [ ] · VAT [ ].
> We publish general investment research to the public. It is not personal investment advice and does not take your situation into account. We are not an investment firm and are not authorised by the Slovenian Securities Market Agency (ATVP) to give investment advice.
> Shares can fall as well as rise; you can lose all the money you invest. Past performance is not a reliable indicator of future results. Our track record is a hypothetical paper portfolio, not real trades.
> Picks come from statistical and machine-learning models. Written explanations are drafted with AI and approved by a named person. Neither the company nor our staff hold individual shares.
> Not available to residents of the US, UK or Australia.
> [Disclosures] · [Methodology] · [All recommendations, last 12 months] · [Conflicts & trading policy] · [Terms] · [Privacy] · [SMS terms]

**Pick page, summary box at the top**
> **BUY [ACME Corp.], [ISIN], [ticker], [venue]**
> Meaning: we expect it to beat the S&P 500 total return over 21 trading days, measured from the next US open. No price target. Exit at the US open on [date].
> Production completed [2026-09-28T13:45:02+02:00] · First disseminated [2026-09-28T14:00:00+02:00] · Price at dissemination [$xx.xx, source, timestamp].
> Prepared by [Name], [Head of Research] (approver), and [Name], [Model Lead]. Models: ensemble [v1.3.0]; methodology [v1.2] ([summary of changes]).
> **General research issued to the public. Not personal advice.**

**Pick page, full block at the bottom** (MAR Art. 20 and Delegated Reg. 2016/958 Arts 2–6; [MAR](https://eur-lex.europa.eu/eli/reg/2014/596/oj), [2016/958](https://eur-lex.europa.eu/eli/reg_del/2016/958/oj))
> **Status.** This is an investment recommendation under Art. 3(1)(35) of Regulation (EU) 596/2014. It is issued exclusively to the public. It is not a personal recommendation or investment advice under Directive 2014/65/EU. [Entity] is not an investment firm and is not authorised by ATVP.
> **Facts and opinion.** The "Data" section is facts from [SEC EDGAR, Sharadar, FINRA] as of [timestamps]. The "Thesis" section is our opinion. Model scores are forecasts, not facts.
> **Method.** A pick is issued only when at least 3 of our 4 model families rank the stock in their top 10% and no veto applies. [Full methodology]. [Changes since last version].
> **Risk and sensitivity.** This recommendation would not have been issued if [family C's percentile had been below 90, about 0.3 standard deviations lower]. Momentum-based signals can suffer sharp losses after market rebounds. Currency moves affect euro returns.
> **Previous recommendations on this stock (12 months).** [None / list with dates].
> **Conflicts.** The company holds no position in this issuer, above or below 0.5%. Staff and founders may hold funds only, never individual shares, and never trade against a recommendation. We have no relationship with, and receive no payment from, the issuer. We earn no referral or affiliate fees. This recommendation was not shown to the issuer before publication.
> **Updates.** Reviewed on every US trading day. The exit is set at entry.
> [12-month list of all our recommendations] · [Quarterly rating distribution: 100% BUY]
> **This explanation was drafted by an AI model from our model data and checked and approved by [Name].**

**Track record label**
> Hypothetical paper portfolio. Returns assume buying at the next US regular-session open after each pick and selling at the open 21 trading days later, minus assumed costs of [10–25 bps] each way. No actual account achieved these results. Excludes taxes; euro figures include currency effects. Past performance is not a reliable indicator of future results.

**Backtest page banner**
> BACKTESTED – HYPOTHETICAL. Generated with hindsight on data from [2000–2023]. May suffer from look-ahead, survivorship and overfitting bias. We tried [N] model variants. These are not live results.

**SMS**
- Every pick SMS carries: `Not personal advice: qrm.si/p/NNNN` plus an unsubscribe link (see the templates in §2.5).

**SMS consent checkbox (unchecked by default)**
> Send me Quorum picks and exits by SMS to [+386 •• ••• 45]. Up to 16 messages a month, at 14:00 Ljubljana time on US trading days. You can switch this off at any time with the link in every message or in your account. SMS is not a condition of your subscription; you also get picks by email and push.

---

## 8. Risks that would kill the business, and the mitigation

| # | Risk | Mitigation |
|---|---|---|
| 1 | **Reclassified as investment advice** (MiFID licence needed; the €75k capital route) | Structural rules in §2.9. Support and AI scripted to refuse personal questions. An informal written query to ATVP before launch. Slovenian counsel opinion. |
| 2 | **Breach of MAR Art. 20, scalping or inside information** (fines of at least €1M for companies; up to €15M or 15% of turnover for manipulation) | Disclosures generated automatically from the append-only record; funds-only trading for staff; the firm holds no stocks; pre-release access logged; social media policy |
| 3 | **SMS channel refused or blocked** (the US is already closed; Slovenia needs an LOA) | Obtain the LOA before go-live. Push and email always sent. Infobip failover. Automatic pause on 30007 spikes. The product still works with no SMS. |
| 4 | **No edge, decay after publication, or a momentum crash**, made visible by our own honest ledger | Ship gates §3.4(a)–(e). The 2/4 control set proves or disproves the gate in public. Pre-registered retirement rule. Crash switch. Marketing sells the process and the data, never returns. |
| 5 | **Low statistical power plus an early losing streak drives churn** | The sealed pre-launch record gives a head start. Full-universe IC and deciles provide evidence faster. The Research data holds value even when picks lose. Honest expectations (53–58%) set on the pricing page. |
| 6 | **Subscriber herding and the price popping after alerts** | ADV floor that rises with subscriber count; median alert gap published and monitored; measurement from the next open; at most 2 picks per issue |
| 7 | **Payment processor closes the account** because the category is restricted | Written confirmation from Stripe before launch. A second processor contracted before launch (e.g. an EU acquirer; UNVERIFIED). |
| 8 | **Data licence breach** (showing vendor prices without redistribution rights) | Intrinio or Massive display licence; end-of-day and 15-minute delayed data only; fundamentals shown from SEC data; scores are our own derived data (vendor derived-data policy to be confirmed) |
| 9 | **Consumer-law and billing complaints** (the category's main complaint; RagingBull precedent) | Monthly plans; one-click cancellation; withdrawal button; 7-day renewal reminder; no dark patterns; no testimonials |
| 10 | **Misleading AI or performance claims** ([SEC AI-washing cases](https://www.sec.gov/newsroom/press-releases/2024-36); Slovenian unfair-practices law ZVPNPP) | Every "AI" claim maps to a named model on the methodology page; backtests kept separate; no earnings claims |
| 11 | **Key person:** the founder is the named responsible person | A named deputy approver. A missed approval means no pick, never an unapproved one. |
| 12 | **Danelfin copies SMS and gating** | A timestamped record cannot be copied after the fact; the sealed record starts now. EU-language theses. Fast launch. |
| 13 | **The award website eats budget and time** | Spend capped at €120k. The award surfaces *are* the product pages. Built in parallel with the 3-month sealed record, not before it. |
| 14 | **Name conflict** ("Quorum" is widely used) | EUIPO and domain check before any brand spend. Fallback names shortlisted. |

**Launch gates (all must pass):**

- **E. Engine.** All five holdout ship gates in §3.4 pass. At least 3 months of the sealed record run clean.
- **L. Legal.**
  - Slovenian counsel review of the ZTFI-1 fine ranges and MAR/MiFID status.
  - The ATVP query sent.
  - The Twilio Slovenia LOA granted.
  - Stripe's category confirmation in writing.
  - Counsel confirms that commit-reveal (paid first, public at close) needs no extra disclosure beyond what the pricing page already states.
- **R. Research tier.** Counsel decides whether each daily per-stock score counts as a MAR recommendation that must appear in the 12-month list.
  - If it does, Research launches with families A–C as descriptive percentiles (facts) only. The D score and quorum status for non-picks are held back.
- **D. Data.** Written quotes and licences from Sharadar, Intrinio or Massive, and the consensus vendor.
- **S. SMS.** The Slovenian per-message price and throughput confirmed. Throughput confirmed to finish a 14:00 fan-out within 10 minutes at the projected subscriber count.