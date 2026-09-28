import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fitFloat, fitBinned, predictBinned, quantileEdges, applyBins } from '../../engine/ml/gbdt.js';
import { rankInto, spearman } from '../../engine/lib/stats.js';
import { mulberry32 } from '../../core/random.js';

function data(n, F, fn, seed) {
  const rng = mulberry32(seed);
  const X = new Float64Array(n * F);
  const y = new Float64Array(n);
  for (let r = 0; r < n; r++) {
    for (let f = 0; f < F; f++) X[r * F + f] = rng() * 2 - 1;
    y[r] = fn(X.subarray(r * F, r * F + F)) + 0.25 * (rng() - 0.5);
  }
  return { X, y };
}

// ordinary least squares with intercept (normal equations, Gaussian elimination)
function olsPredict(Xtr, ytr, n, F, Xte, m) {
  const P = F + 1;
  const A = Array.from({ length: P }, () => new Float64Array(P + 1));
  for (let r = 0; r < n; r++) {
    const x = [1, ...Xtr.subarray(r * F, r * F + F)];
    for (let a = 0; a < P; a++) {
      for (let b = 0; b < P; b++) A[a][b] += x[a] * x[b];
      A[a][P] += x[a] * ytr[r];
    }
  }
  for (let c = 0; c < P; c++) {
    let p = c;
    for (let r = c + 1; r < P; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
    [A[c], A[p]] = [A[p], A[c]];
    for (let r = 0; r < P; r++) {
      if (r === c) continue;
      const f = A[r][c] / A[c][c];
      for (let k = c; k <= P; k++) A[r][k] -= f * A[c][k];
    }
  }
  const beta = A.map((row, c) => row[P] / row[c]);
  const out = new Float64Array(m);
  for (let r = 0; r < m; r++) {
    let s = beta[0];
    for (let f = 0; f < F; f++) s += beta[f + 1] * Xte[r * F + f];
    out[r] = s;
  }
  return out;
}

function r2(y, p) {
  let mu = 0;
  for (const v of y) mu += v;
  mu /= y.length;
  let ss = 0;
  let st = 0;
  for (let k = 0; k < y.length; k++) {
    ss += (y[k] - p[k]) ** 2;
    st += (y[k] - mu) ** 2;
  }
  return 1 - ss / st;
}

test('GBDT fits a known nonlinear function and beats a linear fit', () => {
  const F = 5;
  const fn = (x) => Math.sin(3 * x[0]) * (x[1] > 0 ? 1 : -0.5) + x[2] * x[2];
  const tr = data(6000, F, fn, 1);
  const te = data(3000, F, fn, 2);
  const fit = fitFloat(tr.X, 6000, F, tr.y, { nTrees: 150, depth: 4, lr: 0.1, minLeaf: 20, lambda: 1, rowSample: 0.7, colSample: 1 });
  const pg = fit.predict(te.X, 3000);
  const pl = olsPredict(tr.X, tr.y, 6000, F, te.X, 3000);
  const rg = r2(te.y, pg);
  const rl = r2(te.y, pl);
  assert.ok(rg > 0.85, `GBDT R2 ${rg}`);
  assert.ok(rl < 0.3, `linear R2 ${rl}`);
});

test('GBDT finds the momentum-only-for-low-volatility interaction that a linear fit cannot', () => {
  const F = 4;
  // x0 = momentum rank, x1 = idio-vol rank: momentum pays only when volatility is low
  const fn = (x) => (x[1] < 0 ? x[0] : 0);
  const tr = data(8000, F, fn, 3);
  const te = data(4000, F, fn, 4);
  const fit = fitFloat(tr.X, 8000, F, tr.y, { nTrees: 120, depth: 3, lr: 0.1, minLeaf: 50, lambda: 5, rowSample: 0.5, colSample: 1 });
  const rg = r2(te.y, fit.predict(te.X, 4000));
  const rl = r2(te.y, olsPredict(tr.X, tr.y, 8000, F, te.X, 4000));
  assert.ok(rg > rl + 0.25, `GBDT ${rg} vs linear ${rl}`);
});

test('GBDT training is deterministic for a seed, and seeds differ', () => {
  const F = 3;
  const fn = (x) => x[0] * x[1];
  const tr = data(3000, F, fn, 5);
  const edges = quantileEdges(tr.X, 3000, F, 64);
  const Xb = applyBins(tr.X, 3000, F, edges);
  const rows = Int32Array.from({ length: 3000 }, (_, k) => k);
  const p = { nTrees: 30, depth: 3, lr: 0.1, minLeaf: 30, rowSample: 0.5, colSample: 0.7 };
  const a = predictBinned(fitBinned(Xb, F, tr.y, rows, { ...p, seed: 1 }).model, Xb, rows);
  const b = predictBinned(fitBinned(Xb, F, tr.y, rows, { ...p, seed: 1 }).model, Xb, rows);
  const c = predictBinned(fitBinned(Xb, F, tr.y, rows, { ...p, seed: 2 }).model, Xb, rows);
  assert.deepEqual(a, b);
  assert.notDeepEqual(a, c);
});

test('min leaf size, depth and shrinkage are respected', () => {
  const F = 2;
  const tr = data(2000, F, (x) => x[0], 6);
  const edges = quantileEdges(tr.X, 2000, F, 32);
  const Xb = applyBins(tr.X, 2000, F, edges);
  const rows = Int32Array.from({ length: 2000 }, (_, k) => k);
  const { model } = fitBinned(Xb, F, tr.y, rows, { nTrees: 5, depth: 3, lr: 0.05, minLeaf: 400, rowSample: 1, colSample: 1, lambda: 0, nBins: 32 });
  for (const t of model.trees) {
    assert.ok(t.code.length <= 15);
    let leaves = 0;
    for (let j = 0; j < t.code.length; j++) if (t.code[j] < 0 && t.value[j] !== 0) leaves++;
    assert.ok(leaves <= 5, 'at most floor(2000 / 400) leaves');
  }
  // shrinkage: one tree moves predictions by at most lr * max |residual|
  const one = fitBinned(Xb, F, tr.y, rows, { nTrees: 1, depth: 3, lr: 0.05, minLeaf: 10, rowSample: 1, colSample: 1, lambda: 0, nBins: 32 }).model;
  const maxLeaf = Math.max(...one.trees[0].value.map(Math.abs));
  assert.ok(maxLeaf <= 0.05 * 1.2);
});

test('radix ranks match a naive rank with ties averaged', () => {
  const rng = mulberry32(9);
  for (const n of [10, 399, 400, 1500]) {
    const v = new Float64Array(n);
    for (let i = 0; i < n; i++) v[i] = i % 17 === 0 ? NaN : Math.round(rng() * 60) - 30;
    const out = new Float64Array(n);
    const m = rankInto(v, n, out);
    let valid = 0;
    for (let i = 0; i < n; i++) {
      if (Number.isNaN(v[i])) {
        assert.ok(Number.isNaN(out[i]));
        continue;
      }
      valid++;
      let less = 0;
      let eq = 0;
      for (let j = 0; j < n; j++) {
        if (Number.isNaN(v[j])) continue;
        if (v[j] < v[i]) less++;
        else if (v[j] === v[i]) eq++;
      }
      assert.equal(out[i], less + (eq + 1) / 2);
    }
    assert.equal(m, valid);
  }
  assert.ok(Math.abs(spearman(Float64Array.from([1, 2, 3, 4]), Float64Array.from([10, 20, 30, 40])) - 1) < 1e-12);
});
