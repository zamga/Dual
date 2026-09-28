// Family D: the ML ranker. Histogram GBDT (engine/ml/gbdt.js) on the rank-transformed feature store.
//
// Target: sector-relative rank (to [-1, 1]) of the 21-day forward open-to-open return, entry at the
// open of t+1 and exit at the open of t+22 (delisting proceeds included).
// Training rows: every 5th trading day. Hyperparameters: purged k-fold CV (21-day purge plus a
// one-month embargo) inside the research window only; every configuration tried is logged.
// Independence check: if D's out-of-fold rank correlation with any of A-C exceeds 0.5, D is
// retrained without that family's raw inputs. Walk-forward: expanding window, retrained each year at
// the end of September with a 21-trading-day purge before the cutoff; each model predicts only
// dates after its cutoff; the model trained at the freeze is never retrained.
import { createPool } from '../ml/pool.js';
import { holdReturn, benchReturn } from '../returns.js';
import { rankInto, spearman, mean, std } from '../lib/stats.js';
import { FEATURE_KEYS, FAMILY_INPUTS, FEATURE_INDEX } from '../features.js';
import { makeRng } from '../lib/prng.js';

export const ML_DEFAULTS = Object.freeze({
  researchEnd: '2022-09-30',
  freeze: '2025-09-30',
  horizon: 21,
  purge: 21,
  embargo: 21,
  cvEvery: 20, // CV uses every 20th trading day (a subset of the 5-day training grid) for speed
  cvFolds: 5,
  cvConfigs: 8,
  checkpoints: [40, 80, 120],
  seeds: [11, 23, 37],
  workers: 4,
  corrLimit: 0.5,
  shift: 2, // 256 quantised rank levels -> 64 bins
  seed: 20260928,
});

const SEARCH_SPACE = {
  depth: [3, 4, 5, 6],
  lr: [0.03, 0.05, 0.1],
  minLeaf: [100, 300, 1000],
  lambda: [1, 5, 20],
  rowSample: [0.2, 0.3],
  colSample: [0.5, 0.7],
};
const FIRST_CONFIG = { depth: 4, lr: 0.05, minLeaf: 300, lambda: 5, rowSample: 0.3, colSample: 0.7 };

function lastIdxOnOrBefore(dates, date) {
  let lo = 0;
  let hi = dates.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (dates[mid] <= date) lo = mid + 1;
    else hi = mid;
  }
  return lo - 1;
}

