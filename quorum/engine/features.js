// Point-in-time features. One streaming pass over the simulated history keeps rolling window sums
// per stock, so the features at date t can only depend on data at or before t (prices through the
// close of t, filings whose filing date is on or before t, short interest published on or before
// t, headlines dated on or before t). Each stored date gets a cross-sectional rank transform to
// (-1, 1) among the eligible names, missing -> 0, quantised to one byte.
import { standInIsNegative } from './sim/headlines.js';
import { rankTransform, percentileInto } from './lib/stats.js';
import { FAMILY_INPUTS } from './families/inputs.js';
import { trendScore } from './families/trend.js';
import { fundamentalScore } from './families/fundamental.js';
import { qualityScore } from './families/quality.js';

export { FAMILY_INPUTS };

export const FEATURES = [
  { key: 'mom_12_1', family: null, label: { en: '12-1 month price momentum', sl: 'Cenovni momentum 12-1' }, rawUnit: 'ratio' },
  { key: 'resid_mom', family: 'A', label: { en: 'Residual return, 12 months ex last month', sl: 'Rezidualni donos, 12 mesecev brez zadnjega' }, rawUnit: 'ratio' },
  { key: 'resid_mom_vs', family: 'A', label: { en: 'Residual 12-1 momentum, volatility-scaled', sl: 'Rezidualni momentum 12-1, prilagojen volatilnosti' }, rawUnit: 't' },
  { key: 'mom_6_1', family: null, label: { en: '6-1 month price momentum', sl: 'Cenovni momentum 6-1' }, rawUnit: 'ratio' },
  { key: 'rev_1m', family: null, label: { en: '1-month return (reversal)', sl: 'Enomesečni donos (obrat)' }, rawUnit: 'ratio' },
  { key: 'vol_60', family: null, label: { en: '60-day volatility', sl: '60-dnevna volatilnost' }, rawUnit: 'ratio' },
  { key: 'ivol', family: null, label: { en: 'Idiosyncratic volatility (60 days)', sl: 'Idiosinkratična volatilnost (60 dni)' }, rawUnit: 'ratio' },
  { key: 'beta', family: null, label: { en: 'Market beta (12 months)', sl: 'Tržna beta (12 mesecev)' }, rawUnit: 'x' },
  { key: 'max_ret', family: null, label: { en: 'Largest daily return, last month', sl: 'Največji dnevni donos v zadnjem mesecu' }, rawUnit: 'ratio' },
  { key: 'sue', family: 'B', label: { en: 'Standardised earnings surprise', sl: 'Standardizirano presenečenje pri dobičku' }, rawUnit: 'sd' },
  { key: 'gp_chg', family: 'B', label: { en: 'Year-on-year change in gross profitability', sl: 'Medletna sprememba bruto donosnosti' }, rawUnit: 'ratio' },
  { key: 'eps_chg', family: null, label: { en: 'Year-on-year EPS change, scaled by price', sl: 'Medletna sprememba dobička na delnico glede na ceno' }, rawUnit: 'ratio' },
  { key: 'days_since_filing', family: null, label: { en: 'Trading days since the last filing', sl: 'Dnevi trgovanja od zadnjega poročila' }, rawUnit: 'days' },
  { key: 'gpa', family: 'C', label: { en: 'Gross profits to assets', sl: 'Bruto dobiček glede na sredstva' }, rawUnit: 'ratio' },
  { key: 'ebit_ev', family: 'C', label: { en: 'EBIT to enterprise value', sl: 'EBIT glede na vrednost podjetja' }, rawUnit: 'ratio' },
  { key: 'fcf_yield', family: 'C', label: { en: 'Free-cash-flow yield', sl: 'Donos prostega denarnega toka' }, rawUnit: 'ratio' },
  { key: 'bm_adj', family: 'C', label: { en: 'Intangibles-adjusted book-to-market', sl: 'Knjigovodska proti tržni vrednosti, prilagojena za neopredmetena sredstva' }, rawUnit: 'ratio' },
  { key: 'leverage', family: null, label: { en: 'Leverage (debt to assets)', sl: 'Zadolženost (dolg glede na sredstva)' }, rawUnit: 'ratio' },
  { key: 'size', family: null, label: { en: 'Size (log market cap)', sl: 'Velikost (log tržne kapitalizacije)' }, rawUnit: 'usd' },
  { key: 'adv', family: null, label: { en: 'Average daily dollar volume (60 days)', sl: 'Povprečni dnevni promet (60 dni)' }, rawUnit: 'usd' },
  { key: 'turnover', family: null, label: { en: 'Share turnover (21 days)', sl: 'Obrat delnic (21 dni)' }, rawUnit: 'ratio' },
  { key: 'dtc', family: null, label: { en: 'Days to cover (short interest)', sl: 'Dnevi za pokritje (kratke pozicije)' }, rawUnit: 'days' },
  { key: 'days_to_earn', family: null, label: { en: 'Trading days to next earnings', sl: 'Dnevi trgovanja do naslednjih rezultatov' }, rawUnit: 'days' },
  // The LLM veto stand-in's own classification. Computed for display, never a D input: the brief
  // (§3.3) backtests LLM components only after the training cutoff, and a D that learns the veto's
  // labels would dodge every flagged stock itself, leaving the 48-hour veto nothing to block.
  { key: 'news_neg', family: null, label: { en: 'Negative headline in the last 5 days', sl: 'Negativna novica v zadnjih 5 dneh' }, rawUnit: 'flag', llmStandIn: true },
];
export const FEATURE_KEYS = FEATURES.map((f) => f.key);
export const FEATURE_INDEX = Object.fromEntries(FEATURE_KEYS.map((k, j) => [k, j]));
/** Features the ML ranker may use: every stored feature except the LLM stand-in's outputs. */
export const D_INPUT_KEYS = FEATURES.filter((f) => !f.llmStandIn).map((f) => f.key);

