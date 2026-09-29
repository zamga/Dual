import { test } from 'node:test';
import assert from 'node:assert/strict';
import { simulateMarket } from '../../engine/sim/market.js';
import { computeFeatures, rawFeaturesAt, FEATURE_INDEX, FEATURES } from '../../engine/features.js';
import { crashSwitchSeries } from '../../engine/families/trend.js';
import { runMlFamily } from '../../engine/families/ml.js';
import { SMALL_UNIVERSE } from '../../engine/model.js';
import { mulberry32 } from '../../core/random.js';

const base = simulateMarket(SMALL_UNIVERSE.sim);

// Deep-copy the parts of the market the features read, then scramble everything after t0.
function perturbAfter(m, t0, seed = 99) {
  const rng = mulberry32(seed);
  const c = {
    ...m,
    open: m.open.slice(),
    close: m.close.slice(),
    volume: m.volume.slice(),
    shares: m.shares.slice(),
    mcap: m.mcap.slice(),
    adv60: m.adv60.slice(),
    eligible: m.eligible.slice(),
    dtcPub: m.dtcPub.slice(),
    bench: { ...m.bench, open: m.bench.open.slice(), close: m.bench.close.slice() },
    sectorIndex: { open: m.sectorIndex.open.slice(), close: m.sectorIndex.close.slice() },
    filings: { ...m.filings },
    news: { ...m.news, headline: m.news.headline.slice() },
    // Form-4 purchases: a trade is public two trading days after it, so trades after t0 - 2 are scrambled
    insider: { ...m.insider, company: m.insider.company.slice() },
  };
  for (let k = 0; k < m.insider.t.length; k++) if (m.insider.t[k] > t0 - 2) c.insider.company[k] = Math.floor(rng() * m.N);
  const N = m.N;
  for (let k = (t0 + 1) * N; k < m.S * N; k++) {
    const f = 0.5 + rng();
    c.open[k] *= f;
    c.close[k] *= f * (0.9 + 0.2 * rng());
    c.volume[k] *= 0.5 + rng();
    c.mcap[k] *= f;
    c.adv60[k] *= 0.5 + rng();
    c.eligible[k] = rng() < 0.9 ? 1 : 0;
    c.dtcPub[k] *= 0.5 + 2 * rng();
  }
  for (let t = t0 + 1; t < m.S; t++) {
    c.bench.close[t] *= 0.8 + 0.4 * rng();
    for (let s = 0; s < m.sectors.length; s++) c.sectorIndex.close[s * m.S + t] *= 0.8 + 0.4 * rng();
  }
  for (const key of m.filings.fields) {
    c.filings[key] = m.filings[key].slice();
    for (let n = 0; n < m.filings.F; n++) if (m.filings.filingIdx[n] > t0) c.filings[key][n] *= -1 + 3 * rng();
  }
  for (let k = 0; k < m.news.t.length; k++) if (m.news.t[k] > t0) c.news.headline[k] = 'Placeholder cuts full-year guidance';
  return c;
}

const fsBase = computeFeatures(base, { shared: false });

test('perturbing any data after t never changes features, family scores or the crash switch at t', () => {
  const t0 = base.s0 + 700;
  const pert = perturbAfter(base, t0);
  const fsP = computeFeatures(pert, { shared: false });
  let dLast = 0;
  while (dLast + 1 < fsBase.D && fsBase.dates[dLast + 1] <= t0) dLast++;
  const rowsEnd = fsBase.rowStart[dLast + 1];
  assert.equal(fsP.rowStart[dLast + 1], rowsEnd);
  assert.deepEqual(fsP.q.subarray(0, rowsEnd * fsBase.F), fsBase.q.subarray(0, rowsEnd * fsBase.F));
  const upto = (t0 - base.s0 + 1) * base.N;
  for (const f of ['A', 'B', 'C']) assert.deepEqual(fsP.pct[f].subarray(0, upto), fsBase.pct[f].subarray(0, upto));
  assert.deepEqual(crashSwitchSeries(pert.bench.close).subarray(0, t0 + 1), crashSwitchSeries(base.bench.close).subarray(0, t0 + 1));
  // ...and the perturbation did change something after t0
  assert.notDeepEqual(fsP.q.subarray(rowsEnd * fsBase.F), fsBase.q.subarray(rowsEnd * fsBase.F));
});

