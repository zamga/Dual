// buildModel(opts) -> Promise<Model>: the single object the backtest, validation, sealed record and
// export consume. Everything is deterministic from the seed (default 20260928).
//
// Index conventions (read this first):
// - Model day index t runs over `dates` (NYSE trading days 2008-01-02 .. 2026-09-28 by default).
//   Stock index i runs over `companies`. Every T x N array is row-major: arr[t * N + i].
// - Family percentiles at t use information up to and including the US close of dates[t]. The issue
//   that uses them is dated dates[t + 1] (14:00 Ljubljana, before the open) and enters at
//   open[t + 1]; the 21-day exit is open[t + 22]. holdReturn(i, t + 1, t + 22) computes that return
//   (delisting proceeds included).
// - vetoFlags(t, i), drivers(t, i) and insider(t, i) are "as of the close of dates[t]".
//
// Model fields
//   dates: string[T]; T; N; dStart: 0 (D is scored from the first model day)
//   periods: { research: [from, to], holdout: [from, to], freeze, sealed: [from, to], history }
//   companies[N]: { idx, ticker, name, sector, sectorSl, sectorIdx, isin, figi, venue, listDate,
//                   delistDate|null, delistReason: 'acquired'|'bankruptcy'|null,
//                   delistReturn|null (0 for acquisitions: the last close is the deal price;
//                   bankruptcies about -0.30), delistReturnImputed|null, fictional: true }
//   open, close, mcap: Float64Array(T*N)   (NaN when not listed; prices are total-return adjusted)
//   volume, shares, adv60: Float32Array(T*N); eligible: Uint8Array(T*N) (price>$5, mcap>$2B, ADV60>$25M)
//   benchmark: { name: 'S&P 500 TR (simulated)', open: Float64Array(T), close: Float64Array(T) }
//   sectorIndex: { names[11], namesSl[11], open: Float64Array(T)[11], close: Float64Array(T)[11] }
//   eurusd: Float64Array(T) (USD per EUR at the close)
//   pct: { A, B, C, D }: Float32Array(T*N) percentiles in (0, 1); NaN when not scored (ineligible or
//        missing inputs). Top decile = pct >= 0.9.
//   families: { A|B|C|D: { name: {en, sl}, def: {en, sl} } }
//   crashSwitch: Uint8Array(T) (1 = A suspended); crashPeriods: [[from, to]]; crashRule
//   vetoFlags(t, i) -> { daysToCover, dtcTopDecile, idioVol, ivolTopDecile, earningsWithin3d,
//        nextEarnings, pendingMA, newsNegative48h, headline, headlines[{date, headline, negative}],
//        llmStandIn: true, any }
//   drivers(t, i) -> { A|B|C|D: [{ key, label: {en, sl}, value (z-score), unit: 'z',
//        raw: { value, unit[, evEbit] }, [context: true], [weight (D)] }] }
//   insider(t, i) -> { cluster, buyers, lastBuy, windowDays: 63, opportunisticOnly: true }
//   holdReturn(i, tEntry, tExit) (open to open); benchReturn(tEntry, tExit); oneWayCost(t, i)
//   experiments: every D configuration tried [{ id, params, features, cv, metric: { value, icir,
//        byFold }, monthly: [['YYYY-MM', top-decile excess vs benchmark, gross]] }]
//   trainingLog: cv-selection, independence-check(s), final, one walk-forward entry per model
//   dModel: { params, features, excludedFamilies, cvIC, frozen }
//   diagnostics: eligible range, monthly ICs, correlations, 3-of-4 hit rates, crash periods
//   featureDefs, hiddenParams, timings, cacheKey
//   internals: { market (the full simulation incl. warm-up: filings, news, deals, short interest),
//                store (rank-feature store), simOffset } -- diagnostics and display only; never
//                feed hidden fields into picks.
import { simulateMarket, SIM_DEFAULTS, HIDDEN } from './sim/market.js';
import { SECTORS_SL } from './sim/regimes.js';
import { standInIsNegative } from './sim/headlines.js';
import { computeFeatures, FEATURES, FEATURE_INDEX, FAMILY_INPUTS, rawFeaturesAt, qToRank, nextScheduledEarnings } from './features.js';
import { crashSwitchSeries, crashPeriods, CRASH_RULE } from './families/trend.js';
import { runMlFamily, ML_DEFAULTS } from './families/ml.js';
import { holdReturn as holdReturnSim, benchReturn as benchReturnSim, oneWayCost } from './returns.js';
import { rankToZ, spearman, mean, quantile } from './lib/stats.js';
import { sourceHash, cacheKey, loadCache, saveCache, DEFAULT_CACHE_DIR } from './cache.js';