const W_LONG = 252;
const W_SHORT = 60;
const W_MON = 21;
const W_HALF = 126;
const TD = 252;

/** 2-factor OLS with intercept from raw sums. Returns [b1, b2, residVar] or null. */
function ols2(n, Sy, S1, S2, S11, S22, S12, Sy1, Sy2, Syy) {
  if (n < 10) return null;
  const c11 = S11 - (S1 * S1) / n;
  const c22 = S22 - (S2 * S2) / n;
  const c12 = S12 - (S1 * S2) / n;
  const cy1 = Sy1 - (Sy * S1) / n;
  const cy2 = Sy2 - (Sy * S2) / n;
  const cyy = Syy - (Sy * Sy) / n;
  const det = c11 * c22 - c12 * c12;
  if (!(det > 1e-18)) return null;
  const b1 = (cy1 * c22 - cy2 * c12) / det;
  const b2 = (cy2 * c11 - cy1 * c12) / det;
  const rss = Math.max(1e-12, cyy - b1 * cy1 - b2 * cy2);
  return [b1, b2, rss / (n - 3)];
}

const RET_CACHE = new WeakMap();

/** Log returns of every stock (close to close), the benchmark, and each sector index in excess of it. */
export function logReturns(m) {
  let r = RET_CACHE.get(m);
  if (r) return r;
  const { N, S } = m;
  const K = m.sectors.length;
  const lr = new Float64Array(S * N).fill(NaN);
  const mret = new Float64Array(S).fill(NaN);
  const sret = new Float64Array(K * S).fill(NaN);
  for (let t = 1; t < S; t++) {
    mret[t] = Math.log(m.bench.close[t] / m.bench.close[t - 1]);
    for (let k = 0; k < K; k++) sret[k * S + t] = Math.log(m.sectorIndex.close[k * S + t] / m.sectorIndex.close[k * S + t - 1]) - mret[t];
    const b = t * N;
    const a = (t - 1) * N;
    for (let i = 0; i < N; i++) {
      const c1 = m.close[b + i];
      const c0 = m.close[a + i];
      if (c1 === c1 && c0 === c0) lr[b + i] = Math.log(c1 / c0);
    }
  }
  r = { lr, mret, sret };
  RET_CACHE.set(m, r);
  return r;
}

