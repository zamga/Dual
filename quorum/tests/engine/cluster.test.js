// Effective number of trials for the DSR: average-linkage clustering on the correlation distance, K by
// the best mean silhouette, one equal-weight series per cluster (engine/cluster.js, engine/validate.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mulberry32, normal } from '../../core/random.js';
import { expectedMaxSharpe, std, deflatedSharpe } from '../../core/stats.js';
import {
  columnCorrelations, correlationDistance, averageLinkage, cutTree, meanSilhouette, clusterVariants, clusterSeries, columnSharpes,
} from '../../engine/cluster.js';
import { deflation, dsrOfSeries } from '../../engine/validate.js';

/**
 * T x N return matrix with known blocks: every column of block k is factor k plus idiosyncratic noise,
 * so columns correlate strongly inside a block and weakly across blocks. Columns are interleaved so the
 * blocks are not contiguous. Returns { matrix, truth } with truth[j] = block of column j.
 */
function blocks(sizes, { T = 150, noise = 0.35, seed = 11, mix = 0, drift = [] } = {}) {
  const rng = mulberry32(seed);
  const K = sizes.length;
  const f = Array.from({ length: K }, () => Array.from({ length: T }, () => normal(rng)));
  // optional mild correlation between consecutive factors
  if (mix) for (let k = 1; k < K; k++) for (let t = 0; t < T; t++) f[k][t] = Math.sqrt(1 - mix * mix) * f[k][t] + mix * f[k - 1][t];
  const truth = [];
  for (let k = 0; k < K; k++) for (let n = 0; n < sizes[k]; n++) truth.push(k);
  // deterministic interleave
  const order = truth.map((_, j) => j).sort((a, b) => ((a * 7919) % 101) - ((b * 7919) % 101) || a - b);
  const cols = order.map((j) => truth[j]);
  const matrix = Array.from({ length: T }, (_, t) => cols.map((k) => 0.01 * (f[k][t] + noise * normal(rng)) + (drift[k] ?? 0)));
  return { matrix, truth: cols };
}

function samePartition(labels, truth) {
  const map = new Map();
  for (let j = 0; j < labels.length; j++) {
    const key = labels[j];
    if (!map.has(key)) map.set(key, truth[j]);
    if (map.get(key) !== truth[j]) return false;
  }
  return new Set(map.values()).size === map.size;
}

test('correlation distance: identical series 0, independent about sqrt(1/2), a flat column is uncorrelated', () => {
  const rng = mulberry32(3);
  const T = 400;
  const a = Array.from({ length: T }, () => normal(rng));
  const b = Array.from({ length: T }, () => normal(rng));
  const matrix = a.map((x, t) => [x, x * 2 + 1, b[t], -x, 0.5]);
  const rho = columnCorrelations(matrix);
  const N = 5;
  assert.ok(Math.abs(rho[0 * N + 1] - 1) < 1e-12);
  assert.ok(Math.abs(rho[0 * N + 3] + 1) < 1e-12);
  assert.ok(Math.abs(rho[0 * N + 2]) < 0.15);
  assert.equal(rho[4 * N + 0], 0, 'a column without variance correlates 0');
  assert.equal(rho[4 * N + 4], 1);
  const d = correlationDistance(rho, N);
  assert.ok(Math.abs(d[0 * N + 1]) < 1e-6);
  assert.ok(Math.abs(d[0 * N + 3] - 1) < 1e-9, 'opposite series are at distance 1');
  assert.ok(Math.abs(d[0 * N + 2] - Math.SQRT1_2) < 0.08);
  assert.ok(d.every((x) => x >= 0 && x <= 1 && Number.isFinite(x)));
});

test('average linkage merges by mean pairwise distance, ties to the lowest indices, and cuts canonically', () => {
  const xs = [0, 1, 5, 6, 20];
  const N = xs.length;
  const dist = new Float64Array(N * N);
  for (let a = 0; a < N; a++) for (let b = 0; b < N; b++) dist[a * N + b] = Math.abs(xs[a] - xs[b]) / 20;
  const m = averageLinkage(dist, N);
  assert.equal(m.length, N - 1);
  assert.deepEqual(m.map((x) => [x.a, x.b, x.size]), [[0, 1, 2], [2, 3, 2], [0, 2, 4], [0, 4, 5]]);
  const h = m.map((x) => x.height);
  assert.ok(Math.abs(h[0] - 0.05) < 1e-12 && Math.abs(h[1] - 0.05) < 1e-12);
  assert.ok(Math.abs(h[2] - 0.25) < 1e-12, 'mean of |0-5|, |0-6|, |1-5|, |1-6| over 20');
  assert.ok(Math.abs(h[3] - 0.85) < 1e-12, 'mean of 20, 19, 15, 14 over 20');
  assert.deepEqual(Array.from(cutTree(m, N, 2)), [0, 0, 0, 0, 1]);
  assert.deepEqual(Array.from(cutTree(m, N, 3)), [0, 0, 1, 1, 2]);
  assert.deepEqual(Array.from(cutTree(m, N, 5)), [0, 1, 2, 3, 4]);
  // the silhouette prefers the natural partition and scores singletons 0
  const s3 = meanSilhouette(dist, N, cutTree(m, N, 3), 3);
  const bad = meanSilhouette(dist, N, Int32Array.from([0, 1, 0, 1, 2]), 3);
  assert.ok(s3 > bad);
  assert.ok(s3 > 0.5 && s3 <= 1);
  assert.equal(meanSilhouette(dist, N, Int32Array.from([0, 1, 2, 3, 4]), 5), 0);
});