export const ENGINE_VERSION = '1.0.0';

export const FAMILY_META = Object.freeze({
  A: { name: { en: 'Trend', sl: 'Trend' }, def: { en: 'Residual 12-1 momentum, volatility-scaled', sl: 'Rezidualni momentum 12-1, prilagojen volatilnosti' } },
  B: { name: { en: 'Fundamental momentum', sl: 'Fundamentalni momentum' }, def: { en: 'Earnings surprise by filing date and the year-on-year change in gross profitability', sl: 'Presenečenje pri dobičku po datumu poročila in medletna sprememba bruto donosnosti' } },
  C: { name: { en: 'Quality/value', sl: 'Kakovost/vrednost' }, def: { en: 'Gross profits to assets, EV/EBIT, free-cash-flow yield, intangibles-adjusted book-to-market', sl: 'Bruto dobiček na sredstva, EV/EBIT, donos prostega denarnega toka, knjigovodska/tržna vrednost s prilagoditvijo za neopredmetena sredstva' } },
  D: { name: { en: 'ML ranker', sl: 'Rangirnik ML' }, def: { en: 'Gradient-boosted trees on 24 rank-transformed features, sector-relative 21-day target, averaged over seeds', sl: 'Gradientno ojačana drevesa na 24 rangiranih značilkah, cilj: 21-dnevni donos glede na sektor, povprečje več semen' } },
});

export const SMALL_UNIVERSE = Object.freeze({
  sim: { simStart: '2011-01-03', modelStart: '2014-01-02', end: '2019-12-31', nInitial: 150, ipoScale: 0.1, scenarioFrom: null },
  ml: { researchEnd: '2017-09-29', freeze: '2018-09-28', cvConfigs: 2, cvFolds: 4, cvEvery: 10, checkpoints: [20, 40], seeds: [11, 23], workers: 2 },
});

const PERIODS_FULL = { researchEnd: '2022-09-30', holdoutStart: '2022-10-03', freeze: '2025-09-30', sealedStart: '2025-10-01' };

/**
 * @param {object} opts
 *   seed (20260928), universe ('full' | 'small'), sim (overrides for simulateMarket), ml (overrides
 *   for the D pipeline), cache (true: read/write engine/.cache), cacheDir, verbose
 * @returns {Promise<Model>}
 */
