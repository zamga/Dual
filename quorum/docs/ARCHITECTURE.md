# Quorum: architecture and interface contract

This document is the contract every part of the codebase codes against. `docs/BRIEF.md` is the product spec. Where this file is more specific than the brief, this file wins. Where they conflict on a product rule, the brief wins and this file is a bug.

Runtime: Node >= 22.13, ESM everywhere (`"type": "module"`), no TypeScript, no bundler. The only npm dependencies are `@anthropic-ai/sdk` and `zod` (server explainer). Everything else is written here. Tests use `node:test` + `node:assert/strict`.

```
quorum/
  core/       isomorphic ES modules (browser + Node). No node:* imports, no Buffer, no process.
  engine/     simulated market, the four model families, GBDT, walk-forward, backtest, validation, sealed record, export
  server/     node:http + node:sqlite. Auth, geofence, Twilio, Stripe, consent, publisher, notifier, scheduler, explainer, admin
  web/        zero-dependency single-page site. Published as-is (static). web/js/core is a build copy of core/
  scripts/    build-web, fixture-data, check-sms-templates, demo-day, e2e
  tests/      core/, engine/, server/, web/ (node:test). e2e/ is Playwright, run by scripts/e2e.js
  docs/       BRIEF.md, ARCHITECTURE.md, DESIGN.md (written by the web lead), OPERATIONS.md
```

## 0. The demo timeline (simulated)

Everything shown on the site comes from a **simulated market of fictional companies**. The site says so on every page. Real dates are used so the calendar, time zones and holding periods are exercised for real.

| Period | Dates | Use |
|---|---|---|
| Simulated history | 2008-01-02 → 2026-09-28 (NYSE trading days from `core/calendar.js`) | Prices, fundamentals, short interest, earnings dates, news events, benchmark |
| Research window (walk-forward, CV, variants) | 2008-01-02 → 2022-09-30 | Training, hyperparameters, calibration of thresholds (3–6 picks/month) |
| Untouched holdout | 2022-10-03 → 2025-09-30 (3 years) | Opened once. Ship gates (a)–(e). Shown on the Backtest page as HYPOTHETICAL |
| Engine freeze | 2025-09-30 | Ensemble v1.0.0, methodology v1.0 |
| **Sealed record** (pre-launch, no subscribers) | 2025-10-01 → 2026-09-28 (today) | The public ledger: one issue per US trading day at 14:00 Europe/Ljubljana, hash-chained |

"Now" for the demo is Monday 2026-09-28, after the US close (22:15 CEST ingest). Today's issue has been published; today's entry opens (15:30 CEST) exist; open picks are marked to the 28.09 close.

One methodology change happens inside the sealed record (for example v1.1 on 2026-03-02: "capacity floor raised; LLM veto prompt v2"), recorded as a METHODOLOGY ledger entry and a changelog item.

## 1. core/ (isomorphic)

All functions are pure unless marked async. Dates are `'YYYY-MM-DD'` strings. Instants are ISO-8601 strings with an explicit offset (`2026-09-28T14:00:00+02:00`) or `Date` where noted.

### core/random.js
- `mulberry32(seed: number) → () => number` in [0,1).
- `normal(rng) → number` (Box–Muller, standard normal).
- `seededShuffle(array, rng) → array` (new array).
- `hashSeed(...parts: (string|number)[]) → number` (FNV-1a 32-bit over the joined string, for deriving sub-seeds).

