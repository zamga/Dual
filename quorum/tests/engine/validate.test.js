// Ship gates are computed from the runs, never typed in; the thesis writer only writes numbers it can
// trace to the pick's data; the contract checker is not vacuous.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shipGates } from '../../engine/validate.js';
import { writeThesis } from '../../engine/thesis.js';
import { validateNumbers } from '../../core/numeric-validator.js';
import { check, SPECS } from './contract.js';

const st = (meanExcess, hit, n = 100, medianExcess = meanExcess) => ({ n, hit, hitCI: [hit - 0.05, hit + 0.05], meanExcess, medianExcess });

function holdout(over = {}) {
  return {
    quorum: st(0.012, 0.56),
    sets: { A: st(0.006, 0.52), B: st(0.007, 0.51), C: st(0.005, 0.5), D: st(0.01, 0.54), twoOfFour: st(0.008, 0.53), compositeABC: st(0.006, 0.52) },
    icMean: { A: 0.03, B: 0.02, C: 0.02, D: 0.06 },
    compositeIC: 0.04,
    picksPerMonth: 4.8,
    renewsPerMonth: 3,
    monthlyExcess: new Array(36).fill(['2024-01', 0.01]),
    annualisedSharpe: 1.1,
    ...over,
  };
}

test('gates follow brief §3.4.6 from the computed values', () => {
  const pass = shipGates({ holdout: holdout(), dsr: 0.97, pbo: 0.1, nTrials: 100 });
  assert.deepEqual(pass.map((g) => [g.id, g.pass]), [['a', true], ['b', true], ['c', true], ['d', true], ['e', true]]);
  // (a) needs positive mean and median and a hit rate of at least 53%
  assert.equal(shipGates({ holdout: holdout({ quorum: st(0.012, 0.529) }), dsr: 0.97, pbo: 0.1, nTrials: 100 })[0].pass, false);
  assert.equal(shipGates({ holdout: holdout({ quorum: st(0.012, 0.56, 100, -0.001) }), dsr: 0.97, pbo: 0.1, nTrials: 100 })[0].pass, false);
  // (b) the quorum must beat the 2/4 set and every single family
  const h = holdout();
  h.sets.D = st(0.013, 0.55);
  assert.equal(shipGates({ holdout: h, dsr: 0.97, pbo: 0.1, nTrials: 100 })[1].pass, false);
  // (c) D must beat the A-C composite on top-slice excess and on IC
  assert.equal(shipGates({ holdout: holdout({ compositeIC: 0.07 }), dsr: 0.97, pbo: 0.1, nTrials: 100 })[2].pass, false);
  // (d) DSR >= 0.95 and PBO < 0.3
  assert.equal(shipGates({ holdout: holdout(), dsr: 0.949, pbo: 0.1, nTrials: 100 })[3].pass, false);
  assert.equal(shipGates({ holdout: holdout(), dsr: 0.99, pbo: 0.3, nTrials: 100 })[3].pass, false);
  // (e) 3-8 new picks a month
  assert.equal(shipGates({ holdout: holdout({ picksPerMonth: 8.2 }), dsr: 0.97, pbo: 0.1, nTrials: 100 })[4].pass, false);
  assert.equal(shipGates({ holdout: holdout({ picksPerMonth: 2.9 }), dsr: 0.97, pbo: 0.1, nTrials: 100 })[4].pass, false);
  for (const g of pass) {
    assert.ok(g.label.en && g.label.sl && g.detail.en && g.detail.sl);
    assert.ok(!/NaN|undefined/.test(g.detail.en + g.detail.sl));
  }
});

