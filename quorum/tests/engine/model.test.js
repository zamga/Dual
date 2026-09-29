import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { buildModel } from '../../engine/model.js';

let model;
before(async () => {
  model = await buildModel({ universe: 'small', cache: false });
});

test('the model exposes the documented interface', () => {
  const { T, N } = model;
  assert.equal(model.dates.length, T);
  assert.equal(model.dates[0], '2014-01-02');
  assert.equal(model.companies.length, N);
  for (const key of ['open', 'close', 'mcap', 'adv60', 'volume', 'shares']) assert.equal(model[key].length, T * N, key);
  assert.equal(model.eligible.length, T * N);
  assert.ok(model.eligible instanceof Uint8Array);
  assert.equal(model.benchmark.name, 'S&P 500 TR (simulated)');
  assert.equal(model.benchmark.open.length, T);
  assert.equal(model.benchmark.close.length, T);
  assert.equal(model.eurusd.length, T);
  assert.equal(model.crashSwitch.length, T);
  assert.equal(model.sectorIndex.close.length, 11);
  assert.equal(model.dStart, 0);
  const c = model.companies[0];
  for (const k of ['idx', 'ticker', 'name', 'sector', 'isin', 'figi', 'venue', 'listDate', 'delistDate', 'delistReason']) assert.ok(k in c, k);
  assert.equal(c.fictional, true);
  assert.equal(typeof model.vetoFlags, 'function');
  assert.equal(typeof model.drivers, 'function');
  assert.equal(typeof model.insider, 'function');
});

test('family percentiles are in (0, 1) for eligible names, NaN otherwise, and D exists from day 0', () => {
  const { T, N, pct, eligible } = model;
  for (const f of ['A', 'B', 'C', 'D']) {
    assert.equal(pct[f].length, T * N);
    let scored = 0;
    for (let k = 0; k < T * N; k += 3) {
      const v = pct[f][k];
      if (!eligible[k]) assert.ok(Number.isNaN(v), `${f} scored an ineligible name`);
      else if (!Number.isNaN(v)) {
        assert.ok(v > 0 && v < 1);
        scored++;
      }
    }
    assert.ok(scored > 0.8 * (T * N) / 3 * 0.8, f);
  }
  let d0 = 0;
  for (let i = 0; i < N; i++) if (!Number.isNaN(pct.D[i])) d0++;
  assert.ok(d0 > 100, 'D scores the first model day');
  // top decile holds about 10% of the scored names each day
  const t = Math.floor(T / 2);
  let n = 0;
  let top = 0;
  for (let i = 0; i < N; i++) {
    const v = pct.A[t * N + i];
    if (v === v) {
      n++;
      if (v >= 0.9) top++;
    }
  }
  assert.ok(Math.abs(top / n - 0.1) < 0.02);
});

test('family IC and correlation sanity on the small universe', () => {
  const d = model.diagnostics;
  const all = d.icMonthly;
  const meanIc = (f) => all.reduce((s, r) => s + (r[f] ?? 0), 0) / all.length;
  const avg = (meanIc('A') + meanIc('B') + meanIc('C')) / 3;
  assert.ok(avg > 0 && avg < 0.08, `mean IC of A-C ${avg}`);
  assert.ok(meanIc('D') > 0 && meanIc('D') < 0.1, `D ${meanIc('D')}`);
  const M = d.correlations.matrix;
  for (let a = 0; a < 4; a++)
    for (let b = 0; b < 4; b++) {
      if (a === b) assert.equal(M[a][b], 1);
      else assert.ok(M[a][b] > -0.3 && M[a][b] < 0.65, `${a}${b} ${M[a][b]}`);
    }
  for (const p of Object.values(d.hit3of4)) if (p.rawRule.n > 500) assert.ok(p.rawRule.hit > 0.4 && p.rawRule.hit < 0.7);
});

test('the D pipeline logs every configuration tried, the independence check and the walk-forward', () => {
  assert.ok(model.experiments.length >= 4);
  for (const e of model.experiments) {
    assert.ok(e.id && e.params && typeof e.metric.value === 'number');
    assert.ok(Array.isArray(e.monthly) && e.monthly.length > 12);
    assert.equal(e.cv.purgeDays, 21);
    assert.equal(e.cv.embargoDays, 21);
  }
  const steps = model.trainingLog.map((x) => x.step);
  assert.ok(steps.includes('cv-selection'));
  assert.ok(steps.includes('independence-check'));
  const wf = model.trainingLog.filter((x) => x.step === 'walk-forward');
  assert.ok(wf.length >= 5);
  assert.equal(wf.filter((x) => x.frozen).length, 1);
  assert.equal(wf.find((x) => x.frozen).cutoff, model.options.ml.freeze);
  for (let k = 1; k < wf.length; k++) assert.ok(wf[k].nRows > wf[k - 1].nRows, 'expanding window');
});

