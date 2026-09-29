# Quorum

An EU-first stock-research subscription built on one rule: **no quorum, no text.**

Every US trading day, four independent model families score about 1,300 liquid US stocks. A pick exists only when at least 3 of the 4 put a stock in their top slice and no veto fires. Subscribers get one SMS at 14:00 Ljubljana time, and only on days with a BUY, CLOSE or RENEW. Every record is sealed into a public SHA-256 hash chain before it is published, and open picks are revealed at close. The research data (every stock's family percentiles) is the Research tier.

Everything in this repository runs on a **simulated market of fictional companies**. It demonstrates how Quorum works, not that it has an edge; only a live sealed record can show that.

## What is in here

| Folder | What it does |
|---|---|
| `core/` | Isomorphic library shared by engine, server and browser: NYSE calendar and the two clocks (14:00 Ljubljana issue, 09:30 New York open), RFC 8785 canonical JSON, SHA-256 ledger with Merkle roots and commit-reveal, GSM-7 counter, SMS templates and content validator, versioned consent texts, the quorum rule, statistics (bootstrap and Wilson intervals, DSR, PSR inputs, PBO), numeric validator for AI-drafted text |
| `engine/` | Simulated market 2008–2026, point-in-time features, the four families (A residual momentum with a crash switch, B fundamental momentum, C quality/value, D a histogram GBDT on its own information set incl. filing-text embeddings), walk-forward training, purged CV, the quorum backtest, ship gates, amendment A-1, the sealed record, EN/SL theses, deterministic export to `web/data/` |
| `server/` | `node:http` + `node:sqlite`: magic-link auth, EU geofence, Twilio Lookup/Verify/Messaging, Stripe Checkout and webhooks, consent records, entitlements, EU withdrawal button, one-tap opt-out, the daily publisher (13:45 seal, 14:00 publish), paced SMS/Web Push/email fan-out, delivery receipts with the 30007 auto-pause, DST-correct scheduler, the Claude explainer, the approver's veto-only console, anchors |
| `web/` | The site (zero dependencies): the Colonnade design system, The Level hero, ledger with in-browser chain verification, pick research notes with MAR disclosures, backtest, signup with a live SMS preview, member app, Research explorer, account |
| `docs/` | `BRIEF.md` (product, legal and design spec), `ARCHITECTURE.md` (interface and data contract), `DESIGN.md` (design system as built), `OPERATIONS.md` (server runbook) |

## Run it

Requires Node 22.13 or later.

```sh
npm install
npm test                 # all unit tests
npm run engine:run       # rebuild the simulation and web/data (about 4 minutes cold, 1 minute cached)
npm run check:sms        # every SMS template is one GSM-7 segment at worst case
npm run demo:day         # one full issue day through the server, console transports
npm run server           # live mode at http://localhost:8787 (console SMS and email)
npm run test:e2e         # Playwright tour of every route at five sizes
npm run build:artifact   # the static copy published as a claude.ai Artifact
```

The site also works as plain static files: serve `web/` with any static server.

## The simulated record (as exported)

- **Rule:** 3 of 4 families at or above the 91st percentile (`meta.rule.topPct`, calibrated on the research window for 3–6 picks a month), five vetoes, at most 2 picks per issue and 8 per month.
- **Hypothetical holdout (Oct 2022 – Sep 2025):** 263 records, hit rate 60.1% against the S&P 500 TR (simulated), mean excess +1.9% per 21-day pick net of costs. The page says plainly that 60% is the line the protocol treats as a leakage warning.
- **Engine launch gate:** passes. Gates (a), (b), (c), (e) on the holdout; (d1) deflated Sharpe probability 0.997 on the research window with 4 effective of 384 variants (0.287 counting all 384), PBO 0.004; (d2) probabilistic Sharpe 0.999 over 47 pooled out-of-sample months. Launch still needs the legal, data-licence and SMS-carrier gates, which are outside this code.
- **Sealed forward record (1 Oct 2025 – 28 Sep 2026, pre-launch, no subscribers):** 249 daily issues, 60 new picks and 27 renewals, hit rate 51.3% (95% CI 40.3–62.2%), median excess +0.7%, mean +0.0%, worst pick −20.3%, cumulative +18.3% against +11.7%. The forward record is far weaker than the backtest, and the site shows both.

## Decisions worth knowing

- **No US SMS, no US residents.** US carriers forbid stock-alert SMS on every sender type (brief §2.6). SMS runs in SI, AT, DE, HR, IT via an alphanumeric sender; opt-out is a link because the sender is one-way.
- **Publisher, not adviser.** Identical content for every tier, fixed daily issue, no personalisation, MAR Art. 20 disclosures generated from the append-only record.
- **The LLM never picks.** Claude (Anthropic) only screens news for the 48-hour veto (failing closed) and drafts theses under a numeric validator and a named approver. The model id comes from `EXPLAINER_MODEL`; the explainer is off until it is set.
- **Amendment A-1** re-specified gate (d) after the holdout was opened, because the Deflated Sharpe Ratio belongs where the variants were tried. It is disclosed on the site with the original wording's result beside it.
- **The simulated world was revised once** (29 Sep 2026) after an earlier run showed family D overlapping A and C; the brief requires independent families. Calibration used the research window only.