const PICK = {
  kind: 'BUY', no: '0042', priorNo: null, ticker: 'KRST', name: 'Karst Robotics Inc.', sector: 'Industrials', sectorSl: 'Industrija',
  agreement: 3, agreeing: ['A', 'C', 'D'], crashSwitch: false, topPct: 0.95,
  families: { A: { pct: 0.9712 }, B: { pct: 0.4133 }, C: { pct: 0.9644 }, D: { pct: 0.9901 } },
  drivers: {
    A: [{ key: 'resid_mom_vs', label: { en: 'Residual 12-1 momentum, volatility-scaled', sl: 'Rezidualni momentum 12-1, prilagojen volatilnosti' }, value: 1.83, raw: { value: 2.412, unit: 't' } }],
    B: [{ key: 'sue', label: { en: 'Standardised earnings surprise', sl: 'Standardizirano presenečenje pri dobičku' }, value: -0.2, raw: { value: -0.1, unit: 'sd' } }],
    C: [{ key: 'fcf_yield', label: { en: 'Free-cash-flow yield', sl: 'Donos prostega denarnega toka' }, value: 1.51, raw: { value: 0.0614, unit: 'ratio' } }],
    D: [{ key: 'ivol', label: { en: 'Idiosyncratic volatility (60 days)', sl: 'Idiosinkratična volatilnost (60 dni)' }, value: -1.47, raw: { value: 0.1358, unit: 'ratio' }, weight: 0.2 }],
  },
  vetoChecks: [
    { key: 'days_to_cover', pass: true, value: 1.94 },
    { key: 'idio_vol', pass: true, value: 0.1358 },
    { key: 'earnings_within_3d', pass: true, next: '2026-10-22' },
    { key: 'pending_ma', pass: true },
    { key: 'llm_48h', pass: true, note: 'stand-in' },
  ],
  exitPlanned: '2026-10-27',
};

test('the thesis writer: three paragraphs, EN and SL, every number traced to the pick data', () => {
  const th = writeThesis(PICK);
  assert.equal(th.validator, 'passed', JSON.stringify(th.unknown));
  for (const loc of ['en', 'sl']) assert.equal(th[loc].split('\n\n').length, 3);
  assert.match(th.en, /Three of the four model families place KRST/);
  assert.match(th.en, /trend at the 97th percentile, quality\/value at the 96th and the ML ranker at the 99th/);
  assert.match(th.en, /Fundamental momentum ranks it at the 41st percentile and does not vote for it/);
  assert.match(th.en, /z-score 1\.8; t-statistic 2\.4/);
  assert.match(th.en, /free-cash-flow yield \(z-score 1\.5; 6\.1%\)/);
  assert.match(th.en, /exits at the US open on 27 Oct 2026, 21 trading days after entry/);
  assert.match(th.sl, /Tri od štirih modelskih družin uvrščajo KRST/);
  assert.match(th.sl, /z-vrednost 1,8; t-statistika 2,4/);
  assert.match(th.sl, /6,1 %/);
  assert.ok(!/\byou\b|guarantee|soar|huge/i.test(th.en));
  for (const x of [0.97, 1.83, 2.412, 0.0614, 21, 3, 48]) assert.ok(th.numbers.some((n) => Math.abs(n - x) < 0.01), `${x} is a source number`);
  // a number that is not in the data is caught by the core validator
  const tampered = th.en.replace('z-score 1.8;', 'z-score 2.8;');
  assert.equal(validateNumbers(tampered, th.numbers, { allowStrings: ['0042', 'KRST', 'Karst Robotics Inc.', 'residual 12-1 momentum, volatility-scaled', 'idiosyncratic volatility (60 days)', '27 Oct 2026', '22 Oct 2026'] }).ok, false);
});

test('crash-switch and renewal theses say so', () => {
  const th = writeThesis({ ...PICK, kind: 'RENEW', priorNo: '0017', crashSwitch: true, agreeing: ['B', 'C', 'D'], families: { ...PICK.families, B: { pct: 0.955 } } });
  assert.equal(th.validator, 'passed', JSON.stringify(th.unknown));
  assert.match(th.en, /^This renews pick #0017 for a new 21-day window\. The crash switch is on, so trend does not vote/);
  assert.match(th.sl, /^Podaljšanje izbire #0017/);
});

test('the contract checker catches wrong shapes', () => {
  assert.ok(check({ simulated: true, liveSince: '2025-10-01' }, SPECS.summary).length > 5);
  assert.ok(check('12', 'no4').length === 1);
  assert.ok(check('0012', 'no4').length === 0);
  assert.ok(check(56, 'frac').length === 1, 'percent instead of fraction');
  assert.ok(check('2026-09-28T14:00:00+02:00', 'instant').length === 0);
  assert.ok(check('2026-09-28 14:00', 'instant').length === 1);
});
