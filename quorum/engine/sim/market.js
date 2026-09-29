// The simulated US equity market. One deterministic pass from a seed produces prices, volumes,
// share counts, quarterly fundamentals with filing dates, short interest, news, M&A, insider
// buying, a benchmark total-return index, 11 sector indices and EURUSD.
//
// Hidden return process (the truth; the model families only see observable data):
//   daily log return = beta * market + g * sector + alpha + idio noise (+ jumps)
//   alpha = persistent latent drift mu (momentum; pays mostly for low-idio-vol names, reverses
//           in post-bear rebounds) + quality premium (only for low leverage) + value (mispricing M
//           mean-reverts at speed kappa(t), negative 2017-2020) + post-earnings drift after each
//           filing (60 trading days, weaker for large caps) + negative drift for the top
//           short-interest and top idio-vol names + ~10-day negative drift after negative news
//           + small positive drift after opportunistic insider cluster buys.
//   jumps = earnings-day gaps at the open after each filing, news gaps, M&A premium gaps.
//
// Market caps. Prices are total-return prices, so a company's price compounds everything it ever
// earned. Market cap = price x share count, and the share count carries the capital a company pays
// out (dividends and buybacks) or raises (issuance): every day it shrinks by the net payout yield of
// payoutYield(). That yield rises with the company's size relative to the median listed company
// (tanh in log(mcap / median), plus a quadratic term above ~12x the median for the very largest) and
// with the median's distance above a long-run anchor (HIDDEN.payoutAnchor). With growth independent
// of size (Gibrat's law) the dispersion of log market caps grows without limit, and the largest firm
// with it; a size-dependent drag keeps the cross-section in the shape of the real liquid US universe
// on every date (without it the 2026 cross-section had a $60T company and a $55B median). The
// fundamentals' dollar scale carries the same cumulative payout, so per-share figures and valuation
// ratios (EPS, EV/EBIT, FCF yield, book-to-market) are unaffected, and returns never see it.
import { tradingDaysBetween, addDays, isTradingDay, nextTradingDay, countTradingDays } from '../../core/calendar.js';
import { makeRng } from '../lib/prng.js';
import {
  MARKET_SEGMENTS, SECTORS, SECTOR_PARAMS, SECTOR_EPISODES, EURUSD_ANCHORS, MOMENTUM_WINDOWS, VALUE_WINDOWS,
  VALUE_KAPPA_BASE, QUALITY_WINDOWS, DISTRESS_WINDOWS, IPO_COUNTS, MA_YEAR_MULT, windowValue,
} from './regimes.js';
import { makeName, makeTicker, makeIsin, makeFigi } from './names.js';
import { NEGATIVE_TEMPLATES, NEUTRAL_TEMPLATES, fillHeadline, shortName } from './headlines.js';
import { buildFundamentals } from './fundamentals.js';

export const SIM_DEFAULTS = Object.freeze({
  seed: 20260928,
  simStart: '2005-01-03', // burn-in: features and the first D model exist on modelStart
  modelStart: '2008-01-02',
  end: '2026-09-28',
  nInitial: 1430,
  ipoScale: 1.2,
  params: {},
  // No chosen future: by default the simulated world simply continues on its own random stream after
  // the engine freeze, and the sealed record shows whatever that stream produces. For experiments
  // only, `scenarioFrom: 'YYYY-MM-DD'` switches the daily and event draws from that date to the
  // numbered sub-stream `scenario`. Never set it for the published record: picking a sub-stream by
  // its outcome would be selection bias in our own track record.
  scenarioFrom: null,
  scenario: 0,
});

// Hidden-process parameters (calibrated; see engine/tools/model-report.js).
export const HIDDEN = Object.freeze({
  sigmaMu: 0.066, // cross-sectional sd of the latent drift (per year)
  muHalfLife: 1.5, // years
  muQuality: 0.2, // correlation of the drift's long-run mean with latent quality
  mQuality: 0.1, // quality is underpriced: mispricing mean-reverts to -mQuality * q (no alpha by itself)
  momHighIvol: 0.0, // share of the momentum drift realised by high-idio-vol names
  momLowIvol: 1.8,
  qualityPremium: 0.016, // per year per sd of latent quality (low-leverage names)
  qualityHighLev: 0.0,
  mispriceShare: 0.05, // share of each idio shock variance that is slow mispricing (value)
  transientShare: 0.06, // amplitude share of each idio shock that reverts within weeks (reversal)
  transientHalfLife: 6, // trading days
  unpricedSd: 0.024, // fundamental shock at each filing that the price ignores (value signal)
  unpricedMu: 0.006, // part of that shock aligned with the latent drift (growth outruns the price)
  surpriseMu: 0.07, // loading of earnings surprises on the latent drift
  surpriseAr: 0.1, // autocorrelation of consecutive surprises (predictable next-announcement jumps)
  peadTotal: 0.006, // drift over 60 days per 1 sd surprise at the reference size
  earnJump: 0.03,
  dtcAlpha: 0.1, // per year per unit of (theta - 1)+
  ivolAlpha: 0.1, // per year, top idio-vol decile
  newsDrift: 0.012, // total over 10 days per unit severity
  negNewsRate: 0.7, // negative headlines per stock-year at theta <= 0
  insiderDrift: 0.02, // total over 63 days
  // Net payout (dividends plus net buybacks, minus issuance) per year. Prices are total-return
  // prices, so capital paid out never shows in them: it shrinks the share count (and the
  // fundamentals' dollar scale) instead. Payout rises with size relative to the market median,
  // which keeps the cross-section of market caps stationary in shape (see payoutYield).
  payoutBase: 0.04,
  payoutSize: 0.05, // extra yield per year at the saturation of tanh(log(mc / median) / payoutWidth)
  payoutWidth: 1.0,
  payoutMega: 0.03, // per year per squared log unit above payoutMegaFrom (the very largest firms)
  payoutMegaFrom: 2.5,
  payoutAnchor: 16e9, // long-run median market cap of the listed universe
  payoutAnchorPull: 0.15, // uniform extra yield per year per log unit of median / payoutAnchor
});

const TD = 252;