/** Daily log returns of one stock, the market and its sector excess at t (NaN when missing). */
function dayReturns(m, t, i, out, R = logReturns(m)) {
  if (t < 1) {
    out[0] = NaN;
    return out;
  }
  out[0] = R.lr[t * m.N + i];
  out[1] = R.mret[t];
  out[2] = R.sret[m.companies.sector[i] * m.S + t];
  return out;
}

/** Index of the latest filing of company i with filingIdx <= t, or -1. */
function latestFiling(fil, i, t) {
  let lo = fil.start[i];
  let hi = fil.end[i];
  // filings of a company are sorted by period end, and filing dates increase with period end
  let ans = -1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (fil.filingIdx[mid] <= t) {
      ans = mid;
      lo = mid + 1;
    } else hi = mid;
  }
  return ans;
}

/** Sim index of the next scheduled earnings date strictly after t (may be >= S), or -1. */
export function nextScheduledEarnings(fil, i, t) {
  const sc = fil.schedule;
  let lo = sc.start[i];
  let hi = sc.end[i];
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (sc.idx[mid] <= t) lo = mid + 1;
    else hi = mid;
  }
  return lo < sc.end[i] ? lo : -1;
}

function nextFilingAfter(fil, i, t) {
  const k = nextScheduledEarnings(fil, i, t);
  return k < 0 ? -1 : fil.schedule.idx[k];
}

/**
 * Fundamental features from filings visible at t (filing date <= t). `mc` is the market cap at t.
 * Writes into out[FEATURE_INDEX...]. Shared by the streaming pass and the point computation.
 */
function fundamentalFeatures(fil, i, t, mc, price, out) {
  const J = FEATURE_INDEX;
  const f = latestFiling(fil, i, t);
  out[J.sue] = NaN;
  out[J.gp_chg] = NaN;
  out[J.eps_chg] = NaN;
  out[J.gpa] = NaN;
  out[J.ebit_ev] = NaN;
  out[J.fcf_yield] = NaN;
  out[J.bm_adj] = NaN;
  out[J.leverage] = NaN;
  out[J.days_since_filing] = NaN;
  if (f < 0) return;
  const age = t - fil.filingIdx[f];
  out[J.days_since_filing] = Math.min(age, 130);
  if (age > 200) return;
  const first = fil.start[i];
  out[J.leverage] = fil.debt[f] / fil.assets[f];
  out[J.bm_adj] = (fil.bookEquity[f] + fil.intangibles[f]) / mc;
  if (age <= 130) out[J.sue] = fil.sue[f];
  // valuation and profitability use the latest quarter annualised (FCF: last two quarters), so the
  // ratios are current rather than a trailing-twelve-month average that lags the price
  out[J.gpa] = (4 * fil.grossProfit[f]) / fil.assets[f];
  const ev = mc + fil.debt[f] - fil.cash[f];
  out[J.ebit_ev] = ev > 0 ? (4 * fil.ebit[f]) / ev : NaN;
  if (f - 1 >= first) out[J.fcf_yield] = (2 * (fil.fcf[f] + fil.fcf[f - 1])) / mc;
  if (f - 4 >= first) {
    out[J.gp_chg] = (4 * fil.grossProfit[f]) / fil.assets[f] - (4 * fil.grossProfit[f - 4]) / fil.assets[f - 4];
    out[J.eps_chg] = (fil.eps[f] - fil.eps[f - 4]) / price;
  }
}