export async function buildModel(opts = {}) {
  const started = Date.now();
  const universe = opts.universe || 'full';
  const base = universe === 'small' ? SMALL_UNIVERSE : { sim: {}, ml: {} };
  const seed = opts.seed ?? SIM_DEFAULTS.seed;
  const simOpts = { ...base.sim, ...(opts.sim || {}), seed };
  const mlOpts = { ...ML_DEFAULTS, ...base.ml, ...(opts.ml || {}), seed };
  const log = (msg) => opts.verbose && console.log(`[engine ${((Date.now() - started) / 1000).toFixed(1)}s] ${msg}`);
  const timings = {};
  let t0 = Date.now();

  const market = simulateMarket(simOpts);
  timings.simMs = Date.now() - t0;
  log(`market: ${market.N} companies, ${market.S} sim days`);
  t0 = Date.now();
  const store = computeFeatures(market, {});
  timings.featuresMs = Date.now() - t0;
  log(`features: ${store.R} rows over ${store.D} dates`);

  // ---- D (cached) ----
  t0 = Date.now();
  const useCache = opts.cache !== false;
  const cacheDir = opts.cacheDir || DEFAULT_CACHE_DIR;
  const key = cacheKey({ v: ENGINE_VERSION, src: useCache ? sourceHash() : '', simOpts, mlOpts: { ...mlOpts, verbose: undefined, workers: undefined } });
  let ml = null;
  let cacheHit = false;
  if (useCache) {
    const c = loadCache(cacheDir, key);
    if (c) {
      ml = { ...c.json, pctD: c.arrays.pctD };
      if (c.arrays.cvPreds) ml.cvOof = { ...c.json.cvOofMeta, stock: c.arrays.cvStock, t: c.arrays.cvT, preds: c.arrays.cvPreds };
      cacheHit = true;
    }
  }
  if (!ml) {
    ml = await runMlFamily(market, store, store.pct, { ...mlOpts, verbose: opts.verbose });
    if (useCache) {
      const { pctD, frozenModel, cvOof, ...json } = ml;
      saveCache(cacheDir, key, {
        json: { ...json, frozenModel: serialiseTrees(frozenModel), cvOofMeta: cvOof ? { nExp: cvOof.nExp, n: cvOof.n } : null },
        arrays: cvOof ? { pctD, cvStock: cvOof.stock, cvT: cvOof.t, cvPreds: cvOof.preds } : { pctD },
      });
    }
  }
  timings.mlMs = Date.now() - t0;
  timings.cacheHit = cacheHit;
  log(`D: ${cacheHit ? 'from cache' : 'trained'}`);

  const model = assemble(market, store, ml, { seed, universe, simOpts, mlOpts, timings, cacheKey: key });
  t0 = Date.now();
  model.diagnostics = computeDiagnostics(model);
  timings.diagnosticsMs = Date.now() - t0;
  timings.totalMs = Date.now() - started;
  log(`done in ${(timings.totalMs / 1000).toFixed(1)}s`);
  return model;
}

function serialiseTrees(model) {
  if (!model) return null;
  return {
    F: model.F,
    shift: model.shift,
    base: model.base,
    params: model.params,
    trees: model.trees.map((t) => ({ code: Array.from(t.code), value: Array.from(t.value) })),
  };
}