function idxOnOrAfter(dates, date) {
  let lo = 0;
  let hi = dates.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (dates[mid] < date) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

function idxOnOrBefore(dates, date) {
  const i = idxOnOrAfter(dates, date);
  if (i < dates.length && dates[i] === date) return i;
  return i - 1;
}

// ---- market, sectors, FX -------------------------------------------------------------------------

function buildMarketPath(dates, seed) {
  const S = dates.length;
  const rng = makeRng(seed, 'market');
  const on = new Float64Array(S);
  const id = new Float64Array(S);
  const vol = new Float64Array(S); // annualised vol of the day (hidden)
  const segOf = new Int32Array(S).fill(-1);
  // segment boundaries in index space: segment k covers (endIdx[k-1], endIdx[k]]
  let prevEndDate = null;
  const segs = [];
  for (let k = 0; k < MARKET_SEGMENTS.length; k++) {
    const [endDate, R, v] = MARKET_SEGMENTS[k];
    const startDate = prevEndDate;
    prevEndDate = endDate;
    // full segment length in trading days (independent of the sim window)
    const fullDays = startDate ? tradingDaysBetween(addDays(startDate, 1), endDate).length : tradingDaysBetween('2005-01-04', endDate).length;
    const a = startDate ? idxOnOrAfter(dates, addDays(startDate, 1)) : 1;
    const b = Math.min(idxOnOrBefore(dates, endDate), S - 1);
    if (b < Math.max(a, 1)) continue;
    segs.push({ a: Math.max(a, 1), b, drift: Math.log(1 + R) / fullDays, v });
  }
  let ou = 0;
  for (const s of segs) {
    let sumNoise = 0;
    for (let t = s.a; t <= s.b; t++) {
      ou = 0.97 * ou + 0.243 * rng.n();
      const sig = s.v * Math.exp(0.12 * ou - 0.007);
      const sd = sig / Math.sqrt(TD);
      // intra-segment noise at 85% of the nominal vol keeps each episode's shape recognisable
      on[t] = 0.85 * sd * Math.sqrt(0.3) * rng.n();
      id[t] = 0.85 * sd * Math.sqrt(0.7) * rng.n();
      sumNoise += on[t] + id[t];
      vol[t] = sig;
      segOf[t] = 1;
    }
    const n = s.b - s.a + 1;
    const corr = sumNoise / n;
    for (let t = s.a; t <= s.b; t++) {
      id[t] += s.drift * 0.5 - corr;
      on[t] += s.drift * 0.5;
    }
  }
  vol[0] = vol[1] || 0.15;
  for (let t = 1; t < S; t++) if (segOf[t] < 0) vol[t] = vol[t - 1];
  // benchmark levels
  const open = new Float64Array(S);
  const close = new Float64Array(S);
  close[0] = 1000;
  open[0] = 1000;
  const L = new Float64Array(S); // log level
  for (let t = 1; t < S; t++) {
    open[t] = close[t - 1] * Math.exp(on[t]);
    close[t] = open[t] * Math.exp(id[t]);
    L[t] = L[t - 1] + on[t] + id[t];
  }
  // smoothed level (the "economy" fundamentals follow) and smoothed vol
  const Ls = new Float64Array(S);
  const volS = new Float64Array(S);
  Ls[0] = 0;
  volS[0] = vol[0];
  for (let t = 1; t < S; t++) {
    Ls[t] = Ls[t - 1] + (L[t] - Ls[t - 1]) / 200 + 0.06 / TD; // trend-adjusted EMA
    volS[t] = volS[t - 1] + (vol[t] - volS[t - 1]) * 0.08;
  }
  return { on, id, vol, volS, open, close, L, Ls };
}

function buildSectorPaths(dates, seed, mk) {
  const S = dates.length;
  const K = SECTORS.length;
  const rng = makeRng(seed, 'sectors');
  const on = new Float64Array(K * S);
  const id = new Float64Array(K * S);
  const drift = new Float64Array(K * S);
  for (const [k, from, to, R] of SECTOR_EPISODES) {
    const full = tradingDaysBetween(from, to).length;
    const a = idxOnOrAfter(dates, from);
    const b = Math.min(idxOnOrBefore(dates, to), S - 1);
    for (let t = Math.max(a, 1); t <= b; t++) drift[k * S + t] += Math.log(1 + R) / full;
  }
  for (let t = 1; t < S; t++) {
    const vr = Math.sqrt(Math.min(4, Math.max(0.6, mk.volS[t] / 0.16)));
    for (let k = 0; k < K; k++) {
      const sd = (SECTOR_PARAMS[k].vol * vr) / Math.sqrt(TD);
      on[k * S + t] = sd * Math.sqrt(0.3) * rng.n() + drift[k * S + t] * 0.5;
      id[k * S + t] = sd * Math.sqrt(0.7) * rng.n() + drift[k * S + t] * 0.5;
    }
  }
  const close = new Float64Array(K * S);
  const open = new Float64Array(K * S);
  const Ss = new Float64Array(K * S); // smoothed sector-relative log level
  const Slev = new Float64Array(K * S);
  for (let k = 0; k < K; k++) {
    close[k * S] = 100;
    open[k * S] = 100;
    for (let t = 1; t < S; t++) {
      open[k * S + t] = close[k * S + t - 1] * Math.exp(mk.on[t] + on[k * S + t]);
      close[k * S + t] = open[k * S + t] * Math.exp(mk.id[t] + id[k * S + t]);
      Slev[k * S + t] = Slev[k * S + t - 1] + on[k * S + t] + id[k * S + t];
      Ss[k * S + t] = Ss[k * S + t - 1] + (Slev[k * S + t] - Ss[k * S + t - 1]) / 200;
    }
  }
  return { on, id, open, close, Ss, Slev };
}

function buildEurusd(dates, seed) {
  const S = dates.length;
  const rng = makeRng(seed, 'eurusd');
  const out = new Float64Array(S);
  const anchors = EURUSD_ANCHORS.map(([d, v]) => [Math.min(Math.max(idxOnOrAfter(dates, d), 0), S - 1), Math.log(v), d]);
  // extend to cover the window
  const pts = [];
  for (const a of anchors) pts.push(a);
  pts.sort((x, y) => x[0] - y[0]);
  const lvl = new Float64Array(S);
  const sd = 0.075 / Math.sqrt(TD);
  // interpolate between consecutive anchors with a bridged random walk
  for (let k = 0; k + 1 < pts.length; k++) {
    const [a, la] = pts[k];
    const [b, lb] = pts[k + 1];
    if (b <= a) continue;
    let w = 0;
    const walk = new Float64Array(b - a + 1);
    for (let t = a + 1; t <= b; t++) {
      w += sd * rng.n();
      walk[t - a] = w;
    }
    for (let t = a; t <= b; t++) {
      const frac = (t - a) / (b - a);
      lvl[t] = la + (lb - la) * frac + walk[t - a] - walk[b - a] * frac;
    }
  }
  const first = pts[0][0];
  const last = pts[pts.length - 1][0];
  for (let t = 0; t < first; t++) lvl[t] = pts[0][1];
  for (let t = last + 1; t < S; t++) lvl[t] = lvl[last];
  for (let t = 0; t < S; t++) out[t] = Math.round(Math.exp(lvl[t]) * 1e4) / 1e4;
  return out;
}

function buildSchedules(dates, seed) {
  const S = dates.length;
  const rng = makeRng(seed, 'schedules');
  const pmom = new Float64Array(S);
  const kappa = new Float64Array(S);
  const pqual = new Float64Array(S);
  const ppead = new Float64Array(S);
  const distress = new Float64Array(S);
  let o1 = 0;
  let o2 = 0;
  let o3 = 0;
  let o4 = 0;
  const r = Math.exp(-1 / 63);
  const s = Math.sqrt(1 - r * r);
  const y0 = 2008;
  for (let t = 0; t < S; t++) {
    const d = dates[t];
    o1 = r * o1 + s * rng.n();
    o2 = r * o2 + s * rng.n();
    o3 = r * o3 + s * rng.n();
    o4 = r * o4 + s * rng.n();
    pmom[t] = windowValue(MOMENTUM_WINDOWS, d, 1) + 0.45 * o1;
    kappa[t] = windowValue(VALUE_WINDOWS, d, VALUE_KAPPA_BASE) + 0.12 * o4;
    pqual[t] = windowValue(QUALITY_WINDOWS, d, 1) + 0.5 * o2;
    const years = Number(d.slice(0, 4)) + Number(d.slice(5, 7)) / 12 - y0;
    ppead[t] = Math.max(0.2, (1.15 - 0.025 * years) * (1 + 0.3 * o3));
    distress[t] = windowValue(DISTRESS_WINDOWS, d, 1);
  }
  return { pmom, kappa, pqual, ppead, distress };
}

// ---- companies -----------------------------------------------------------------------------------

function pickSector(rng) {
  let u = rng.u();
  for (let k = 0; k < SECTOR_PARAMS.length; k++) {
    u -= SECTOR_PARAMS[k].weight;
    if (u <= 0) return k;
  }
  return SECTOR_PARAMS.length - 1;
}

function clip(x, lo, hi) {
  return x < lo ? lo : x > hi ? hi : x;
}

/**
 * Net payout yield per year of a company with market cap `mc` when the median listed company is worth
 * `ref`: the uniform payout, a uniform term for the median's distance from its long-run anchor, a size
 * term that rises smoothly with log(mc / ref) (mature large caps return more capital, small ones issue
 * shares) and a quadratic term for the very largest. It keeps the upper tail of market caps from
 * compounding without limit while the total-return prices stay untouched.
 */
export function payoutYield(mc, ref, H = HIDDEN) {
  if (!(mc > 0) || !(ref > 0)) return H.payoutBase;
  const l = Math.log(mc / ref);
  const over = Math.max(0, l - H.payoutMegaFrom);
  return H.payoutBase + H.payoutAnchorPull * Math.log(ref / H.payoutAnchor) + H.payoutSize * Math.tanh(l / H.payoutWidth) + H.payoutMega * over * over;
}

function buildCompanies(dates, o) {
  const rng = makeRng(o.seed, 'companies');
  const S = dates.length;
  // IPO schedule
  const ipoDays = [];
  const y0 = Number(dates[0].slice(0, 4));
  const y1 = Number(dates[S - 1].slice(0, 4));
  for (let y = y0; y <= y1; y++) {
    const inYear = [];
    for (let t = 5; t < S; t++) if (dates[t].startsWith(`${y}-`)) inYear.push(t);
    if (!inYear.length) continue;
    const fullYear = tradingDaysBetween(`${y}-01-01`, `${y}-12-31`).length;
    const n = Math.round((IPO_COUNTS[y] ?? 12) * o.ipoScale * (inYear.length / fullYear));
    for (let k = 0; k < n; k++) ipoDays.push(inYear[Math.floor(rng.u() * inYear.length)]);
  }
  ipoDays.sort((a, b) => a - b);
  const N = o.nInitial + ipoDays.length;
  const c = {
    N,
    sector: new Uint8Array(N),
    beta: new Float64Array(N),
    gload: new Float64Array(N),
    sigBar: new Float64Array(N),
    q: new Float64Array(N),
    lev: new Float64Array(N),
    levLow: new Uint8Array(N),
    tau: new Float64Array(N),
    dtcMu: new Float64Array(N),
    ey: new Float64Array(N),
    gm: new Float64Array(N),
    emFrac: new Float64Array(N),
    turn: new Float64Array(N),
    intang: new Float64Array(N),
    conv: new Float64Array(N),
    fiscalOffset: new Uint8Array(N),
    listIdx: new Int32Array(N),
    delistIdx: new Int32Array(N).fill(-1),
    delistReason: new Array(N).fill(null),
    delistReturn: new Float64Array(N).fill(NaN),
    delistReturnImputed: new Uint8Array(N),
    p0: new Float64Array(N),
    mcap0: new Float64Array(N),
    m0: new Float64Array(N),
    name: new Array(N),
    ticker: new Array(N),
    isin: new Array(N),
    figi: new Array(N),
    venue: new Array(N),
    listDate: new Array(N),
  };
  const usedNames = new Set();
  const usedTickers = new Set();
  // tickers draw from their own stream: screening against the real US symbols never shifts company draws
  const tickerRng = makeRng(o.seed, 'tickers');
  const usedIsin = new Set();
  const usedFigi = new Set();
  for (let i = 0; i < N; i++) {
    const ipo = i >= o.nInitial;
    const k = pickSector(rng);
    const sp = SECTOR_PARAMS[k];
    c.sector[i] = k;
    c.listIdx[i] = ipo ? ipoDays[i - o.nInitial] : 0;
    const mcap = ipo ? Math.exp(Math.log(5.5e9) + 0.6 * rng.n()) : Math.exp(Math.log(o.params.mcapMedian ?? 18e9) + 0.78 * rng.n());
    c.mcap0[i] = mcap;
    c.p0[i] = ipo ? clip(Math.exp(Math.log(26) + 0.3 * rng.n()), 14, 60) : clip(Math.exp(Math.log(58) + 0.45 * rng.n() + 0.2 * Math.log(mcap / 18e9)), 16, 450);
    c.beta[i] = clip(sp.beta + 0.22 * rng.n(), 0.3, 2.2);
    c.gload[i] = clip(1 + 0.25 * rng.n(), 0.3, 1.8);
    c.sigBar[i] = clip(Math.exp(Math.log(0.25) + 0.28 * rng.n()) * (mcap / 10e9) ** -0.09 * (ipo ? 1.2 : 1), 0.1, 0.9);
    c.q[i] = rng.n();
    c.lev[i] = clip(sp.lev * Math.exp(0.35 * rng.n() - 0.12 * c.q[i]), 0.02, 0.75);
    c.levLow[i] = c.lev[i] < sp.lev ? 1 : 0;
    c.tau[i] = clip(0.0095 * (mcap / 10e9) ** -0.22 * Math.exp(0.3 * rng.n()), 0.002, 0.06);
    c.dtcMu[i] = Math.log(2.4) + 0.4 * rng.n();
    c.ey[i] = sp.ey * Math.exp(0.22 * rng.n() + 0.06 * c.q[i]);
    c.gm[i] = clip(sp.gm * Math.exp(0.1 * c.q[i] + 0.08 * rng.n()), 0.08, 0.95);
    c.emFrac[i] = clip(0.34 + 0.06 * c.q[i] + 0.05 * rng.n(), 0.06, 0.7);
    c.turn[i] = sp.turn * Math.exp(0.2 * c.q[i] + 0.2 * rng.n());
    c.intang[i] = sp.intang * Math.exp(0.25 * rng.n());
    c.conv[i] = clip(0.85 + 0.15 * rng.n(), 0.3, 1.4);
    const fu = rng.u();
    c.fiscalOffset[i] = fu < 0.7 ? 0 : fu < 0.85 ? 1 : 2;
    c.m0[i] = (ipo ? 0.1 + 0.15 * rng.n() : 0.15 * rng.n()) - (o.params.mQuality ?? HIDDEN.mQuality) * c.q[i];
    const nm = makeName(rng, k, usedNames);
    c.name[i] = nm.name;
    c.ticker[i] = makeTicker(tickerRng, nm, usedTickers);
    c.isin[i] = makeIsin(rng, usedIsin);
    c.figi[i] = makeFigi(rng, usedFigi);
    c.venue[i] = rng.u() < sp.nasdaq ? 'NASDAQ (simulated)' : 'NYSE (simulated)';
    if (ipo) c.listDate[i] = dates[c.listIdx[i]];
    else {
      const y = 1972 + Math.floor(rng.u() * 32);
      const m = 1 + Math.floor(rng.u() * 12);
      const d = 1 + Math.floor(rng.u() * 27);
      let ld = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      if (!isTradingDay(ld)) ld = nextTradingDay(ld);
      c.listDate[i] = ld;
    }
  }
  return c;
}

// Fiscal quarter ends (last calendar day of the month) and filing dates 25-60 days later.
function buildFilingSchedule(dates, c, o) {
  const rng = makeRng(o.seed, 'filings');
  const S = dates.length;
  const company = [];
  const periodEnd = [];
  const periodEndIdx = [];
  const filingIdx = [];
  const fiscalQ = [];
  const start = new Int32Array(c.N);
  const end = new Int32Array(c.N);
  const firstYear = Number(dates[0].slice(0, 4)) - 1;
  const lastDate = dates[S - 1];
  const schedCompany = [];
  const schedDate = [];
  const schedIdx = [];
  for (let i = 0; i < c.N; i++) {
    start[i] = company.length;
    const listDate = dates[c.listIdx[i]];
    for (let y = firstYear; y <= Number(lastDate.slice(0, 4)); y++) {
      for (let qq = 0; qq < 4; qq++) {
        const month = qq * 3 + 3 + c.fiscalOffset[i]; // 3,6,9,12 (+offset)
        const yy = y + Math.floor((month - 1) / 12);
        const mm = ((month - 1) % 12) + 1;
        const last = new Date(Date.UTC(yy, mm, 0)).getUTCDate();
        const pe = `${yy}-${String(mm).padStart(2, '0')}-${String(last).padStart(2, '0')}`;
        if (pe <= listDate) continue;
        const lag = qq === 3 ? 45 + Math.floor(rng.u() * 16) : 25 + Math.floor(rng.u() * 21);
        let fd = addDays(pe, lag);
        if (!isTradingDay(fd)) fd = nextTradingDay(fd);
        const pei = idxOnOrBefore(dates, pe);
        if (pei < c.listIdx[i]) continue;
        // the public earnings calendar (announcement = filing date), including dates after the end
        if (fd <= addDays(lastDate, 150)) {
          schedCompany.push(i);
          schedDate.push(fd);
          schedIdx.push(fd <= lastDate ? idxOnOrAfter(dates, fd) : S - 1 + countTradingDays(lastDate, fd));
        }
        if (fd > lastDate) continue;
        const fi = idxOnOrAfter(dates, fd);
        company.push(i);
        periodEnd.push(pe);
        periodEndIdx.push(pei);
        filingIdx.push(fi);
        fiscalQ.push(qq + 1);
      }
    }
    end[i] = company.length;
  }
  const F = company.length;
  const sStart = new Int32Array(c.N);
  const sEnd = new Int32Array(c.N);
  for (let k = 0, i = -1; k <= schedCompany.length; k++) {
    const ci = k < schedCompany.length ? schedCompany[k] : -1;
    if (ci !== i) {
      if (i >= 0) sEnd[i] = k;
      if (ci >= 0) sStart[ci] = k;
      i = ci;
    }
  }
  return {
    F,
    schedule: { company: Int32Array.from(schedCompany), date: schedDate, idx: Int32Array.from(schedIdx), start: sStart, end: sEnd },
    company: Int32Array.from(company),
    periodEnd,
    periodEndIdx: Int32Array.from(periodEndIdx),
    filingIdx: Int32Array.from(filingIdx),
    fiscalQ: Uint8Array.from(fiscalQ),
    start,
    end,
    // recorded during the simulation
    x: new Float64Array(F),
    pay: new Float64Array(F),
    ls: new Float64Array(F),
    ss: new Float64Array(F),
    shares: new Float64Array(F),
    u: new Float64Array(F),
    eta: new Float64Array(F),
    margin: new Float64Array(F),
    priceAtFiling: new Float64Array(F),
    filed: new Uint8Array(F),
  };
}

// Short-interest settlement days (15th and month end, or the trading day before) and
// publication 8 trading days later.
function buildShortSchedule(dates) {
  const S = dates.length;
  const settle = [];
  for (let t = 0; t < S; t++) {
    const d = dates[t];
    const next = t + 1 < S ? dates[t + 1] : null;
    const day = Number(d.slice(8, 10));
    const isMonthEnd = !next || next.slice(5, 7) !== d.slice(5, 7);
    const isMid = day <= 15 && (!next || Number(next.slice(8, 10)) > 15 || next.slice(5, 7) !== d.slice(5, 7));
    if (isMonthEnd || isMid) settle.push(t);
  }
  return settle.map((t) => ({ settle: t, publish: t + 8 }));
}

// ---- the daily simulation ------------------------------------------------------------------------

export function simulateMarket(options = {}) {
  const o = { ...SIM_DEFAULTS, ...options, params: { ...(options.params || {}) } };
  const H = { ...HIDDEN, ...o.params };
  const dates = tradingDaysBetween(o.simStart, o.end);
  const S = dates.length;
  const s0 = idxOnOrAfter(dates, o.modelStart);
  const mk = buildMarketPath(dates, o.seed);
  const sec = buildSectorPaths(dates, o.seed, mk);
  const eurusd = buildEurusd(dates, o.seed);
  const sch = buildSchedules(dates, o.seed);
  const c = buildCompanies(dates, o);
  const N = c.N;
  const fl = buildFilingSchedule(dates, c, o);
  const shortSched = buildShortSchedule(dates);

  const open = new Float64Array(S * N).fill(NaN);
  const close = new Float64Array(S * N).fill(NaN);
  const volume = new Float32Array(S * N).fill(NaN);
  const sharesArr = new Float32Array(S * N).fill(NaN);
  const mcap = new Float64Array(S * N).fill(NaN);
  const adv60 = new Float32Array(S * N).fill(NaN);
  const eligible = new Uint8Array(S * N);
  const dtcPub = new Float32Array(S * N).fill(NaN);
  const dollarVol = new Float64Array(S * N);

  // state
  const alive = new Uint8Array(N);
  const X = new Float64Array(N);
  const M = new Float64Array(N);
  const Rv = new Float64Array(N); // transient price component (short-term reversal)
  const mu = new Float64Array(N);
  const v = new Float64Array(N);
  const theta = new Float64Array(N);
  const shares = new Float64Array(N);
  const lastClose = new Float64Array(N);
  const nDays = new Int32Array(N);
  const advSum = new Float64Array(N);
  const peadRate = new Float64Array(N);
  const peadEnd = new Int32Array(N);
  const newsRate = new Float64Array(N);
  const newsEnd = new Int32Array(N);
  const insRate = new Float64Array(N);
  const insEnd = new Int32Array(N);
  const jumpNext = new Float64Array(N); // overnight jump at the next open (log)
  const volBoostNext = new Float64Array(N).fill(1);
  const distressed = new Uint8Array(N);
  const distressEnd = new Int32Array(N);
  const distressRecover = new Uint8Array(N);
  const pending = new Uint8Array(N);
  const dealPrice = new Float64Array(N);
  const dealAnn = new Int32Array(N);
  const dealEnd = new Int32Array(N);
  const dealBreak = new Int32Array(N).fill(-1);
  const spread0 = new Float64Array(N);
  const preDeal = new Float64Array(N);
  const preDealL = new Float64Array(N);
  const marginOU = new Float64Array(N);
  const lastU = new Float64Array(N);
  const payY = new Float64Array(N); // net payout yield per year (updated monthly)
  const payL = new Float64Array(N); // cumulative log payout since listing (scales the fundamentals)
  let payRef = NaN; // median market cap of the listed companies at the last monthly update
  const fPtrPE = new Int32Array(N);
  const fPtrFI = new Int32Array(N);
  for (let i = 0; i < N; i++) {
    fPtrPE[i] = fl.start[i];
    fPtrFI[i] = fl.start[i];
  }

  const DIAG_K = 9;
  const diag = o.diagnostics ? { K: DIAG_K, keys: ['mom', 'value', 'quality', 'dtc', 'ivol', 'pead21', 'reversal', 'M', 'mu'], every: 21, data: new Float32Array(Math.ceil(S / 21) * N * DIAG_K).fill(NaN) } : null;
  let rng = makeRng(o.seed, 'daily');
  let rngE = makeRng(o.seed, 'events');
  // Experiments only (off by default, see SIM_DEFAULTS): from `scenarioFrom` the daily and event draws
  // come from the numbered sub-stream `scenario` instead of continuing the main stream.
  const scenarioIdx = o.scenarioFrom ? idxOnOrAfter(dates, o.scenarioFrom) : -1;
  const hc = c; // alias

  const news = { company: [], t: [], negative: [], headline: [] };
  const deals = { company: [], ann: [], end: [], premium: [], broke: [], breakIdx: [] };
  const insider = { company: [], t: [], buyer: [], cluster: [], opportunistic: [] };
  let clusterId = 0;
  const shortNames = c.name.map(shortName);

  const muRho = Math.exp(-(Math.LN2 / H.muHalfLife) * (21 / TD));
  const muInnov = H.sigmaMu * Math.sqrt(1 - muRho * muRho);
  const vRho = 0.9;
  const vInnov = 0.2 * Math.sqrt(1 - vRho * vRho);

  let shortPtr = 0;
  const pendingPubs = []; // {publish, values: Float32Array}
  const lastPub = new Float32Array(N).fill(NaN);
  let ivolP90 = 0.4;
  let ivolMed = 0.25;

  const sqOn = Math.sqrt(0.35);
  const sqId = Math.sqrt(0.65);
  const cM = Math.sqrt(H.mispriceShare);
  const cR = H.transientShare;
  const kR = Math.LN2 / H.transientHalfLife;

  for (let t = 0; t < S; t++) {
    if (t === scenarioIdx) {
      rng = makeRng(o.seed, 'daily', 'scenario', o.scenario);
      rngE = makeRng(o.seed, 'events', 'scenario', o.scenario);
    }
    const year = Number(dates[t].slice(0, 4));
    const maMult = MA_YEAR_MULT[year] ?? 1;
    const base = t * N;
    const mOn = mk.on[t];
    const mId = mk.id[t];
    const volRatio = clip(mk.volS[t] / 0.16, 0.6, 4);
    const volFactor = volRatio ** 0.55;
    const pm = sch.pmom[t];
    const kap = sch.kappa[t];
    const pq = sch.pqual[t];

    // monthly updates of slow latent processes and cross-sectional vol thresholds
    if (t % 21 === 0) {
      const sigs = [];
      for (let i = 0; i < N; i++) {
        if (t === 0 || alive[i]) {
          // latent drift: OU around a quality-linked mean (profitable firms compound for longer)
          const muBar = H.muQuality * H.sigmaMu * hc.q[i];
          const muDev = Math.sqrt(1 - H.muQuality ** 2);
          mu[i] = t === 0 ? muBar + muDev * H.sigmaMu * rng.n() : muBar + muRho * (mu[i] - muBar) + muDev * muInnov * rng.n();
          v[i] = t === 0 ? 0.2 * rng.n() : vRho * v[i] + vInnov * rng.n();
          if (alive[i]) sigs.push(hc.sigBar[i] * Math.exp(v[i]) * (distressed[i] ? 1.8 : 1));
        }
      }
      if (sigs.length > 10) {
        sigs.sort((a, b) => a - b);
        ivolP90 = sigs[Math.floor(sigs.length * 0.9)];
        ivolMed = sigs[Math.floor(sigs.length * 0.5)];
      }
      // payout yields from yesterday's market caps relative to the median listed company
      const caps = [];
      for (let i = 0; i < N; i++) if (alive[i]) caps.push(lastClose[i] * shares[i]);
      if (caps.length > 10) {
        caps.sort((a, b) => a - b);
        payRef = caps[caps.length >> 1];
        for (let i = 0; i < N; i++) if (alive[i]) payY[i] = payoutYield(lastClose[i] * shares[i], payRef, H);
      }
    }
    // short-interest settlement
    let settleToday = false;
    if (shortPtr < shortSched.length && shortSched[shortPtr].settle === t) {
      settleToday = true;
    }
    const settleValues = settleToday ? new Float32Array(N).fill(NaN) : null;

    for (let i = 0; i < N; i++) {
      // listing
      if (!alive[i]) {
        if (hc.listIdx[i] === t && hc.delistIdx[i] < 0) {
          alive[i] = 1;
          X[i] = 0;
          M[i] = hc.m0[i];
          shares[i] = hc.mcap0[i] / hc.p0[i];
          lastClose[i] = hc.p0[i];
          theta[i] = rngE.n();
          if (t > 0) jumpNext[i] = 0.08 + 0.12 * rngE.n(); // IPO first-day pop at the open
          volBoostNext[i] = t > 0 ? 4 : 1;
          payY[i] = payoutYield(hc.mcap0[i], payRef, H);
          payL[i] = 0;
        } else continue;
      }
      const k = hc.sector[i];
      const sig = hc.sigBar[i] * Math.exp(v[i]) * volFactor * (distressed[i] ? 1.8 : 1);
      const sd = sig / Math.sqrt(TD);
      const scale = sig / 0.28;
      const zOn = rng.n();
      const zId = rng.n();
      const zV = rng.n();
      let rOn;
      let rId;
      if (pending[i]) {
        // merger arbitrage: price pinned to the deal, spread decays to zero by completion
        const left = (dealEnd[i] - t) / Math.max(1, dealEnd[i] - dealAnn[i]);
        const target = dealPrice[i] * (1 - spread0[i] * left);
        const po = target * Math.exp(0.002 * zOn + 0.1 * (mOn));
        const pc = target * Math.exp(0.003 * zId + 0.1 * (mOn + mId) * 0.5);
        rOn = Math.log(po / lastClose[i]);
        rId = Math.log(pc / po);
        if (t === dealEnd[i]) {
          rId = Math.log(dealPrice[i] / po);
        }
        if (t === dealBreak[i]) {
          // deal breaks: back to the stand-alone value, adjusted for the market since announcement
          const standalone = preDeal[i] * Math.exp((mk.L[t] - preDealL[i]) * hc.beta[i] - 0.03 + 0.04 * zOn);
          rOn = Math.log(standalone / lastClose[i]);
          rId = sd * sqId * zId;
          pending[i] = 0;
          dealBreak[i] = -1;
        }
      } else {
        const hLow = sig < ivolMed * volFactor ? H.momLowIvol : H.momHighIvol;
        let a = pm * hLow * mu[i];
        a += pq * H.qualityPremium * hc.q[i] * (hc.levLow[i] ? 1 : H.qualityHighLev);
        if (theta[i] > 1) a -= H.dtcAlpha * (theta[i] - 1);
        if (sig > ivolP90 * volFactor) a -= H.ivolAlpha;
        if (distressed[i]) a -= 0.8;
        // uniform compensation for the expected cost of base-rate negative news and of the veto
        // alphas, so the average stock tracks the market (only the conditional parts are alpha)
        a += H.negNewsRate * (0.035 * scale + H.newsDrift) + H.ivolAlpha * 0.1 + H.dtcAlpha * 0.083;
        let aDay = a / TD;
        if (t <= peadEnd[i]) aDay += peadRate[i];
        if (t <= newsEnd[i]) aDay += newsRate[i];
        if (t <= insEnd[i]) aDay += insRate[i];
        const dM = (-kap * (M[i] + H.mQuality * hc.q[i])) / TD;
        const dR = -kR * Rv[i];
        if (diag && t % 21 === 0) {
          const o = ((t / 21) * N + i) * DIAG_K;
          diag.data[o] = pm * hLow * mu[i];
          diag.data[o + 1] = -kap * (M[i] + H.mQuality * hc.q[i]);
          diag.data[o + 2] = pq * H.qualityPremium * hc.q[i] * (hc.levLow[i] ? 1 : H.qualityHighLev);
          diag.data[o + 3] = theta[i] > 1 ? -H.dtcAlpha * (theta[i] - 1) : 0;
          diag.data[o + 4] = sig > ivolP90 * volFactor ? -H.ivolAlpha : 0;
          diag.data[o + 5] = t <= peadEnd[i] ? peadRate[i] * Math.min(21, peadEnd[i] - t + 1) * 12 : 0;
          diag.data[o + 6] = -kR * Rv[i] * 1.44 * H.transientHalfLife * 12;
          diag.data[o + 7] = M[i];
          diag.data[o + 8] = mu[i];
        }
        const eOn = sd * sqOn * zOn;
        const eId = sd * sqId * zId;
        const jump = jumpNext[i];
        rOn = hc.beta[i] * mOn + hc.gload[i] * sec.on[k * S + t] + eOn + jump + aDay * 0.5 + dM * 0.5 + dR * 0.5;
        rId = hc.beta[i] * mId + hc.gload[i] * sec.id[k * S + t] + eId + aDay * 0.5 + dM * 0.5 + dR * 0.5;
        const eps = eOn + eId;
        M[i] += dM + cM * eps;
        Rv[i] += dR + cR * eps;
        X[i] += (1 - cM - cR) * eps + aDay + jump;
      }
      jumpNext[i] = 0;
      let o_ = lastClose[i] * Math.exp(rOn);
      let cl = o_ * Math.exp(rId);
      if (t === 0) {
        o_ = hc.p0[i];
        cl = hc.p0[i];
      }
      open[base + i] = o_;
      close[base + i] = cl;
      lastClose[i] = cl;
      if (t > 0) {
        // capital paid out (or raised) today: the total-return price is unchanged, the share count is not
        const dp = payY[i] / TD;
        shares[i] *= Math.exp(-dp);
        payL[i] -= dp;
      }
      const absR = Math.abs(rOn + rId) / Math.max(sd, 1e-4);
      const vb = volBoostNext[i];
      volBoostNext[i] = 1;
      const vol = shares[i] * hc.tau[i] * Math.exp(0.33 * zV - 0.055) * (0.75 + 0.25 * Math.min(absR, 6)) * vb * volRatio ** 0.3 * (distressed[i] ? 1.5 : 1) * (pending[i] ? 1.3 : 1);
      volume[base + i] = vol;
      sharesArr[base + i] = shares[i];
      const mc = cl * shares[i];
      mcap[base + i] = mc;
      const dv = vol * cl;
      dollarVol[base + i] = dv;
      advSum[i] += dv;
      nDays[i]++;
      if (nDays[i] > 60) advSum[i] -= dollarVol[(t - 60) * N + i];
      const adv = nDays[i] >= 60 ? advSum[i] / 60 : NaN;
      adv60[base + i] = adv;
      if (cl > 5 && mc > 2e9 && adv > 25e6) eligible[base + i] = 1;

      // ---- fundamentals: period end and filing ----
      let fp = fPtrPE[i];
      while (fp < fl.end[i] && fl.periodEndIdx[fp] < t) fp++;
      if (fp < fl.end[i] && fl.periodEndIdx[fp] === t) {
        const u = H.surpriseAr * lastU[i] + H.surpriseMu * (mu[i] / H.sigmaMu) + Math.sqrt(1 - H.surpriseAr ** 2 - H.surpriseMu ** 2) * rngE.n();
        fl.u[fp] = u;
        fl.eta[fp] = rngE.n();
        marginOU[i] = 0.7 * marginOU[i] + 0.06 * rngE.n() + 0.03 * u;
        fl.margin[fp] = marginOU[i];
        fl.x[fp] = X[i];
        fl.pay[fp] = payL[i];
        fl.ls[fp] = mk.Ls[t];
        fl.ss[fp] = sec.Ss[k * S + t];
        lastU[i] = u;
        fp++;
      }
      fPtrPE[i] = fp;
      let ff = fPtrFI[i];
      while (ff < fl.end[i] && fl.filingIdx[ff] < t) ff++;
      if (ff < fl.end[i] && fl.filingIdx[ff] === t && fl.periodEndIdx[ff] >= hc.listIdx[i]) {
        const u = fl.u[ff];
        // unpriced fundamental shock: fundamentals move, the price does not (value signal)
        const f = H.unpricedSd * rngE.n() + H.unpricedMu * (mu[i] / H.sigmaMu);
        X[i] += f;
        M[i] -= f;
        fl.x[ff] += f;
        fl.shares[ff] = shares[i];
        fl.priceAtFiling[ff] = cl;
        fl.filed[ff] = 1;
        if (!pending[i]) {
          jumpNext[i] = scale * (H.earnJump * u + 0.025 * rngE.n());
          const sf = clip(1.5 * (mc / 5e9) ** -0.25, 0.3, 2);
          peadRate[i] = (sch.ppead[t] * H.peadTotal * sf * u) / 60;
          peadEnd[i] = t + 60;
          volBoostNext[i] = 2.6;
        }
        shares[i] *= Math.exp(-0.004 + 0.01 * rngE.n());
        ff++;
      }
      fPtrFI[i] = ff;

      // ---- short interest settlement ----
      if (settleToday) {
        theta[i] = 0.85 * theta[i] + 0.527 * rngE.n();
        settleValues[i] = Math.exp(hc.dtcMu[i] + 0.55 * theta[i] + 0.15 * rngE.n());
      }

      // ---- events (after the close) ----
      if (t > 0 && t < S - 1) {
        const ev = rngE.u();
        const hMA = pending[i] || distressed[i] || nDays[i] < 250 ? 0 : (0.0075 * maMult * (mc < 1.6e9 ? 32 : mc < 10e9 ? 1.6 : mc < 30e9 ? 1.0 : 0.4) * (1 + 0.5 * Math.max(0, -M[i] / 0.2))) / TD;
        const hDis = pending[i] || distressed[i] ? 0 : (0.0012 * sch.distress[t] * (hc.lev[i] > 0.4 ? 3 : 1) * (hc.q[i] < -1 ? 2.5 : 1) * (mc < 1.5e9 ? 5 : mc < 3e9 ? 2 : 1)) / TD;
        const hNeg = pending[i] ? 0 : (H.negNewsRate * (0.6 + Math.max(0, theta[i])) * (distressed[i] ? 4 : 1)) / TD;
        const hNeu = 1.0 / TD;
        const hIns = pending[i] ? 0 : (0.25 * (mu[i] > H.sigmaMu ? 2.5 : 1)) / TD;
        const hInsR = 0.4 / TD;
        let acc = hMA;
        if (ev < acc) {
          // M&A announcement after the close
          const prem = 0.15 + 0.3 * rngE.u();
          pending[i] = 1;
          dealPrice[i] = cl * (1 + prem);
          dealAnn[i] = t;
          dealEnd[i] = Math.min(t + rngE.int(60, 180), S + 400);
          spread0[i] = 0.02 + 0.04 * rngE.u();
          preDeal[i] = cl;
          preDealL[i] = mk.L[t];
          const broke = rngE.u() < 0.08;
          dealBreak[i] = broke ? t + rngE.int(20, Math.max(21, dealEnd[i] - t - 5)) : -1;
          volBoostNext[i] = 7;
          deals.company.push(i);
          deals.ann.push(t);
          deals.end.push(dealEnd[i]);
          deals.premium.push(prem);
          deals.broke.push(broke ? 1 : 0);
          deals.breakIdx.push(dealBreak[i]);
          peadEnd[i] = -1;
          newsEnd[i] = -1;
        } else if (ev < (acc += hDis)) {
          distressed[i] = 1;
          distressEnd[i] = t + rngE.int(120, 320);
          distressRecover[i] = rngE.u() < 0.25 ? 1 : 0;
        } else if (ev < (acc += hNeg)) {
          const sev = 0.5 + 0.5 * rngE.e();
          jumpNext[i] += -Math.min(0.3, (0.01 + 0.025 * rngE.e()) * scale);
          newsRate[i] = (-H.newsDrift * sev) / 10;
          newsEnd[i] = t + 10;
          volBoostNext[i] = Math.max(volBoostNext[i], 2.2);
          news.company.push(i);
          news.t.push(t);
          news.negative.push(1);
          news.headline.push(fillHeadline(rngE.pick(NEGATIVE_TEMPLATES), shortNames[i]));
        } else if (ev < (acc += hNeu)) {
          news.company.push(i);
          news.t.push(t);
          news.negative.push(0);
          news.headline.push(fillHeadline(rngE.pick(NEUTRAL_TEMPLATES), shortNames[i]));
        } else if (ev < (acc += hIns)) {
          const nb = rngE.int(2, 5);
          clusterId++;
          let last = t;
          for (let b = 0; b < nb; b++) {
            const tb = Math.min(S - 1, t + rngE.int(0, 9));
            last = Math.max(last, tb);
            insider.company.push(i);
            insider.t.push(tb);
            insider.buyer.push(b);
            insider.cluster.push(clusterId);
            insider.opportunistic.push(1);
          }
          insRate[i] = H.insiderDrift / 63;
          insEnd[i] = last + 63;
        } else if (ev < (acc += hInsR)) {
          insider.company.push(i);
          insider.t.push(t);
          insider.buyer.push(0);
          insider.cluster.push(-1);
          insider.opportunistic.push(0);
        }
      }

      // ---- delistings ----
      if (pending[i] && t === dealEnd[i]) {
        alive[i] = 0;
        pending[i] = 0;
        hc.delistIdx[i] = t;
        hc.delistReason[i] = 'acquired';
        hc.delistReturn[i] = 0;
      } else if (distressed[i] && t >= distressEnd[i]) {
        if (distressRecover[i]) distressed[i] = 0;
        else {
          alive[i] = 0;
          distressed[i] = 0;
          hc.delistIdx[i] = t;
          hc.delistReason[i] = 'bankruptcy';
          if (rngE.u() < 0.55) {
            hc.delistReturn[i] = -0.3;
            hc.delistReturnImputed[i] = 1;
          } else hc.delistReturn[i] = -0.1 - 0.75 * rngE.u();
        }
      }
    }
    if (settleToday) {
      pendingPubs.push({ publish: shortSched[shortPtr].publish, values: settleValues });
      shortPtr++;
    }
    while (pendingPubs.length && pendingPubs[0].publish <= t) {
      const p = pendingPubs.shift();
      for (let i = 0; i < N; i++) if (p.values[i] === p.values[i]) lastPub[i] = p.values[i];
    }
    for (let i = 0; i < N; i++) if (alive[i] || hc.delistIdx[i] === t) dtcPub[base + i] = lastPub[i];
  }

  const filings = buildFundamentals({ fl, c, dates, S, N, mk, sec });

  return {
    kind: 'quorum-sim-market',
    opts: o,
    // null unless an experiment switched the draws to a numbered sub-stream (never in the default run)
    scenarioSwitch: scenarioIdx >= 0 && scenarioIdx < S ? { from: dates[scenarioIdx], scenario: o.scenario } : null,
    hidden: H,
    dates,
    S,
    N,
    s0,
    sectors: SECTORS,
    companies: c,
    open,
    close,
    volume,
    shares: sharesArr,
    mcap,
    adv60,
    eligible,
    dtcPub,
    bench: { name: 'S&P 500 TR (simulated)', open: mk.open, close: mk.close },
    sectorIndex: { open: sec.open, close: sec.close },
    eurusd,
    filings,
    news: {
      company: Int32Array.from(news.company),
      t: Int32Array.from(news.t),
      negative: Uint8Array.from(news.negative),
      headline: news.headline,
    },
    deals: {
      company: Int32Array.from(deals.company),
      ann: Int32Array.from(deals.ann),
      end: Int32Array.from(deals.end),
      premium: Float64Array.from(deals.premium),
      broke: Uint8Array.from(deals.broke),
      breakIdx: Int32Array.from(deals.breakIdx),
    },
    insider: {
      company: Int32Array.from(insider.company),
      t: Int32Array.from(insider.t),
      buyer: Int32Array.from(insider.buyer),
      cluster: Int32Array.from(insider.cluster),
      opportunistic: Uint8Array.from(insider.opportunistic),
    },
    shortSchedule: shortSched,
    schedules: sch,
    marketVol: mk.vol,
    diag,
  };
}
