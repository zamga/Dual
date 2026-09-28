import test from 'node:test';
import assert from 'node:assert/strict';
import * as st from '../../core/stats.js';
import { mulberry32, normal } from '../../core/random.js';

const close = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} vs ${b}`);

test('basic moments', () => {
  close(st.mean([1, 2, 3, 4]), 2.5);
  close(st.median([5, 1, 3]), 3);
  close(st.quantile([1, 2, 3, 4, 5], 0.25), 2);
  close(st.std([2, 4, 4, 4, 5, 5, 7, 9]), 2.138089935);
  assert.deepEqual(st.rank([10, 20, 20, 5]), [2, 3.5, 3.5, 1]);
  close(st.spearman([1, 2, 3, 4], [10, 20, 30, 40]), 1);
  close(st.spearman([1, 2, 3, 4], [4, 3, 2, 1]), -1);
  close(st.hitRate([0.1, -0.2, 0.3, 0]), 0.5);
  close(st.maxDrawdown([1, 1.2, 0.9, 1.3, 1.04]), -0.25);
  close(st.skewness([1, 2, 3]), 0);
  close(st.kurtosis([1, -1, 1, -1]), 1);
});

test('normal distribution helpers invert each other', () => {
  for (const p of [0.001, 0.025, 0.3, 0.5, 0.8, 0.975, 0.999]) close(st.normCdf(st.normInv(p)), p, 2e-7);
  close(st.normInv(0.975), 1.959963985, 1e-8);
});

test('bootstrap and Wilson intervals', () => {
  const rng = mulberry32(3);
  const xs = Array.from({ length: 400 }, () => 0.01 + 0.05 * normal(rng));
  const [lo, hi] = st.bootstrapCI(xs);
  assert.ok(lo < st.mean(xs) && st.mean(xs) < hi);
  assert.deepEqual(st.bootstrapCI(xs), st.bootstrapCI(xs), 'deterministic with the default seed');
  const [wl, wh] = st.wilsonCI(28, 50);
  close(wl, 0.4231, 1e-3);
  close(wh, 0.6893, 1e-3);
});

test('deflated Sharpe punishes many trials', () => {
  const base = { sr: 0.25, varSR: 0.01, T: 120, skew: 0, kurt: 3 };
  const one = st.deflatedSharpe({ ...base, nTrials: 1 });
  const many = st.deflatedSharpe({ ...base, nTrials: 500 });
  assert.ok(one > 0.99);
  assert.ok(many < one);
  close(st.expectedMaxSharpe(1, 0.01), 0);
  // Brief/quant report: 100 zero-skill variants, 5 years, best annual Sharpe about 1.13.
  const perYear = st.expectedMaxSharpe(100, 1 / 5);
  assert.ok(perYear > 1.0 && perYear < 1.3, String(perYear));
});

test('PBO: noise overfits, a real edge does not', () => {
  const rng = mulberry32(11);
  const T = 160;
  const N = 40;
  const noise = Array.from({ length: T }, () => Array.from({ length: N }, () => 0.04 * normal(rng)));
  const p0 = st.pbo(noise, 8).pbo;
  assert.ok(p0 > 0.25 && p0 < 0.75, `noise PBO ${p0}`);
  const edge = noise.map((row) => row.map((x, j) => x + (j === 0 ? 0.03 : 0)));
  const p1 = st.pbo(edge, 8).pbo;
  assert.ok(p1 < 0.1, `edge PBO ${p1}`);
});
