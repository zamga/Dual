import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { simulateMarket, SIM_DEFAULTS, HIDDEN, payoutYield } from '../../engine/sim/market.js';
import { SMALL_UNIVERSE } from '../../engine/model.js';
import { REAL_TICKERS, REAL_TICKER_SET, US_SYMBOL_SET, isRealTicker } from '../../engine/sim/blocklist.js';
import { isValidIsin, isinCheckDigit } from '../../engine/sim/names.js';
import { standInIsNegative } from '../../engine/sim/headlines.js';
import { countTradingDays, isTradingDay } from '../../core/calendar.js';

const SMALL = { simStart: '2011-01-03', modelStart: '2014-01-02', end: '2019-12-31', nInitial: 150, ipoScale: 0.1 };

function digest(...arrays) {
  const h = createHash('sha256');
  for (const a of arrays) h.update(Buffer.from(a.buffer, a.byteOffset, a.byteLength));
  return h.digest('hex');
}

const m1 = simulateMarket(SMALL);

test('the simulation is deterministic from the seed', () => {
  const m2 = simulateMarket(SMALL);
  assert.equal(digest(m1.open, m1.close, m1.volume, m1.mcap, m1.eligible), digest(m2.open, m2.close, m2.volume, m2.mcap, m2.eligible));
  assert.deepEqual(m1.companies.ticker, m2.companies.ticker);
  assert.deepEqual(m1.news.headline, m2.news.headline);
  const m3 = simulateMarket({ ...SMALL, seed: 7 });
  assert.notEqual(digest(m1.close), digest(m3.close));
});

test('no chosen future: the default configuration never switches the random stream', () => {
  // the sealed record is whatever the simulated world produces after the freeze, not a picked scenario
  assert.equal(SIM_DEFAULTS.scenarioFrom, null);
  assert.equal(SMALL_UNIVERSE.sim.scenarioFrom ?? null, null);
  assert.equal(m1.scenarioSwitch, null);
  assert.equal(m1.opts.scenarioFrom, null);
  // passing the option explicitly as off changes nothing
  const off = simulateMarket({ ...SMALL, scenarioFrom: null });
  assert.equal(digest(off.open, off.close, off.volume), digest(m1.open, m1.close, m1.volume));
  // the experiment switch still works when asked for, and only from its date on
  const x = simulateMarket({ ...SMALL, scenarioFrom: '2018-01-02', scenario: 3 });
  assert.deepEqual(x.scenarioSwitch, { from: '2018-01-02', scenario: 3 });
  const k = x.dates.indexOf('2018-01-02');
  const N = x.N;
  assert.equal(digest(x.close.subarray(0, k * N)), digest(m1.close.subarray(0, k * N)), 'identical before the switch');
  assert.notEqual(digest(x.close.subarray(k * N)), digest(m1.close.subarray(k * N)), 'different after it');
});

test('dates are NYSE trading days and the benchmark is named', () => {
  assert.ok(m1.dates.every(isTradingDay));
  assert.equal(m1.dates[m1.s0], '2014-01-02');
  assert.equal(m1.bench.name, 'S&P 500 TR (simulated)');
  assert.equal(m1.sectors.length, 11);
  assert.equal(m1.eurusd.length, m1.S);
});

test('identifiers: valid ZZ ISINs, SIM FIGIs, simulated venues, unique non-blocklisted tickers', () => {
  const c = m1.companies;
  assert.ok(REAL_TICKERS.length >= 200);
  assert.equal(isinCheckDigit('US037833100'), 5); // a known real ISIN body checks the algorithm
  assert.ok(isValidIsin('US0378331005'));
  const tick = new Set();
  for (let i = 0; i < m1.N; i++) {
    assert.match(c.isin[i], /^ZZ[A-Z0-9]{9}[0-9]$/);
    assert.ok(isValidIsin(c.isin[i]), c.isin[i]);
    assert.match(c.figi[i], /^SIM[A-Z0-9]{9}$/);
    assert.ok(['NYSE (simulated)', 'NASDAQ (simulated)'].includes(c.venue[i]));
    assert.match(c.ticker[i], /^[A-Z]{2,4}$/);
    assert.ok(!REAL_TICKER_SET.has(c.ticker[i]), c.ticker[i]);
    assert.ok(!isRealTicker(c.ticker[i]), `${c.ticker[i]} is a real US symbol`);
    assert.ok(!tick.has(c.ticker[i]));
    tick.add(c.ticker[i]);
  }
  assert.equal(new Set(c.name).size, m1.N);
});