function assemble(market, store, ml, meta) {
  const m = market;
  const s0 = m.s0;
  const N = m.N;
  const S = m.S;
  const T = S - s0;
  const dates = m.dates.slice(s0);
  const view = (arr) => arr.subarray(s0 * N);
  const c = m.companies;
  const companies = [];
  for (let i = 0; i < N; i++) {
    companies.push({
      idx: i,
      ticker: c.ticker[i],
      name: c.name[i],
      sector: m.sectors[c.sector[i]],
      sectorSl: SECTORS_SL[c.sector[i]],
      sectorIdx: c.sector[i],
      isin: c.isin[i],
      figi: c.figi[i],
      venue: c.venue[i],
      listDate: c.listDate[i],
      delistDate: c.delistIdx[i] >= 0 ? m.dates[c.delistIdx[i]] : null,
      delistReason: c.delistReason[i],
      delistReturn: c.delistIdx[i] >= 0 ? c.delistReturn[i] : null,
      delistReturnImputed: c.delistIdx[i] >= 0 ? Boolean(c.delistReturnImputed[i]) : null,
      fictional: true,
    });
  }
  const crashSim = crashSwitchSeries(m.bench.close);
  const crashSwitch = crashSim.slice(s0);
  const K = m.sectors.length;
  const sectorIndex = {
    names: m.sectors,
    namesSl: SECTORS_SL,
    open: Array.from({ length: K }, (_, k) => m.sectorIndex.open.subarray(k * S + s0, (k + 1) * S)),
    close: Array.from({ length: K }, (_, k) => m.sectorIndex.close.subarray(k * S + s0, (k + 1) * S)),
  };
  const lastDate = dates[T - 1];
  const periods = periodsFor(meta.mlOpts, dates);

  // ---- lookups for the accessors ----
  const newsByCo = Array.from({ length: N }, () => []);
  for (let k = 0; k < m.news.t.length; k++) newsByCo[m.news.company[k]].push(k);
  const insByCo = Array.from({ length: N }, () => []);
  for (let k = 0; k < m.insider.t.length; k++) if (m.insider.opportunistic[k]) insByCo[m.insider.company[k]].push(k);
  for (const l of insByCo) l.sort((a, b) => m.insider.t[a] - m.insider.t[b]);
  const dealsByCo = Array.from({ length: N }, () => []);
  for (let k = 0; k < m.deals.company.length; k++) dealsByCo[m.deals.company[k]].push(k);
  const decileCache = new Map();
  const dOfSim = new Map();
  for (let d = 0; d < store.D; d++) dOfSim.set(store.dates[d], d);

  function thresholds(t) {
    let th = decileCache.get(t);
    if (th) return th;
    const ts = t + s0;
    const dtc = [];
    const iv = [];
    for (let i = 0; i < N; i++) {
      if (!m.eligible[ts * N + i]) continue;
      const a = m.dtcPub[ts * N + i];
      if (a === a) dtc.push(a);
      const b = store.ivol[t * N + i];
      if (b === b) iv.push(b);
    }
    th = { dtc90: quantile(dtc, 0.9), ivol90: quantile(iv, 0.9) };
    if (decileCache.size > 4000) decileCache.clear();
    decileCache.set(t, th);
    return th;
  }

  // next scheduled earnings date (the calendar is public; it may lie after the last data date)
  function nextEarnings(i, ts) {
    const k = nextScheduledEarnings(m.filings, i, ts);
    return k < 0 ? null : { idx: m.filings.schedule.idx[k], date: m.filings.schedule.date[k] };
  }

  function storeRow(ts, i) {
    const d = dOfSim.get(ts);
    if (d === undefined) return -1;
    let lo = store.rowStart[d];
    let hi = store.rowStart[d + 1];
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (store.stock[mid] < i) lo = mid + 1;
      else hi = mid;
    }
    return lo < store.rowStart[d + 1] && store.stock[lo] === i ? lo : -1;
  }

  function vetoFlags(t, i) {
    const ts = t + s0;
    const th = thresholds(t);
    const dtc = m.dtcPub[ts * N + i];
    const iv = store.ivol[t * N + i];
    const ne = nextEarnings(i, ts);
    let pendingMA = false;
    for (const k of dealsByCo[i]) {
      const ann = m.deals.ann[k];
      const end = m.deals.end[k];
      const br = m.deals.breakIdx[k];
      if (ann <= ts && ts < end && !(br >= 0 && br <= ts)) pendingMA = true;
    }
    const heads = [];
    for (const k of newsByCo[i]) {
      const nt = m.news.t[k];
      if (nt === ts || nt === ts - 1) heads.push({ date: m.dates[nt], headline: m.news.headline[k], negative: standInIsNegative(m.news.headline[k]) });
    }
    heads.sort((a, b) => (a.date < b.date ? 1 : -1));
    const neg = heads.find((h) => h.negative);
    const flags = {
      daysToCover: dtc === dtc ? round(dtc, 2) : null,
      dtcTopDecile: dtc === dtc && th.dtc90 === th.dtc90 ? dtc >= th.dtc90 : false,
      idioVol: iv === iv ? round(iv, 4) : null,
      ivolTopDecile: iv === iv && th.ivol90 === th.ivol90 ? iv >= th.ivol90 : false,
      earningsWithin3d: ne !== null && ne.idx > ts && ne.idx <= ts + 3,
      nextEarnings: ne ? ne.date : null,
      pendingMA,
      newsNegative48h: Boolean(neg),
      headline: neg ? neg.headline : heads.length ? heads[0].headline : null,
      headlines: heads,
      llmStandIn: true,
    };
    flags.any = flags.dtcTopDecile || flags.ivolTopDecile || flags.earningsWithin3d || flags.pendingMA || flags.newsNegative48h;
    return flags;
  }

  function driverEntry(key, row, raw) {
    const j = FEATURE_INDEX[key];
    const z = row >= 0 ? rankToZ(qToRank(store.q[row * store.F + j])) : null;
    const f = FEATURES[j];
    const rv = raw[j];
    const out = { key, label: f.label, value: z === null ? null : round(z, 2), unit: 'z', raw: { value: rv === rv ? round(rv, 4) : null, unit: f.rawUnit } };
    if (key === 'ebit_ev' && rv > 0) out.raw.evEbit = round(1 / rv, 1);
    return out;
  }

  function drivers(t, i) {
    const ts = t + s0;
    const row = storeRow(ts, i);
    const raw = rawFeaturesAt(m, ts, i);
    // A-C: the family's own inputs, strongest first (z-scores from the cross-sectional ranks);
    // A also carries plain 12-1 momentum as context (not part of its score)
    const pick = (keys, n) => keys.map((k) => driverEntry(k, row, raw)).sort((a, b) => (b.value ?? -9) - (a.value ?? -9)).slice(0, n);
    const out = {
      A: [...pick(FAMILY_INPUTS.A, 2), { ...driverEntry('mom_12_1', row, raw), context: true }],
      B: pick(FAMILY_INPUTS.B, 2),
      C: pick(FAMILY_INPUTS.C, 3),
      D: [],
    };
    const prof = ml.profiles.find((p) => ts >= p.from && ts <= p.to);
    if (prof && row >= 0) {
      const contrib = [];
      for (const key of ml.features) {
        const j = FEATURE_INDEX[key];
        const z = rankToZ(qToRank(store.q[row * store.F + j]));
        contrib.push([key, prof.importance[j] * z * Math.sign(prof.direction[j] || 0)]);
      }
      contrib.sort((a, b) => b[1] - a[1]);
      out.D = contrib.slice(0, 3).map(([key, w]) => ({ ...driverEntry(key, row, raw), weight: round(w, 4) }));
    }
    return out;
  }

  // Opportunistic Form-4 buys (routine buyers are filtered out, per Cohen-Malloy-Pomorski).
  // cluster = at least three distinct insiders bought within the last 63 trading days.
  function insider(t, i) {
    const ts = t + s0;
    const who = new Set();
    let last = null;
    for (const k of insByCo[i]) {
      const it = m.insider.t[k];
      if (it > ts) break;
      if (it > ts - 63) {
        who.add(`${m.insider.cluster[k]}:${m.insider.buyer[k]}`);
        last = m.dates[it];
      }
    }
    return { cluster: who.size >= 3, buyers: who.size, lastBuy: last, windowDays: 63, opportunisticOnly: true };
  }

  const model = {
    kind: 'quorum-model',
    engineVersion: ENGINE_VERSION,
    simulated: true,
    seed: meta.seed,
    universe: meta.universe,
    options: { sim: meta.simOpts, ml: { ...meta.mlOpts, verbose: undefined } },
    periods: { ...periods, history: [dates[0], lastDate] },
    dates,
    T,
    N,
    dStart: 0,
    sectors: m.sectors,
    sectorsSl: SECTORS_SL,
    companies,
    open: view(m.open),
    close: view(m.close),
    volume: view(m.volume),
    shares: view(m.shares),
    mcap: view(m.mcap),
    adv60: view(m.adv60),
    eligible: view(m.eligible),
    benchmark: { name: 'S&P 500 TR (simulated)', open: m.bench.open.subarray(s0), close: m.bench.close.subarray(s0) },
    sectorIndex,
    eurusd: m.eurusd.subarray(s0),
    pct: { A: store.pct.A, B: store.pct.B, C: store.pct.C, D: ml.pctD },
    families: FAMILY_META,
    crashSwitch,
    crashPeriods: crashPeriods(crashSwitch, dates),
    crashRule: CRASH_RULE,
    vetoFlags,
    drivers,
    insider,
    holdReturn: (i, tEntry, tExit) => holdReturnSim(m, i, tEntry + s0, tExit + s0),
    benchReturn: (tEntry, tExit) => benchReturnSim(m, tEntry + s0, tExit + s0),
    oneWayCost: (t, i) => oneWayCost(m.mcap[(t + s0) * N + i]),
    experiments: ml.experiments,
    // out-of-fold CV predictions of every experiment: preds[k * n + r] for experiment k and CV row r;
    // rows are (stock[r], simulation day t[r]); model day = t[r] - simOffset. Used by engine/validate.js.
    cvOof: ml.cvOof ? { ...ml.cvOof, simOffset: s0 } : null,
    trainingLog: ml.trainingLog,
    dModel: { params: ml.params, features: ml.features, excludedFamilies: ml.excluded, cvIC: ml.cvIC, frozen: Boolean(ml.frozenModel) },
    featureDefs: FEATURES.map((f) => ({ key: f.key, family: f.family, label: f.label, rawUnit: f.rawUnit })),
    hiddenParams: { ...HIDDEN, ...(meta.simOpts.params || {}) },
    timings: meta.timings,
    cacheKey: meta.cacheKey,
    // internals for advanced use (fundamentals, news, raw market on the simulation timeline)
    internals: { market: m, store, simOffset: s0 },
  };
  return model;
}