test('fundamentals are invisible before their filing date', () => {
  const fil = base.filings;
  // a filing inside the model window of an eligible company
  let n = -1;
  for (let k = 0; k < fil.F; k++) {
    const t = fil.filingIdx[k];
    if (t > base.s0 + 50 && t < base.S - 50 && base.eligible[t * base.N + fil.company[k]] && k - 4 >= fil.start[fil.company[k]]) {
      n = k;
      break;
    }
  }
  assert.ok(n >= 0);
  const i = fil.company[n];
  const tf = fil.filingIdx[n];
  const before = rawFeaturesAt(base, tf - 1, i);
  const at = rawFeaturesAt(base, tf, i);
  const changed = { ...base, filings: { ...fil } };
  for (const key of fil.fields) {
    changed.filings[key] = fil[key].slice();
    changed.filings[key][n] = fil[key][n] * 3 + 1;
  }
  const before2 = rawFeaturesAt(changed, tf - 1, i);
  const at2 = rawFeaturesAt(changed, tf, i);
  assert.deepEqual(before2, before, 'features the day before the filing ignore it');
  assert.notDeepEqual(at2, at, 'features on the filing date use it');
  for (const k of ['sue', 'gpa', 'ebit_ev', 'emb_1', 'emb_2', 'emb_3', 'emb_4']) assert.notEqual(at2[FEATURE_INDEX[k]], at[FEATURE_INDEX[k]]);
});

test('the streaming pass matches a direct point-in-time computation', () => {
  const J = FEATURE_INDEX;
  let checked = 0;
  for (let d = fsBase.D - 1; d > 0 && checked < 40; d -= 97) {
    const t = fsBase.dates[d];
    const r = fsBase.rowStart[d] + 3;
    if (r >= fsBase.rowStart[d + 1]) continue;
    const i = fsBase.stock[r];
    const raw = rawFeaturesAt(base, t, i);
    // compare the stored rank bytes by recomputing the cross-sectional rank of the direct values
    const a = fsBase.rowStart[d];
    const b = fsBase.rowStart[d + 1];
    for (const key of ['resid_mom_vs', 'ivol', 'sue', 'ebit_ev', 'dtc', 'turnover', 'insider_buys', 'emb_1', 'emb_2']) {
      const j = J[key];
      const own = raw[j];
      if (!(own === own)) continue;
      let below = 0;
      let equal = 0;
      let valid = 0;
      for (let rr = a; rr < b; rr++) {
        const v = rawFeaturesAt(base, t, fsBase.stock[rr])[j];
        if (v === v) {
          valid++;
          if (v < own - 1e-9) below++;
          else if (v <= own + 1e-9) equal++;
        }
      }
      // average ranks for ties (the insider count is mostly zero)
      const expect = Math.round(((below + equal / 2) / valid) * 255);
      assert.ok(Math.abs(fsBase.q[r * fsBase.F + j] - expect) <= 2, `${key} ${fsBase.q[r * fsBase.F + j]} vs ${expect}`);
      checked++;
    }
  }
  assert.ok(checked > 10);
  assert.equal(FEATURES.length, fsBase.F);
});

test('D predictions before a date do not change when data after it changes (walk-forward purge)', async () => {
  // perturb after the research window so the CV (inside the research window) is unaffected
  const cut = base.dates.indexOf('2018-03-01');
  const pert = perturbAfter(base, cut, 5);
  const fsP = computeFeatures(pert, { shared: true });
  const fsB = computeFeatures(base, { shared: true });
  const ml = { ...SMALL_UNIVERSE.ml, cvConfigs: 1, checkpoints: [20], seeds: [11], workers: 2 };
  const a = await runMlFamily(base, fsB, fsB.pct, ml);
  const b = await runMlFamily(pert, fsP, fsP.pct, ml);
  const upto = (cut - base.s0 + 1) * base.N;
  assert.deepEqual(b.pctD.subarray(0, upto), a.pctD.subarray(0, upto));
  assert.notDeepEqual(b.pctD.subarray(upto), a.pctD.subarray(upto));
  // every walk-forward model trains only on labels known by its cutoff and predicts after it
  for (const e of a.trainingLog.filter((x) => x.step === 'walk-forward')) {
    assert.ok(e.trainTo < e.cutoff && e.predictFrom > e.cutoff, JSON.stringify(e));
    const gap = base.dates.indexOf(e.cutoff) - base.dates.indexOf(e.trainTo);
    assert.ok(gap >= 22, `purge gap ${gap}`);
  }
});
