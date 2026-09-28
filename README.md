# Rok: credit desk for Slovenian B2B trade

A working MVP of a better product than EBONITETE.SI (Prva bonitetna agencija). The
teardown and strategy are in [`research/prva-bonitetna-agencija.md`](research/prva-bonitetna-agencija.md).

## What it does that registry-only scores don't

| | Rok | Registry-based scores |
|---|---|---|
| Signal | Weekly invoice payment data (days beyond terms) plus filings and registers | Annual accounts up to about 15 months old, plus register flags |
| Output | Calibrated 12-month PD, grade, **credit limit, payment terms, insurance price** | Score only |
| Explainability | Every factor's effect shown on the dossier | Black box or a summary |
| Network | Directors and ownership, with links to past bankruptcies | Ownership at best |
| Accuracy | Back-test (AUC, calibration) published in the app | Not published |
| Buying | Public prices, monthly, pay-per-dossier | Sales call, 12-month minimum |

## Layout

- `app/engine.js`: scoring engine (UMD). Transparent logistic model, reason codes, credit decision, network stats, AUC and calibration.
- `app/data.js`: seeded generator of **fictional** Slovenian companies. It stands in for AJPES, FURS, the blocked-account register and the invoice co-op until those feeds are connected.
- `app/index.html`, `app/app.js`: the credit desk UI (Companies, Portfolio, Model, Pricing).
- `scripts/fit.js`: fits both models with sign-constrained logistic regression on training seeds and writes the weights into `engine.js`.
- `tests/`: engine tests, including the check that payment data beats filings-only on held-out data.

## Run

```sh
npm test          # engine tests
npm run fit       # refit model weights
npm start         # serve app/ on http://localhost:8080
```

## Demo data caveat

All companies, people and defaults are simulated. The back-test on the Model page shows the method (Rok AUC 0.845 against 0.778 for accounts-only, on 3,542 held-out companies), not a real-world result. To go to production, swap `data.js` for real feeds and rerun `scripts/fit.js` on actual AJPES default outcomes.