/**
 * Raw (untransformed) features of stock i at date t, computed directly from the data at or before t.
 * Used for pick-page drivers and by the tests to cross-check the streaming pass.
 */
export function rawFeaturesAt(m, t, i) {
  const out = new Float64Array(FEATURES.length).fill(NaN);
  const N = m.N;
  const px = m.close[t * N + i];
  if (!(px === px)) return out;
  const J = FEATURE_INDEX;
  const buf = new Float64Array(3);
  const L = sumsOver(m, i, t, W_LONG, buf);
  const Mo = sumsOver(m, i, t, W_MON, buf);
  const Sh = sumsOver(m, i, t, W_SHORT, buf);
  const Hf = sumsOver(m, i, t, W_HALF, buf);
  writePriceFeatures(L, Mo, Sh, Hf, out);
  // max daily return over the last 21 days
  let mx = NaN;
  for (let d = Math.max(1, t - W_MON + 1); d <= t; d++) {
    dayReturns(m, d, i, buf);
    if (buf[0] === buf[0] && !(buf[0] <= mx)) mx = buf[0];
  }
  out[J.max_ret] = mx;
  const mc = m.mcap[t * N + i];
  out[J.size] = Math.log(mc);
  const adv = m.adv60[t * N + i];
  out[J.adv] = adv > 0 ? Math.log(adv) : NaN;
  let tv = 0;
  let tn = 0;
  for (let d = Math.max(0, t - W_MON + 1); d <= t; d++) {
    const v = m.volume[d * N + i];
    const s = m.shares[d * N + i];
    if (v === v && s > 0) {
      tv += v / s;
      tn++;
    }
  }
  out[J.turnover] = tn >= 10 ? tv / tn : NaN;
  const dtc = m.dtcPub[t * N + i];
  out[J.dtc] = dtc === dtc ? dtc : NaN;
  const nxt = nextFilingAfter(m.filings, i, t);
  out[J.days_to_earn] = nxt > t ? Math.min(90, nxt - t) : NaN;
  out[J.news_neg] = negNewsWithin(m, i, t, 5) ? 1 : 0;
  fundamentalFeatures(m.filings, i, t, mc, px, out);
  return out;
}

// window sums over days (t-W, t] for one stock: [n, Sy, S1, S2, S11, S22, S12, Sy1, Sy2, Syy]
function sumsOver(m, i, t, W, buf) {
  const s = new Float64Array(10);
  for (let d = Math.max(1, t - W + 1); d <= t; d++) {
    dayReturns(m, d, i, buf);
    const y = buf[0];
    if (!(y === y)) continue;
    const x1 = buf[1];
    const x2 = buf[2];
    s[0]++;
    s[1] += y;
    s[2] += x1;
    s[3] += x2;
    s[4] += x1 * x1;
    s[5] += x2 * x2;
    s[6] += x1 * x2;
    s[7] += y * x1;
    s[8] += y * x2;
    s[9] += y * y;
  }
  return s;
}

function writePriceFeatures(L, Mo, Sh, Hf, out) {
  const J = FEATURE_INDEX;
  // 12-1 window = long window minus the last month
  const n121 = L[0] - Mo[0];
  if (L[0] >= 200 && n121 >= 180) {
    out[J.mom_12_1] = Math.expm1(L[1] - Mo[1]);
    const reg = ols2(L[0], L[1], L[2], L[3], L[4], L[5], L[6], L[7], L[8], L[9]);
    if (reg) {
      const [b1, b2, rv] = reg;
      const resid = L[1] - Mo[1] - b1 * (L[2] - Mo[2]) - b2 * (L[3] - Mo[3]);
      out[J.resid_mom] = resid;
      out[J.resid_mom_vs] = resid / Math.sqrt(rv * n121);
    }
    const c11 = L[4] - (L[2] * L[2]) / L[0];
    const cy1 = L[7] - (L[1] * L[2]) / L[0];
    if (c11 > 0) out[J.beta] = cy1 / c11;
  }
  if (Hf[0] >= 100 && Hf[0] - Mo[0] >= 80) out[J.mom_6_1] = Math.expm1(Hf[1] - Mo[1]);
  if (Mo[0] >= 15) out[J.rev_1m] = Math.expm1(Mo[1]);
  if (Sh[0] >= 40) {
    const cyy = Sh[9] - (Sh[1] * Sh[1]) / Sh[0];
    out[J.vol_60] = Math.sqrt(Math.max(0, cyy) / (Sh[0] - 1)) * Math.sqrt(TD);
    const reg = ols2(Sh[0], Sh[1], Sh[2], Sh[3], Sh[4], Sh[5], Sh[6], Sh[7], Sh[8], Sh[9]);
    if (reg) out[J.ivol] = Math.sqrt(reg[2]) * Math.sqrt(TD);
  }
}