test('synthetic blocks: the silhouette recovers the known K and the exact partition', () => {
  for (const [sizes, opts] of [
    [[8, 5, 11], {}],
    [[4, 4, 4, 4, 4], { seed: 5 }],
    [[20, 3, 9, 6], { seed: 9, mix: 0.3 }],
    [[30, 30], { seed: 21, noise: 0.6 }],
  ]) {
    const { matrix, truth } = blocks(sizes, opts);
    const c = clusterVariants(matrix);
    assert.equal(c.K, sizes.length, `sizes ${sizes}`);
    assert.ok(samePartition(c.labels, truth), `partition of ${sizes}`);
    assert.deepEqual([...c.sizes].sort((a, b) => a - b), [...sizes].sort((a, b) => a - b));
    assert.equal(c.silhouetteByK[0][0], 2);
    assert.equal(c.silhouetteByK[c.silhouetteByK.length - 1][0], Math.min(40, truth.length - 1));
    assert.equal(Math.max(...c.silhouetteByK.map((x) => x[1])), c.silhouette);
    // deterministic
    assert.deepEqual(Array.from(clusterVariants(matrix).labels), Array.from(c.labels));
  }
});

test('cluster series are equal-weight means of their members', () => {
  const { matrix } = blocks([3, 2], { T: 40 });
  const c = clusterVariants(matrix);
  const series = clusterSeries(matrix, c.labels, c.K);
  for (let t = 0; t < matrix.length; t++) {
    for (let k = 0; k < c.K; k++) {
      const members = matrix[t].filter((_, j) => c.labels[j] === k);
      assert.ok(Math.abs(series[t][k] - members.reduce((a, b) => a + b, 0) / members.length) < 1e-15);
    }
  }
  const sh = columnSharpes([[1, 0], [2, 0], [3, 0]]);
  assert.ok(Math.abs(sh[0] - 2) < 1e-12);
  assert.equal(sh[1], 0, 'a flat column has Sharpe 0');
});

test('deflation: SR0 from K effective trials and the variance of the K cluster Sharpes, raw beside it', () => {
  // 3 blocks of correlated variants with different drifts (structurally different variant groups)
  const { matrix } = blocks([40, 25, 15], { T: 180, drift: [0.004, 0.002, 0] });
  const sharpes = columnSharpes(matrix);
  const vm = { matrix, sharpes, cols: sharpes.map((_, j) => ({ id: `V-${j}` })), periodDays: 21 };
  const d = deflation(vm);
  assert.equal(d.raw.nTrials, 80);
  assert.equal(d.clustered.K, 3);
  assert.equal(d.clustered.nTrials, 3);
  const cs = columnSharpes(clusterSeries(matrix, d.clustered.labels, 3));
  assert.deepEqual(d.clustered.sharpes, cs);
  assert.ok(Math.abs(d.clustered.varSR - std(cs) ** 2) < 1e-15);
  assert.ok(Math.abs(d.clustered.sr0 - expectedMaxSharpe(3, d.clustered.varSR)) < 1e-15);
  assert.ok(Math.abs(d.raw.varSR - std(sharpes) ** 2) < 1e-15);
  assert.ok(Math.abs(d.raw.sr0 - expectedMaxSharpe(80, d.raw.varSR)) < 1e-15);
  // with the same variance, fewer effective trials deflate less
  assert.ok(expectedMaxSharpe(3, d.raw.varSR) < d.raw.sr0);
  // dsrOfSeries is the core DSR of the series' own Sharpe, skew and kurtosis
  const months = Array.from({ length: 48 }, (_, k) => [`m${k}`, 0.01 + 0.03 * Math.sin(k * 1.7)]);
  const a = dsrOfSeries(months, d.clustered);
  const b = dsrOfSeries(months, d.raw);
  assert.ok(a > 0 && a < 1 && b > 0 && b < 1);
  assert.ok(a > b, 'deflating by 3 effective trials is milder than by 80 raw ones here');
  const x = months.map((m) => m[1]);
  const mu = x.reduce((p, q) => p + q, 0) / x.length;
  assert.ok(Math.abs(dsrOfSeries(x, { nTrials: 1, varSR: 0 }) - deflatedSharpe({ sr: mu / std(x), nTrials: 1, varSR: 0, T: 48, skew: 0, kurt: 3 })) < 0.02);
});