test('the real-symbol screen covers the whole US listed universe, not only famous names', () => {
  assert.ok(US_SYMBOL_SET.size > 15000, `${US_SYMBOL_SET.size} symbols`);
  for (const t of US_SYMBOL_SET) assert.match(t, /^[A-Z]{1,5}$/);
  // symbols a hand list missed, among them two the sealed record once issued BUY and RENEW records on
  for (const t of ['GCI', 'PRA', 'MGM', 'AES', 'GAP', 'NVS', 'KSS', 'VFC', 'GRAB', 'DOC', 'TPL', 'HES', 'COLD', 'OGE', 'HALO', 'DAVE', 'EMB', 'IWR', 'IVE', 'DBC']) {
    assert.ok(isRealTicker(t), t);
  }
  for (const t of ['LEH', 'BSC', 'AAPL', 'SPY']) assert.ok(isRealTicker(t), t);
  assert.equal(isRealTicker('QXZV'), false);
});

test('eligibility is exactly price > $5, market cap > $2B and 60-day ADV > $25M', () => {
  const { N } = m1;
  for (let t = 0; t < m1.S; t += 7) {
    for (let i = 0; i < N; i++) {
      const k = t * N + i;
      const want = m1.close[k] > 5 && m1.mcap[k] > 2e9 && m1.adv60[k] > 25e6 ? 1 : 0;
      assert.equal(m1.eligible[k], want);
    }
  }
});

test('filings arrive 25-60 days after the period end and never before it', () => {
  const f = m1.filings;
  assert.ok(f.F > 1000);
  for (let n = 0; n < f.F; n++) {
    const pe = f.periodEnd[n];
    const fd = f.filingDate[n];
    const lagDays = (Date.parse(fd) - Date.parse(pe)) / 86400000;
    assert.ok(lagDays >= 25 && lagDays <= 64, `${pe} -> ${fd}`);
    assert.ok(f.filingIdx[n] > f.periodEndIdx[n]);
  }
});

test('delistings: acquisitions at the deal price, bankruptcies with Shumway-style returns', () => {
  const c = m1.companies;
  let bk = 0;
  for (let i = 0; i < m1.N; i++) {
    if (c.delistIdx[i] < 0) continue;
    assert.ok(['acquired', 'bankruptcy'].includes(c.delistReason[i]));
    assert.ok(Number.isNaN(m1.close[(c.delistIdx[i] + 1) * m1.N + i]) || c.delistIdx[i] === m1.S - 1);
    if (c.delistReason[i] === 'acquired') assert.equal(c.delistReturn[i], 0);
    else {
      bk++;
      if (c.delistReturnImputed[i]) assert.equal(c.delistReturn[i], -0.3);
      assert.ok(c.delistReturn[i] < 0);
    }
  }
  assert.ok(bk >= 0);
  // pending-M&A periods end in a completion or a break
  for (let k = 0; k < m1.deals.company.length; k++) assert.ok(m1.deals.end[k] > m1.deals.ann[k]);
});

test('short interest is published with a lag after each settlement date', () => {
  for (const s of m1.shortSchedule) assert.equal(s.publish - s.settle, 8);
  const { N } = m1;
  let seen = 0;
  for (let i = 0; i < N; i++) if (m1.dtcPub[(m1.S - 1) * N + i] > 0) seen++;
  assert.ok(seen > 100);
});

test('headlines are fictional and the stand-in classifier is deterministic', () => {
  assert.ok(m1.news.t.length > 100);
  let neg = 0;
  for (let k = 0; k < m1.news.t.length; k++) {
    if (m1.news.negative[k]) {
      assert.ok(standInIsNegative(m1.news.headline[k]), m1.news.headline[k]);
      neg++;
    }
  }
  assert.ok(neg > 50);
  assert.equal(standInIsNegative('Karst Robotics cuts full-year guidance'), true);
  assert.equal(standInIsNegative('Karst Robotics announces investor day'), false);
});

// The full default configuration, simulated once for the tests below that need it.
let full = null;
const fullSim = () => (full ??= simulateMarket({}));

test('full universe: no company ever gets a real US ticker', () => {
  const m = fullSim();
  const t = m.companies.ticker;
  assert.equal(new Set(t).size, m.N);
  assert.deepEqual(t.filter((x) => isRealTicker(x)), []);
  for (const x of t) assert.match(x, /^[A-Z]{2,4}$/);
});