/** First index k in sorted Int32Array `arr` with arr[k] > v (upper bound). */
function upperBound(arr, v, lo = 0, hi = arr.length) {
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (arr[mid] <= v) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

function lowerBound(arr, v, lo = 0, hi = arr.length) {
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (arr[mid] < v) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

function sab(Type, n) {
  return new Type(new SharedArrayBuffer(Type.BYTES_PER_ELEMENT * Math.max(1, n)));
}

/** Targets for every stored date on the training grid; returns shared arrays and row lists. */
export function buildTargets(m, fs, { horizon = 21, trainEvery = fs.trainEvery } = {}) {
  const R = fs.R;
  const y = sab(Float32Array, R).fill(NaN);
  const fwd = new Float32Array(R).fill(NaN);
  const secOf = m.companies.sector;
  const K = m.sectors.length;
  const buckets = Array.from({ length: K }, () => []);
  const list = [];
  for (let d = 0; d < fs.D; d++) {
    const t = fs.dates[d];
    if (t % trainEvery !== 0 || t + 1 >= m.S) continue;
    const a = fs.rowStart[d];
    const b = fs.rowStart[d + 1];
    for (const bk of buckets) bk.length = 0;
    for (let r = a; r < b; r++) {
      const v = holdReturn(m, fs.stock[r], t + 1, t + 1 + horizon);
      fwd[r] = v;
      if (v === v) buckets[secOf[fs.stock[r]]].push(r);
    }
    for (const bk of buckets) {
      const n = bk.length;
      if (n < 5) continue;
      const vals = new Float64Array(n);
      for (let z = 0; z < n; z++) vals[z] = fwd[bk[z]];
      const rk = new Float64Array(n);
      rankInto(vals, n, rk);
      for (let z = 0; z < n; z++) y[bk[z]] = (2 * (rk[z] - 0.5)) / n - 1;
    }
    for (let r = a; r < b; r++) if (y[r] === y[r]) list.push(r);
  }
  const trainList = sab(Int32Array, list.length);
  trainList.set(list);
  const trainDate = new Int32Array(list.length);
  for (let k = 0; k < list.length; k++) trainDate[k] = fs.rowDate[list[k]];
  return { y, fwd, trainList, trainDate };
}

function sampleConfigs(n, seed) {
  const rng = makeRng(seed, 'cv-configs');
  const out = [{ ...FIRST_CONFIG }];
  const seen = new Set([JSON.stringify(FIRST_CONFIG)]);
  let guard = 0;
  while (out.length < n && guard++ < 1000) {
    const c = {};
    for (const [k, vals] of Object.entries(SEARCH_SPACE)) c[k] = rng.pick(vals);
    const key = JSON.stringify(c);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(c);
  }
  return out;
}

/** Per-date metrics of predictions over list rows grouped by date. */
function dateMetrics(m, fs, tg, rowsOfList, dateOfList, preds) {
  const out = [];
  let k = 0;
  const n = rowsOfList.length;
  while (k < n) {
    const t = dateOfList[k];
    let e = k;
    while (e < n && dateOfList[e] === t) e++;
    const len = e - k;
    const p = new Float64Array(len);
    const yy = new Float64Array(len);
    const fr = new Float64Array(len);
    for (let z = 0; z < len; z++) {
      p[z] = preds[k + z];
      yy[z] = tg.y[rowsOfList[k + z]];
      fr[z] = tg.fwd[rowsOfList[k + z]];
    }
    const ic = spearman(p, yy, len);
    // top decile by prediction: mean forward return minus the benchmark
    const order = Array.from({ length: len }, (_, z) => z).sort((a, b) => p[b] - p[a]);
    const top = Math.max(1, Math.round(len / 10));
    let s = 0;
    for (let z = 0; z < top; z++) s += fr[order[z]];
    const excess = s / top - benchReturn(m, t + 1, t + 22);
    out.push({ t, ic, excess });
    k = e;
  }
  return out;
}

function monthly(m, rows) {
  const by = new Map();
  for (const r of rows) {
    const mo = m.dates[r.t].slice(0, 7);
    if (!by.has(mo)) by.set(mo, []);
    if (r.excess === r.excess) by.get(mo).push(r.excess);
  }
  return [...by.entries()].map(([mo, v]) => [mo, v.length ? Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 1e6) / 1e6 : null]);
}

/**
 * Run CV, the independence check and the walk-forward. Returns D percentiles for the model dates,
 * the experiment log, the training log and per-model driver profiles.
 */
export async function runMlFamily(m, fs, familyPct, options = {}) {
  const o = { ...ML_DEFAULTS, ...options };
  const t0 = Date.now();
  const log = (msg) => o.verbose && console.log(`[D ${((Date.now() - t0) / 1000).toFixed(1)}s] ${msg}`);
  const tg = buildTargets(m, fs, { horizon: o.horizon });
  const { trainList, trainDate } = tg;
  const researchEndIdx = lastIdxOnOrBefore(m.dates, o.researchEnd);
  const freezeIdx = lastIdxOnOrBefore(m.dates, o.freeze);
  const H = o.horizon + 1; // label spans t+1 .. t+22

  // CV list: training-grid rows inside the research window whose label ends by the research end
  const cvSel = [];
  for (let k = 0; k < trainList.length; k++) {
    const t = trainDate[k];
    if (t + H <= researchEndIdx && t % o.cvEvery === 0) cvSel.push(trainList[k]);
  }
  const cvList = sab(Int32Array, cvSel.length);
  cvList.set(cvSel);
  const cvDate = Int32Array.from(cvSel, (r) => fs.rowDate[r]);

  const pool = createPool({ X: fs.q, F: fs.F, y: tg.y, lists: { train: trainList, cv: cvList }, shift: o.shift }, o.workers);
  try {
    // ---- purged k-fold CV ----
    const cvDates = [...new Set(cvDate)];
    const folds = [];
    for (let f = 0; f < o.cvFolds; f++) {
      const a = cvDates[Math.floor((f * cvDates.length) / o.cvFolds)];
      const b = cvDates[Math.floor(((f + 1) * cvDates.length) / o.cvFolds) - 1];
      const testLo = lowerBound(cvDate, a);
      const testHi = upperBound(cvDate, b);
      const trainA = lowerBound(cvDate, a - H); // purge: labels overlapping the test window
      const trainB = upperBound(cvDate, b + H + o.embargo); // plus the embargo after it
      const trainRanges = [];
      if (trainA > 0) trainRanges.push([0, trainA]);
      if (trainB < cvDate.length) trainRanges.push([trainB, cvDate.length]);
      folds.push({ a, b, test: [testLo, testHi], trainRanges });
    }
    const configs = sampleConfigs(o.cvConfigs, o.seed);
    const maxTrees = Math.max(...o.checkpoints);
    const allFeatures = FEATURE_KEYS.map((_, j) => j);

    async function crossValidate(cfg, features, tag) {
      const jobs = folds.map((fd) =>
        pool.run({
          list: 'cv',
          trainRanges: fd.trainRanges,
          evalRanges: [fd.test],
          params: { ...cfg, nTrees: maxTrees, nBins: 64, seed: 1 },
          features,
          checkpoints: o.checkpoints,
        }),
      );
      const res = await Promise.all(jobs);
      const out = [];
      for (let c = 0; c < o.checkpoints.length; c++) {
        const oof = new Float32Array(cvList.length).fill(NaN);
        const foldIC = [];
        for (let f = 0; f < folds.length; f++) {
          const [lo, hi] = folds[f].test;
          const ep = res[f].evalPreds[c].pred;
          oof.set(ep, lo);
          const dm = dateMetrics(m, fs, tg, cvList.subarray(lo, hi), cvDate.subarray(lo, hi), ep);
          foldIC.push(mean(dm.map((r) => r.ic)));
        }
        const dm = dateMetrics(m, fs, tg, cvList, cvDate, oof);
        const ics = dm.map((r) => r.ic);
        out.push({
          nTrees: o.checkpoints[c],
          oof,
          meanIC: mean(ics),
          icSd: std(ics),
          nDates: ics.length,
          icir: mean(ics) / std(ics),
          foldIC,
          monthly: monthly(m, dm),
          tag,
        });
      }
      return out;
    }

    const experiments = [];
    const expOof = []; // out-of-fold CV predictions per experiment (aligned with cvList), for the variant matrix
    const candidates = [];
    const cvResults = await Promise.all(configs.map((cfg, ci) => crossValidate(cfg, allFeatures, `cfg${ci + 1}`)));
    configs.forEach((cfg, ci) => {
      for (const r of cvResults[ci]) {
        const exp = {
          id: `D-cv-${String(experiments.length + 1).padStart(3, '0')}`,
          family: 'D',
          kind: 'gbdt-purged-kfold',
          params: { ...cfg, nTrees: r.nTrees, nBins: 64 },
          features: 'all',
          cv: { folds: o.cvFolds, purgeDays: o.purge, embargoDays: o.embargo, every: o.cvEvery, window: [m.dates[cvDate[0]], m.dates[researchEndIdx]] },
          metric: { name: 'mean date rank IC vs sector-relative 21d target', value: round(r.meanIC), icir: round(r.icir), byFold: r.foldIC.map(round) },
          monthly: r.monthly,
        };
        experiments.push(exp);
        expOof.push(r.oof);
        candidates.push({ cfg, r, exp });
      }
    });
    // one-standard-error rule: the cheapest configuration whose CV IC is within one standard error
    // of the best (standard error of the mean date IC). Cost approximates training time per row:
    // out-of-bag rows are traversed (depth steps), in-bag rows fill histograms (sampled features).
    const top = candidates.reduce((a, b) => (b.r.meanIC > a.r.meanIC ? b : a));
    const se = top.r.icSd / Math.sqrt(top.r.nDates);
    const cost = (c) => c.r.nTrees * ((1 - c.cfg.rowSample) * c.cfg.depth * 3 + c.cfg.rowSample * c.cfg.colSample * FEATURE_KEYS.length * 7.5 + 10);
    const best = candidates.filter((c) => c.r.meanIC >= top.r.meanIC - se).reduce((a, b) => (cost(b) < cost(a) ? b : a));
    const selectionRule = { rule: 'one-standard-error', bestExperiment: top.exp.id, bestIC: round(top.r.meanIC), se: round(se), chosen: best.exp.id };
    log(`CV done: ${experiments.length} configurations, best ${top.exp.id} IC ${top.r.meanIC.toFixed(4)} (se ${se.toFixed(4)}), chosen ${best.exp.id}`);

    // ---- independence check on validation (out-of-fold) predictions ----
    const trainingLog = [{ step: 'cv-selection', ...selectionRule, experiments: experiments.length }];
    let features = allFeatures;
    const excluded = [];
    let chosen = best;
    for (let round2 = 0; round2 < 4; round2++) {
      const corr = oofFamilyCorr(m, fs, cvList, cvDate, chosen.r.oof, familyPct);
      const worst = Object.entries(corr).sort((a, b) => b[1] - a[1])[0];
      const entry = { step: 'independence-check', experiment: chosen.exp.id, corr: mapRound(corr), limit: o.corrLimit, excludedSoFar: [...excluded] };
      if (!(worst[1] > o.corrLimit)) {
        entry.outcome = 'pass';
        trainingLog.push(entry);
        break;
      }
      entry.outcome = `retrain without family ${worst[0]} raw inputs (${FAMILY_INPUTS[worst[0]].join(', ')})`;
      trainingLog.push(entry);
      excluded.push(worst[0]);
      const drop = new Set(excluded.flatMap((f) => FAMILY_INPUTS[f].map((k) => FEATURE_INDEX[k])));
      features = allFeatures.filter((j) => !drop.has(j));
      const rr = await crossValidate(chosen.cfg, features, `minus-${excluded.join('')}`);
      const r = rr.find((x) => x.nTrees === chosen.r.nTrees);
      for (const x of rr) {
        experiments.push({
          id: `D-cv-${String(experiments.length + 1).padStart(3, '0')}`,
          family: 'D',
          kind: 'gbdt-purged-kfold',
          params: { ...chosen.cfg, nTrees: x.nTrees, nBins: 64 },
          features: `all minus ${excluded.map((f) => `family ${f} inputs`).join(', ')}`,
          cv: { folds: o.cvFolds, purgeDays: o.purge, embargoDays: o.embargo, every: o.cvEvery },
          metric: { name: 'mean date rank IC vs sector-relative 21d target', value: round(x.meanIC), icir: round(x.icir), byFold: x.foldIC.map(round) },
          monthly: x.monthly,
        });
        expOof.push(x.oof);
      }
      chosen = { cfg: chosen.cfg, r, exp: experiments[experiments.length - (rr.length - rr.indexOf(r))] };
    }
    const params = { ...chosen.cfg, nTrees: chosen.r.nTrees, nBins: 64 };
    trainingLog.push({ step: 'final', experiment: chosen.exp.id, params, features: features.map((j) => FEATURE_KEYS[j]), excludedFamilies: [...excluded], cvIC: round(chosen.r.meanIC) });
    log(`selected ${chosen.exp.id} ${JSON.stringify(params)}`);

    // ---- walk-forward ----
    const s0 = fs.modelFrom;
    const firstTrain = trainDate[0];
    const years = [];
    const y0 = Number(m.dates[s0].slice(0, 4)) - 1;
    const yF = Number(o.freeze.slice(0, 4));
    for (let Y = y0; Y <= yF; Y++) {
      const c = lastIdxOnOrBefore(m.dates, `${Y}-09-30`);
      if (c < 0 || c - H - firstTrain < 150) continue;
      years.push({ Y, cutoff: c });
    }
    if (!years.length || years[0].cutoff >= s0) throw new Error('not enough history before the model start for the first D model');
    const models = years.map((yv, k) => {
      const trainEnd = upperBound(trainDate, yv.cutoff - H); // rows with label known by the cutoff
      const from = Math.max(s0, yv.cutoff + 1);
      const to = k + 1 < years.length ? years[k + 1].cutoff : m.S - 1;
      return { ...yv, trainEnd, from, to, frozen: yv.cutoff === lastIdxOnOrBefore(m.dates, o.freeze) };
    });
    // store row ranges of the prediction periods
    const dOf = (t) => lowerBound(fs.dates, t);
    const jobs = [];
    for (const md of models) {
      if (md.from > md.to) continue;
      const ra = fs.rowStart[dOf(md.from)];
      const rb = fs.rowStart[dOf(md.to) + 1];
      md.rows = [ra, rb];
      for (const seed of o.seeds) {
        jobs.push(
          pool
            .run({ list: 'train', trainRanges: [[0, md.trainEnd]], params: { ...params, seed }, features, predict: [ra, rb], returnModel: md.frozen && seed === o.seeds[0] })
            .then((res) => ({ md, seed, res })),
        );
      }
    }
    const results = await Promise.all(jobs);
    log(`walk-forward done: ${models.length} models x ${o.seeds.length} seeds`);

    // ---- assemble D percentiles ----
    const N = m.N;
    const T = m.S - s0;
    const pctD = new Float32Array(T * N).fill(NaN);
    const predAvg = new Map();
    const gainBy = new Map();
    let frozenModel = null;
    for (const { md, res } of results) {
      if (!predAvg.has(md)) {
        predAvg.set(md, new Float64Array(md.rows[1] - md.rows[0]));
        gainBy.set(md, new Float64Array(fs.F));
      }
      const acc = predAvg.get(md);
      for (let k = 0; k < acc.length; k++) acc[k] += res.preds[k] / o.seeds.length;
      const gb = gainBy.get(md);
      for (let j = 0; j < fs.F; j++) gb[j] += res.gain[j];
      md.nRows = res.nRows;
      if (res.model) frozenModel = res.model;
    }
    const profiles = [];
    const tmp = new Float64Array(4096);
    for (const md of models) {
      const acc = predAvg.get(md);
      if (!acc) continue;
      for (let t = md.from; t <= md.to; t++) {
        const d = dOf(t);
        const a = fs.rowStart[d];
        const b = fs.rowStart[d + 1];
        const n = b - a;
        const vals = acc.subarray(a - md.rows[0], b - md.rows[0]);
        rankInto(vals, n, tmp);
        for (let z = 0; z < n; z++) pctD[(t - s0) * N + fs.stock[a + z]] = (tmp[z] - 0.5) / n;
      }
      // driver profile: normalised gain and the direction of each feature in the ensemble
      const gb = gainBy.get(md);
      const gsum = gb.reduce((x, v) => x + v, 0) || 1;
      const direction = new Float64Array(fs.F);
      const probe = [];
      for (let t = md.from; t <= md.to; t += 21) probe.push(t);
      for (let j = 0; j < fs.F; j++) {
        const cs = [];
        for (const t of probe) {
          const d = dOf(t);
          const a = fs.rowStart[d];
          const b = fs.rowStart[d + 1];
          const x = new Float64Array(b - a);
          for (let r = a; r < b; r++) x[r - a] = fs.q[r * fs.F + j];
          cs.push(spearman(x, acc.subarray(a - md.rows[0], b - md.rows[0]), b - a));
        }
        direction[j] = mean(cs);
      }
      profiles.push({ from: md.from, to: md.to, importance: Array.from(gb, (v) => v / gsum), direction: Array.from(direction) });
      // realised out-of-sample IC of the period (raw 21d forward return, month-ends)
      const ics = [];
      for (let t = md.from; t <= md.to; t++) {
        if (t + 22 >= m.S || m.dates[t].slice(0, 7) === m.dates[t + 1].slice(0, 7)) continue;
        const d = dOf(t);
        const a = fs.rowStart[d];
        const b = fs.rowStart[d + 1];
        const f = new Float64Array(b - a);
        for (let r = a; r < b; r++) f[r - a] = holdReturn(m, fs.stock[r], t + 1, t + 22);
        ics.push(spearman(acc.subarray(a - md.rows[0], b - md.rows[0]), f, b - a));
      }
      const top = Array.from(gb, (v, j) => [FEATURE_KEYS[j], v / gsum]).sort((x, y) => y[1] - x[1]).slice(0, 6);
      trainingLog.push({
        step: 'walk-forward',
        model: `D-${md.Y}`,
        cutoff: m.dates[md.cutoff],
        purgeDays: o.purge,
        trainFrom: m.dates[trainDate[0]],
        trainTo: m.dates[trainDate[md.trainEnd - 1]],
        nRows: md.nRows,
        nDates: new Set(trainDate.subarray(0, md.trainEnd)).size,
        seeds: [...o.seeds],
        params,
        features: features.map((j) => FEATURE_KEYS[j]),
        excludedFamilies: [...excluded],
        predictFrom: m.dates[md.from],
        predictTo: m.dates[md.to],
        frozen: md.frozen,
        oosMonthlyIC: round(mean(ics)),
        topFeatures: top.map(([k, v]) => [k, round(v)]),
      });
    }
    log('assembled');
    // CV out-of-fold predictions of every experiment on the CV grid (rows: cvList), used by
    // engine/validate.js to evaluate thresholds x configurations (DSR, PBO).
    const nCv = cvList.length;
    const cvPreds = new Float32Array(expOof.length * nCv);
    expOof.forEach((o, k) => cvPreds.set(o, k * nCv));
    const cvOof = { stock: Int32Array.from(cvList, (r) => fs.stock[r]), t: Int32Array.from(cvDate), preds: cvPreds, nExp: expOof.length, n: nCv };
    return { pctD, experiments, trainingLog, profiles, params, features: features.map((j) => FEATURE_KEYS[j]), excluded, frozenModel, cvIC: chosen.r.meanIC, cvOof };
  } finally {
    await pool.close();
  }
}

/** Mean cross-sectional Spearman between OOF predictions and the A-C percentiles (model dates only). */
function oofFamilyCorr(m, fs, list, dates, oof, familyPct) {
  const N = m.N;
  const s0 = fs.modelFrom;
  const acc = { A: [], B: [], C: [] };
  let k = 0;
  while (k < list.length) {
    const t = dates[k];
    let e = k;
    while (e < list.length && dates[e] === t) e++;
    if (t >= s0) {
      const len = e - k;
      const p = oof.subarray(k, e);
      for (const f of ['A', 'B', 'C']) {
        const x = new Float64Array(len);
        for (let z = 0; z < len; z++) x[z] = familyPct[f][(t - s0) * N + fs.stock[list[k + z]]];
        acc[f].push(spearman(p, x, len));
      }
    }
    k = e;
  }
  return { A: mean(acc.A), B: mean(acc.B), C: mean(acc.C) };
}

function round(x, d = 4) {
  return x === x ? Math.round(x * 10 ** d) / 10 ** d : null;
}

function mapRound(o) {
  return Object.fromEntries(Object.entries(o).map(([k, v]) => [k, round(v)]));
}