test('D never learns from the LLM veto stand-in: its news flag is not a D input', () => {
  // brief §3.3: LLM components are backtested only after the training cutoff; a D trained on the
  // stand-in's labels would dodge every flagged stock and leave the 48-hour veto nothing to block
  assert.ok(!model.dModel.features.includes('news_neg'));
  for (const e of model.trainingLog.filter((x) => Array.isArray(x.features))) assert.ok(!e.features.includes('news_neg'), e.step);
});

test('veto flags, drivers and insider data for a scored name', () => {
  const { T, N } = model;
  const t = T - 40;
  let i = 0;
  while (!model.eligible[t * N + i]) i++;
  const v = model.vetoFlags(t, i);
  for (const k of ['daysToCover', 'dtcTopDecile', 'idioVol', 'ivolTopDecile', 'earningsWithin3d', 'pendingMA', 'newsNegative48h', 'headline']) assert.ok(k in v, k);
  assert.equal(typeof v.dtcTopDecile, 'boolean');
  const dr = model.drivers(t, i);
  for (const f of ['A', 'B', 'C', 'D']) {
    assert.ok(Array.isArray(dr[f]) && dr[f].length >= 2, f);
    for (const x of dr[f]) {
      assert.ok(x.label.en && x.label.sl);
      assert.ok(x.value === null || Number.isFinite(x.value));
    }
  }
  const ins = model.insider(t, i);
  assert.equal(typeof ins.cluster, 'boolean');
  assert.ok(Number.isInteger(ins.buyers));
  // share of names flagged in the top deciles is about 10%
  let n = 0;
  let dtc = 0;
  let iv = 0;
  for (let k = 0; k < N; k++) {
    if (!model.eligible[t * N + k]) continue;
    const f = model.vetoFlags(t, k);
    n++;
    dtc += f.dtcTopDecile;
    iv += f.ivolTopDecile;
  }
  assert.ok(dtc / n > 0.05 && dtc / n < 0.16);
  assert.ok(iv / n > 0.05 && iv / n < 0.16);
});

test('hold returns: entry at the next open, exit 21 trading days later, delisting proceeds included', () => {
  const { T, N } = model;
  const t = 100;
  let i = 0;
  while (!model.eligible[t * N + i]) i++;
  const r = model.holdReturn(i, t + 1, t + 22);
  assert.ok(Math.abs(r - (model.open[(t + 22) * N + i] / model.open[(t + 1) * N + i] - 1)) < 1e-12);
  const delisted = model.companies.find((c) => c.delistDate && c.delistDate > model.dates[30] && c.delistDate < model.dates[T - 30]);
  if (delisted) {
    const td = model.dates.indexOf(delisted.delistDate);
    const rr = model.holdReturn(delisted.idx, td - 5, td + 16);
    const expect = (model.close[td * N + delisted.idx] * (1 + delisted.delistReturn)) / model.open[(td - 5) * N + delisted.idx] - 1;
    assert.ok(Math.abs(rr - expect) < 1e-12);
  }
  assert.equal(model.oneWayCost(t, i), model.mcap[t * N + i] > 10e9 ? 0.001 : 0.0025);
});

test('buildModel is deterministic', async () => {
  const again = await buildModel({ universe: 'small', cache: false });
  for (const f of ['A', 'B', 'C', 'D']) assert.deepEqual(again.pct[f], model.pct[f]);
  assert.deepEqual(again.crashSwitch, model.crashSwitch);
  assert.deepEqual(again.experiments.map((e) => e.metric.value), model.experiments.map((e) => e.metric.value));
});

test('experiments share one month grid (for DSR / PBO) and the D cache round-trips', async () => {
  const months = JSON.stringify(model.experiments[0].monthly.map((x) => x[0]));
  for (const e of model.experiments) assert.equal(JSON.stringify(e.monthly.map((x) => x[0])), months);
  const { mkdtempSync, rmSync } = await import('node:fs');
  const { join } = await import('node:path');
  const { tmpdir } = await import('node:os');
  const dir = mkdtempSync(join(tmpdir(), 'quorum-engine-cache-'));
  try {
    const a = await buildModel({ universe: 'small', cache: true, cacheDir: dir });
    const b = await buildModel({ universe: 'small', cache: true, cacheDir: dir });
    assert.equal(a.timings.cacheHit, false);
    assert.equal(b.timings.cacheHit, true);
    assert.deepEqual(b.pct.D, a.pct.D);
    assert.deepEqual(b.trainingLog, a.trainingLog);
    assert.deepEqual(b.drivers(100, a.companies.findIndex((c, i) => a.eligible[100 * a.N + i])), a.drivers(100, a.companies.findIndex((c, i) => a.eligible[100 * a.N + i])));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