test('full universe: ~1,900 companies ever listed, 1,250-1,500 eligible every model day', () => {
  const m = fullSim();
  assert.equal(m.scenarioSwitch, null, 'the full default run continues on its own stream');
  const { N, s0, S } = m;
  const c = m.companies;
  let ever = 0;
  for (let i = 0; i < N; i++) if (c.delistIdx[i] < 0 || c.delistIdx[i] >= s0) ever++;
  assert.ok(ever >= 1800 && ever <= 2000, `ever listed ${ever}`);
  let lo = Infinity;
  let hi = 0;
  for (let t = s0; t < S; t++) {
    let n = 0;
    for (let i = 0; i < N; i++) n += m.eligible[t * N + i];
    lo = Math.min(lo, n);
    hi = Math.max(hi, n);
  }
  assert.ok(lo >= 1250 && hi <= 1500, `eligible ${lo}-${hi}`);
  assert.equal(countTradingDays('2007-12-31', '2026-09-28'), S - s0);
});

test('payout yield: rises with size relative to the median, and with the median above its anchor', () => {
  const ref = HIDDEN.payoutAnchor;
  assert.ok(Math.abs(payoutYield(ref, ref) - HIDDEN.payoutBase) < 1e-12, 'the median company at the anchor pays the base yield');
  let prev = -Infinity;
  for (const x of [0.1, 0.3, 1, 3, 10, 30, 100, 300]) {
    const y = payoutYield(x * ref, ref);
    assert.ok(y > prev, `monotone in size (${x}x the median)`);
    prev = y;
  }
  assert.ok(payoutYield(0.1 * ref, ref) < 0, 'small companies issue shares (negative net payout)');
  assert.ok(payoutYield(ref, 2 * ref) > payoutYield(ref, ref), 'a rich median raises every yield');
  assert.equal(payoutYield(NaN, ref), HIDDEN.payoutBase);
});

test('full universe: market caps look like the liquid US universe on every model day', () => {
  // Without the payout process the total-return prices compounded market caps without limit (a
  // $60 trillion company, a $55B median by 2026). Bounds: the largest company at most ~$4.5T, at most
  // a handful above $1T (and at least one by the end), the eligible median roughly $10-25B, and a
  // right-skewed cross-section (mean well above the median, positive skew of log market cap).
  const m = fullSim();
  const { N, s0, S, dates } = m;
  const worst = { max: 0, over1T: 0, medLo: Infinity, medHi: 0, ratio: Infinity, skew: Infinity };
  let lastOver1T = 0;
  for (let t = s0; t < S; t++) {
    const e = [];
    for (let i = 0; i < N; i++) if (m.eligible[t * N + i]) e.push(m.mcap[t * N + i]);
    e.sort((a, b) => a - b);
    const n = e.length;
    const med = n % 2 ? e[n >> 1] : (e[n / 2 - 1] + e[n / 2]) / 2;
    const mean = e.reduce((a, b) => a + b, 0) / n;
    const logs = e.map(Math.log);
    const lm = logs.reduce((a, b) => a + b, 0) / n;
    const sd = Math.sqrt(logs.reduce((a, b) => a + (b - lm) ** 2, 0) / n);
    const skew = logs.reduce((a, b) => a + (b - lm) ** 3, 0) / n / sd ** 3;
    const over1T = e.filter((x) => x > 1e12).length;
    worst.max = Math.max(worst.max, e[n - 1]);
    worst.over1T = Math.max(worst.over1T, over1T);
    worst.medLo = Math.min(worst.medLo, med);
    worst.medHi = Math.max(worst.medHi, med);
    worst.ratio = Math.min(worst.ratio, mean / med);
    worst.skew = Math.min(worst.skew, skew);
    if (t === S - 1) lastOver1T = over1T;
    if (dates[t] === '2008-01-02') assert.ok(e[n - 1] < 1e12, 'no trillion-dollar company in 2008');
  }
  const b = (x) => `${(x / 1e9).toFixed(1)}B`;
  assert.ok(worst.max <= 4.6e12, `largest company ${b(worst.max)}`);
  assert.ok(worst.over1T <= 10, `${worst.over1T} companies above $1T on one day`);
  assert.ok(lastOver1T >= 1, 'at least one company above $1T at the end');
  assert.ok(worst.medLo >= 8.5e9 && worst.medHi <= 27e9, `eligible median ${b(worst.medLo)}-${b(worst.medHi)}`);
  assert.ok(worst.ratio >= 1.3, `mean/median ${worst.ratio.toFixed(2)}`);
  assert.ok(worst.skew > 0, `skew of log market cap ${worst.skew.toFixed(2)}`);
});