function negNewsWithin(m, i, t, days) {
  const nw = m.news;
  // news is sorted by t; binary search the first event with t > t - days
  let lo = 0;
  let hi = nw.t.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (nw.t[mid] <= t - days) lo = mid + 1;
    else hi = mid;
  }
  for (let k = lo; k < nw.t.length && nw.t[k] <= t; k++) {
    if (nw.company[k] === i && standInIsNegative(nw.headline[k])) return true;
  }
  return false;
}

/**
 * Streaming pass. Stores rank-transformed features for every date t >= modelFrom and for every
 * `trainEvery`-th date from `storeFrom` (training rows before the model window). Also returns the
 * A, B, C family percentiles and the idiosyncratic volatility for the model dates.
 */
export function computeFeatures(m, { modelFrom = m.s0, storeFrom = W_LONG, trainEvery = 5, shared = true } = {}) {
  const N = m.N;
  const S = m.S;
  const F = FEATURES.length;
  const J = FEATURE_INDEX;
  const fil = m.filings;
  const secOf = m.companies.sector;
  const K = m.sectors.length;
  const isStored = (t) => t >= modelFrom || (t >= storeFrom && t % trainEvery === 0);
  // pre-count rows
  const storedDates = [];
  let R = 0;
  for (let t = 0; t < S; t++) {
    if (!isStored(t)) continue;
    storedDates.push(t);
    for (let i = 0; i < N; i++) R += m.eligible[t * N + i];
  }
  const D = storedDates.length;
  const rowStart = new Int32Array(D + 1);
  const stock = new Int32Array(shared ? new SharedArrayBuffer(4 * R) : new ArrayBuffer(4 * R));
  const q = new Uint8Array(shared ? new SharedArrayBuffer(R * F) : new ArrayBuffer(R * F));
  const rowDate = new Int32Array(shared ? new SharedArrayBuffer(4 * R) : new ArrayBuffer(4 * R));
  const T = S - modelFrom;
  const pctA = new Float32Array(T * N).fill(NaN);
  const pctB = new Float32Array(T * N).fill(NaN);
  const pctC = new Float32Array(T * N).fill(NaN);
  const ivolM = new Float32Array(T * N).fill(NaN);

  // rolling sums per stock, flat [i * width + k]: long (252) and short (60) regression sums
  // [n, Sy, S1, S2, S11, S22, S12, Sy1, Sy2, Syy], month (21) [n, Sy, S1, S2], half (126) [n, Sy],
  // turnover (21) [n, sum]
  const Lsum = new Float64Array(N * 10);
  const Ssum = new Float64Array(N * 10);
  const Msum = new Float64Array(N * 4);
  const Hsum = new Float64Array(N * 2);
  const TV = new Float64Array(N * 2);
  const lastNeg = new Int32Array(N).fill(-1000);
  let newsPtr = 0;
  const nw = m.news;

  const idxList = new Int32Array(N);
  const raw = new Float64Array(F * N); // per stored date, feature-major over the eligible list
  const tmpA = new Float64Array(N);
  const tmpB = new Float64Array(N);
  const tmpC = new Float64Array(N);
  const rk = new Float64Array(N);
  const rtmp = new Float64Array(N);
  const Lrow = new Float64Array(10);
  const Mrow = new Float64Array(4);
  const Srow = new Float64Array(10);
  const Hrow = new Float64Array(2);
  const scratch = { a: new Float64Array(N), b: new Float64Array(N), tmp: new Float64Array(N), cnt: new Int32Array(N) };

  function add10(arr, o, y, x1, x2, sgn) {
    arr[o] += sgn;
    arr[o + 1] += sgn * y;
    arr[o + 2] += sgn * x1;
    arr[o + 3] += sgn * x2;
    arr[o + 4] += sgn * x1 * x1;
    arr[o + 5] += sgn * x2 * x2;
    arr[o + 6] += sgn * x1 * x2;
    arr[o + 7] += sgn * y * x1;
    arr[o + 8] += sgn * y * x2;
    arr[o + 9] += sgn * y * y;
  }

  const RT = logReturns(m);
  const { lr, mret, sret } = RT;
  const vol = m.volume;
  const shr = m.shares;
  let d = 0;
  let row = 0;
  for (let t = 0; t < S; t++) {
    // advance the news pointer: headlines dated <= t
    while (newsPtr < nw.t.length && nw.t[newsPtr] <= t) {
      if (standInIsNegative(nw.headline[newsPtr])) lastNeg[nw.company[newsPtr]] = nw.t[newsPtr];
      newsPtr++;
    }
    const tL = t - W_LONG;
    const tS = t - W_SHORT;
    const tM = t - W_MON;
    const tH = t - W_HALF;
    const x1t = mret[t];
    const x1L = tL >= 1 ? mret[tL] : 0;
    const x1S = tS >= 1 ? mret[tS] : 0;
    const x1M = tM >= 1 ? mret[tM] : 0;
    for (let i = 0; i < N; i++) {
      const ks = secOf[i] * S;
      const y = t >= 1 ? lr[t * N + i] : NaN;
      if (y === y) {
        const x2 = sret[ks + t];
        add10(Lsum, i * 10, y, x1t, x2, 1);
        add10(Ssum, i * 10, y, x1t, x2, 1);
        const o = i * 4;
        Msum[o]++;
        Msum[o + 1] += y;
        Msum[o + 2] += x1t;
        Msum[o + 3] += x2;
        Hsum[i * 2]++;
        Hsum[i * 2 + 1] += y;
      }
      if (tL >= 1) {
        const yo = lr[tL * N + i];
        if (yo === yo) add10(Lsum, i * 10, yo, x1L, sret[ks + tL], -1);
      }
      if (tS >= 1) {
        const yo = lr[tS * N + i];
        if (yo === yo) add10(Ssum, i * 10, yo, x1S, sret[ks + tS], -1);
      }
      if (tM >= 1) {
        const yo = lr[tM * N + i];
        if (yo === yo) {
          const o = i * 4;
          Msum[o]--;
          Msum[o + 1] -= yo;
          Msum[o + 2] -= x1M;
          Msum[o + 3] -= sret[ks + tM];
        }
      }
      if (tH >= 1) {
        const yo = lr[tH * N + i];
        if (yo === yo) {
          Hsum[i * 2]--;
          Hsum[i * 2 + 1] -= yo;
        }
      }
      const v = vol[t * N + i];
      const sh = shr[t * N + i];
      if (v === v && sh > 0) {
        TV[i * 2]++;
        TV[i * 2 + 1] += v / sh;
      }
      if (tM >= 0) {
        const vo = vol[tM * N + i];
        const so = shr[tM * N + i];
        if (vo === vo && so > 0) {
          TV[i * 2]--;
          TV[i * 2 + 1] -= vo / so;
        }
      }
    }
    if (!isStored(t)) continue;

    // ---- stored date: raw features for the eligible names ----
    let n = 0;
    for (let i = 0; i < N; i++) if (m.eligible[t * N + i]) idxList[n++] = i;
    rowStart[d] = row;
    const one = new Float64Array(F);
    for (let e = 0; e < n; e++) {
      const i = idxList[e];
      for (let k = 0; k < 10; k++) {
        Lrow[k] = Lsum[i * 10 + k];
        Srow[k] = Ssum[i * 10 + k];
      }
      for (let k = 0; k < 4; k++) Mrow[k] = Msum[i * 4 + k];
      Hrow[0] = Hsum[i * 2];
      Hrow[1] = Hsum[i * 2 + 1];
      one.fill(NaN);
      writePriceFeatures(Lrow, Mrow, Srow, Hrow, one);
      let mx = NaN;
      for (let dd = Math.max(1, t - W_MON + 1); dd <= t; dd++) {
        const r = RT.lr[dd * N + i];
        if (r === r && !(r <= mx)) mx = r;
      }
      one[J.max_ret] = mx;
      const mc = m.mcap[t * N + i];
      const px = m.close[t * N + i];
      one[J.size] = Math.log(mc);
      const adv = m.adv60[t * N + i];
      one[J.adv] = adv > 0 ? Math.log(adv) : NaN;
      one[J.turnover] = TV[i * 2] >= 10 ? TV[i * 2 + 1] / TV[i * 2] : NaN;
      const dtc = m.dtcPub[t * N + i];
      one[J.dtc] = dtc === dtc ? dtc : NaN;
      const nxt = nextFilingAfter(fil, i, t);
      one[J.days_to_earn] = nxt > t ? Math.min(90, nxt - t) : NaN;
      one[J.news_neg] = t - lastNeg[i] < 5 ? 1 : 0;
      fundamentalFeatures(fil, i, t, mc, px, one);
      for (let j = 0; j < F; j++) raw[j * N + e] = one[j];
    }
    // rank-transform and quantise
    for (let j = 0; j < F; j++) {
      const col = raw.subarray(j * N, j * N + n);
      rankTransform(col, n, rk, rtmp);
      for (let e = 0; e < n; e++) q[(row + e) * F + j] = Math.round(((rk[e] + 1) / 2) * 255);
    }
    for (let e = 0; e < n; e++) {
      stock[row + e] = idxList[e];
      rowDate[row + e] = t;
    }

    // ---- family scores on model dates ----
    if (t >= modelFrom) {
      const tb = (t - modelFrom) * N;
      const ctx = { raw, N, n, J, idx: idxList, sector: secOf, K, scratch };
      percentileInto(trendScore(ctx), n, tmpA, rtmp);
      for (let e = 0; e < n; e++) pctA[tb + idxList[e]] = tmpA[e];
      percentileInto(fundamentalScore(ctx, tmpB), n, tmpA, rtmp);
      for (let e = 0; e < n; e++) pctB[tb + idxList[e]] = tmpA[e];
      percentileInto(qualityScore(ctx, tmpC), n, tmpA, rtmp);
      for (let e = 0; e < n; e++) pctC[tb + idxList[e]] = tmpA[e];
      for (let e = 0; e < n; e++) ivolM[tb + idxList[e]] = raw[J.ivol * N + e];
    }
    row += n;
    d++;
  }
  rowStart[D] = row;
  return {
    keys: FEATURE_KEYS,
    F,
    D,
    R,
    dates: Int32Array.from(storedDates),
    rowStart,
    stock,
    rowDate,
    q,
    modelFrom,
    trainEvery,
    pct: { A: pctA, B: pctB, C: pctC },
    ivol: ivolM,
  };
}

/** Dequantise a stored feature byte back to its rank value in [-1, 1]. */
export function qToRank(b) {
  return (b / 255) * 2 - 1;
}