### core/calendar.js
NYSE holidays by rule (New Year's Day, MLK Day, Presidents' Day, Good Friday, Memorial Day, Juneteenth from 2022, Independence Day, Labor Day, Thanksgiving, Christmas) with NYSE observance (Saturday → Friday before, except New Year's Day on a Saturday is not observed on 31 Dec; Sunday → Monday after), plus special closures: 2007-01-02, 2012-10-29, 2012-10-30, 2018-12-05, 2025-01-09.
- `isHoliday(date) → boolean`, `holidayName(date) → string|null`
- `isTradingDay(date) → boolean`
- `nextTradingDay(date) → date` (strictly after), `prevTradingDay(date) → date` (strictly before)
- `addTradingDays(date, n) → date` (n may be negative; n = 0 returns date if it is a trading day)
- `tradingDaysBetween(from, to) → date[]` (inclusive of both ends when they are trading days)
- `countTradingDays(from, to) → number` (trading days in (from, to])
- `tzOffsetMinutes(instant: Date, timeZone) → number` (e.g. +120 for CEST)
- `zonedToInstant(date, 'HH:MM[:SS]', timeZone) → Date`
- `formatInZone(instant: Date, timeZone) → {date, time, offset:'+02:00', iso}`
- `issueSlot(date) → { issueDate, publishAt: ISO (+02:00/+01:00), publishAtUtc: ISO Z, tzLabel: 'CEST'|'CET', usOpenAt: ISO (-04:00/-05:00), usOpenLocal: 'HH:MM' Ljubljana time, minutesToOpen: 90|30|… , sealAt: ISO 13:45 local }`
- `nextIssueSlot(now: Date) → issueSlot` of the first trading day whose 14:00 Ljubljana slot is > now
- `LJUBLJANA = 'Europe/Ljubljana'`, `NEW_YORK = 'America/New_York'`
- Formatting: `fmtDDMMYY(date) → '28.09.26'`, `fmtDDMM(date) → '28.09.'`, `fmtDM(date) → '28.9.'`, `fmtLong(date, locale) → '28 Sep 2026' | '28. sep. 2026'`

Worked examples that tests must pin: `addTradingDays('2026-09-28', 21) === '2026-10-27'`; `addTradingDays('2026-10-27', 21) === '2026-11-25'`; `issueSlot('2026-10-27').tzLabel === 'CET'` and `.usOpenLocal === '14:30'`; `issueSlot('2026-09-28').usOpenLocal === '15:30'`.

### core/canonical-json.js
- `canonicalize(value) → string` RFC 8785 (JCS): object keys sorted by UTF-16 code units, no whitespace, numbers via ECMAScript `Number#toString`, strings via `JSON.stringify`. Throws on `undefined`, functions, symbols, `NaN`, `±Infinity`, `BigInt`.

### core/hash.js
- `async sha256Hex(input: string | Uint8Array) → string` (lowercase hex) via `globalThis.crypto.subtle`.
- `async hashCanonical(value) → string` = `sha256Hex(canonicalize(value))`.
- `shortHash(hex, n = 8) → string`.
- `randomToken(len = 6, rng?) → string` base62 (uses `crypto.getRandomValues` when no rng).

### core/gsm7.js
- `GSM7_BASIC: string` (the 128-char default alphabet), `GSM7_EXT: string` (`^{}\[~]|€` and form feed).
- `analyze(text) → { encoding: 'GSM-7'|'UCS-2', septets, units, segments, perSegment, nonGsm: [{index, char}], extChars: [{index, char}] }`. GSM-7: 160 per single segment, 153 per part when multi-part; extension chars cost 2 septets. UCS-2: 70 / 67 (count UTF-16 code units).
- `isGsm7Basic(text) → boolean` (basic set only, no extension chars; this is what SMS templates must satisfy).

### core/sms-templates.js
- `LINK_DOMAIN = 'qrm.si'`, `SENDER_ID = 'QUORUM'`, `MAX_MONTHLY_MESSAGES = 16`.
- `renderSms(kind, locale, data) → string`, kind in `BUY | CLOSE | RENEW | OPT_IN | OPT_OUT`, locale in `en | sl`.
  - `data`: `{ no: '0417', ticker: 'ACME', issueDate: '2026-09-28', entryDate, exitDate, agreement: 3|4, token: '7Kq2xZ4m', priorNo?: '0417' }`. The time and the CEST/CET label come from `issueSlot(issueDate)`.
  - Must reproduce these byte for byte (brief §2.5; the brief's examples carry a 6-character stop token, live tokens have 8, `server/tokens.js` `TOKEN_LENGTH`, and `npm run check:sms` measures the worst case):
    - BUY en: `QUORUM #0417 BUY ACME 28.09.26 14:00 CEST. Entry: US open 28.09. Exit: US open 27.10. 3/4 models. Not personal advice: qrm.si/p/0417 Stop: qrm.si/u/7Kq2xZ4m`
    - BUY sl: `QUORUM #0417 NAKUP ACME 28.09.26 14:00 CEST. Vstop: odprtje ZDA 28.9. Izstop: 27.10. 3/4 modelov. Ni osebni nasvet: qrm.si/p/0417 Odjava: qrm.si/u/7Kq2xZ4m`
    - CLOSE en: `QUORUM #0417 CLOSE ACME at US open 27.10.26 (21-day rule set at entry). Result: qrm.si/p/0417 Not personal advice. Stop: qrm.si/u/7Kq2xZ4m` (for CLOSE, `issueDate` is the close issue date and `no` is the BUY/RENEW number being closed)
    - RENEW en: `QUORUM #0431 RENEW ACME 27.10.26 14:00 CET. Still 3/4 models. New exit: US open 25.11. Not personal advice: qrm.si/p/0431 Stop: qrm.si/u/7Kq2xZ4m`
    - OPT_IN en: `QUORUM: SMS alerts ON. Max 16 msgs/month (picks + exits), 14:00 Ljubljana time on US trading days. Replies not read. Stop: qrm.si/u/7Kq2xZ4m Help: qrm.si/help`
    - OPT_IN sl: `QUORUM: SMS obvestila VKLOPLJENA. Najvec 16 SMS/mesec (izbire in izhodi), ob 14:00 na dneve trgovanja v ZDA. Odgovorov ne beremo. Odjava: qrm.si/u/7Kq2xZ4m`
    - OPT_OUT en: `QUORUM: SMS alerts OFF. No more texts. Your subscription is unchanged: qrm.si/account`
  - Slovene CLOSE / RENEW / OPT_OUT (ASCII, flagged for native review in a code comment):
    - CLOSE sl: `QUORUM #0417 ZAPRTJE ACME ob odprtju ZDA 27.10.26 (pravilo 21 dni ob vstopu). Rezultat: qrm.si/p/0417 Ni osebni nasvet. Odjava: qrm.si/u/7Kq2xZ4m`
    - RENEW sl: `QUORUM #0431 PODALJSANJE ACME 27.10.26 14:00 CET. Se vedno 3/4 modelov. Nov izstop: 25.11. Ni osebni nasvet: qrm.si/p/0431 Odjava: qrm.si/u/7Kq2xZ4m`
    - OPT_OUT sl: `QUORUM: SMS obvestila IZKLOPLJENA. Ni vec SMS. Narocnina ostaja nespremenjena: qrm.si/account`
- `validateSms(text) → { ok, errors: string[], analysis }`. Errors when: not GSM-7 basic set; more than 160 septets (one segment); a forbidden word appears as a whole word, case-insensitive (urgency: `now`, `act`, `hurry`, `urgent`, `last chance`, `guaranteed`, `for you`, `today only`, `limited`, `immediately`, `today`, `fast`; targets and return claims: `target(s)`, `upside`, `return(s)`, `gain(s)`, `profit(s)`, `profitable`, `sure(ly)`; and the Slovene ASCII equivalents); a currency sign or code appears (`$`, `€`, `USD`, `EUR`); a price-like decimal number appears once dates (`28.09.26`, `28.09.`, `28.9.`) and links are set aside (`123.45`, `12,5`); a `%` or a `!` appears; any link-like token (`\b[\w-]+(\.[\w-]+)+\/\S*`) is not on `qrm.si`. The server's send gate (messaging, notifier) relies on it.
- `worstCase(kind, locale) → string` renders with a 5-char ticker, a 5-digit number and the longest date forms; used by `scripts/check-sms-templates.js` and tests to prove every template is one segment.

### core/consent-texts.js
Versioned, hashed legal texts shared by web and server so the checkbox shows exactly the hashed text.
- `CONSENT_TEXTS = { sms: { version: 'v3', en: '...', sl: '...' }, terms: {...}, immediate_performance: {...} }`. SMS text from brief §7 with a `{phone}` placeholder masked as `+386 •• ••• 45`.
- `consentText(kind, locale, vars) → string` (fills placeholders).
- `async consentHash(kind, locale) → string` = sha256Hex of the *template* text (placeholders unfilled), so the hash is stable per version and locale.

### core/ledger.js
Entry shape: `{ seq, type, issueDate, at, body, prevHash, hash }`.
- `GENESIS_HASH` = 64 zeros. `type` in `METHODOLOGY | ISSUE | BUY | RENEW | CLOSE | CORRECTION`.
- `async hashEntry({seq, type, issueDate, at, body, prevHash}) → hex` = `sha256Hex(canonicalize({seq,type,issueDate,at,body,prevHash}))`.
- `async createEntry(prev | null, {type, issueDate, at, body}) → entry` (seq = prev.seq + 1 or 0; prevHash = prev.hash or GENESIS_HASH).
- `async verifyChain(entries) → { ok, checked, firstBad: seq|null, reason: string|null }` (checks seq continuity, prevHash links and each hash).
- `async verifyEntry(entry) → boolean`.
- `async merkleRoot(hexHashes[]) → hex|null` (pairwise `sha256Hex(left + right)` over hex strings, last one duplicated when odd; `null` for empty).
- Commit–reveal: `async commitment(reveal) → hex` = `hashCanonical(reveal)`; `async verifyReveal(commit, reveal) → boolean`. `reveal = { no, ticker, figi, issueDate, agreeing: ['A','B','D'], salt }` where `salt` is 16 base62 chars.
- Bodies:
  - `METHODOLOGY`: `{ version, effective, summary: {en, sl}, modelVersion }`
  - `BUY`: `{ no, commit, horizon: 21, exitPlanned, agreement, methodology, modelVersion, producedAt }` (ticker hidden until close)
  - `RENEW`: `{ no, priorNo, commit, horizon: 21, exitPlanned, agreement, methodology, modelVersion, producedAt }`
  - `CLOSE`: `{ no, reveal, entry: {date, open}, exit: {date, open}, net, bench, excess }` (reveals the sealed pick)
  - `ISSUE`: `{ issueNo, nScored, closest, buys: [no], renews: [no], closes: [no], vetoes: {rule, llm, human, capped}, methodology }`
    The live server's ISSUE body also carries `humanVetoes` (codes include `news_unreviewed`: removed at 13:40 because the scan did not clear and no approver read the news), `unissued` and `newsScan: {clear, flagged, reviewed, unreviewed}`.
  - `CORRECTION`: `{ refSeq, field, was, now, reason }`
  - Order within one issue date: BUY/RENEW entries (sealed 13:45, `at` = sealAt), then the ISSUE entry (`at` = publishAt, announcing that day's BUYs, RENEWs and CLOSEs), then the CLOSE entries one minute after the US open (`at` = open + 1 min), because the exit price exists only then.

### core/quorum-rule.js
- `DEFAULT_RULE = { topPct: 0.9, minAgree: 3, maxPerIssue: 2, maxPerMonth: 8, maxPerSector: 3, cooldownDays: 10, families: ['A','B','C','D'] }`
- `agreement(pct: {A,B,C,D}, {topPct, suspended: string[]}) → { count, agreeing: string[], eligibleFamilies: string[] }`
- `applyQuorum({ date, stocks, rule, crashSwitch, openPositions, monthCount, lastClosedOn }) → { candidates, buys, closest }`
  - `stocks`: `[{ id, ticker, sector, pct: {A,B,C,D} (0–1, null if not scored), vetoes: string[] }]`
  - `crashSwitch = true` suspends A; the gate becomes "all 3 of B, C, D" (still displayed as 3/4).
  - Candidate status: `issued | vetoed_rule | vetoed_llm | capped_issue | capped_month | capped_sector | cooldown | already_open`.
  - `combined` = mean percentile over non-suspended families; buys ranked by `combined` desc, ties by id.
  - `closest` = max agreement count over eligible, non-vetoed stocks (0–4).
- `sensitivity(pct, agreeing, topPct) → { family, margin }`: the qualifying family with the smallest margin above `topPct` (used for "would not have been issued if C were below 90").

### core/stats.js
`mean, median, quantile(values, q), std, sum, rank (average ties), spearman(x, y), pearson(x, y), bootstrapCI(values, stat = mean, {n = 2000, alpha = 0.05, seed = 7}) → [lo, hi], hitRate(values) (share > 0), sharpe(periodReturns, periodsPerYear), maxDrawdown(equity[]) → negative fraction, skewness, kurtosis (non-excess), normCdf, normInv, expectedMaxSharpe(nTrials, varSR), deflatedSharpe({sr, nTrials, varSR, T, skew, kurt}) → probability, pbo(matrix: number[T][N], S = 16) → { pbo, logits }` (CSCV, Bailey–Borwein–López de Prado–Zhu).

### core/numeric-validator.js
- `extractNumbers(text) → string[]` (numbers as written, including `+1.8%`, `0.96`, `96th`, `3/4`).
- `validateNumbers(text, sourceNumbers: number[], {tolerance}) → { ok, unknown: string[] }`: every number in the text must match a source number after normalisation (percent ↔ fraction, rounding to the precision written; a percentile ordinal such as `94th` or `94. percentil` may also be the truncated rank, as `fmtPctRank` writes it). Dates and pick numbers are allowed when present in `sourceNumbers` as strings.

### core/format.js
`fmtPct(x, {sign, digits}) → '+1.8%'` (uses the real minus sign U+2212 on web only via `fmtPctHtml`; plain ASCII hyphen in SMS), `fmtBps(x)`, `fmtUsd(x)`, `fmtEur(x)`, `fmtInt(n, locale)` (1,384 / 1.384), `fmtPctRank(p) → '96'` and `pctRank(p) → 96` (truncated, never rounded, capped at 99: 0.9486 → 94, so a displayed 95 always means the score is at or above the 0.95 rule line), `arrow(x) → '↑'|'↓'|'→'`.

## 2. engine/

Deterministic from a seed (default `20260928`). `node engine/cli.js run` must finish in under 6 minutes on 4 CPUs and write `web/data/*.json` byte-identically on repeated runs (no wall-clock timestamps in the output).

- `engine/sim/` — the simulated market: ~1,900 fictional companies ever listed, ~1,300–1,450 eligible on a given date (price > $5, mcap > $2B, ADV60 > $25M), listings and delistings (with delisting returns), 11 GICS sectors, daily open/close, volume, market cap, quarterly fundamentals with SEC-style filing dates (no look-ahead), bi-monthly short interest (days to cover), earnings dates, pending M&A flags, fictional negative news events (for the LLM veto stand-in), a benchmark total-return index ("S&P 500 TR (simulated)") and sector indices, EURUSD. The hidden return process gives each family a realistic, time-varying rank IC of about 0.02–0.05 at 21 days, momentum crashes in rebounds (2009-like), independent families (mean monthly rank correlations of about 0.2 or less; D's with A, B and C near zero), a filing-disclosure latent that only D's inputs load on (drawn once per filing on its own random stream; it pays about 2.4% per standard deviation from the day after the filing with a 63-day half-life, 1.5x in low-turnover names and 0.5x in high-turnover ones), and a small nonlinear interaction the GBDT can find. Consensus picks must land at a live hit rate of roughly 53–60%; above 60% sustained is a bug.
- Fictional names and tickers: generated, never a real US ticker. Tickers are 2-4 letters and are screened against `engine/sim/us-symbols.txt` (about 22,000 root symbols of every security listed on a US exchange since 2015, ETFs included, from the exchange symbol directories) and the hand blocklist of `engine/sim/blocklist.js` (the most recognisable names and famous symbols of 2008-2014). The screen draws from its own random stream, so it never changes the simulated market. ISINs use the user-assigned `ZZ` prefix with a valid check digit; FIGIs are `SIM` + 9 chars.
- `engine/families/` — A trend (residual 12-1 momentum, vol-scaled, crash switch), B fundamental momentum (SUE by filing date, YoY gross-profitability change), C quality/value (GP/A, EV/EBIT, FCF yield, intangibles-adjusted B/M), D ML ranker (`engine/ml/gbdt.js`: histogram GBDT, depth 3–6, rank-transformed features in [-1, 1], missing = 0, target = sector-relative rank of 21-day forward return, averaged over seeds, annual walk-forward retraining). D learns only from inputs of its own: one-month reversal, 60-day and idiosyncratic volatility, beta, max daily return, turnover, days to cover, insider buyers, days since filing and four filing-text embedding components. The inputs of A–C and their named proxies (12-1 and 6-1 momentum, EPS change, earnings timing, leverage, size) are excluded by construction, and a research-window proxy screen drops any candidate input whose correlation with A, B or C is 0.2 or more (it drops ADV); the number of inputs left is published in D's definition (`meta.families`, id `D`).
- Vetoes: top days-to-cover decile, top idio-vol decile, earnings within 3 trading days, pending M&A, and the LLM 48-hour negative-news veto (in the simulation a deterministic stand-in classifies the fictional headlines; it is labelled as a stand-in everywhere it appears). The LLM veto is never backtested (brief §3.3): it applies from the first issue of the sealed record (`meta.sealedSince`), and the research window, the calibration, the variant matrix, the holdout, the comparison sets and the ship gates run without it. What the stand-in would have blocked there is published apart (`backtest.llmVetoShadow`).
- Validation: purged k-fold with 21-day purge and 1-month embargo for hyperparameters; every configuration tried is logged (`experiments`), DSR and PBO computed over them; ship gates (a)–(e) evaluated once on the holdout.
- Sealed record: day-by-day from 2025-10-01 with the frozen models; caps, cooldown, crash switch, RENEW/CLOSE at day 21; a named approver may remove (never add) — a few human vetoes are simulated and counted; theses written by `engine/thesis.js` (template writer, EN and SL, every number from the factor JSON, checked with `core/numeric-validator.js`; `drafter: 'template'`). Outcomes: entry at the US open of the issue day, exit at the open 21 trading days later, costs 10 bps one way above $10B mcap and 25 bps for $2–10B, excess vs the benchmark TR, EUR return, alert gap (dissemination price = previous close vs entry open, in bps), 5-day and 63-day outcomes where available.
- `engine/export.js` writes the data contract below.

## 3. The data contract (`web/data/*.json`)

All numbers are plain JSON numbers (fractions, not percent: `0.018` = 1.8%). Dates `'YYYY-MM-DD'`. Instants ISO with offset. Every file has `"simulated": true`. Pick numbers are 4-digit zero-padded strings.

**meta.json**
```json
{ "simulated": true, "seed": 20260928, "asOf": "2026-09-28", "dataThrough": "2026-09-28T16:00:00-04:00",
  "sealedSince": "2025-10-01", "holdout": {"from": "2022-10-03", "to": "2025-09-30"}, "engineFrozen": "2025-09-30",
  "methodology": [{"version": "1.0", "effective": "2025-10-01", "summary": {"en": "...", "sl": "..."}, "seq": 0}],
  "modelVersion": "ensemble 1.0.0",
  "families": [{"id": "A", "name": {"en": "Trend", "sl": "Trend"}, "def": {"en": "Residual 12-1 momentum, volatility-scaled", "sl": "..."}}],
  "persons": [{"id": "p1", "name": "…", "title": {"en": "Head of Research", "sl": "Vodja raziskav"}, "role": "approver", "fictional": true}],
  "universe": {"scoredToday": 1384, "eligibleRule": {"minPrice": 5, "minMcap": 2e9, "minAdv": 25e6}},
  "counts": {"issues": 250, "quorumDays": 41, "picks": 55, "renews": 4, "closed": 51, "open": 4},
  "rule": {"topPct": 0.91, "minAgree": 3, "maxPerIssue": 2, "maxPerMonth": 8, "maxPerSector": 3, "cooldownDays": 10, "horizon": 21, "costs": {"above10B": 0.001, "from2to10B": 0.0025}},
  "notes": {"simulation": {"en": "…", "sl": "…"}, "llmVeto": "stand-in", "counting": "…", "prices": "…", "marketCaps": "…", "stream": "…"}
}
```
`rule` is the calibrated rule (`topPct` is whatever the research-window calibration chose). `notes.simulation` is the plain-language disclosure shown with the record: the market and its parameters are simulated and chosen by us; the simulated world and family D were revised on 29 Sep 2026 after an earlier run showed D overlapping A and C; a simulation shows how Quorum works, not that it has an edge, which only a live sealed record can show.

**summary.json** — headline statistics in the brief's fixed order, for the sealed record:
```json
{ "simulated": true, "liveSince": "2025-10-01", "label": {"en": "Pre-launch sealed record (no subscribers)", "sl": "..."},
  "nPicks": 55, "nRenews": 4, "nRecords": 59, "nClosed": 51, "hitRate": 0.56, "hitCI": [0.43, 0.69], "medianExcess": 0.011, "meanExcess": 0.008,
  "worstPick": {"no": "0023", "ticker": "…", "excess": -0.143}, "bestPick": {"no": "…", "ticker": "…", "excess": 0.21},
  "maxDrawdown": -0.12, "medianAlertGapBps": 11, "cumulative": {"follow": 0.14, "bench": 0.09},
  "vetoes": {"rule": 38, "llm": 6, "human": 3, "capped": 9},
  "equity": [["2025-10-01", 1, 1], ["2025-10-02", 1.001, 0.998]] }
```
`equity` = daily index of an equal-weight "follow every pick" paper portfolio (net of costs) vs the benchmark TR.
`nPicks` = BUY records (new picks, `meta.counts.picks`); `nRenews` = RENEW records (a held position continued for a new 21-day window); `nRecords` = both. `nClosed`, the hit rate, its interval and the excess statistics count 21-day windows that have ended, BUY and RENEW records alike.

**issues.json** — one row per issue, ascending:
```json
[{ "date": "2026-09-28", "issueNo": 250, "publishAt": "2026-09-28T14:00:00+02:00", "tz": "CEST",
   "nScored": 1384, "closest": 3, "quorum": true, "buys": ["0055"], "renews": [], "closes": ["0041"],
   "vetoes": {"rule": 1, "llm": 0, "human": 0, "capped": 0}, "seq": 612, "hash": "…",
   "reached": 3, "blocked": {"alreadyOpen": 1, "cooldown": 0, "capIssue": 0, "capMonth": 0, "capSector": 0, "capSms": 0},
   "crashSwitch": false, "approver": "p1", "humanVetoes": [], "unissued": 0, "methodology": "1.0" }]
```
`reached` counts the stocks that met the rule with no veto (picks already open included; an open pick that carries a veto that day is not counted, so `reached` > 0 implies `closest` ≥ `required`). `blocked` says why the ones that were not issued stayed out: already an open pick (a RENEW is one of those), the 10-day cooldown, the per-issue, per-month and per-sector caps, and the 16-message SMS budget. `vetoes.capped` = `cooldown + capIssue + capMonth + capSector + capSms`, and `alreadyOpen` = `reached − buys − capped − human − unissued`.

**ledger.json**
```json
{ "simulated": true, "genesis": "000…0", "entries": [{ "seq": 0, "type": "METHODOLOGY", "issueDate": "2025-10-01", "at": "…", "body": {}, "prevHash": "…", "hash": "…" }],
  "anchors": [{ "date": "2026-09-28", "merkleRoot": "…", "rowCount": 3, "ots": "pending", "rfc3161": "demo" }] }
```
`anchors` has one row per issue date (Merkle root over that day's entry hashes). `ots` is `"confirmed"` for all but the latest two days.

**picks.json** — every BUY and RENEW record, ascending by `no`:
```json
[{ "no": "0055", "kind": "BUY", "priorNo": null, "renewedAs": null, "status": "open|closed|renewed",
   "ticker": "…", "name": "…", "isin": "ZZ…", "figi": "SIM…", "sector": "Industrials", "venue": "NASDAQ (simulated)",
   "issueDate": "2026-09-28", "issueNo": 250, "producedAt": "2026-09-28T13:45:02+02:00", "disseminatedAt": "2026-09-28T14:00:00+02:00",
   "dissemination": {"price": 123.45, "source": "SIM last close", "at": "2026-09-25T16:00:00-04:00"},
   "entry": {"date": "2026-09-28", "open": 124.1}, "exitPlanned": "2026-10-27", "exit": null,
   "agreement": 3, "agreeing": ["A", "B", "D"], "crashSwitch": false, "combined": 0.93,
   "families": {"A": {"pct": 0.96, "drivers": [{"key": "resid_mom_12_1", "label": {"en": "…", "sl": "…"}, "value": 1.8, "unit": "z"}]}, "B": {}, "C": {}, "D": {}},
   "sensitivity": {"family": "B", "pct": 0.92, "margin": 0.02},
   "vetoChecks": [{"key": "days_to_cover", "pass": true, "value": 1.9}, {"key": "idio_vol", "pass": true, "value": 0.21}, {"key": "earnings_within_3d", "pass": true}, {"key": "pending_ma", "pass": true}, {"key": "llm_48h", "pass": true, "note": "stand-in"}],
   "insider": {"cluster": false, "buyers": 0},
   "thesis": {"en": "…", "sl": "…"}, "thesisNumbers": [0.96, 1.8], "drafter": "template", "validator": "passed",
   "approver": "p1", "modelLead": "p2", "modelVersion": "ensemble 1.0.0", "methodology": "1.0",
   "outcome": null | { "exitDate": "…", "exitOpen": 0, "gross": 0, "net": 0, "bench": 0, "excess": 0, "eurNet": 0, "alertGapBps": 0, "d5": 0, "d63": null },
   "mark": {"date": "2026-09-28", "close": 0, "net": 0, "bench": 0, "excess": 0},
   "path": [[0, 0, 0]],
   "sms": {"en": "…", "sl": "…"}, "closeSms": {"en": "…", "sl": "…"} | null,
   "seq": 610, "commit": "…", "reveal": {"no": "0055", "ticker": "…", "figi": "…", "issueDate": "…", "agreeing": ["A","B","D"], "salt": "…"},
   "history12m": ["0012"] }]
```
`path` = `[tradingDayIndex, netReturn, benchReturn]`, where the index is trading days after the entry date: the first row is the entry at the US open (index 0, net = the round trip if sold at that price, so −2c before any move; bench 0), then the close of every trading day from the entry day itself (index 0 again) to index 20, and for a closed record the exit at the open of index 21 (23 rows). An open record runs to today's close. Every row's net is the return if sold at that price, net of both legs' costs. In the demo the reveal of open picks is included so the "view as subscriber" mode can show it; "view as free visitor" hides ticker, name and reveal until close.

**scoreboard.json** — sealed record plus holdout, each with uncertainty:
```json
{ "simulated": true, "periods": {"sealed": {"from": "…", "to": "…"}, "holdout": {"from": "…", "to": "…"}},
  "families": [{"id": "A", "sealed": {"hit": 0.53, "hitCI": [0,0], "ic": 0.031, "icCI": [0,0], "meanExcess": 0.004, "n": 2900}, "holdout": {}}],
  "agreement": [{"k": "4/4", "sealed": {"n": 9, "hit": 0.67, "hitCI": [0,0], "medianExcess": 0.02}, "holdout": {}}, {"k": "3/4"}, {"k": "2/4 shadow"}],
  "correlations": {"order": ["A","B","C","D"], "matrix": [[1,0.2,0.1,0.4]]},
  "icMonthly": [["2025-10", {"A": 0.03, "B": 0.01, "C": 0.02, "D": 0.04}]] }
```
`correlations.validation` is the same matrix on validation data, where the independence rule applies: `{ period: {from, to} (the research window), basis, order, matrix (4x4, month-end scores, D from its walk-forward models), maxD (D's highest correlation with A, B or C), limit: 0.5, independenceCheck: {corr: {A, B, C}, limit, outcome, rounds, basis} (the rule's own test on out-of-fold CV predictions), proxyScreen: {limit, screened: [keys], inputs: [D's input keys]} }`. D is independent by construction: its inputs are its own information set (one-month reversal, volatility, idiosyncratic volatility, beta, turnover, days to cover, insider buying, the filing-text embedding), never an input of A-C nor a close proxy of one.

**deciles.json** — full universe, 21-day forward excess by decile of each family and of the combined score, sealed and holdout:
```json
{ "simulated": true, "sealed": {"combined": [{"d": 1, "excess": -0.004, "ci": [0,0]}], "A": [], "B": [], "C": [], "D": []}, "holdout": {} }
```

**hero.json** — The Level: the most recently closed pick's issue (never current scores):
```json
{ "simulated": true, "issueDate": "2026-08-21", "issueNo": 227, "nScored": 1384, "quorumCount": 1,
  "pick": {"no": "0048", "ticker": "…", "name": "…", "agreeing": ["A","C","D"], "index": 812},
  "p": [962, 911, 450, 977], "sms": "…", "smsAt": "2026-08-21T14:00:00+02:00",
  "outcome": {"excess": 0.034, "net": 0.041, "bench": 0.007, "exitDate": "…"}, "path": [[0, 0, 0]] }
```
`p` is flat `[A0,B0,C0,D0, A1,B1,…]`, percentiles as integer permille 0–999, truncated (`floor(x * 1000)`, so 950 or more exactly when the family is at or above the 0.95 line), for every scored stock in that issue (−1 = not scored by that family). Family percentiles in picks.json and universe.json are truncated to 4 decimals the same way. `pick.index` is the pick's row.

**universe.json** — the Research-tier dataset for the latest issue (demo preview):
```json
{ "simulated": true, "date": "2026-09-28", "cols": ["ticker","name","sector","A","B","C","D","agree","veto","mcap","adv60","ret21"], "rows": [["…","…","…",0.9,0.5,0.3,0.8,2,null,3.1e10,2.2e8,0.012]] }
```

**backtest.json** — HYPOTHETICAL, research window and holdout:
```json
{ "simulated": true, "label": "HYPOTHETICAL", "window": {"from": "2009-01-02", "to": "2022-09-30"}, "holdout": {"from": "2022-10-03", "to": "2025-09-30"},
  "variantsTried": 212, "dsr": 0.97, "pbo": 0.18, "variantSharpes": [0.4, 0.7],
  "gates": [{"id": "a", "pass": true, "label": {"en": "…", "sl": "…"}, "detail": {"en": "…", "sl": "…"}, "values": {}}],
  "equity": [["2009-01-30", 1, 1, 1, 1, 1, 1, 1]], "equityCols": ["quorum","bench","twoOfFour","A","B","C","D"],
  "annual": [{"year": 2009, "quorum": 0.1, "bench": 0.2, "n": 50}],
  "stats": {"picksPerMonth": 4.4, "hitRate": 0.56, "medianExcess": 0.01, "meanExcess": 0.008, "sharpe": 0.9, "maxDrawdown": -0.2},
  "crashSwitchPeriods": [["2009-03-09", "2009-06-30"]],
  "llmVetoShadow": {"appliedFrom": "2025-10-01", "research": {"candidates": 23, "renewals": 5}, "holdout": {"candidates": 5, "renewals": 1}, "basis": "…"},
  "launch": {
    "status": "pre-launch | ready", "asOf": "2026-09-28",
    "holdoutGates": [{"id": "d", "pass": false}],
    "amendment": {"id": "A-1", "date": "2025-09-30", "text": {"en": "…", "sl": "…"}},
    "pooled": {"from": "2022-10-03", "to": "2026-09-28", "months": 48, "sharpe": 0.9, "dsr": 0.9, "dsrRaw": 0.3, "nTrialsRaw": 480, "nTrialsEff": 12, "pass": false},
    "remaining": {"en": "…", "sl": "…"} } }
```
The follow-every-pick portfolio (`equity`, `annual`, the Sharpe and DSR inputs) holds every record. The research window's last picks have exits in the holdout, which the research run may not read: they carry no outcome and stay out of the per-pick statistics, but they stay in the research portfolio, marked to the research window's last close (never cash at the seam), and in `equity` they are held to their exit. The comparison sets are treated the same way.

Launch gate E needs all five ship gates. **Amendment A-1** (adopted 2025-09-30, after the holdout was opened; disclosed in full on the site, with the original wording's result published beside it) corrects a misapplication in gate (d) as first written. The Deflated Sharpe Ratio corrects for selection among trials, and that selection happened in the research window, where the variants were run. On the holdout a single pre-committed configuration was tested, so there is nothing to deflate there, and 36 months cannot reach 95% confidence at the brief's own expected edge (a Sharpe near 1 gives a probabilistic Sharpe near 0.93, before any deflation). A-1 splits (d) into:
- **(d1)** clustered DSR >= 0.95 on the research window, where the variants were tried, and PBO < 0.3 across the variants;
- **(d2)** probabilistic Sharpe ratio PSR(SR > 0) >= 0.95 on the pooled out-of-sample record (holdout + sealed forward record, monthly net excess returns of the follow-every-pick paper portfolio), re-tested monthly. The test counts complete months only: when `asOf` is not its month's last trading day, that month to date is published apart (`d2.monthToDate`, `pooled.monthToDate`) and enters the test at its month-end.
`launch` exports `original {dsr, pass}` (the first wording, on the holdout), `d1 {dsrResearch, pbo, pass}`, `d2 {psr, months, sharpe, pass}` and keeps `pooled` for the deflated pooled figures. `launch.status` is `ready` only when (a), (b), (c), (e) pass on the holdout and d1 and d2 both pass; otherwise `pre-launch`, and `remaining` says in one computed sentence what must still happen. The DSR deflates by the **effective** number of independent trials (clustered variants); the raw-count figure is published beside it. The rule threshold is `meta.rule.topPct` (whatever the calibration chose: 0.95 reads "top 5%", 0.91 "top 9%"); no copy may hard-code "top decile" or a percentage.

## 4. server/

- `server/index.js` — `createApp({db, config, transports}) → {server, close}`; `node server/index.js` starts it. Serves `web/` (injecting `<meta name="quorum-mode" content="live">` into index.html) and `/api/*`. Security headers on every response (CSP without inline script, `frame-ancestors 'none'`, HSTS when https, `Referrer-Policy: same-origin`).
- `server/config.js` — env: `PORT`, `DB_PATH`, `PUBLIC_BASE_URL`, `LINK_BASE` (default `https://qrm.si`), `SMS_TRANSPORT=console|twilio`, `EMAIL_TRANSPORT=console`, `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_MESSAGING_SERVICE_SID`, `TWILIO_VERIFY_SERVICE_SID`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_SIGNAL_M`, `STRIPE_PRICE_SIGNAL_Y`, `STRIPE_PRICE_RESEARCH_M`, `STRIPE_PRICE_RESEARCH_Y`, `ANTHROPIC_API_KEY`, `EXPLAINER_MODEL` (the pinned Claude model id; no default, the explainer is off until it is set), `SESSION_SECRET`, `ADMIN_TOKEN`, `SMS_COUNTRIES=SI,AT,DE,HR,IT`, `SCHEDULER=off|on`.
- `server/db.js` + `server/schema.sql` — `node:sqlite` `DatabaseSync`; the tables of brief §4.5; append-only tables (`consent_events`, `recommendations`, `ledger_entries`, `processed_events`, `delivery_events`, `opt_outs`, `access_log`) get `BEFORE UPDATE` / `BEFORE DELETE` triggers that `RAISE(ABORT, 'append-only')`.
- Vendors are called with `fetch` (Twilio REST form-encoded with Basic auth; Stripe REST form-encoded with `Stripe-Version: 2026-08-26.dahlia`). Every vendor module takes an injectable `fetch` so tests run offline. Signature checks: Twilio `X-Twilio-Signature` (HMAC-SHA1 over URL + sorted params, base64); Stripe `Stripe-Signature` (`t=`, `v1=` HMAC-SHA256 of `${t}.${rawBody}`, 300 s tolerance).
- `server/explainer.js` — Claude via `@anthropic-ai/sdk`, model from config, adaptive thinking, structured output (Zod schema), numeric validator, one regeneration, then hand-off to the approver. Also the 48-hour veto scan. Refusal and API errors are handled explicitly. Every prompt and output is logged with its SHA-256.
- Publisher, notifier, scheduler, admin: as brief §4.3–§4.4.

API (JSON; POSTs require `Content-Type: application/json` and the session cookie; SameSite=Lax):
`GET /api/health` · `GET /api/me` · `POST /api/auth/magic {email, locale}` · `GET /api/auth/callback?token=` (signs in directly only in the browser that asked, by the `qrm_login` cookie) · `POST /api/auth/callback {token}` (the same-origin confirm button for any other browser) · `POST /api/auth/logout` · `POST /api/join/geo {declaredCountry}` · `POST /api/phone/start {e164, locale}` · `POST /api/phone/check {e164, code}` · `POST /api/consent {kind, action, version, sha256, pageUrl, locale}` (server recomputes the hash from `core/consent-texts.js` and rejects a mismatch) · `POST /api/checkout {tier, interval}` → `{url}` · `POST /api/webhooks/stripe` · `POST /api/webhooks/twilio/status` · `GET /u/:token` (confirm page, no state change) · `POST /u/:token` (opt-out, one tap) · `POST /api/prefs {sms, push, email}` · `POST /api/withdraw` · `GET /api/export` · `POST /api/account/delete` · `GET /api/status` · `GET /api/admin/candidates` (logs access) · `POST /api/admin/veto {candidateId, reason}` · `POST /api/admin/news-review {date, candidateId, personId, note}` (the approver records "news reviewed, nothing material" for a candidate whose scan did not clear) · `GET /fonts/:file` (live mode's self-hosted fonts; see §5) · `GET /data/:file.json` (public data; `picks.json` and `universe.json` redacted to the viewer's entitlement: no ticker/name/reveal for open picks without `picks`; no universe without `research_data`).

## 5. web/

A static single-page site with hash routing. It must work opened from any static host (the Artifact publisher serves `web/` as the root; `index.html` is the page and every other file is a relative supporting file). No external JS. Fonts from Google Fonts only:
`https://fonts.googleapis.com/css2?family=Mona+Sans:wdth,wght@75..125,200..900&family=Martian+Mono:wdth,wght@75..112.5,100..800&family=Instrument+Serif:ital@1&display=swap` (v2, docs/DESIGN-V2.md §3.1; verified: the `wdth` axes and Latin Extended for č, š, ž are served). The live server still self-hosts the v1 files (server/fonts.js); the metric fallbacks hold until it is updated.

Modes: **demo** (default; reads `data/*.json`; the join flow runs as a preview that never sends anything and never stores a phone number) and **live** (when `<meta name="quorum-mode" content="live">` is present; calls `/api`).

```
web/index.html            shell: fonts, css, skip link, the four column rules, header, <main id="view">, footer, demo bar
web/css/tokens.css        colour, type, space, motion tokens (brief §5 palette exactly)
web/css/base.css          reset, type, grid, the rules, focus, reduced motion
web/css/components.css    header, pill, buttons, tables, hash chip, timestamp, sms bubble, phone, stat, tabs, toggles, sheets
web/css/pages.css         per-page layout
web/js/app.js             boot, router (hash), View Transitions, data loader + cache, demo clock, locale, view-as tier
web/js/i18n.js            t(key, vars), EN + SL dictionaries, formatters by locale
web/js/dom.js             h() / html helpers, escape, focus management, copy-to-clipboard, announce() (aria-live)
web/js/hero/level.js      The Level: SVG first paint → WebGL (raw WebGL, no library) → 2D canvas fallback; reduced-motion stepped states
web/js/charts/*.js        SVG charts: silence-calendar, chain, colonnade, scoreboard (dot + CI), deciles (staircase + IC sparkline), equity, path
web/js/pages/*.js         one module per route, each `export async function render(ctx) → {title, node, cleanup?}`
web/js/core/*.js          build copy of core/ (scripts/build-web.js); never edited by hand
web/data/*.json           engine export (or scripts/fixture-data.js before the engine exists)
web/assets/favicon.svg    the lintel mark
```

### Hosting constraints (the site is published as a claude.ai Artifact)
- **Deep links:** only a plain `#token` (letters, digits, `.` `_` `~` `-`) survives in a shared Artifact link. Canonical route tokens are therefore flat: `#ledger`, `#p-0417`, `#issue-2026-09-28`, `#s-KRST`, `#methodology-changelog`, `#legal-terms`, `#app-research`, `#u-7Kq2xZ`, and an empty hash for home. Every link the site renders uses this form. The router also accepts the older `#/p/0417` form and normalises it. Never use `#key=value` or the query string for state. Skip links and in-page anchors must not collide with route tokens (use `id`s such as `main-content` and move focus in script).
- **No downloads:** the viewer blocks `<a download>`, blob/data downloads and script-driven saves. "Download CSV" becomes "Copy CSV" (`navigator.clipboard.writeText` inside the click handler, with a select-the-text fallback) plus a view of the raw text; in live mode the server's `/api/ledger.csv` link is also offered.
- **No `alert`/`confirm`/`prompt`/`window.print`/`window.open`:** confirmations are built into the page. `mailto:` and `tel:` links are unreliable: show the address as selectable text with a copy button.
- **Complete at rest:** everything meant to be read is visible on load without scrolling to trigger it. Reveal animations start from a visible state (never `opacity: 0` waiting for an observer). The hero's first frame (before any scroll) must already read as a finished composition: headline, issue line and the settled chart.
- **Safe areas:** a fixed top or bottom bar adds `env(safe-area-inset-top|bottom, 0px)` to its own padding; a sticky header uses `top: env(safe-area-inset-top, 0px)`.
- **Single theme by design:** Stone and Signal (v2) is a fixed world of night and limestone surfaces chosen per page, not per viewer preference. Set `color-scheme: light` on `:root` (`dark` on night surfaces), give `body` an explicit Karst background, and set every color from tokens (no inherited defaults).
- **Title:** the static `<title>` is `Quorum Research` (the Artifact gallery reads it); routes may update `document.title` as `<Page> · Quorum Research`.
- At publish time the lead strips the outer `<!doctype>`/`<html>`/`<head>`/`<body>` wrappers into a published copy; `web/index.html` stays a complete document for the Node server.

Routes (canonical token → page): (empty) home · `how-it-works` · `methodology` · `methodology-changelog` · `ledger` · `backtest` · `issue-YYYY-MM-DD` · `p-NNNN` · `s-TICKER` · `disclosures` · `pricing` · `join` · `app` · `app-research` · `account` · `u-TOKEN` · `help` · `status` · `about` · `legal-terms|privacy|sms|imprint|cookies`. Older slash form, still accepted: `#/` home · `#/how-it-works` · `#/methodology` · `#/methodology/changelog` · `#/ledger` · `#/backtest` · `#/issue/YYYY-MM-DD` · `#/p/NNNN` · `#/s/TICKER` · `#/disclosures` · `#/pricing` · `#/join` · `#/app` · `#/app/research` · `#/account` · `#/u/TOKEN` · `#/help` · `#/status` · `#/about` · `#/legal/terms|privacy|sms|imprint|cookies`. Unknown routes render a designed 404. The locale (`en`/`sl`) is state (persisted in `localStorage` inside try/catch), reflected in `<html lang>`.

Demo clock: if the real time is before the next issue slot after `meta.asOf`, the header pill counts down to it in real time; otherwise the clock is pinned to `asOf` 22:30 Ljubljana and the pill says so. The site never shows a state that contradicts the data.

View-as (demo only, in the demo bar): Free (Ledger tier) · Signal · Research. Free hides the ticker, name and thesis of open picks (shows number, time, commit hash and "sealed"), and gates the Research explorer. Default: Signal.

### Design rules (non-negotiable)
Brief §5 is the design spec (Colonnade). In short: Karst background, Graphite text, the four hairline column rules on every page that never re-render between routes, ultramarine `#1F2EE0` only when models agreed (Quorum Lift `#8C96FF` on Chamber), Gain/Loss only with sign + arrow, Archivo (compressed widths for headlines), Newsreader for theses, Martian Mono for tickers/hashes/timestamps/numeric columns, tabular numbers everywhere, native scroll, no counting-up numbers, 150–400 ms on `cubic-bezier(0.2, 0, 0, 1)`, no gradients, no purple, no stock imagery, WCAG 2.2 AA, full keyboard navigation, skip link, 2 px Graphite focus ring with 2 px offset, `prefers-reduced-motion` respected, phone layouts designed (not shrunk) at 390×844 and 360×780, tablet 834×1194, desktop 1440×900 and 1920×1080. `docs/DESIGN.md` records the system the web lead builds.

Every page carries: the demo bar ("Simulated market · fictional companies · demo — not a real service, not investment advice"), and the footer disclosure copy of brief §7 adapted for a company in formation.

## 6. Scripts and tests

- `npm test` runs `tests/**/*.test.js` (node:test). Every module has tests. Engine tests use a small universe (for example 150 stocks, 2016–2019) so the suite stays under 2 minutes.
- `npm run build:web` copies `core/*.js` to `web/js/core/`; `tests/web/core-copy.test.js` fails if the copies drift.
- `npm run fixture` writes contract-shaped placeholder data to `web/data/` (only for building the web before the engine export exists).
- `npm run check:sms` renders every template at worst case in both locales and fails above 160 septets or on any `validateSms` error.
- `npm run engine:run` (full pipeline and export), `npm run engine:export` (export only, from `engine/.cache`).
- `npm run demo:day` runs one simulated issue day end to end through the server (console SMS transport): seal → publish → fan-out → status callbacks → opt-out, and prints the outbox.
- `npm run test:e2e` runs Playwright against `web/` (Chromium at `/opt/pw-browsers`, launched with `--enable-unsafe-swiftshader --ignore-gpu-blocklist --use-angle=swiftshader`), visiting every route at phone, tablet and desktop sizes, failing on console errors, horizontal overflow and axe-like basics (images without alt, buttons without names, contrast of text tokens).

## 7. Ownership (who may edit what)

Parallel builders only edit the paths they own. `package.json` is edited by the lead only; builders list the scripts they need in their report.

| Owner | Paths |
|---|---|
| Lead | `package.json`, `docs/ARCHITECTURE.md`, `core/*` |
| Engine | `engine/**`, `tests/engine/**` |
| Web | `web/**` (except `web/js/core/**` and `web/data/**`), `docs/DESIGN.md`, `scripts/fixture-data.js`, `tests/web/**`, `tests/e2e/**`, `scripts/e2e.js` |
| Server | `server/**`, `tests/server/**`, `scripts/demo-day.js`, `docs/OPERATIONS.md` |
