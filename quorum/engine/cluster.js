// Effective number of independent trials for the Deflated Sharpe Ratio.
//
// Bailey and López de Prado deflate a Sharpe ratio by the best Sharpe that N independent zero-skill
// trials would show by luck. The variants we log are not independent: 480 threshold x GBDT variants
// share most of their picks, and the raw cross-sectional variance of their Sharpes is inflated by
// structurally different variants (for example 4-of-4 variants with very few picks). Following
// López de Prado ("A data science solution to the multiple-testing crisis in financial research",
// 2019), the variants are clustered on the correlation of their period returns and the deflation
// uses K clusters, each represented by one return series:
//
//   distance        d(i, j) = sqrt((1 - rho(i, j)) / 2)   (0 for identical series, 1 for opposite)
//   clustering      average linkage (UPGMA), agglomerative, ties broken by the lowest indices
//   number K        the best mean silhouette over K = 2 .. min(kMax, N - 1)
//   cluster series  the equal-weight mean of its members' returns, period by period
//   SR0             expectedMaxSharpe(K, variance of the K cluster Sharpes)
//
// Pure functions, deterministic, no dependencies beyond core/stats.js.
import { mean, std } from '../core/stats.js';

/**
 * Pearson correlation matrix of the columns of a T x N matrix (rows are periods). A column with no
 * variance correlates 0 with every other column (and 1 with itself).
 * @returns Float64Array(N * N)
 */
export function columnCorrelations(matrix) {
  const T = matrix.length;
  const N = matrix[0]?.length ?? 0;
  const z = new Float64Array(T * N); // standardised columns, column-major: z[j * T + t]
  const live = new Uint8Array(N);
  for (let j = 0; j < N; j++) {
    let m = 0;
    for (let t = 0; t < T; t++) m += matrix[t][j];
    m /= T;
    let ss = 0;
    for (let t = 0; t < T; t++) ss += (matrix[t][j] - m) ** 2;
    const sd = Math.sqrt(ss);
    if (!(sd > 1e-15)) continue;
    live[j] = 1;
    for (let t = 0; t < T; t++) z[j * T + t] = (matrix[t][j] - m) / sd;
  }
  const rho = new Float64Array(N * N);
  for (let a = 0; a < N; a++) {
    rho[a * N + a] = 1;
    if (!live[a]) continue;
    for (let b = a + 1; b < N; b++) {
      if (!live[b]) continue;
      let s = 0;
      const oa = a * T;
      const ob = b * T;
      for (let t = 0; t < T; t++) s += z[oa + t] * z[ob + t];
      const r = Math.max(-1, Math.min(1, s));
      rho[a * N + b] = r;
      rho[b * N + a] = r;
    }
  }
  return rho;
}

/** Correlation distance sqrt((1 - rho) / 2), as a full N x N Float64Array. */
export function correlationDistance(rho, N) {
  const d = new Float64Array(N * N);
  for (let k = 0; k < N * N; k++) d[k] = Math.sqrt(Math.max(0, (1 - rho[k]) / 2));
  for (let a = 0; a < N; a++) d[a * N + a] = 0;
  return d;
}

/**
 * Average-linkage agglomerative clustering (UPGMA) on a full distance matrix.
 * @returns merges: [{ a, b, height, size }] in merge order (N - 1 rows). a < b are the slots of the
 *   two clusters merged; the merged cluster keeps slot a. Ties go to the lowest (a, b).
 */
export function averageLinkage(dist, N) {
  const D = Float64Array.from(dist);
  const size = new Float64Array(N).fill(1);
  const active = new Uint8Array(N).fill(1);
  const merges = [];
  for (let step = 0; step < N - 1; step++) {
    let best = Infinity;
    let ba = -1;
    let bb = -1;
    for (let a = 0; a < N; a++) {
      if (!active[a]) continue;
      const row = a * N;
      for (let b = a + 1; b < N; b++) {
        if (!active[b]) continue;
        const v = D[row + b];
        if (v < best) {
          best = v;
          ba = a;
          bb = b;
        }
      }
    }
    const na = size[ba];
    const nb = size[bb];
    // Lance-Williams update for average linkage
    for (let k = 0; k < N; k++) {
      if (!active[k] || k === ba || k === bb) continue;
      const v = (na * D[ba * N + k] + nb * D[bb * N + k]) / (na + nb);
      D[ba * N + k] = v;
      D[k * N + ba] = v;
    }
    size[ba] = na + nb;
    active[bb] = 0;
    merges.push({ a: ba, b: bb, height: best, size: na + nb });
  }
  return merges;
}