function periodsFor(mlOpts, dates) {
  const researchEnd = mlOpts.researchEnd;
  const freeze = mlOpts.freeze;
  const holdoutStart = dates.find((d) => d > researchEnd) || null;
  const sealedStart = dates.find((d) => d > freeze) || null;
  return {
    research: [dates[0], researchEnd],
    holdout: [holdoutStart, freeze],
    freeze,
    sealed: [sealedStart, dates[dates.length - 1]],
    ...(mlOpts.researchEnd === PERIODS_FULL.researchEnd ? {} : { note: 'test universe periods' }),
  };
}

// ---- diagnostics (calibration report) --------------------------------------------------------------

export function computeDiagnostics(model) {
  const { T, N, dates, pct, eligible } = model;
  const fams = ['A', 'B', 'C', 'D'];
  const inPeriod = (d, [a, b]) => d >= a && d <= b;
  const P = model.periods;
  const periods = { research: P.research, holdout: P.holdout, sealed: P.sealed };
  // eligible counts
  let emin = Infinity;
  let emax = 0;
  let eminD = null;
  let emaxD = null;
  for (let t = 0; t < T; t++) {
    let n = 0;
    for (let i = 0; i < N; i++) n += eligible[t * N + i];
    if (n < emin) {
      emin = n;
      eminD = dates[t];
    }
    if (n > emax) {
      emax = n;
      emaxD = dates[t];
    }
  }
  // monthly IC (month-end scores vs 21-day forward open-to-open return) and family correlations
  const icMonthly = [];
  const corrAcc = {};
  for (let t = 0; t + 22 < T; t++) {
    if (dates[t].slice(0, 7) === dates[t + 1].slice(0, 7)) continue;
    const fwd = new Float64Array(N).fill(NaN);
    for (let i = 0; i < N; i++) if (eligible[t * N + i]) fwd[i] = model.holdReturn(i, t + 1, t + 22);
    const row = { month: dates[t].slice(0, 7) };
    for (const f of fams) row[f] = round(spearman(pct[f].subarray(t * N, (t + 1) * N), fwd, N), 4);
    icMonthly.push(row);
    for (let a = 0; a < 4; a++)
      for (let b = a + 1; b < 4; b++) {
        const k = fams[a] + fams[b];
        (corrAcc[k] ||= []).push(spearman(pct[fams[a]].subarray(t * N, (t + 1) * N), pct[fams[b]].subarray(t * N, (t + 1) * N), N));
      }
  }
  const icByPeriod = {};
  for (const [name, range] of Object.entries(periods)) {
    const rows = icMonthly.filter((r) => inPeriod(`${r.month}-15`, [range[0].slice(0, 7) + '-01', range[1]]));
    icByPeriod[name] = { months: rows.length };
    for (const f of fams) icByPeriod[name][f] = round(mean(rows.map((r) => r[f])), 4);
  }
  const corr = [[1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 1, 0], [0, 0, 0, 1]];
  for (let a = 0; a < 4; a++)
    for (let b = a + 1; b < 4; b++) {
      const v = round(mean(corrAcc[fams[a] + fams[b]]), 3);
      corr[a][b] = v;
      corr[b][a] = v;
    }
  // hit rate of stocks with >= 3 of 4 families in the top decile, vs the benchmark, net of costs
  const hit = {};
  for (const [name, range] of Object.entries(periods)) {
    const acc = { raw: [0, 0], crashAware: [0, 0], vetoed: [0, 0], excessSum: 0, monthlyFirst: [0, 0], perMonth: 0 };
    const months = new Set();
    for (let t = 0; t + 22 < T; t++) {
      if (!inPeriod(dates[t], range)) continue;
      const cs = model.crashSwitch[t];
      const firstOfMonth = !months.has(dates[t].slice(0, 7));
      months.add(dates[t].slice(0, 7));
      const b = model.benchReturn(t + 1, t + 22);
      for (let i = 0; i < N; i++) {
        if (!eligible[t * N + i]) continue;
        let k = 0;
        let kNoA = 0;
        for (const f of fams) {
          const v = pct[f][t * N + i];
          if (v >= 0.9) {
            k++;
            if (f !== 'A') kNoA++;
          }
        }
        if (k < 3) continue;
        const r = model.holdReturn(i, t + 1, t + 22);
        if (!(r === r)) continue;
        const cst = model.oneWayCost(t, i);
        const net = ((1 + r) * (1 - cst)) / (1 + cst) - 1;
        const win = net > b ? 1 : 0;
        acc.raw[0] += win;
        acc.raw[1]++;
        acc.excessSum += net - b;
        const crashOk = cs ? kNoA >= 3 : true;
        if (crashOk) {
          acc.crashAware[0] += win;
          acc.crashAware[1]++;
          const v = model.vetoFlags(t, i);
          if (!v.any) {
            acc.vetoed[0] += win;
            acc.vetoed[1]++;
          }
        }
        if (firstOfMonth) {
          acc.monthlyFirst[0] += win;
          acc.monthlyFirst[1]++;
        }
      }
    }
    hit[name] = {
      rawRule: { hit: round(acc.raw[0] / acc.raw[1], 4), n: acc.raw[1], meanExcessNet: round(acc.excessSum / acc.raw[1], 5) },
      withCrashSwitch: { hit: round(acc.crashAware[0] / acc.crashAware[1], 4), n: acc.crashAware[1] },
      withCrashSwitchAndVetoes: { hit: round(acc.vetoed[0] / acc.vetoed[1], 4), n: acc.vetoed[1] },
      firstDayOfMonthOnly: { hit: round(acc.monthlyFirst[0] / acc.monthlyFirst[1], 4), n: acc.monthlyFirst[1] },
      candidatesPerDay: round(acc.raw[1] / Math.max(1, months.size * 21), 2),
      costs: '10 bps one way above $10B market cap, 25 bps for $2-10B',
    };
  }
  // veto effectiveness (research window, month-end scores): mean 21-day excess vs the benchmark
  const vetoKeys = ['dtcTopDecile', 'ivolTopDecile', 'newsNegative48h', 'earningsWithin3d', 'pendingMA'];
  const vacc = Object.fromEntries(vetoKeys.map((k) => [k, { flagged: [0, 0], other: [0, 0] }]));
  for (let t = 0; t + 22 < T; t++) {
    if (dates[t] > P.research[1] || dates[t].slice(0, 7) === dates[t + 1].slice(0, 7)) continue;
    const b = model.benchReturn(t + 1, t + 22);
    for (let i = 0; i < N; i++) {
      if (!eligible[t * N + i]) continue;
      const r = model.holdReturn(i, t + 1, t + 22);
      if (!(r === r)) continue;
      const v = model.vetoFlags(t, i);
      for (const k of vetoKeys) {
        const a = v[k] ? vacc[k].flagged : vacc[k].other;
        a[0] += r - b;
        a[1]++;
      }
    }
  }
  const vetoEffect = Object.fromEntries(
    vetoKeys.map((k) => [k, { flaggedMeanExcess: round(vacc[k].flagged[0] / vacc[k].flagged[1], 5), otherMeanExcess: round(vacc[k].other[0] / vacc[k].other[1], 5), nFlagged: vacc[k].flagged[1] }]),
  );
  return {
    eligible: { min: emin, minDate: eminD, max: emax, maxDate: emaxD },
    vetoEffect,
    icByPeriod,
    icMonthly,
    correlations: { order: fams, matrix: corr },
    hit3of4: hit,
    crashPeriods: model.crashPeriods,
  };
}

function round(x, d = 4) {
  return x === x && x !== null && Number.isFinite(x) ? Math.round(x * 10 ** d) / 10 ** d : null;
}