/**
 * Labels for K clusters: replay the first N - K merges. Clusters are numbered 0..K-1 in the order of
 * their smallest member, so the labelling is canonical.
 */
export function cutTree(merges, N, K) {
  const parent = Int32Array.from({ length: N }, (_, k) => k);
  const find = (x) => {
    while (parent[x] !== x) {
      parent[x] = parent[parent[x]];
      x = parent[x];
    }
    return x;
  };
  for (let s = 0; s < N - K; s++) {
    const ra = find(merges[s].a);
    const rb = find(merges[s].b);
    if (ra !== rb) parent[Math.max(ra, rb)] = Math.min(ra, rb);
  }
  const labels = new Int32Array(N);
  const idOf = new Map();
  for (let k = 0; k < N; k++) {
    const r = find(k);
    if (!idOf.has(r)) idOf.set(r, idOf.size);
    labels[k] = idOf.get(r);
  }
  return labels;
}

/**
 * Mean silhouette of a labelling (Rousseeuw 1987). A point alone in its cluster scores 0.
 */
export function meanSilhouette(dist, N, labels, K) {
  const sums = new Float64Array(K);
  const counts = new Float64Array(K);
  for (let k = 0; k < N; k++) counts[labels[k]]++;
  let total = 0;
  for (let i = 0; i < N; i++) {
    sums.fill(0);
    const row = i * N;
    for (let j = 0; j < N; j++) if (j !== i) sums[labels[j]] += dist[row + j];
    const own = labels[i];
    if (counts[own] <= 1) continue; // s(i) = 0
    const a = sums[own] / (counts[own] - 1);
    let b = Infinity;
    for (let c = 0; c < K; c++) if (c !== own && counts[c] > 0) b = Math.min(b, sums[c] / counts[c]);
    const m = Math.max(a, b);
    total += m > 0 ? (b - a) / m : 0;
  }
  return total / N;
}

/**
 * Cluster the columns (variants) of a T x N return matrix.
 * @returns { K, labels: Int32Array(N), sizes: number[K], silhouette, silhouetteByK: [[K, s]], merges }
 */
export function clusterVariants(matrix, { kMin = 2, kMax = 40 } = {}) {
  const N = matrix[0]?.length ?? 0;
  if (N < 3) {
    const labels = Int32Array.from({ length: N }, (_, k) => k);
    return { K: N, labels, sizes: new Array(N).fill(1), silhouette: null, silhouetteByK: [], merges: [] };
  }
  const rho = columnCorrelations(matrix);
  const dist = correlationDistance(rho, N);
  const merges = averageLinkage(dist, N);
  const hi = Math.min(kMax, N - 1);
  const byK = [];
  let best = null;
  for (let K = Math.max(2, kMin); K <= hi; K++) {
    const labels = cutTree(merges, N, K);
    const s = meanSilhouette(dist, N, labels, K);
    byK.push([K, s]);
    // strictly better wins, so a tie keeps the smaller K
    if (!best || s > best.s + 1e-12) best = { K, s, labels };
  }
  const sizes = new Array(best.K).fill(0);
  for (const l of best.labels) sizes[l]++;
  return { K: best.K, labels: best.labels, sizes, silhouette: best.s, silhouetteByK: byK, merges };
}

/** One return series per cluster: the equal-weight mean of its members, row by row. */
export function clusterSeries(matrix, labels, K) {
  const counts = new Float64Array(K);
  for (const l of labels) counts[l]++;
  return matrix.map((row) => {
    const s = new Float64Array(K);
    for (let j = 0; j < row.length; j++) s[labels[j]] += row[j];
    return Array.from(s, (v, c) => v / counts[c]);
  });
}

/** Per-period Sharpe (mean / sample sd) of each column; 0 for a column without variance. */
export function columnSharpes(matrix) {
  const N = matrix[0]?.length ?? 0;
  const out = new Array(N);
  for (let j = 0; j < N; j++) {
    const col = matrix.map((r) => r[j]);
    const sd = std(col);
    out[j] = sd > 0 ? mean(col) / sd : 0;
  }
  return out;
}
